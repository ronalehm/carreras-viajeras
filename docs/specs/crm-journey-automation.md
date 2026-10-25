# Recorrido del corredor: origen, entrada por Google Forms, seguimiento con baja, reserva ↔ lead y medición

- Módulo: crm (también `integrations`, `bookings` y `landing`)
- Estado: aprobado
- Depende de:
  - `platform-neon-foundation.md` (aprobada): Workers Free, Neon con Drizzle `neon-http` (escrituras atómicas con una CTE o `db.batch`), migraciones con `npm run db:generate` aplicadas a mano, sin Cron Triggers ni llamadas del Worker a n8n.
  - `crm-leads-pipeline.md` (aprobada; F1–F6 implementadas): `leads`, `lead_activities`, alta, ficha, edición, historial, próxima acción, archivo, lista con embudo y permiso `leads.manage`.
  - `crm-leads-capture.md` (aprobada; F1–F2 implementadas, F3–F5 pendientes): outbox `outbox_events`, `modules/integrations/`, API privada para n8n con Bearer y su guía de n8n en el README. Esta spec respeta sus decisiones: modelo *pull*, `modules/integrations` separado de `modules/crm`, una CTE por escritura, leads de sistema sin responsable, actividad `automation`, Gemini solo en n8n y minimización (`firstName`, etapa, viaje).
  - `runner-portal.md` (aprobada; F1–F2 implementadas, F3–F6 pendientes): `bookings`, `createBooking`, `setBookingStatus`, `/crm/reservas`. Su apartado "Relación con leads" deja `bookings.lead_id` para "su propia spec o enmienda": es la F5 de esta spec.
  - `trips-catalog.md` (aprobada): `trips.slug` (`maraton-santiago-2027`) y `trips.status`.
- Fuente de negocio (no es requisito técnico): `docs/strategy/commercial-strategy.md` (borrador del usuario, rama `origin/claude/upbeat-keller-44l07z`), §3 canales, §4 ficha y traspasos, §5 experiencia y §8 medición.
- Base revisada: rama `claude/brave-thompson-gmnusb` con PR #12 fusionado (`e6952d7`); última migración `drizzle/0004_fluffy_prodigy.sql`; Worker medido en 1558.52 KiB gzip.

## Objetivo
Carreras Viajeras (MAZ Producciones) vende el paquete de la Maratón de Santiago 42K (mayo de 2027). Tiene 180 registros de su módulo en la Media Maratón de Lima y ninguna venta: hoy el proceso es Google Forms → propuesta por WhatsApp, y ahí se corta el hilo. Las metas son de 30 a 100 corredores.

Esta spec hace que el CRM trabaje "detrás del telón" del recorrido del corredor, con una sola ficha por persona:
- **Origen y medición:** cada lead guarda por qué canal nos conoció (evento, club, referido, redes, web…), con detalle, campaña, referente y preferencia de contacto; la portada del CRM cuenta leads por origen y etapa dentro de una misma cohorte, sin mezclar bases.
- **Entrada por Google Forms e importación:** n8n lleva cada respuesta del formulario y, una sola vez, los 180 registros con consentimiento a la ficha, sin duplicar personas ni enviar bienvenidas en masa.
- **Seguimiento y baja:** como máximo un recordatorio automático por etapa si el corredor no responde, siempre como borrador para revisión humana; y "Pidió no seguir" cierra el seguimiento y bloquea cualquier borrador.
- **Reserva ↔ lead:** la reserva se crea desde la ficha y, al confirmarse, el lead pasa a "Reservado" y la comunicación cambia de vender a acompañar.

Usuarios: el equipo comercial (`commercial` y `admin`, con `leads.manage` y `bookings.manage`), el usuario dueño del negocio (recibe los avisos de n8n por correo) y los corredores, que nunca reciben nada automático: una persona revisa y envía cada mensaje desde WhatsApp Business App.

## Alcance
- Incluye:
  - (F1) Migración `drizzle/0005_*.sql` (una sola, en dos bloques) con todo el modelo de esta spec: en `leads`, `channel`, `origin_detail`, `utm_source`, `utm_medium`, `utm_campaign`, `referred_by`, `referral_permission`, `contact_preference` y `contact_opt_out_at`; vías de entrada `google_form` e `import`; actividades `channel_changed` y `opted_out`; eventos `lead.follow_up_due` y `lead.opted_out` con `outbox_events.dedupe_key`; y `bookings.lead_id`. Relleno de `channel` en los leads existentes. Alta y edición manual con origen, detalle, referente y preferencia, y cambio de origen registrado en el historial. README.
  - (F2) Ficha con origen, campaña, referente, preferencia y baja; historial con "Origen: A → B" y "Pidió no seguir"; acción "Pidió no seguir".
  - (F3) `POST /api/integrations/n8n/leads` (Google Forms e importación), idempotente, con consentimiento versionado y sin duplicar por teléfono; `GET …/leads/{id}` añade `doNotContact` y los datos de origen. Guía de n8n: workflow de Google Forms, importación única de los 180 y cambios del workflow principal.
  - (F4) `POST /api/integrations/n8n/follow-ups/enqueue` (n8n lo llama a diario) y guía de n8n para los recordatorios y la baja.
  - (F5) `bookings.lead_id`: "Crear reserva" desde la ficha con datos precargados; confirmar la reserva pasa el lead a "Reservado" en la misma sentencia y emite `lead.stage_changed` con `trigger: "booking"`; plantillas de acompañamiento en n8n.
  - (F6) Filtro `origen` en la lista de leads y tabla origen × etapa por cohorte en la portada `/crm`.
  - (F7) Captura web con origen: `/contacto?origen=<slug>` y parámetros UTM llegan al lead creado por `createWebLead`.
  - Medición del tamaño del Worker al cerrar cada fase (umbral de consulta: 2 MiB gzip).
- No incluye:
  - Cualquier envío automático al corredor, por ningún canal. WhatsApp Business App sigue manual; nada de automatizar WhatsApp Web, scraping ni importar visualizaciones o contactos de estados de WhatsApp (verlos no autoriza a escribir).
  - Cron Triggers, colas de Cloudflare, `waitUntil` como cola o llamadas del Worker a n8n, a Gemini o a Google (Forms o Sheets): n8n lee la hoja y llama a la API privada.
  - Workflows de n8n como código del repo: solo la guía del README. Credenciales de Google, SMTP y Gemini viven solo en n8n.
  - Bienvenidas, campañas o cualquier envío en lote, también a los 180 importados.
  - Asignación automática de responsable (ver Pregunta abierta 7).
  - "Retomar contacto" tras una baja, editar o borrar bajas, derechos ARCO y anonimización (ver Pregunta abierta 8).
  - Recordatorios automáticos en `reserved`, `paid` o `lost`, y más de uno por etapa.
  - El paso automático a `paid` cuando los pagos cubren el total: depende de `runner-portal.md` F3 (sin implementar) y queda como enmienda declarada (ver "Relación con otras specs").
  - Vincular a un lead reservas ya existentes, o desvincularlas, desde el CRM.
  - Nueva etapa "conversación calificada", lista cerrada de motivos de pérdida, atribución multicanal o puntos de contacto posteriores como datos propios (van en notas del historial).
  - Tasas de conversión, costos, costo por cliente, margen, gráficos o exportación. La portada solo muestra conteos.
  - Persistir el origen o los UTM entre páginas de la landing (cookies o almacenamiento del navegador), píxeles, PostHog o analítica.
  - Cambiar la vía de entrada (`source`) de un lead o editar sus UTM.
  - Detección de duplicados en el alta manual (ver Pregunta abierta 9). La única deduplicación es la de la API de integraciones (Requisito 9).
  - Scripts que escriban en Neon remoto, migraciones automáticas o GRANT. La importación real la lanza el usuario desde n8n contra la web desplegada, con su autorización.

## Requisitos
1. **Dos dimensiones distintas.**
   - **Vía de entrada** (`leads.source`, existente): cómo entró el registro. Valores: `whatsapp` y `other` (alta manual en el CRM), `web_form` (formulario de la landing), y los nuevos `google_form` (respuesta del Google Forms vía n8n) e `import` (importación única vía n8n). Nunca se edita.
   - **Origen** (`leads.channel`, nuevo): por qué canal nos conoció la persona. Se edita en la ficha y cada cambio queda en el historial.
2. **Orígenes** (valor → etiqueta), en este orden en formularios, filtros y tablas:

   | Valor | Etiqueta | Canal de la estrategia (§3) |
   |---|---|---|
   | `event` | Feria, carrera o activación | Ferias, carreras y módulo en eventos (QR) |
   | `partner` | Club, gimnasio o aliado | Clubes y gimnasios |
   | `referral` | Referido | Referidos |
   | `whatsapp` | WhatsApp (mensaje directo) | WhatsApp comercial |
   | `whatsapp_status` | Estado de WhatsApp | Estados y videos de WhatsApp |
   | `instagram` | Instagram | Instagram |
   | `facebook` | Facebook | Facebook |
   | `tiktok` | TikTok | TikTok |
   | `youtube` | YouTube | YouTube |
   | `google_ads` | Google Ads | Google Ads |
   | `luma` | Luma | Luma |
   | `web` | Web | Web (sin otro origen conocido) |
   | `other` | Otro | Otro canal identificado |
   | `unknown` | Desconocido | Origen no identificado ("se pregunta o se marca como desconocido", §4) |

   Etiquetas de la vía de entrada: WhatsApp, Formulario web, Google Forms, Importación y Otro. Preferencia de contacto (`contact_preference`, opcional): WhatsApp, Correo o Llamada.
3. **Datos de origen del lead:**
   - `origin_detail`: opcional, 2–120 caracteres tras recortar (nombre del evento, del aliado, de la campaña o de la publicación). Ayuda en el formulario: "Nombre del evento, aliado, campaña o publicación. No escribas datos personales de otras personas."
   - `utm_source`, `utm_medium`, `utm_campaign`: solo los escribe la captura web (F7), en minúsculas, ≤ 100 caracteres de `[a-z0-9._~+-]`; un valor que no cumple se descarta sin error. No se editan.
   - `referred_by`: opcional, 2–120 (nombre del club o de la persona que lo recomendó, solo si el lead lo menciona; sin teléfono ni correo del referente). `referral_permission` (por defecto falso): "El referente autorizó que lo mencionemos"; exige `referred_by`.
   - `contact_preference`: opcional.
4. **Alta manual (F1):** "Origen" es obligatorio y arranca en "Elige el origen" (sin valor por defecto, para no registrar WhatsApp por inercia); si el comercial no lo sabe, elige "Desconocido". El selector que hoy se llama "Origen" (WhatsApp/Otro) pasa a llamarse "Vía de entrada", con los mismos valores. Detalle, referente, permiso y preferencia son opcionales.
5. **Edición (F1):** "Editar datos" permite cambiar origen, detalle, referente, permiso y preferencia junto con los datos de contacto. Si el origen cambia, la misma sentencia atómica registra una actividad `channel_changed` (origen anterior → nuevo, autor de la sesión); si solo cambia el resto, no se registra actividad (como los datos de contacto en `crm-leads-pipeline.md`).
6. **Ficha e historial (F2):** la tarjeta "Registro" muestra Vía de entrada, Origen ("Etiqueta · detalle"), Campaña (UTM unidos por " / ", o "—"), Referido por (con "puede mencionarse" o "no mencionarlo"), Prefiere y Registrado por (email del autor o, sin autor, la etiqueta de la vía de entrada: "Formulario web", "Google Forms" o "Importación"). El historial muestra "Origen: Desconocido → Feria, carrera o activación" y "Pidió no seguir", y el autor de un `created` sin autor es la etiqueta de la vía de entrada.
7. **Pidió no seguir (F2):** acción de la ficha, con confirmación, para un lead no archivado que aún no la tiene. En una sola sentencia:
   - fija `contact_opt_out_at = now()`, borra la próxima acción y pasa el lead a `lost` con el motivo fijo "Pidió no seguir en contacto." (si ya estaba en `lost`, conserva su motivo);
   - inserta `stage_changed` (solo si la etapa cambia, con ese motivo) y `opted_out`, ambas con el autor de la sesión;
   - inserta el evento `lead.opted_out` con `{ "stageFrom" }`. **No** emite `lead.stage_changed` (evita un borrador de despedida).

   En el MVP la baja es definitiva: un lead con baja puede cambiar de etapa (p. ej. si vuelve a escribir y reserva), pero nunca tiene próxima acción (la base lo impide y `setNextAction` devuelve `"opted_out"`), no entra en los recordatorios y n8n descarta sus borradores (`doNotContact`).
