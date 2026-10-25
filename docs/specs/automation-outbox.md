# Eventos, outbox persistente y API privada para n8n

- Módulo: automation
- Estado: aprobado
- Rama: `feat/automation-outbox` (roadmap 3 · Captura y n8n)
- Depende de:
  - `platform-neon-foundation.md` (Fase 1 aprobada): Neon + Drizzle `neon-http` (`getDb()` en `lib/db.ts`, schema en `lib/db-schema.ts`), `lib/env.ts` con validación diferida, migraciones generadas con `npm run db:generate` y aplicadas a mano. Esta spec es la "Fase 3: captura durable mínima" que esa spec deja a una spec separada, salvo el formulario protegido (ver Alcance).
  - `trips-catalog.md` (Fase 1): `trips.slug` como identificador público del viaje de interés.
- Relacionadas: `landing-public-site.md` ("Trabajo futuro → Leads") y `crm-leads-pipeline.md` (obsoleta; se reescribirá sobre Neon). Ninguna se modifica aquí.

## Objetivo
Que ningún aviso de un lead nuevo se pierda aunque n8n esté apagado, se reinicie o falle a mitad de un envío. Los eventos quedan guardados en Neon (outbox) en la misma transacción que el dato que los origina, y n8n Community local los reclama, procesa y confirma por una API privada HTTPS con reintentos. Hasta que exista la captura real de leads, todo se prueba con datos ficticios en una rama Neon de desarrollo.

## Alcance
- Incluye:
  - **Catálogo de eventos versionado.** Un único tipo inicial `lead.created` (versión de payload 1), con schema zod.
  - **Outbox persistente** en Neon: tabla `automation_events` y tabla de auditoría `automation_event_redrives`, con su migración revisable (aplicación manual).
  - **Encolado transaccional:** función del módulo que devuelve la sentencia de inserción del evento para incluirla en el mismo `db.batch([...])` que la inserción del lead (la usará la futura spec de captura).
  - **API privada** para n8n: `claim`, `ack` y `fail`, protegida con bearer secreto, lote limitado, lease con token por intento, recuperación de leases expiradas, backoff con jitter, máximo 8 intentos y luego `dead`.
  - **Reenvío administrativo auditado** de eventos `dead` mediante script SQL manual que deja registro.
  - **Workflows n8n** exportados en JSON y un script SQL de datos ficticios para una rama Neon de desarrollo, con su guía de prueba (incluido el reinicio de n8n).
  - **Aviso por correo al equipo** (F3): n8n envía un correo por cada `lead.created` con el viaje de interés y un enlace al CRM, sin datos personales del interesado.
- No incluye:
  - Formulario de lead protegido (Turnstile, consentimiento versionado, idempotency key, tamaño máximo), tabla `leads` ni cambios en `ContactForm`: van en la spec de captura de leads, que reutilizará el encolado de esta.
  - Otros canales (WhatsApp API, Slack, Telegram…) y correos al interesado: solo se avisa al equipo por correo.
  - Datos personales del interesado en el correo, en la cola o en n8n (nombre, correo, WhatsApp) y un endpoint privado para leer el lead.
  - UI del CRM para ver o reenviar eventos; endpoint de lectura del lead para n8n.
  - Exponer n8n a Internet, conectar el Worker a localhost, entregar `DATABASE_URL` a n8n, usar `waitUntil` como cola, cron de Cloudflare o Queues.
  - Exactly-once: la entrega es al menos una vez y n8n deduplica por `eventId`.
  - Aplicar migraciones o datos ficticios en `production`; crear recursos externos; desplegar.

