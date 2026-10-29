# Embudo comercial completo y correos automáticos del ciclo de vida

- Módulos: integrations, crm y accounts; datos compartidos en lib.
- Estado: aprobado
- Solicitud: que todo registro de un runner entre al embudo comercial y que cada paso envíe un correo automático: bienvenida con confirmación del registro, confirmación de contacto, seguimiento, confirmación de la separación y alerta para el comercial.
- Referencias: `crm-funnel-email-automation.md` (motor de correos ya implementado), `crm-journey-automation.md` (se enmienda aquí), `crm-leads-capture.md`, `landing-omnichannel-capture.md`, `accounts-runner-profiles.md` y `docs/SETUP.md`.

## Objetivo

Hoy los formularios, Google Forms y la importación crean leads, pero el runner que crea su cuenta y completa su perfil no entra al embudo. Además, el correo automático solo envía un mensaje por cambio de etapa al cliente. Esta spec:

- hace que **todo registro de un runner** genere un lead en el embudo comercial, incluido el perfil de la cuenta web;
- amplía el motor de correos existente con **tipos de correo** ligados a hechos concretos (bienvenida, contacto, seguimiento, separación) y con **avisos internos** al equipo y al responsable comercial.

Se reutilizan el outbox, la tabla `client_emails`, la API privada de n8n y el flujo SMTP. No se añade otro proveedor de correo.

## Decisiones confirmadas por el usuario

| Correo | Disparador | Destinatario |
| --- | --- | --- |
| Bienvenida + confirmación de registro | `lead.created` de un registro a una carrera (`/viajes/[slug]/registro`) | cliente |
| Bienvenida + confirmación de contacto | `lead.created` desde `/contacto` | cliente |
| Bienvenida de cuenta | primer guardado de `/cuenta/perfil`, que crea el lead | cliente |
| Seguimiento | `lead.follow_up_due`: vence la próxima acción que puso el comercial (uno por episodio de etapa) | cliente |
| Confirmación de separación | `lead.stage_changed` con `trigger: 'booking'` (el equipo confirma la reserva) | cliente |
| Alerta al equipo | cada `lead.created` | dirección fija `CRM_TEAM_ALERT_EMAIL` |
| Alerta al responsable | el CRM asigna o cambia el responsable (evento nuevo `lead.owner_assigned`) | correo del responsable (`profiles.email`) |

Otras decisiones:

- El runner entra al embudo **al completar su perfil**, no al crear la cuenta en Clerk: el lead necesita teléfono y la cuenta solo pide correo y contraseña. No se añade webhook de Clerk.
- El formulario web sigue **cerrado en producción** hasta aprobar el texto legal (puerta P-L, `lib/registrationConsent.ts`). Esta spec no lo abre: deja preparados sus correos.
- Claude redacta los textos de esta spec y el usuario los revisa al aprobarla.
- El flujo manual «Nuevo lead» del README (borradores de WhatsApp) no está instalado. La alerta al equipo se resuelve en el flujo de correos.

### Enmienda de `crm-journey-automation.md`

Esa spec aprobada excluye las «bienvenidas» y cualquier mensaje automático al runner. Esta spec **sustituye esa exclusión solo para** los correos de la tabla anterior, con estas condiciones: plantillas fijas revisadas, consentimiento del registro, fecha de corte, interruptor apagado por defecto, y sin envíos a importaciones, contactos archivados o con baja. Se mantienen las demás exclusiones de esa spec: campañas o envíos en lote, WhatsApp automático, IA sin revisión humana y asignación automática de responsable.

## Alcance

- Incluye:
  - tipos de correo en `client_emails`;
  - preparación y elegibilidad por tipo;
  - plantillas nuevas;
  - lead desde el perfil del runner;
  - marca de formulario (registro o contacto);
  - evento `lead.owner_assigned`;
  - historial por tipo en la ficha;
  - recordatorio diario de seguimientos en el flujo de n8n;
  - documentación de activación.
- No incluye:
  - abrir el formulario web ni el texto legal definitivo (P-L);
  - webhook de Clerk;
  - asignación automática de responsable;
  - promociones o campañas;
  - WhatsApp automático;
  - correos HTML o adjuntos;
  - seguimiento de aperturas o clics;
  - estado «Entregado»;
  - migraciones o despliegues remotos ejecutados por agentes.