8. **Entrada por Google Forms e importación (F3):** `POST /api/integrations/n8n/leads` crea un lead con `source = google_form | import`, sin responsable ni autor, etapa `new`, y exige una versión de consentimiento de la lista cerrada de su vía (`google-form-v1`; `import-mml-v1`) y la fecha en que se dio (`consentedAt`). En una sola CTE inserta el lead, su actividad `created` y el evento `lead.created` con `{ "source", "bulk" }`, donde `bulk` es `true` solo si `source = import` (lo decide el servidor, no la petición).
9. **Idempotencia y una sola ficha por persona (F3):**
   - `externalId` (id de la respuesta o de la fila) identifica el registro dentro de su vía: el servidor deriva de `"<source>:<externalId>"` el `idempotency_key` (UUID) y guarda `submission_hash` (SHA-256 de los datos normalizados), como la captura web. Misma clave y mismos datos → `duplicate` sin crear nada; misma clave y datos distintos → `conflict`.
   - Si ya existe un lead con el mismo teléfono, no archivado, o archivado con baja, no se crea otro y se responde `existing` con su id: nadie que pidió no seguir vuelve a entrar por una importación.
10. **Recordatorios (F4):** `POST /api/integrations/n8n/follow-ups/enqueue` inserta en una sola sentencia un evento `lead.follow_up_due` `{ "stage", "dueOn" }` por cada lead no archivado, sin baja, en `new`, `contacted` o `quoted`, con la próxima acción para hoy o vencida (hoy de `America/Lima`, calculado en el servidor). Como máximo `limit` (por defecto 20, máximo 50) por llamada, los más vencidos primero.
11. **Un solo recordatorio automático por etapa sin respuesta (F4):** se cuenta por **episodio de etapa**: el periodo desde el último `stage_changed` del lead (o desde su alta si no tiene ninguno). Cada evento lleva `dedupe_key = "follow_up:<lead_id>:<id del último stage_changed | created>"`, único en la base: repetir la llamada el mismo día o los siguientes no crea otro evento para ese episodio aunque la próxima acción siga vencida o se reprograme. Un cambio de etapa (señal de respuesta o avance) abre un episodio nuevo. Después del recordatorio, lo que siga lo decide una persona en el CRM.
12. **Reserva ↔ lead (F5):**
   - `bookings.lead_id` opcional; como máximo una reserva no cancelada por lead (un lead es una persona; el acompañante tiene su propia reserva, sin lead o con el suyo).
   - "Crear reserva" en la ficha abre `/crm/reservas/nueva?lead=<id>` con nombre, correo y viaje del lead precargados y el vínculo en un campo oculto. Si el lead ya tiene una reserva activa, la ficha muestra "Ver reserva" en su lugar.
   - Confirmar una reserva vinculada pasa el lead a `reserved` en la misma sentencia (si no está ya en `reserved` o `paid` ni archivado; sale de `lost` borrando su motivo), con una actividad `stage_changed` ("Reserva confirmada en el CRM.", autor de la sesión) y el evento `lead.stage_changed` con `{ "stageFrom", "stageTo": "reserved", "trigger": "booking" }`. Cancelar una reserva no cambia la etapa del lead.
   - Desde `reserved`, la comunicación es de acompañamiento: no hay recordatorios automáticos (Requisito 10) y las plantillas de `reserved` y `paid` de n8n acompañan, no venden.
13. **Medición (F6):** la portada `/crm` (con `leads.manage`) muestra una tabla de conteos por origen y etapa de **una cohorte** (mes de alta en `America/Lima`; por defecto el mes en curso), con filtro por viaje. Por defecto excluye los leads importados (los 180 históricos se ven por separado con "Solo importados") y siempre excluye los archivados. Columnas: Origen, Total, una por etapa, Pidieron no seguir y Sin responsable. Sin tasas, porcentajes ni comparaciones entre cohortes. La lista de leads gana el filtro `origen` (`?origen=<valor>`), que el embudo respeta como el de responsable, y la columna "Origen" de la tabla muestra el canal.
14. **Captura web con origen (F7):** `/contacto?origen=<slug>&utm_source=…&utm_medium=…&utm_campaign=…` envía esos valores en campos ocultos. El servidor resuelve `origen` contra una lista cerrada de slugs (`modules/crm/utils/leadOrigins.ts`) a `channel` y `origin_detail`; sin slug válido, `channel = 'web'`. Un slug desconocido no se guarda.
15. **Privacidad y seguridad:**
    - Ningún dato personal (nombre, teléfono, correo, referente, detalle del origen) llega a logs, a `Error.message` ni a respuestas de error; las rutas de integración siguen registrando solo `"integrations: request failed"`.
    - A Gemini solo llegan `firstName`, la etapa y el viaje o destino (`crm-leads-capture.md`, Requisito 12). El origen, el detalle, el referente, la preferencia y las fechas nunca se envían a Gemini; los recordatorios se distinguen con el texto fijo del prompt, no con datos.
    - La API de integraciones no usa sesiones; el CRM sigue protegido por `leads.manage` y `bookings.manage` (`getCrmAccess` en páginas, `requirePermission` en acciones). El autor de toda acción del CRM es el usuario de la sesión.
16. **Concurrencia:** cada escritura es una sola sentencia (CTE) o un `db.batch` y decide con su `WHERE` y los índices únicos (idempotencia, `dedupe_key`, reserva activa por lead), nunca con una lectura previa de otra petición.

## Criterios de aceptación

Fase 1 (modelo y origen en el alta y la edición):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera solo `drizzle/0005_*.sql` (más su snapshot y el journal) con:
  - `ALTER TYPE … ADD VALUE` de `lead_source` (`google_form`, `import`), `lead_activity_type` (`channel_changed`, `opted_out`) y `outbox_event_type` (`lead.follow_up_due`, `lead.opted_out`);
  - `CREATE TYPE` de `lead_channel` y `contact_preference`;
  - las columnas nuevas de `leads` (`channel` con `DEFAULT 'unknown' NOT NULL`), `lead_activities` (`channel_from`, `channel_to`), `outbox_events` (`dedupe_key`) y `bookings` (`lead_id` con FK), sus CHECK e índices, y `leads_created_by_chk` sustituido.

  Más dos `UPDATE` de relleno añadidos a mano tras el `ADD COLUMN "channel"` (Diseño técnico). El SQL no contiene `neon_auth`, `CREATE SCHEMA`, `DROP TABLE`, `DROP TYPE` ni `DROP COLUMN`, ni cambios en `profiles`, `staff_*` o `trips`; el único `DROP` es el `DROP CONSTRAINT "leads_created_by_chk"`. `drizzle.config.ts` no cambia.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dada `0005` aplicada en dos bloques después de `0004`, entonces:
  - los leads previos con `source = 'whatsapp'` tienen `channel = 'whatsapp'`, los `web_form` tienen `'web'` y los `other`, `'unknown'`;
  - la base acepta un lead `google_form` o `import` sin `created_by` y rechaza uno `whatsapp` sin él;
  - rechaza: `channel = 'foo'`; `origin_detail` o `referred_by` de 1 o de 121 caracteres; `referral_permission = true` sin `referred_by`; `contact_opt_out_at` con `next_action_date`; un `utm_campaign` de 101 caracteres; una actividad `channel_changed` sin `channel_to` o con origen igual al destino; `channel_from` en una `note`; un `opted_out` o un `channel_changed` sin autor o con texto; un `lead.follow_up_due` sin `dedupe_key`; dos eventos con el mismo `dedupe_key`; dos reservas no canceladas con el mismo `lead_id`; un `lead_id` inexistente.
- [ ] (F1) Dados los schemas de `modules/crm/schemas/leads.schema.ts`, entonces (unit test):
  - `leadSourceSchema` incluye `google_form` e `import`; `leadChannelSchema` tiene los 14 valores en el orden del Requisito 2; `contactPreferenceSchema` y `leadActivityTypeSchema` (con `channel_changed` y `opted_out`); los cuatro coinciden con su enum de la base (como conjunto);
  - `createLeadSchema` sin `channel` devuelve "Elige el origen del lead." en su campo; acepta `unknown`; recorta `originDetail` y `referredBy` (vacíos → `null`; 1 o 121 caracteres → error en su campo); `referralPermission` `"on"` → `true` y ausente → `false`; `true` sin `referredBy` → "Indica quién lo refirió." en `referredBy`; `contactPreference` `""` → `null` y `"sms"` → error; `source: "google_form"` → error; descarta `utmSource`, `contactOptOutAt` y `stage`;
  - `updateLeadSchema` incluye origen, detalle, referente, permiso y preferencia con las mismas reglas, y descarta `source` y los UTM.
- [ ] (F1) Dado `leadDisplay.ts`, entonces cada origen, vía de entrada, preferencia y tipo de actividad tiene etiqueta, y `leadChannelLabel("event", "Media Maratón de Lima 2026")` → "Feria, carrera o activación · Media Maratón de Lima 2026" (sin detalle, solo la etiqueta) (unit test).
- [ ] (F1) Dado `createLead` con la base simulada, entonces inserta `channel`, `origin_detail`, `referred_by`, `referral_permission` y `contact_preference` en su misma sentencia, nunca UTM ni `contact_opt_out_at`, y el payload de `lead.created` sigue siendo `{ source }` (unit test).
- [ ] (F1) Dado `updateLead(input, actorUserId)` con la base simulada, entonces ejecuta **una sola sentencia** (CTE con `FOR UPDATE`) que actualiza contacto y origen y, solo si el origen cambia, inserta `channel_changed` con `channel_from`, `channel_to` y el autor; sigue devolviendo `"updated"`, `"not_found"` (inexistente o archivado) e `"invalid_trip"` (unit test). `updateLeadAction` pasa el id de la sesión y descarta `contactOptOutAt` y `utmSource` (unit test).
- [ ] (F1) Dado `getLeadById`, entonces devuelve `channel`, `originDetail`, `utmSource`, `utmMedium`, `utmCampaign`, `referredBy`, `referralPermission`, `contactPreference` y `contactOptOutAt` (unit test).
- [ ] (F1) Dado `/crm/leads/nuevo`, entonces "Vía de entrada *" ofrece WhatsApp y Otro, y "Origen *" arranca en "Elige el origen" con los 14 orígenes; aparecen "Detalle del origen" (con su ayuda), "Referido por", la casilla "El referente autorizó que lo mencionemos" y "Prefiere que lo contactemos por" (Sin preferencia, WhatsApp, Correo, Llamada). Sin origen, veo "Elige el origen del lead." bajo el campo y se conserva lo escrito. Con origen "Referido", detalle y referente, el lead se crea con esos datos.
- [ ] (F1) Dado `/crm/leads/<id>/editar`, cuando cambio el origen de "Desconocido" a "Instagram" y guardo, entonces vuelvo a la ficha y el historial tiene una actividad nueva con mi email. Si solo cambio el detalle, no aparece ninguna actividad nueva.
- [ ] (F1) Dado el README, entonces la sección "Migración de origen, seguimiento y reservas (`0005`)" explica: revisar el SQL (`grep -inE 'neon_auth|create schema|drop (table|type|column|schema)'`), aplicar después de `0004` en **dos bloques** (1: solo los seis `ALTER TYPE … ADD VALUE`, confirmados; 2: el resto entre `BEGIN;` y `COMMIT;`), comprobar el relleno con `SELECT source, channel, count(*) FROM leads GROUP BY 1, 2;`, sin GRANT ni reaplicar migraciones, y las pruebas manuales del criterio anterior en una rama de desarrollo.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. Tamaño del Worker medido y registrado.