## Requisitos
1. **Evento `lead.created` v1.** Payload mínimo, sin datos de contacto ni secretos: `{ leadId: uuid, tripSlug: string | null, source: "landing_contact" }`. `tripSlug` se valida con `tripSlugSchema` de `@/modules/trips`, que lo normaliza (recorta espacios y pasa a minúsculas) antes de guardarlo, o es `null`. La fecha del evento es `created_at` de la fila. Cualquier evolución del payload sube `payload_version`; los consumidores rechazan versiones desconocidas.
2. **Un evento por hecho.** Índice único `(type, lead_id)`: el mismo lead no genera dos `lead.created`. `lead_id` no tiene FK todavía (no existe `leads`); la spec de captura la añadirá.
3. **Encolado atómico.** `leadCreatedEventInsert(db, payload)` valida el payload con zod y devuelve una sentencia Drizzle sin ejecutarla, apta para `db.batch([...])` (transacción no interactiva del driver HTTP). Nunca se encola con una segunda llamada HTTP independiente ni después de responder.
4. **Estados:** `pending → processing → succeeded`, `processing → pending` (fallo con reintento o lease expirada) y `processing → dead` (agotados 8 intentos). `dead → pending` solo por reenvío administrativo.
5. **Claim (`POST /api/automation/events/claim`).** Body `{ limit }` entero 1–25 (por defecto 10). Una sola sentencia SQL atómica:
   - marca `dead` (con `last_error_code = 'lease_expired'`) los eventos `processing` con lease vencida y `attempts >= 8`;
   - selecciona con `FOR UPDATE SKIP LOCKED`, por `available_at, id`, hasta `limit` eventos `pending` con `available_at <= now()` o `processing` con lease vencida y `attempts < 8`;
   - para cada uno: `status = processing`, `attempts + 1`, `lease_token = gen_random_uuid()`, `lease_until = now() + 5 minutos`.
   - Responde los eventos reclamados con su `leaseToken` y `leaseExpiresAt`. Dos consumidores simultáneos nunca reciben el mismo evento con un lease vigente.
6. **Ack (`POST /api/automation/events/{id}/ack`).** Body `{ leaseToken }`. Solo pasa a `succeeded` si el evento está `processing`, el token coincide y el lease no venció; guarda `processed_at`. Repetir el ack con el mismo token sobre un evento ya `succeeded` responde éxito (idempotente). Token antiguo, lease vencida o evento inexistente → `409`.
7. **Fail (`POST /api/automation/events/{id}/fail`).** Body `{ leaseToken, errorCode }`, con `errorCode` `^[a-z0-9_]{1,64}$` (código propio, nunca texto del proveedor). Con token vigente: si `attempts < 8`, vuelve a `pending` con `available_at = now() + retryDelay(attempts)`; si `attempts >= 8`, pasa a `dead`. Guarda `last_error_code` y limpia el lease. Token antiguo o vencido → `409`.
8. **Backoff con jitter.** `retryDelaySeconds(attempt, random)` = `min(30 · 2^(attempt−1), 3600) · (0.5 + 0.5 · random)`, redondeado a segundos (intento 1 → 15–30 s; intento 8 → 30–60 min).
9. **Autenticación de la API.** `Authorization: Bearer <AUTOMATION_API_TOKEN>`, con el esquema `Bearer ` exacto (sensible a mayúsculas, un solo espacio), comparado en tiempo constante (digest SHA-256 de ambos lados). Falta o no coincide → `401`. Sin secreto configurado o inválido (< 32 caracteres) → `503`, sin indicar qué falta. El secreto se valida de forma diferida solo en estas rutas: su ausencia no afecta al resto de la aplicación ni al build.
10. **Fronteras de entrada y salida.** Bodies validados con zod (estrictos, JSON ≤ 4 KiB; mayor → `413`); `id` UUID (otro valor → `404`). Respuestas JSON con `Cache-Control: no-store`. Errores `{ error: "<código>" }` sin detalles de SQL, entrada ni entorno. Error de base → `503` y log de texto fijo.
11. **Reenvío auditado.** `scripts/sql/redrive-automation-event.sql` recibe `event_id` (id del evento, no del lead), `performed_by` (user_id con una asignación de staff activa en `staff_assignments`) y `reason`; en una sola sentencia inserta la fila en `automation_event_redrives` y devuelve el evento `dead` a `pending` con `attempts = 0`, `available_at = now()`, lease y `last_error_code` vacíos. Si el evento no está `dead` o `performed_by` no es staff activo, no cambia nada. Siempre devuelve una fila que indica si se aplicó.
12. **n8n.** Workflow con Schedule Trigger (cada minuto) que reclama lotes de 25 y vuelve a reclamar mientras el lote venga lleno, deduplica por `eventId` entre ejecuciones registrando solo los eventos cuyo correo se envió bien, valida `type` y `payloadVersion`, envía un correo al equipo por cada `lead.created` v1 y llama a `ack` solo si el envío tuvo éxito; ante error llama a `fail` con un `errorCode` propio (p. ej. `email_send_failed`). El bearer (Header Auth) y la cuenta de correo (credencial SMTP de n8n) viven en credenciales de n8n, nunca en el JSON exportado. Un evento desconocido se marca `fail` con `unsupported_event`.
13. **Correo al equipo.** Destinatarios en una variable del workflow (`TEAM_EMAILS`, separada por comas). Asunto `Nuevo lead para <tripSlug>` (o `Nuevo lead sin viaje` si es `null`); cuerpo en texto con el viaje, la fecha del evento y el enlace `<APP_BASE_URL>/crm/leads/<leadId>`, y la indicación de que los datos de contacto solo se ven en el CRM. Sin nombre, correo ni WhatsApp del interesado. Como la entrega es al menos una vez, un fallo tras enviar y antes del `ack` puede duplicar un correo; la deduplicación por `eventId` lo evita salvo que n8n pierda su historial.
14. **Datos ficticios.** `scripts/sql/seed-automation-demo.sql` inserta eventos `lead.created` con UUID y slugs ficticios fijos, solo en una rama Neon de desarrollo, idempotente, con un modo de limpieza (`-v cleanup=on`) que borra solo esos eventos y sus reenvíos. Nunca se ejecuta en `production`.