## Requisitos

### 1. Entradas al embudo

- **Formulario web.** `LeadCaptureForm` envía un campo oculto `form` con valor `registration` en `/viajes/[slug]/registro` y `contact` en `/contacto`. El schema lo valida como enum; si falta o no es válido, se usa `contact`. `createWebLead` lo añade al payload de `lead.created` (`{ source, form }`), sin datos personales. El campo solo elige el texto del correo: no concede permisos ni cambia el destinatario.
- **Perfil del runner.** `saveRunnerProfile` pasa a un solo statement:
  - Primer guardado del perfil (inserción, no actualización) y ningún lead **sin archivar** con ese correo (en minúsculas): crea el lead con estos datos.
    - `full_name`, `phone`, `email`: los del perfil.
    - `source`: `runner_account` (valor nuevo).
    - `channel`: `web`.
    - `consent_version`: la del perfil.
    - Sin responsable.
    - Actividad `created` y evento `lead.created` con `{ source: 'runner_account' }`.
  - Primer guardado y **ya existe** un lead sin archivar con ese correo: no crea otro lead. Añade al lead más reciente una actividad «Completó su perfil en la web», sin evento ni correo.
  - Guardados posteriores: no tocan el embudo.
  - Nunca se copian al lead documentos, fecha de nacimiento, contacto de emergencia ni notas médicas.
- **Responsable.**
  - `changeLeadOwner` emite `lead.owner_assigned` (payload `{}`) cuando asigna un responsable no nulo distinto del anterior **y distinto de quien hace el cambio**.
  - `createLead` (alta manual) lo emite cuando el responsable elegido no es el autor.
  - Asignarse un lead a uno mismo no genera aviso.
- Las etiquetas muestran la vía `runner_account` como «Cuenta web» en lista, ficha, filtros e informes.

### 2. Tipos de correo y qué evento los genera

| Evento | Condición | Tipos generados |
| --- | --- | --- |
| `lead.created` | `source = web_form` y `form = registration` | `welcome_registration` + `team_alert` |
| `lead.created` | `source = web_form` y `form = contact` (o sin `form`) | `welcome_contact` + `team_alert` |
| `lead.created` | `source = runner_account` | `welcome_account` + `team_alert` |
| `lead.created` | `source = google_form` | `welcome_registration` + `team_alert` |
| `lead.created` | `source` `whatsapp`/`other` (alta manual) | `welcome_contact` + `team_alert` |
| `lead.created` | `source = import` o `bulk` | ninguno (se registra `skipped`, como hoy) |
| `lead.stage_changed` | `trigger = 'booking'` y `stageTo = reserved` | `booking_confirmed` |
| `lead.stage_changed` | resto | `stage` (correo de etapa actual) |
| `lead.follow_up_due` | — | `follow_up` |
| `lead.owner_assigned` | — | `owner_alert` |

- Las bienvenidas **sustituyen** al correo de etapa «Nuevo» de `lead.created`, y `booking_confirmed` sustituye al correo de etapa «Reservado» cuando el cambio viene de una reserva. Así nadie recibe dos correos por el mismo hecho.
- Un evento puede generar como máximo **un correo por tipo**: la clave única pasa de `source_event_id` a `(source_event_id, kind)`.
- Un registro repetido (`re_registered`) no emite evento y no envía correos.

### 3. Elegibilidad

Se aplica al preparar el correo y otra vez al autorizarlo, justo antes de SMTP, como hoy.

- **Comunes:** automatización activa, evento posterior a `CRM_EMAIL_AUTOMATION_START_AT`, `payload_version = 1` y remitente igual a `CRM_EMAIL_FROM`.
- **Correos al cliente** (`welcome_*`, `follow_up`, `booking_confirmed`, `stage`):
  - el lead no está archivado, no pidió no seguir y no viene de importación ni `bulk`;
  - el destinatario es igual a `leads.email`, y sin correo se omite (`missing_email`).
  - **Bienvenidas:** no exigen que la etapa siga igual ni que el evento sea el último; se omiten si hubo baja o archivo.
  - **`follow_up`:** la etapa actual es igual a `payload.stage`, la próxima acción sigue vencida (`next_action_date <= hoy` en Lima) y no hay un evento de etapa posterior.
  - **`booking_confirmed` y `stage`:** las reglas actuales (evento vigente y etapa igual).
