# Captura de leads desde `/contacto` (formulario web → CRM → aviso n8n)

- Módulo: landing (formulario, Turnstile y Server Action) · crm (datos, migración y `createWebLead`)
- Estado: aprobado
- Rama: `claude/inspiring-edison-m3vgou`
- Depende de:
  - `platform-neon-foundation.md` (aprobada), sección "Leads y procesamiento posterior": es el contrato de captura que esta spec implementa (zod, ≤ 16 KiB, consentimiento versionado, Turnstile Siteverify en servidor con `success`, hostname exacto y action `lead_submit`, token no persistido, lead + evento en una transacción, idempotency key única, confirmar solo tras commit).
  - `automation-outbox.md` (aprobada, implementada y en producción): `leadCreatedEventInsert(db, payload)` de `@/modules/automation` para el mismo `db.batch`. Su requisito 2 deja a esta spec la FK `automation_events.lead_id → leads`.
  - `crm-leads-pipeline.md` (F1 implementada en `modules/crm/**`): tablas `leads`/`lead_activities`, `createLeadSchema`, `getLeadList`. Su sección "Preparación para la captura automática" dejaba pendiente la decisión del responsable: **los leads web nacen "Sin asignar"** (decisión del usuario).
- Relacionada: `crm-leads-pipeline.md` F2 (lista) y F3 (ficha `/crm/leads/<id>`) se implementan en este mismo trabajo y dependen de la Fase 1 de esta spec (ver "Orden con `crm-leads-pipeline`").

## Objetivo
Hoy el formulario de `/contacto` es una demostración: arma un texto para copiar o abrir en WhatsApp y no guarda nada. Esta spec hace que la consulta se **registre desde la web** y llegue al CRM:

1. El interesado envía nombre, correo, WhatsApp, destino y consentimiento.
2. El servidor valida el formulario y Turnstile, y guarda en Neon, en **una sola transacción**, el lead (origen "Formulario web", sin responsable), su actividad de alta y el evento `lead.created` de la outbox.
3. n8n (ya en producción, workflow inactivo) reclama el evento y envía al equipo un correo con el enlace `${APP_BASE_URL}/crm/leads/<leadId>`, que abre la ficha del CRM (`crm-leads-pipeline` F3).

Usuarios: visitantes de la landing (sin cuenta) y, en el CRM, staff con `leads.manage`.

## Alcance
- Incluye:
  - (F1) Migración `0006`: responsable y creador opcionales solo para leads web, autor opcional solo en la actividad de alta, clave de idempotencia y huella del contenido, y la FK `automation_events.lead_id → leads.id`.
  - (F1) Subschemas compartidos de nombre, teléfono E.164 y correo exportados desde `@/modules/crm`; `createWebLead` (lead + actividad + evento en un `db.batch`, idempotente) y la adaptación de `getLeadList` a leads sin responsable (`leftJoin` y filtro `unassigned`), para que el contrato del service siga siendo correcto tras la migración.
  - (F1) Seed de la outbox adaptado a la FK y documentación de la migración.
  - (F2) Configuración de Turnstile (`TURNSTILE_SITE_KEY` pública y `TURNSTILE_SECRET_KEY` secreta), schema del formulario, verificación Siteverify y Server Action `submitLeadAction`.
  - (F3) Widget Turnstile, nuevo envío del `ContactForm` y retirada de los textos de demostración; página pública `/privacidad`, enlazada desde el consentimiento; documentación operativa (README y `n8n/README.md`) y checklist de punta a punta.
- No incluye:
  - Lista, ficha, asignación de responsable ni historial en el CRM: son `crm-leads-pipeline` F2–F4.
  - Correo o WhatsApp automático al interesado; integración con WhatsApp Business. El enlace `wa.me` sigue siendo manual y secundario.
  - Cambios en el payload del evento (`lead.created` v1 sin destino en texto) ni en el workflow de n8n: si el destino no está publicado en el catálogo, el correo dice "Nuevo lead sin viaje".
  - Límite de peticiones propio, IP del visitante (`remoteip`) o cualquier dato técnico del visitante: no se envía ni se guarda.
  - Detección de duplicados entre envíos distintos (otra clave = otro lead).
  - Campos nuevos en el formulario (ciudad, mensaje libre).
  - Asesoría o redacción legal: `/privacidad` es un texto sencillo que el usuario puede revisar y ajustar. Tampoco hay un procedimiento técnico para atender las solicitudes de acceso, rectificación o cancelación (el CRM no borra leads): las atiende el equipo a mano.
  - Enlazar `/privacidad` desde el pie u otras páginas.
  - Modo de prueba o bypass de Turnstile por variable de entorno.
  - Aplicar migraciones o desplegar: lo hace el usuario a mano.

## Requisitos
1. **Campos del formulario** (todos obligatorios, se guardan y se ven en el CRM):
   - `fullName` → `leads.full_name` (mismas reglas que el alta manual: trim, 2–120).
   - `email` → `leads.email` (trim, minúsculas, correo válido, ≤ 254). Obligatorio en la web, opcional en el alta manual.
   - `phone` → `leads.phone` (E.164 con código de país, normalizado como en el alta manual).
   - `destination` → uno de `DESTINATION_IDS` (`santiago-2027`, `rio`, `roma`), resuelto a viaje del catálogo o a texto (Requisito 4).
   - `consent` → casilla marcada (`"on"`); se guarda `consent_version = "web-form-v1"` y `consented_at = now()`.
   - Campos de control, no visibles: `idempotencyKey` (UUID generado en el navegador) y `turnstileToken` (lo añade el widget). El token **no se persiste**.
2. **Origen y autoría:** el lead nace con `source = 'web_form'`, `stage = 'new'`, `owner_user_id = NULL` ("Sin asignar"), `created_by = NULL` y una actividad `created` sin autor (`actor_user_id = NULL`, `body = NULL`); el CRM muestra "Formulario web" como autor. El alta manual del CRM sigue exigiendo responsable y creador (lo garantiza también la base).
3. **Orden en el servidor** (`submitLeadAction`), cada paso corta el flujo si falla y ninguno inserta nada antes del último:
   1. tamaño ≤ 16 KiB (Requisito 6);
   2. validación zod del formulario;
   3. configuración (`getEnv()` y `getTurnstileSecret()`): si falta o es inválida → `unavailable`;
   4. Siteverify: `success === true`, `hostname === new URL(APP_ORIGIN).hostname` y `action === "lead_submit"`;
   5. `createWebLead`. La respuesta de éxito solo se devuelve tras el commit del batch.
4. **Destino → viaje.** La landing traduce su `DestinationId` al slug del catálogo con un mapa fijo (`santiago-2027 → maraton-santiago-2027`, `rio → maraton-rio-2027`, `roma → maraton-roma-2027`, los slugs que ya enlaza `DestinationsSection`) y al nombre visible de `DESTINATION_NAMES`. `createWebLead` busca un viaje `published` con ese slug:
   - si existe: `trip_id` = su id, `destination_text = NULL` y `tripSlug` del evento = el slug;
   - si no (borrador, archivado o inexistente): `trip_id = NULL`, `destination_text` = nombre visible y `tripSlug = null`.

   Los valores de `?destino=` y del `<select>` no cambian, así que los enlaces actuales (`/contacto?destino=santiago-2027`) siguen funcionando.
