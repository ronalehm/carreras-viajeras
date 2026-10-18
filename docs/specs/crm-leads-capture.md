# Captura automática de leads (formulario web → CRM) y outbox para n8n

- Módulo: crm (también `integrations`, nuevo, y `landing`)
- Estado: borrador
- Depende de:
  - `platform-neon-foundation.md` (aprobada): contrato de la sección "Leads y procesamiento posterior" (Turnstile en servidor, lead y evento en una transacción, idempotencia, outbox con lease, claim/ack para n8n local, máximo 8 intentos). Esta spec lo concreta y no lo contradice.
  - `crm-leads-pipeline.md` (aprobada; F1 en curso): tablas `leads` y `lead_activities` (migración `0002`), `createLead`, `getLeadList`, `changeLeadStage` (su F3) y el permiso `leads.manage`. Esta spec **no duplica** ese modelo: lo amplía con la migración `0003` y toca su service solo donde se indica. Hay que enmendarla (ver "Relación con otras specs").
  - `trips-catalog.md` (aprobada): slug `maraton-santiago-2027` y `trips.status = 'published'`.
  - `landing-public-site.md` (aprobada; F1 en `main`): `/contacto`, `ContactSection`, `ContactForm` y `modules/landing/utils/inquiry.ts`.

## Objetivo
Hoy el formulario de `/contacto` solo prepara un texto para WhatsApp y no guarda nada, así que el equipo comercial no se entera de las consultas que no llegan a enviarse por WhatsApp. Esta spec hace que:
- cada envío válido del formulario de la landing cree un **lead** en el CRM (origen "Formulario web", etapa "Nuevo", sin responsable), de forma protegida contra spam y doble envío;
- cada alta de lead y cada cambio de etapa dejen un **evento durable** en un outbox de Neon;
- **n8n**, que corre en la computadora del usuario sin IP pública, recoja esos eventos por una **API privada** del Worker (modelo *pull*), avise al usuario por correo y WhatsApp y le **prepare** el mensaje predefinido según la etapa del lead, sin enviarlo automáticamente al runner.

Usuarios: personas que consultan en la landing (anónimas), el equipo comercial (ve los leads en el CRM) y el usuario dueño del negocio (recibe los avisos de n8n).

## Alcance
- Incluye:
  - (F1) Migración `0003`: tabla `outbox_events` y sus enums; `leads` admite leads sin responsable ni autor (formulario web) y guarda la clave de idempotencia; `lead_activities` admite actividades de sistema (`automation`, autor nulo) y el primer responsable. Variables de entorno opcionales (`N8N_API_TOKEN`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) validadas de forma perezosa. El alta manual (`createLead`) emite `lead.created`. README: migración y secretos.
  - (F2) API privada para n8n bajo `/api/integrations/n8n/`: reclamar un lote de eventos con lease, confirmar (ack), marcar fallo con backoff, y leer los datos mínimos de un lead. Guía de n8n en el README.
  - (F3) Captura en servidor: schema del formulario web, verificación de Turnstile, `createWebLead` atómico e idempotente (lead + actividad + evento) y la Server Action pública. Lista de destinos de consulta compartida en `lib/`.
  - (F4) Formulario de `/contacto` conectado: envío real, widget de Turnstile, honeypot, consentimiento `web-form-v1`, textos sin "demostración" y destinos con el slug del catálogo. WhatsApp sigue disponible tras enviar.
  - (F5) Evento `lead.stage_changed` en el cambio de etapa del CRM y registro, desde n8n, de una actividad `automation` en el historial del lead.
  - Medición del tamaño del Worker al cerrar cada fase (umbral de consulta: 2 MiB gzip).
- No incluye:
  - Cualquier llamada del Worker a n8n (webhook *push*), colas de Cloudflare, `waitUntil` como cola o Cron Triggers.
  - El workflow de n8n como código del repo: se documenta en el README como guía; las plantillas de mensajes, las credenciales SMTP y de WhatsApp viven en n8n.
  - Envío automático de mensajes al runner por WhatsApp (WhatsApp Business App sigue manual), automatización de WhatsApp Web o scraping.
  - Asignación automática de responsable: el comercial asigna a mano en el CRM (`changeLeadOwner` de `crm-leads-pipeline`).
  - Lead al registrarse un runner en `/cuenta` (F3 de la landing): queda para una spec posterior (Pregunta abierta 6).
  - Reenvío de eventos `dead` desde el CRM (pantalla o acción administrativa): spec posterior (Pregunta abierta 7).
  - Editar plantillas de mensajes desde el CRM (tabla `message_templates`): spec posterior si se necesita.
  - Cambios en la UI del CRM (lista, ficha, historial) para mostrar "Sin asignar", "Formulario web" o "Automatización": van en la enmienda de `crm-leads-pipeline` (ver "Relación con otras specs").
  - Rate limiting por IP en código o con bindings: Turnstile + honeypot + ventana de duplicados bastan en el MVP. Una regla WAF opcional se documenta en el README, sin código.
  - PostHog, analítica o métricas del formulario; Gemini.
  - Página de privacidad o términos (sigue fuera de la landing); el texto legal definitivo lo aporta el usuario (Pregunta abierta 1).
  - Detección o fusión de duplicados más allá de la idempotencia y la ventana de 10 minutos por teléfono.
  - GRANT de base de datos, migraciones remotas automáticas o scripts que las ejecuten.

## Requisitos
1. **Envío del formulario (F3, F4):** una Server Action pública valida la entrada con zod y, si Turnstile la aprueba, guarda en **una sola sentencia atómica** (CTE en `db.execute`):
   - el lead: `source = 'web_form'`, `stage = 'new'`, `owner_user_id = NULL`, `created_by = NULL`, `consent_version = 'web-form-v1'`, `consented_at = now()`;
   - su actividad `created` (sin nota, sin autor);
   - el evento `lead.created` en `outbox_events`.

   Nunca son dos llamadas HTTP independientes. Si la sentencia falla, no queda nada guardado.
2. **Datos del formulario web:** nombre (2–80), correo (obligatorio, minúsculas, ≤ 150), WhatsApp con código de país (misma normalización E.164 que el alta manual), destino de una lista cerrada y consentimiento obligatorio. No hay ciudad, nota ni responsable.
3. **Destino → viaje:** la lista cerrada de destinos de consulta vive en `lib/inquiryDestinations.ts`:

   | id (valor del formulario y de `?destino=`) | Nombre visible | Slug del catálogo |
   |---|---|---|
   | `maraton-santiago-2027` | Maratón de Santiago 42K 2027 | `maraton-santiago-2027` |
   | `panama` | Panamá | — |
   | `medellin` | Medellín | — |

   El servidor resuelve el slug a `trips.id` solo si el viaje está `published`, y lo guarda en `trip_id` con `destination_text = NULL`. Si no hay slug o el viaje no está publicado, guarda `trip_id = NULL` y `destination_text` = nombre visible.
4. **Idempotencia:** el formulario envía un `submissionId` (UUID generado en el navegador al enviar y renovado tras un éxito). El lead guarda `idempotency_key = submissionId` (único) y `submission_hash` (SHA-256 de los datos normalizados).
   - Misma clave y mismos datos → se devuelve el resultado previo (éxito) sin crear nada.
   - Misma clave y datos distintos → conflicto: "Ya recibimos una consulta desde este formulario. Recarga la página para enviar otra.".
   - **Ventana de duplicados:** si ya existe un lead `web_form` con el mismo teléfono creado hace menos de 10 minutos, no se crea otro y se responde éxito (no revela si el teléfono existe).
5. **Antispam y abuso:**
   - **Turnstile** (gratuito): widget en el formulario con `action = "lead_submit"`; verificación en el servidor con Siteverify. Solo es válido si `success = true`, `action = "lead_submit"` y `hostname` = host de `APP_ORIGIN`. Token ausente, inválido, caducado o reutilizado → no se guarda nada. Siteverify caído o secreto sin configurar → no se guarda nada (falla cerrado).
   - **Honeypot:** campo `website` oculto a personas y lectores de pantalla. Si llega con contenido, la acción responde éxito sin verificar ni guardar.
   - **Límites:** entrada total ≤ 16 KiB y sin archivos; token ≤ 2048 caracteres; longitudes del Requisito 2.
   - **Red y CPU (Workers Free, 10 ms de CPU):** Siteverify con `AbortSignal.timeout(3000)` y como máximo **2 intentos**, solo ante error de red, timeout o 5xx, con el mismo `idempotency_key` (= `submissionId`). La espera de red no consume CPU; no hay bucles ni hashing pesado.
6. **Consentimiento (Ley 29733):** casilla obligatoria (`required` en el navegador y `z.literal("on")` en el servidor). Texto provisional de la versión `web-form-v1`:
   > "Acepto que Carreras Viajeras guarde mis datos (nombre, correo, WhatsApp y destino) para responder a mi consulta y contactarme sobre este viaje."

   Se guardan `consent_version = 'web-form-v1'` y `consented_at`. El texto legal definitivo queda pendiente del usuario (Pregunta abierta 1); cambiarlo exige una nueva versión (`web-form-v2`), no editar la `v1`.
