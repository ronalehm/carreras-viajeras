# Secuencia automática de seguimiento comercial por correo

- Módulos: integrations, crm y landing; datos compartidos en lib.
- Estado: aprobado
- Solicitud: seguimiento comercial automatizado. Si alguien se registra hoy, hoy recibe nuestra propuesta y, si no responde, recibe recordatorios a los 3, 5 y 7 días, con un texto propio para cada etapa del embudo de venta.
- Referencias: `crm-lifecycle-emails.md` (motor de tipos de correo; se enmienda aquí), `crm-funnel-email-automation.md`, `crm-journey-automation.md`, `trips-commercial-offers.md` (ofertas vigentes) y `docs/SETUP.md`.

## Objetivo

Dar a cada lead abierto una cadencia de contacto por correo sin depender de que el comercial se acuerde de escribir. La cadencia empieza al entrar en una etapa abierta, se detiene en cuanto hay respuesta o avance, y nunca escribe a quien pidió no seguir.

## Decisiones confirmadas por el usuario

1. **Calendario:** días 0, 3, 5 y 7, contados desde que el lead entra en la etapa. En «Nuevo», el día 0 es el registro.
2. **El día 0 de «Nuevo» lleva dos correos:** la bienvenida inmediata, que ya existe, y la **propuesta** unas horas después, en un correo aparte.
3. **La propuesta incluye la oferta comercial vigente del viaje:** precio final, opciones de separación, fecha límite del saldo y bono si existe, con enlace a la ficha pública y al WhatsApp. Si no hay oferta vigente, sale la versión sin precio.
4. **Hay una secuencia por cada etapa abierta**, con su propio texto: Nuevo, Contactado y Cotizado. Reservado, Pagado y Perdido no tienen seguimiento comercial.
5. **Detener la secuencia:**
   - el comercial **cambia la etapa**, lo que termina la secuencia y empieza la de la nueva etapa si es abierta;
   - el comercial pulsa un botón nuevo **«Respondió»** en la ficha;
   - el cliente pide no seguir, con el enlace de baja o desde el CRM;
   - el lead se archiva.
6. **Baja:** cada correo de la secuencia lleva un enlace «No quiero recibir más correos». Abre una página pública que pide confirmar y, al confirmar, marca al lead como «Pidió no seguir».

## Enmiendas a otras specs

- **`crm-lifecycle-emails.md`:**
  - el correo `follow_up` ligado a la «próxima acción» deja de enviarse al cliente: lo sustituye esta secuencia. El aviso interno de seguimiento vencido no cambia;
  - la tarea F3-T3 (disparador diario de `follow-ups/enqueue`) se sustituye por el disparador horario de esta spec.
- **`crm-funnel-email-automation.md` y `crm-lifecycle-emails.md`:** se levanta la regla «no se inventa una cadencia nueva de correos repetidos», solo para la secuencia definida aquí.
- **`crm-journey-automation.md`:** se mantienen las exclusiones de envíos masivos, WhatsApp automático e IA sin revisión.

## Alcance

- Incluye:
  - cálculo de los pasos vencidos y su encolado idempotente;
  - tipos de correo `cadence_proposal` y `cadence_reminder`;
  - plantillas por etapa y paso;
  - lectura de la oferta vigente;
  - enlace y página de baja;
  - botón «Respondió»;
  - estado de la secuencia en la ficha;
  - disparador horario en n8n;
  - documentación.
- No incluye:
  - lectura automática de respuestas del correo o de WhatsApp;
  - pruebas A/B;
  - seguimiento de aperturas o clics;
  - WhatsApp automático;
  - cambios en la asignación de responsables;
  - envíos a importaciones;
  - abrir o cambiar el texto legal.

## Requisitos

### 1. Pasos de la secuencia

| Etapa | Paso | Cuándo vence | Tipo |
| --- | --- | --- | --- |
| Nuevo | `proposal` | 2 horas después de entrar en la etapa (después de la bienvenida) | `cadence_proposal` |
| Nuevo | `r3`, `r5`, `r7` | días 3, 5 y 7 | `cadence_reminder` |
| Contactado | `r3`, `r5`, `r7` | días 3, 5 y 7 (el día 0 ya tiene el correo de etapa) | `cadence_reminder` |
| Cotizado | `r3`, `r5`, `r7` | días 3, 5 y 7 (el día 0 ya tiene el correo de etapa) | `cadence_reminder` |

