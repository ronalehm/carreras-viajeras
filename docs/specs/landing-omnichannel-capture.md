# Captación omnicanal: registro por carrera, campañas (QR y enlaces) y modo stand

- Módulo: landing (también `crm`)
- Estado: aprobado
- Plan maestro (aprobado por el usuario): QR o enlace → landing de la carrera → registro → oferta → identidad → contrato → pago con Mercado Pago. **Esta spec es la primera de la Fase 1 del plan y solo cubre la captación omnicanal.** Lo siguiente lo cubren specs futuras: `trips-commercial-offers` (oferta, anticipo, PEN), `bookings-runner-self-service` (identidad y datos del corredor), `bookings-contract-acceptance` (contrato), `bookings-mercadopago` (pago) y `public-official-site-content` (contenido oficial, textos legales públicos e indexación).
- Base revisada: rama `claude/landing-omnichannel-capture` (apilada sobre el PR #26, `3a466f5`). Migraciones hasta `drizzle/0006_flashy_bastion.sql`. Worker medido en 1574.32 KiB gzip (`3a466f5`). El rediseño visual del PR #27 (`landing-home-redesign.md`, aprobada) está en `origin/main` (`66ffae1`). Desde `0b29034`, esta rama lo incluye, porque se fusionó el PR #26 en `506320b`.
- Depende de:
  - `platform-neon-foundation.md` (aprobada): Workers Free con OpenNext, Neon con Drizzle `neon-http` (cada escritura es una sola sentencia CTE o un `db.batch`, sin transacciones interactivas), Turnstile en el servidor, idempotencia y outbox, y migraciones generadas en local y aplicadas a mano.
  - `crm-leads-capture.md` (aprobada; F1, F2, F3 y F5 implementadas): `createWebLead` (CTE única, `idempotency_key` + `submission_hash`), `verifyTurnstileToken`, `submitWebLeadAction`, `outbox_events` y `lead.created`.
  - `crm-journey-automation.md` (aprobada; F1–F6 implementadas): `leads.channel` (enum `lead_channel`), `origin_detail`, `utm_*`, `referred_by`, actividades sin autor, informe origen × etapa en `/crm`.
  - `trips-catalog.md` y `landing-race-pages.md` (aprobadas): `trips.slug`, `trips.status = 'published'`, `getCatalogTrip` y `/viajes/[slug]`.
  - `landing-home-redesign.md` (aprobada, en `origin/main`): tokens (`--night`, `--sky`, `--asphalt`, `--highlight`, `--font-display`), utilidad `display-title`, `text-display-*`, `SiteHeader` y `SiteFooter` rediseñados.

## Objetivo
El negocio quiere pasar de captar interesados a reservas pagadas. Hoy un corredor que ve un QR en un stand, una publicación de Instagram, TikTok o Facebook, o un enlace de un aliado, llega a una página sin formulario (la del viaje solo ofrece WhatsApp) o a `/contacto`, que sigue siendo una demo que no guarda nada. Además, el equipo no sabe qué QR o publicación trajo a cada persona, y un mismo corredor puede quedar duplicado.

Esta spec hace que:
- cada carrera publicada tenga su página de registro, `/viajes/<slug>/registro`, con un formulario corto, pensado para el móvil y protegido contra spam;
- cada QR o enlace sea una **campaña** del CRM con su canal, de modo que el lead quede atribuido a la carrera, al canal y a la campaña correctos, sin que un parámetro manipulado pueda alterar nada;
- una persona que se registra dos veces en la misma carrera no quede duplicada;
- el equipo pueda registrar corredores en un stand desde una tableta (modo stand) sin que los datos de uno queden a la vista del siguiente;
- `/contacto` deje de ser una demo y use el mismo formulario.

Usuarios: corredores (anónimos, casi siempre en el móvil), el equipo comercial en el stand y en el CRM (`commercial` y `admin`, con `leads.manage`) y el dueño del negocio (recibe los avisos de n8n por correo).

## Alcance
- Incluye:
  - (F1) Migración nueva: tabla `campaigns`, `leads.campaign_id`, `leads.marketing_opt_in_at`, tipo de actividad `re_registered` con `lead_activities.submission_id`. Ficha del lead con campaña, UTM y promociones; historial con "Volvió a registrarse". README de la migración.
  - (F2) Captura en servidor: texto legal versionado con marcador de la puerta P-L, schema del formulario con atribución (`?c=`, UTM, `ref`) y promociones, `createWebLead` ampliado (atribución, sin duplicados por correo y carrera, sin ventana por teléfono) y `submitWebLeadAction` ampliada.
  - (F3) Campañas en el CRM: lista, alta, cierre, enlace público, enlace del modo stand y QR descargable (SVG) en `/crm/campanas`.
  - (F4) Página pública `/viajes/[slug]/registro` (encabezado comercial mínimo, formulario, modo stand) y `/contacto` con el mismo formulario y selector de carrera. README: campañas, QR, modo stand y regla WAF.
  - Medición del tamaño del Worker al cerrar cada fase (umbral de consulta: 2 MiB gzip; límite Free: 3 MiB).
- No incluye:
  - Ofertas, precios, anticipo, PEN o cualquier bloque financiero en la página de registro → `trips-commercial-offers`.
  - Identidad, cuenta o contraseña del corredor, pasaporte, fecha de nacimiento, datos médicos, talla o contacto de emergencia → `bookings-runner-self-service`.
  - Contrato y su aceptación → `bookings-contract-acceptance`.
  - Reserva y pago → `bookings-mercadopago`.
  - Texto legal definitivo, política de privacidad pública, indexación (`robots` sigue `index: false` global) y contenido oficial del sitio → `public-official-site-content`. El texto legal lo aprueba el área legal (puerta P-L); esta spec solo deja el mecanismo versionado y un marcador.
  - Enlaces nuevos hacia el registro desde la portada o desde `/viajes/[slug]` (ver Pregunta abierta 2).
  - Aliados como entidad (el `ref` queda como texto en `referred_by` hasta la Fase 4 de aliados del plan).
  - Contar visitas, píxeles, cookies o almacenamiento propio en el navegador, PostHog (sigue desactivado) o cualquier analítica nueva.
  - Un evento de outbox nuevo para el registro repetido (Decisión 6) y cambios en la API privada de n8n o en su guía.
  - Fusionar leads existentes, detectar duplicados en el alta manual del CRM o por teléfono.
  - Reabrir, editar o borrar campañas; filtros de la lista de leads por campaña.
  - Cambiar `/viajes/[slug]`, la portada (`/`) o sus componentes (salvo heredar los tokens del PR #27).
  - Despliegues, migraciones remotas, DNS o Secrets: los hace el usuario.

## Requisitos
1. **Página de registro (F4).** `/viajes/<slug>/registro` responde 200 para un viaje publicado y 404 si el slug no es canónico, no existe o el viaje está en borrador o archivado (mismo `getCatalogTrip` que `/viajes/[slug]`). Muestra:
   - **Encabezado comercial mínimo**, solo con datos del catálogo: nombre (`title`), ciudad y país (`location`), fecha de la carrera (`raceDate`), distancias e imagen (si hay `imageUrl`). Sin precios, cupos, beneficios ni ninguna afirmación que no salga del catálogo.
   - **CTA principal** «Quiero correr esta maratón», que lleva al formulario de la misma página (`#registro`), y **CTA secundario** «Ver el paquete completo», que enlaza a `/viajes/<slug>`.
   - El formulario (Requisito 2) con la carrera fijada por la URL.
2. **Formulario (F4).** Un solo componente para el registro y para `/contacto`, mobile-first:
   - Una columna, legible y usable a 360 px sin scroll horizontal; campos de al menos 48 px de alto; teclado `email` en el correo y `tel` en WhatsApp.
   - Campos, en este orden: "Nombre y apellido" (2–80), "WhatsApp con código de país" (prellenado con `+51 `, ayuda "Incluye el código de país; Perú es +51."), "Correo electrónico" (los tres obligatorios); la carrera (oculta en el registro, selector en `/contacto`); el texto legal versionado con su casilla de aceptación (Requisito 5); la casilla **independiente y no premarcada** de promociones futuras, que no bloquea el envío; el widget de Turnstile; y el botón "Enviar mis datos".
   - No pide pasaporte, fecha de nacimiento, datos médicos, talla, contacto de emergencia, contraseña ni ningún otro dato.
   - Errores debajo de cada campo (`aria-invalid` + `aria-describedby`) y mensaje general en `role="alert"`; estado de carga ("Enviando…", botón deshabilitado); éxito en `role="status"`; ante un error, lo escrito se conserva para reintentar.
   - Ante `unavailable`, `verification_failed` o `trip_unavailable`, ofrece además "Escríbenos por WhatsApp" (`wa.me` con un texto fijo, sin datos personales).
3. **Atribución (F2, F3).**
   - **Campaña:** un QR o enlace es una fila de `campaigns` con un código corto único, una carrera (`trip_id`), un canal del enum `lead_channel` (cualquiera salvo `unknown`), un nombre, un evento o stand opcional, un estado (activa o cerrada) y quién la creó.
   - **Parámetros:** `?c=<código>`, `utm_source`, `utm_medium`, `utm_campaign` y `ref`. La página los pasa al formulario en campos ocultos y **el servidor los vuelve a validar**: solo una campaña **activa** y **de la misma carrera** se aplica (`campaign_id`, `channel` = el de la campaña y `origin_detail` = su evento o, si no tiene, su nombre). Una campaña cerrada, inexistente o de otra carrera se ignora sin error y el registro sigue.
   - **Sin campaña válida**, el lead queda con `channel = 'web'` (tráfico directo o no identificado; el comercial puede corregir el origen en la ficha, que lo registra en el historial). Los UTM no cambian el canal.
   - UTM normalizados como en `crm-journey-automation.md` (Requisito 3): recortados, en minúsculas, `[a-z0-9._~+-]{1,100}`; si no cumplen, `null` sin error. `ref` → `referred_by` con la misma normalización y 2–60 caracteres; `referral_permission` queda en `false`.
   - Los parámetros **nunca** otorgan privilegios, ni cambian precios, etapa, responsable, vía de entrada, consentimiento ni ningún otro campo: cualquier otra clave del formulario se descarta.
4. **Sin duplicados (F2).** `createWebLead` sigue siendo **una sola sentencia** CTE:
   - **Mismo envío repetido** (mismo `submissionId`) → el mismo resultado visible (éxito), sin escribir nada más. Con el mismo `submissionId` y datos distintos → `conflict` (como hoy).
   - **Misma persona y misma carrera:** si ya existe un lead **no archivado** con el mismo correo normalizado (recortado y en minúsculas) y la misma carrera (`trip_id`; en `/contacto` sin carrera del catálogo, el mismo `destination_text`), no se crea otro: se inserta en ese lead una actividad de sistema `re_registered` sin autor, con una nota fija que resume campaña, UTM, `ref`, versión del texto legal y la elección de promociones. **El lead existente no se modifica** (ni origen, ni campaña, ni UTM, ni consentimiento, ni promociones; Decisión 5). La respuesta es el mismo éxito: no revela si el correo ya existía.
   - **Nunca se fusiona ni se descarta solo por teléfono:** se elimina la ventana de 10 minutos por teléfono de `crm-leads-capture.md` (Requisito 4 y P3). Dos personas con el mismo teléfono y correos distintos crean dos leads.
   - **Eventos:** el lead nuevo emite `lead.created` con `{ "source": "web_form" }` (contrato sin cambios). El registro repetido no emite evento (Decisión 6).
5. **Texto legal versionado (F2, F4).** El texto informativo (base de tratamiento), el de la casilla de promociones y su versión viven en un único lugar (`lib/registrationConsent.ts`). El lead guarda `consent_version` = esa versión y `consented_at`. Hasta que el área legal apruebe el texto (puerta P-L):
   - el texto es un **marcador claramente identificado** ("[TEXTO PROVISIONAL – PENDIENTE DE APROBACIÓN LEGAL (P-L)]…") con la versión `registro-web-pendiente-pl`;
   - **la publicación en producción queda bloqueada en código:** con `NODE_ENV = "production"` y el marcador, la página no muestra el formulario sino "El registro en línea abrirá pronto. Mientras tanto, escríbenos por WhatsApp." con el enlace, y la acción responde `unavailable` sin verificar ni guardar nada (defensa en profundidad). En `npm run dev` funciona y el marcador se ve.
   - Sustituir el marcador por el texto aprobado es un cambio de un solo archivo (modo build): versión `registro-web-v1` e `isPlaceholder: false`. Una vez publicado, cualquier cambio del texto exige una versión nueva.
   - Promociones: si la casilla está marcada, el lead nuevo guarda `marketing_opt_in_at = now()`; si no, `NULL`. Desmarcada nunca bloquea el envío.
6. **Modo stand (F4).** `?modo=stand` en la página de registro (también combinable con `?c=` de una campaña con evento):
   - sin `SiteHeader`, `SiteFooter`, imagen ni CTA; solo el nombre de la carrera y el formulario, con campos y botón grandes;
   - `autoComplete="off"` en el formulario y en cada campo; nada se guarda en `localStorage`, `sessionStorage` ni cookies propias;
   - tras un envío correcto, el formulario se desmonta y se ve "Registro guardado. ¡Gracias!" (sin ningún dato del corredor) con el botón "Registrar a otra persona" (foco automático); al pulsarlo aparece un formulario nuevo y vacío, con un `submissionId` nuevo y el widget de Turnstile reiniciado;
   - `modo=stand` no da ningún privilegio y no cambia nada en el servidor.
7. **`/contacto` (F4).** Usa el mismo formulario, con un selector de carrera: los viajes publicados del catálogo (por fecha de carrera) y, después, los destinos sin catálogo de `lib/inquiryDestinations.ts` ("Río de Janeiro · Quiero novedades", "Roma · Quiero novedades"). `?destino=` preselecciona un slug publicado, `rio` o `roma`; el alias antiguo `santiago-2027` (que la portada de `main` aún usa) preselecciona `maraton-santiago-2027`; cualquier otro valor deja el selector en "Elige la carrera". Desaparecen los textos de demostración. Los parámetros `?c=`, UTM y `ref` se tratan igual que en el registro (una campaña solo se aplica si es de la carrera elegida). Sin modo stand.
8. **Visitas frente a registros.** Abrir una página, escanear un QR o seguir un enlace **no** crea lead ni escribe en la base: solo un envío válido lo hace. La única medición nueva es el número de registros (leads nuevos) por campaña en `/crm/campanas`, con la aclaración "Cuenta registros, no visitas."; el informe origen × etapa de `/crm` ya cuenta por canal. Las visitas no se miden en la app.
9. **Campañas en el CRM (F3).** Con `leads.manage` (página y acción comprueban el permiso; sin él, el texto de "No tienes permiso…" como en las demás páginas):
   - `/crm/campanas`: formulario "Nueva campaña" (código, nombre, viaje no archivado, canal, evento o stand opcional) y tabla con código, nombre, viaje, canal, evento, estado, registros y fecha de alta; las activas primero.
   - `/crm/campanas/<id>`: datos de la campaña, quién la creó y la cerró, el **enlace público** (`<APP_ORIGIN>/viajes/<slug>/registro?c=<código>`), el **enlace del modo stand** (`…&modo=stand`, solo para la tableta del equipo), el **QR del enlace público** y "Descargar QR (SVG)", y "Cerrar campaña" (con confirmación) si está activa. Una campaña cerrada no se reabre ni se borra.
   - Código: 3–32 caracteres, minúsculas, números y guiones (sin guion al principio, al final ni dos seguidos); único ("Ese código ya está en uso.").
10. **Privacidad y seguridad.**
    - Ningún dato personal llega a logs, a `Error.message` ni a respuestas; los logs siguen siendo de texto fijo (`"web lead: capture failed"`, `"turnstile: verification unavailable"`) y las acciones de campañas fallan con el error fijo `"campaign action failed"`, sin causa.
    - Secretos solo en el servidor. La única variable pública sigue siendo `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (ya existe en `.env.example` y en la guía de Turnstile del README).
    - Orden en la acción (sin cambios): tamaño y tipos del `FormData` (≤ 16 KiB, sin archivos) → honeypot `website` → registro abierto (Requisito 5) → schema → Turnstile (`action = "lead_submit"`, hostname de `APP_ORIGIN`) → `createWebLead`.
11. **Concurrencia.** Cada escritura es una sola sentencia y decide con su `WHERE` y los índices únicos (`idempotency_key`, `submission_id`, `campaigns.code`). Dos envíos **simultáneos** de la misma persona con `submissionId` distintos pueden crear dos leads: no hay índice único por correo y carrera porque los leads manuales existentes pueden repetirlo (mismo criterio documentado hoy para el teléfono). El doble clic y el reintento usan el mismo `submissionId` y sí quedan cubiertos.

## Criterios de aceptación

Fase 1 (modelo de datos, ficha e historial):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera solo una migración nueva (hoy `drizzle/0007_*.sql`; el número definitivo se fija **solo en el turno de merge**, renumerando si `main` ya tiene otra con ese número), más su snapshot y el journal, con: `ALTER TYPE "lead_activity_type" ADD VALUE 're_registered'`; `CREATE TYPE "campaign_status"`; la tabla `campaigns` con sus FK, CHECK e índices; en `leads`, `campaign_id` (FK, CHECK e índice parcial) y `marketing_opt_in_at`; en `lead_activities`, `submission_id` (índice único y CHECK) y los CHECK `lead_activities_actor_chk` y `lead_activities_body_chk` sustituidos. El SQL no contiene `neon_auth`, `CREATE SCHEMA`, `DROP TABLE`, `DROP TYPE` ni `DROP COLUMN`, ni cambios en `profiles`, `staff_*`, `trips`, `bookings` u `outbox_events`; los únicos `DROP` son los `DROP CONSTRAINT` de los dos CHECK sustituidos.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dada la migración aplicada en dos bloques después de `0006`, entonces la base acepta una campaña válida y un lead `web_form` con `campaign_id`, y rechaza: un código `AB`, `Mml26` o `-mml`; una campaña con canal `unknown`; un nombre de 1 o de 81 caracteres; una campaña `closed` sin `closed_at` o `active` con `closed_by`; dos campañas con el mismo código; un lead `whatsapp` con `campaign_id`; una actividad `re_registered` sin `submission_id` o sin texto; una `note` con `submission_id`; dos actividades con el mismo `submission_id`.
- [ ] (F1) Dado `leadActivityTypeSchema`, entonces incluye `re_registered` y sigue coincidiendo con `leadActivityTypeEnum.enumValues`; `LEAD_ACTIVITY_LABELS.re_registered` es "Volvió a registrarse" y `SYSTEM_ACTOR_LABELS.re_registered` es "Formulario web" (unit test). `blankToNull` se exporta sin cambiar su comportamiento.
- [ ] (F1) Dado el historial de un lead con una actividad `re_registered`, entonces veo "Volvió a registrarse", su nota y el autor "Formulario web", también si el lead se creó a mano por WhatsApp.
- [ ] (F1) Dado `getLeadById` con la base simulada, entonces devuelve `campaign: { id, code, name } | null` (LEFT JOIN `campaigns`) y `marketingOptInAt` (unit test). La tarjeta "Registro" de la ficha muestra "Campaña" ("<nombre> (<código>)" o "—"), "UTM" (lo que antes se llamaba "Campaña": los UTM unidos por " / " o "—") y "Promociones" ("Aceptó el <fecha>" o "No aceptó").
- [ ] (F1) Dado el README, entonces la sección "Migración de campañas y registro" explica revisar el SQL (`grep -inE 'neon_auth|create schema|drop (table|type|column|schema)'`), aplicarlo después de `0006` en **dos bloques** (1: solo el `ALTER TYPE … ADD VALUE 're_registered'`, confirmado; 2: el resto entre `BEGIN;` y `COMMIT;`), sin GRANT ni reaplicar migraciones, y las pruebas manuales del criterio anterior.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. Worker medido y registrado.

Fase 2 (captura en servidor):
- [ ] (F2) Dado `lib/registrationConsent.ts`, entonces `REGISTRATION_CONSENT.version` cumple `^[a-z0-9-]{1,40}$`, y con `isPlaceholder: true` `isRegistrationOpen()` es `false` con `NODE_ENV = "production"` y `true` en `development` y `test` (unit test).
- [ ] (F2) Dado `campaignFormSchema`, entonces acepta `{ code: " MML26 ", name, tripId, channel: "event", eventName: "" }` → código `mml26` y `eventName: null`; rechaza con error en su campo un código de 2 o 33 caracteres, con guion inicial o final, con `--` o con espacios; un nombre de 1 o 81; un `tripId` no UUID; `channel: "unknown"` o desconocido; un evento de 1 o 121; y descarta `status`, `createdBy` y `closedAt` (unit test).
- [ ] (F2) Dadas las utilidades de `leadAttribution.ts`, entonces `normalizeCampaignCode(" MML26 ")` → `"mml26"`, y `"ab"`, `"x y"` o 200 caracteres → `null`; `normalizeUtm("Instagram")` → `"instagram"` y `"<script>"`, `""` o 101 caracteres → `null`; `normalizeReferral("Club-Lima")` → `"club-lima"` y `"a"` → `null`; `reRegistrationNote` une solo las partes con valor con " · " (unit test).
- [ ] (F2) Dado `webLeadFormSchema` con los strings de un `FormData` válido, entonces devuelve `{ fullName, email, phone, destination, marketingOptIn, submissionId, turnstileToken, campaignCode, utmSource, utmMedium, utmCampaign, referredBy }` con el teléfono en E.164 y el correo en minúsculas; `marketing` ausente, `"off"` o `"yes"` → `false` y `"on"` → `true`, sin error; `c`, UTM y `ref` inválidos o ausentes → `null`, sin error; descarta `source`, `stage`, `channel`, `campaignId`, `ownerUserId`, `consentVersion` y `price`. Rechaza con error en su campo: nombre de 1 u 81, correo inválido, teléfono sin código de país, `destination` vacío o con espacios, sin `consent`, `submissionId` no UUID (unit test).
- [ ] (F2) Dado `createWebLead` con la base simulada, entonces (unit test):
  - ejecuta **una sola sentencia** (CTE) que, para un lead nuevo, inserta el lead, su actividad `created` y el evento `lead.created` con `{ "source": "web_form" }`;
  - pasa `source = 'web_form'`, la versión de `REGISTRATION_CONSENT`, `marketing_opt_in_at` solo si `marketingOptIn`, los UTM y `referred_by`, y nunca `stage`, responsable ni autor;
  - resuelve la campaña solo si está `active` y es del viaje publicado del slug; sin campaña válida, `channel = 'web'`;
  - con `rio` o `roma` envía `destination_text` ("Río de Janeiro", "Roma") sin slug; con otro valor, lo resuelve como slug de un viaje publicado;
  - busca la misma persona por `email`, carrera y `archived_at IS NULL`, nunca por teléfono, y en ese caso inserta `re_registered` con `submission_id` y la nota, sin tocar `leads`;
  - devuelve `"created"`, `"existing"`, `"duplicate"` (misma clave y hash, clave ya usada en un registro repetido o carrera concurrente), `"conflict"` (misma clave, hash distinto) o `"unknown_trip"` (slug no publicado) según la fila devuelta;
  - el `submission_hash` depende de nombre, correo, teléfono, destino y promociones, no de la atribución.
- [ ] (F2) Dada `submitWebLeadAction` llamada directamente con `FormData` (mocks de los services, de `next/headers` y del texto legal), entonces (unit test):
  - con el registro cerrado (marcador y `production`) → `unavailable` sin llamar a Turnstile ni a la base;
  - `"created"`, `"existing"` y `"duplicate"` → el mismo `success` ("¡Listo! Recibimos tus datos. Te escribiremos por WhatsApp."); `"conflict"` → `conflict`; `"unknown_trip"` → `trip_unavailable` ("Esta carrera ya no está disponible para registrarse.");
  - siguen pasando los casos existentes (honeypot, límites, `invalid_input` con `fieldErrors`, Turnstile `invalid`/`unavailable`, excepción con log fijo, `cf-connecting-ip`, respuesta sin datos escritos).
- [ ] (F2) Lint, tests y build sin errores. Worker medido.

Fase 3 (campañas en el CRM):
- [ ] (F3) Dado un `commercial` en `/crm/campanas`, cuando creo la campaña `mml26` ("QR stand MML", viaje Santiago, canal "Feria, carrera o activación", evento "Media Maratón de Lima 2026"), entonces voy a `/crm/campanas/<id>` y veo el enlace `https://carreras-viajeras.mentec.dev/viajes/maraton-santiago-2027/registro?c=mml26` (con `APP_ORIGIN` de producción), el enlace del modo stand, el QR del enlace público y "Descargar QR (SVG)", que descarga `campana-mml26.svg`. El menú del CRM muestra "Campañas".
- [ ] (F3) Dado un código ya usado, entonces veo "Ese código ya está en uso." bajo el campo y se conserva lo escrito; un viaje archivado o inexistente → "Elige un viaje del catálogo.".
- [ ] (F3) Dada una campaña activa, cuando pulso "Cerrar campaña" y confirmo, entonces queda "Cerrada" con quién y cuándo la cerró, y desaparece el botón. Los leads que ya trajo conservan su campaña.
- [ ] (F3) Dada una cuenta sin `leads.manage` (rol futuro), entonces `/crm/campanas` y su detalle muestran el aviso de permiso y no consultan campañas; sin sesión, redirigen a `/crm/acceso`.
- [ ] (F3) Dado `campaigns.service.ts` con la base simulada, entonces (unit test): `listCampaigns` hace una sola consulta con viaje y conteo de leads, activas primero; `getCampaignById` devuelve `null` si no existe; `createCampaign` es una sola sentencia que solo inserta si el viaje no está archivado, con `created_by` del actor, y devuelve `{ id }`, `"code_taken"` o `"invalid_trip"`; `closeCampaign` solo cambia una campaña `active` (fija `closed_at` y `closed_by`) y devuelve `"closed"` o `"not_found"`.
- [ ] (F3) Dadas las acciones de campañas llamadas directamente (unit test): sin sesión → `unauthorized` y sin permiso → `forbidden`, sin llamar al service; datos inválidos → `invalid_input` con `fieldErrors` y los valores escritos; usan el id de la sesión e ignoran campos extra; si el service lanza → `"campaign action failed"` sin causa.
- [ ] (F3) Dado `campaignLinks("https://carreras-viajeras.mentec.dev", "maraton-santiago-2027", "mml26")`, entonces devuelve los dos enlaces del criterio anterior (unit test).
- [ ] (F3) Dado `package.json`, entonces `react-qr-code` figura como dependencia directa con la versión exacta `2.2.0` (la que ya resuelve el lockfile) y no aparece ningún otro paquete nuevo. Lint, tests y build sin errores. Worker medido, con el incremento atribuible al QR registrado.

Fase 4 (páginas públicas). Requisitos previos: Fases 2 y 3 cerradas; **la rama contiene el PR #27 de `origin/main`** (si no, el developer se detiene y lo consulta):
- [ ] (F4) Dada una campaña activa `mml26` (canal Feria, evento «Media Maratón de Lima 2026») de `maraton-santiago-2027` publicado, cuando escaneo su QR, se abre `/viajes/maraton-santiago-2027/registro?c=mml26`, relleno nombre, WhatsApp y correo, acepto el texto legal y envío, entonces veo el éxito y en el CRM aparece un lead "Nuevo", sin responsable, vía "Formulario web", viaje Santiago, origen "Feria, carrera o activación · Media Maratón de Lima 2026", campaña "QR stand MML (mml26)", con su actividad `created` y un evento `lead.created` `pending`.
- [ ] (F4) Dadas tres campañas activas de Santiago con canal Instagram, TikTok y Facebook, cuando me registro desde cada enlace (uno con `&utm_source=instagram&utm_medium=social&utm_campaign=preventa`), entonces cada lead queda con su canal y su campaña, y la ficha del primero muestra "UTM: instagram / social / preventa".
- [ ] (F4) Dado el mismo envío repetido (doble clic o reintento tras perder la respuesta), entonces existe un solo lead. Dado otro envío con el mismo correo (en otra forma de mayúsculas) a la misma carrera, entonces no hay lead nuevo y el existente tiene una actividad "Volvió a registrarse" con la campaña y la versión legal; la persona ve el mismo éxito. Con otro correo y el mismo teléfono, sí se crea otro lead.
- [ ] (F4) Dado un formulario sin correo, con un teléfono sin código de país o sin aceptar el texto legal, cuando envío, entonces veo el error bajo cada campo, lo escrito se conserva y no hay filas nuevas en `leads`, `lead_activities` ni `outbox_events`. Con Turnstile fallido, tampoco.
- [ ] (F4) Dado el HTML de la página y del `FormData` enviado, entonces solo hay los campos del Requisito 2 (más `submissionId`, el token de Turnstile, el honeypot `website` y los ocultos de atribución); no hay campos de pasaporte, nacimiento, salud, talla, emergencia ni contraseña.
- [ ] (F4) Dada la página a 360 px, entonces no hay scroll horizontal (`scrollWidth === clientWidth`), los campos están en una columna, el correo abre el teclado de correo y WhatsApp el numérico, y con el teclado se recorre todo en orden con foco visible.
- [ ] (F4) Dado que dejo sin marcar "promociones", entonces el envío funciona y el lead queda con `marketing_opt_in_at` nulo; marcada, con fecha. La casilla aparece siempre desmarcada.
- [ ] (F4) Dados un `?c=` de una campaña cerrada, uno inexistente y uno de otra carrera, entonces el registro funciona y el lead queda con `channel = 'web'` y sin campaña. Dado un `FormData` manipulado con `source=whatsapp`, `stage=paid`, `channel=event`, `campaignId=<uuid>`, `ownerUserId` o `price`, o un `?modo=stand`, entonces el lead se crea igual que sin ellos. Ningún parámetro cambia precios (la página no muestra ninguno).
- [ ] (F4) Dado `?modo=stand`, cuando registro a una persona, entonces veo "Registro guardado. ¡Gracias!" sin sus datos y, al pulsar "Registrar a otra persona", un formulario vacío, sin sugerencias de autocompletado del corredor anterior y con Turnstile listo; no hay cabecera ni pie del sitio. El hook lo cubre en unit test (formulario nuevo, `submissionId` renovado, sin `localStorage` ni `sessionStorage`).
- [ ] (F4) Dados `/viajes/borrador-x/registro`, `/viajes/archivado-y/registro`, `/viajes/no-existe/registro` y `/viajes/Maraton-Santiago-2027/registro`, entonces responden 404. Dado `/viajes/maraton-santiago-2027/registro`, entonces el encabezado muestra solo nombre, ciudad y país, fecha, distancias e imagen del catálogo, «Quiero correr esta maratón» lleva al formulario y «Ver el paquete completo» a `/viajes/maraton-santiago-2027`.
- [ ] (F4) Dado que abro la página con `?c=mml26` y salgo sin enviar, entonces no hay filas nuevas en ninguna tabla.
- [ ] (F4) Dado `/contacto?destino=santiago-2027`, entonces el selector muestra Santiago (alias); con `?destino=rio` o `roma`, sus opciones "· Quiero novedades"; sin `destino`, "Elige la carrera". Al enviar con Santiago, el lead queda con su `trip_id`; con Roma, `destination_text = 'Roma'`. Ya no aparecen "VISTA DE DEMOSTRACIÓN", "Los datos no se envían ni se guardan" ni "Preparar mi consulta".
- [ ] (F4) Dado `npm run build` + producción local con el marcador P-L, entonces `/viajes/<slug>/registro` y `/contacto` muestran "El registro en línea abrirá pronto…" con WhatsApp y no el formulario. En `npm run dev`, el formulario muestra el marcador "[TEXTO PROVISIONAL – PENDIENTE DE APROBACIÓN LEGAL (P-L)]".
- [ ] (F4) Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en el build, entonces el widget no se renderiza, el envío devuelve `verification_failed` y se ofrece WhatsApp.
- [ ] (F4) Dada la pestaña Red al enviar, entonces hay una única petición POST a la página (Server Action) más las de `challenges.cloudflare.com`; ninguna a otros dominios.
- [ ] (F4) Dada la página de registro, entonces usa los tokens y componentes del PR #27 (`bg-night`, `bg-sky`, `text-asphalt`, `bg-highlight`, `display-title`, `text-display-*`, `buttonVariants` con `rounded-full`, `SiteHeader` y `SiteFooter` de `main`) y no añade colores arbitrarios.
- [ ] (F4) Dado el README, entonces documenta: cómo crear una campaña, imprimir su QR y usar el enlace del modo stand; que el QR lleva al registro de su carrera y que cerrar la campaña no rompe el QR (deja de atribuir); que la publicación espera a P-L; y la regla WAF actualizada a `POST /contacto` y `POST /viajes/*/registro`, con un umbral que no bloquee un stand (un envío cada ~30 s desde la misma IP) ni a varios móviles tras la misma IP del operador.
- [ ] (F4) Lint, tests y build sin errores. Worker medido.

## Diseño técnico

### Decisiones
1. **Campañas en `modules/crm`.** Una campaña es atribución comercial de leads: la crean y cierran los comerciales con `leads.manage`, y la consume `createWebLead`, que ya vive en `crm`. Archivos propios (`campaigns.*`) para no mezclarla con `leads.*`.
2. **El servidor decide la atribución.** La página copia `c`, UTM y `ref` a campos ocultos, pero `createWebLead` resuelve la campaña en la misma CTE (`status = 'active'` y `trip_id` del viaje publicado) y toma el canal de la fila, nunca del navegador. No hay lista cerrada de slugs `?origen=` (la F7 de `crm-journey-automation.md` queda sustituida): crear un QR no exige desplegar.
3. **Sin campaña, `channel = 'web'`**, no `unknown`: el enum distingue "Web (sin otro origen conocido)" de "Desconocido", y la migración `0006` ya rellenó los `web_form` con `web`. Los UTM no deciden el canal para que una URL no pueda reclasificar un lead; el comercial corrige el origen en la ficha si hace falta (queda en el historial).
4. **Misma persona = correo normalizado + misma carrera + lead no archivado**, cualquier etapa. El correo identifica a la persona mejor que el teléfono (familias que comparten número, números mal escritos) y la carrera separa intereses distintos. Un lead archivado no cuenta (el equipo lo sacó del trabajo). Se elimina la ventana de 10 minutos por teléfono: descartaba en silencio a una segunda persona con el mismo número y contradice "nunca fusionar solo por teléfono".
5. **El registro repetido no pisa nada.** El origen, la campaña y los UTM del lead son el primer contacto y la medición por cohorte depende de ellos (`crm-journey-automation.md`, Decisión 5 y "No incluye": los puntos de contacto posteriores van en notas del historial). Por eso solo se añade una actividad `re_registered` con una nota fija. Tampoco cambian el consentimiento ni las promociones del lead existente: la nota registra la versión aceptada y la elección, y el comercial decide (incluido un lead con "Pidió no seguir", cuya reactivación sigue pendiente en la Pregunta 8 de `crm-journey-automation.md`).
6. **Sin evento de outbox para el registro repetido.** Es lo mínimo: no cambia el enum `outbox_event_type`, ni el contrato de la API de n8n, ni su guía; y evita correos duplicados al dueño del negocio, porque la mayoría de los repetidos son ruido (la persona se registró en el stand y luego escaneó el QR en casa). El lead ya está en el embudo y la actividad queda en su historial. Si más adelante se quiere un aviso, sería un tipo nuevo al final del enum en otra spec.
7. **Idempotencia del registro repetido con `lead_activities.submission_id`** (único): como no se crea lead, la clave del envío se guarda en la actividad para que un reintento no inserte otra. El conflicto "misma clave, datos distintos" solo se detecta para leads nuevos (en un registro repetido se responde `duplicate`).
8. **Promociones en el lead (`marketing_opt_in_at`), no en otra tabla:** una sola casilla independiente cuyo texto pertenece a la misma versión legal (`consent_version`). Sin envíos de promociones en esta spec (YAGNI).
9. **Bloqueo de producción por código, no por proceso:** el marcador P-L es una constante con `isPlaceholder`, y `isRegistrationOpen()` impide mostrar el formulario y guardar en `production`. Coste aceptado: `npm run preview` (que compila en `production`) tampoco permite enviar mientras siga el marcador.
10. **`/contacto` con el mismo formulario** (recomendación del usuario, adoptada): un solo componente evita mantener dos formularios con reglas de validación, Turnstile y consentimiento distintos (DRY, SOLID-O: la carrera fija o con selector es una prop). El selector lista el catálogo publicado, así una carrera nueva aparece sin tocar código; Río y Roma se mantienen porque la portada de `main` enlaza a ellas. Santiago sale de `lib/inquiryDestinations.ts` (ya viene del catálogo).
11. **Sin mensaje de WhatsApp preparado tras el éxito** (el de la demo, `buildInquiryMessage`): el lead ya está en el CRM y n8n prepara el borrador. WhatsApp queda como alternativa ante un error o con el registro cerrado, con un texto fijo sin datos personales.
12. **QR con `react-qr-code@2.2.0`**: no existe QR en shadcn (`npx shadcn@latest search @shadcn -q qr`: solo `questionnaire`) ni API nativa del navegador. El paquete ya está en `package-lock.json` como dependencia transitiva de `@neondatabase/auth` (`@neondatabase/auth-ui`), es MIT, pinta un `<svg>` sin efectos y depende solo de `qrcode-generator` (~52 KB sin comprimir). Se declara como dependencia directa con la misma versión exacta (no descarga nada nuevo) porque importar una dependencia transitiva sin declararla es frágil. Impacto en el Worker estimado en menos de 20 KiB gzip; se mide al cerrar la F3 y, si el total supera 2 MiB, se detiene y se consulta.
13. **La composición entre módulos vive en `app/`.** Las páginas importan `submitWebLeadAction` de `@/modules/crm` y se la pasan a las secciones de `landing` como prop, así `landing` no depende en tiempo de ejecución de `crm` (solo del tipo `WebLeadFormState`, importado como tipo desde la API pública).
14. **Estado del formulario en un hook (`useLeadCapture`)**: concentra lo que hay que probar (clave del envío, reintentos, limpieza del modo stand, reinicio de Turnstile) y deja el componente como presentación. El envío usa `onSubmit` + `startTransition` (no el `action` del `<form>`) para conservar lo escrito tras un error, como en los formularios existentes.
15. **Diseño visual del PR #27:** la página reutiliza sus tokens y componentes; no reutiliza `TripFacts` (el dorsal), cuyo tipo es la copia fija de la portada (`TripContent`) e incluye precio y cupos, que aquí no corresponden.
16. **Tamaño del Worker:** F1 y F2 solo modifican; F3 añade 2 páginas y el QR; F4 añade 1 página. La última tarea de cada fase ejecuta, en Linux/WSL y sin desplegar, `npm run build:worker` y `npx wrangler deploy --dry-run --outdir <scratch>`, y registra el gzip frente a 1574.32 KiB y al umbral de 2 MiB.

### Base de datos: `lib/db-schema.ts` (F1) → `drizzle/0007_*.sql` (número provisional; el definitivo se fija solo en el turno de merge)
Todo en `public`, snake_case. Los valores nuevos de enums existentes van al final.

| Objeto | Definición |
|---|---|
| enum `lead_activity_type` | añade `re_registered` (al final) |
| enum `campaign_status` (nuevo) | `active`, `closed` |
| `campaigns.id` | `uuid` PK `defaultRandom()` |
| `campaigns.code` | `text not null`; índice único `campaigns_code_uq`; CHECK `campaigns_code_chk`: `code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(code) BETWEEN 3 AND 32` |
| `campaigns.trip_id` | `uuid not null` → `trips.id` `ON DELETE RESTRICT`; índice `campaigns_trip_idx` |
| `campaigns.channel` | `lead_channel not null`; CHECK `campaigns_channel_chk`: `channel <> 'unknown'` |
| `campaigns.name` | `text not null`; CHECK `char_length BETWEEN 2 AND 80` |
| `campaigns.event_name` | `text`; CHECK `IS NULL OR char_length BETWEEN 2 AND 120` |
| `campaigns.status` | `campaign_status not null default 'active'` |
| `campaigns.created_by` | `text not null` → `profiles.user_id` `ON DELETE RESTRICT` |
| `campaigns.created_at` | `timestamptz not null default now()` |
| `campaigns.closed_at`, `closed_by` | `timestamptz`, `text` → `profiles.user_id`; CHECK `campaigns_closed_chk`: `(status = 'closed') = (closed_at IS NOT NULL) AND (closed_at IS NULL) = (closed_by IS NULL)` |
| `leads.campaign_id` | `uuid` → `campaigns.id` `ON DELETE RESTRICT`; CHECK `leads_campaign_chk`: `campaign_id IS NULL OR source = 'web_form'`; índice parcial `leads_campaign_idx (campaign_id) WHERE campaign_id IS NOT NULL` |
| `leads.marketing_opt_in_at` | `timestamptz` nulo (solo lo escribe la captura web, si la casilla independiente está marcada) |
| `lead_activities.submission_id` | `uuid`; índice único `lead_activities_submission_uq`; CHECK `lead_activities_submission_chk`: `(type = 're_registered') = (submission_id IS NOT NULL)` |
| `lead_activities_actor_chk` (sustituye) | `actor_user_id IS NOT NULL OR type IN ('created', 'automation', 're_registered')` |
| `lead_activities_body_chk` (sustituye) | como el actual, con `WHEN type IN ('automation', 're_registered') THEN body IS NOT NULL AND char_length(body) <= 500` en lugar de la rama de `automation` |

- `campaigns` se declara antes de `leads` en el archivo. Comentarios en el schema: qué es una campaña, que nunca se borra y que el canal y la campaña del lead son el primer contacto.
- **Aplicación manual en dos bloques** (README, F1): (1) solo `ALTER TYPE "public"."lead_activity_type" ADD VALUE 're_registered';`, confirmado; (2) el resto entre `BEGIN;` y `COMMIT;` (los CHECK nuevos usan `'re_registered'`, que PostgreSQL no permite usar en la misma transacción que lo añade). Orden global: `0000` → … → `0006` → esta.
- El developer revisa que drizzle-kit solo genere `DROP CONSTRAINT` + `ADD CONSTRAINT` para los dos CHECK sustituidos.

### Texto legal: `lib/registrationConsent.ts` (F2, nuevo, compartido)
Lo usan `crm` (versión en el servidor) y `landing` (texto en el formulario): SETUP §1, regla 5.
```ts
// Versioned legal text of the web registration. The legal area approves it (gate P-L).
// Replacing the placeholder: version "registro-web-v1" and isPlaceholder false (build mode, one file).
export const REGISTRATION_CONSENT = {
  version: "registro-web-pendiente-pl",
  isPlaceholder: true,
  privacyText: "[TEXTO PROVISIONAL – PENDIENTE DE APROBACIÓN LEGAL (P-L)] Acepto que Carreras Viajeras use mis datos (nombre, WhatsApp y correo) para contactarme sobre esta carrera.",
  marketingText: "[TEXTO PROVISIONAL – P-L] Quiero recibir novedades y promociones de futuros viajes de Carreras Viajeras.",
} as const;

// false in production while the text is a placeholder: no form, no save.
export function isRegistrationOpen(): boolean;
```
El texto definitivo debe cubrir también a los encargados que ya tratan los datos (n8n en la computadora del usuario, su proveedor de correo y Gemini, que solo recibe el nombre de pila y el viaje; `crm-leads-capture.md`, Requisito 6).

### Destinos sin catálogo: `lib/inquiryDestinations.ts` (F2, modificar)
`INQUIRY_DESTINATION_IDS = ["rio", "roma"]` e `INQUIRY_DESTINATIONS: Record<InquiryDestinationId, { name: string }>`; se eliminan la entrada de Santiago, `tripSlug` y `DEFAULT_INQUIRY_DESTINATION` (Santiago viene del catálogo).

### Captura (`modules/crm/`, F2)
- `schemas/campaigns.schema.ts` (sin `server-only`):
  ```ts
  export const campaignCodeSchema = z.string().trim().toLowerCase()
    .min(3).max(32).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);   // "El código debe tener de 3 a 32 caracteres: minúsculas, números y guiones."
  export const campaignChannelSchema = leadChannelSchema.exclude(["unknown"]); // "Elige el canal."
  export const campaignFormSchema = z.object({
    code: campaignCodeSchema,
    name: z.string().trim().min(2).max(80),               // "Escribe un nombre de 2 a 80 caracteres."
    tripId: z.uuid(),                                     // "Elige un viaje del catálogo."
    channel: campaignChannelSchema,
    eventName: blankToNull(z.string().min(2).max(120)),   // "El evento o stand debe tener entre 2 y 120 caracteres."
  });
  export const campaignIdSchema = z.uuid();
  ```
- `types/campaigns.types.ts`: `CampaignInput`, `CampaignStatus`, `CampaignListItem = { id; code; name; channel: LeadChannel; eventName: string | null; status; trip: { slug; title }; createdAt: Date; leadCount: number }`, `CampaignDetail = CampaignListItem & { createdBy: { email: string }; closedAt: Date | null; closedBy: { email: string } | null }`, `CampaignActionState` (`idle` | `success` | `error` con `code: "unauthorized" | "forbidden" | "invalid_input" | "code_taken" | "invalid_trip" | "not_found"`, `message`, `fieldErrors?`, `values?`).
- `utils/leadAttribution.ts` (sin `server-only`, puro):
  ```ts
  export function normalizeCampaignCode(value: string | null | undefined): string | null; // campaignCodeSchema or null
  export function normalizeUtm(value: string | null | undefined): string | null;          // trim, lower, [a-z0-9._~+-]{1,100}
  export function normalizeReferral(value: string | null | undefined): string | null;     // trim, lower, [a-z0-9._~+-]{2,60}
  export function reRegistrationNote(input: {
    utmSource: string | null; utmMedium: string | null; utmCampaign: string | null;
    referredBy: string | null; consentVersion: string; marketingOptIn: boolean;
  }): string; // "UTM: a / b / c · Ref: x · Texto legal <versión> · Promociones: sí|no" (only parts with value)
  ```
- `schemas/webLeads.schema.ts` (modificar):
  ```ts
  const attribution = (normalize: (v: string | null | undefined) => string | null) =>
    z.string().max(200).nullish().catch(null).transform(normalize);   // never an error
  export const webLeadFormSchema = z.object({
    name, email, phone, consent, submissionId, "cf-turnstile-response",   // unchanged
    destination: z.string({ error: "Elige la carrera." }).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Elige la carrera.").max(80),
    marketing: z.literal("on").optional().catch(undefined),               // never blocks
    c: attribution(normalizeCampaignCode),
    utm_source: attribution(normalizeUtm), utm_medium: attribution(normalizeUtm), utm_campaign: attribution(normalizeUtm),
    ref: attribution(normalizeReferral),
  }).transform(/* → fullName, email, phone, destination, marketingOptIn: marketing === "on", submissionId,
                   turnstileToken, campaignCode, utmSource, utmMedium, utmCampaign, referredBy */);
  ```
- `types/webLeads.types.ts`: `WebLeadInput` sigue derivado del schema; `WebLeadField` añade `marketing`; `WebLeadFormState.code` añade `"trip_unavailable"`.
- `services/webLeads.service.ts` (modificar, `server-only`):
  ```ts
  export async function createWebLead(input: Omit<WebLeadInput, "turnstileToken">):
    Promise<"created" | "existing" | "duplicate" | "conflict" | "unknown_trip">;
  // submission_hash = SHA-256 hex of JSON.stringify([fullName, email, phone, destination, marketingOptIn]).
  // destination in INQUIRY_DESTINATIONS → tripSlug NULL + destination_text = name; otherwise tripSlug = destination.
  // One db.execute(sql`
  //   WITH existing AS (SELECT submission_hash FROM leads WHERE idempotency_key = $sid),
  //   repeated_before AS (SELECT 1 FROM lead_activities WHERE submission_id = $sid),
  //   trip AS (SELECT id FROM trips WHERE slug = $tripSlug AND status = 'published'),
  //   checks AS (SELECT ($tripSlug::text IS NULL OR EXISTS (SELECT 1 FROM trip)) AS trip_ok),
  //   campaign AS (SELECT id, code, name, channel, coalesce(event_name, name) AS detail FROM campaigns
  //     WHERE code = $code AND status = 'active' AND trip_id = (SELECT id FROM trip)),
  //   same_person AS (SELECT id FROM leads WHERE email = $email AND archived_at IS NULL
  //     AND <trip_id = (SELECT id FROM trip) | trip_id IS NULL AND destination_text = $name> ORDER BY created_at, id LIMIT 1),
  //   fresh AS (SELECT 1 FROM checks WHERE trip_ok AND NOT EXISTS existing AND NOT EXISTS repeated_before),
  //   new_lead AS (INSERT INTO leads (full_name, phone, email, trip_id, destination_text, source, channel, origin_detail,
  //       campaign_id, utm_source, utm_medium, utm_campaign, referred_by, consent_version, marketing_opt_in_at,
  //       idempotency_key, submission_hash)
  //     SELECT …, coalesce((SELECT channel FROM campaign), 'web'), (SELECT detail FROM campaign), (SELECT id FROM campaign), …
  //     FROM fresh WHERE NOT EXISTS same_person ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, source),
  //   activity AS (INSERT 'created' FROM new_lead),
  //   event AS (INSERT 'lead.created', jsonb_build_object('source', source) FROM new_lead),
  //   repeat AS (INSERT INTO lead_activities (lead_id, type, body, submission_id)
  //     SELECT same_person.id, 're_registered', left(concat_ws(' · ', 'Volvió a registrarse desde la web',
  //       'Campaña: ' || (SELECT name || ' (' || code || ')' FROM campaign), $note), 500), $sid
  //     FROM same_person, fresh ON CONFLICT (submission_id) DO NOTHING RETURNING lead_id)
  //   SELECT created, existing_hash, repeated_before, repeated, trip_ok`).
  // Order: created → existing_hash (duplicate | conflict) → repeated (existing) → repeated_before (duplicate)
  //   → !trip_ok (unknown_trip) → otherwise a concurrent insert won the key (duplicate).
  ```
- `actions/webLeads.actions.ts` (modificar): tras el honeypot, `if (!isRegistrationOpen()) return failure("unavailable")`; mapea `existing` → éxito y `unknown_trip` → `trip_unavailable`. Mensajes:

  | Resultado | `status` / `code` | Mensaje |
  |---|---|---|
  | `created`, `existing`, `duplicate` u honeypot | `success` | "¡Listo! Recibimos tus datos. Te escribiremos por WhatsApp." |
  | schema o tamaño | `invalid_input` | "Revisa los datos del formulario." (+ `fieldErrors`) |
  | Turnstile `invalid` | `verification_failed` | "No pudimos verificar el envío. Inténtalo de nuevo." |
  | `conflict` | `conflict` | "Ya recibimos un registro desde este formulario. Recarga la página para enviar otro." |
  | `unknown_trip` | `trip_unavailable` | "Esta carrera ya no está disponible para registrarse." |
  | registro cerrado, Turnstile `unavailable` o excepción | `unavailable` | "No pudimos enviar tus datos en este momento. Puedes escribirnos por WhatsApp." |

  La pantalla de éxito del modo stand usa su propio texto fijo ("Registro guardado. ¡Gracias!"), no el `message` de la acción.

### Campañas en el CRM (`modules/crm/`, `app/crm/`, F3)
- `services/campaigns.service.ts` (`server-only`):
  ```ts
  export async function listCampaigns(): Promise<CampaignListItem[]>;
  //   One query: campaigns JOIN trips LEFT JOIN (SELECT campaign_id, count(*) FROM leads GROUP BY 1)
  //   ORDER BY status = 'closed', created_at DESC.
  export async function getCampaignById(id: string): Promise<CampaignDetail | null>;
  export async function createCampaign(input: CampaignInput, actorUserId: string):
    Promise<{ id: string } | "code_taken" | "invalid_trip">;
  //   One statement: INSERT … SELECT … FROM trips WHERE id = $trip AND status <> 'archived'
  //   ON CONFLICT (code) DO NOTHING RETURNING id; plus trip_ok to tell the two failures apart.
  export async function closeCampaign(id: string, actorUserId: string): Promise<"closed" | "not_found">;
  //   UPDATE … SET status = 'closed', closed_at = now(), closed_by = $actor WHERE id = $id AND status = 'active'.
  ```
- `utils/campaignDisplay.ts` (puro): `CAMPAIGN_STATUS_LABELS` (`Activa`, `Cerrada`) y `campaignLinks(origin, tripSlug, code): { registration: string; stand: string }` (con `URL`).
- `actions/campaigns.actions.ts` (`"use server"`): `createCampaignAction(prev, formData)` → `requirePermission("leads.manage")` → `campaignFormSchema` → `createCampaign` → `revalidatePath("/crm/campanas")` y `redirect` al detalle; `closeCampaignAction(prev, formData)` (`campaignId`) → `closeCampaign` → revalida lista y detalle. Errores fijos: `code_taken` "Ese código ya está en uso." (en `code`), `invalid_trip` "Elige un viaje del catálogo." (en `tripId`), `not_found` "La campaña ya estaba cerrada o no existe. Recarga la página.", y los de sesión y permiso como `trips.actions.ts`. Si el service lanza, mismo patrón que `actionFailed()` de `leads.actions.ts`: `throw new Error("campaign action failed")`, sin causa y sin `console.*` (el error de Drizzle lleva la sentencia y sus parámetros).
- `index.ts`: `listCampaigns`, `getCampaignById`, `createCampaignAction`, `closeCampaignAction`, `CampaignForm`, `CampaignTable`, `CampaignQr`, `campaignLinks`, `CAMPAIGN_STATUS_LABELS`.

### Páginas públicas (`modules/landing/`, `app/`, F4)
- `utils/inquiry.ts` (modificar): mantiene `WHATSAPP_NUMBER`, `buildWhatsAppUrl` y `buildTripInquiryMessage` (los usa `TripDetail`); elimina `DESTINATION_IDS`, `DestinationId`, `parseDestinationId` y `buildInquiryMessage`; añade:
  ```ts
  export const GENERAL_INQUIRY_MESSAGE = "Hola, quiero información para correr con Carreras Viajeras.";
  export type LeadAttributionParams = Partial<Record<"c" | "utm_source" | "utm_medium" | "utm_campaign" | "ref", string>>;
  export function firstParam(value: string | string[] | undefined): string | undefined;
  export function attributionParams(searchParams: Record<string, string | string[] | undefined>): LeadAttributionParams;
  //   first value of the five keys only, non-empty, ≤ 200 characters
  export function resolveDestination(value: string | string[] | undefined, allowed: readonly string[]): string;
  //   allowed value | "santiago-2027" → "maraton-santiago-2027" (if allowed) | "" (no preselection)
  ```
- `hooks/useLeadCapture.ts` (nuevo, `"use client"`):
  ```ts
  export function useLeadCapture(input: {
    action: (prev: WebLeadFormState, formData: FormData) => Promise<WebLeadFormState>;
  }): {
    state: WebLeadFormState; pending: boolean;
    formKey: number;               // changes on startOver: remounts an empty form
    turnstileResetSignal: number;  // changes after every response (tokens are single use)
    submit: (form: HTMLFormElement) => void;   // adds submissionId (crypto.randomUUID on first submit, kept on retry, renewed after success)
    startOver: () => void;         // idle state + new formKey
  };
  ```
- Componentes:

  | Componente | Tipo | Detalle |
  |---|---|---|
  | `button` (`buttonVariants`), `input`, `label`, `native-select`, `checkbox` | shadcn (instalado) | Campos del formulario y de campañas. `field` existe en `@shadcn` y se descarta: los formularios del proyecto (`LeadForm`, `TripForm`) usan `Label` + mensaje propio y se mantiene la coherencia sin instalar nada |
  | `card`, `table`, `badge` | shadcn (instalado) | Detalle y tabla de campañas, estado |
  | `ConfirmActionButton` | existente (`components/shared/ConfirmActionButton.tsx`) | "Cerrar campaña" |
  | `SiteHeader`, `SiteFooter` | existentes (`modules/landing/components/`, versión del PR #27) | Registro (salvo modo stand) y `/contacto` |
  | `LeadCaptureForm` | nuevo, `modules/landing/components/` (`"use client"`; sustituye a `ContactForm`, que se elimina: era la demo) | Props `{ action; destination: { kind: "fixed"; value: string } \| { kind: "select"; options: { value: string; label: string }[]; defaultValue: string }; attribution: LeadAttributionParams; standMode: boolean; turnstileSiteKey: string \| null; whatsAppUrl: string \| null }`. Usa `useLeadCapture`, `REGISTRATION_CONSENT` y `TurnstileWidget`. Honeypot `website` en un contenedor `aria-hidden` fuera de pantalla, `tabIndex={-1}`, `autoComplete="off"` |
  | `TurnstileWidget` | nuevo, `modules/landing/components/` (`"use client"`; no existe en shadcn ni en el proyecto; un solo dominio) | Props `{ siteKey; action: "lead_submit"; resetSignal: number }`. `next/script` con `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`; `turnstile.render(ref, { sitekey, action, language: "es", size: "flexible" })` dentro del `<form>`; `reset()` al cambiar `resetSignal`; `remove()` al desmontar. Tipado mínimo local de `window.turnstile` |
  | `RaceRegistrationSection` | nuevo, `modules/landing/components/` (Server; no hay sección de registro por carrera) | Props `{ trip: Pick<TripLanding, "slug" \| "title" \| "location" \| "raceDate" \| "distances" \| "imageUrl">; action; attribution; standMode }`. Encabezado `bg-night` con foto en duotono plano (si hay imagen; `next/image` `unoptimized`), línea "Ciudad, País · fecha", `h1` `display-title text-display-section`, distancias, CTA verde `rounded-full bg-highlight text-night` y enlace subrayado `decoration-highlight`; bloque del formulario `id="registro"` en `bg-sky`, `max-w-md`, `h2` "Regístrate" y "Te escribiremos por WhatsApp para contarte los detalles. Sin pagos." Modo stand: solo el nombre de la carrera y el formulario. Registro cerrado: el aviso del Requisito 5 con WhatsApp |
  | `ContactSection` | existente (Server) | Props `{ action; trips: { slug: string; title: string }[]; destination?: string \| string[]; attribution }`. Opciones = viajes + `INQUIRY_DESTINATIONS` ("<nombre> · Quiero novedades"); `resolveDestination`; tokens del PR #27; sin la nota de demostración; mismo aviso de registro cerrado |
  | `CampaignForm` | nuevo, `modules/crm/components/` (`"use client"`, como `TripForm`) | Código, nombre, viaje (`NativeSelect` con viajes no archivados), canal (13 etiquetas de `LEAD_CHANNEL_LABELS` sin "Desconocido") y evento o stand |
  | `CampaignTable` | nuevo, `modules/crm/components/` (Server, presentacional) | `Table` del Requisito 9 con enlace al detalle; `TableCaption` "Cuenta registros, no visitas." |
  | `CampaignQr` | nuevo, `modules/crm/components/` (`"use client"`) | `QRCode` de `react-qr-code` con `value` = enlace público y `title`; "Descargar QR (SVG)" serializa el `<svg>` (`XMLSerializer` → `Blob`) como `campana-<código>.svg` |

- Rutas (`app/`; solo leen params y componen; consultar `node_modules/next/dist/docs/` antes de escribirlas):

  | Ruta | Fase | Cambio |
  |---|---|---|
  | `app/viajes/[slug]/registro/page.tsx` | F4 | Nueva. `getCatalogTrip(slug)` (con `cache`, compartida con `generateMetadata`: título "Registro · <title>", `description` = `summary`) → `notFound()` si es `null`; `attributionParams(await searchParams)`, `standMode = firstParam(modo) === "stand"`; compone `SiteHeader`/`SiteFooter` (si no es stand) y `RaceRegistrationSection` con `submitWebLeadAction` de `@/modules/crm`. Dinámica (`ƒ`) |
  | `app/contacto/page.tsx` | F4 | `listPublishedTrips()` de `@/modules/trips`; pasa `destino`, la atribución y `submitWebLeadAction` a `ContactSection` |
  | `app/crm/(protected)/campanas/page.tsx` | F3 | Nueva. `getCrmAccess("leads.manage")`; `listCampaigns()` y `getLeadFormOptions().tripOptions` → `h1` "Campañas", `CampaignForm` y `CampaignTable` |
  | `app/crm/(protected)/campanas/[id]/page.tsx` | F3 | Nueva. `campaignIdSchema` (no UUID → `notFound()`); `getCampaignById`; `campaignLinks(getEnv().APP_ORIGIN, …)`; datos, enlaces, `CampaignQr` y `ConfirmActionButton` "Cerrar campaña" (título "¿Cerrar la campaña «<nombre>»?", descripción "El QR y el enlace seguirán abriendo el registro, pero los nuevos registros ya no se atribuirán a esta campaña. No se puede reabrir.") |
  | `modules/accounts/components/CrmShell.tsx` | F3 | Enlace "Campañas" junto a "Leads" (con `leads.manage`) |

### Contrato de API
Server Action pública `submitWebLeadAction(prev: WebLeadFormState, formData: FormData): Promise<WebLeadFormState>`, invocada desde `/viajes/<slug>/registro` y `/contacto`:
```ts
// FormData (strings only, ≤ 16 KiB, no files). Any other key is dropped.
type WebLeadFormData = {
  name: string;                    // 2–80
  phone: string;                   // with country code → E.164
  email: string;                   // → trimmed, lowercase, ≤ 150
  destination: string;             // published trip slug | "rio" | "roma"
  consent: "on";                   // legal text REGISTRATION_CONSENT.version
  marketing?: "on";                // independent, never blocks
  submissionId: string;            // UUID from the browser: idempotency key
  "cf-turnstile-response": string; // Turnstile token, ≤ 2048
  website?: string;                // honeypot: filled → success without saving
  c?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; ref?: string; // normalized or null, never an error
};
type WebLeadFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error";
      code: "invalid_input" | "verification_failed" | "conflict" | "trip_unavailable" | "unavailable";
      message: string;
      fieldErrors?: Partial<Record<"name" | "email" | "phone" | "destination" | "consent" | "marketing", string[]>> };
```
Acciones del CRM (`leads.manage`): `createCampaignAction(prev, formData)` con `{ code, name, tripId, channel, eventName? }` y `closeCampaignAction(prev, formData)` con `{ campaignId }`, ambas → `CampaignActionState`. El contrato de la API privada de n8n y del outbox **no cambia**.

### Relación con otras specs (no se editan)
- **`crm-leads-capture.md`** (aprobada):
  1. **Esta spec asume y reemplaza su Fase 4** (formulario de `/contacto` conectado, `TurnstileWidget`, honeypot, consentimiento y estados): sus criterios de F4 no se ejecutan; los sustituyen los de las F2 y F4 de esta spec.
  2. Sustituye para los envíos nuevos: el texto `web-form-v1` (Requisito 6) por el texto versionado de P-L; el mensaje de WhatsApp preparado tras el éxito (Requisito 7) por la alternativa de WhatsApp solo ante error; la lista fija de destinos con Santiago por defecto (Requisito 3) por el catálogo publicado más Río y Roma.
  3. **Cambia código ya implementado de su F3:** la ventana de 10 minutos por teléfono (Requisito 4, P3) se elimina y se sustituye por la regla de correo + carrera (Requisito 4 y Decisión 4 de esta spec).
  4. El resto (Turnstile, honeypot, límites, idempotencia por `submissionId`, CTE única, outbox, API de n8n) se mantiene.
- **`crm-journey-automation.md`** (aprobada): **esta spec asume y reemplaza su Fase 7** (origen y UTM en la captura web): la lista de slugs `?origen=` (`leadOrigins.ts`, Pregunta 6) se sustituye por las campañas `?c=`; se mantienen su normalización de UTM y que los UTM no se editan. También renombra en la ficha la etiqueta "Campaña" (los UTM, de su F2) a "UTM", porque "Campaña" pasa a ser la campaña del CRM.
- **`landing-race-pages.md`** (aprobada): `/viajes/[slug]` no cambia y sigue sin enlazar a `/contacto` ni al registro (su Requisito 9). Añadir un enlace al registro sería una enmienda suya (Pregunta abierta 2).
- **`landing-home-redesign.md`** (aprobada, en `origin/main`): la F4 reutiliza sus tokens y componentes y exige tenerla integrada. La portada no cambia; sus enlaces `?destino=santiago-2027` siguen funcionando por el alias.
- **`landing-public-site.md`** (aprobada): sus textos de demostración de `/contacto` quedan superados (ya lo declaraba `crm-leads-capture.md`).
- **`platform-neon-foundation.md`**: sin cambios; esta spec cumple su contrato de leads (Turnstile en servidor, idempotencia, escritura atómica, outbox).
- **Specs futuras del plan:** `trips-commercial-offers` añadirá el bloque de oferta a la página de registro (o a su paso siguiente); `bookings-runner-self-service`, `bookings-contract-acceptance` y `bookings-mercadopago` parten del lead creado aquí (vía `leads.email` y `trip_id`); `public-official-site-content`, del texto legal aprobado y de la indexación.
- **No se ejecutan en paralelo** con otro trabajo sobre: `modules/crm/services/webLeads.service.ts`, `leads.service.ts`, `LeadDetails.tsx`, `LeadTimeline.tsx`, `modules/landing/components/ContactSection.tsx`, `modules/landing/utils/inquiry.ts` y `README.md`.

## Reutilización
- `createWebLead`, `verifyTurnstileToken`, `submitWebLeadAction`, `webLeadFormSchema` y sus tests (se amplían, no se duplican); `phoneSchema` (`lib/phone.ts`); `blankToNull` y `leadChannelSchema` (`leads.schema.ts`); `LEAD_CHANNEL_LABELS`, `LEAD_SOURCE_LABELS`, `SYSTEM_ACTOR_LABELS` y `leadChannelLabel` (`leadDisplay.ts`).
- `getCatalogTrip` y `TripLanding` (`modules/landing/utils/catalogTrip.ts`); `listPublishedTrips` (`@/modules/trips`); `getLeadFormOptions().tripOptions` para el selector de viajes de las campañas.
- `getCrmAccess`, `requirePermission`, `getEnv().APP_ORIGIN`; patrón de acciones y formularios de `trips.actions.ts`/`TripForm` y de páginas del CRM de `/crm/viajes`.
- `ConfirmActionButton` (cerrar campaña); `buttonVariants`, `cn`, `next/image`, `lucide-react` (`ArrowUpRight`).
- Tokens y componentes del PR #27: `--night`, `--sky`, `--asphalt`, `--highlight`, `display-title`, `text-display-section`, `SiteHeader`, `SiteFooter`.
- `WHATSAPP_NUMBER`, `buildWhatsAppUrl` (`modules/landing/utils/inquiry.ts`).
- Fake del cliente Neon HTTP de `modules/crm/services/leads.service.test.ts` y `webLeads.service.test.ts` para los tests de services.
- shadcn instalados: `button`, `input`, `label`, `native-select`, `checkbox`, `card`, `table`, `badge`. No se instala nada de shadcn. Única dependencia declarada: `react-qr-code@2.2.0` (ya en el lockfile).

## Tests
Los de servidor con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`; sin red ni secretos.
- `modules/crm/schemas/leads.schema.test.ts` (F1): `leadActivityTypeSchema` con `re_registered`, sincronizado con la base; `blankToNull` exportado sin cambios.
- `modules/crm/utils/leadDisplay.test.ts` (F1): etiqueta de `re_registered` y `SYSTEM_ACTOR_LABELS.re_registered`.
- `modules/crm/services/leads.service.test.ts` (F1): `getLeadById` con `left join campaigns`, `campaign` nulo y con valor, `marketingOptInAt`; los casos existentes siguen pasando.
- `lib/registrationConsent.test.ts` (F2): formato de la versión e `isRegistrationOpen` por `NODE_ENV` con el marcador.
- `modules/crm/schemas/campaigns.schema.test.ts` (F2): casos del criterio de F2.
- `modules/crm/utils/leadAttribution.test.ts` (F2): las tres normalizaciones (válidos, recorte, mayúsculas, caracteres prohibidos, longitudes límite, `null`/`undefined`) y `reRegistrationNote` (con todo, sin nada, sin UTM, promociones sí/no).
- `modules/crm/schemas/webLeads.schema.test.ts` (F2): casos del criterio de F2; se eliminan los del enum de destinos antiguo.
- `modules/crm/services/webLeads.service.test.ts` (F2): una sola llamada `execute`; parámetros (`web_form`, versión legal, `'web'` por defecto, UTM, `referred_by`, `marketing_opt_in_at`, `rio`/`roma` sin slug); la condición de la campaña (`active`, `trip_id`); `same_person` por correo, carrera y `archived_at` y **sin** `phone`; la nota de `re_registered`; mapeo de los cinco resultados; hash estable, que cambia con las promociones y no con la atribución. Se eliminan los casos de la ventana por teléfono.
- `modules/crm/actions/webLeads.actions.test.ts` (F2): casos del criterio de F2 más los existentes.
- `modules/crm/services/campaigns.service.test.ts` (F3): casos del criterio de F3 (SQL, parámetros, actor, resultados).
- `modules/crm/utils/campaignDisplay.test.ts` (F3): `campaignLinks` (con y sin barra final en el origen, código con guiones) y etiquetas de estado.
- `modules/crm/actions/campaigns.actions.test.ts` (F3): casos del criterio de F3 (mocks de `server-only`, guardas, service, `next/cache` y `next/navigation`).
- `modules/landing/utils/inquiry.test.ts` (F4): `firstParam`, `attributionParams` (solo las cinco claves, primer valor, vacíos y > 200 descartados), `resolveDestination` (permitido, alias, desconocido, array); se eliminan los casos de `buildInquiryMessage`/`parseDestinationId` y se mantienen los de `buildTripInquiryMessage` y `buildWhatsAppUrl`.
- `modules/landing/hooks/useLeadCapture.test.ts` (F4, `renderHook`): `submissionId` generado en el primer envío, conservado al reintentar tras un error y renovado tras el éxito; `pending` durante el envío; `turnstileResetSignal` cambia tras cada respuesta; `startOver` vuelve a `idle` y cambia `formKey`; no escribe en `localStorage` ni `sessionStorage` (espías).
- Sin unit test (SETUP §3): `lib/db-schema.ts` (migración y prueba manual), `lib/inquiryDestinations.ts` (constantes), tipos, páginas de `app/`, y componentes de módulo (`LeadCaptureForm`, `TurnstileWidget`, `RaceRegistrationSection`, `ContactSection`, `CampaignForm`, `CampaignTable`, `CampaignQr`, `LeadDetails`, `LeadTimeline`, `CrmShell`): su lógica está en schemas, utils, services, acciones y el hook. Los criterios visuales y de 360 px se verifican a mano (o con Playwright, preinstalado) en la última tarea de la F4.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer) y con la medición del Worker. Nadie aplica migraciones, despliega ni hace commits.

