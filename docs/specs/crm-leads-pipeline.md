# Leads, embudo de ventas y seguimiento

- Módulo: crm
- Estado: borrador
- **OBSOLETA — no aprobar ni implementar.** Depende de Cloudflare D1, Cloudflare Access y de las specs eliminadas `crm-auth.md` y `platform-cloudflare-deploy.md`. Debe reescribirse sobre `platform-neon-foundation.md` (Neon + Drizzle `neon-http` + Neon Auth) antes de pedir aprobación.
- Orden en el roadmap: 3 de 5 (`crm-auth` → `trips-catalog` → `crm-leads-pipeline` → `landing-public-site` → `platform-cloudflare-deploy`)
- Depende de: `crm-auth.md` (layout `/crm`, `CrmShell`, `requireCrmUser()`), `trips-catalog.md` Fases 1–3 (tabla `trips`, `lib/db.ts`, `lib/dates.ts`, `lib/formState.ts`, shadcn `badge`, `field`, `input`, `textarea`, `native-select`; "Patrón de datos").

## Objetivo
Dar al equipo de Carreras Viajeras un CRM mínimo para no perder interesados: recibir los leads que llegan desde la landing, moverlos por el embudo (nuevo → contactado → cotizado → vendido / perdido), apuntar notas de llamadas y mensajes y fijar la próxima acción con fecha.

## Alcance
- Incluye:
  - Tabla D1 `leads` y tabla `lead_activities` (migraciones) con datos de ejemplo locales.
  - `createLead()` + `createLeadSchema` exportados para que la landing cree leads (el formulario y su action van en `landing-public-site` Fase 2).
  - Embudo en `/crm`: una columna por etapa con contador y tarjetas de lead.
  - Detalle `/crm/leads/[id]`: datos del contacto, viaje de interés, mensaje, cambio de etapa, próxima acción (fecha + nota) y, en F3, registro de notas/llamadas/mensajes con autor y fecha.
  - Aviso "Vencida" cuando la fecha de próxima acción es anterior a hoy (zona horaria del negocio).
- No incluye:
  - Alta, edición de datos de contacto o borrado de leads desde el CRM (solo llegan por el formulario).
  - Arrastrar y soltar entre columnas (el cambio de etapa se hace en el detalle).
  - Registro automático de cambios de etapa en el historial, motivo de pérdida, importe de venta.
  - Notificaciones por email, recordatorios, integración con WhatsApp o calendario.
  - Asignación de leads a usuarios, filtros, búsqueda, paginación, exportación.
  - Detección de duplicados por email.

## Requisitos
1. Etapas (valor en BD → etiqueta): `new` Nuevo, `contacted` Contactado, `quoted` Cotizado, `won` Vendido, `lost` Perdido. Todo lead nace en `new`.
2. Un lead tiene: nombre, email, teléfono opcional, viaje de interés opcional, mensaje opcional, etapa, próxima acción (fecha y nota, opcionales) y fechas de alta/actualización.
3. Si se elimina un viaje, sus leads se conservan sin viaje (`ON DELETE SET NULL`); se muestran como "Sin viaje".
4. El embudo muestra las 5 columnas en el orden del requisito 1, con los leads más recientes primero.
5. Próxima acción: si hay nota, la fecha es obligatoria; vaciar ambos campos la elimina.
6. Cada registro de seguimiento tiene tipo (Nota, Llamada, Mensaje), texto (1–2000 caracteres), autor (email del usuario del CRM) y fecha/hora; se listan del más reciente al más antiguo.
7. Todas las Server Actions llaman primero a `requireCrmUser()`.
8. Fechas en español; "hoy" y las horas se calculan en `APP_TIME_ZONE` (ver Preguntas abiertas).