Fase 2 (ficha, historial y «Pidió no seguir»):
- [ ] (F2) Dado un lead con origen "Feria, carrera o activación", detalle, UTM, referente con permiso y preferencia "Llamada", cuando abro su ficha, entonces "Registro" muestra Vía de entrada, "Feria, carrera o activación · <detalle>", la campaña "instagram / social / santiago-2027", "Referido por: <nombre> (puede mencionarse)", "Prefiere: Llamada" y Registrado por. Un lead `import` muestra "Registrado por: Importación"; uno `google_form`, "Google Forms".
- [ ] (F2) Dado el historial de un lead cuyo origen cambió, entonces veo "Origen: Desconocido → Instagram" con el autor y la fecha; el alta de un lead importado muestra el autor "Importación". `listLeadActivities` devuelve `channelFrom`/`channelTo` (unit test).
- [ ] (F2) Dado un lead abierto con próxima acción, cuando pulso "Pidió no seguir" y confirmo, entonces la ficha muestra la etapa "Perdido", el motivo "Pidió no seguir en contacto.", el aviso "Pidió no seguir en contacto el <fecha>. No se programan próximas acciones ni se preparan borradores." en lugar del formulario de próxima acción, y el historial "Etapa: <anterior> → Perdido" y "Pidió no seguir". El botón ya no aparece. Si cancelo, no cambia nada.
- [ ] (F2) Dado un lead ya en "Perdido" (motivo "Precio"), cuando registro "Pidió no seguir", entonces conserva el motivo "Precio" y el historial solo añade "Pidió no seguir".
- [ ] (F2) Dado `optOutLead` con la base simulada, entonces en **una sola sentencia** (CTE con `FOR UPDATE`): fija `contact_opt_out_at`, `stage = 'lost'` y el motivo según el criterio anterior, borra la próxima acción, inserta `stage_changed` solo si la etapa cambia, inserta `opted_out` y el evento `lead.opted_out` `{ stageFrom }`, y no inserta ningún `lead.stage_changed`; devuelve `"opted_out"`, `"no_change"` (ya tenía baja) o `"not_found"` (inexistente o archivado) (unit test).
- [ ] (F2) Dado `setNextAction` sobre un lead con baja, entonces devuelve `"opted_out"` sin escribir, y `setNextActionAction` responde "El contacto pidió no seguir: no se programan próximas acciones." (unit test).
- [ ] (F2) Dada `optOutLeadAction` llamada directamente (unit test): sin sesión → `unauthorized` y sin permiso → `forbidden`, sin llamar al service; `leadId` no UUID → `invalid_input`; usa el id de la sesión e ignora campos extra; `"opted_out"` → éxito "Registrado: pidió no seguir."; `"no_change"` → "Ya estaba registrado que pidió no seguir."; si el service lanza → `"lead action failed"` sin causa ni `console.*`.
- [ ] (F2) Lint, tests y build sin errores. Worker medido.

Fase 3 (entrada por Google Forms e importación):
- [ ] (F3) Dado `createIntegrationLeadSchema`, entonces (unit test):
  - acepta una respuesta `google_form` con `consentVersion: "google-form-v1"` y una fila `import` con `"import-mml-v1"`; normaliza el teléfono como el alta manual (`"+51 938-127 170"` → `"+51938127170"`) y el email a minúsculas;
  - convierte `""` en `null` en los opcionales y usa `channel: "unknown"` si falta;
  - rechaza: una versión de otra vía (`google_form` con `import-mml-v1`) o desconocida; `consentedAt` sin zona horaria o más de 5 minutos en el futuro; `externalId` con espacios o de 101 caracteres; teléfono sin código de país; `source: "web_form"`;
  - descarta `ownerUserId`, `stage`, `bulk` y `createdBy`.
- [ ] (F3) Dadas las utilidades de `leadKeys.ts`, entonces `deriveIdempotencyKey("import", "mml-2026:17")` siempre devuelve el mismo UUID válido, distinto del de `("google_form", "mml-2026:17")`; `hashSubmission` devuelve 64 caracteres hexadecimales, estables para los mismos datos y distintos si cambia un campo (unit test).
- [ ] (F3) Dado `createIntegrationLead` con la base simulada, entonces (unit test):
  - ejecuta **una sola sentencia** (CTE) que inserta lead, actividad `created` sin autor y evento `lead.created` con `{ source, bulk }` (`bulk` verdadero solo en `import`);
  - el lead va sin `owner_user_id` ni `created_by`, con la versión y la fecha de consentimiento, el `idempotency_key` derivado y el hash, y nunca envía `stage`;
  - resuelve `tripSlug` entre los viajes no archivados;
  - devuelve `created`, `duplicate` (misma clave y hash, o carrera concurrente con `leadId: null`), `conflict` (misma clave y hash distinto), `existing` (teléfono de un lead no archivado o archivado con baja) y `unknown_trip` según la fila devuelta.
- [ ] (F3) Dado `POST /api/integrations/n8n/leads` en `npm run dev` con una rama de desarrollo de Neon (manual del usuario):
  - una respuesta válida → `201 { "status": "created", "leadId" }`; en el CRM aparece "Sin asignar", vía "Google Forms", etapa "Nuevo", y hay un evento `lead.created` `pending` con `bulk: false`;
  - la misma petición otra vez → `200 { "status": "duplicate", "leadId" }`; con otro nombre y el mismo `externalId` → `409 { "error": "conflict" }`;
  - otra respuesta con el teléfono de un lead existente → `200 { "status": "existing", "leadId": <el existente> }` sin crear nada;
  - `tripSlug: "no-existe"` → `422 { "error": "unknown_trip" }`; un cuerpo inválido o de más de 4 KiB → `400 { "error": "invalid_request" }`; sin token → 401; sin `N8N_API_TOKEN` → 503. Ninguna respuesta repite datos enviados.
- [ ] (F3) Dado `GET /api/integrations/n8n/leads/<id>`, entonces añade exactamente `channel`, `originDetail`, `contactPreference`, `nextActionDate` y `doNotContact` (`true` si el lead tiene baja) a los campos actuales, y sigue sin exponer ciudad, notas, consentimiento, referente, UTM ni ids de usuario (unit test).
- [ ] (F3) Dado el README, entonces "Automatizaciones con n8n" documenta:
  - la petición nueva y los campos nuevos de la lectura en la tabla de la API, con sus respuestas;
  - en el workflow principal: "¿Sigue vigente?" hace ack sin preparar nada si `doNotContact` es verdadero o si el evento es un `lead.created` con `bulk: true`; el aviso de "nuevo lead" también se envía para `source = "google_form"`; el correo añade "Origen: <etiqueta> · <detalle>" y "Prefiere: …", y con preferencia "Correo" lleva un enlace `mailto:` en lugar de `wa.me`;
  - el workflow "Alta desde Google Forms" (Google Sheets Trigger → "Normalizar" → POST → aviso si `existing` o error);
  - el workflow "Importación única" (archivo → filtro de consentimiento → "Normalizar" → bucle con espera → POST → un solo correo de resumen con conteos por estado y números de fila con error, sin datos personales), con la prueba previa en `npm run dev` y una rama de desarrollo con 3 filas, y la advertencia de que la importación real la lanza el usuario contra la web desplegada.
- [ ] (F3) Lint, tests y build sin errores. Worker medido.

Fase 4 (recordatorios y baja en n8n):
- [ ] (F4) Dado `enqueueFollowUps(today, limit)` con la base simulada, entonces ejecuta **una sola sentencia** que selecciona leads con `archived_at IS NULL`, `contact_opt_out_at IS NULL`, etapa `new`, `contacted` o `quoted` y `next_action_date <= today`, excluye los que ya tienen evento para su episodio, ordena por `next_action_date` y alta, aplica `limit`, inserta `lead.follow_up_due` con `{ stage, dueOn }` y el `dedupe_key` del Requisito 11 con `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, y devuelve el número insertado (unit test).
- [ ] (F4) Dado `enqueueRequestSchema`, entonces sin cuerpo `limit` es 20; 0, 51 o no numérico → error (unit test).
- [ ] (F4, manual del usuario en una rama de desarrollo) Dados un lead en "Contactado" con próxima acción de ayer, otro con baja, otro "Reservado" con próxima acción vencida y otro con la próxima acción mañana, cuando llamo a `POST …/follow-ups/enqueue` dos veces, entonces la primera responde `200 { "enqueued": 1 }` y la segunda `{ "enqueued": 0 }`. Si al día siguiente la próxima acción sigue vencida, sigue en 0; si cambio la etapa a "Cotizado" con una próxima acción vencida, la siguiente llamada devuelve 1.
- [ ] (F4) Dado el README, entonces documenta:
  - el workflow "Recordatorios diarios" (Schedule Trigger a las 09:00 de Lima → `POST …/follow-ups/enqueue` con `{ "limit": 20 }`);
  - en el workflow principal, un Switch "Tipo de evento" antes de "Datos para Gemini":
    - `lead.opted_out` → correo "Pidió no seguir: <fullName>. Descarta cualquier borrador pendiente de este lead." sin Gemini → "Guardar procesado" → "Ack";
    - `lead.follow_up_due` → la etapa es `payload.stage`; "¿Sigue vigente?" además hace ack si la etapa actual es otra o si `nextActionDate` es nula o posterior a `payload.dueOn`; un Switch "Etapa del recordatorio" con tres nodos de Gemini cuyo prompt fijo pide un único recordatorio breve, sin presión, que recuerde que puede pedir que no le escribamos más; tres plantillas de respaldo; asunto "Recordatorio para <fullName> · <etapa>" y el aviso "Es el único recordatorio automático de esta etapa.";
  - que los datos enviados a Gemini no cambian (`firstName`, etapa, viaje) y que los workflows anteriores a esta fase hacen ack de los tipos de evento que no conocen sin preparar nada.
- [ ] (F4) Lint, tests y build sin errores. Worker medido.

Fase 5 (reserva ↔ lead):
- [ ] (F5) Dada la ficha de un lead no archivado y sin reserva activa, entonces aparece "Crear reserva" (`/crm/reservas/nueva?lead=<id>`). Al abrirla veo nombre, correo y viaje del lead precargados y el aviso "Esta reserva quedará vinculada al lead «<nombre>». Al confirmarla, el lead pasará a Reservado."; al crearla, la ficha de la reserva muestra "Lead: <nombre>" (enlace a la ficha) y la del lead, "Ver reserva (Pendiente de confirmación)" en lugar de "Crear reserva".
- [ ] (F5) Dado `?lead=` con un id inexistente, archivado o no UUID, entonces el formulario se muestra vacío con "No se encontró el lead indicado: la reserva se creará sin vincular.".
- [ ] (F5) Dado un lead "Cotizado" con una reserva vinculada pendiente, cuando pulso "Confirmar reserva", entonces la reserva queda "Confirmada", el lead "Reservado" (también en la lista), el historial muestra "Etapa: Cotizado → Reservado" con "Reserva confirmada en el CRM." y mi email, y hay un evento `lead.stage_changed` `{ "stageFrom": "quoted", "stageTo": "reserved", "trigger": "booking" }`. Con el lead ya "Reservado", "Pagado" o archivado, solo cambia la reserva. Cancelar la reserva no cambia el lead.
- [ ] (F5) Dado `createBooking` con `leadId`, entonces la misma sentencia comprueba que el lead existe y no está archivado (si no, `"invalid_lead"`) y que no tiene otra reserva no cancelada (si no, `"lead_taken"`); sin `leadId` se comporta como hoy (unit test).
- [ ] (F5) Dado `setBookingStatus(bookingId, "confirmed", actorUserId)` con la base simulada, entonces una sola sentencia confirma la reserva y, si está vinculada y el lead cumple el Requisito 12, actualiza el lead, inserta la actividad con el autor y el evento con `trigger: "booking"`; con `"cancelled"` no toca `leads`; los resultados no cambian (unit test).
- [ ] (F5) Dadas las acciones de reservas (unit test): `changeBookingStatusAction` pasa el id de la sesión; `createBookingAction` acepta `leadId` (UUID o vacío) y mapea `"invalid_lead"` ("El lead ya no existe o está archivado. Crea la reserva sin vincular o recarga la página.") y `"lead_taken"` ("Ese lead ya tiene una reserva activa."); las demás garantías de `runner-portal.md` F2 se mantienen.
- [ ] (F5) Dado el README, entonces los objetivos de Gemini y las plantillas de respaldo de `reserved` y `paid` pasan a tono de acompañamiento (Diseño técnico, "Guía de n8n"), y el correo de un `lead.stage_changed` con `trigger: "booking"` lleva el asunto "Reserva confirmada: <fullName>".
- [ ] (F5) Lint, tests y build sin errores. Worker medido.

Fase 6 (medición por origen y etapa):
- [ ] (F6) Dado `/crm/leads?origen=event`, entonces el filtro "Origen" muestra "Feria, carrera o activación", la lista y los contadores del embudo solo cuentan esos leads, y `origen` se conserva al paginar y al cambiar de etapa. `origen=foo` o repetido → sin filtro. La columna "Origen" de la tabla muestra la etiqueta del canal (unit test de `parseLeadListQuery`/`leadListHref` y de `getLeadList`).
- [ ] (F6) Dado un `commercial` en `/crm`, entonces veo "Leads por origen y etapa", los filtros "Cohorte (mes de alta)", "Viaje" e "Importados" (Excluir, Solo importados) con "Filtrar", y una tabla con una fila por origen con leads (en el orden del Requisito 2) y una fila "Total": Origen, Total, Nuevo, Contactado, Cotizado, Reservado, Pagado, Perdido, Pidieron no seguir y Sin responsable. El pie dice "Leads dados de alta en <mes> · <viaje o Todos los viajes> · <sin importados | solo importados>. Conteos de la etapa actual, sin archivados. No son tasas de conversión.". Sin datos: "No hay leads en esta cohorte.".
- [ ] (F6) Dados 3 leads de Instagram de octubre (uno "Cotizado", uno "Perdido" con baja y uno sin responsable), un lead de octubre archivado y uno importado en octubre, cuando abro `/crm?cohorte=2026-10`, entonces Instagram tiene Total 3, Cotizado 1, Perdido 1, Pidieron no seguir 1 y Sin responsable 1, y ni el archivado ni el importado cuentan; con "Solo importados" solo cuenta el importado.
- [ ] (F6) Dado `getLeadReport` con la base simulada, entonces un solo `db.batch` (conteos agrupados por origen con `FILTER`, meses disponibles y viajes) aplica la cohorte por mes de `America/Lima`, el viaje, la exclusión o selección de importados y `archived_at IS NULL`, y suma la fila "Total" en el servidor (unit test). `leadReportQuerySchema`: `cohorte=2026-13`, `viaje=abc` o `importados=foo` → sin ese filtro (unit test).
- [ ] (F6) Dada una cuenta con acceso al CRM sin `leads.manage` (rol futuro), entonces `/crm` muestra el texto de bienvenida actual sin consultar leads.
- [ ] (F6) Lint, tests y build sin errores. Worker medido.

Fase 7 (origen en la captura web). Requisitos previos: `crm-leads-capture.md` F3 y F4 cerradas; lista de slugs confirmada (Pregunta abierta 6):
- [ ] (F7) Dado `/contacto?origen=qr-modulo&utm_source=Instagram&utm_medium=social&utm_campaign=santiago-2027`, cuando envío el formulario, entonces el lead queda con `channel = 'event'`, `origin_detail` = el detalle del slug y los UTM `instagram`, `social` y `santiago-2027`. Sin `origen`, con `channel = 'web'`; con `origen=desconocido`, también `'web'` y sin detalle.
- [ ] (F7) Dados `resolveLeadOrigin` y `normalizeUtm`, entonces cada slug de la lista da su origen y detalle, un slug vacío o desconocido da `web` sin detalle, y los UTM se recortan y pasan a minúsculas; con caracteres fuera de `[a-z0-9._~+-]` o más de 100, `null` (unit test).
- [ ] (F7) Dado `webLeadFormSchema` con `origen` y UTM inválidos o ausentes, entonces el formulario no da error por ellos (unit test). `createWebLead` envía `channel`, `origin_detail` y los UTM en su misma CTE y su `submission_hash` no cambia con ellos (unit test).
- [ ] (F7) Dado el HTML de `/contacto?origen=…`, entonces los valores viajan en `<input type="hidden">` y la petición del envío sigue siendo una sola Server Action (sin cookies ni almacenamiento nuevos).
- [ ] (F7) Dado el README, entonces documenta cómo crear enlaces y QR (`https://carreras-viajeras.mentec.dev/contacto?origen=<slug>&utm_source=…`), la lista de slugs y que los enlaces deben apuntar a `/contacto`, porque el origen no se conserva al navegar.
- [ ] (F7) Lint, tests y build sin errores. Worker medido.