5. **Idempotencia.**
   - El navegador genera la clave al enviar si no hay una, la reutiliza en los reintentos sin cambios y la descarta al editar cualquier campo o tras un `conflict`.
   - `request_hash` = SHA-256 en hex de los campos normalizados (`fullName`, `phone`, `email`, `tripSlug`, `destinationName`, `consentVersion`), sin la clave ni el token.
   - Misma clave y misma huella → se devuelve el lead ya creado (`{ id }`, éxito para el visitante) sin crear otro lead, actividad ni evento.
   - Misma clave con otra huella → `conflict`, sin escribir nada.
   - Si el batch falla y luego existe una fila con esa clave (repetición, carrera entre dos envíos o respuesta perdida tras el commit), se resuelve con la misma regla; si no existe, el error se propaga.
6. **Tamaño:** la suma en bytes UTF-8 de nombres y valores del `FormData` no supera 16 384 y no hay entradas `File`; si no, `too_large` sin validar ni llamar a Siteverify. (El cuerpo HTTP crudo ya lo limita Next a 1 MB antes de la acción; el límite global no se cambia porque afectaría a las demás acciones.)
7. **Turnstile.**
   - Widget en modo gestionado (Managed) con `action: "lead_submit"`, renderizado explícito y el token en el campo `turnstileToken`.
   - Siteverify `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` con `secret` y `response` (form-urlencoded), timeout de 5 s.
   - Resultado `ok` | `invalid` (`success: false` por token inválido, expirado o reutilizado, o hostname/action distintos) | `unavailable` (red, timeout, HTTP no 2xx, JSON inesperado o códigos `missing-input-secret`, `invalid-input-secret`, `bad-request`, `internal-error`).
   - `invalid` → estado `turnstile`; `unavailable` → estado `unavailable`. En ambos casos no se inserta nada.
   - Cada respuesta de la acción que no sea éxito vuelve a montar el widget (los tokens son de un solo uso).
8. **Privacidad.**
   - Ningún dato del formulario (nombre, correo, WhatsApp) ni el token aparecen en logs, en `Error.message` ni en las respuestas.
   - El estado devuelto no repite lo escrito: el formulario conserva sus valores porque se envía con `onSubmit` + `startTransition` (patrón de `InviteStaffForm`), sin `values` en la respuesta.
   - Un error inesperado se registra con un texto fijo (`console.error("web lead submit failed")`, sin el objeto de error) y devuelve `unavailable`.
   - El evento sigue sin datos de contacto (payload v1).
9. **Configuración.**
   - `TURNSTILE_SITE_KEY` es pública: en producción va en `wrangler.jsonc` `vars` (como `APP_ORIGIN`); en local, en `.env.local`/`.dev.vars`. La lee el servidor y llega al cliente como prop. Nunca `NEXT_PUBLIC_*`.
   - `TURNSTILE_SECRET_KEY` es secreta: Cloudflare Secret (`npx wrangler secret put TURNSTILE_SECRET_KEY`) y `.env.local`/`.dev.vars` en local. Nunca en `wrangler.jsonc`, ejemplos con valor ni el repositorio.
   - Ambas se validan de forma diferida (en la petición), nunca en el build.
   - Sin clave pública válida, `/contacto` muestra el formulario deshabilitado con un aviso y el enlace a WhatsApp, en lugar de fallar.
10. **Textos.** Se quitan los textos de demostración ("VISTA DE DEMOSTRACIÓN…", "La consulta no se envía desde esta demostración.", "Preparar mi consulta", el consentimiento de demo y el flujo "Copiar consulta"). Consentimiento `web-form-v1` (aprobado por el usuario): "Acepto que Carreras Viajeras guarde mis datos de contacto para responder a esta consulta y escribirme sobre este viaje por WhatsApp o correo." Debajo de la casilla, el enlace "Cómo usamos tus datos" a `/privacidad`.
11. **Página `/privacidad`.** Pública, estática (sin datos de la base ni `searchParams`) e indexable, con `SiteHeader` y `SiteFooter` como `/contacto`. Texto sencillo en español, sin citas legales, que el usuario puede revisar:
    - **Responsable:** Carreras Viajeras; contacto `Contacto@mazproducciones.com` (enlace `mailto:`).
    - **Qué datos:** nombre, correo, WhatsApp y destino de interés que envías en el formulario de contacto.
    - **Para qué:** responder a tu consulta y escribirte sobre ese viaje.
    - **Por qué canales:** WhatsApp y correo.
    - **Quién los ve:** solo el equipo de Carreras Viajeras, en su sistema interno de gestión de consultas.
    - **Tus derechos:** puedes pedir acceso, rectificación o cancelación de tus datos escribiendo a `Contacto@mazproducciones.com`.
    - Una línea final con la fecha de la última actualización.

    Si cambia la finalidad o los canales, se actualiza esta página y el consentimiento pasa a una versión nueva (`web-form-v2`).

## Criterios de aceptación

### Fase 1 — Datos, migración y service
- [ ] (F1) Dado `lib/db-schema.ts` modificado, cuando ejecuto `npm run db:generate` sin credenciales, entonces se generan solo `drizzle/0006_*.sql`, `drizzle/meta/0006_snapshot.json` y el journal, y el SQL contiene exactamente:
  - `ADD COLUMN` `idempotency_key uuid` y `request_hash text` en `leads`;
  - `DROP NOT NULL` en `leads.owner_user_id`, `leads.created_by` y `lead_activities.actor_user_id`;
  - el índice único `leads_idempotency_key_uq`;
  - los CHECK nuevos `leads_owner_chk`, `leads_created_by_chk`, `leads_idempotency_chk` y `lead_activities_actor_chk`, y `lead_activities_owner_chk` reemplazado (`DROP CONSTRAINT` + `ADD CONSTRAINT`);
  - la FK `automation_events.lead_id → leads.id ON DELETE restrict`.

  `grep -inE 'neon_auth|create schema|drop (table|column|type|schema|index)'` sobre el archivo no devuelve nada, y los únicos `DROP` son los tres `DROP NOT NULL` y el `DROP CONSTRAINT "lead_activities_owner_chk"`. `drizzle.config.ts` no cambia. Si drizzle-kit no emite el cambio del CHECK o pide decisiones interactivas, el developer se detiene y consulta (no edita el SQL generado a mano).