- **Avisos internos** (`team_alert`, `owner_alert`):
  - se envían aunque el cliente haya pedido no seguir; se omiten si el lead está archivado;
  - `team_alert` va a `CRM_TEAM_ALERT_EMAIL`, y sin esa variable se omite (`missing_team_address`);
  - `owner_alert` va al correo del responsable **actual**; se omite si ya no hay responsable o es otra persona (`owner_changed`), o si el responsable no tiene un rol activo con `leads.manage`;
  - no aplican la regla «evento vigente» de las etapas.
- Los destinatarios, el remitente y el contenido se resuelven siempre en el servidor. n8n no puede elegirlos.

### 4. Contenido y datos mínimos

- Texto plano, firmado como «Equipo de Carreras Viajeras». `{nombre}` es el nombre de pila. `{carrera}` es el título del viaje del lead, o su destino, o «tu próxima carrera». En `booking_confirmed` se usa el viaje de la reserva activa vinculada, si existe.
- No se inventan precios, pagos, plazos, cupos ni servicios confirmados.
- **Avisos internos:** solo nombre, carrera, vía de entrada y un enlace a la ficha (`{APP_ORIGIN}/crm/leads/{id}`). Nunca teléfono, documentos, notas médicas ni notas internas.
- `template_version` = 1 para los tipos nuevos. El correo de etapa conserva sus textos y su versión.

### 5. CRM

- La ficha del lead muestra cada mensaje con su tipo: «Bienvenida», «Confirmación de contacto», «Bienvenida de cuenta», «Seguimiento», «Separación confirmada», «Correo · {etapa}», y los avisos internos marcados como «Aviso interno (equipo)» o «Aviso interno (responsable)». El destinatario de un aviso interno se muestra como «Equipo» o con el correo del responsable.
- La tarjeta del embudo sigue mostrando solo el estado del último correo **al cliente** del episodio actual. Los avisos internos no cuentan como correo al cliente.
- «Reintentar correo» se mantiene igual: `leads.manage`, solo fallos confirmados antes del envío y nueva comprobación de elegibilidad del tipo correspondiente.

### 6. n8n

- `scripts/n8n/client-stage-email.json` no cambia la forma de enviar, porque solo usa `from/to/subject/text`.
- Se añade un disparador diario a las **09:00 (America/Lima)** que llama a `POST /api/integrations/n8n/follow-ups/enqueue`, para que existan los eventos `lead.follow_up_due`. Hoy nadie lo llama.
- El flujo sigue importándose **inactivo** y sin credenciales.

## Textos para revisión

| Tipo | Asunto | Cuerpo (antes de la firma) |
| --- | --- | --- |
| `welcome_registration` | Recibimos tu registro para {carrera} | Hola {nombre}, te damos la bienvenida a Carreras Viajeras. Recibimos tu registro para {carrera}. Pronto una persona de nuestro equipo te escribirá por WhatsApp para contarte cómo es el viaje y resolver tus dudas. Si quieres adelantarnos algo, responde este correo. |
| `welcome_contact` | Recibimos tu consulta | Hola {nombre}, te damos la bienvenida a Carreras Viajeras y gracias por escribirnos. Recibimos tu consulta sobre {carrera}. Pronto una persona de nuestro equipo te contactará por WhatsApp. Si quieres añadir algo, responde este correo. |
| `welcome_account` | Te damos la bienvenida a Carreras Viajeras | Hola {nombre}, tu cuenta y tu perfil de runner ya están listos. Desde tu cuenta podrás ver tus carreras y mantener tus datos al día. Una persona de nuestro equipo te escribirá para ayudarte a elegir tu próximo viaje. Si tienes una consulta, responde este correo. |
| `follow_up` | ¿Seguimos con tu viaje a {carrera}? | Hola {nombre}, queríamos saber cómo vas con tu decisión sobre {carrera}. Si tienes dudas o necesitas más información, responde este correo y te ayudamos. |
| `booking_confirmed` | Tu separación para {carrera} está confirmada | Hola {nombre}, confirmamos tu separación para {carrera}. Nuestro equipo te escribirá para coordinar los siguientes pasos. Si tienes una consulta, responde este correo. |
| `team_alert` | Nuevo registro: {nombre} · {carrera} | Entró un registro nuevo al embudo. Nombre: {nombre completo}. Carrera: {carrera}. Vía de entrada: {vía}. Responsable: sin asignar. Ficha: {enlace}. |
| `owner_alert` | Te asignaron un lead: {nombre} | Te asignaron un lead en el CRM. Nombre: {nombre completo}. Carrera: {carrera}. Etapa: {etapa}. Ficha: {enlace}. |