## Criterios de aceptación
### Fase 1 — Outbox y eventos
- [ ] Dado `lib/db-schema.ts`, cuando se ejecuta `npm run db:generate`, entonces se genera `drizzle/0002_*.sql` solo con objetos en `public` (`grep -i neon_auth` vacío): enum de estado, `automation_events`, `automation_event_redrives`, checks e índices descritos en el diseño.
- [ ] Dado un payload `lead.created` válido, cuando se llama a `leadCreatedEventInsert`, entonces devuelve una sentencia de inserción no ejecutada con `type = 'lead.created'`, `payload_version = 1` y el payload validado (con `tripSlug` normalizado); con `leadId` no UUID, `tripSlug` inválido, `source` distinto o campos extra, lanza error de validación.
- [ ] Dado `retryDelaySeconds`, cuando `random` es 0 y 1, entonces devuelve los límites inferior y superior de cada intento 1–8, y nunca supera 3600.
- [ ] Dado `claimEvents(limit)`, cuando se ejecuta, entonces emite una única sentencia con `FOR UPDATE SKIP LOCKED`, el paso a `dead` de leases vencidas con 8 intentos y el límite recibido, y mapea las filas al contrato de respuesta.
- [ ] Dado `ackEvent`, cuando la base no devuelve fila, entonces el resultado es `"conflict"`; cuando devuelve fila, `"ok"`. Dado `failEvent`, sin fila devuelve `{ status: "conflict" }`; con fila, `{ status: "retry", retryAt }` (ISO 8601) o `{ status: "dead" }` si se agotaron los intentos.
- [ ] `npx vitest run modules/automation`, `npm run lint` y `npm run build` pasan sin secretos ni acceso a Neon.

### Fase 2 — API privada
- [ ] Dado un request sin bearer o con bearer incorrecto, cuando llega a cualquiera de las tres rutas, entonces responde `401` sin tocar la base.
- [ ] Dado `AUTOMATION_API_TOKEN` ausente o con < 32 caracteres, cuando llega un request, entonces responde `503` sin nombrar la variable; el resto de rutas y `npm run build` siguen funcionando.
- [ ] Dado un bearer válido, cuando el body es inválido, mayor de 4 KiB o `limit` está fuera de 1–25, entonces responde `400`/`413`; con `id` no UUID, `404`.
- [ ] Dado un bearer válido, cuando `claim` tiene éxito, entonces responde `200 { events: [...] }` con `Cache-Control: no-store`; `ack`/`fail` responden `200` o `409` según el servicio; un error de base responde `503` sin detalles.
- [ ] `lib/env.test.ts` cubre el getter del token (válido, ausente, corto) y el test de la utilidad de bearer cubre coincidencia, longitud distinta, esquema distinto y cabecera ausente.