- [ ] (F1) Dado un PostgreSQL local vacío (si el entorno lo tiene: `postgres` instalado o Docker), cuando aplico `0000`…`0006` en orden con `psql -1 -v ON_ERROR_STOP=1`, entonces todas se aplican sin error. Si no hay PostgreSQL local, el developer lo indica en su resumen y el paso queda en la checklist manual del usuario.
- [ ] (F1, manual del usuario, rama de desarrollo de Neon, dentro de `BEGIN;` … `ROLLBACK;`) Dada `0006` aplicada, entonces la base rechaza:
  - un lead `whatsapp` sin `owner_user_id` o sin `created_by`;
  - un lead `web_form` con `created_by`, sin `idempotency_key`, sin `request_hash` o con un `request_hash` que no es hex de 64;
  - un lead `whatsapp` con `idempotency_key`;
  - dos leads con la misma `idempotency_key`;
  - una actividad `note` u `owner_changed` sin `actor_user_id`;
  - un evento `automation_events` cuyo `lead_id` no existe.

  Y acepta un lead `web_form` sin responsable ni creador con su actividad `created` sin autor, y una actividad `owner_changed` con `owner_from = NULL` y `owner_to` de un perfil de staff.
- [ ] (F1) Dados `leadFullNameSchema`, `leadPhoneSchema` y `leadEmailSchema` exportados desde `@/modules/crm`, entonces `createLeadSchema` se construye con ellos y sus tests actuales siguen pasando sin cambios de comportamiento; `leadEmailSchema` rechaza `""` y pasa `" Ana@Example.COM "` a `"ana@example.com"` (unit test).
- [ ] (F1) Dado `webLeadRequestHash`, entonces devuelve 64 caracteres hex, el mismo valor para la misma entrada, otro valor si cambia cualquiera de los seis campos, y no depende de la clave de idempotencia (unit test).
- [ ] (F1) Dado `createWebLead` con la base simulada, entonces (unit test):
  - lee el viaje por `slug` y `status = 'published'` y después ejecuta **un único** `db.batch` con 3 sentencias en este orden: lead, actividad y evento;
  - el lead lleva el UUID generado en la app, `source` `web_form`, `consent_version` `web-form-v1`, la clave y la huella, y no envía `owner_user_id`, `created_by` ni `stage`;
  - la actividad es `created`, con el mismo `lead_id` y sin `actor_user_id` ni `body`;
  - el evento es `lead.created` con `{ leadId: <mismo UUID>, tripSlug, source: "landing_contact" }`;
  - con viaje publicado: `trip_id` y `tripSlug` = slug, `destination_text` nulo; sin viaje publicado: `trip_id` nulo, `destination_text` = nombre visible y `tripSlug: null`;
  - devuelve `{ id }` con el UUID generado;
  - si el batch falla y la fila con esa clave tiene la misma huella → `{ id }` de esa fila; con otra huella → `"conflict"`; sin fila → relanza el error original;
  - no escribe en consola.
- [ ] (F1) Dado `getLeadList` con la base simulada, entonces une el responsable con `left join`, un lead sin responsable sale con `owner: null`, y `owner: "unassigned"` filtra por `owner_user_id is null` tanto en la página como en el embudo; los filtros `mine` e id concreto no cambian (unit test).
- [ ] (F1) Dado `scripts/sql/seed-automation-demo.sql`, cuando el usuario lo ejecuta en una rama de desarrollo con `0006` aplicada, entonces inserta 4 leads ficticios `web_form` (con su actividad `created`) y sus 4 eventos con los mismos `event id`/`lead_id`/`tripSlug` de hoy; repetirlo no inserta nada; `-v cleanup=on` borra, en orden, reenvíos, eventos, actividades y leads de esos ids y nada más.
- [ ] (F1) Dado el README, entonces la sección de la migración `0006` documenta: revisión con `grep`, precondiciones (`0005` aplicada y ningún evento huérfano), aplicación entre `BEGIN;`/`COMMIT;` con la comprobación de `neon_auth`, las pruebas manuales del criterio anterior y que `0006` debe estar en `production` **antes** de mergear o desplegar la Fase 3 (la que publica el formulario; hasta entonces ningún código llama a `createWebLead`).
- [ ] (F1) `npx vitest run`, `npm run lint` y `npm run build` sin errores.

### Fase 2 — Envío protegido en el servidor
- [ ] (F2) Dado `lib/env.ts`, entonces `getTurnstileSecret()` devuelve la clave válida y, si falta o no cumple el formato, lanza `"Invalid environment fields: TURNSTILE_SECRET_KEY"` sin el valor; `getTurnstileSiteKey()` devuelve la clave válida o `null` (ausente o inválida). Ninguno se evalúa al importar; `getEnv()` no cambia (unit test).
- [ ] (F2) Dado `wrangler.jsonc`, entonces `vars` incluye `TURNSTILE_SITE_KEY` y no hay ningún secreto; `cloudflare-env.d.ts` se regenera con `npm run cf-typegen`; `.env.example` y `.dev.vars.example` añaden `TURNSTILE_SITE_KEY=` y `TURNSTILE_SECRET_KEY=` vacíos con su comentario.
- [ ] (F2) Dado `webLeadFormSchema`, entonces normaliza nombre, teléfono y correo como el CRM, acepta los tres destinos y `consent: "on"`, y rechaza con error en su campo y sin repetir lo escrito: nombre de 1 carácter, teléfono sin `+`, correo vacío o inválido, destino desconocido, sin consentimiento, `idempotencyKey` no UUID y `turnstileToken` vacío o > 2048. Descarta claves extra (`source`, `ownerUserId`, `consentVersion`) (unit test).
- [ ] (F2) Dado `verifyTurnstileToken` con `fetch` simulado, entonces envía un único `POST` form-urlencoded a la URL de Siteverify solo con `secret` y `response`, y devuelve (unit test):
  - `ok` con `success`, hostname y action esperados;
  - `invalid` con `success: false` (p. ej. `timeout-or-duplicate`), hostname distinto o action distinta;
  - `unavailable` con `fetch` rechazado o abortado por timeout, HTTP 500, JSON inválido o con forma inesperada, o códigos de configuración/internos.
- [ ] (F2) Dada `submitLeadAction` llamada directamente con `FormData` (mocks de `@/lib/env`, Siteverify y `@/modules/crm`), entonces (unit test):
  - más de 16 KiB o una entrada `File` → `too_large`, sin Siteverify ni `createWebLead`;
  - campos inválidos → `invalid_input` con `fieldErrors` solo de los campos visibles, sin Siteverify;
  - sin token → `turnstile`, sin Siteverify;
  - secreto o entorno inválidos → `unavailable`, sin Siteverify;
  - Siteverify `invalid` → `turnstile`; `unavailable` → `unavailable`; en ambos casos no llama a `createWebLead`;
  - Siteverify recibe `expectedHostname = new URL(APP_ORIGIN).hostname` y `expectedAction = "lead_submit"`;
  - válido → `createWebLead` con los datos normalizados, `santiago-2027` → `{ tripSlug: "maraton-santiago-2027", destinationName: "Maratón de Santiago 42K 2027" }` y la clave recibida, y estado `success`;
  - `createWebLead` devuelve `"conflict"` → `conflict`; lanza → `unavailable` y `console.error` solo con el texto fijo (sus argumentos no contienen nombre, correo, teléfono ni token);
  - ningún estado devuelto contiene lo escrito ni el token.