7. **Después del envío:** con éxito, la persona ve "¡Listo! Recibimos tu consulta. Te escribiremos por WhatsApp." y, como hoy, la consulta preparada con "Copiar consulta" y "Abrir WhatsApp ↗". Con un error que no sea de validación, ve el mensaje del error y también la consulta preparada con WhatsApp como alternativa.
8. **Mensajes sin datos:** ningún mensaje, log ni respuesta de error incluye datos personales, el token de Turnstile, la IP, el secreto ni el mensaje original de la base o de Cloudflare. Los logs son de texto fijo (`"web lead: capture failed"`, `"turnstile: verification unavailable"`, `"integrations: request failed"`).
9. **Outbox (`outbox_events`):** contrato de `platform-neon-foundation.md`. Columnas: `id` (también es el `event_id` para deduplicar en n8n), `type`, `lead_id`, `payload_version`, `payload` (mínimo, sin datos personales), `status` (`pending` | `processing` | `succeeded` | `dead`), `attempts`, `available_at`, `lease_until`, `lease_token`, `created_at`, `processed_at` y `last_error_code` (código corto, sin texto de proveedor). `available_at` y `lease_until` son los `next_attempt_at` y `locked_until` del pedido.
   - Tipos y payload (versión 1): `lead.created` → `{ "source": "web_form" | "whatsapp" | "other" }`; `lead.stage_changed` → `{ "stageFrom": LeadStage, "stageTo": LeadStage }`.
   - Entrega **al menos una vez**: n8n deduplica por `id` de evento. No se promete *exactly-once* ante efectos externos (correos o WhatsApp ya enviados).
10. **Eventos emitidos:**
    - `lead.created`: alta web (F3) y alta manual del CRM (F1), en la misma sentencia o `db.batch` que el lead. n8n decide qué hacer según `source` (Pregunta abierta 4).
    - `lead.stage_changed` (F5): cada cambio de etapa efectivo del CRM, en la misma sentencia que el cambio y su actividad. `no_change` y `not_found` no emiten evento.
11. **API privada para n8n (F2, F5):**
    - Autenticación: cabecera `Authorization: Bearer <N8N_API_TOKEN>`, comparada en tiempo constante (SHA-256 de ambos valores + comparación sin cortocircuito). El token es un Secret de Cloudflare (≥ 32 caracteres) y una credencial de n8n; nunca `DATABASE_URL`.
    - Sin token configurado → 503 `{ "error": "not_configured" }`. Cabecera ausente o token incorrecto → 401 `{ "error": "unauthorized" }` con `WWW-Authenticate: Bearer`, sin tocar la base.
    - Todas las respuestas llevan `Cache-Control: no-store`; no hay cabeceras CORS ni enlaces desde la web pública. Cuerpo JSON ≤ 4 KiB.
    - **Claim:** reclama hasta N eventos listos (`pending` con `available_at <= now()`, o `processing` con lease vencida) en una sola sentencia con `FOR UPDATE SKIP LOCKED`. Cada evento reclamado pasa a `processing`, suma 1 a `attempts` y recibe un `lease_token` nuevo y `lease_until = now() + 5 min`. Lote por defecto 10, máximo 25. Los eventos con lease vencida y `attempts >= 8` pasan a `dead` (`last_error_code = 'lease_expired'`) en el mismo `db.batch`, antes del claim.
    - **Ack:** solo con el `lease_token` vigente (`status = 'processing'` y `lease_until > now()`) → `succeeded`, `processed_at = now()`, lease borrada. Si no, 409 `lease_lost`.
    - **Fail:** solo con el `lease_token` vigente. Si `attempts >= 8` → `dead` y `processed_at = now()`; si no → `pending` con `available_at = now() + least(3600, 30 · 2^(attempts−1)) s × aleatorio [0,8; 1,2]` (30 s, 1 min, 2 min… con jitter). Guarda `last_error_code`.
    - **Lectura del lead:** solo los campos que n8n necesita para componer el aviso y el mensaje: id, nombre, teléfono, etapa, origen, viaje (slug y título) o destino, email del responsable (o `null`), archivado y fecha de alta. **No** expone email del lead, ciudad, notas, historial, consentimiento ni ids de usuarios.
    - **(F5) Actividad de automatización:** n8n registra en el historial del lead que preparó un mensaje (`type = 'automation'`, autor nulo, texto ≤ 500), vinculada al evento que la originó. Idempotente por evento.
12. **Qué hace n8n (guía en el README, fuera del código):**
    - Cada minuto: claim → por cada evento: deduplicar por `id` → leer el lead → si está archivado, ack y fin.
    - **Aviso al usuario** por correo y WhatsApp cuando entra un lead (`lead.created` con `source = "web_form"`).
    - **Preparar el mensaje predefinido** según la etapa (`new` para `lead.created`, `stageTo` para `lead.stage_changed`). Si la etapa actual del lead ya no coincide con la del evento, el evento está obsoleto: ack sin preparar nada.
    - "Preparar" = n8n compone el texto con la plantilla de la etapa y construye un enlace `https://wa.me/<teléfono>?text=<texto>` que envía **al usuario o al comercial** (correo y WhatsApp propio). El comercial lo abre y lo envía a mano desde WhatsApp Business App. Nunca se envía automáticamente al runner.
    - **Plantillas en n8n** (decisión recomendada para el MVP; Pregunta abierta 5): un nodo por etapa (`new`, `contacted`, `quoted`, `reserved`, `paid`, `lost`), editable sin desplegar el Worker.
    - (F5, opcional) Registrar la actividad `automation` ("Mensaje de etapa Cotizado preparado y enviado al comercial."), sin copiar el texto del mensaje.
    - Éxito → ack. Error → fail con un código corto (`smtp_error`, `whatsapp_error`, `lead_not_found`…).
    - La asignación de responsable no la hace n8n: es manual en el CRM.
13. **Seguridad del CRM sin cambios:** la API de integración no usa sesiones ni `requirePermission`; el CRM sigue protegido por `leads.manage`. Un token de n8n no da acceso al CRM y una sesión del CRM no da acceso a la API de integración.

## Criterios de aceptación

Fase 1 (modelo, outbox, entorno y alta manual con evento):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera solo `drizzle/0003_*.sql` (más su snapshot y el journal) con:
  - los enums `outbox_event_type` (`lead.created`, `lead.stage_changed`) y `outbox_status`, y `ALTER TYPE "lead_activity_type" ADD VALUE 'automation'`;
  - la tabla `outbox_events` con sus FK, CHECK e índice;
  - en `leads`: `DROP NOT NULL` de `owner_user_id` y `created_by`, columnas `idempotency_key` y `submission_hash`, índice único y CHECK nuevos;
  - en `lead_activities`: `DROP NOT NULL` de `actor_user_id`, columna `source_event_id` con FK y único, y los CHECK `lead_activities_body_chk` y `lead_activities_owner_chk` sustituidos.

  El SQL no contiene `neon_auth`, `CREATE SCHEMA`, `DROP TABLE`, `DROP TYPE` ni `DROP COLUMN`, ni cambios en `profiles`, `staff_*` o `trips`. Los únicos `DROP` son `DROP NOT NULL` y `DROP CONSTRAINT` de los dos CHECK sustituidos. `drizzle.config.ts` no cambia.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dadas `0002` y `0003` aplicadas a mano, entonces la base:
  - acepta un lead `web_form` sin responsable ni autor, y una actividad `owner_changed` de `NULL` a un responsable;
  - rechaza: un lead `whatsapp` sin `created_by`; `idempotency_key` sin `submission_hash`; una `idempotency_key` repetida; una actividad `note` sin autor; una `automation` sin `source_event_id` o sin texto; un `owner_changed` sin `owner_to`;
  - rechaza en `outbox_events`: `processing` sin `lease_token`; `attempts = 9`; `last_error_code = 'Error de SMTP'`; un `payload` de más de 1 KiB; `succeeded` sin `processed_at`.
- [ ] (F1) Dado `lib/env.ts`, entonces (unit test):
  - `getEnv()` no cambia: no exige `N8N_API_TOKEN` ni `TURNSTILE_SECRET_KEY`, y sus tests existentes pasan;
  - `getIntegrationEnv()` devuelve `null` sin token, lanza `"Invalid environment fields: N8N_API_TOKEN"` con un token de 31 caracteres (sin el valor) y devuelve el token válido;
  - `getTurnstileEnv()` devuelve `null` sin secreto y rechaza las claves de prueba documentadas por Cloudflare fuera de `NODE_ENV=development`.