### Fase 3 — Workflow n8n con aviso por correo, datos ficticios y reenvío
- [ ] Dado el JSON de `n8n/workflows/`, cuando se importa en n8n Community, entonces no contiene secretos ni direcciones reales, usa una credencial Header Auth y una credencial SMTP, y la URL base, el remitente y los destinatarios en un nodo `Config` del workflow (las Variables de n8n no existen en Community); la URL base viene con `http://localhost:3000` para que una prueba no apunte a producción por olvido.
- [ ] Dado un evento ficticio `lead.created` con `tripSlug = 'maraton-demo-2027'`, cuando n8n lo procesa, entonces llega un correo a la dirección de prueba con asunto `Nuevo lead para maraton-demo-2027` y el enlace al CRM, sin datos personales, y el evento queda `succeeded`.
- [ ] Dada una credencial SMTP inválida, cuando n8n procesa un evento, entonces llama a `fail` con `email_send_failed` y el evento vuelve a `pending` con backoff.
- [ ] Checklist manual en una rama Neon de desarrollo (la ejecuta el usuario, con permiso; los agentes no tienen acceso a Neon): con la migración y el seed aplicados y `npm run dev` apuntando a esa rama,
  - [ ] n8n procesa los eventos ficticios, envía un correo por evento a una dirección de prueba (nunca la del equipo real) y quedan `succeeded`;
  - [ ] con n8n apagado los eventos siguen `pending`; al encenderlo se procesan;
  - [ ] si n8n se detiene tras el claim y antes del ack, el evento se reclama de nuevo al vencer el lease (≤ 5 min) y se procesa una sola vez gracias a la deduplicación;
  - [ ] dos ejecuciones de claim simultáneas no reciben el mismo evento;
  - [ ] un ack con token antiguo responde `409`;
  - [ ] un evento forzado a fallar acaba `dead` tras 8 intentos y `redrive-automation-event.sql` lo devuelve a `pending` dejando su fila de auditoría;
  - [ ] la limpieza del seed deja las tablas vacías.
- [ ] README documenta el secreto, la migración, los GRANT necesarios, cómo importar el workflow y la checklist.

## Diseño técnico
### Datos (`lib/db-schema.ts`)
- `automationEventStatusEnum` = `pgEnum("automation_event_status", ["pending", "processing", "succeeded", "dead"])`.
- `automation_events`:

  | Columna | Tipo | Notas |
  |---|---|---|
  | `id` | uuid PK `defaultRandom()` | Es el `eventId` que deduplica n8n |
  | `type` | text not null | check `type IN ('lead.created')` |
  | `lead_id` | uuid not null | Sin FK en esta fase |
  | `payload_version` | integer not null | check `> 0` |
  | `payload` | jsonb not null | Validado con zod antes de insertar |
  | `status` | enum not null default `pending` | |
  | `attempts` | integer not null default 0 | check `BETWEEN 0 AND 8` |
  | `available_at` | timestamptz not null default now() | |
  | `lease_until` | timestamptz | |
  | `lease_token` | uuid | Se conserva al pasar a `succeeded` (ack idempotente) |
  | `last_error_code` | text | check `~ '^[a-z0-9_]{1,64}$'` o null |
  | `created_at` | timestamptz not null default now() | |
  | `processed_at` | timestamptz | |

  Checks: `status = 'processing'` ⇒ `lease_token` y `lease_until` no nulos; `status = 'succeeded'` ⇔ `processed_at` no nulo. Índices: único `(type, lead_id)`; parcial `(available_at, id) WHERE status = 'pending'`; parcial `(lease_until) WHERE status = 'processing'`.