- [ ] (F2) Lint, tests y build sin errores; `npm run build:worker` en Linux/WSL y tamaño del Worker medido y registrado (procedimiento de `crm-leads-pipeline.md`, "Tamaño del Worker").

### Fase 3 — Formulario, widget y operación
- [ ] (F3) Dado `/contacto` con clave pública configurada, entonces veo el formulario con Nombre, Correo, WhatsApp, Destino, el consentimiento `web-form-v1` con el enlace "Cómo usamos tus datos" a `/privacidad`, el widget de Turnstile y el botón "Enviar mi consulta". No aparecen "VISTA DE DEMOSTRACIÓN", "La consulta no se envía desde esta demostración." ni "Copiar consulta".
- [ ] (F3) Dado `ContactForm` con la acción simulada, entonces (unit test):
  - al enviar llama a la acción con un `FormData` que incluye los campos y un `idempotencyKey` UUID;
  - mientras espera, el botón dice "Enviando…" y está deshabilitado;
  - con `success`, el formulario se sustituye por "Recibimos tu consulta." y el enlace secundario "Abrir WhatsApp" (`buildWhatsAppUrl` + `buildInquiryMessage` con lo enviado);
  - con `invalid_input`, cada error aparece bajo su campo con `aria-invalid`, y lo escrito se conserva;
  - un reintento sin cambios reutiliza la misma clave; tras editar un campo o tras `conflict`, la clave es nueva;
  - con `turnstile`, `unavailable` o `conflict`, aparece su mensaje (con `unavailable`, también el enlace a WhatsApp) y el widget se vuelve a montar;
  - sin clave pública: aviso "El formulario no está disponible en este momento…", enlace a WhatsApp y botón deshabilitado.
- [ ] (F3) Dado `/privacidad`, entonces veo el título "Privacidad", al responsable (Carreras Viajeras), el enlace `mailto:` a `Contacto@mazproducciones.com`, qué datos se guardan, para qué, los canales (WhatsApp y correo), quién los ve y cómo pedir acceso, rectificación o cancelación por ese correo; la página tiene `metadata.title = "Privacidad"` y se genera estática en `npm run build` (sin `searchParams` ni consultas).
- [ ] (F3) Dado `TurnstileWidget` con `window.turnstile` simulado, entonces renderiza con `sitekey`, `action` y `response-field-name` recibidos, y al desmontarse llama a `turnstile.remove` (unit test).
- [ ] (F3) Dado el README, entonces documenta:
  - los dos widgets que crea el usuario: producción (hostname `carreras-viajeras.mentec.dev`; clave pública en `wrangler.jsonc` y secreto con `npx wrangler secret put TURNSTILE_SECRET_KEY`) y desarrollo (hostname `localhost`; su clave pública y su secreto van en `.env.local` y `.dev.vars`, nunca en el repositorio);
  - que el hostname se valida contra `new URL(APP_ORIGIN).hostname` (`localhost` con `npm run dev`; `carreras-viajeras.mentec.dev` en producción);
  - las claves de prueba de Cloudflare ("siempre pasa", "siempre falla") solo como apoyo para verificar el rechazo, comprobadas antes contra la doc oficial;
  - la checklist de punta a punta (rama de desarrollo y después producción). `n8n/README.md` indica cuándo activar el workflow de producción y que el enlace `/crm/leads/<id>` abre la ficha (`app/crm/(protected)/leads/[id]/page.tsx`).
- [ ] (F3, manual del usuario) Checklist de punta a punta en una rama de desarrollo de Neon con `npm run dev`, `APP_ORIGIN=http://localhost:3000` y las claves del widget de `localhost`:
  - [ ] envío válido → aparece en `/crm/leads` primero, en "Nuevo", con Responsable "Sin asignar" y Origen "Formulario web"; la ficha muestra nombre, correo, WhatsApp, interés y consentimiento `web-form-v1`;
  - [ ] `automation_events` tiene un `lead.created` `pending` con ese `lead_id`; con n8n activo llega el correo de prueba y su enlace abre la ficha (con sesión de staff);
  - [ ] doble clic o reintento tras cortar la red → un solo lead y un solo evento;
  - [ ] token rechazado (secreto de prueba "siempre falla", verificado antes contra la doc oficial) → mensaje de verificación y nada insertado.
- [ ] (F3, manual del usuario) Checklist de producción, tras aprobar el despliegue, con `0006` aplicada, el widget de producción y el workflow de n8n activo:
  - [ ] un único envío real desde `https://carreras-viajeras.mentec.dev/contacto` con los datos del usuario → aparece en `/crm/leads` como "Sin asignar" / "Formulario web";
  - [ ] llega el correo al equipo y su enlace abre la ficha;
  - [ ] en la ficha, el lead se marca como "Perdido" con el motivo "Prueba interna". No se crean más datos de prueba en `production`.
- [ ] (F3) Lint, tests y build sin errores; Worker medido.

## Diseño técnico

### Decisiones
- **Server Action, no ruta API.** El formulario es de la propia app y la acción ya tiene la protección CSRF de Next (Origin = Host). El patrón `onSubmit` + `startTransition` conserva lo escrito sin devolverlo. No hay consumidores externos que justifiquen `app/api/leads`.
- **`createWebLead` vive en `modules/crm`**: es dueño de `leads`/`lead_activities` y ya tiene `createLead`. La landing solo conoce su `DestinationId` y lo traduce a `{ tripSlug, destinationName }`; el CRM no importa nada de `modules/landing` (SETUP §1, regla 5). Por eso el schema del formulario (`webLeadFormSchema`) vive en la landing y reutiliza los subschemas exportados por el CRM, en vez de un `webLeadSchema` en el CRM que necesitaría `DestinationId`.
- **Mapa de destinos en la landing** (`DESTINATION_TRIP_SLUGS` en `inquiry.ts`) en lugar de cambiar los valores del `<select>` y de `?destino=` al slug del catálogo (lo proponía `crm-leads-pipeline`, Pregunta 10): no rompe enlaces existentes y el `trip_id` sigue resolviéndose en el servidor por slug publicado.
- **Idempotencia sin leer el código de error.** El batch no se precomprueba: si falla, se lee la fila por la clave (Requisito 5). Así se cubren la repetición, la carrera entre dos envíos (la segunda espera al commit de la primera y falla por la `UNIQUE`) y la respuesta perdida tras un commit, sin depender de cómo el driver HTTP envuelve los errores de PostgreSQL. Coste: una lectura del viaje antes del batch y, solo en repeticiones, una lectura por clave.
- **Primera asignación de responsable** (para `crm-leads-pipeline` F3): se registra como `owner_changed` con `owner_from = NULL`. Se relaja `lead_activities_owner_chk` en `0006` en lugar de añadir un valor al enum (KISS; sin `ALTER TYPE`).
- **Turnstile sin dependencias:** script oficial `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` con `next/script` y un tipo mínimo de `window.turnstile` declarado en el componente. shadcn no tiene un componente de captcha/Turnstile (`npx shadcn@latest search @shadcn -q turnstile` y `-q captcha`: sin resultados).
- **CSP:** no hay `headers()` en `next.config.ts`, ni `proxy.ts`/`middleware.ts`, ni cabeceras CSP en el repo; nada bloquea el script ni el iframe de `challenges.cloudflare.com`. Si en el futuro se añade una CSP, debe permitir `script-src` y `frame-src https://challenges.cloudflare.com`.
- **Turnstile en local con un widget propio** (decisión del usuario): un segundo widget con hostname `localhost`, cuyas claves van en `.env.local`/`.dev.vars`. Así la misma validación (`hostname === new URL(APP_ORIGIN).hostname`) funciona en desarrollo sin bypass. Las claves de prueba de Cloudflare solo se usan para comprobar el rechazo.
- **`/privacidad` como Server Component estático** en `modules/landing/components/PrivacyPolicy.tsx` (no existe nada parecido en el proyecto ni en shadcn: es texto). La ruta solo compone, como `/contacto`.
- **`npm run preview`** usa `APP_ORIGIN` de producción con el Worker en `localhost:8787`: el hostname de Siteverify no coincidirá y el envío dará `turnstile`. Es esperado (preview es solo una prueba de vida); la prueba de envío se hace con `npm run dev` (widget de `localhost`) y en producción.