## Diseño técnico

### Decisiones
1. **Vía de entrada (`source`) y origen (`channel`) por separado.** Medir por canal exige que "cómo entró el registro" no se mezcle con "cómo nos conoció": los 180 entran por importación, pero vienen de un evento; un QR en el módulo puede abrir Google Forms o la web. Por eso `channel` es una columna propia y `source` gana `google_form` e `import` (en lugar de meter esos valores en `channel`):
   - `leads_created_by_chk` necesita saber qué vías crean leads sin autor (sistema);
   - n8n decide por `source` el aviso de "nuevo lead" y por `bulk` el silencio de la importación;
   - así la tabla origen × etapa compara canales, no mecanismos.
2. **`channel` con `DEFAULT 'unknown'` en la base**, pero obligatorio y sin valor por defecto en el alta manual. Si un escritor no sabe el origen (p. ej. `createWebLead` de `crm-leads-capture` F3 antes de la F7 de esta spec), queda "Desconocido", como pide la estrategia (§4), y la migración no exige un orden con la captura web.
3. **Una sola migración `0005` para todas las fases**, como la `0002` de `crm-leads-pipeline` (cada migración es una operación manual en el SQL Editor). Se aplica en **dos bloques** como la `0004`: PostgreSQL no permite usar en la misma transacción un valor de enum recién añadido, y `leads_created_by_chk` y el CHECK de `dedupe_key` mencionan `google_form`, `import` y `lead.follow_up_due`. Los `CREATE TYPE` nuevos sí se usan en el bloque 2.
4. **Relleno de `channel` a mano en la migración:** tras el `ADD COLUMN "channel" … DEFAULT 'unknown' NOT NULL` que genera drizzle-kit, el developer añade al `.sql` (no al snapshot), con un comentario:
   ```sql
   -- Backfill (crm-journey-automation.md): existing leads keep their origin when it is known.
   UPDATE "leads" SET "channel" = 'whatsapp' WHERE "source" = 'whatsapp';--> statement-breakpoint
   UPDATE "leads" SET "channel" = 'web' WHERE "source" = 'web_form';--> statement-breakpoint
   ```
   Los `other` quedan en `unknown`: "Otro" era el mecanismo, no el canal.
5. **El cambio de origen queda en el historial** (`channel_changed` con columnas tipadas, como `stage_changed`): conserva el origen inicial y los cambios posteriores sin sumar dos ventas (§8).
6. **Lista de orígenes y decisiones de `crm-lead-sources.md`:** se adoptan sus 14 canales (con `web` en lugar del mecanismo `web_form`), su orden, sus etiquetas, el selector sin valor por defecto, el detalle de 2–120 caracteres con su ayuda, el cambio registrado en el historial y el filtro `origen` que respeta el embudo. Ver "Relación con otras specs".
7. **Idempotencia de la API reutilizando `leads.idempotency_key` y `submission_hash`:** el servidor deriva un UUID de `"<source>:<externalId>"` (SHA-256 → 16 bytes con versión 8 y variante RFC 9562) y reutiliza la columna, su índice único, su CHECK y la semántica de `createWebLead` (misma clave y datos → duplicado; datos distintos → conflicto). n8n no tiene que generar UUID estables y no hace falta otra columna.
8. **`createIntegrationLead` no reutiliza `createWebLead`:** cambian la clave (derivada, no del navegador), la versión de consentimiento (lista por vía, no fija), el viaje (slug no archivado, no solo publicado, con error explícito si no existe para que la importación no pierda el dato en silencio), la deduplicación (teléfono sin ventana de tiempo, incluidas las bajas archivadas), el origen (de la petición) y el payload (`bulk`). Compartir la sentencia exigiría tantos parámetros como diferencias; se reutiliza su **forma** (una CTE `existing → same_phone → trip → new_lead → activity → event`). Vive en `modules/integrations/services/integrationLeads.service.ts`, que ya lee `leads` por `@/lib/db-schema`.
9. **`phoneSchema` pasa a `lib/phone.ts`:** ahora lo usan dos dominios (`crm` e `integrations`; SETUP §1, regla 5). `leads.schema.ts` lo importa y lo reexporta, así `webLeads.schema.ts` (`crm-leads-capture` F3) no cambia.
10. **`bulk` lo decide el servidor** (`source = 'import'`): una petición no puede activar ni silenciar bienvenidas.
11. **Recordatorios con `dedupe_key` por episodio de etapa:** el índice único parcial hace a la vez de regla ("uno por etapa") y de idempotencia, también con dos llamadas concurrentes. El filtro `NOT EXISTS` previo evita que los leads ya avisados ocupen el `limit` cada día. Solo `new`, `contacted` y `quoted` (venta): desde `reserved` se acompaña de forma personal, y el borrador no podría usar la nota de la próxima acción (no se envía a Gemini). Límite diario de 20 para no saturar al equipo con correos.
12. **La baja es definitiva en el MVP**, no se acopla a la etapa en la base (el lead puede reabrirse si vuelve a escribir), pero un CHECK impide la próxima acción y el evento `lead.opted_out` permite a n8n avisar de que se descarten borradores ya enviados por correo. No emite `lead.stage_changed` para no preparar un "despedirse" que contradiga la baja.
13. **Una reserva activa por lead** (índice único parcial `WHERE status <> 'cancelled'`): un lead es una persona y una venta; el acompañante tiene su propia reserva (Decisión 16 de `runner-portal.md`). Así la medición no cuenta dos ventas por un lead.
14. **El lead avanza en la misma sentencia que confirma la reserva** (`setBookingStatus` gana `actorUserId` para el autor de la actividad). La etapa `reserved` deja de depender de que el comercial la marque a mano tras confirmar.
15. **Medición solo con conteos de una cohorte:** una tasa sobre bases mezcladas (cohortes recientes con antiguas, importados con captación nueva) engaña (§8). La tabla muestra una cohorte a la vez, separa los importados y no enlaza a la lista (que no filtra por cohorte), para no sugerir equivalencias.
16. **Slugs de origen en `modules/crm/utils/leadOrigins.ts`:** solo los usa el servidor de `crm`; la landing pasa el texto tal cual en un campo oculto y el servidor lo valida contra la lista. Nada del URL se guarda sin validar, salvo los UTM normalizados.
17. **Tamaño del Worker:** F3 y F4 añaden una ruta cada una; el resto modifica. La última tarea de cada fase ejecuta, en Linux/WSL y sin desplegar, `npm run build:worker` y `npx wrangler deploy --dry-run --outdir <scratch>`, y registra el gzip frente a 1558.52 KiB y al umbral de 2 MiB (límite Free: 3 MiB). Si se supera, se detiene y se consulta.

### Base de datos: `lib/db-schema.ts` (F1) → `drizzle/0005_*.sql`
Todo en `public`, en snake_case. Los valores nuevos de enums existentes se añaden al final.

| Objeto | Definición |
|---|---|
| enum `lead_source` | añade `google_form`, `import` |
| enum `lead_activity_type` | añade `channel_changed`, `opted_out` |
| enum `outbox_event_type` | añade `lead.follow_up_due`, `lead.opted_out` |
| enum `lead_channel` (nuevo) | los 14 valores del Requisito 2 |
| enum `contact_preference` (nuevo) | `whatsapp`, `email`, `call` |
| `leads.channel` | `lead_channel not null default 'unknown'` |
| `leads.origin_detail` | `text`; CHECK `leads_origin_detail_chk`: `IS NULL OR char_length BETWEEN 2 AND 120` |
| `leads.utm_source`, `utm_medium`, `utm_campaign` | `text`; CHECK `leads_utm_chk`: cada uno `IS NULL OR char_length BETWEEN 1 AND 100` |
| `leads.referred_by` | `text`; CHECK `leads_referred_by_chk`: `IS NULL OR char_length BETWEEN 2 AND 120` |
| `leads.referral_permission` | `boolean not null default false`; CHECK `leads_referral_permission_chk`: `NOT referral_permission OR referred_by IS NOT NULL` |
| `leads.contact_preference` | `contact_preference` nulo (sin preferencia) |
| `leads.contact_opt_out_at` | `timestamptz` nulo; CHECK `leads_opt_out_chk`: `contact_opt_out_at IS NULL OR next_action_date IS NULL` |
| `leads_created_by_chk` (sustituye) | `created_by IS NOT NULL OR source IN ('web_form', 'google_form', 'import')` |
| `lead_activities.channel_from`, `channel_to` | `lead_channel` nulos; CHECK `lead_activities_channel_chk`: `CASE WHEN type = 'channel_changed' THEN channel_from IS NOT NULL AND channel_to IS NOT NULL AND channel_from <> channel_to ELSE channel_from IS NULL AND channel_to IS NULL END`. Los CHECK existentes ya prohíben `body` en `channel_changed`/`opted_out` (rama `ELSE`) y exigen su autor (`lead_activities_actor_chk`) |
| `outbox_events.dedupe_key` | `text` nulo; CHECK `outbox_events_dedupe_key_chk`: `(dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 1 AND 120) AND (type <> 'lead.follow_up_due' OR dedupe_key IS NOT NULL)`; índice único parcial `outbox_events_dedupe_key_uq (dedupe_key) WHERE dedupe_key IS NOT NULL` |
| `bookings.lead_id` | `uuid` nulo → `leads.id` `ON DELETE RESTRICT`; índice único parcial `bookings_lead_active_uq (lead_id) WHERE status <> 'cancelled'` |

- **Aplicación manual** (README, F1): bloque 1, los seis `ALTER TYPE … ADD VALUE` solos (sin `BEGIN`, o en su propia transacción confirmada); bloque 2, el resto de `0005` (con el relleno) entre `BEGIN;` y `COMMIT;`. Orden global: `0001` → `0002` → `0003` (reservas) → `0004` (captura y outbox) → `0005`.
- El developer revisa que drizzle-kit genere para `leads_created_by_chk` solo `DROP CONSTRAINT` + `ADD CONSTRAINT` y nada más sobre tablas existentes.
- Comentarios en `lib/db-schema.ts`: qué es `source` frente a `channel`, que los UTM solo los escribe la captura web y que la baja impide la próxima acción.