### Fase 1: modelo de datos, ficha e historial (4 tareas, 14 archivos: 2 generados por drizzle-kit)
- [x] T1 — Schema y migración (enum `campaign_status`, `campaigns`, `leads.campaign_id` y `marketing_opt_in_at`, `re_registered` y `lead_activities.submission_id`, CHECK sustituidos); `npm run db:generate` y revisión del SQL · archivos: `lib/db-schema.ts`, `drizzle/0007_*.sql` (generado; número provisional hasta el turno de merge), `drizzle/meta/0007_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — Tipo de actividad `re_registered` en el CRM (schema sincronizado, etiqueta, autor "Formulario web" en el historial) y `blankToNull` exportado, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/utils/leadDisplay.ts`, `modules/crm/utils/leadDisplay.test.ts`, `modules/crm/components/LeadTimeline.tsx` · depende de: T1 · paralelo (con T3 y T4)
- [x] T3 — Ficha con campaña, UTM y promociones (`getLeadById`, `LeadDetail`, `LeadDetails`), con tests; medir el Worker cuando T2 y T3 estén terminadas · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/components/LeadDetails.tsx` · depende de: T1 · paralelo (con T2 y T4)
- [x] T4 — README: "Migración de campañas y registro" (revisión, dos bloques, pruebas manuales) · archivos: `README.md` · depende de: T1 · paralelo (con T2 y T3)

### Fase 2: captura en servidor (5 tareas, 15 archivos)
Requisito previo: Fase 1 cerrada y la migración aplicada en la rama de pruebas de Neon.
- [x] T1 — Base compartida: texto legal versionado con marcador P-L e `isRegistrationOpen`, y destinos sin catálogo (sin Santiago), con tests · archivos: `lib/registrationConsent.ts`, `lib/registrationConsent.test.ts`, `lib/inquiryDestinations.ts` · depende de: Fase 1 · secuencial (base, `lib/`)
- [x] T2 — Schema y tipos de campañas, con tests · archivos: `modules/crm/schemas/campaigns.schema.ts`, `modules/crm/schemas/campaigns.schema.test.ts`, `modules/crm/types/campaigns.types.ts` · depende de: T1 · secuencial
- [x] T3 — Normalización de la atribución y `webLeadFormSchema`/tipos ampliados, con tests · archivos: `modules/crm/utils/leadAttribution.ts`, `modules/crm/utils/leadAttribution.test.ts`, `modules/crm/schemas/webLeads.schema.ts`, `modules/crm/schemas/webLeads.schema.test.ts`, `modules/crm/types/webLeads.types.ts` · depende de: T2 · secuencial
- [x] T4 — `createWebLead` con campaña, UTM, `ref`, promociones, regla de correo + carrera y `re_registered`, sin ventana por teléfono, con tests · archivos: `modules/crm/services/webLeads.service.ts`, `modules/crm/services/webLeads.service.test.ts` · depende de: T3 · paralelo (con T5)
- [x] T5 — `submitWebLeadAction`: registro cerrado, `existing` y `trip_unavailable`, con tests; medir el Worker cuando T4 y T5 estén terminadas · archivos: `modules/crm/actions/webLeads.actions.ts`, `modules/crm/actions/webLeads.actions.test.ts` · depende de: T3 (firma de `createWebLead` fijada en esta spec) · paralelo (con T4)

### Fase 3: campañas en el CRM (5 tareas, 15 archivos)
Requisito previo: Fase 2 cerrada (schema y tipos de campañas).
- [x] T1 — Declarar `react-qr-code@2.2.0` como dependencia directa exacta (`npm install --save-exact react-qr-code@2.2.0`; comprobar que el lockfile no añade paquetes) · archivos: `package.json`, `package-lock.json` · depende de: Fase 2 · secuencial (base, `package.json`)
- [x] T2 — `campaigns.service.ts` (lista, detalle, alta, cierre) y `campaignDisplay.ts` (enlaces y etiquetas), con tests · archivos: `modules/crm/services/campaigns.service.ts`, `modules/crm/services/campaigns.service.test.ts`, `modules/crm/utils/campaignDisplay.ts`, `modules/crm/utils/campaignDisplay.test.ts` · depende de: T1 · secuencial
- [x] T3 — Acciones de alta y cierre de campañas, con tests · archivos: `modules/crm/actions/campaigns.actions.ts`, `modules/crm/actions/campaigns.actions.test.ts` · depende de: T2 · paralelo (con T4)
- [x] T4 — Componentes `CampaignForm`, `CampaignTable` y `CampaignQr` · archivos: `modules/crm/components/CampaignForm.tsx`, `modules/crm/components/CampaignTable.tsx`, `modules/crm/components/CampaignQr.tsx` · depende de: T2 · paralelo (con T3)
- [x] T5 — API pública, páginas `/crm/campanas` y `/crm/campanas/[id]` y enlace en el menú; medir el Worker y registrar el incremento del QR · archivos: `modules/crm/index.ts`, `app/crm/(protected)/campanas/page.tsx`, `app/crm/(protected)/campanas/[id]/page.tsx`, `modules/accounts/components/CrmShell.tsx` · depende de: T3, T4 · secuencial

### Fase 4: páginas públicas de registro y `/contacto` (5 tareas, 13 archivos)
Requisitos previos: Fases 2 y 3 cerradas; **la rama contiene el PR #27 de `origin/main`** (lo integra el usuario; si no, el developer se detiene y lo consulta). La publicación en producción sigue bloqueada hasta P-L (Requisito 5); la implementación no espera a P-L.
- [x] T1 — Utilidades de parámetros y destino (`firstParam`, `attributionParams`, `resolveDestination`, `GENERAL_INQUIRY_MESSAGE`) y limpieza de la demo, con tests · archivos: `modules/landing/utils/inquiry.ts`, `modules/landing/utils/inquiry.test.ts` · depende de: Fase 3 · paralelo (con T2 y T3)
- [x] T2 — `TurnstileWidget` · archivos: `modules/landing/components/TurnstileWidget.tsx` · depende de: Fase 3 · paralelo (con T1 y T3)
- [x] T3 — Hook `useLeadCapture`, con tests · archivos: `modules/landing/hooks/useLeadCapture.ts`, `modules/landing/hooks/useLeadCapture.test.ts` · depende de: Fase 3 · paralelo (con T1 y T2)
- [x] T4 — `LeadCaptureForm` (sustituye y elimina `ContactForm`), `RaceRegistrationSection` y `ContactSection` con el mismo formulario y los tokens del PR #27 · archivos: `modules/landing/components/LeadCaptureForm.tsx` (nuevo), `modules/landing/components/ContactForm.tsx` (eliminado), `modules/landing/components/RaceRegistrationSection.tsx` (nuevo), `modules/landing/components/ContactSection.tsx` · depende de: T1, T2, T3 · secuencial
- [x] T5 — API pública de `landing`, páginas `/viajes/[slug]/registro` y `/contacto`, README (campañas, QR, modo stand, P-L y regla WAF); verificación a 360 px, modo stand y registro cerrado en producción local; medir el Worker · archivos: `modules/landing/index.ts`, `app/viajes/[slug]/registro/page.tsx` (nuevo), `app/contacto/page.tsx`, `README.md` · depende de: T4 · secuencial

## Preguntas abiertas
1. **Mecánica de la base de tratamiento (puerta P-L).** Esta spec usa una casilla obligatoria "Acepto…" junto al texto legal, como el formulario actual (`consent: "on"`), que es la opción más conservadora. Si el área legal decide que basta un aviso informativo ("Al enviar, aceptas…") porque la base es la relación precontractual, se quita la casilla (cambio de schema y de formulario). ¿Lo confirma el área legal junto con el texto?
2. **Entradas al registro desde el sitio.** Hoy el registro solo se alcanza por QR o enlace de campaña. Añadir «Registrarme» en `/viajes/[slug]` (cambia el Requisito 9 de `landing-race-pages.md`) o apuntar los CTA de la portada (`MobileCta`, `HeroCarousel`, cabecera) al registro en lugar de `/contacto` queda fuera. ¿Lo quieres en esta spec (F4, 2–4 archivos más) o en `public-official-site-content`?
3. **Visitas por campaña.** Esta spec cuenta registros, no visitas (Requisito 8). Contar visitas exigiría escribir en Neon por cada apertura del QR (coste y abuso) o activar una analítica externa. Por defecto no se cuentan; ¿te basta?