### Base de datos: `lib/db-schema.ts` (modificar, F1)
| Cambio | Definición |
|---|---|
| `leads.owner_user_id` | quita `.notNull()` (sigue la FK a `profiles`, `restrict`) |
| `leads.created_by` | quita `.notNull()` |
| `leads.idempotency_key` | `uuid`, nullable; `uniqueIndex("leads_idempotency_key_uq")` (los `NULL` de los leads manuales no chocan) |
| `leads.request_hash` | `text`, nullable |
| CHECK `leads_owner_chk` | `owner_user_id IS NOT NULL OR source = 'web_form'` (el alta manual siempre tiene responsable) |
| CHECK `leads_created_by_chk` | `(created_by IS NULL) = (source = 'web_form')` |
| CHECK `leads_idempotency_chk` | `CASE WHEN source = 'web_form' THEN idempotency_key IS NOT NULL AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$' ELSE idempotency_key IS NULL AND request_hash IS NULL END` (el `IS NOT NULL` explícito es necesario: en un CHECK, `NULL ~ …` pasa) |
| `lead_activities.actor_user_id` | quita `.notNull()` |
| CHECK `lead_activities_actor_chk` | `actor_user_id IS NOT NULL OR type = 'created'` |
| CHECK `lead_activities_owner_chk` (reemplaza) | `CASE WHEN type = 'owner_changed' THEN owner_to IS NOT NULL AND owner_from IS DISTINCT FROM owner_to ELSE owner_from IS NULL AND owner_to IS NULL END` |
| `automation_events.lead_id` | `.references(() => leads.id, { onDelete: "restrict" })`; se actualiza el comentario "no FK in this phase" |

Coherencia con los CHECK existentes: `leads_next_action_chk`, `leads_lost_reason_chk` y `leads_archived_chk` no dependen del responsable ni del creador, así que siguen siendo válidos con `NULL`. Las filas existentes cumplen los CHECK nuevos (los leads manuales tienen responsable, creador y clave nula). La FK nueva falla si hay eventos huérfanos: el README exige comprobarlo antes (en desarrollo, limpiar el seed). No hace falta GRANT (`DATABASE_URL` usa el rol owner).

Migración: `npm run db:generate` → `drizzle/0006_<nombre>.sql`, `drizzle/meta/0006_snapshot.json` y `drizzle/meta/_journal.json`. Orden: después de `0005`; la aplica el usuario a mano.

### Módulo `crm` (F1)
- `schemas/leads.schema.ts`: extrae y exporta `leadFullNameSchema` (trim, 2–120), `leadPhoneSchema` (el `phoneSchema` actual) y `leadEmailSchema` (trim, minúsculas, `z.email()`, ≤ 254, mensaje "Introduce un correo válido."). `createLeadSchema` usa `leadFullNameSchema`, `leadPhoneSchema` y `blankToNull(leadEmailSchema)`.
- `types/leads.types.ts`:
  ```ts
  export type WebLeadInput = {
    fullName: string;          // ya normalizado por leadFullNameSchema
    phone: string;             // E.164
    email: string;             // minúsculas
    interest: { tripSlug: string; destinationName: string };
    idempotencyKey: string;    // uuid
  };
  // Cambios por la migración 0006:
  // LeadListFilters.owner?: "mine" | "unassigned" | string
  // LeadListItem.owner: { userId: string; email: string; active: boolean } | null   // null = "Sin asignar"
  ```
- `utils/webLeadHash.ts` (puro, sin `server-only`): `webLeadRequestHash(input: { fullName; phone; email; tripSlug; destinationName; consentVersion }): Promise<string>`. Calcula `crypto.subtle.digest("SHA-256", …)` del `JSON.stringify` de un array con los seis valores en ese orden y lo devuelve en hex en minúsculas.
- `services/leads.service.ts`:
  ```ts
  export const WEB_FORM_CONSENT_VERSION = "web-form-v1"; // cambiar el texto del consentimiento exige una versión nueva
  export async function createWebLead(input: WebLeadInput): Promise<{ id: string } | "conflict">;
  //  1) SELECT trips.id WHERE slug = interest.tripSlug AND status = 'published' LIMIT 1
  //  2) id = crypto.randomUUID(); requestHash = webLeadRequestHash({...})
  //  3) db.batch([
  //       db.insert(leads).values({ id, fullName, phone, email, tripId, destinationText, source: "web_form",
  //         consentVersion: WEB_FORM_CONSENT_VERSION, idempotencyKey, requestHash }),
  //       db.insert(leadActivities).values({ leadId: id, type: "created" }),
  //       leadCreatedEventInsert(db, { leadId: id, tripSlug: trip ? interest.tripSlug : null, source: "landing_contact" }),
  //     ])
  //  4) catch: SELECT id, request_hash FROM leads WHERE idempotency_key = $key → { id } | "conflict" | throw
  ```
  `getLeadList`: `innerJoin(profiles)` → `leftJoin(profiles, eq(profiles.userId, leads.ownerUserId))`; la fila sin responsable se mapea a `owner: null`; `owner === "unassigned"` → `isNull(leads.ownerUserId)` en la página y en el embudo. Sin más cambios.
- `index.ts` (nuevo; el módulo aún no tenía API pública): `createWebLead`, `leadFullNameSchema`, `leadPhoneSchema`, `leadEmailSchema` y el tipo `WebLeadInput`. `crm-leads-pipeline` F2 lo amplía. Solo se importa desde código de servidor: exporta services `server-only`.