## Criterios de aceptación
- [ ] (F1) Dado el D1 local, cuando ejecuto `npm run db:migrate:local` y `npm run db:seed:local`, entonces existe la tabla `leads` con leads de ejemplo en varias etapas (al menos uno vinculado a "Maratón de Santiago 2027").
- [ ] (F1) Dado un usuario del CRM, cuando abro `/crm`, entonces veo 5 columnas (Nuevo, Contactado, Cotizado, Vendido, Perdido) con su contador y una tarjeta por lead con nombre, email y viaje ("Sin viaje" si no tiene).
- [ ] (F1) Dada una columna sin leads, cuando la veo, entonces muestra "Sin leads".
- [ ] (F1) Dado `createLead({ name, email, phone: null, tripId: null, message: null })`, cuando se ejecuta, entonces inserta un lead con etapa `new` y devuelve el `Lead` creado (unit test).
- [ ] (F1) Dado `createLeadSchema`, cuando recibe campos opcionales vacíos (`""`), entonces los convierte en `null`; rechaza email inválido, nombre de 1 carácter y `tripId` que no es UUID (unit test).
- [ ] (F2) Dada una tarjeta del embudo, cuando hago clic, entonces voy a `/crm/leads/<id>` con nombre, email (enlace `mailto:`), teléfono (enlace `tel:`), viaje, mensaje, etapa actual y fecha de alta.
- [ ] (F2) Dado el detalle, cuando elijo "Cotizado" y pulso "Cambiar etapa", entonces el lead aparece en la columna "Cotizado" del embudo.
- [ ] (F2) Dado el detalle, cuando guardo una próxima acción con fecha y nota, entonces se ve en el detalle y en la tarjeta del embudo; si la fecha es anterior a hoy, ambas muestran la insignia "Vencida".
- [ ] (F2) Dada una nota sin fecha, cuando guardo la próxima acción, entonces veo el error "Indica la fecha" bajo el campo fecha y la nota escrita se conserva.
- [ ] (F2) Dado `/crm/leads/<id-inexistente>`, cuando lo abro, entonces veo la página 404.
- [ ] (F2) Dado un valor de etapa manipulado (p. ej. "foo"), cuando se envía el cambio de etapa, entonces la action lanza error y no actualiza D1 (unit test).
- [ ] (F3) Dado el detalle de un lead, cuando registro una "Llamada" con texto, entonces aparece arriba del historial con tipo, texto, mi email y fecha/hora, y el formulario queda vacío.
- [ ] (F3) Dado el formulario de seguimiento con texto vacío, cuando lo envío, entonces veo el error bajo el campo y no se crea registro.
- [ ] (F2, F3) Dado que no hay usuario del CRM, cuando se invoca cualquier action de leads o seguimiento, entonces lanza "No autorizado" y no toca D1 (unit test).
- [ ] (todas) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

## Diseño técnico
Sigue el "Patrón de datos" de `trips-catalog.md` (Server Components + services D1 + Server Actions; sin axios ni TanStack Query).

### Base de datos
`migrations/0002_create_leads.sql` (F1; incluye ya las columnas de próxima acción para evitar un `ALTER TABLE` en F2):
```sql
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  message TEXT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  next_action_date TEXT,                -- YYYY-MM-DD
  next_action_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```
`migrations/0003_create_lead_activities.sql` (F3):
```sql
CREATE TABLE lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('note', 'call', 'message')),
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX lead_activities_lead_id_created_at ON lead_activities (lead_id, created_at);
```
`db/seed.local.sql` (modificado en F1 y F3, `INSERT OR IGNORE`, datos ficticios): 5–6 leads repartidos por etapas (uno con `trip_id` del viaje de Santiago, uno con próxima acción vencida); en F3, 2–3 registros de seguimiento.

### Rutas (`app/`)
- `app/crm/page.tsx` (F1, reemplaza el provisional de `crm-auth`): `await connection()`, `listLeads()`, `<LeadPipelineBoard leads={leads} />`.
- `app/crm/leads/[id]/page.tsx` (F2): `await connection()`, `getLeadById(id)` → `notFound()` si `null`; compone `LeadDetail`, `LeadStageForm` (con `updateLeadStageAction.bind(null, lead.id)`), `NextActionForm` (con `updateNextActionAction.bind(null, lead.id)`). En F3 añade `listActivities(lead.id)`, `ActivityForm` (con `addActivityAction.bind(null, lead.id)`) y `ActivityTimeline`.