### Módulo `crm` (F1, F2, F6, F7)
- `schemas/leads.schema.ts` (sin `server-only`; valores literales con test de sincronía con la base, como hoy):
  - (F1) `leadSourceSchema` + `google_form`, `import`; `leadChannelSchema` (14, en el orden del Requisito 2; mensaje "Elige el origen del lead."); `contactPreferenceSchema`; `leadActivityTypeSchema` + `channel_changed`, `opted_out`.
  - (F1) Campos de origen compartidos por el alta y la edición: `channel`; `originDetail` y `referredBy` con `blankToNull` (trim, 2–120; "El detalle del origen debe tener entre 2 y 120 caracteres." / "El referente debe tener entre 2 y 120 caracteres."); `referralPermission` (`"on"` → `true`, ausente → `false`); `contactPreference` con `blankToNull` ("Elige una preferencia de contacto."). Refinamiento común: permiso sin referente → "Indica quién lo refirió." en `referredBy`. Como `.pick()` no admite objetos con refinamientos, `createLeadSchema` y `updateLeadSchema` se construyen desde un objeto base sin refinar y aplican el mismo `superRefine`.
  - (F3) `phoneSchema`: `export { phoneSchema } from "@/lib/phone"` (sin cambio de comportamiento).
  - (F6) `leadListQuerySchema` + `origen: leadChannelSchema.optional().catch(undefined)`. `leadReportQuerySchema`: `cohorte` (`/^\d{4}-(0[1-9]|1[0-2])$/`), `viaje` (`z.uuid()`) e `importados` (`"solo"`), cada uno con `.catch(undefined)`, transformado a `{ cohort?: string; tripId?: string; onlyImported: boolean }`.
- `types/leads.types.ts`:
  - (F1) `LeadChannel`, `ContactPreference`; `LeadDetail` + `channel`, `originDetail`, `utmSource`, `utmMedium`, `utmCampaign`, `referredBy`, `referralPermission`, `contactPreference`, `contactOptOutAt: Date | null`.
  - (F2) `LeadActivity` + `channelFrom`, `channelTo`; `LeadActionState.code` + `"opted_out"`.
  - (F6) `LeadListFilters.channel?: LeadChannel`; `LeadListItem.channel`; `LeadReportFilters`, `LeadReportRow = { channel: LeadChannel; total: number; stages: Record<LeadStage, number>; optedOut: number; unassigned: number }`, `LeadReport = { cohort: string; rows: LeadReportRow[]; totals: Omit<LeadReportRow, "channel">; cohorts: string[]; tripOptions: LeadTripOption[] }`.
- `utils/leadDisplay.ts` (F1): `LEAD_CHANNEL_LABELS`, `LEAD_SOURCE_LABELS` (+ Google Forms, Importación), `CONTACT_PREFERENCE_LABELS`, `LEAD_ACTIVITY_LABELS` (+ `channel_changed: "Origen"`, `opted_out: "Pidió no seguir"`), `leadChannelLabel(channel, detail)`, `OPT_OUT_LOST_REASON = "Pidió no seguir en contacto."`.
- `utils/leadListQuery.ts` (F6): `QUERY_KEYS.channel = "origen"`; el valor viaja tal cual.
- `utils/leadOrigins.ts` (F7, sin `server-only`, puro):
  ```ts
  // Closed list of ?origen= slugs (QR codes and campaign links). Provisional: open question 6.
  export const LEAD_ORIGINS: Record<string, { channel: LeadChannel; detail: string }> = {
    "qr-modulo": { channel: "event", detail: "Módulo en eventos (QR)" },
    "ig-bio": { channel: "instagram", detail: "Enlace de la biografía" },
    "fb-pagina": { channel: "facebook", detail: "Página de Facebook" },
    "tiktok-bio": { channel: "tiktok", detail: "Enlace de la biografía" },
    "wa-estado": { channel: "whatsapp_status", detail: "Estado de WhatsApp" },
  };
  export function resolveLeadOrigin(slug: string | null): { channel: LeadChannel; originDetail: string | null };
  export function normalizeUtm(value: string | null | undefined): string | null; // trim, lower, [a-z0-9._~+-]{1,100} or null
  ```
- `services/leads.service.ts` (`server-only`):
  ```ts
  // F1
  createLead(input, actorUserId)            // + channel, origin_detail, referred_by, referral_permission, contact_preference
  getLeadById(id)                           // + the F1 LeadDetail fields
  updateLead(input, actorUserId): Promise<"updated" | "not_found" | "invalid_trip">;
  //   One statement: target (id, channel, trip_id) FOR UPDATE → updated (contact + origin fields, trip rule unchanged)
  //   RETURNING target.channel AS channel_from → activity 'channel_changed' WHERE channel_from <> $channel.
  // F2
  optOutLead(leadId, actorUserId): Promise<"opted_out" | "no_change" | "not_found">;
  //   target (id, stage, contact_opt_out_at) WHERE archived_at IS NULL FOR UPDATE → updated WHERE contact_opt_out_at
  //   IS NULL (opt-out, stage 'lost', lost_reason = CASE target.stage WHEN 'lost' THEN leads.lost_reason ELSE $reason END,
  //   next_action_* NULL) → stage activity WHERE stage_from <> 'lost' → 'opted_out' activity → event 'lead.opted_out'.
  setNextAction(input)                      // + "opted_out" (target with contact_opt_out_at IS NOT NULL), checked before "closed"
  // F6
  getLeadList(filters, currentUserId, today) // + channel in rows; filters.channel in the list and the funnel counts
  ```
- `services/activities.service.ts` (F2): `listLeadActivities` + `channelFrom`, `channelTo`.
- `services/leadReport.service.ts` (F6, `server-only`):
  ```ts
  export async function getLeadReport(filters: { cohort: string; tripId?: string; onlyImported: boolean }): Promise<LeadReport>;
  //   One db.batch: (1) SELECT channel, count(*), count(*) FILTER (WHERE stage = …) per stage,
  //   count(*) FILTER (WHERE contact_opt_out_at IS NOT NULL), count(*) FILTER (WHERE owner_user_id IS NULL)
  //   FROM leads WHERE archived_at IS NULL AND created_at in the Lima month of `cohort`
  //   [AND trip_id = $trip] AND (onlyImported ? source = 'import' : source <> 'import') GROUP BY channel;
  //   (2) last 24 cohort months with non-archived leads (to_char(created_at AT TIME ZONE 'America/Lima', 'YYYY-MM'));
  //   (3) non-archived trips. Counts map to numbers; rows follow leadChannelSchema order; totals summed here.
  ```
- `actions/leads.actions.ts`: (F1) `updateLeadAction` pasa `actor.id`. (F2) `optOutLeadAction` (`leadIdSchema`, mensajes del criterio de F2; revalida la ficha y la lista) y `setNextActionAction` con `opted_out`.
- (F7) `schemas/webLeads.schema.ts` + `origen`, `utm_source`, `utm_medium`, `utm_campaign` (strings ≤ 200 con `.catch(null)`; nunca dan error) transformados en `originSlug`, `utmSource`, `utmMedium`, `utmCampaign` (con `normalizeUtm`). `services/webLeads.service.ts`: `createWebLead` usa `resolveLeadOrigin` e inserta `channel`, `origin_detail` y los UTM en su CTE; el `submission_hash` sigue siendo el de `crm-leads-capture` (nombre, email, teléfono, destino). `webLeads.actions.ts` y `webLeads.types.ts` no cambian (el tipo se deriva del schema).
- `index.ts`: (F2) `optOutLeadAction`; (F6) `getLeadReport`, `LeadReportFilters`, `LeadReportTable`, `leadReportQuerySchema`.

### Módulo `integrations` (F3, F4, F5)
- `utils/integrationRequest.ts` (F3): exporta su `sha256` actual (sin cambiar nada más).
- `utils/leadKeys.ts` (F3, `server-only`):
  ```ts
  export async function deriveIdempotencyKey(source: "google_form" | "import", externalId: string): Promise<string>; // UUID v8
  export async function hashSubmission(fields: readonly unknown[]): Promise<string>; // SHA-256 hex of JSON.stringify(fields)
  ```
- `schemas/integrations.schema.ts`:
  ```ts
  // F3. "" from a spreadsheet cell becomes null in every optional field.
  export const INTEGRATION_CONSENT_VERSIONS = {
    google_form: ["google-form-v1"],
    import: ["import-mml-v1"],
  } as const;
  export const createIntegrationLeadSchema = z.object({
    source: z.enum(["google_form", "import"]),
    externalId: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/),
    consentVersion: z.string().max(40),                 // refine: in INTEGRATION_CONSENT_VERSIONS[source]
    consentedAt: z.iso.datetime({ offset: true }),       // refine: <= now + 5 min
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,                                  // @/lib/phone
    email: optional(z.string().trim().toLowerCase().pipe(z.email().max(254))),
    tripSlug: optional(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80)),
    destinationText: optional(z.string().trim().min(1).max(120)),
    channel: z.enum(leadChannelEnum.enumValues).default("unknown"),
    originDetail: optional(z.string().trim().min(2).max(120)),
    referredBy: optional(z.string().trim().min(2).max(120)),
    contactPreference: optional(z.enum(contactPreferenceEnum.enumValues)),
  });
  // F4
  export const enqueueRequestSchema = z.object({ limit: z.number().int().min(1).max(50).default(20) });
  ```