- **Entrada en la etapa.** El episodio empieza en el `created` del lead (para Nuevo) o en la última actividad `stage_changed` hacia esa etapa. Reabrir una etapa empieza un episodio nuevo con su propia secuencia.
- **Ventana de envío.** Un paso vencido solo se encola entre las **09:00 y las 19:00 de America/Lima**. Si vence fuera de esa ventana, se encola en la siguiente apertura. No se envían dos pasos de la misma secuencia el mismo día: si se acumulan, se encola solo el más reciente y los anteriores se registran como omitidos.
- **Elegibilidad.** Se comprueba al encolar, al preparar y al autorizar justo antes de SMTP:
  - automatización activa y corte `CRM_EMAIL_AUTOMATION_START_AT` (los episodios que empezaron antes del corte no reciben secuencia);
  - lead no archivado, sin baja, con correo y que no venga de importación ni `bulk`;
  - la etapa actual coincide con la del paso y el episodio sigue siendo el vigente;
  - no hay una actividad «Respondió» en el episodio.
- **Idempotencia.** Cada paso se encola una sola vez por episodio, con la clave `cadence:<lead>:<episodio>:<paso>`.

### 2. Encolado

- Nueva ruta privada `POST /api/integrations/n8n/cadence/enqueue`, con la misma autenticación Bearer y los mismos límites que `follow-ups/enqueue`.
- Crea eventos `lead.cadence_due` (valor nuevo de `outbox_event_type`) con payload `{ stage, step }`, sin datos personales.
- Lote acotado (por defecto 20, máximo 50), empezando por los más antiguos. Responde `{ enqueued }`.
- El motor de `client_emails` convierte cada `lead.cadence_due` en un correo del tipo indicado.

### 3. Contenido

- Texto plano, firmado como «Equipo de Carreras Viajeras». Cada correo termina con una línea: «Si no quieres recibir más correos sobre este viaje: {enlace de baja}».
- `{nombre}`, `{carrera}`, `{enlace_viaje}` (`{APP_ORIGIN}/viajes/{slug}` si el viaje está publicado) y `{whatsapp}` (enlace `wa.me` existente) se resuelven en el servidor.
- **Oferta vigente:** se usa la de `getActiveOffer` (la de la campaña del lead si está vigente; si no, la general). Datos que se muestran:
  - precio final en dólares;
  - opciones de separación;
  - fecha límite del saldo;
  - bono, si existe;
  - fecha hasta la que es válida la oferta.
  No se inventan cupos, plazos ni servicios. Sin oferta vigente, se usa la variante «sin precio».
- El asunto se normaliza a una línea. `template_version` vale 1.

### 4. Botón «Respondió» y estado en la ficha

- La ficha del lead (con `leads.manage`) muestra el estado de la secuencia del episodio actual:
  - próximo paso y fecha;
  - pasos enviados u omitidos;
  - «Detenida: respondió / baja / cambio de etapa».
- El botón **«Respondió»** registra una actividad nueva de tipo `responded` en el episodio actual y detiene los pasos pendientes. Es idempotente y no cambia la etapa.

### 5. Baja por enlace

- El enlace lleva un token firmado con HMAC-SHA256 a partir del id del lead y de la fecha de emisión. Usa un secreto nuevo, `CRM_EMAIL_UNSUBSCRIBE_SECRET` (aleatorio, de al menos 32 caracteres, guardado como Cloudflare Secret). El token caduca a los 180 días.
- `GET /baja?t=…` muestra una página pública con el botón «Confirmar baja». No modifica nada, porque los escáneres de correo abren los enlaces.
- La página confirma mediante un **POST** (Server Action) que verifica el token y marca la baja del lead, con la misma semántica que «Pidió no seguir» en el CRM: el lead pasa a Perdido y se emite `lead.opted_out`. La actividad queda sin autor y con la nota «Baja desde el enlace del correo».
- Un token inválido o caducado muestra un mensaje genérico, sin revelar si el lead existe. Si el lead ya estaba dado de baja, el resultado es el mismo mensaje de éxito.
- La página no muestra datos del lead.

## Textos para revisión

Cuerpos antes de la firma y de la línea de baja.