### Componentes
| Componente | Tipo | Detalle |
|---|---|---|
| `card` | shadcn (instalar: `npx shadcn@latest add card`) | Tarjetas del embudo y bloques del detalle |
| `badge` | shadcn (instalado en `trips-catalog` F2) | Etapa, "Vencida", tipo de seguimiento |
| `field`, `input`, `textarea`, `native-select`, `button` | shadcn (instalados en `trips-catalog` F3) | Formularios |
| `LeadPipelineBoard` | nuevo, `modules/crm/components/LeadPipelineBoard.tsx` | Server Component. Props `leads: Lead[]`. Agrupa por etapa en el orden de `LEAD_STAGES`; columna con título, contador y `LeadCard`s; vacío "Sin leads". Scroll horizontal en móvil. No hay kanban en shadcn: se compone con `Card` y `Badge` |
| `LeadCard` | nuevo, `modules/crm/components/LeadCard.tsx` | Server Component. Props `name`, `email`, `tripTitle` (F1); en F2 además `id` (enlace al detalle), `nextActionDate`, `nextActionNote`, `today` e insignia "Vencida" |
| `LeadDetail` | nuevo (F2), `modules/crm/components/LeadDetail.tsx` | Server Component. Datos del contacto y del lead (`mailto:`, `tel:`), fecha de alta con `formatDateTime` |
| `LeadStageForm` | nuevo (F2), `modules/crm/components/LeadStageForm.tsx` | Server Component con `<form action>`: `NativeSelect name="stage"` con las 5 etapas + botón "Cambiar etapa". Sin JS de cliente |
| `NextActionForm` | nuevo (F2), `modules/crm/components/NextActionForm.tsx` | `"use client"`, `useActionState`. Campos `nextActionDate` (`type="date"`) y `nextActionNote`; errores con `FieldError`; mensaje "Próxima acción guardada" |
| `ActivityForm` | nuevo (F3), `modules/crm/components/ActivityForm.tsx` | `"use client"`, `useActionState`. `NativeSelect name="type"` + `Textarea name="content"` + "Registrar" |
| `ActivityTimeline` | nuevo (F3), `modules/crm/components/ActivityTimeline.tsx` | Server Component. Props `activities: LeadActivity[]`. Lista con `Badge` de tipo, texto, autor y `formatDateTime`; vacío "Sin seguimiento todavía" |

### Schemas, tipos, utils
- `modules/crm/schemas/leads.schema.ts`:
  - (F1) `leadStageSchema = z.enum(["new", "contacted", "quoted", "won", "lost"])`.
  - (F1) `leadSchema` (fila con alias camelCase): `{ id, name, email, phone: string|null, tripId: string|null, tripTitle: string|null, message: string|null, stage: leadStageSchema, nextActionDate: z.iso.date().nullable(), nextActionNote: string|null, createdAt, updatedAt }`.
  - (F1) `createLeadSchema` (entrada del formulario público; strings de `FormData`): `name` trim 2–100; `email` trim + `z.email()`; `phone` `""` → `null`, si no trim 6–30 con `/^[+\d\s().-]+$/`; `tripId` `""` → `null`, si no `z.uuid()`; `message` `""` → `null`, si no trim máx. 1000. Mensajes en español.
  - (F2) `nextActionSchema`: `nextActionDate` `""` → `null`, si no `z.iso.date()`; `nextActionNote` `""` → `null`, si no trim máx. 200; refinamiento: nota sin fecha → error en `nextActionDate` "Indica la fecha".
- `modules/crm/schemas/activities.schema.ts` (F3): `activityTypeSchema = z.enum(["note", "call", "message"])`; `leadActivitySchema` (fila: `id, leadId, type, content, createdBy, createdAt`); `activityFormSchema = { type: activityTypeSchema, content: trim 1–2000 }`.
- `modules/crm/types/leads.types.ts`: `LeadStage`, `Lead`, `CreateLeadInput` (F1), `NextActionInput` (F2), derivados con `z.infer`/`z.output`.
- `modules/crm/types/activities.types.ts` (F3): `ActivityType`, `LeadActivity`, `ActivityInput`.
- `modules/crm/utils/leadStages.ts` (F1): `LEAD_STAGES = leadStageSchema.options` y `LEAD_STAGE_LABELS: Record<LeadStage, string>`.
- `modules/crm/utils/activityTypes.ts` (F3): `ACTIVITY_TYPE_LABELS: Record<ActivityType, string>` (Nota, Llamada, Mensaje).
- `lib/dates.ts` (F2, ampliación): `APP_TIME_ZONE` (provisional `"America/Lima"`, ver Preguntas abiertas), `getTodayDate(now = new Date()): string` (`YYYY-MM-DD` en `APP_TIME_ZONE`, con `Intl.DateTimeFormat("en-CA", { timeZone })`) `formatDateTime(iso: string): string` ("18 oct 2026, 10:30" en `APP_TIME_ZONE`) e `isPastDate(date: string | null, today: string): boolean` → `date !== null && date < today` (fechas `YYYY-MM-DD`; decide la insignia "Vencida").