### Módulo `landing` (F2 y F3)
- `utils/inquiry.ts` (modificar, F2; sin `server-only`, lo importa el cliente):
  - `DESTINATION_TRIP_SLUGS: Record<DestinationId, string>` (Requisito 4) y exportar `DESTINATION_NAMES` (hoy es privado);
  - `LEAD_TURNSTILE_ACTION = "lead_submit"` y `LEAD_TURNSTILE_FIELD = "turnstileToken"`: constantes compartidas por el widget (cliente) y el schema (servidor).
- `schemas/lead.schema.ts` (nuevo, F2; solo lo importa el servidor, porque arrastra `@/modules/crm`):
  ```ts
  export const MAX_LEAD_FORM_BYTES = 16 * 1024;
  export const webLeadFormSchema = z.object({
    fullName: leadFullNameSchema,
    phone: leadPhoneSchema,
    email: leadEmailSchema,
    destination: z.enum(DESTINATION_IDS, { error: "Elige un destino." }),
    consent: z.literal("on", { error: "Para enviar la consulta, acepta el uso de tus datos." }),
    idempotencyKey: z.uuid(),
    turnstileToken: z.string().min(1).max(2048),
  });
  ```
- `types/lead.types.ts` (nuevo, F2):
  ```ts
  export type WebLeadForm = z.output<typeof webLeadFormSchema>;
  export type LeadSubmitState =
    | { status: "idle" }
    | { status: "success"; message: string }
    | {
        status: "error";
        code: "invalid_input" | "too_large" | "turnstile" | "conflict" | "unavailable";
        message: string;
        fieldErrors?: Partial<Record<"fullName" | "phone" | "email" | "destination" | "consent", string[]>>;
      };
  ```
- `services/turnstile.service.ts` (nuevo, F2, `server-only`):
  ```ts
  export type TurnstileResult = "ok" | "invalid" | "unavailable";
  export async function verifyTurnstileToken(input: {
    token: string; secret: string; expectedHostname: string; expectedAction: string;
  }): Promise<TurnstileResult>;
  // fetch nativo (sin axios: es una llamada server-to-server a Cloudflare, no a la API propia),
  // AbortSignal.timeout(5000); respuesta validada con zod:
  // z.object({ success: z.boolean(), hostname: z.string().optional(), action: z.string().optional(),
  //            "error-codes": z.array(z.string()).default([]) })
  ```
- `actions/lead.actions.ts` (nuevo, F2, `"use server"`): `submitLeadAction(prev: LeadSubmitState, formData: FormData): Promise<LeadSubmitState>`, con el orden del Requisito 3 y estos mensajes:

  | Código | Mensaje |
  |---|---|
  | `success` | "Recibimos tu consulta. Te escribiremos pronto por WhatsApp o correo." |
  | `invalid_input` | "Revisa los campos marcados." (+ `fieldErrors` del schema) |
  | `too_large` | "La consulta es demasiado larga." |
  | `turnstile` | "No pudimos verificar que eres una persona. Espera a que termine la verificación y vuelve a enviar." |
  | `conflict` | "Tu consulta cambió durante el envío. Revisa los datos y vuelve a enviarla." |
  | `unavailable` | "No pudimos enviar tu consulta en este momento. Inténtalo en unos minutos o escríbenos por WhatsApp." |

  Errores de schema: si falla algún campo visible → `invalid_input` con `fieldErrors` solo de esos campos; si solo falla `turnstileToken` → `turnstile`; si solo falla `idempotencyKey` → `invalid_input` sin `fieldErrors`.
- `components/TurnstileWidget.tsx` (nuevo, F3, `"use client"`; no existe en shadcn ni en el proyecto, y solo lo usa la landing): props `{ siteKey: string; action: string; responseFieldName: string; className?: string }`.
  - Carga el script con `next/script` (`onReady`) y llama a `window.turnstile.render(container, { sitekey, action, "response-field-name": responseFieldName, "refresh-expired": "auto", size: "flexible" })`.
  - Si el script ya estaba cargado, renderiza al montar.
  - Al desmontar, `window.turnstile.remove(widgetId)`.
  - El token llega al `FormData` por el campo oculto que crea Turnstile dentro del `<form>`.
- `components/ContactForm.tsx` (modificar, F3): props `{ defaultDestination: DestinationId; siteKey: string | null }`.
  - Campos `fullName` (`autoComplete="name"`, `maxLength` 120), `email` (`maxLength` 254), `phone` y `destination` (mismas opciones y estilos), consentimiento nativo (`<input type="checkbox" name="consent">`, como hoy) con el texto `web-form-v1` y el enlace `next/link` "Cómo usamos tus datos" a `/privacidad` y `<TurnstileWidget key={attempt} … />` si hay `siteKey`.
  - `noValidate`; envío con `onSubmit` + `startTransition(() => formAction(formData))` y `useActionState`, como `InviteStaffForm`.
  - Clave en un `useRef<string | null>`: `onChange` del formulario la pone a `null`; al enviar, `??= crypto.randomUUID()` y `formData.set("idempotencyKey", …)`; con `conflict` vuelve a `null`. No se genera en el render, para no desajustar la hidratación.
  - Tras cada respuesta que no sea `success`, `attempt + 1` vuelve a montar el widget.
  - Botón "Enviar mi consulta" / "Enviando…" (deshabilitado si `pending` o sin `siteKey`).
  - Errores bajo cada campo (`<p id role="alert">`, `aria-invalid`, `aria-describedby`); el mensaje general, bajo el botón.
  - Con `success`, el formulario se sustituye por un bloque `role="status"` con el mensaje y el enlace "Abrir WhatsApp" (`buildWhatsAppUrl(WHATSAPP_NUMBER, buildInquiryMessage(lo enviado))`, si no es `null`). El mismo enlace aparece con `unavailable` y en el aviso sin `siteKey`.
- `components/PrivacyPolicy.tsx` (nuevo, F3, Server, solo presentación): el contenido del Requisito 11 con encabezados y párrafos y los tokens del tema, en la misma columna de diseño que `ContactSection`. El correo de contacto es una constante del componente (`PRIVACY_CONTACT_EMAIL`).
- `index.ts` (modificar, F3): exporta `PrivacyPolicy`.
- `app/privacidad/page.tsx` (nuevo, F3): `metadata` (`title: "Privacidad"`, `description`), y compone `SiteHeader`, `<main><PrivacyPolicy /></main>` y `SiteFooter`. Sin `searchParams`: estática.
- `components/ContactSection.tsx` (modificar, F3): quita el bloque "VISTA DE DEMOSTRACIÓN", lee `getTurnstileSiteKey()` (Server Component; `/contacto` ya es dinámica por `searchParams`) y lo pasa a `ContactForm`. `app/contacto/page.tsx` no cambia.

