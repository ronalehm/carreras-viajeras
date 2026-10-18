# Catálogo de viajes/carreras (datos y gestión en el CRM)

- Módulo: trips
- Estado: borrador
- **OBSOLETA — no aprobar ni implementar.** Depende de Cloudflare D1, Cloudflare Access y de las specs eliminadas `crm-auth.md` y `platform-cloudflare-deploy.md`. Debe reescribirse sobre `platform-neon-foundation.md` (Neon + Drizzle `neon-http` + Neon Auth) antes de pedir aprobación.
- Orden en el roadmap: 2 de 5 (`crm-auth` → `trips-catalog` → `crm-leads-pipeline` → `landing-public-site` → `platform-cloudflare-deploy`)
- Depende de: Fase 0 de stack (coordinador) y `crm-auth.md` (usa `requireCrmUser()`, `CrmShell` y el layout `/crm`).

## Objetivo
El equipo de Carreras Viajeras necesita dar de alta, editar, publicar y eliminar los paquetes de viaje para correr carreras en otras ciudades o países (p. ej. "Maratón de Santiago 2027"). Este catálogo vive en D1 y alimenta la landing pública (`landing-public-site`) y el selector de viaje de los leads (`crm-leads-pipeline`).

## Alcance
- Incluye:
  - Tabla D1 `trips` (migración SQL) y datos de ejemplo para local.
  - Capa de datos del módulo `trips`: schema zod, tipos, service D1.
  - CRM: listado `/crm/trips`, alta `/crm/trips/new`, edición `/crm/trips/[id]/edit` y eliminación con confirmación.
  - Estado de publicación (publicado / borrador): solo los publicados se muestran en la landing.
  - Precio opcional (entero, sin decimales) con moneda ISO 4217 por viaje; sin precio se muestra "Precio a consultar".
  - Imagen opcional por URL (https externa o ruta de `public/`).
- No incluye:
  - Subida de imágenes (R2 requiere medio de pago; ver Preguntas abiertas).
  - Página pública de detalle por viaje, slugs/SEO por viaje.
  - Cupos, itinerario día a día, servicios incluidos como campos separados (van en la descripción).
  - Varias monedas o precios por distancia, conversión de moneda.
  - Ocultar automáticamente viajes con fecha pasada (se despublican a mano).
  - Paginación, búsqueda u ordenación configurable del listado (orden fijo por fecha de carrera).
  - Historial de cambios, papelera / borrado lógico.

## Requisitos
1. Un viaje tiene: título, ciudad, país, fecha de la carrera, distancias (texto libre, p. ej. "42K · 21K · 10K"), descripción, precio opcional, moneda (obligatoria si hay precio), URL de imagen opcional y estado publicado/borrador.
2. El listado del CRM muestra todos los viajes ordenados por fecha de carrera ascendente.
3. `listPublishedTrips()` devuelve solo los publicados, ordenados por fecha ascendente (la usa la landing).
4. Crear, editar y eliminar exigen usuario del CRM (`requireCrmUser()` en cada Server Action).
5. Los errores de validación se muestran junto a cada campo y el formulario conserva lo escrito.
6. Eliminar pide confirmación ("Esta acción no se puede deshacer").
7. Tras crear/editar se vuelve a `/crm/trips`; tras crear/editar/eliminar se revalidan `/crm/trips` y `/`.