- [ ] (F1) Dado `createLead` (alta manual de `crm-leads-pipeline`), entonces en la misma escritura atómica inserta además un evento `lead.created` `pending` con payload `{ "source": <origen> }` (unit test). `getLeadList` devuelve los leads sin responsable con `owner: null` (LEFT JOIN) en lugar de omitirlos (unit test).
- [ ] (F1) Dado `leadActivityTypeSchema`, entonces incluye `automation` y sigue coincidiendo con `leadActivityTypeEnum.enumValues` (unit test). `phoneSchema` se exporta sin cambiar su comportamiento.
- [ ] (F1) Dado el README, entonces documenta: aplicar `0003` después de `0002` en **dos bloques** (primero `ALTER TYPE … ADD VALUE 'automation'` solo y confirmado; después el resto entre `BEGIN;` y `COMMIT;`), sin GRANT ni reaplicar migraciones; y cómo crear los Secrets `N8N_API_TOKEN` y `TURNSTILE_SECRET_KEY` (`npx wrangler secret put`) y la variable de build `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. Tamaño del Worker medido y registrado.

Fase 2 (API privada para n8n):
- [ ] (F2) Dada cualquier ruta de `/api/integrations/n8n/`, cuando llamo sin `Authorization`, con otro esquema o con un token incorrecto, entonces responde 401 `{ "error": "unauthorized" }` con `WWW-Authenticate: Bearer` y `Cache-Control: no-store`, y no consulta la base (unit test del helper). Sin `N8N_API_TOKEN` configurado responde 503 `{ "error": "not_configured" }`. Ninguna respuesta incluye `Access-Control-Allow-Origin`.
- [ ] (F2) Dado `POST /api/integrations/n8n/events/claim` con `{ "limit": 2 }` y tres eventos `pending`, entonces devuelve 200 con los dos más antiguos, cada uno con `id`, `type`, `leadId`, `payloadVersion`, `payload`, `attempts: 1`, `leaseToken` y `leaseUntil`, y en la base quedan `processing`. Una segunda llamada devuelve solo el tercero. `limit` 0, 26 o no numérico → 400 `{ "error": "invalid_request" }`; sin cuerpo, lote de 10.
- [ ] (F2) Dado un evento reclamado, cuando hago `POST …/events/<id>/ack` con su `leaseToken`, entonces queda `succeeded` con `processed_at`. Con un token anterior, otro id o la lease vencida → 409 `{ "error": "lease_lost" }`.
- [ ] (F2) Dado un evento reclamado con `attempts = 1`, cuando hago `POST …/events/<id>/fail` con `{ "leaseToken", "errorCode": "smtp_error" }`, entonces vuelve a `pending` con `available_at` entre 24 y 36 s en el futuro y `last_error_code = 'smtp_error'`. Con `attempts = 8` queda `dead`. `errorCode` con espacios o mayúsculas → 400.
- [ ] (F2) Dado un evento `processing` con la lease vencida, cuando otro claim se ejecuta, entonces se reclama de nuevo con un `leaseToken` distinto y el ack con el token viejo devuelve 409. Si ya tenía `attempts = 8`, pasa a `dead` con `last_error_code = 'lease_expired'` y no se entrega.
- [ ] (F2) Dado `GET /api/integrations/n8n/leads/<id>`, entonces devuelve exactamente `{ id, fullName, phone, stage, source, trip, destinationText, owner, archived, createdAt }` (contrato de API). Un UUID inexistente → 404 `{ "error": "not_found" }`; `abc` → 400. La respuesta no incluye email del lead, ciudad, consentimiento, ids de usuario ni actividades (unit test).
- [ ] (F2) Dado un error de base de datos en cualquier ruta, entonces responde 500 `{ "error": "internal_error" }`, registra solo `"integrations: request failed"` y no incluye el mensaje original (unit test).
- [ ] (F2, manual del usuario, en una rama de desarrollo de Neon con `npm run dev`) Dos claims lanzados a la vez con `curl` no devuelven el mismo evento; reiniciar n8n con eventos `processing` no los pierde (se recuperan al vencer la lease).
- [ ] (F2) Dado el README, entonces la sección "Automatizaciones con n8n" describe: credencial Bearer en n8n, workflow (Schedule cada minuto → claim → deduplicar por `id` → leer lead → aviso y mensaje preparado → ack o fail), plantillas por etapa en n8n, enlace `wa.me`, códigos de error sugeridos y que con n8n apagado los eventos esperan en Neon.
- [ ] (F2) Lint, tests y build sin errores. Worker medido.

Fase 3 (captura en servidor):
- [ ] (F3) Dado `webLeadFormSchema` con los strings de un `FormData` válido, entonces devuelve `{ fullName, email, phone, destination, submissionId, turnstileToken }` con el nombre recortado, el email en minúsculas y el teléfono normalizado (`"+51 938-127 170"` → `"+51938127170"`), y descarta claves extra (`source`, `stage`, `ownerUserId`, `consentVersion`). Rechaza con error en su campo: nombre de 1 carácter o de 81, email inválido, teléfono sin código de país, destino `santiago-2027` o desconocido, sin `consent`, `submissionId` no UUID (unit test).
- [ ] (F3) Dado `verifyTurnstileToken` con `fetch` simulado, entonces (unit test):
  - `success: true`, `action: "lead_submit"` y el host de `APP_ORIGIN` → `"valid"`;
  - otro `hostname`, otra `action` o `success: false` (p. ej. `timeout-or-duplicate`) → `"invalid"` sin reintentar;
  - un 5xx o un error de red seguido de éxito → `"valid"` con 2 llamadas y el mismo `idempotency_key`; dos fallos seguidos → `"unavailable"`;
  - sin secreto configurado → `"unavailable"` sin llamar a `fetch`; token vacío o de más de 2048 caracteres → `"invalid"` sin llamar a `fetch`;
  - envía `remoteip` solo si lo recibe y nunca registra el token ni la IP.
- [ ] (F3) Dado `createWebLead` con la base simulada, entonces (unit test):
  - ejecuta **una sola sentencia** (CTE) que inserta lead, actividad `created` y evento `lead.created` con payload `{ "source": "web_form" }`;
  - pasa `consent_version = 'web-form-v1'`, `source = 'web_form'`, sin responsable ni autor, y nunca `stage`;
  - resuelve `maraton-santiago-2027` por slug con `status = 'published'`; para `panama` envía `destination_text = 'Panamá'` sin slug;
  - devuelve `"created"`, `"duplicate"` (misma clave y hash, ventana de 10 minutos por teléfono o carrera concurrente) o `"conflict"` (misma clave, hash distinto) según la fila devuelta.
- [ ] (F3) Dada `submitWebLeadAction` llamada directamente con `FormData` (mocks de los services y de `next/headers`), entonces (unit test):
  - honeypot `website` con texto → `success` sin llamar a Turnstile ni a la base;
  - datos inválidos → `invalid_input` con `fieldErrors`, sin llamar a Turnstile;
  - entrada de más de 16 KiB o con un `File` → `invalid_input` sin llamar a nada;
  - Turnstile `"invalid"` → `verification_failed` sin tocar la base; `"unavailable"` → `unavailable`;
  - `"created"` y `"duplicate"` → `success`; `"conflict"` → `conflict`;
  - el service lanza → `unavailable`, `console.error` recibe solo `"web lead: capture failed"`;
  - `remoteIp` sale de la cabecera `cf-connecting-ip`; la respuesta nunca repite lo escrito.
- [ ] (F3, manual del usuario, en una rama de desarrollo de Neon) Dada la sentencia de `createWebLead` ejecutada con un payload de outbox inválido (forzado en el SQL Editor), entonces no queda ni el lead ni la actividad: la escritura es atómica.
- [ ] (F3) Lint, tests y build sin errores. Worker medido.

Fase 4 (formulario de la landing conectado):
- [ ] (F4) Dado `/contacto` en `npm run dev` con las claves de prueba de Turnstile, cuando completo el formulario con destino Santiago, marco el consentimiento y pulso "Enviar mi consulta", entonces el botón pasa a "Enviando…", veo "¡Listo! Recibimos tu consulta. Te escribiremos por WhatsApp." con la consulta preparada, "Copiar consulta" y "Abrir WhatsApp ↗", y en la base hay un lead `web_form` en `new` sin responsable, su actividad `created` y un evento `lead.created` `pending`.
- [ ] (F4) Dado el mismo envío repetido (doble clic o reenvío sin editar), entonces solo existe un lead. Si edito un campo tras el éxito y vuelvo a enviar, se crea un lead nuevo con otro `submissionId` (salvo la ventana de 10 minutos por teléfono).
- [ ] (F4) Dado el destino "Panamá · Quiero novedades", entonces el lead queda con `trip_id` nulo y `destination_text = 'Panamá'`. Con Santiago y el viaje `maraton-santiago-2027` publicado, queda con su `trip_id`.
- [ ] (F4) Dado un error del servidor (`unavailable`, `verification_failed` o `conflict`), entonces veo su mensaje en `role="alert"` y, salvo en `invalid_input`, la consulta preparada con WhatsApp como alternativa. El widget de Turnstile se reinicia tras cada respuesta (los tokens son de un solo uso).
- [ ] (F4) Dados errores de validación del servidor, entonces cada campo muestra su mensaje debajo con `aria-invalid`, y lo escrito se conserva.
- [ ] (F4) Dado `/contacto`, entonces ya no aparecen "VISTA DE DEMOSTRACIÓN", "Los datos no se envían ni se guardan", "Entiendo que es una demostración…" ni "La consulta no se envía desde esta demostración."; aparecen el consentimiento `web-form-v1` del Requisito 6 y la nota de uso de datos del Diseño técnico.
- [ ] (F4) Dado el HTML de `/contacto`, entonces el campo `website` está dentro de un contenedor `aria-hidden="true"` fuera de pantalla, con `tabIndex={-1}` y `autoComplete="off"`.
- [ ] (F4) Dado `?destino=santiago-2027` (enlaces antiguos), entonces el selector muestra Santiago (valor por defecto). `MobileCta` y `HeroCarousel` enlazan a `/contacto?destino=maraton-santiago-2027`. `buildInquiryMessage` mantiene el texto exacto de cada destino (unit test).
- [ ] (F4) Dada la pestaña Red al enviar, entonces hay una única petición POST a `/contacto` (Server Action) más las de `challenges.cloudflare.com`; ninguna a n8n ni a otros dominios.
- [ ] (F4) Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en el build, entonces el widget no se renderiza, el envío devuelve `verification_failed` y se ofrece WhatsApp.
- [ ] (F4) Lint, tests y build sin errores. Worker medido.

Fase 5 (cambio de etapa y actividad de n8n):
- [ ] (F5) Dado `changeLeadStage` (de `crm-leads-pipeline` F3) con un cambio efectivo, entonces la misma sentencia atómica inserta además un evento `lead.stage_changed` con payload `{ "stageFrom", "stageTo" }`. `"no_change"` y `"not_found"` no insertan evento (unit test).
- [ ] (F5) Dado `POST /api/integrations/n8n/leads/<id>/activities` con `{ "eventId", "body" }`, entonces:
  - con un evento de ese lead y el lead no archivado → 201 `{ "status": "recorded" }` e inserta una actividad `automation` sin autor, con `source_event_id`;
  - el mismo `eventId` otra vez → 200 `{ "status": "duplicate" }` sin insertar;
  - lead archivado o inexistente, o evento de otro lead → 404 `{ "error": "not_found" }`;
  - `body` vacío o de más de 500 caracteres → 400 (unit test).
- [ ] (F5) Dado el README, entonces la guía de n8n incluye las plantillas por etapa, cómo descartar eventos obsoletos (etapa actual distinta de `stageTo`) y la llamada opcional de actividad.
- [ ] (F5) Lint, tests y build sin errores. Worker medido.

## Diseño técnico

### Decisiones
- **Pull, no push:** n8n corre en la computadora del usuario sin IP pública, así que el Worker nunca llama a n8n; n8n consulta la API privada por HTTPS (resuelto por el usuario). Con n8n apagado, los eventos esperan en Neon.
- **Módulo nuevo `modules/integrations/`** para el outbox y la API de n8n: es un concepto distinto del embudo comercial. Además, sus archivos son disjuntos de los de `modules/crm`, que `crm-leads-pipeline` sigue modificando en sus fases F2–F6. Lee y escribe `leads`, `lead_activities` y `outbox_events` mediante `@/lib/db-schema` (esquema compartido en `lib/`), igual que `crm` lee `trips`. No importa internals de `modules/crm`.
- **La captura web vive en `modules/crm`** (es un alta de lead), en archivos nuevos (`webLeads.*`) para no chocar con `leads.service.ts`/`leads.actions.ts` de la otra spec. La landing no importa nada de `crm` desde un componente cliente: `ContactSection` (Server Component) importa la acción desde `@/modules/crm` y se la pasa a `ContactForm` como prop.
- **Destinos en `lib/inquiryDestinations.ts`:** lo usan dos dominios (`landing` para el selector y el mensaje, `crm` para validar en el servidor); SETUP §1, regla 5. Sustituye a `DESTINATION_IDS`/`DESTINATION_NAMES` de `inquiry.ts`. El valor por defecto es `maraton-santiago-2027`, así que los enlaces antiguos `?destino=santiago-2027` siguen preseleccionando Santiago.
- **Una sola sentencia CTE para la captura**, no `db.batch`: la idempotencia, la ventana de duplicados y la resolución del slug necesitan condiciones encadenadas (`INSERT … SELECT … WHERE NOT EXISTS … ON CONFLICT DO NOTHING RETURNING`), y la actividad y el evento se insertan `FROM new_lead`. Es atómica por construcción.
- **Leads web sin responsable:** `owner_user_id` pasa a ser opcional y la asignación es manual en el CRM (resuelto por el usuario). `created_by` es nulo en los leads web; un CHECK lo exige en los demás orígenes.
- **Actividades de sistema:** `actor_user_id` nulo solo en `created` (alta web) y en `automation` (n8n). El tipo `automation` se añade al enum para no mezclar lo que hace n8n con los mensajes que registra un comercial (`message`).
- **Turnstile con site key `NEXT_PUBLIC_TURNSTILE_SITE_KEY`:** es pública y Next la incrusta en el build. Hay que definirla en `.env.local` (desarrollo y `npm run deploy` local) y como variable de build en Workers Builds. `scripts/strip-env-secrets.mjs` ya conserva las `NEXT_PUBLIC_*`. El secreto `TURNSTILE_SECRET_KEY` es un Secret de Cloudflare. En desarrollo se usan las claves de prueba documentadas por Cloudflare (site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`); como su respuesta no trae el `hostname` ni la `action` reales, con `NODE_ENV=development` y el secreto de prueba solo se exige `success` (el developer verifica la respuesta real de la clave de prueba). Las claves de prueba se rechazan fuera de desarrollo.
- **Widget sin dependencias:** no hay componente de Turnstile en shadcn (`npx shadcn@latest search @shadcn -q turnstile` y `-q captcha`: sin resultados). Se carga el script oficial con `next/script` en modo explícito; no se añade ningún paquete npm.
- **Comparación del token en tiempo constante sin dependencias:** `crypto.subtle.digest("SHA-256")` de ambos valores y comparación byte a byte con acumulador XOR. Funciona igual en Node (`next dev`) y en Workers, y no filtra la longitud.
- **Plantillas en n8n** (recomendado para el MVP): cambiar un texto no exige desplegar. Si más adelante el comercial debe editarlas, se crea una tabla en otra spec (Pregunta abierta 5).
- **Claim por `POST`** (cambia el estado); lectura del lead por `GET`.
- **Tamaño del Worker:** F1 no añade rutas; F2 añade 4 route handlers; F5 añade 1. La última tarea de cada fase ejecuta, en Linux/WSL y sin desplegar, `npm run build:worker` y `npx wrangler deploy --dry-run --outdir <scratch>`. Registra el gzip frente a la última medición y al umbral de consulta de 2 MiB (límite Free: 3 MiB). Si se supera, se detiene y se consulta.