### Entorno (F2)
- `lib/env.ts`: `getTurnstileSecret()` (como `getAutomationApiToken()`) y `getTurnstileSiteKey(): string | null`, ambos con `z.string().regex(/^[0-9A-Za-z_-]{20,100}$/)`. Separados de `getEnv()` para que su ausencia solo afecte al formulario.
- `wrangler.jsonc` `vars`: `"TURNSTILE_SITE_KEY": "<clave pública del widget de producción>"`. El usuario crea el widget de producción (Managed, hostname `carreras-viajeras.mentec.dev`) y aporta la clave pública; si aún no existe al implementar, se deja `""` (el formulario muestra el aviso de no disponible) y el README indica rellenarla antes de desplegar.
- `.env.example` / `.dev.vars.example`: `TURNSTILE_SITE_KEY=` y `TURNSTILE_SECRET_KEY=` vacíos, con comentario (en local, las claves del widget de `localhost`; en producción, la pública en `vars` y la secreta como Cloudflare Secret). `scripts/strip-env-secrets.mjs` ya elimina del Worker los valores no `NEXT_PUBLIC_*` copiados de `.env*`: la producción usa `vars` y Secrets.
- `cloudflare-env.d.ts`: regenerado con `npm run cf-typegen` (CLAUDE.md).

### Contrato
Server Action (no hay API HTTP nueva):
```ts
// modules/landing/actions/lead.actions.ts
submitLeadAction(prev: LeadSubmitState, formData: FormData): Promise<LeadSubmitState>;
// FormData: fullName, email, phone, destination ("santiago-2027" | "rio" | "roma"), consent ("on"),
//           idempotencyKey (uuid), turnstileToken (≤ 2048). Claves extra: se ignoran.
```
Evento: sin cambios (`lead.created` v1, `{ leadId, tripSlug: string | null, source: "landing_contact" }`).

### Seed y documentación
- `scripts/sql/seed-automation-demo.sql` (F1): la tabla temporal añade los datos del lead ficticio. La carga inserta antes 4 leads `web_form` (`full_name` "Lead demo N", `phone` `+5190000000N`, `email` `demoN@example.com`, `destination_text` "Destino demo", `consent_version` `web-form-v1`, `idempotency_key` fijas con prefijo `de000000`, `request_hash = encode(sha256(convert_to('demo-N', 'UTF8')), 'hex')`) y su actividad `created`, con `ON CONFLICT DO NOTHING`. La limpieza borra reenvíos → eventos → actividades → leads de esos ids. Se actualiza la cabecera (requiere `0006`; no tocar el resto). Estos leads sirven también para probar la lista y la ficha del CRM en la rama de desarrollo.
- `README.md`: (F1) la lista de migraciones del apartado "Workers y migraciones" (pasan a ser siete) y la sección "Migración de la captura web (`0006`)" dentro de "Leads (CRM comercial)"; (F3) la sección "Formulario de contacto (Turnstile)", con el widget, las claves, los secretos y la checklist.
  - Desarrollo: widget de `localhost` creado por el usuario; su clave pública (`TURNSTILE_SITE_KEY`) y su secreto (`TURNSTILE_SECRET_KEY`) van en `.env.local` (`npm run dev`) y `.dev.vars` (Wrangler). Con `APP_ORIGIN=http://localhost:3000`, el hostname esperado es `localhost`.
  - Apoyo para verificar el rechazo (no para el flujo normal), según https://developers.cloudflare.com/turnstile/troubleshooting/testing/: clave de sitio que siempre pasa `1x00000000000000000000AA` y que siempre bloquea `2x00000000000000000000AB`; secretos que siempre pasan `1x0000000000000000000000000000000AA`, que siempre fallan `2x0000000000000000000000000000000AA` y de "token ya usado" `3x0000000000000000000000000000000AA`.
  - El agente de specs no pudo abrir la doc desde su entorno: el developer comprueba esos valores contra la doc oficial antes de escribirlos en el README; si no puede comprobarlos, no los documenta.
  - Producción: checklist con un único envío real del usuario, marcado después como "Perdido" con motivo "Prueba interna".
- `n8n/README.md` (F3): activar el workflow de producción solo con el formulario desplegado, `0006` aplicada y la checklist superada; `APP_BASE_URL=https://carreras-viajeras.mentec.dev`; el enlace `/crm/leads/<id>` coincide con la ruta de la ficha de `crm-leads-pipeline` F3. Se quita "El enlace abrirá la ficha cuando exista la vista de leads del CRM" en ambos README.

### Orden con `crm-leads-pipeline`
- Esta F1 va **antes** que `crm-leads-pipeline` F2 y F3: crea `modules/crm/index.ts`, la migración `0006` (responsable opcional y primera asignación) y el `leftJoin` de `getLeadList`.
- Esta F2 no comparte archivos con `crm-leads-pipeline` F2/F3: puede ir antes o después de ellas, pero no en la misma sesión que otra fase (builds).
- Esta F3 va **después** de `crm-leads-pipeline` F3: su checklist y la documentación de n8n necesitan la ficha `/crm/leads/<id>`.
- Orden recomendado: landing-lead-capture F1 → crm F2 → crm F3 → landing-lead-capture F2 → landing-lead-capture F3.

## Reutilización
- `leadCreatedEventInsert` (`@/modules/automation`), `getDb()`/`db.batch`, `lib/db-schema.ts`, `npm run db:generate` y el procedimiento manual de migraciones del README.
- Reglas de `createLeadSchema` (nombre, teléfono E.164, correo), extraídas como subschemas exportados en lugar de duplicarlas.
- `getLeadList` existente (se adapta, no se reescribe) y `LEAD_SOURCE_LABELS.web_form` = "Formulario web" (ya existe en `leadDisplay.ts`).
- `DESTINATION_IDS`, `DESTINATION_NAMES`, `parseDestinationId`, `WHATSAPP_NUMBER`, `buildInquiryMessage` y `buildWhatsAppUrl` de `modules/landing/utils/inquiry.ts`.
- Patrón `onSubmit` + `startTransition` de `InviteStaffForm`; patrón de getters diferidos de `lib/env.ts` (`getAutomationApiToken`); fake del cliente Neon HTTP de `leads.service.test.ts`.
- `SiteHeader` y `SiteFooter` de la landing para `/privacidad`, con la misma composición que `app/contacto/page.tsx`.
- shadcn ya instalados: `button` (`buttonVariants`), `input`, `label`, `native-select`. No se instala nada. Sin dependencias nuevas.