- `automation_event_redrives`: `id` uuid PK, `event_id` uuid FK → `automation_events.id` (`restrict`), `performed_by` text FK → `profiles.user_id` (`restrict`), `reason` text not null (check 1–500 caracteres), `created_at` timestamptz default now().
- Migración generada `drizzle/0004_classy_tenebrous.sql` (+ `meta/0004_snapshot.json`, `meta/_journal.json`; va después de `0002_tough_warpath` de leads y `0003_talented_skin` de reservas), aplicada a mano por el usuario, primero en una rama de desarrollo. Si `DATABASE_URL` usa un rol distinto del owner, necesita `SELECT, INSERT, UPDATE` en `automation_events`; `automation_event_redrives` solo la escribe el script manual con `DATABASE_MIGRATION_URL`.

### Módulo `modules/automation/` (server-only salvo tipos)
- `schemas/automation.schema.ts`: `leadCreatedPayloadSchema` (estricto, reutiliza `tripSlugSchema`, que pasa a exportarse desde la API pública `@/modules/trips`), `claimRequestSchema`, `ackRequestSchema`, `failRequestSchema`, `eventIdSchema`; constantes `MAX_ATTEMPTS = 8`, `LEASE_SECONDS = 300`, `MAX_CLAIM_LIMIT = 25`, `DEFAULT_CLAIM_LIMIT = 10`.
- `types/automation.types.ts`: `LeadCreatedPayload`, `ClaimedEvent`, `AckResult = "ok" | "conflict"`, `FailResult = { status: "retry"; retryAt: string } | { status: "dead" } | { status: "conflict" }` (`retryAt` en ISO 8601, lo devuelve la ruta `fail` de F2; derivados de zod donde aplique).
- `utils/retryDelay.ts`: `retryDelaySeconds(attempt, random = Math.random)`.
- `utils/automationAuth.ts` (F2, server-only porque importa `@/lib/env`):
  - `isAuthorizedAutomationRequest(request, token)` con comparación en tiempo constante;
  - `handleAutomationRequest(request, { schema, eventId? }, handle)`: cadena común de las tres rutas en el orden del Requisito 10 (secreto → 503, bearer → 401, `id` → 404, body leído en streaming hasta 4096 bytes → 413, JSON/schema → 400, error → 503 con log fijo); un body vacío equivale a `{}`;
  - `automationResponse(body, status)`: JSON con `Cache-Control: no-store`.
- `services/automation.service.ts`: `leadCreatedEventInsert(db, payload)`, `claimEvents(limit)`, `ackEvent(id, leaseToken)`, `failEvent(id, leaseToken, errorCode)`. SQL con `sql` de Drizzle donde el query builder no exprese `FOR UPDATE SKIP LOCKED` dentro de un CTE de `UPDATE`; parámetros siempre ligados.
- `index.ts`: exporta los cuatro servicios, `isAuthorizedAutomationRequest`, `handleAutomationRequest` y `automationResponse` (F2), los schemas de request y los tipos.

### Contrato de la API privada (F2)
Rutas delgadas en `app/api/automation/events/claim/route.ts`, `app/api/automation/events/[id]/ack/route.ts` y `app/api/automation/events/[id]/fail/route.ts` (solo `POST`): autentican, validan con los schemas del módulo, llaman al servicio y traducen el resultado.

```ts
// POST /api/automation/events/claim
type ClaimRequest = { limit?: number };            // 1–25, por defecto 10
type ClaimResponse = {
  events: {
    eventId: string;                               // uuid
    type: "lead.created";
    payloadVersion: 1;
    payload: { leadId: string; tripSlug: string | null; source: "landing_contact" };
    attempt: number;                               // 1–8, ya incrementado
    occurredAt: string;                            // ISO 8601
    leaseToken: string;                            // uuid
    leaseExpiresAt: string;                        // ISO 8601
  }[];
};

// POST /api/automation/events/{id}/ack
type AckRequest = { leaseToken: string };
// 200 { status: "succeeded" } | 409 { error: "lease_conflict" }

// POST /api/automation/events/{id}/fail
type FailRequest = { leaseToken: string; errorCode: string }; // ^[a-z0-9_]{1,64}$
// 200 { status: "pending", retryAt: string } | 200 { status: "dead" } | 409 { error: "lease_conflict" }

// Errores comunes: 400 invalid_request · 401 unauthorized · 404 not_found · 413 payload_too_large · 503 unavailable
```