### Base de datos: `lib/db-schema.ts` (modificar, F1) → `drizzle/0003_*.sql`
Todo en `public`, en snake_case.

| Objeto | Definición |
|---|---|
| enum `lead_activity_type` | añade `automation` |
| enum `outbox_event_type` | `lead.created`, `lead.stage_changed` |
| enum `outbox_status` | `pending`, `processing`, `succeeded`, `dead` |
| `leads.owner_user_id` | pasa a nullable (FK sin cambios) |
| `leads.created_by` | pasa a nullable; CHECK `leads_created_by_chk`: `created_by IS NOT NULL OR source = 'web_form'` |
| `leads.idempotency_key` | `uuid`; índice único `leads_idempotency_key_uq` |
| `leads.submission_hash` | `text`; CHECK `leads_submission_chk`: `(idempotency_key IS NULL) = (submission_hash IS NULL) AND (submission_hash IS NULL OR submission_hash ~ '^[0-9a-f]{64}$')` |
| `lead_activities.actor_user_id` | pasa a nullable; CHECK `lead_activities_actor_chk`: `actor_user_id IS NOT NULL OR type IN ('created', 'automation')` |
| `lead_activities.source_event_id` | `uuid` → `outbox_events.id` `ON DELETE RESTRICT`; índice único; CHECK `lead_activities_event_chk`: `(type = 'automation') = (source_event_id IS NOT NULL)` |
| `lead_activities_body_chk` (sustituye) | como el actual, pero `automation` exige `body` (1–500): `… CASE WHEN type IN ('note','call','message') THEN body IS NOT NULL WHEN type = 'automation' THEN body IS NOT NULL AND char_length(body) <= 500 WHEN type IN ('created','stage_changed') THEN true ELSE body IS NULL END` |
| `lead_activities_owner_chk` (sustituye) | `CASE WHEN type = 'owner_changed' THEN owner_to IS NOT NULL AND owner_from IS DISTINCT FROM owner_to ELSE owner_from IS NULL AND owner_to IS NULL END` (el primer responsable tiene `owner_from` nulo) |
| `outbox_events.id` | `uuid` PK `defaultRandom()` |
| `outbox_events.type` | `outbox_event_type not null` |
| `outbox_events.lead_id` | `uuid not null` → `leads.id` `ON DELETE RESTRICT` |
| `outbox_events.payload_version` | `smallint not null default 1`; CHECK `>= 1` |
| `outbox_events.payload` | `jsonb not null`; CHECK `jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 1024` |
| `outbox_events.status` | `outbox_status not null default 'pending'` |
| `outbox_events.attempts` | `integer not null default 0`; CHECK `attempts BETWEEN 0 AND 8` |
| `outbox_events.available_at` | `timestamptz not null default now()` |
| `outbox_events.lease_until`, `lease_token` | `timestamptz`, `uuid`; CHECK `outbox_events_lease_chk`: `(status = 'processing') = (lease_token IS NOT NULL) AND (lease_token IS NULL) = (lease_until IS NULL)` |
| `outbox_events.created_at` | `timestamptz not null default now()` |
| `outbox_events.processed_at` | `timestamptz`; CHECK `(status IN ('succeeded','dead')) = (processed_at IS NOT NULL)` |
| `outbox_events.last_error_code` | `text`; CHECK `last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,40}$'` |
| índice `outbox_events_ready_idx` | `(available_at)` `WHERE status IN ('pending', 'processing')` |