## Criterios de aceptación

- [ ] F1: un `lead.created` de registro web con la automatización activa genera exactamente una `welcome_registration` y un `team_alert`, y ningún correo de etapa «Nuevo».
- [ ] F1: si un consumidor reclama varias veces o hay concurrencia, nunca se crea un segundo correo del mismo `(evento, tipo)`.
- [ ] F1: con el lead archivado o con baja no salen correos al cliente. Con baja, el aviso al equipo sí sale; con el lead archivado, no sale ninguno. Sin `CRM_TEAM_ALERT_EMAIL`, el aviso queda omitido con motivo.
- [ ] F1: un `follow_up` se omite si la etapa cambió o si la próxima acción ya no está vencida al autorizar.
- [ ] F1: un `owner_alert` se omite si el responsable cambió antes de autorizar. Los avisos internos no contienen teléfono, documentos ni notas.
- [ ] F1: las filas existentes de `client_emails` quedan como tipo `stage` y siguen funcionando: claim, autorizar, ack, fallo y reintento.
- [ ] F2: el registro desde `/viajes/[slug]/registro` lleva `form: registration` en el payload, y `/contacto` lleva `contact`.
- [ ] F2: el primer guardado del perfil de un runner sin lead crea un lead `runner_account` en «Nuevo», sin responsable, con su evento. Un segundo guardado no crea nada. Con un lead previo del mismo correo, solo se añade una actividad.
- [ ] F2: asignar un responsable distinto del autor emite un `lead.owner_assigned`; asignarse a uno mismo o reasignar al mismo no lo emite.
- [ ] F3: la ficha muestra el tipo de cada correo y distingue los avisos internos. La tarjeta del embudo ignora los avisos internos.
- [ ] F3: el flujo de n8n incluye el disparador diario de seguimientos, sigue inactivo y sin credenciales, y su test lo comprueba.
- [ ] F1–F3: pasan lint, tests, typegen, TypeScript y `build:worker`. Las pruebas reales de envío solo se hacen con destinatarios autorizados y se informan por separado.

## Diseño técnico

- **Migración `drizzle/0014_*.sql`**, generada con `npm run db:generate` y aplicada a mano. Se aplica en **dos bloques**:
  1. `ALTER TYPE lead_source ADD VALUE 'runner_account'` y `ALTER TYPE outbox_event_type ADD VALUE 'lead.owner_assigned'`, fuera de transacción o en la suya propia.
  2. `CREATE TYPE client_email_kind AS ENUM ('stage', 'welcome_registration', 'welcome_contact', 'welcome_account', 'follow_up', 'booking_confirmed', 'team_alert', 'owner_alert')`; `ALTER TABLE client_emails ADD COLUMN kind client_email_kind NOT NULL DEFAULT 'stage'`; sustituir el índice único `client_emails_event_uq` por `(source_event_id, kind)`; índice `(lead_id, kind, created_at)` si las lecturas de la ficha lo necesitan.
  - `stage` sigue NOT NULL: guarda la etapa del lead en el momento del evento.
  - Es compatible con el código desplegado: el insert actual usa el valor por defecto `stage`.
  - **Debe aplicarse en production antes de mergear la F1.**