| Etapa · paso | Asunto | Cuerpo |
| --- | --- | --- |
| Nuevo · propuesta (con oferta) | Tu propuesta para {carrera} | Hola {nombre}, te compartimos la propuesta para correr {carrera} con Carreras Viajeras. Precio final: US${precio}. Puedes separar tu cupo con US${separación} y completar el saldo hasta el {fecha_saldo}. {bono} Esta oferta es válida hasta el {válida_hasta}. Mira todos los detalles en {enlace_viaje} o escríbenos por WhatsApp: {whatsapp}. |
| Nuevo · propuesta (sin oferta) | Tu propuesta para {carrera} | Hola {nombre}, queremos ayudarte a correr {carrera}. Mira qué incluye el viaje en {enlace_viaje} y escríbenos por WhatsApp para prepararte una propuesta a tu medida: {whatsapp}. |
| Nuevo · día 3 | ¿Pudiste revisar la propuesta para {carrera}? | Hola {nombre}, ¿pudiste revisar la propuesta? Si tienes dudas sobre el viaje, las fechas o la forma de pago, responde este correo o escríbenos por WhatsApp: {whatsapp}. |
| Nuevo · día 5 | Lo que incluye tu viaje a {carrera} | Hola {nombre}, te recordamos que el viaje a {carrera} incluye lo que ves en {enlace_viaje}. Si quieres, te llamamos o te escribimos por WhatsApp para resolver tus dudas: {whatsapp}. |
| Nuevo · día 7 | ¿Seguimos con {carrera}? | Hola {nombre}, no queremos insistir de más. Si todavía te interesa correr {carrera}, responde este correo y retomamos. Si ahora no es buen momento, también nos ayuda saberlo. |
| Contactado · día 3 | Sobre tu viaje a {carrera} | Hola {nombre}, gracias por conversar con nosotros. ¿Te quedó alguna duda sobre el viaje a {carrera}? Responde este correo o escríbenos por WhatsApp: {whatsapp}. |
| Contactado · día 5 | ¿Te preparamos tu cotización? | Hola {nombre}, si quieres, preparamos tu cotización para {carrera} con las opciones de pago disponibles. Solo responde este correo. |
| Contactado · día 7 | ¿Seguimos en contacto? | Hola {nombre}, si todavía te interesa {carrera}, aquí estamos para ayudarte. Si ahora no es buen momento, respóndenos y te escribimos más adelante. |
| Cotizado · día 3 | ¿Revisaste tu cotización para {carrera}? | Hola {nombre}, ¿pudiste revisar tu cotización? Si quieres ajustar algo o tienes dudas sobre la separación del cupo, responde este correo o escríbenos por WhatsApp: {whatsapp}. |
| Cotizado · día 5 | Separa tu cupo para {carrera} | Hola {nombre}, para asegurar tu lugar en {carrera} puedes separar tu cupo. Te ayudamos con el proceso por WhatsApp: {whatsapp}. |
| Cotizado · día 7 | Última consulta sobre {carrera} | Hola {nombre}, queremos saber si sigues interesado en {carrera}. Responde este correo y te ayudamos con la reserva. Si decidiste no viajar esta vez, también nos ayuda saberlo. |

Si un dato de la oferta no existe (separación, saldo, bono o fecha de validez), la frase que lo contiene se omite.

## Criterios de aceptación

- [ ] Un lead nuevo, con correo y posterior al corte, recibe la bienvenida y, unas 2 horas después y dentro de la ventana, la propuesta con la oferta vigente; sin oferta, la variante sin precio.
- [ ] Sin cambios ni «Respondió», recibe los recordatorios de los días 3, 5 y 7 de su etapa, cada uno una sola vez y dentro de la ventana de envío.
- [ ] Al cambiar de etapa, los pasos pendientes de la anterior no se envían, aunque ya estuvieran encolados, y empieza la secuencia de la nueva etapa si es abierta.
- [ ] «Respondió», la baja o el archivo detienen la secuencia, también entre el encolado y el envío.
- [ ] Reservado, Pagado y Perdido no reciben correos de secuencia.
- [ ] Las importaciones y los leads anteriores al corte no reciben secuencia.
- [ ] El enlace de baja no modifica nada al abrirlo. Confirmar marca la baja; un token inválido o caducado no revela nada.
- [ ] Los correos de cliente `follow_up` (próxima acción) ya no se envían. El aviso interno sigue igual.
- [ ] Pasan lint, tests, typegen, TypeScript y `build:worker`. Ningún test contacta a clientes reales.

## Diseño técnico

- **Migración nueva**, en dos bloques por los `ADD VALUE`:
  - `outbox_event_type` + `lead.cadence_due`;
  - `client_email_kind` + `cadence_proposal`, `cadence_reminder`;
  - `lead_activity_type` + `responded`;
  - recrear `lead_activities_actor_chk` para admitir `opted_out` sin autor cuando lleva la nota de baja por enlace. Si conviene, en el mismo cambio se añade `profile_completed`, la sugerencia pendiente de `crm-lifecycle-emails` F2.
- **Servicio `cadence.service.ts`** (integrations): `enqueueCadence(now)` calcula episodios y pasos vencidos en SQL acotado, aplica la ventana de Lima e inserta eventos con `dedupe_key`.
- **Motor:** `clientEmails.service.ts` añade los tipos `cadence_*` y su elegibilidad: episodio vigente, misma etapa, sin `responded`, sin baja y sin archivo. Las plantillas van en `cadenceEmailTemplates.ts`.
- **Oferta:** se lee desde la API pública de `trips` (`getActiveOffer`) o con una consulta equivalente acotada desde integrations, evitando ciclos de importación.
- **Baja:**
  - `lib/env.ts` añade `CRM_EMAIL_UNSUBSCRIBE_SECRET`, validado solo al usarse;
  - firma y verificación del token en `modules/integrations/utils/unsubscribeToken.ts`, con comparación en tiempo constante;
  - página `app/baja/page.tsx` y acción en `modules/crm/actions/unsubscribe.actions.ts` (pública, con límite de tamaño). No llama a `auth()`, así que no se añade al matcher del middleware.