## Criterios de aceptación
- [ ] (F1) Dado un D1 local vacío, cuando ejecuto `npm run db:migrate:local` y `npm run db:seed:local`, entonces existe la tabla `trips` con el viaje publicado "Maratón de Santiago 2027" y un viaje de ejemplo en borrador.
- [ ] (F1) Dado el service mockeado, cuando llamo `listPublishedTrips()`, entonces la consulta filtra `is_published = 1`, ordena por `race_date` y devuelve objetos `Trip` con `isPublished: boolean` (unit test).
- [ ] (F1) Dada una fila con `is_published` distinto de 0/1 o una fecha mal formada, cuando se parsea con `tripSchema`, entonces lanza error de zod (unit test).
- [ ] (F2) Dado el seed cargado y un usuario del CRM, cuando abro `/crm/trips`, entonces veo una tabla con título, destino (ciudad, país), fecha formateada en español (p. ej. "25 de abril de 2027"), precio ("Precio a consultar" si no tiene) y una insignia "Publicado"/"Borrador".
- [ ] (F2) Dado que no hay viajes, cuando abro `/crm/trips`, entonces veo "Aún no hay viajes".
- [ ] (F2) Dada la cabecera del CRM, cuando la veo, entonces tiene el enlace "Viajes" a `/crm/trips`.
- [ ] (F2) `formatPrice(1500, "USD")` devuelve el importe formateado en `es` sin decimales y `formatPrice(null, null)` devuelve "Precio a consultar" (unit test).
- [ ] (F3) Dado `/crm/trips/new`, cuando envío el formulario válido, entonces se crea el viaje y vuelvo a `/crm/trips` donde aparece.
- [ ] (F3) Dado el formulario con título vacío, fecha inválida o precio sin moneda, cuando lo envío, entonces veo el error bajo el campo correspondiente y los demás valores escritos se conservan.
- [ ] (F3) Dado un viaje, cuando pulso "Editar", cambio el estado a "Borrador" y guardo, entonces la tabla muestra "Borrador".
- [ ] (F4) Dado un viaje, cuando pulso "Eliminar" y confirmo en el diálogo, entonces desaparece del listado; si cancelo, sigue ahí.
- [ ] (F3) Dado `/crm/trips/<id-inexistente>/edit`, cuando lo abro, entonces veo la página 404.
- [ ] (F3, F4) Dado que no hay usuario del CRM, cuando se invoca cualquier action de viajes, entonces lanza "No autorizado" y no toca D1 (unit test).
- [ ] (todas) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

## Diseño técnico

### Patrón de datos (aplica a todo el proyecto)
- No hay API HTTP propia: los datos viven en Cloudflare D1 y se leen en **Server Components** llamando a services del módulo; las escrituras son **Server Actions**. Por eso no se usan `axios` (`lib/api.ts`) ni TanStack Query (no hay estado de servidor en el cliente) ni se añade `QueryClientProvider` (YAGNI). Se adapta así la tabla de capas de `docs/SETUP.md`:
  - `services/<dominio>.service.ts`: solo servidor; hablan con D1 mediante `getDb()` de `@/lib/db` con sentencias preparadas (`prepare(...).bind(...)`) y validan cada fila con zod. Sin React.
  - `actions/<dominio>.actions.ts` (subcarpeta nueva, convención propuesta): `"use server"`; autorizan (`requireCrmUser()`), validan `FormData` con zod, llaman al service y hacen `revalidatePath`/`redirect`. Firma para formularios con `useActionState`: `(prevState: FormState, formData: FormData) => Promise<FormState>`.
- SQL sin ORM: consultas simples, migraciones con `wrangler d1 migrations` en `migrations/` (KISS, sin dependencias nuevas). En los `SELECT` se usan alias camelCase (`race_date AS raceDate`) para que el schema zod parsee directamente.
- Toda página que lee D1 llama `await connection()` (de `next/server`) antes de leer: así no se prerenderiza en build (donde `getCloudflareContext()` síncrono no está disponible y no hay caché incremental R2).
- Los componentes cliente nunca importan del `index.ts` de un módulo (arrastraría código de servidor): reciben las actions por props desde la página o importan archivos hermanos del propio módulo.
- IDs con `crypto.randomUUID()`; fechas de auditoría como texto ISO generado por SQLite.

### Base de datos
`migrations/0001_create_trips.sql`:
```sql
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  race_date TEXT NOT NULL,              -- YYYY-MM-DD
  distances TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER,                        -- unidades enteras; NULL = a consultar
  currency TEXT,                        -- ISO 4217 (p. ej. USD)
  image_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```