- **`lib/db-schema.ts`**: enums nuevos, columna `kind` e índices. Tipos derivados en `modules/integrations/types`.
- **`lib/env.ts`**: `getClientEmailEnv()` añade `teamAlertEmail` desde `CRM_TEAM_ALERT_EMAIL` (opcional, email ≤254). Una variable mal formada es un error que solo nombra el campo. También va en `.env.example` y `.dev.vars.example`.
- **Plantillas**: `modules/integrations/utils/lifecycleEmailTemplates.ts`, con funciones puras por tipo. `clientEmailTemplate` (etapas) se conserva.
- **Servicio** `modules/integrations/services/clientEmails.service.ts`:
  - `prepareEmails` lee también `lead.follow_up_due` y `lead.owner_assigned`.
  - Calcula la lista de tipos por evento según la tabla del requisito 2 e inserta una fila por tipo con `onConflictDoNothing({ target: [sourceEventId, kind] })`.
  - Resuelve el destinatario en el servidor: lead, `CRM_TEAM_ALERT_EMAIL` o el correo del responsable.
  - `eligible()` se parametriza por tipo, según el requisito 3. Claim, lease, authorize, ack, fail y retry no cambian de contrato.
- **Entradas**:
  - `LeadCaptureForm` recibe una prop `form`, que pasan las páginas `app/viajes/[slug]/registro/page.tsx` y `app/contacto/page.tsx`.
  - Cambian `webLeads.schema.ts` y `webLeads.service.ts` (payload).
  - `runnerProfile.service.ts` pasa a un CTE único (`INSERT … ON CONFLICT … RETURNING (xmax = 0) AS inserted` + lead, actividad y evento condicionados).
  - `leads.service.ts`: evento en `changeLeadOwner` y `createLead`.
  - `leadDisplay.ts`: etiqueta «Cuenta web».
- **CRM**: `leadMessages.service.ts` devuelve `kind`; `LeadMessages.tsx` lo etiqueta; el estado de la tarjeta (`leads.service.ts`) filtra los tipos de cliente; `leadGuidance.ts` añade los motivos nuevos (`missing_team_address`, `owner_changed`).
- **Rutas**: no hay rutas nuevas. El matcher del middleware no cambia, porque `/cuenta/perfil` ya está incluido.

## Reutilización

- Motor de `client_emails`: leases, tokens, autorización previa a SMTP y reintento protegido (`crm-funnel-email-automation.md`).
- Outbox `outbox_events`, `sequence` y `dedupe_key`. `enqueueFollowUps` (`modules/integrations/services/followUps.service.ts`).
- Patrón de CTE único de `webLeads.service.ts` e `integrationLeads.service.ts`. `isActiveOwner` de `leads.service.ts`.
- Pruebas con PostgreSQL embebido (`lib/testing/embeddedDb.ts`), como `clientEmails.service.test.ts`.

## Tests

- **Plantillas:** cada tipo, el fallback de `{carrera}`, el nombre de pila y la ausencia de teléfono o notas en los avisos internos.
- **Preparación (PGlite):** tipos por evento y por `source`/`form`; sin correo de etapa «Nuevo»; `(evento, tipo)` único bajo reclamaciones repetidas; importación o `bulk` omitidos; filas antiguas como `stage`.
- **Elegibilidad (PGlite):** baja, archivo, sin correo, sin dirección de equipo, responsable cambiado o sin rol, seguimiento obsoleto, separación vigente y corte de activación.
- **Entradas:**
  - schema `form`, con fallback;
  - payload del registro web;
  - perfil del runner: primera vez, actualización, correo existente y que no se copian datos sensibles;
  - `lead.owner_assigned`: otro responsable, uno mismo y el mismo responsable;
  - `createLead` con un responsable distinto del autor.
- **CRM:** etiquetas por tipo, avisos internos y la tarjeta que ignora avisos internos.
- **n8n:** el disparador diario y la llamada a `follow-ups/enqueue`; flujo inactivo y sin credenciales.

## Plan de tareas

### Fase 1 — Datos y motor por tipos (5 tareas, ~14 archivos)