- **CRM:** botón «Respondió» (acción con `leads.manage`) y estado de la secuencia en `LeadMessages` o `LeadJourney`.
- **n8n:** disparador cada hora en `scripts/n8n/client-stage-email.json` que llama a `cadence/enqueue`. El flujo sigue inactivo al importarse.

## Tests

- **Encolado (PGlite):** pasos por etapa y día, ventana de Lima, acumulación tras una pausa, episodio reabierto, idempotencia, corte e importación.
- **Elegibilidad:** cambio de etapa, «Respondió», baja y archivo entre encolar y enviar.
- **Plantillas:** con oferta completa, oferta parcial y sin oferta; línea de baja; asunto en una línea.
- **Token:** firma, caducidad, manipulación y comparación en tiempo constante.
- **Baja:** GET sin efecto; POST que marca la baja; token inválido sin revelar información; baja repetida.
- **CRM:** permisos e idempotencia del botón «Respondió», y estado de la secuencia en la ficha.
- **n8n:** disparador horario presente y flujo inactivo.

## Plan de tareas

### Fase 1 — Datos, encolado y correos (5 tareas)

- [x] T1 — Migración y schema · archivos: `lib/db-schema.ts`, `drizzle/00NN_*.sql`, snapshot y journal · depende de: aprobación · secuencial (base)
- [x] T2 — Encolado · archivos: `modules/integrations/services/cadence.service.ts` y su test, `app/api/integrations/n8n/cadence/enqueue/route.ts` y su test, `modules/integrations/index.ts` · depende de: T1
- [x] T3 — Plantillas · archivos: `modules/integrations/utils/cadenceEmailTemplates.ts` y su test · depende de: T1 · paralelo con T2
- [x] T4 — Motor y oferta · archivos: `modules/integrations/services/clientEmails.service.ts` y su test · depende de: T2 y T3
- [x] T5 — Retirar el `follow_up` al cliente · archivos: `modules/integrations/services/clientEmails.service.ts` y su test · depende de: T4

### Fase 2 — Baja, «Respondió» y ficha (5 tareas)

- [ ] T1 — Token y entorno · archivos: `lib/env.ts` y su test, `.env.example`, `.dev.vars.example`, `modules/integrations/utils/unsubscribeToken.ts` y su test · depende de: F1
- [ ] T2 — Página y acción de baja · archivos: `app/baja/page.tsx`, `modules/crm/actions/unsubscribe.actions.ts` y su test, `modules/crm/services/leads.service.ts` y su test · depende de: F2 T1
- [ ] T3 — Botón «Respondió» · archivos: `modules/crm/actions/leads.actions.ts` y su test, `modules/crm/services/leads.service.ts` · depende de: F2 T2
- [ ] T4 — Estado de la secuencia en la ficha · archivos: `modules/crm/services/leadMessages.service.ts` y su test, `modules/crm/components/LeadMessages.tsx` y su test · depende de: F2 T3
- [ ] T5 — Línea de baja en las plantillas · archivos: `modules/integrations/utils/cadenceEmailTemplates.ts` y su test · depende de: F2 T1

### Fase 3 — n8n y activación (3 tareas)

- [ ] T1 — Disparador horario · archivos: `scripts/n8n/client-stage-email.json` y su test · depende de: F1
- [ ] T2 — Guía de activación · archivos: `README.md` · depende de: F1–F2. Contenido:
  - el secreto de baja;
  - la migración;
  - la importación del flujo;
  - la prueba con un destinatario autorizado.
- [ ] T3 — Revisión final · archivos: — · depende de: F3 T1–T2

## Operaciones del usuario

1. Aplicar la migración en dev-test y después en production, antes de mergear la F1.
2. Crear el Secret `CRM_EMAIL_UNSUBSCRIBE_SECRET` en Cloudflare antes de mergear la F2.
3. Reimportar o actualizar el flujo de n8n con el disparador horario.

## Preguntas abiertas

1. **Ventana de envío** de 09:00 a 19:00 en Lima y **propuesta 2 horas después** de la bienvenida: son valores propuestos. Ajústalos si prefieres otros.
2. **¿Se envían recordatorios en fin de semana?** Propuesta: sí, porque los runners suelen revisar el correo el fin de semana.
3. **Hasta la Fase 2, ¿los correos de secuencia salen sin enlace de baja?** Propuesta: no. La F1 se despliega con la automatización de la secuencia apagada (`CRM_SALES_CADENCE_ENABLED=false`, una variable nueva) y se enciende solo con la F2 desplegada.