- **Aplicación manual en dos bloques:** PostgreSQL no permite usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos de `lead_activities` mencionan `'automation'`. Por eso el README indica: (1) ejecutar solo `ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';`; (2) el resto de `0003` entre `BEGIN;` y `COMMIT;`. Orden global: `0001` → `0002` → `0003`.
- Los CHECK sustituidos se generan como `DROP CONSTRAINT` + `ADD CONSTRAINT` del mismo nombre. El developer revisa que drizzle-kit no genere nada más.

### Entorno: `lib/env.ts` (modificar, F1)
```ts
// Optional integrations: validated lazily and independently, so the CRM and auth keep working without them.
export function getIntegrationEnv(): { N8N_API_TOKEN: string } | null;      // missing → null; < 32 chars → throws (field name only)
export function getTurnstileEnv(): { TURNSTILE_SECRET_KEY: string; isTestSecret: boolean } | null;
//   missing → null; documented test secrets allowed only when NODE_ENV === "development" (else throws)
```
`getEnv()` y su `environmentSchema` no cambian. `.env.example` y `.dev.vars.example` añaden `N8N_API_TOKEN=` y `TURNSTILE_SECRET_KEY=` vacíos, con comentarios (Secret de Cloudflare; credencial de n8n; claves de prueba en el README). `.env.example` añade también `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` (pública, de build). `wrangler.jsonc` no cambia: los dos secretos se crean con `npx wrangler secret put` (lo hace el usuario; no forma parte de ninguna tarea).

### Captura (`modules/crm/`, F3)
- `schemas/webLeads.schema.ts` (sin `server-only`):
  ```ts
  // Input: strings from Object.fromEntries(formData). z.object drops unknown keys.
  export const webLeadFormSchema = z.object({
    name: z.string().trim().min(2).max(80),                 // "Escribe tu nombre (2 a 80 caracteres)."
    email: z.string().trim().toLowerCase().pipe(z.email().max(150)), // "Escribe un correo válido."
    phone: phoneSchema,                                     // de ./leads.schema (exportado en F1)
    destination: z.enum(INQUIRY_DESTINATION_IDS),           // "Elige un destino."
    consent: z.literal("on"),                               // "Necesitamos tu autorización para guardar tus datos."
    submissionId: z.uuid(),
    "cf-turnstile-response": z.string().max(2048).default(""),
  }).transform(({ name, "cf-turnstile-response": turnstileToken, consent: _consent, ...rest }) =>
    ({ fullName: name, turnstileToken, ...rest }));
  ```
  El honeypot (`website`) y el límite de 16 KiB se comprueban en la acción, antes del schema.
- `types/webLeads.types.ts`:
  ```ts
  export type WebLeadInput = z.output<typeof webLeadFormSchema>;
  export type WebLeadFormState =
    | { status: "idle" }
    | { status: "success"; message: string }
    | {
        status: "error";
        code: "invalid_input" | "verification_failed" | "conflict" | "unavailable";
        message: string;
        fieldErrors?: Partial<Record<"name" | "email" | "phone" | "destination" | "consent", string[]>>;
      };
  ```
- `services/turnstile.service.ts` (`server-only`):
  ```ts
  export async function verifyTurnstileToken(input: {
    token: string; remoteIp: string | null; idempotencyKey: string;
  }): Promise<"valid" | "invalid" | "unavailable">;
  // POST https://challenges.cloudflare.com/turnstile/v0/siteverify (form-urlencoded:
  // secret, response, remoteip?, idempotency_key). Response parsed with zod:
  // { success: boolean; hostname?: string; action?: string; "error-codes"?: string[] }.
  // Max 2 attempts, AbortSignal.timeout(3000), retry only on network error/timeout/5xx.
  ```