`db/seed.local.sql` (solo local, `INSERT OR IGNORE`, idempotente): viaje publicado con id fijo `11111111-1111-4111-8111-111111111111`, título "Maratón de Santiago 2027", Santiago, Chile, fecha de ejemplo `2027-04-25`, distancias "42K · 21K · 10K", descripción provisional, sin precio; y un viaje "Viaje de ejemplo (borrador)" con `is_published = 0`. Comentario en el archivo: datos ficticios, no usar en producción.

### Rutas (`app/`)
- `app/crm/trips/page.tsx` (F2) — `await connection()`, `listTrips()`, renderiza `<TripTable trips={...} />`. En F3 añade el botón "Nuevo viaje" (enlace a `/crm/trips/new`).
- `app/crm/trips/new/page.tsx` (F3) — `<TripForm action={createTripAction} submitLabel="Crear viaje" />`.
- `app/crm/trips/[id]/edit/page.tsx` (F3) — `await connection()`, `getTripById(id)`; si `null` → `notFound()`; `<TripForm action={updateTripAction.bind(null, trip.id)} defaultValues={...} submitLabel="Guardar cambios" />`.
- Todas heredan la protección de `app/crm/layout.tsx` (`crm-auth`).

### Componentes
| Componente | Tipo | Detalle |
|---|---|---|
| `table` | shadcn (instalar: `npx shadcn@latest add table`) | Listado del CRM |
| `badge` | shadcn (instalar: `npx shadcn@latest add badge`) | "Publicado" / "Borrador" |
| `field` (+ `label`, `separator` como dependencias) | shadcn (instalar: `npx shadcn@latest add field`) | Estructura de formulario: `Field`, `FieldLabel`, `FieldError`, `FieldDescription`. Sustituye a `form` (en `base-nova` el item `form` está vacío) |
| `input`, `textarea` | shadcn (instalar: `npx shadcn@latest add input textarea`) | Campos |
| `native-select` | shadcn (instalar: `npx shadcn@latest add native-select`) | Estado publicado/borrador; se envía en `FormData` sin estado extra (más simple que `select` de Base UI) |
| `alert-dialog` | shadcn (instalar en F4: `npx shadcn@latest add alert-dialog`) | Confirmar eliminación |
| `button` | shadcn (instalado) | Acciones |
| `TripTable` | nuevo, `modules/trips/components/TripTable.tsx` | Server Component. Props `trips: Trip[]`. Usa `formatDate`, `formatPrice`, `Badge`. En F3 añade columna "Acciones" con enlace "Editar"; en F4, `<DeleteTripButton action={deleteTripAction.bind(null, trip.id)} tripTitle={trip.title} />`. Vacío: "Aún no hay viajes" |
| `TripForm` | nuevo, `modules/trips/components/TripForm.tsx` | `"use client"`. Props `action`, `defaultValues?: TripFormValues`, `submitLabel: string`. `useActionState(action, INITIAL_FORM_STATE)`; muestra `fieldErrors` con `FieldError`; los valores por defecto salen de `state.values ?? defaultValues` (React resetea el formulario tras cada action). Botón deshabilitado mientras `pending`. Campos: título, ciudad, país, fecha (`type="date"`), distancias, descripción (textarea), precio (`type="number"`, `min=0`, `step=1`), moneda (3 letras), URL de imagen, estado (native-select: Publicado/Borrador) |
| `DeleteTripButton` | nuevo (F4), `modules/trips/components/DeleteTripButton.tsx` | `"use client"`. Props `action: () => Promise<void>`, `tripTitle: string`. `AlertDialog` con "¿Eliminar «{tripTitle}»?" / "Esta acción no se puede deshacer." y un `<form action={action}>` con el botón de confirmar |

Ningún componente existente cubre esto (el proyecto solo tiene `button`).