## Tests
- `modules/crm/schemas/leads.schema.test.ts` (F1, ampliar): subschemas (correo vacío, mayúsculas, > 254; teléfono; nombre); los casos actuales de `createLeadSchema` sin cambios.
- `modules/crm/utils/webLeadHash.test.ts` (F1): formato hex de 64, determinismo, sensibilidad a cada campo e independencia de la clave.
- `modules/crm/services/leads.service.test.ts` (F1, ampliar): casos de `createWebLead` del criterio (lectura del viaje, batch de 3 en orden, parámetros, viaje publicado o no, repetición con misma huella, `conflict`, relanzar sin fila, sin consola). El fake debe poder fallar solo en el `transaction` y responder después a la lectura por clave: se amplía `useFakeDb` en el propio test. `getLeadList`: `left join`, `owner: null` y `unassigned`, y se ajusta la aserción actual del `inner join`.
- `lib/env.test.ts` (F2, ampliar): `getTurnstileSecret` (válida, ausente, corta, con espacios; el mensaje no contiene el valor) y `getTurnstileSiteKey` (válida, ausente → `null`, inválida → `null`).
- `modules/landing/schemas/lead.schema.test.ts` (F2): casos del criterio.
- `modules/landing/services/turnstile.service.test.ts` (F2, `fetch` con `vi.stubGlobal`): casos del criterio, incluidos el cuerpo exacto enviado y el timeout.
- `modules/landing/actions/lead.actions.test.ts` (F2; mocks de `server-only`, `@/lib/env`, `../services/turnstile.service` y `@/modules/crm`): casos del criterio, con espía de `console.error`.
- `modules/landing/components/ContactForm.test.tsx` (F3; mocks de `../actions/lead.actions` y `./TurnstileWidget`): casos del criterio.
- `modules/landing/components/TurnstileWidget.test.tsx` (F3; mock de `next/script` que invoca `onReady`, y `window.turnstile` simulado).
- `modules/landing/utils/inquiry.test.ts`: sin cambios; debe seguir pasando (el mapa nuevo son constantes).
- Sin unit test: `lib/db-schema.ts` (lo cubren la migración y la prueba manual), tipos, `ContactSection` (compone), `PrivacyPolicy` y `app/privacidad/page.tsx` (presentación estática), el seed SQL y los README (checklist manual).
- Atomicidad real, la `UNIQUE` con dos envíos simultáneos, la FK y el correo de n8n: checklist manual en la rama de desarrollo.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (el reviewer); F2 y F3 además miden el Worker con `npm run build:worker` en Linux/WSL.

### Fase 1 — Datos, migración y service (5 tareas, 14 archivos: 2 generados por drizzle-kit)
- [x] T1 — Schema y migración `0006`: cambios de `lib/db-schema.ts`, `npm run db:generate`, revisión del SQL (criterio F1) y, si hay PostgreSQL local, la cadena `0000`–`0006` · archivos: `lib/db-schema.ts`, `drizzle/0006_*.sql` (generado), `drizzle/meta/0006_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — Subschemas exportados, tipos (`WebLeadInput`, `owner` nulo, `unassigned`) y huella, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/webLeadHash.ts`, `modules/crm/utils/webLeadHash.test.ts` · depende de: T1 · paralelo (con T5)
- [x] T3 — `createWebLead` y `getLeadList` con responsable opcional, con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T2 · secuencial
- [x] T4 — API pública del módulo · archivos: `modules/crm/index.ts` (nuevo) · depende de: T3 · secuencial
- [x] T5 — Seed del outbox con leads ficticios y README de la migración `0006` · archivos: `scripts/sql/seed-automation-demo.sql`, `README.md` · depende de: T1 · paralelo (con T2)

### Fase 2 — Envío protegido en el servidor (4 tareas, 14 archivos)
Requisito previo: Fase 1 cerrada.
- [ ] T1 — Entorno de Turnstile · archivos: `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.dev.vars.example`, `wrangler.jsonc`, `cloudflare-env.d.ts` (`npm run cf-typegen`) · depende de: Fase 1 · secuencial (base, `lib/`)
- [ ] T2 — Mapa de destinos, constantes de Turnstile, schema y tipos del formulario, con test · archivos: `modules/landing/utils/inquiry.ts`, `modules/landing/schemas/lead.schema.ts`, `modules/landing/schemas/lead.schema.test.ts`, `modules/landing/types/lead.types.ts` · depende de: T1 · paralelo (con T3)
- [ ] T3 — Verificación Siteverify con test · archivos: `modules/landing/services/turnstile.service.ts`, `modules/landing/services/turnstile.service.test.ts` · depende de: T1 · paralelo (con T2)
- [ ] T4 — `submitLeadAction` con tests; medir el Worker · archivos: `modules/landing/actions/lead.actions.ts`, `modules/landing/actions/lead.actions.test.ts` · depende de: T2, T3 · secuencial

### Fase 3 — Formulario, widget, privacidad y operación (4 tareas, 10 archivos)
Requisito previo: Fase 2 cerrada y `crm-leads-pipeline` F3 cerrada (ficha `/crm/leads/<id>`). Antes de mergear o desplegar esta fase: `0006` aplicada en `production` y los widgets de Turnstile creados (clave pública de producción en `wrangler.jsonc` y secreto cargado).
- [ ] T1 — Página `/privacidad` · archivos: `modules/landing/components/PrivacyPolicy.tsx`, `modules/landing/index.ts`, `app/privacidad/page.tsx` · depende de: Fase 2 · secuencial (base: `index.ts` del módulo)
- [ ] T2 — `TurnstileWidget` con test · archivos: `modules/landing/components/TurnstileWidget.tsx`, `modules/landing/components/TurnstileWidget.test.tsx` · depende de: T1 · paralelo (con T4)
- [ ] T3 — Nuevo `ContactForm` (con el enlace a `/privacidad`) y `ContactSection` sin textos de demo, con test; medir el Worker · archivos: `modules/landing/components/ContactForm.tsx`, `modules/landing/components/ContactForm.test.tsx`, `modules/landing/components/ContactSection.tsx` · depende de: T2 · secuencial
- [ ] T4 — Documentación operativa: widgets de producción y `localhost`, secretos, checklist de desarrollo y de producción, activación de n8n · archivos: `README.md`, `n8n/README.md` · depende de: T1 · paralelo (con T2 y T3)

## Preguntas abiertas
Todas resueltas por el usuario (2026-10-25):
1. **Consentimiento `web-form-v1`:** se usa el texto propuesto, y se añade la página `/privacidad` (Requisito 11), enlazada desde la casilla, con texto sencillo que el usuario puede revisar.
2. **Widgets de Turnstile:** el usuario crea el de producción (`carreras-viajeras.mentec.dev`) y uno adicional para `localhost`. Las claves de este último van en `.env.local`/`.dev.vars`; el hostname se valida contra `new URL(APP_ORIGIN).hostname`. Las claves de prueba de Cloudflare solo sirven de apoyo para verificar el rechazo, comprobadas antes contra la doc oficial.
3. **Prueba en producción:** un único envío real con los datos del usuario, que después se marca en el CRM como "Perdido" con motivo "Prueba interna" (checklist de producción de F3).
4. **Destinos no publicados (Río, Roma):** aceptado que el correo diga "Nuevo lead sin viaje"; no hay evento v2.
5. **Primera asignación:** `owner_changed` "Sin asignar → persona" (`owner_from = NULL`), sin tipo nuevo; un lead asignado se puede reasignar, pero no vuelve a "Sin asignar" (`crm-leads-pipeline`, Requisito 5).