- `services/webLeads.service.ts` (`server-only`):
  ```ts
  export async function createWebLead(input: Omit<WebLeadInput, "turnstileToken">):
    Promise<"created" | "duplicate" | "conflict">;
  // submission_hash = SHA-256 hex (crypto.subtle) of JSON.stringify([fullName, email, phone, destination]).
  // One db.execute(sql`WITH existing …, recent …, trip …, new_lead AS (INSERT … ON CONFLICT (idempotency_key)
  //   DO NOTHING RETURNING id), activity AS (INSERT … FROM new_lead), event AS (INSERT … FROM new_lead)
  //   SELECT (SELECT count(*) FROM new_lead) AS created, (SELECT submission_hash FROM existing) AS existing_hash`).
  // created = 1 → "created"; existing_hash ≠ hash → "conflict"; anything else → "duplicate".
  ```
- `actions/webLeads.actions.ts` (`"use server"`):
  ```ts
  export async function submitWebLeadAction(prev: WebLeadFormState, formData: FormData): Promise<WebLeadFormState>;
  ```
  Orden: tamaño y tipos de `FormData` → honeypot → schema → `verifyTurnstileToken` (con `cf-connecting-ip` de `headers()`) → `createWebLead`. Mensajes:

  | Resultado | `status` / `code` | Mensaje |
  |---|---|---|
  | creado, duplicado u honeypot | `success` | "¡Listo! Recibimos tu consulta. Te escribiremos por WhatsApp." |
  | schema o tamaño | `invalid_input` | "Revisa los datos del formulario." (+ `fieldErrors`) |
  | Turnstile `invalid` o token vacío | `verification_failed` | "No pudimos verificar el envío. Inténtalo de nuevo." |
  | `conflict` | `conflict` | "Ya recibimos una consulta desde este formulario. Recarga la página para enviar otra." |
  | Turnstile `unavailable` o excepción | `unavailable` | "No pudimos enviar tu consulta en este momento. Puedes escribirnos por WhatsApp." |

  Sin `revalidatePath`: las páginas del CRM son dinámicas.
- `index.ts` (modificar): exporta `submitWebLeadAction` y el tipo `WebLeadFormState`.

### Landing (`modules/landing/`, F4)
| Componente / archivo | Tipo | Cambio |
|---|---|---|
| `button`, `input`, `label`, `native-select` | shadcn (instalado) | Sin cambios; los usa `ContactForm` |
| `checkbox` de shadcn | descartado | La landing ya usa `<input type="checkbox">` nativo con `required` (validación del navegador); se mantiene |
| `utils/inquiry.ts` | existente | Usa `INQUIRY_DESTINATIONS` de `@/lib/inquiryDestinations`; elimina `DESTINATION_IDS`/`DESTINATION_NAMES`; la cláusula de precios se aplica a `maraton-santiago-2027`; `parseDestinationId` cae a `maraton-santiago-2027` |
| `components/ContactSection.tsx` | existente (Server) | Importa `submitWebLeadAction` de `@/modules/crm` y lo pasa como `action`. Sustituye la nota "VISTA DE DEMOSTRACIÓN" por "CÓMO USAMOS TUS DATOS" + "Guardamos tu consulta para que un asesor te contacte por WhatsApp o correo. Sin pagos ni compromiso de reserva." (provisional, Pregunta abierta 1) |
| `components/ContactForm.tsx` | existente (`"use client"`) | Props `{ defaultDestination, action }`. `onSubmit` + `startTransition` (conserva lo escrito): añade `submissionId` (ref; se genera al enviar si no existe y se borra tras un éxito o al editar después de un éxito) y llama a `action`. Botón "Enviar mi consulta" / "Enviando…" (deshabilitado). Errores por campo con `aria-invalid`, mensaje general en `role="alert"`, resultado en `role="status"` (Requisito 7). Consentimiento `web-form-v1`. Honeypot `website`. Opciones del selector desde `INQUIRY_DESTINATIONS`, con los mismos textos visibles. Renderiza `TurnstileWidget` si hay site key |
| `components/TurnstileWidget.tsx` | nuevo (`"use client"`; no existe en shadcn ni en el proyecto; un solo dominio, se sube a `components/shared` si el registro de runners lo necesita) | Props `{ siteKey: string; action: string; resetSignal: number }`. `next/script` con `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`; `turnstile.render(ref, { sitekey, action, language: "es", theme: "light" })` dentro del `<form>` (inyecta el campo oculto `cf-turnstile-response`); `turnstile.reset()` cuando cambia `resetSignal`; `turnstile.remove()` al desmontar. Tipado mínimo local de `window.turnstile`, sin `@types` |
| `components/MobileCta.tsx`, `components/HeroCarousel.tsx` | existente | `href` → `/contacto?destino=maraton-santiago-2027` |

`app/contacto/page.tsx` no cambia (ya es dinámica por `searchParams`).

### Outbox y API privada (`modules/integrations/` y `app/api/integrations/n8n/`, F2 y F5)
- `utils/integrationRequest.ts` (`server-only`):
  ```ts
  export async function tokensMatch(provided: string, expected: string): Promise<boolean>; // SHA-256 + XOR
  export async function handleIntegrationRequest(
    request: Request,
    handler: () => Promise<Response>,
  ): Promise<Response>; // 503 not_configured | 401 unauthorized | handler | 500 internal_error; always no-store
  export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null>; // ≤ 4 KiB, null if invalid
  export function integrationJson(body: unknown, status?: number): Response; // JSON + Cache-Control: no-store
  ```
- `schemas/integrations.schema.ts`: `claimRequestSchema` (`{ limit?: 1–25 }`, por defecto 10), `ackRequestSchema` (`{ leaseToken: uuid }`), `failRequestSchema` (`{ leaseToken: uuid, errorCode: /^[a-z0-9_]{1,40}$/ }`), `eventIdSchema`/`leadIdSchema` (`z.uuid()`) y, en F5, `activityRequestSchema` (`{ eventId: uuid, body: trim 1–500 }`).
- `types/integrations.types.ts`: `OutboxEventType`, `ClaimedEvent`, `IntegrationLead` (formas del contrato).
- `services/outbox.service.ts` (`server-only`):
  ```ts
  export async function claimEvents(limit: number): Promise<ClaimedEvent[]>;
  //   db.batch: (1) expired leases with attempts >= 8 → dead ('lease_expired');
  //   (2) WITH ready AS (SELECT id … WHERE (status='pending' AND available_at<=now())
  //        OR (status='processing' AND lease_until<=now()) ORDER BY available_at, id LIMIT $limit
  //        FOR UPDATE SKIP LOCKED) UPDATE … SET status='processing', attempts=attempts+1,
  //        lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes' FROM ready … RETURNING ….
  export async function ackEvent(id: string, leaseToken: string): Promise<"succeeded" | "lease_lost">;
  export async function failEvent(id: string, leaseToken: string, errorCode: string):
    Promise<{ status: "pending"; availableAt: Date } | { status: "dead" } | "lease_lost">;
  ```
- `services/integrationLeads.service.ts` (`server-only`):
  ```ts
  export async function getIntegrationLead(id: string): Promise<IntegrationLead | null>;
  //   leads LEFT JOIN trips LEFT JOIN profiles (owner); explicit columns only.
  // F5
  export async function recordAutomationActivity(leadId: string, eventId: string, body: string):
    Promise<"recorded" | "duplicate" | "not_found">;
  //   INSERT … SELECT … WHERE lead not archived AND event.lead_id = leadId ON CONFLICT (source_event_id) DO NOTHING.
  ```
- `index.ts`: exporta `handleIntegrationRequest`, `readJsonBody`, `integrationJson`, los schemas de petición y los services.
- Rutas (solo componen: `handleIntegrationRequest` → validar → service → `integrationJson`; `params` es una promesa, `RouteContext<"/api/integrations/n8n/events/[id]/ack">`; consultar `node_modules/next/dist/docs/` antes de escribirlas):
  - `app/api/integrations/n8n/events/claim/route.ts` — `POST`
  - `app/api/integrations/n8n/events/[id]/ack/route.ts` — `POST`
  - `app/api/integrations/n8n/events/[id]/fail/route.ts` — `POST`
  - `app/api/integrations/n8n/leads/[id]/route.ts` — `GET`
  - (F5) `app/api/integrations/n8n/leads/[id]/activities/route.ts` — `POST`

### Contrato de API (n8n)
Todas las peticiones llevan `Authorization: Bearer <N8N_API_TOKEN>` y, si tienen cuerpo, `Content-Type: application/json`. Errores comunes: 400 `{ "error": "invalid_request" }`, 401 `{ "error": "unauthorized" }`, 500 `{ "error": "internal_error" }` y 503 `{ "error": "not_configured" }`.

```ts
// POST /api/integrations/n8n/events/claim
type ClaimRequest = { limit?: number };                 // 1–25, default 10
type ClaimResponse = { events: ClaimedEvent[] };        // 200; [] if nothing is ready
type ClaimedEvent = {
  id: string;                                           // event_id: deduplicate on this
  type: "lead.created" | "lead.stage_changed";
  leadId: string;
  payloadVersion: 1;
  payload: { source: "web_form" | "whatsapp" | "other" }        // lead.created
         | { stageFrom: LeadStage; stageTo: LeadStage };        // lead.stage_changed
  attempts: number;                                     // 1–8, includes this claim
  leaseToken: string;
  leaseUntil: string;                                   // ISO 8601
  createdAt: string;
};

// POST /api/integrations/n8n/events/{id}/ack
type AckRequest = { leaseToken: string };
// 200 { status: "succeeded" } | 409 { error: "lease_lost" }

// POST /api/integrations/n8n/events/{id}/fail
type FailRequest = { leaseToken: string; errorCode: string };  // /^[a-z0-9_]{1,40}$/
// 200 { status: "pending"; availableAt: string } | 200 { status: "dead" } | 409 { error: "lease_lost" }

// GET /api/integrations/n8n/leads/{id}
type IntegrationLead = {
  id: string;
  fullName: string;
  phone: string;                                        // E.164, ready for wa.me (without "+")
  stage: "new" | "contacted" | "quoted" | "reserved" | "paid" | "lost";
  source: "whatsapp" | "web_form" | "other";
  trip: { slug: string; title: string } | null;
  destinationText: string | null;
  owner: { email: string } | null;                      // null = unassigned
  archived: boolean;
  createdAt: string;
};
// 200 IntegrationLead | 404 { error: "not_found" }

// (F5) POST /api/integrations/n8n/leads/{id}/activities
type ActivityRequest = { eventId: string; body: string };      // body 1–500, no message content
// 201 { status: "recorded" } | 200 { status: "duplicate" } | 404 { error: "not_found" }
```

### Cambios en `crm-leads-pipeline` (código, no la spec)
- **F1 de esta spec** (requiere `crm-leads-pipeline` F1 cerrada):
  - `createLead` añade el `INSERT` en `outbox_events` (`lead.created`, `{ source }`) a su misma escritura atómica.
  - `getLeadList` usa `LEFT JOIN profiles` para el responsable; `LeadListItem.owner` pasa a `{ userId; email; active } | null`.
  - `leads.schema.ts` exporta `phoneSchema` y añade `automation` a `leadActivityTypeSchema` (el formulario de actividades de su F4 sigue limitado a `note`/`call`/`message`).
- **F5 de esta spec** (requiere `crm-leads-pipeline` F3 cerrada): `changeLeadStage` añade a su misma sentencia el `INSERT` del evento `lead.stage_changed`, solo cuando el cambio es efectivo.

### Guía de n8n (README, F2 y F5)
Sección "Automatizaciones con n8n", sin secretos ni datos reales:
1. Credencial "Header Auth" en n8n con `Authorization: Bearer <token>`; el mismo valor se guarda como Secret `N8N_API_TOKEN` en Cloudflare.
2. Workflow: *Schedule Trigger* (cada minuto) → *HTTP Request* `POST …/events/claim` → *Split Out* `events` → deduplicar por `id` (*Remove Duplicates* entre ejecuciones o una tabla de n8n) → `GET …/leads/{leadId}` → si `archived` o la etapa actual ≠ la del evento, ack → *Switch* por tipo y etapa → plantilla (*Set*/*Code*) → enlace `https://wa.me/<phone sin +>?text=<encodeURIComponent(texto)>` → *Send Email* (SMTP del usuario) y aviso por WhatsApp al usuario (proveedor en n8n, Pregunta abierta 3) → (F5) `POST …/leads/{id}/activities` → `POST …/events/{id}/ack`. Rama de error → `POST …/events/{id}/fail` con un código corto.
3. El aviso de "nuevo lead" solo para `source = "web_form"`; el mensaje preparado, para todas las etapas que tengan plantilla.
4. n8n apagado: los eventos esperan; al volver, se recogen. Tras 8 intentos fallidos, quedan `dead` (consultables en el SQL Editor; reenvío en una spec futura).
5. Regla WAF opcional (plan Free, sin código): limitar `POST /contacto` por IP desde el panel de Cloudflare.

### Relación con otras specs
- **`crm-leads-pipeline.md` necesita una enmienda** (la hace el agente Spec en esa spec, con nueva aprobación; esta spec no la edita), **antes de su F2**, para que su UI muestre los leads de esta captura:
  1. `owner` opcional en `LeadListItem`/`LeadDetail`; "Sin asignar" en `LeadTable` y `LeadDetails`, y opción de filtro "Sin asignar" (`responsable=sin-asignar`) para la bandeja de entrada.
  2. `changeLeadOwner` acepta un lead sin responsable (`owner_user_id IS DISTINCT FROM $nuevo`) y registra `owner_changed` con `owner_from` nulo ("Sin asignar → b@…").
  3. `getLeadById` con `LEFT JOIN` para responsable y autor; "Registrado por: Formulario web" si `created_by` es nulo.
  4. `LeadTimeline` y `LEAD_ACTIVITY_LABELS`: etiqueta `automation` "Automatización (n8n)" y autor nulo mostrado como "Formulario web" (`created`) o "n8n" (`automation`).
  5. Su Requisito 3 y su "Preparación para la captura automática" pasan a remitir a esta spec.

  Orden recomendado: `crm-leads-pipeline` F1 → enmienda aprobada → F1 de esta spec → `crm-leads-pipeline` F2… Las demás fases de esta spec no tocan la UI del CRM.
- **No se ejecutan en paralelo** con esta spec: `crm-leads-pipeline` F1 (comparte `lib/db-schema.ts`, `drizzle/` y `modules/crm/services/leads.service.ts`) ni su F3 respecto a nuestra F5 (`changeLeadStage`). Tampoco las fases de `landing-public-site` que tocan `HeroCarousel` o `ContactForm` en paralelo con nuestra F4.
- **`landing-public-site.md`:** sus criterios de F1 "no se crea un schema zod" y "la pestaña Red no registra ninguna petición al enviar" quedan superados por la F4 de esta spec. Su F2 (`TripDetail`, `DestinationsSection`) debe enlazar con `?destino=maraton-santiago-2027` (o `INQUIRY_DESTINATIONS`). Su F3 (`/cuenta`) no cambia.
- **`platform-neon-foundation.md`:** esta spec es su "Fase 3: captura durable mínima". El reenvío administrativo auditado de eventos `dead` queda para una spec posterior.

## Reutilización
- `getDb()` y `db.execute`/`db.batch` (`lib/db.ts`), `lib/db-schema.ts` (`leads`, `leadActivities`, `trips`, `profiles`, enums), `npm run db:generate` y el procedimiento manual del README.
- `getEnv()` (`APP_ORIGIN` para el hostname de Turnstile) y el patrón de errores sin valores de `lib/env.ts`.
- `phoneSchema` y `leadActivityTypeSchema` de `modules/crm/schemas/leads.schema.ts`; `createLead`/`getLeadList`/`changeLeadStage` de `leads.service.ts` (se amplían, no se duplican).
- Patrón de acciones de `staff.actions.ts` (guarda → zod → service, errores fijos) y de formularios con `onSubmit` + `startTransition` (`InviteStaffForm`).
- Patrón de route handler con `Cache-Control: no-store` de `app/api/crm/me/route.ts` y `lib/auth/errors.ts`.
- Fake del cliente Neon HTTP de `staff.service.test.ts` para los tests de services (se copia el patrón, como en `crm-leads-pipeline`).
- Landing: `ContactForm`, `ContactSection`, `buildInquiryMessage`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER`.
- shadcn instalados: `button`, `input`, `label` y `native-select`. No se instala nada (Turnstile no existe en shadcn).

## Tests
- `lib/env.test.ts` (F1, ampliar): `getIntegrationEnv` (ausente → `null`; 31 caracteres → error con solo el nombre del campo; válido) y `getTurnstileEnv` (ausente → `null`; secreto de prueba en `development` → `isTestSecret: true`; en `production` → error). Los casos existentes de `getEnv` no cambian.
- `modules/crm/schemas/leads.schema.test.ts` (F1, ampliar): el enum de actividades incluye `automation` y coincide con la base.
- `modules/crm/services/leads.service.test.ts` (F1 y F5, ampliar): `createLead` envía el `INSERT` en `outbox_events` con `lead.created` y `{ source }` dentro de la misma sentencia o batch; `getLeadList` usa `left join` y mapea `owner: null`; (F5) `changeLeadStage` incluye el evento `lead.stage_changed` con `stageFrom`/`stageTo` y no lo emite en `no_change`/`not_found`.
- `modules/integrations/utils/integrationRequest.test.ts` (F2): `tokensMatch` (igual, distinto, distinta longitud, vacío); `handleIntegrationRequest` (sin token configurado → 503; sin cabecera, `Basic …` o token incorrecto → 401 sin llamar al handler; correcto → handler; handler lanza → 500 con log fijo; siempre `no-store` y sin CORS); `readJsonBody` (> 4 KiB, JSON inválido o schema inválido → `null`).
- `modules/integrations/schemas/integrations.schema.test.ts` (F2; F5 amplía): `limit` por defecto y límites; `errorCode` válido e inválido; UUID inválidos; (F5) `body` vacío o de 501.
- `modules/integrations/services/outbox.service.test.ts` (F2): `claimEvents` hace un único batch con el paso a `dead` antes del claim, con `for update skip locked`, `limit` y `attempts + 1`; `ackEvent` filtra por `lease_token` y `lease_until > now()` y devuelve `lease_lost` sin filas; `failEvent` con `attempts < 8` → `pending` con backoff, con `8` → `dead`, sin filas → `lease_lost`.
- `modules/integrations/services/integrationLeads.service.test.ts` (F2; F5 amplía): `getIntegrationLead` selecciona solo las columnas del contrato, mapea `owner`/`trip` nulos y `archived`; sin filas → `null`; (F5) `recordAutomationActivity` con sus tres resultados y `actor_user_id` nulo.
- `modules/crm/schemas/webLeads.schema.test.ts` (F3): los casos del criterio de F3.
- `modules/crm/services/turnstile.service.test.ts` (F3): los casos del criterio de F3, con `fetch` y entorno simulados.
- `modules/crm/services/webLeads.service.test.ts` (F3): una sola llamada `execute`; parámetros (`web_form`, `web-form-v1`, sin `stage`, slug o nombre visible, hash hex de 64); mapeo de `created`/`duplicate`/`conflict`; el hash es estable para los mismos datos y cambia si cambia un campo.
- `modules/crm/actions/webLeads.actions.test.ts` (F3): los casos del criterio de F3 (mocks de `server-only`, `next/headers` y los dos services; espía de `console.error`).
- `modules/landing/utils/inquiry.test.ts` (F4, actualizar): ids nuevos, plantilla exacta de Santiago con `maraton-santiago-2027`, `parseDestinationId("santiago-2027")` → `maraton-santiago-2027`.
- Sin unit test (SETUP §3): `lib/inquiryDestinations.ts` (constantes), tipos, `lib/db-schema.ts` (lo cubren la migración y la prueba manual), route handlers que solo componen, `ContactForm`, `ContactSection` y `TurnstileWidget` (componentes de módulo; la lógica está en schema, acción y services).

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer) y con la medición del Worker en su última tarea.

### Fase 1: modelo, outbox, entorno y alta manual con evento (4 tareas, 14 archivos: 2 generados por drizzle-kit)
Requisitos previos: `crm-leads-pipeline` F1 cerrada (migración `0002` en el journal) y su enmienda aprobada.
- [ ] T1 — Schema y migración `0003`: enums, `outbox_events` y cambios en `leads`/`lead_activities`; `npm run db:generate` y revisión del SQL (`grep -inE 'neon_auth|create schema|drop (table|type|column|schema)'`) · archivos: `lib/db-schema.ts`, `drizzle/0003_*.sql` (generado), `drizzle/meta/0003_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [ ] T2 — Entorno opcional (`getIntegrationEnv`, `getTurnstileEnv`) con tests y plantillas · archivos: `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.dev.vars.example` · depende de: T1 · secuencial (base, `lib/`)
- [ ] T3 — `createLead` con evento `lead.created`, `getLeadList` con responsable opcional, `phoneSchema` exportado y `automation` en el enum, con tests; medir el Worker · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts` · depende de: T2 · paralelo (con T4)
- [ ] T4 — README: "Migración de captura y outbox" (dos bloques, orden `0001` → `0002` → `0003`, pruebas manuales del criterio de F1 en una rama de desarrollo) y "Secretos de integraciones" (`wrangler secret put`, variable de build, claves de prueba) · archivos: `README.md` · depende de: T2 · paralelo (con T3)

### Fase 2: API privada para n8n (5 tareas, 15 archivos)
Requisitos previos: Fase 1 cerrada y `0003` aplicada en la rama de pruebas.
- [ ] T1 — Helper de petición (auth Bearer en tiempo constante, cuerpo ≤ 4 KiB, respuestas `no-store`), schemas y tipos, con tests · archivos: `modules/integrations/utils/integrationRequest.ts`, `modules/integrations/utils/integrationRequest.test.ts`, `modules/integrations/schemas/integrations.schema.ts`, `modules/integrations/schemas/integrations.schema.test.ts`, `modules/integrations/types/integrations.types.ts` · depende de: Fase 1 · secuencial (base del módulo)
- [ ] T2 — `outbox.service.ts` (claim, ack, fail) con tests · archivos: `modules/integrations/services/outbox.service.ts`, `modules/integrations/services/outbox.service.test.ts` · depende de: T1 · paralelo (con T3)
- [ ] T3 — `integrationLeads.service.ts` (`getIntegrationLead`) con tests · archivos: `modules/integrations/services/integrationLeads.service.ts`, `modules/integrations/services/integrationLeads.service.test.ts` · depende de: T1 · paralelo (con T2)
- [ ] T4 — API pública del módulo y las 4 rutas; medir el Worker · archivos: `modules/integrations/index.ts`, `app/api/integrations/n8n/events/claim/route.ts`, `app/api/integrations/n8n/events/[id]/ack/route.ts`, `app/api/integrations/n8n/events/[id]/fail/route.ts`, `app/api/integrations/n8n/leads/[id]/route.ts` · depende de: T2, T3 · secuencial
- [ ] T5 — README: "Automatizaciones con n8n" (contrato, workflow, plantillas por etapa en n8n, deduplicación, códigos de error, regla WAF opcional) · archivos: `README.md` · depende de: T4 · secuencial

### Fase 3: captura en servidor (4 tareas, 11 archivos)
Requisitos previos: Fase 1 cerrada (la Fase 2 puede ir antes o después; los archivos son disjuntos, pero no se ejecutan en la misma sesión).
- [ ] T1 — Destinos de consulta compartidos y schema/tipos del formulario web, con tests · archivos: `lib/inquiryDestinations.ts`, `modules/crm/schemas/webLeads.schema.ts`, `modules/crm/schemas/webLeads.schema.test.ts`, `modules/crm/types/webLeads.types.ts` · depende de: Fase 1 · secuencial (base, `lib/`)
- [ ] T2 — `verifyTurnstileToken` con tests · archivos: `modules/crm/services/turnstile.service.ts`, `modules/crm/services/turnstile.service.test.ts` · depende de: T1 · paralelo (con T3)
- [ ] T3 — `createWebLead` (CTE única, idempotencia, ventana de duplicados, slug) con tests · archivos: `modules/crm/services/webLeads.service.ts`, `modules/crm/services/webLeads.service.test.ts` · depende de: T1 · paralelo (con T2)
- [ ] T4 — `submitWebLeadAction` con tests y export en la API pública; medir el Worker · archivos: `modules/crm/actions/webLeads.actions.ts`, `modules/crm/actions/webLeads.actions.test.ts`, `modules/crm/index.ts` · depende de: T2, T3 · secuencial

### Fase 4: formulario de la landing conectado (3 tareas, 7 archivos)
Requisitos previos: Fase 3 cerrada; ninguna fase de `landing-public-site` en curso sobre `HeroCarousel` o `ContactForm`.
- [ ] T1 — `inquiry.ts` sobre `INQUIRY_DESTINATIONS` (ids con slug) y enlaces actualizados, con tests · archivos: `modules/landing/utils/inquiry.ts`, `modules/landing/utils/inquiry.test.ts`, `modules/landing/components/MobileCta.tsx`, `modules/landing/components/HeroCarousel.tsx` · depende de: Fase 3 · paralelo (con T2)
- [ ] T2 — `TurnstileWidget` · archivos: `modules/landing/components/TurnstileWidget.tsx` · depende de: Fase 3 · paralelo (con T1)
- [ ] T3 — `ContactForm` con envío, honeypot, consentimiento y estados, y `ContactSection` con la acción y los textos nuevos; medir el Worker · archivos: `modules/landing/components/ContactForm.tsx`, `modules/landing/components/ContactSection.tsx` · depende de: T1, T2 · secuencial

### Fase 5: cambio de etapa y actividad de n8n (4 tareas, 9 archivos)
Requisitos previos: Fases 2 y 4 cerradas y `crm-leads-pipeline` F3 cerrada (`changeLeadStage`).
- [ ] T1 — `changeLeadStage` emite `lead.stage_changed` en la misma sentencia, con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: — · paralelo (con T2)
- [ ] T2 — `activityRequestSchema` y `recordAutomationActivity`, con tests · archivos: `modules/integrations/schemas/integrations.schema.ts`, `modules/integrations/schemas/integrations.schema.test.ts`, `modules/integrations/services/integrationLeads.service.ts`, `modules/integrations/services/integrationLeads.service.test.ts` · depende de: — · paralelo (con T1)
- [ ] T3 — Ruta de actividades y export; medir el Worker · archivos: `modules/integrations/index.ts`, `app/api/integrations/n8n/leads/[id]/activities/route.ts` · depende de: T2 · secuencial
- [ ] T4 — README: plantillas por etapa, descarte de eventos obsoletos y llamada de actividad en la guía de n8n · archivos: `README.md` · depende de: T1, T3 · secuencial

## Preguntas abiertas
Resueltas por el usuario (2026-10-18):
- **Dónde corre n8n:** en su computadora, sin IP pública → modelo *pull*: n8n consulta la API privada del Worker por HTTPS y el Worker nunca llama a n8n. Se descarta el webhook *push*.
- **Qué hace n8n con cada lead:** avisar al usuario por correo y WhatsApp cuando entra un lead, y preparar el mensaje predefinido según la etapa del CRM (por eso existe `lead.stage_changed`). Preparar ≠ enviar al runner.
- **Asignación:** manual en el CRM; n8n no asigna.
- **Canal del aviso:** correo + WhatsApp al propio usuario; las credenciales viven en n8n, no en el Worker.

Pendientes:
1. **Texto legal del consentimiento y aviso de datos (Ley 29733).** Se usan textos provisionales (`web-form-v1` y la nota "CÓMO USAMOS TUS DATOS"). Los datos del lead pasan también por n8n y por los proveedores de correo y WhatsApp del usuario. ¿Nos das el texto definitivo y, si hace falta, la política de privacidad? No bloquea la implementación, pero sí recomendamos no publicar la F4 en producción sin él.
2. **Turnstile:** el contrato aprobado de `platform-neon-foundation.md` lo exige y es gratuito. ¿Confirmas que crearás el widget en Cloudflare (hostname `carreras-viajeras.mentec.dev`, modo *Managed*) y cargarás `TURNSTILE_SECRET_KEY` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY`? Crear recursos en Cloudflare lo haces tú.
3. **Proveedor del aviso por WhatsApp en n8n:** la automatización de WhatsApp Web está descartada. Las opciones son la API oficial de WhatsApp Cloud (requiere un número distinto del de WhatsApp Business App), otro canal como Telegram, o solo correo al inicio. ¿Cuál prefieres? No afecta al código del repo, solo a la guía.
4. **Alta manual y `lead.created`:** recomendamos emitir el evento también para los leads que registra el comercial, para que n8n le prepare el mensaje de la etapa "Nuevo", pero sin el aviso de "nuevo lead" (solo para `web_form`). ¿De acuerdo?
5. **Plantillas de mensajes:** recomendamos que vivan en n8n para el MVP (se editan sin desplegar). Una tabla editable desde el CRM iría en otra spec. ¿De acuerdo? ¿Nos pasas los textos por etapa o los redactas tú en n8n?
6. **Registro de runner → lead** (F3 de la landing): el registro en `/cuenta` solo pide el correo y `leads.phone` es obligatorio, así que no puede crear un lead completo. Propuesta para una spec posterior: tras verificar el correo, enlazar la cuenta al lead existente con ese email (columna `runner_user_id`), sin crear leads nuevos. ¿Lo quieres y en qué momento?
7. **Eventos `dead`** (tras 8 intentos fallidos): el contrato pide un reenvío administrativo auditado. Mientras tanto, propuesta: consultarlos en el SQL Editor y, más adelante, una acción "Reintentar" para `admin` en el CRM. ¿Te sirve?
8. **Ventana de duplicados:** 10 minutos por teléfono para el formulario web. ¿Te parece bien el plazo?
9. **Datos del lead para n8n:** la lectura no incluye el correo del lead (no lo pediste para el aviso). ¿Quieres que el aviso al usuario incluya también el correo del runner?
10. **Enmienda y orden con `crm-leads-pipeline`:** para que los leads web se vean en el CRM, hay que enmendar esa spec antes de su F2 (owner opcional, "Sin asignar", autor "Formulario web"/"n8n"; ver "Relación con otras specs"). ¿Autorizas al orquestador a pedir esa enmienda y a seguir el orden recomendado?