### Entorno (F2)
- `AUTOMATION_API_TOKEN`: secreto aleatorio ≥ 32 caracteres; Cloudflare Secret en el Worker y credencial Header Auth en n8n. Nunca en `wrangler.jsonc`, `NEXT_PUBLIC_*` ni el repositorio.
- `lib/env.ts`: nuevo getter `getAutomationApiToken()` separado de `getEnv()` para que su ausencia solo afecte a la API privada. Se añade vacío a `.env.example` y `.dev.vars.example`.

### n8n (F3, fuera de `modules/` porque no es código de la app)
- `n8n/workflows/automation-outbox-poller.json`: Schedule Trigger 1 min → HTTP Request `claim` → Split Out `events` → IF `type`/`payloadVersion` (lo demás → `fail` con `unsupported_event`) → nodo Code que consulta `$getWorkflowStaticData('global').sentEventIds` (ya enviado → directo a `ack`) → Send Email (SMTP) con el asunto y cuerpo del requisito 13 → nodo Code que registra el `eventId` (y poda entradas de más de 30 días) → HTTP Request `ack`; error del correo → HTTP Request `fail` con `email_send_failed`. Una segunda salida del claim (`¿Lote lleno?`, con `executionOrder v1`) vuelve a reclamar cuando llegan 25 eventos.
  - No se usa el nodo Remove Duplicates: marcaría como visto un evento cuyo correo falló y en el reintento se descartaría sin enviarse. La static data solo persiste en ejecuciones de producción (workflow activo).
- `n8n/README.md`: importar, crear las credenciales (Header Auth `Bearer <token>` y SMTP), rellenar el nodo `Config` (`APP_BASE_URL`, `FROM_EMAIL`, `TEAM_EMAILS`), fijar `TEAM_EMAILS` (una dirección de prueba al usar datos ficticios), fijar la URL base (`http://localhost:3000` solo para la prueba con `npm run dev`; `https://carreras-viajeras.mentec.dev` en producción), ejecutar la checklist.
- `scripts/sql/seed-automation-demo.sql` y `scripts/sql/redrive-automation-event.sql`, con el mismo estilo que `scripts/sql/bootstrap-admin.sql`.

## Reutilización
- `getDb()` (`lib/db.ts`), `lib/db-schema.ts` y el patrón de migración manual de `trips-catalog.md`.
- `lib/env.ts` (validación diferida con zod y errores sin valores).
- `tripSlugSchema` (`modules/trips/schemas/trips.schema.ts`), añadiéndolo a la API pública `modules/trips/index.ts` en lugar de importar internals o duplicar el formato.
- Patrón de test de servicios con cliente Neon falso de `modules/trips/services/trips.service.test.ts`.
- Estilo de los scripts manuales de `scripts/sql/`.
- Sin UI: no se instala nada de shadcn. Sin dependencias nuevas.

## Tests
- `modules/automation/schemas/automation.schema.test.ts`: payload válido; `leadId` inválido; `tripSlug` con mayúsculas o `null`; `source` distinto; campos extra; `limit` 0, 26, decimal y ausente (→ 10); `errorCode` con espacios, mayúsculas o > 64.
- `modules/automation/utils/retryDelay.test.ts`: límites por intento con `random` 0 y 1, tope 3600, redondeo.
- `modules/automation/services/automation.service.test.ts` (cliente Neon falso): sentencia de `leadCreatedEventInsert` y rechazo de payload inválido; SQL y parámetros de `claimEvents` (incluye `SKIP LOCKED`, `limit`, `MAX_ATTEMPTS`, lease) y mapeo de filas; `ackEvent`/`failEvent` con y sin fila devuelta; `failEvent` en el intento 8 → `dead`.
- `modules/automation/utils/automationAuth.test.ts` (F2): bearer (coincidencia, longitud o esquema distintos, cabecera ausente o vacía) y la cadena completa de `handleAutomationRequest` (503, 401, 404, 413 en bytes, 400, body vacío, error → 503 con log fijo). `lib/env.test.ts` ampliado (F2).
- Rutas de `app/` no requieren unit tests (solo componen); su comportamiento se verifica con los criterios de F2.
- Atomicidad real, `SKIP LOCKED` entre consumidores y reinicio de n8n: checklist manual de F3 en rama Neon de desarrollo.