### Schemas, tipos, services, actions, utils
- `modules/trips/schemas/trips.schema.ts`
  - (F1) `tripSchema`: `{ id: string, title: string, city: string, country: string, raceDate: z.iso.date(), distances: string, description: string, price: z.number().int().nullable(), currency: z.string().nullable(), imageUrl: z.string().nullable(), isPublished: 0|1 → boolean, createdAt: string, updatedAt: string }`.
  - (F3) `tripFormSchema` (entrada desde `Object.fromEntries(formData)`; todos los valores llegan como string):
    - `title` trim 3–120; `city`, `country` trim 2–80; `raceDate` `z.iso.date()`; `distances` trim 1–80; `description` trim 10–2000.
    - `price`: `""` → `null`; si no, entero ≥ 0.
    - `currency`: `""` → `null`; si no, se pasa a mayúsculas y debe cumplir `/^[A-Z]{3}$/`.
    - `imageUrl`: `""` → `null`; si no, URL `https://` o ruta que empieza por `/`.
    - `isPublished`: `"true" | "false"` → boolean.
    - Refinamiento: si `price !== null` entonces `currency !== null` (error en `currency`: "Indica la moneda").
    - Mensajes de error en español.
- `modules/trips/types/trips.types.ts`: `Trip = z.infer<typeof tripSchema>`; (F3) `TripInput = z.output<typeof tripFormSchema>`, `TripFormValues = z.input<typeof tripFormSchema>`.
- `modules/trips/services/trips.service.ts`:
  ```ts
  // F1
  export function listTrips(): Promise<Trip[]>;           // ORDER BY race_date ASC
  export function listPublishedTrips(): Promise<Trip[]>;  // WHERE is_published = 1 ORDER BY race_date ASC
  export function getTripById(id: string): Promise<Trip | null>;
  // F3
  export function createTrip(input: TripInput): Promise<Trip>;
  export function updateTrip(id: string, input: TripInput): Promise<Trip | null>; // actualiza updated_at
  // F4
  export function deleteTrip(id: string): Promise<void>;
  ```
- `modules/trips/actions/trips.actions.ts` (F3, `"use server"`):
  ```ts
  export function createTripAction(prev: FormState, formData: FormData): Promise<FormState>;
  export function updateTripAction(id: string, prev: FormState, formData: FormData): Promise<FormState>;
  // F4
  export function deleteTripAction(id: string): Promise<void>; // requireCrmUser → deleteTrip → revalidatePath x2, sin redirect
  ```
  Orden: `requireCrmUser()` → `tripFormSchema.safeParse` → si error `{ status: "error", message: "Revisa los campos marcados.", fieldErrors: z.flattenError(err).fieldErrors, values }` → service → `revalidatePath("/crm/trips")`, `revalidatePath("/")` → `redirect("/crm/trips")` (create/update). Si `updateTrip` devuelve `null` → `{ status: "error", message: "El viaje no existe." }`.
- `modules/trips/utils/formatPrice.ts` (F2): `formatPrice(price: number | null, currency: string | null): string` con `Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 0 })`; `null` → "Precio a consultar".
- `modules/trips/index.ts` (F2; ampliado en F3): exporta `TripTable`, `listTrips`, `listPublishedTrips`, `getTripById`, `type Trip` (`formatPrice` queda interno: solo lo usan componentes del módulo); en F3 además `TripForm`, `createTripAction`, `updateTripAction`.

### `lib/` (compartido)
- `lib/db.ts` (F1, nuevo): `export function getDb(): D1Database { return getCloudflareContext().env.DB; }` (tipo `D1Database` de `cloudflare-env.d.ts`).
- `lib/dates.ts` (F2, nuevo): `formatDate(date: string): string` para fechas `YYYY-MM-DD` → "25 de abril de 2027" (`Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" })` para que no se desplace el día). Lo reutiliza `crm-leads-pipeline`.
- `lib/formState.ts` (F3, nuevo): tipo compartido por todos los formularios con Server Actions:
  ```ts
  export type FormState =
    | { status: "idle" }
    | { status: "success"; message: string }
    | { status: "error"; message: string; fieldErrors?: Record<string, string[] | undefined>; values?: Record<string, string> };
  export const INITIAL_FORM_STATE: FormState = { status: "idle" };
  ```