- `types/integrations.types.ts`: (F3) `CreateIntegrationLeadInput`, `CreateIntegrationLeadResult`, `IntegrationLead` ampliado, payload `lead.created` con `bulk?`; (F4) payloads `lead.follow_up_due` y `lead.opted_out`; (F5) `trigger?: "booking"` en `lead.stage_changed`.
- `services/integrationLeads.service.ts` (F3):
  ```ts
  export async function createIntegrationLead(input: CreateIntegrationLeadInput): Promise<CreateIntegrationLeadResult>;
  //   One db.execute(sql`WITH existing AS (… WHERE idempotency_key = $key), same_phone AS (… WHERE phone = $phone
  //   AND (archived_at IS NULL OR contact_opt_out_at IS NOT NULL) ORDER BY created_at, id LIMIT 1),
  //   trip AS (… WHERE slug = $slug AND status <> 'archived'), checks AS (trip_ok),
  //   new_lead AS (INSERT … SELECT … FROM checks WHERE trip_ok AND NOT EXISTS existing AND NOT EXISTS same_phone
  //     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, source),
  //   activity AS (INSERT 'created' FROM new_lead), event AS (INSERT 'lead.created',
  //     jsonb_build_object('source', source, 'bulk', $bulk) FROM new_lead)
  //   SELECT created_id, existing_id, existing_hash, phone_id, trip_ok`).
  //   Order: created → existing key (duplicate | conflict) → same phone (existing) → !trip_ok (unknown_trip)
  //   → otherwise a concurrent insert won the key: duplicate with leadId null.
  getIntegrationLead(id)  // + channel, originDetail, contactPreference, nextActionDate, doNotContact
  ```
- `services/followUps.service.ts` (F4, `server-only`):
  ```ts
  export async function enqueueFollowUps(today: string, limit: number): Promise<number>;
  //   One statement: due AS (SELECT id, stage, next_action_date, 'follow_up:' || id || ':' ||
  //     coalesce((SELECT a.id::text FROM lead_activities a WHERE a.lead_id = leads.id AND a.type = 'stage_changed'
  //     ORDER BY a.created_at DESC, a.id DESC LIMIT 1), 'created') AS dedupe_key FROM leads WHERE … ),
  //   ready AS (SELECT … FROM due WHERE NOT EXISTS (SELECT 1 FROM outbox_events e WHERE e.dedupe_key = due.dedupe_key)
  //     ORDER BY next_action_date, created_at, id LIMIT $limit),
  //   inserted AS (INSERT INTO outbox_events (type, lead_id, payload, dedupe_key) SELECT 'lead.follow_up_due', id,
  //     jsonb_build_object('stage', stage, 'dueOn', next_action_date), dedupe_key FROM ready
  //     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id)
  //   SELECT count(*)::int AS enqueued FROM inserted.
  ```
- `index.ts`: (F3) `createIntegrationLead`, `createIntegrationLeadSchema`; (F4) `enqueueFollowUps`, `enqueueRequestSchema`.
- Rutas (solo componen: `handleIntegrationRequest` → `readJsonBody` → service → `integrationJson`; consultar `node_modules/next/dist/docs/` antes de escribirlas):
  - (F3) `app/api/integrations/n8n/leads/route.ts` — `POST`.
  - (F4) `app/api/integrations/n8n/follow-ups/enqueue/route.ts` — `POST`; calcula `getTodayDate()` de `@/lib/dates`.

### Módulo `bookings` (F5)
- `schemas/bookings.schema.ts`: `bookingFormSchema` + `leadId` (`blankToNull(z.uuid())`; `updateBookingSchema` no lo incluye: el vínculo no se edita).
- `types/bookings.types.ts`: `CrmBooking.lead: { id: string; fullName: string } | null`; `BookingActionState.code` + `"invalid_lead"`, `"lead_taken"`.
- `services/bookings.service.ts`:
  ```ts
  createBooking(input, actorUserId): Promise<{ id: string } | "invalid_trip" | "duplicate" | "invalid_lead" | "lead_taken">;
  //   + lead AS (id, not archived), checks lead_ok / lead_free (no other booking with status <> 'cancelled'); same statement.
  getBookingById(id)  // + LEFT JOIN leads → lead { id, fullName } | null
  export async function getLeadBooking(leadId: string): Promise<{ id: string; status: BookingStatus } | null>;
  setBookingStatus(bookingId, status, actorUserId): Promise<"changed" | "invalid_transition">;
  //   One statement: changed AS (UPDATE bookings … RETURNING id, lead_id); for 'confirmed' only:
  //   target AS (SELECT leads.id, leads.stage FROM leads JOIN changed ON changed.lead_id = leads.id
  //     WHERE archived_at IS NULL AND stage NOT IN ('reserved', 'paid') FOR UPDATE OF leads),
  //   lead_updated (stage 'reserved', lost_reason NULL, updated_at) → activity 'stage_changed'
  //   ('Reserva confirmada en el CRM.', actor) → event 'lead.stage_changed' {stageFrom, stageTo, trigger: 'booking'}.
  ```
- `actions/bookings.actions.ts`: `changeBookingStatusAction` pasa `actorUserId`; mensajes de `invalid_lead` y `lead_taken` (criterio de F5), revalida también `/crm/leads/<leadId>` si hay vínculo.
- `components/BookingForm.tsx`: prop opcional `prefill?: { leadId: string; leadName: string; participantName: string; participantEmail: string | null; tripId: string | null }` → valores iniciales, `<input type="hidden" name="leadId">` y el aviso de vínculo.
- `index.ts`: `getLeadBooking`.

### Rutas (`app/`)
| Ruta | Fase | Cambio |
|---|---|---|
| `app/crm/(protected)/leads/[id]/page.tsx` | F2, F5 | F2: `ConfirmActionButton` "Pidió no seguir" (título "¿Registrar que «<nombre>» pidió no seguir en contacto?", descripción "El lead pasará a Perdido, se quitará la próxima acción y n8n no preparará más borradores. No se puede deshacer desde el CRM.", `variant="destructive"`) si no tiene baja; aviso de baja en lugar de `NextActionForm`; `LeadTimeline leadSource`. F5: "Crear reserva" o "Ver reserva (<estado>)" con `getLeadBooking`, si `can(access.user.staffRoles, "bookings.manage")` |
| `app/crm/(protected)/reservas/nueva/page.tsx` | F5 | Lee `?lead=` (UUID; si no, se ignora); con `can(staffRoles, "leads.manage")`, `getLeadById` de `@/modules/crm`; lead no archivado → `prefill`; si no, el aviso del criterio |
| `app/crm/(protected)/reservas/[id]/page.tsx` | F5 | "Lead: <nombre>" enlazado a la ficha si `booking.lead` |
| `app/crm/(protected)/page.tsx` | F6 | `getCrmAccess("leads.manage")`: `ok` → `leadReportQuerySchema.parse(await searchParams)`, cohorte por defecto `getTodayDate().slice(0, 7)`, `getLeadReport` → `h1` "Leads por origen y etapa" + `LeadReportFilters` + `LeadReportTable`; `forbidden` → el texto de bienvenida actual; `unauthenticated` → `redirect("/crm/acceso")` |
| `app/api/integrations/n8n/leads/route.ts` | F3 | `POST` (nueva) |
| `app/api/integrations/n8n/follow-ups/enqueue/route.ts` | F4 | `POST` (nueva) |
| `app/contacto/page.tsx` | F7 | Lee también `origen`, `utm_source`, `utm_medium` y `utm_campaign` (primer valor si llega repetido) y los pasa a `ContactSection` |

### Componentes
| Componente | Tipo | Fase | Detalle |
|---|---|---|---|
| `button`, `input`, `label`, `native-select`, `checkbox`, `card`, `table`, `badge` | shadcn (instalado) | F1–F7 | Formularios, ficha, tabla de medición. `radio-group` y `chart` existen en `@shadcn` y se descartan: el formulario ya usa `NativeSelect` y la medición son conteos sin gráfico (sin dependencias nuevas) |
| `ConfirmActionButton` | existente (`components/shared/ConfirmActionButton.tsx`) | F2 | "Pidió no seguir" |
| `LeadForm` | existente (`modules/crm/components/`) | F1 | "Vía de entrada" (antes "Origen"), "Origen *", "Detalle del origen", "Referido por", casilla de permiso (`Checkbox`) y "Prefiere que lo contactemos por", en alta y edición |
| `LeadDetails` | existente | F2 | Tarjeta "Registro" del Requisito 6; "Contacto: Pidió no seguir el <fecha>" en "Gestión" si hay baja |
| `LeadTimeline` | existente | F2 | Prop nueva `leadSource`; "Origen: A → B", "Pidió no seguir" y autor de `created` sin autor = etiqueta de la vía |
| `LeadFilters`, `LeadTable` | existentes | F6 | Selector "Origen" (Todos + 14); columna "Origen" con el canal |
| `LeadReportFilters` | nuevo, `modules/crm/components/` (Server, `<form method="get" action="/crm">`; no existe un filtro de cohorte) | F6 | `NativeSelect` "Cohorte (mes de alta)" (meses disponibles, el actual por defecto), "Viaje" (Todos + viajes), "Importados" (Excluir, Solo importados), "Filtrar" |
| `LeadReportTable` | nuevo, `modules/crm/components/` (Server, presentacional; ningún componente muestra conteos cruzados) | F6 | `Table` con las columnas del Requisito 13, fila "Total" en `TableFooter` y `TableCaption` con el pie del criterio |
| `BookingForm` | existente (`modules/bookings/components/`) | F5 | Prop `prefill` |
| `ContactForm`, `ContactSection` | existentes (`modules/landing/components/`, tras `crm-leads-capture` F4) | F7 | `ContactSection` recibe `origin: { slug, utmSource, utmMedium, utmCampaign }` y lo pasa a `ContactForm`, que lo envía en campos ocultos |

### Contrato de API (n8n)
Mismas reglas que `crm-leads-capture.md`: `Authorization: Bearer <N8N_API_TOKEN>`, JSON ≤ 4 KiB, `Cache-Control: no-store`, sin CORS; errores comunes 400 `invalid_request`, 401 `unauthorized`, 500 `internal_error` y 503 `not_configured`.

```ts
// (F3) POST /api/integrations/n8n/leads
type CreateIntegrationLeadRequest = {
  source: "google_form" | "import";
  externalId: string;            // /^[A-Za-z0-9_.:-]{1,100}$/: response or row id, unique within its source
  consentVersion: string;        // google_form: "google-form-v1"; import: "import-mml-v1"
  consentedAt: string;           // ISO 8601 with offset, e.g. "2026-09-14T08:12:00-05:00"
  fullName: string;              // 2–120
  phone: string;                 // with country code; normalized to E.164
  email?: string | null;
  tripSlug?: string | null;      // catalog slug of a non-archived trip
  destinationText?: string | null;
  channel?: LeadChannel;         // default "unknown"
  originDetail?: string | null;  // 2–120
  referredBy?: string | null;    // 2–120
  contactPreference?: "whatsapp" | "email" | "call" | null;
};
// 201 { status: "created"; leadId: string }
// 200 { status: "duplicate"; leadId: string | null } | { status: "existing"; leadId: string }
// 409 { error: "conflict" } | 422 { error: "unknown_trip" }

// (F4) POST /api/integrations/n8n/follow-ups/enqueue
type EnqueueRequest = { limit?: number };   // 1–50, default 20
// 200 { enqueued: number }

// (F3) GET /api/integrations/n8n/leads/{id}: IntegrationLead of crm-leads-capture plus
type IntegrationLeadAdditions = {
  channel: LeadChannel;                                // never sent to Gemini
  originDetail: string | null;                         // never sent to Gemini
  contactPreference: "whatsapp" | "email" | "call" | null;
  nextActionDate: string | null;                       // YYYY-MM-DD
  doNotContact: boolean;                               // true: discard any draft (opt-out)
};

// POST …/events/claim: payload by type (payload_version 1, additive)
type ClaimedEventPayload =
  | { source: LeadSource; bulk?: boolean }                                 // lead.created (bulk only from F3)
  | { stageFrom: LeadStage; stageTo: LeadStage; trigger?: "booking" }     // lead.stage_changed (trigger from F5)
  | { stage: "new" | "contacted" | "quoted"; dueOn: string }              // lead.follow_up_due (F4)
  | { stageFrom: LeadStage };                                             // lead.opted_out (F2)
```

### Guía de n8n (README, F3, F4 y F5)
Amplía la sección "Automatizaciones con n8n" sin rehacerla: mismo bucle "Uno a uno", mismos nombres de nodo, misma deduplicación por `event_id`. Credenciales nuevas, solo en n8n: Google (para la hoja de respuestas).
1. **(F3) Workflow principal:**
   - "¿Sigue vigente?" hace ack sin preparar nada si `$('Leer lead').item.json.doNotContact` es verdadero, o si `$('Uno a uno').item.json.type` es `lead.created` y `payload.bulk` es `true` (importación: ni borrador ni correo).
   - Aviso de "nuevo lead" para `source` `web_form` **y** `google_form` (asunto "Nuevo lead (Google Forms): …" en el segundo caso). El correo añade "Origen: <etiqueta> · <detalle>" y "Prefiere: <preferencia>"; con preferencia `email`, el botón es `mailto:<email>?body=<borrador>` en lugar de `wa.me`.
2. **(F3) Workflow "Alta desde Google Forms":** *Google Sheets Trigger* (fila añadida en la hoja de respuestas; no ordenar ni borrar filas) → *Code* "Normalizar" (mapea las columnas reales del formulario, Pregunta abierta 4; teléfono: quita espacios y, si son 9 dígitos que empiezan por 9, antepone `+51`; `externalId = "<id de la hoja>:<número de fila>"`; `consentedAt` desde la marca temporal con `-05:00`; descarta la fila si no marcó el consentimiento) → *HTTP Request* `POST …/leads` (*On Error* → *Continue (using error output)*) → si `status` es `existing`, correo "Este contacto ya está en el CRM: https://carreras-viajeras.mentec.dev/crm/leads/<leadId>"; si hay error, correo "No se pudo registrar la fila <n> del formulario" (sin datos de la persona). El lead nuevo llega al workflow principal por su `lead.created`.
3. **(F3) Workflow "Importación única":** *Read/Write Files* + *Extract from File* (CSV de los 180) → *Filter* "Con consentimiento" → *Code* "Normalizar" (como el anterior; `source: "import"`, `externalId = "mml-2026:<fila>"`, `consentVersion: "import-mml-v1"`, `channel: "event"`, `originDetail` con el nombre del evento, `tripSlug: "maraton-santiago-2027"`) → *Loop Over Items* con *Wait* de 1 s → `POST …/leads` → *Code* "Resumen" → un solo correo con los conteos por `status` y los números de fila con error. Antes: probar con `npm run dev`, una rama de desarrollo de Neon y 3 filas; repetir la importación no duplica (`duplicate`/`existing`). La importación real la lanza el usuario contra la web desplegada, cuando autorice el despliegue.
4. **(F4) Workflow "Recordatorios diarios":** *Schedule Trigger* a las 09:00 (`America/Lima`) → `POST …/follow-ups/enqueue` `{ "limit": 20 }`.
5. **(F4) Workflow principal:** Switch "Tipo de evento" (`lead.created` y `lead.stage_changed` siguen como hoy; `lead.opted_out` y `lead.follow_up_due` según el criterio de F4). Objetivo del recordatorio, en el prompt fijo de sus tres nodos de Gemini: "Escribe un único recordatorio breve y útil, sin presionar: retoma la consulta, ofrece resolver una duda y deja claro que puede responder cuando quiera o pedirnos que no le escribamos más.". Plantillas de respaldo:
   - `new`: "Hola {firstName}, te escribimos de Carreras Viajeras por tu interés en {viaje}. ¿Te ayudamos con alguna duda? Si prefieres que no te escribamos más, dínoslo y lo respetamos."
   - `contacted`: "Hola {firstName}, ¿pudiste pensar en {viaje}? Estamos para resolver cualquier duda. Si prefieres que no te escribamos más, dínoslo y lo respetamos."
   - `quoted`: "Hola {firstName}, ¿pudiste revisar la propuesta de {viaje}? Si te ayuda, la vemos juntos. Si prefieres que no te escribamos más, dínoslo y lo respetamos."
6. **(F5) Acompañamiento:** objetivos de Gemini `reserved` ("Agradece la reserva y transmite que desde ahora le acompañamos en cada paso; sin cifras, sin ofrecer otros viajes ni promociones") y `paid` ("Agradece la confianza y da la bienvenida al viaje; anuncia que le compartiremos la preparación y el itinerario; sin ofrecer otros viajes"). Plantillas:
   - `reserved`: "Hola {firstName}, ¡gracias por reservar tu lugar en {viaje}! Desde ahora te acompañamos en cada paso y te escribiremos con lo que sigue. Equipo Carreras Viajeras"
   - `paid`: "Hola {firstName}, ¡tu viaje a {viaje} ya está completo! Gracias por tu confianza. Te iremos compartiendo la preparación y el itinerario. Equipo Carreras Viajeras"

### Relación con otras specs
- **`crm-lead-sources.md`** (rama `origin/claude/upbeat-keller-44l07z`, marcada aprobada allí; no está en esta rama): resuelve el origen ampliando `lead_source` a 14 valores, con `source_detail` y `source_changed`, y también genera una `0005`. **No pueden convivir.** Esta spec adopta sus decisiones de negocio (Decisión 6) con el modelo de dos dimensiones (Decisión 1). **Sustituida por esta spec** (decisión del usuario, 2026-10-25): no se implementa ni se integra en `main`. Retirarla de la rama del PR #18 lo decide el usuario; el agente no la edita.
- **`crm-leads-capture.md`** (enmiendas declaradas, no aplicadas):
  1. Contrato: `source` de `lead.created` y de `GET …/leads/{id}` admite `google_form` e `import`; `lead.created` gana `bulk`; `lead.stage_changed` gana `trigger` (F5); hay dos tipos de evento nuevos y cinco campos nuevos en la lectura. Todo aditivo, `payload_version` 1.
  2. Requisito 12: el aviso de "nuevo lead" también se envía para `google_form`; los `lead.created` con `bulk: true` no generan correo; los leads con `doNotContact` no generan borrador. La lista de datos hacia Gemini no cambia.
  3. Su F3 (`createWebLead`) puede implementarse sin cambios antes o después de la F1 de esta spec: el `DEFAULT 'unknown'` cubre `channel`. La F7 de esta spec modifica después `webLeads.schema.ts` y `webLeads.service.ts` (y sus tests), `ContactForm`, `ContactSection` y `app/contacto/page.tsx`, que su F4 declara sin cambios: lo hace esta spec, después de esa F4.
  4. Su F5 modifica `changeLeadStage` (`leads.service.ts`): no se ejecuta en paralelo con F1, F2 ni F6 de esta spec. `optOutLead` y `setBookingStatus` no emiten `lead.stage_changed` por esa vía (Decisiones 12 y 14).
- **`crm-leads-pipeline.md`** (enmienda de textos declarada, no aplicada): el selector y el dato que hoy se llaman "Origen" (`source`) pasan a "Vía de entrada"; "Origen" es el canal de esta spec, también en la columna de la lista (F6) y en la ficha. Su decisión 8 ("no se detectan duplicados") se mantiene en el alta manual.
- **`runner-portal.md`:** esta spec es la "propia spec" que su apartado "Relación con leads" prevé para `bookings.lead_id`, y cambia `createBooking` y `setBookingStatus` (código de su F2). **Enmienda declarada para su F3 (pagos), no aplicada:** cuando `addPayment` deja el saldo de una reserva confirmada y vinculada en ≤ 0, la misma sentencia pasa el lead a `paid` (si no está ya en `paid` ni archivado; borra la próxima acción), registra `stage_changed` ("Pago completo registrado en el CRM.", autor de la sesión) y emite `lead.stage_changed` con `trigger: "payment"`; `voidPayment` no revierte la etapa. Hasta entonces, el comercial marca "Pagado" a mano.
- **`platform-neon-foundation.md`:** sin cambios; esta spec cumple su contrato de leads y outbox.

**Orden global recomendado:**
1. F1 de esta spec (aplicar `0005` en la rama de pruebas) → F2.
2. `crm-leads-capture` F3 (independiente; no en paralelo con F2 de esta spec, que toca `modules/crm/index.ts`).
3. F3 de esta spec (el código no espera las respuestas del usuario; activar los workflows y la importación sí: Preguntas 3 y 4) → F4.
4. `crm-leads-capture` F5 → F5 de esta spec (requiere `lead.stage_changed` y su guía).
5. F6 de esta spec (puede adelantarse tras F2; no en paralelo con fases que toquen `leads.service.ts` o `leads.schema.ts`).
6. `crm-leads-capture` F4 (cuando el usuario entregue el texto legal) → F7 de esta spec inmediatamente después; se despliegan juntas.

Las guías de n8n de `crm-leads-capture` F5 y de las F3, F4 y F5 de esta spec tocan el mismo apartado del README: siempre en secuencia.

## Reutilización
- `getDb()`, `db.execute`/`db.batch` y `lib/db-schema.ts`; `npm run db:generate` y el procedimiento en dos bloques de la `0004` (README).
- `getTodayDate()`, `formatCalendarDate()` y `formatDateTime()` de `lib/dates.ts`; `can()` de `lib/auth/permissions.ts`; `getCrmAccess` y `requirePermission`.
- `handleIntegrationRequest`, `readJsonBody`, `integrationJson` y `sha256` de `modules/integrations/utils/integrationRequest.ts`; el patrón de rutas y de tests de `modules/integrations`.
- `phoneSchema` (movido a `lib/phone.ts`), `blankToNull`, `leadIdSchema`, `LEAD_STAGE_LABELS`, `leadOwnerLabel`, `CLOSED_LEAD_STAGES`; la forma de las CTE de `changeLeadStage`, `createLead` y `createWebLead`.
- `ConfirmActionButton` compartido; patrón de formulario de `LeadForm` y `BookingForm`; `<form method="get">` de `LeadFilters`.
- Fake del cliente Neon HTTP de `modules/crm/services/leads.service.test.ts` (y de `outbox.service.test.ts`) para todos los tests de services.
- shadcn instalados: `button`, `input`, `label`, `native-select`, `checkbox`, `card`, `table`, `badge`. No se instala nada.

## Tests
Los de servidor con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`; sin red ni secretos.
- `modules/crm/schemas/leads.schema.test.ts` (F1, F6): casos del criterio de F1 (enums sincronizados con la base, `createLeadSchema` y `updateLeadSchema` con origen, referente, permiso y preferencia; `phoneSchema` sigue pasando sus casos); (F6) `origen` válido, inválido y repetido; `leadReportQuerySchema` del criterio de F6.
- `modules/crm/utils/leadDisplay.test.ts` (F1): una etiqueta por cada valor de origen, vía, preferencia y actividad; `leadChannelLabel` con y sin detalle.
- `modules/crm/services/leads.service.test.ts` (F1, F2, F6): `createLead` con los campos nuevos y el payload sin cambios; `updateLead` en una sentencia, con `channel_changed` condicionado y el actor; `getLeadById` con los campos nuevos; (F2) `optOutLead` con sus tres resultados y el SQL del criterio; `setNextAction` → `"opted_out"`; (F6) `getLeadList` con `channel` en la fila y el filtro en la lista y en los contadores, sin más consultas.
- `modules/crm/services/activities.service.test.ts` (F2): `channel_from`/`channel_to` seleccionados y mapeados.
- `modules/crm/actions/leads.actions.test.ts` (F1, F2): `updateLeadAction` con el actor y campos extra descartados; `optOutLeadAction` y `setNextActionAction` con los casos del criterio de F2.
- `modules/crm/utils/leadListQuery.test.ts` (F6): `origen` ↔ `channel` y conservado por `leadListHref`.
- `modules/crm/services/leadReport.service.test.ts` (F6): un solo batch; zona `America/Lima` y límites del mes; viaje; importados excluidos por defecto o solos; `archived_at is null`; conteos a número; fila total; cohorte vacía → `rows: []` y totales en cero; meses disponibles.
- `modules/integrations/schemas/integrations.schema.test.ts` (F3, F4): casos del criterio de F3; `enqueueRequestSchema`.
- `modules/integrations/utils/leadKeys.test.ts` (F3): casos del criterio de F3, incluido el formato UUID (`z.uuid()` lo acepta).
- `modules/integrations/services/integrationLeads.service.test.ts` (F3): `createIntegrationLead` con sus seis resultados, los parámetros y el `bulk`; `getIntegrationLead` con los cinco campos nuevos (`doNotContact` verdadero y falso).
- `modules/integrations/services/followUps.service.test.ts` (F4): el SQL y los parámetros del criterio de F4 (`today`, `limit`, la clave con `'created'` por defecto y `on conflict … do nothing`) y el conteo devuelto como número.
- `modules/bookings/schemas/bookings.schema.test.ts` (F5): `leadId` vacío → `null`, no UUID → error, válido; `updateBookingSchema` lo descarta.
- `modules/bookings/services/bookings.service.test.ts` (F5): `createBooking` con `invalid_lead` y `lead_taken` y sin lead como hoy; `getBookingById` con `lead`; `getLeadBooking`; `setBookingStatus` con y sin vínculo, con `confirmed` y `cancelled`, actor y evento con `trigger`.
- `modules/bookings/actions/bookings.actions.test.ts` (F5): casos del criterio de F5; los existentes siguen pasando.
- `modules/crm/utils/leadOrigins.test.ts`, `modules/crm/schemas/webLeads.schema.test.ts` y `modules/crm/services/webLeads.service.test.ts` (F7): casos del criterio de F7.
- Sin unit test (SETUP §3): `lib/db-schema.ts` (migración + prueba manual), tipos, `lib/phone.ts` (lo cubren los tests de `leads.schema`), route handlers que solo componen (se prueban a mano con `curl`), páginas de `app/` y componentes de módulo (`LeadForm`, `LeadDetails`, `LeadTimeline`, `LeadFilters`, `LeadTable`, `LeadReportFilters`, `LeadReportTable`, `BookingForm`, `ContactForm`, `ContactSection`): su lógica está en schemas, utils, services y acciones.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer) y con la medición del Worker. Nadie aplica migraciones, despliega ni hace commits.