## Plan de tareas
### Fase 1 — Outbox y eventos
Entregable: tablas y migración revisable, contrato del evento y servicios probados, sin rutas. Total: 13 archivos. Hecha; tras fusionar `main` (tabla `leads`, migración `0002_tough_warpath`), la migración del outbox es `drizzle/0004_classy_tenebrous.sql` (tras fusionar también las reservas, `0003_talented_skin`).
- [x] T1 — Schema, migración y export de `tripSlugSchema` · archivos: `lib/db-schema.ts`, `drizzle/0002_*.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json`, `modules/trips/index.ts` · depende de: — · secuencial (base)
- [x] T2 — Schemas, tipos y backoff con tests · archivos: `modules/automation/schemas/automation.schema.ts`, `modules/automation/schemas/automation.schema.test.ts`, `modules/automation/types/automation.types.ts`, `modules/automation/utils/retryDelay.ts`, `modules/automation/utils/retryDelay.test.ts` · depende de: T1 (export de `tripSlugSchema`) · secuencial
- [x] T3 — Servicio con test · archivos: `modules/automation/services/automation.service.ts`, `modules/automation/services/automation.service.test.ts` · depende de: T1, T2 · secuencial
- [x] T4 — API pública del módulo · archivos: `modules/automation/index.ts` · depende de: T3 · secuencial

### Fase 2 — API privada
Entregable: claim/ack/fail operativos con bearer. Total: 10 archivos. Requiere F1.
- [x] T1 — Secreto de la API · archivos: `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.dev.vars.example` · depende de: Fase 1 · secuencial (base, `lib/`)
- [x] T2 — Verificación del bearer con test · archivos: `modules/automation/utils/automationAuth.ts`, `modules/automation/utils/automationAuth.test.ts` · depende de: Fase 1 · paralelo con T1
- [x] T3 — Rutas y export · archivos: `app/api/automation/events/claim/route.ts`, `app/api/automation/events/[id]/ack/route.ts`, `app/api/automation/events/[id]/fail/route.ts`, `modules/automation/index.ts`, y la cadena común en `modules/automation/utils/automationAuth.ts` (+ test) para no triplicarla en las rutas · depende de: T1, T2 · secuencial

### Fase 3 — Workflow n8n con aviso por correo, datos ficticios y reenvío
Entregable: workflow importable que avisa al equipo por correo, datos ficticios, reenvío auditado y guía de prueba. Total: 5 archivos. Requiere F2.
- [x] T1 — Scripts SQL · archivos: `scripts/sql/seed-automation-demo.sql`, `scripts/sql/redrive-automation-event.sql` · depende de: Fase 2 · paralelo con T2
- [x] T2 — Workflow con aviso por correo y guía n8n · archivos: `n8n/workflows/automation-outbox-poller.json`, `n8n/README.md` · depende de: Fase 2 · paralelo con T1
- [x] T3 — Documentación operativa (secreto, migración, GRANT, checklist) · archivos: `README.md` · depende de: T1, T2 · secuencial

## Preguntas abiertas
Resueltas: el aviso es un correo al equipo comercial, sin datos personales, con enlace al CRM (requisito 13).

1. **Proveedor de correo.** El workflow usa el nodo SMTP de n8n, válido para Gmail (contraseña de aplicación), Zoho, Brevo u otro. ¿Qué cuenta enviará los avisos y a qué direcciones del equipo? Se configura en n8n, no en el repositorio.
2. **Enlace al CRM.** `/crm/leads/<id>` llega con la F3 de `crm-leads-pipeline.md`; hasta entonces el enlace no abre la ficha.
3. **Ubicación de los workflows.** Se propone `n8n/` en la raíz porque no es código de la app. ¿Te parece bien o prefieres `docs/n8n/`?
4. **Nombre de la rama.** La tarea indica `feat/automation-outbox`; esta sesión trabaja en la rama asignada `claude/inspiring-edison-m3vgou`. ¿Renombramos al fusionar o se mantiene?