### Services (solo servidor, D1 vía `getDb()`)
```ts
// modules/crm/services/leads.service.ts
// F1
export function createLead(input: CreateLeadInput): Promise<Lead>;      // id = crypto.randomUUID(), stage 'new'
export function listLeads(): Promise<Lead[]>;                           // LEFT JOIN trips → tripTitle; ORDER BY created_at DESC
// F2
export function getLeadById(id: string): Promise<Lead | null>;
export function updateLeadStage(id: string, stage: LeadStage): Promise<void>;          // + updated_at
export function updateNextAction(id: string, input: NextActionInput): Promise<void>;   // + updated_at

// modules/crm/services/activities.service.ts (F3)
export function listActivities(leadId: string): Promise<LeadActivity[]>;              // ORDER BY created_at DESC
export function createActivity(leadId: string, input: ActivityInput, createdBy: string): Promise<LeadActivity>;
```
Nota: `listLeads`/`getLeadById` hacen `LEFT JOIN trips` en SQL (misma base de datos); el módulo `crm` no importa código de `trips`.

### Actions (`"use server"`)
```ts
// modules/crm/actions/leads.actions.ts (F2)
export function updateLeadStageAction(leadId: string, formData: FormData): Promise<void>;
//   requireCrmUser → leadStageSchema.parse(formData.get("stage")) → updateLeadStage → revalidatePath("/crm") y (`/crm/leads/${leadId}`)
export function updateNextActionAction(leadId: string, prev: FormState, formData: FormData): Promise<FormState>;
//   requireCrmUser → nextActionSchema.safeParse → error {fieldErrors, values} | updateNextAction → revalidate → { status: "success", message: "Próxima acción guardada" }

// modules/crm/actions/activities.actions.ts (F3)
export function addActivityAction(leadId: string, prev: FormState, formData: FormData): Promise<FormState>;
//   const user = await requireCrmUser() → activityFormSchema.safeParse → createActivity(leadId, input, user.email)
//   → revalidatePath(`/crm/leads/${leadId}`) → { status: "success", message: "Registro añadido" }
//   Error de D1 (p. ej. lead inexistente por FK) → { status: "error", message: "No se pudo guardar. Inténtalo de nuevo." }
```

### API pública `modules/crm/index.ts`
- F1: añade `LeadPipelineBoard`, `listLeads`, `createLead`, `createLeadSchema`, `type Lead`, `type CreateLeadInput` (se mantiene `CrmShell`).
- F2: añade `LeadDetail`, `LeadStageForm`, `NextActionForm`, `getLeadById`, `updateLeadStageAction`, `updateNextActionAction`.
- F3: añade `ActivityForm`, `ActivityTimeline`, `listActivities`, `addActivityAction`.

## Reutilización
- `lib/db.ts`, `lib/dates.ts` (`formatDate`), `lib/formState.ts` (`FormState`, `INITIAL_FORM_STATE`) de `trips-catalog`.
- `requireCrmUser()` (`crm-auth`) y su `email` como autor del seguimiento.
- shadcn ya instalados por specs anteriores: `badge`, `field`, `input`, `textarea`, `native-select`, `button`. Nuevo: `card`.
- `Intl.DateTimeFormat` nativo; sin librerías de fechas.

## Tests
- `modules/crm/schemas/leads.schema.test.ts`: (F1) `createLeadSchema` válido; vacíos → `null`; email inválido, nombre corto, teléfono con letras, `tripId` no UUID → error; `leadSchema` rechaza etapa desconocida. (F2) `nextActionSchema`: ambos vacíos → `null`/`null`; nota sin fecha → error en `nextActionDate`; fecha inválida → error; nota > 200 → error.
- `modules/crm/services/leads.service.test.ts` (mock de `@/lib/db`): (F1) `createLead` hace `bind` con UUID, campos y devuelve el lead parseado; `listLeads` usa `LEFT JOIN trips` y `ORDER BY created_at DESC`. (F2) `getLeadById` → `null` sin fila; `updateLeadStage` y `updateNextAction` hacen `bind` correcto y actualizan `updated_at`.
- `modules/crm/actions/leads.actions.test.ts` (F2; mock de `@/lib/auth`, service, `next/cache`): sin usuario → lanza y no llama al service; etapa inválida → lanza; etapa válida → `updateLeadStage` + revalida `/crm` y el detalle; próxima acción inválida → `status: "error"` con `fieldErrors` y `values`; válida → `status: "success"`.
- `lib/dates.test.ts` (F2, ampliación): `getTodayDate` con una fecha UTC cercana a medianoche devuelve el día correcto en `APP_TIME_ZONE`; `formatDateTime` formatea en español y en `APP_TIME_ZONE`; `isPastDate`: anterior → `true`, igual a hoy → `false`, posterior → `false`, `null` → `false`.
- `modules/crm/services/activities.service.test.ts` (F3): `createActivity` hace `bind` con UUID, `leadId`, tipo, texto y autor; `listActivities` filtra por `lead_id` y ordena desc.
- `modules/crm/actions/activities.actions.test.ts` (F3): sin usuario → lanza; texto vacío → `fieldErrors.content`; válido → `createActivity(leadId, input, user.email)` y revalida; service lanza → `status: "error"` genérico.
- Sin test: `activities.schema.ts` (reglas triviales), constantes de etiquetas, componentes y páginas.