### Fase 1: modelo y origen en el alta y la edición (5 tareas, 15 archivos: 2 generados por drizzle-kit)
Requisito previo cumplido: esta spec sustituye a `crm-lead-sources.md` (decisión del usuario, 2026-10-25).
- [x] T1 — Schema y migración `0005` (enums, columnas, CHECK, índices y FK de las siete fases); `npm run db:generate`; añadir a mano los dos `UPDATE` de relleno y revisar el SQL · archivos: `lib/db-schema.ts`, `drizzle/0005_*.sql` (generado), `drizzle/meta/0005_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — Schemas, tipos y etiquetas de origen, vía, preferencia y actividades, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadDisplay.ts`, `modules/crm/utils/leadDisplay.test.ts` · depende de: T1 · secuencial
- [x] T3 — `createLead`, `updateLead` (CTE con `channel_changed`) y `getLeadById`; `updateLeadAction` con el actor; con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts`, `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T2 · paralelo (con T4 y T5)
- [x] T4 — `LeadForm`: vía de entrada, origen sin valor por defecto, detalle, referente, permiso y preferencia en alta y edición; medir el Worker cuando T3 y T4 estén terminadas · archivos: `modules/crm/components/LeadForm.tsx` · depende de: T2 · paralelo (con T3 y T5)
- [x] T5 — README: "Migración de origen, seguimiento y reservas (`0005`)" (revisión, dos bloques, relleno, pruebas manuales) · archivos: `README.md` · depende de: T1 · paralelo (con T3 y T4)