### Otros archivos
- `package.json` (F1): scripts `"db:migrate:local": "wrangler d1 migrations apply carreras_viajeras_db --local"` y `"db:seed:local": "wrangler d1 execute carreras_viajeras_db --local --file db/seed.local.sql"`.
- `modules/crm/components/CrmShell.tsx` (F2): añadir `{ href: "/crm/trips", label: "Viajes" }` a `NAV_ITEMS`.

## Reutilización
- `getCloudflareContext()` (Fase 0) y binding `DB` de `wrangler.jsonc`.
- `requireCrmUser()` de `@/lib/auth`, layout `/crm` y `CrmShell` (`crm-auth`).
- shadcn: `button` (instalado); `table`, `badge`, `field`, `input`, `textarea`, `native-select`, `alert-dialog` (a instalar; las specs siguientes los reutilizan).
- `cn()` de `@/lib/utils`.

## Tests
- `modules/trips/schemas/trips.schema.test.ts`:
  - (F1) `tripSchema` convierte `isPublished` 0/1 a boolean; rechaza 2 y fechas no ISO.
  - (F3) `tripFormSchema`: caso válido completo; `price` vacío → `null`; `price` "-1" o "12.5" → error; precio sin moneda → error en `currency`; `currency` "usd" → "USD"; `imageUrl` "http://..." → error, "/images/x.jpg" y "https://..." válidos; `isPublished` "true" → `true`; título de 2 caracteres → error.
- `modules/trips/services/trips.service.test.ts` (mock de `@/lib/db` con `prepare/bind/all/first/run` como `vi.fn`):
  - (F1) `listPublishedTrips` usa `is_published = 1` y `ORDER BY race_date`; parsea filas; `getTripById` devuelve `null` si `first()` devuelve `null`.
  - (F3) `createTrip` hace `bind` con los valores en orden y un UUID; `updateTrip` devuelve `null` si no afectó filas.
  - (F4) `deleteTrip` hace `bind(id)` sobre `DELETE FROM trips WHERE id = ?`.
- `modules/trips/utils/formatPrice.test.ts` (F2): con precio y moneda; `null`; precio 0.
- `lib/dates.test.ts` (F2): `formatDate("2027-04-25")` → "25 de abril de 2027" (independiente de la zona horaria del proceso).
- `modules/trips/actions/trips.actions.test.ts` (F3; mock de `@/lib/auth`, del service, `next/cache` y `next/navigation`): sin usuario → lanza y no llama al service; datos inválidos → `status: "error"` con `fieldErrors` y `values`; válido → llama a `createTrip`, revalida `/crm/trips` y `/` y redirige; `updateTripAction` con id inexistente → error "El viaje no existe."; (F4) `deleteTripAction` sin usuario → lanza; con usuario llama a `deleteTrip(id)` y revalida.
- Sin test: `lib/db.ts` (una línea), `lib/formState.ts` (tipos/constante), componentes (presentacionales o formularios del módulo), páginas.

## Plan de tareas
### Fase 1 — Datos del catálogo
- [ ] T1 — Helper D1, migración, seed y scripts · archivos: `lib/db.ts`, `migrations/0001_create_trips.sql`, `db/seed.local.sql`, `package.json` · depende de: — · secuencial (base)
- [ ] T2 — Schema y tipos de viaje (`tripSchema`) con tests · archivos: `modules/trips/schemas/trips.schema.ts`, `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/types/trips.types.ts` · depende de: T1 · secuencial
- [ ] T3 — Service de lectura (`listTrips`, `listPublishedTrips`, `getTripById`) con tests · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: T2 · secuencial