## Plan de tareas
### Fase 1 — Recepción de leads y embudo
- [ ] T1 — Migración `leads`, seed de leads y shadcn `card` · archivos: `migrations/0002_create_leads.sql`, `db/seed.local.sql`, `components/ui/card.tsx` · depende de: — · secuencial (base)
- [ ] T2 — Schemas, tipos y etapas de lead con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadStages.ts` · depende de: T1 · secuencial
- [ ] T3 — Service `createLead` y `listLeads` con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T2 · secuencial
- [ ] T4 — Embudo: `LeadCard`, `LeadPipelineBoard`, página `/crm` y exports · archivos: `modules/crm/components/LeadCard.tsx`, `modules/crm/components/LeadPipelineBoard.tsx`, `modules/crm/index.ts`, `app/crm/page.tsx` · depende de: T3 · secuencial

### Fase 2 — Detalle, cambio de etapa y próxima acción
- [ ] T1 — `lib/dates.ts`: `APP_TIME_ZONE`, `getTodayDate`, `formatDateTime`, `isPastDate` con tests · archivos: `lib/dates.ts`, `lib/dates.test.ts` · depende de: Fase 1 · secuencial (base)
- [ ] T2 — `nextActionSchema` y tipo `NextActionInput` con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts` · depende de: Fase 1 · paralelo con T1
- [ ] T3 — Service: `getLeadById`, `updateLeadStage`, `updateNextAction` con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T2 · secuencial
- [ ] T4 — Actions de etapa y próxima acción con tests · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T3 · secuencial
- [ ] T5 — UI: `LeadDetail`, `LeadStageForm`, `NextActionForm`, enlace y "Vencida" en `LeadCard`, página de detalle y exports · archivos: `modules/crm/components/LeadDetail.tsx`, `modules/crm/components/LeadStageForm.tsx`, `modules/crm/components/NextActionForm.tsx`, `modules/crm/components/LeadCard.tsx`, `modules/crm/components/LeadPipelineBoard.tsx`, `modules/crm/index.ts`, `app/crm/leads/[id]/page.tsx` · depende de: T1, T4 · secuencial

### Fase 3 — Notas y seguimiento
- [ ] T1 — Migración `lead_activities` y seed de seguimiento · archivos: `migrations/0003_create_lead_activities.sql`, `db/seed.local.sql` · depende de: Fase 2 · secuencial (base)
- [ ] T2 — Schema, tipos y etiquetas de seguimiento · archivos: `modules/crm/schemas/activities.schema.ts`, `modules/crm/types/activities.types.ts`, `modules/crm/utils/activityTypes.ts` · depende de: Fase 2 · paralelo con T1
- [ ] T3 — Service de seguimiento con tests · archivos: `modules/crm/services/activities.service.ts`, `modules/crm/services/activities.service.test.ts` · depende de: T1, T2 · secuencial
- [ ] T4 — `addActivityAction` con tests · archivos: `modules/crm/actions/activities.actions.ts`, `modules/crm/actions/activities.actions.test.ts` · depende de: T3 · secuencial
- [ ] T5 — UI: `ActivityForm`, `ActivityTimeline`, integración en el detalle y exports · archivos: `modules/crm/components/ActivityForm.tsx`, `modules/crm/components/ActivityTimeline.tsx`, `modules/crm/index.ts`, `app/crm/leads/[id]/page.tsx` · depende de: T4 · secuencial

Nota: `LeadPipelineBoard` se toca en F2 T5 solo para pasar `id`, próxima acción y `today` (calculado una vez con `getTodayDate()`) a cada `LeadCard`.

## Preguntas abiertas
1. **Zona horaria del negocio:** ¿en qué zona trabajas? Se usa para "hoy" (próxima acción vencida) y las horas del historial. Provisional: `America/Lima`.
2. **Etapas:** ¿las 5 etapas (Nuevo, Contactado, Cotizado, Vendido, Perdido) son definitivas o quieres alguna más (p. ej. "Reservado / pagado")?
3. **Notificaciones:** ¿quieres un email cuando llegue un lead nuevo? ¿A qué dirección? (Fuera de alcance; requiere decidir proveedor: Cloudflare Email Routing/Email Workers o un servicio como Resend).
4. **Alta manual de leads:** ¿necesitas crear leads a mano (p. ej. de WhatsApp o Instagram) o solo llegan por la web?