### Fase 2: ficha, historial y «Pidió no seguir» (4 tareas, 11 archivos)
Requisitos previos: Fase 1 cerrada y `0005` aplicada en la rama de pruebas.
- [ ] T1 — Tipos, `listLeadActivities` con origen, `optOutLead` y `setNextAction` con baja, con tests · archivos: `modules/crm/types/leads.types.ts`, `modules/crm/services/activities.service.ts`, `modules/crm/services/activities.service.test.ts`, `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: Fase 1 · secuencial
- [ ] T2 — `optOutLeadAction` y `setNextActionAction` con `opted_out`, con tests; export en la API pública · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts`, `modules/crm/index.ts` · depende de: T1 · paralelo (con T3)
- [ ] T3 — `LeadDetails` (registro y baja) y `LeadTimeline` (origen, baja y autor por vía) · archivos: `modules/crm/components/LeadDetails.tsx`, `modules/crm/components/LeadTimeline.tsx` · depende de: T1 · paralelo (con T2)
- [ ] T4 — Ficha: botón "Pidió no seguir", aviso de baja y `leadSource` del historial; medir el Worker · archivos: `app/crm/(protected)/leads/[id]/page.tsx` · depende de: T2, T3 · secuencial

### Fase 3: entrada por Google Forms e importación (5 tareas, 13 archivos)
Requisitos previos: Fase 1 cerrada y `0005` aplicada en la rama de pruebas. Para **activar** los workflows o importar (no para el código): Preguntas abiertas 3 y 4 respondidas.
- [x] T1 — Base compartida: `phoneSchema` en `lib/phone.ts` (reexportado desde `leads.schema.ts`) y `sha256` exportado · archivos: `lib/phone.ts`, `modules/crm/schemas/leads.schema.ts`, `modules/integrations/utils/integrationRequest.ts` · depende de: Fase 1 · secuencial (base, `lib/`)
- [x] T2 — `createIntegrationLeadSchema`, tipos y `leadKeys`, con tests · archivos: `modules/integrations/schemas/integrations.schema.ts`, `modules/integrations/schemas/integrations.schema.test.ts`, `modules/integrations/types/integrations.types.ts`, `modules/integrations/utils/leadKeys.ts`, `modules/integrations/utils/leadKeys.test.ts` · depende de: T1 · secuencial
- [x] T3 — `createIntegrationLead` y los campos nuevos de `getIntegrationLead`, con tests · archivos: `modules/integrations/services/integrationLeads.service.ts`, `modules/integrations/services/integrationLeads.service.test.ts` · depende de: T2 · secuencial
- [x] T4 — API pública del módulo y `POST /api/integrations/n8n/leads`; medir el Worker · archivos: `modules/integrations/index.ts`, `app/api/integrations/n8n/leads/route.ts` · depende de: T3 · secuencial
- [x] T5 — README: contrato, cambios del workflow principal y workflows "Alta desde Google Forms" e "Importación única" (Guía de n8n, apartados 1–3) · archivos: `README.md` · depende de: T2 · paralelo (con T3 y T4)

### Fase 4: recordatorios y baja en n8n (4 tareas, 8 archivos)
Requisitos previos: Fases 2 y 3 cerradas.
- [ ] T1 — `enqueueRequestSchema` y payloads de `lead.follow_up_due` y `lead.opted_out`, con tests · archivos: `modules/integrations/schemas/integrations.schema.ts`, `modules/integrations/schemas/integrations.schema.test.ts`, `modules/integrations/types/integrations.types.ts` · depende de: Fase 3 · secuencial
- [ ] T2 — `enqueueFollowUps` con tests · archivos: `modules/integrations/services/followUps.service.ts`, `modules/integrations/services/followUps.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Export y `POST /api/integrations/n8n/follow-ups/enqueue`; medir el Worker · archivos: `modules/integrations/index.ts`, `app/api/integrations/n8n/follow-ups/enqueue/route.ts` · depende de: T2 · secuencial
- [ ] T4 — README: "Recordatorios diarios", Switch "Tipo de evento", recordatorios y aviso de baja (Guía de n8n, apartados 4–5) · archivos: `README.md` · depende de: T1 · paralelo (con T2 y T3)

### Fase 5: reserva ↔ lead (5 tareas, 14 archivos)
Requisitos previos: Fase 1 cerrada (`bookings.lead_id`) y `crm-leads-capture` F5 cerrada (`lead.stage_changed` y su guía de n8n).
- [ ] T1 — `leadId` en el schema de reservas y tipos, con tests · archivos: `modules/bookings/schemas/bookings.schema.ts`, `modules/bookings/schemas/bookings.schema.test.ts`, `modules/bookings/types/bookings.types.ts` · depende de: — · secuencial
- [ ] T2 — `createBooking` con lead, `getBookingById` con lead, `getLeadBooking` y `setBookingStatus` con avance del lead, con tests · archivos: `modules/bookings/services/bookings.service.ts`, `modules/bookings/services/bookings.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Acciones de reservas (actor, `invalid_lead`, `lead_taken`), con tests · archivos: `modules/bookings/actions/bookings.actions.ts`, `modules/bookings/actions/bookings.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `BookingForm` con `prefill`, export, páginas (nueva reserva, ficha de la reserva, ficha del lead) y `trigger` en el tipo del payload; medir el Worker · archivos: `modules/bookings/components/BookingForm.tsx`, `modules/bookings/index.ts`, `app/crm/(protected)/reservas/nueva/page.tsx`, `app/crm/(protected)/reservas/[id]/page.tsx`, `app/crm/(protected)/leads/[id]/page.tsx`, `modules/integrations/types/integrations.types.ts` · depende de: T3 · secuencial
- [ ] T5 — README: acompañamiento en `reserved` y `paid` y asunto de la reserva confirmada (Guía de n8n, apartado 6) · archivos: `README.md` · depende de: T1 · paralelo (con T2, T3 y T4)

### Fase 6: medición por origen y etapa (5 tareas, 15 archivos)
Requisitos previos: Fase 2 cerrada.
- [ ] T1 — Filtro `origen` y query del informe (schemas, tipos y URL), con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadListQuery.ts`, `modules/crm/utils/leadListQuery.test.ts` · depende de: Fase 2 · secuencial
- [ ] T2 — `getLeadList` con origen, con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T1 · paralelo (con T3 y T4)
- [ ] T3 — `getLeadReport` con tests · archivos: `modules/crm/services/leadReport.service.ts`, `modules/crm/services/leadReport.service.test.ts` · depende de: T1 · paralelo (con T2 y T4)
- [ ] T4 — Componentes: filtro y columna "Origen" en la lista; `LeadReportFilters` y `LeadReportTable` · archivos: `modules/crm/components/LeadFilters.tsx`, `modules/crm/components/LeadTable.tsx`, `modules/crm/components/LeadReportFilters.tsx`, `modules/crm/components/LeadReportTable.tsx` · depende de: T1 · paralelo (con T2 y T3)
- [ ] T5 — API pública y portada `/crm`; medir el Worker · archivos: `modules/crm/index.ts`, `app/crm/(protected)/page.tsx` · depende de: T2, T3, T4 · secuencial

### Fase 7: origen en la captura web (4 tareas, 10 archivos)
Requisitos previos: `crm-leads-capture` F3 y F4 cerradas; Pregunta abierta 6 respondida.
- [ ] T1 — `leadOrigins` (slugs y UTM) con tests · archivos: `modules/crm/utils/leadOrigins.ts`, `modules/crm/utils/leadOrigins.test.ts` · depende de: — · secuencial
- [ ] T2 — `webLeadFormSchema` y `createWebLead` con origen y UTM, con tests · archivos: `modules/crm/schemas/webLeads.schema.ts`, `modules/crm/schemas/webLeads.schema.test.ts`, `modules/crm/services/webLeads.service.ts`, `modules/crm/services/webLeads.service.test.ts` · depende de: T1 · paralelo (con T3 y T4)
- [ ] T3 — Landing: `?origen=` y UTM de `/contacto` a campos ocultos; medir el Worker cuando T2 y T3 estén terminadas · archivos: `app/contacto/page.tsx`, `modules/landing/components/ContactSection.tsx`, `modules/landing/components/ContactForm.tsx` · depende de: T1 · paralelo (con T2 y T4)
- [ ] T4 — README: enlaces y QR con origen, lista de slugs · archivos: `README.md` · depende de: T1 · paralelo (con T2 y T3)

## Preguntas abiertas
Resueltas por el usuario (2026-10-25):
- **`crm-lead-sources.md`:** queda sustituida por esta spec y no se integra. Las dos generaban la `0005` con modelos distintos; sus decisiones de negocio ya están aquí (Decisión 6).

Pendientes del usuario:
1. **(Antes numerada 1, ya resuelta; se conserva la numeración del resto.)**
2. **Condiciones de la reserva de US$200:** monto definitivo, plazo, si es reembolsable y si la preventa de US$1,499 tiene fecha límite. Además, ¿"Confirmar reserva" debe exigir que el pago de la reserva esté registrado? La estrategia (§5 y §8) dice "no marcar reservado hasta confirmar pago y condiciones aceptadas". Recomendación: hasta que existan los pagos (`runner-portal` F3), el equipo confirma la reserva solo tras recibir el pago y la aceptación de condiciones; el README lo indica. Cuando existan, decidir si se bloquea en código.
3. **Textos legales (Ley 29733)** de `google-form-v1` (el consentimiento del Google Forms actual o nuevo) y de `import-mml-v1` (lo que aceptaron los 180 en el módulo de la Media Maratón de Lima). Deben cubrir el seguimiento comercial (no solo guardar los datos) y a los encargados: n8n en tu computadora, Google (hoja de respuestas), tu proveedor de correo y Gemini (solo nombre de pila y viaje). Si un registro de los 180 no tiene un consentimiento que cubra el contacto, no se importa. Requisito previo para activar los workflows de la F3.
4. **Campos reales del Google Forms:** nombres de las columnas de la hoja de respuestas, formato del teléfono, si hay pregunta de origen ("¿Cómo nos conociste?") y de preferencia de contacto, y cómo se marca el consentimiento. Y de los 180: columnas del CSV, nombre exacto del evento para `originDetail` y fecha de cada registro. Con eso se completa el *Code* "Normalizar" de la guía.
5. **`referred_by` y el permiso del referente.** ¿Se puede guardar el nombre de quien recomendó sin su consentimiento? Recomendación: guardar solo el nombre del club o aliado, o el de la persona solo si el lead lo menciona, sin sus datos de contacto; marcar "El referente autorizó que lo mencionemos" solo con su permiso expreso. Si el criterio legal es que no se puede, se quita el campo antes de aprobar (o se limita a clubes).
6. **Lista inicial de slugs de `?origen=`** (F7). Propuesta provisional: `qr-modulo` (Feria · "Módulo en eventos (QR)"), `ig-bio`, `fb-pagina`, `tiktok-bio` y `wa-estado`. Indica cuáles usarás y con qué detalle; si quieres un QR por evento (p. ej. `qr-mml-2026`), cada uno es una entrada de la lista.
7. **Responsable por defecto de los leads importados** (y de los de Google Forms). Por defecto entran "Sin asignar" y se asignan a mano desde el filtro "Sin asignar" (180 asignaciones). Si una sola persona los atiende, se puede añadir un `ownerEmail` opcional a la petición, validado contra el staff activo con `leads.manage`: requiere un cambio de esta spec antes de aprobarla.
8. **Retomar el contacto tras una baja.** Si alguien que pidió no seguir vuelve a escribir por iniciativa propia, ¿cómo se reactiva? Recomendación: una acción futura "Retomar contacto" que exija registrar un consentimiento nuevo; mientras tanto, el lead puede cambiar de etapa y reservar, pero sin próxima acción ni borradores.
9. **Duplicados en el alta manual.** La estrategia pide una sola ficha por corredor y el CRM no tiene búsqueda. ¿Quieres que el alta manual avise "Ya hay un lead con este número" con enlace a su ficha? Hoy está fuera (decisión 8 de `crm-leads-pipeline.md`); sería una spec o enmienda posterior.

Decisiones provisionales (se aplican salvo que el usuario diga lo contrario antes de aprobar):
- **P1.** Relleno de los leads existentes: `whatsapp` → WhatsApp, `web_form` → Web, `other` → Desconocido.
- **P2.** Recordatorios automáticos solo en Nuevo, Contactado y Cotizado; como máximo 20 al día, a las 09:00 de Lima.
- **P3.** Un solo recordatorio por episodio de etapa: un cambio de etapa abre otro; reprogramar la próxima acción en la misma etapa no.
- **P4.** La baja pasa el lead a "Perdido" con el motivo "Pidió no seguir en contacto." (si ya estaba perdido, conserva su motivo) y es definitiva desde el CRM.
- **P5.** Una reserva activa por lead; el acompañante tiene su propia reserva, sin lead o con el suyo.
- **P6.** La medición excluye por defecto a los importados y siempre a los archivados, y muestra una cohorte mensual a la vez.
- **P7.** La API de integraciones no duplica personas por teléfono, incluidas las bajas archivadas; un formulario repetido por la misma persona no crea otra ficha y n8n avisa con el enlace a la existente.