- [ ] T1 — Schema y migración revisable · archivos: `lib/db-schema.ts`, `drizzle/0014_*.sql`, `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json` · depende de: aprobación · secuencial (base)
- [ ] T2 — Configuración del aviso al equipo · archivos: `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.dev.vars.example` · depende de: T1 · secuencial (`lib/`)
- [ ] T3 — Plantillas · archivos: `modules/integrations/utils/lifecycleEmailTemplates.ts`, `modules/integrations/utils/lifecycleEmailTemplates.test.ts` · depende de: T1 · paralelo con T2
- [ ] T4 — Preparación y elegibilidad por tipo · archivos: `modules/integrations/services/clientEmails.service.ts`, `modules/integrations/schemas/email.schema.ts`, `modules/integrations/index.ts` · depende de: T1–T3 · secuencial
- [ ] T5 — Pruebas del motor · archivos: `modules/integrations/services/clientEmails.service.test.ts`, `modules/integrations/schemas/email.schema.test.ts` · depende de: T4

### Fase 2 — Entradas al embudo (5 tareas, ~14 archivos)

- [ ] T1 — Marca de formulario · archivos: `modules/landing/components/LeadCaptureForm.tsx`, `app/viajes/[slug]/registro/page.tsx`, `app/contacto/page.tsx`, `modules/crm/schemas/webLeads.schema.ts` y su test · depende de: F1 · paralelo
- [ ] T2 — Payload del registro web · archivos: `modules/crm/services/webLeads.service.ts` y su test · depende de: F2 T1
- [ ] T3 — Lead desde el perfil del runner · archivos: `modules/accounts/services/runnerProfile.service.ts` y su test · depende de: F1 · paralelo con T1
- [ ] T4 — Evento de responsable · archivos: `modules/crm/services/leads.service.ts` y su test · depende de: F1 · paralelo con T1 y T3
- [ ] T5 — Etiqueta «Cuenta web» · archivos: `modules/crm/utils/leadDisplay.ts` y su test · depende de: F1 · paralelo

### Fase 3 — CRM, n8n y activación (5 tareas, ~12 archivos)

- [ ] T1 — Lectura por tipo · archivos: `modules/crm/types/leads.types.ts`, `modules/crm/services/leadMessages.service.ts` y su test, `modules/crm/services/leads.service.ts` · depende de: F2
- [ ] T2 — Ficha y orientación · archivos: `modules/crm/components/LeadMessages.tsx` y su test, `modules/crm/utils/leadGuidance.ts` y su test · depende de: F3 T1
- [ ] T3 — Recordatorio diario en n8n · archivos: `scripts/n8n/client-stage-email.json`, `scripts/n8n/client-stage-email.test.ts` · depende de: F1 · paralelo con T1
- [ ] T4 — Guía de activación · archivos: `README.md` · depende de: F3 T1–T3. Contenido:
  - `N8N_API_TOKEN`, que sustituye a `AUTOMATION_API_TOKEN`;
  - Secrets `CRM_EMAIL_*` y `CRM_TEAM_ALERT_EMAIL`;
  - aplicar la 0014 en dos bloques antes del merge;
  - prueba con destinatario autorizado;
  - qué funciona mientras siga cerrada la puerta P-L.
- [ ] T5 — Revisión final · archivos: — · depende de: F3 T1–T4. Lint, tests, typegen, TypeScript y `build:worker`; se registran las pruebas pasadas, bloqueadas y pendientes.

## Operaciones del usuario (nunca las ejecuta un agente)

1. Crear el Secret `N8N_API_TOKEN` en Cloudflare con el valor de `AUTOMATION_API_TOKEN`, y borrar este último cuando n8n conecte.
2. Aplicar la 0014 en dev-test y después en production, antes de mergear la F1.
3. Secrets `CRM_EMAIL_FROM`, `CRM_EMAIL_AUTOMATION_START_AT`, `CRM_TEAM_ALERT_EMAIL` y `CRM_EMAIL_AUTOMATION_ENABLED=true`.
4. Importar o actualizar el flujo en n8n, probarlo con «Prueba manual» y activarlo.
5. Aprobar el texto legal (P-L) para abrir el formulario web, en una tarea aparte.

## Preguntas abiertas

1. Google Forms usa la bienvenida de registro y el alta manual usa la de contacto (tabla del requisito 2). Si prefieres otra combinación, indícala antes de aprobar.
2. `crm-funnel-email-automation.md` se implementó y se mergeó, pero no tiene aprobación registrada. Para basarse en ella, el usuario debe aprobarla tal cual (`apruebo docs/specs/crm-funnel-email-automation.md`) o pedir cambios.