### Fase 2 — Listado en el CRM
- [ ] T1 — Instalar shadcn `table` y `badge`; crear `lib/dates.ts` con test · archivos: `components/ui/table.tsx`, `components/ui/badge.tsx`, `lib/dates.ts`, `lib/dates.test.ts` · depende de: Fase 1 · secuencial (base)
- [ ] T2 — `formatPrice` con test · archivos: `modules/trips/utils/formatPrice.ts`, `modules/trips/utils/formatPrice.test.ts` · depende de: — · paralelo con T1
- [ ] T3 — `TripTable`, página `/crm/trips`, API pública del módulo y enlace "Viajes" · archivos: `modules/trips/components/TripTable.tsx`, `modules/trips/index.ts`, `app/crm/trips/page.tsx`, `modules/crm/components/CrmShell.tsx` · depende de: T1, T2 · secuencial

### Fase 3 — Crear y editar
(14 archivos escritos a mano + 6 generados por el CLI de shadcn)
- [ ] T1 — Instalar shadcn `field` (trae `label` y `separator`), `input`, `textarea`, `native-select`; crear `lib/formState.ts` · archivos: `components/ui/field.tsx`, `components/ui/label.tsx`, `components/ui/separator.tsx`, `components/ui/input.tsx`, `components/ui/textarea.tsx`, `components/ui/native-select.tsx`, `lib/formState.ts` · depende de: Fase 2 · secuencial (base)
- [ ] T2 — `tripFormSchema`, tipos de entrada, `createTrip`/`updateTrip` en el service, con tests · archivos: `modules/trips/schemas/trips.schema.ts`, `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/types/trips.types.ts`, `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — `createTripAction` y `updateTripAction` con tests · archivos: `modules/trips/actions/trips.actions.ts`, `modules/trips/actions/trips.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — UI: `TripForm`, enlace "Editar" en la tabla, páginas nuevo/editar, botón "Nuevo viaje" y exports · archivos: `modules/trips/components/TripForm.tsx`, `modules/trips/components/TripTable.tsx`, `modules/trips/index.ts`, `app/crm/trips/page.tsx`, `app/crm/trips/new/page.tsx`, `app/crm/trips/[id]/edit/page.tsx` · depende de: T3 · secuencial

### Fase 4 — Eliminar
- [ ] T1 — Instalar shadcn `alert-dialog` · archivos: `components/ui/alert-dialog.tsx` · depende de: Fase 3 · secuencial (base)
- [ ] T2 — `deleteTrip` en el service con test · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: Fase 3 · paralelo con T1
- [ ] T3 — `deleteTripAction` con test · archivos: `modules/trips/actions/trips.actions.ts`, `modules/trips/actions/trips.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `DeleteTripButton` y columna de eliminar en la tabla · archivos: `modules/trips/components/DeleteTripButton.tsx`, `modules/trips/components/TripTable.tsx` · depende de: T1, T3 · secuencial

Nota: los `index.ts` se modifican en la última tarea de cada fase (en secuencia) porque reexportan archivos creados por las tareas anteriores.

## Preguntas abiertas
1. **Imágenes:** ¿de dónde salen las fotos de los viajes? Opciones: URLs externas que ya tengas, archivos en `public/images/` (se suben con el código) o R2 (requiere medio de pago en la cuenta; fuera de alcance).
2. **Moneda:** ¿en qué moneda(s) vendes (USD, PEN, CLP…)? La spec permite cualquier código ISO por viaje; si siempre es la misma, se puede fijar.
3. **Datos reales del primer viaje:** fecha, distancias, precio y descripción de "Maratón de Santiago 2027" (el seed usa valores de ejemplo). El sitio de referencia que diste no es accesible desde este entorno.
4. **Convención `actions/`:** `docs/SETUP.md` no documenta Server Actions ni el acceso a D1. ¿Añadimos a SETUP la subcarpeta `actions/` y el "Patrón de datos" de esta spec?
