# Catálogo de viajes (datos, lectura pública y gestión en el CRM)

- Módulo: trips
- Estado: borrador
- Depende de:
  - `platform-neon-foundation.md` (Fase 1 aprobada): Neon + Drizzle `neon-http` (`getDb()` en `lib/db.ts`, schema en `lib/db-schema.ts`), migraciones generadas con `npm run db:generate` y aplicadas a mano.
  - `accounts-roles-permissions.md`: guardas de `lib/auth/guards.ts` y matriz `can()` (Fases 1 y 2 implementadas). **La Fase 2 de esta spec exige que su Fase 3 esté cerrada** (página `/crm/admin/usuarios`, `StaffTable`, `InvitationsTable` y enlace "Usuarios" en `CrmShell`), porque modifica esos archivos.
  - `accounts-auth-ui.md` (Fases 1 y 2 implementadas): `/crm/acceso`, layout `app/crm/(protected)/`, `CrmShell`, `getCrmAccess`.
- Sustituye por completo a la versión anterior de esta spec (D1, Cloudflare Access, `crm-auth.md`, `platform-cloudflare-deploy.md`).

## Objetivo
El equipo de Carreras Viajeras vende paquetes para correr carreras en otras ciudades o países (viaje de referencia: "Maratón de Santiago 2027"). Necesita:
- **Un catálogo de viajes en Neon** que el equipo mantiene desde el CRM: crear, editar, publicar, despublicar y archivar.
- **Un contrato de lectura pública** para la landing que se construye en otra rama/sesión de este mismo repo: qué campos de un viaje publicado son públicos y cómo se leen, sin borradores ni datos internos.
- **Un identificador estable** de cada viaje para que la futura captura de leads (`crm-leads-pipeline.md`, por reescribir) pueda vincular un lead a un viaje.

Los runners no se registran: consultan los viajes en la landing, envían formularios y escriben por WhatsApp. Los pagos son manuales.

## Alcance
- Incluye:
  - (F1) Tabla `trips` y enum `trip_status` en `lib/db-schema.ts`; migración SQL generada con `npm run db:generate`, revisada y **aplicada a mano** por el usuario en el SQL Editor de Neon (documentado en el README).
  - (F1) Permiso `trips.manage` en la matriz `can()`.
  - (F1) Schemas zod del formulario y de los cambios de estado, tipos y service del módulo `trips` (lecturas públicas, lecturas del CRM y escrituras).
  - (F1) Contrato de lectura pública: funciones server `listPublishedTrips()` y `getPublishedTripBySlug(slug)` exportadas por `@/modules/trips`, con el tipo `PublicTrip`, y utilidades puras de formato (`formatTripDate`, `formatTripDateRange`, `formatTripPrice`).
  - (F2) Gestión en el CRM: `/crm/viajes` (lista con publicar, despublicar y archivar) y `/crm/viajes/nuevo` y `/crm/viajes/<id>` (crear y editar), con enlace "Viajes" en la cabecera.
  - (F2) `ConfirmActionButton` pasa de `modules/accounts` a `components/shared/` (segunda repetición real) con su test.
  - (F2) Decisión sobre el tamaño del Worker (Pregunta abierta 1): `next build --webpack` como primera tarea si el usuario lo aprueba.
- No incluye:
  - **Páginas públicas** (landing, catálogo, detalle de viaje): son de la spec de la landing, en otra rama. Aquí solo se entrega el contrato de lectura.
  - **Captura de leads** y la columna `leads.trip_id`: son de `crm-leads-pipeline.md`.
  - **`GET /api/trips` público** u otra API HTTP de viajes (ver Diseño técnico, "Contrato de lectura pública").
  - Subida o almacenamiento de imágenes (no hay R2 ni Images): solo una URL `https://` externa.
  - Borrado de viajes (se archivan) y restaurar un viaje archivado (Pregunta abierta 6).
  - Reservas, pagos, disponibilidad o cupos calculados automáticamente: `capacity` es un número informativo que mantiene el equipo.
  - Varios precios por viaje (por distancia, habitación, etc.), conversión de moneda o decimales en el precio.
  - Itinerario día a día, hotel, requisitos o descripción larga como campos propios (van en `summary` o en `includes`).
  - Ocultar automáticamente viajes con fecha pasada (se archivan o despublican a mano).
  - Paginación, búsqueda, filtros u ordenación configurable de la lista del CRM.
  - Historial o auditoría de cambios (quién editó qué).
  - Caché de las lecturas públicas (ISR, KV, Cache API): sin R2 no hay caché incremental; cada petición de la landing consulta Neon.
  - Datos de ejemplo o seeds en remoto. El primer viaje lo crea el equipo desde el CRM (F2) o el usuario a mano por SQL (README, F1).

## Requisitos
1. **Campos de un viaje** (todos los textos visibles en español):
   - `slug`: identificador público, único, en minúsculas, números y guiones (p. ej. `maraton-santiago-2027`).
   - `title`, `city`, `country`: obligatorios.
   - `raceDate`: fecha de la carrera, obligatoria.
   - `startDate` y `endDate`: fechas del viaje, opcionales; o las dos o ninguna, con `startDate ≤ raceDate ≤ endDate`.
   - `distances`: lista de 1 a 10 distancias en texto libre (p. ej. `42K`, `21K`, `10K`).
   - `summary`: descripción breve, obligatoria (10–300 caracteres).
   - `includes`: lista de lo que incluye el paquete (0 a 20 elementos), opcional.
   - `priceAmount` + `priceCurrency`: precio "desde", entero en unidades de la moneda, con código ISO 4217 de 3 letras; o los dos o ninguno (sin precio se muestra "Precio a consultar").
   - `capacity`: cupos totales, entero > 0, opcional.
   - `imageUrl`: URL `https://` externa, opcional.
   - `status`: `draft` (borrador), `published` (publicado) o `archived` (archivado).
2. **Estados y transiciones:** un viaje nuevo nace en `draft`. Transiciones permitidas: `draft → published` (publicar), `published → draft` (despublicar) y `draft | published → archived` (archivar). `archived` es final en el MVP y un viaje archivado no se edita.
3. **Slug estable:** el `slug` solo se puede cambiar mientras el viaje está en `draft`. Los leads futuros se vinculan por `id` (UUID inmutable); el `slug` es el identificador público que usa la landing.
4. **Lectura pública:** solo devuelve viajes `published` y solo los campos de `PublicTrip` (sin `id`, `status`, fechas de auditoría ni otros datos internos). Se ejecuta en cada petición.
5. **Permiso:** crear, editar y cambiar el estado exigen `trips.manage`, comprobado en cada Server Action y en cada página del CRM de viajes. Por defecto solo lo tiene `admin` (provisional, Pregunta abierta 2).
6. **CRM:** la lista muestra todos los viajes, con los archivados al final. Publicar, despublicar y archivar piden confirmación. Los errores de validación se muestran junto a cada campo y el formulario conserva lo escrito.
7. **Errores:** ningún mensaje original de la base de datos llega a la respuesta, a la UI ni a los logs.

## Criterios de aceptación

Fase 1 (datos, permiso y lectura pública):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera una sola migración nueva `drizzle/0001_*.sql` con el enum `trip_status`, la tabla `trips`, el índice único `trips_slug_uq` y los CHECK de la tabla. El SQL no contiene `neon_auth`, `DROP`, `CREATE SCHEMA` ni cambios en `profiles`, `staff_assignments` o `staff_invitations`, y `drizzle.config.ts` no cambia.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dada la migración aplicada a mano en el SQL Editor, cuando inserto filas de prueba, entonces la base rechaza: slug con mayúsculas o espacios, slug duplicado, `distances` vacío, precio sin moneda o moneda sin precio, `capacity = 0`, `image_url` que no empieza por `https://` y `start_date` sin `end_date` o con `race_date` fuera del rango.
- [ ] (F1) Dado `can()`, entonces `admin` tiene `trips.manage`, `commercial` no lo tiene (provisional) y sin roles no lo tiene nadie; los permisos existentes no cambian (unit test).
- [ ] (F1) Dado el service con la base simulada, cuando llamo `listPublishedTrips()`, entonces llama antes a `connection()`, la consulta filtra `status = 'published'`, ordena por `race_date` y `slug`, solo selecciona las columnas públicas y devuelve `PublicTrip[]` con `price: null` si no hay precio (unit test).
- [ ] (F1) Dado `getPublishedTripBySlug("Maraton Santiago")` (formato inválido), entonces devuelve `null` sin consultar la base; dado un slug válido de un viaje en `draft` o `archived` (la consulta no devuelve filas), entonces devuelve `null` (unit test).
- [ ] (F1) Dado `tripFormSchema`, cuando recibe los strings de un `FormData` válido, entonces devuelve las listas ya separadas y limpias, los números como enteros, la moneda en mayúsculas y los opcionales vacíos como `null`; y rechaza cada regla del Requisito 1 con el error en su campo (unit test).
- [ ] (F1) Dado `createTrip` con un slug ya usado, entonces devuelve `"slug_taken"`; dado `updateTrip`, entonces devuelve `"not_found"`, `"archived"`, `"slug_locked"`, `"slug_taken"` o `"updated"` según el caso, en un solo round-trip; dado `setTripStatus` con una transición no permitida o un id inexistente, entonces devuelve `"invalid_transition"` (unit test).
- [ ] (F1) Dado `formatTripDate("2027-04-25")`, entonces devuelve "25 de abril de 2027" con cualquier zona horaria del proceso; `formatTripPrice(null)` devuelve "Precio a consultar" y `formatTripPrice({ amount: 0, currency: "USD" })` devuelve un importe, no "Precio a consultar" (unit test).
- [ ] (F1) Dado `modules/trips/index.ts`, entonces exporta exactamente el contrato público de F1 (`listPublishedTrips`, `getPublishedTripBySlug`, `formatTripDate`, `formatTripDateRange`, `formatTripPrice` y `type PublicTrip`) y ninguna ruta de `app/` cambia.
- [ ] (F1) Dado el README, entonces documenta cómo revisar y aplicar a mano `drizzle/0001_*.sql`, los GRANT necesarios si `DATABASE_URL` no usa el rol owner y un `INSERT` de ejemplo con marcadores `<...>` para crear un viaje antes de la Fase 2.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

Fase 2 (gestión en el CRM):
- [ ] (F2) Dada la Pregunta abierta 1 resuelta como "webpack", cuando reviso `package.json`, entonces `build` es `next build --webpack` y `dev` sigue con Turbopack; el tamaño gzip del Worker tras el cambio queda registrado en el resumen de la tarea.
- [ ] (F2) Dado un admin verificado, cuando abre `/crm/viajes`, entonces ve dentro de `CrmShell` el título "Viajes", el enlace "Nuevo viaje" y una tabla con: viaje (título y slug), destino ("Ciudad, País"), fecha de carrera (`formatTripDate`), precio (`formatTripPrice`), estado (`Badge` "Borrador", "Publicado" o "Archivado") y acciones. Los archivados aparecen al final y sin acciones.
- [ ] (F2) Dado que no hay viajes, cuando abro `/crm/viajes`, entonces veo "Aún no hay viajes. Crea el primero con «Nuevo viaje»."
- [ ] (F2) Dado un `commercial` verificado (sin `trips.manage`), cuando abre `/crm/viajes` o `/crm/viajes/nuevo`, entonces ve el shell con el título de la página y el texto "No tienes permiso para gestionar viajes. Si lo necesitas, pídeselo a un administrador.", y la cabecera no muestra "Viajes". Sin sesión, se le redirige a `/crm/acceso`.
- [ ] (F2) Dado un admin, entonces la cabecera de `CrmShell` muestra el enlace "Viajes" a `/crm/viajes`, además de "Usuarios".
- [ ] (F2) Dado `/crm/viajes/nuevo` con datos válidos, cuando pulso "Crear viaje", entonces vuelvo a `/crm/viajes` y el viaje aparece como "Borrador".
- [ ] (F2) Dado el formulario con título de 2 caracteres, distancias vacías, precio sin moneda o un slug ya usado, cuando lo envío, entonces veo el error bajo el campo correspondiente ("Ese identificador ya está en uso." para el slug) y el resto de lo escrito se conserva.
- [ ] (F2) Dado un viaje en borrador, cuando pulso "Editar", cambio título y slug y guardo, entonces vuelvo a `/crm/viajes` con los cambios. Dado un viaje publicado, cuando abro su edición, entonces el slug es de solo lectura con el texto "Solo se puede cambiar en borrador."
- [ ] (F2) Dado un viaje en borrador, cuando pulso "Publicar" y confirmo, entonces el diálogo se cierra, la tabla muestra "Publicado" y `listPublishedTrips()` lo devuelve; si cancelo, no cambia nada. Dado un publicado, "Despublicar" lo devuelve a "Borrador" y deja de salir en `listPublishedTrips()`.
- [ ] (F2) Dado un viaje en borrador o publicado, cuando pulso "Archivar" y confirmo, entonces queda "Archivado", al final de la lista, sin acciones, y `/crm/viajes/<su id>` muestra "Este viaje está archivado y no se puede editar."
- [ ] (F2) Dado `/crm/viajes/<uuid inexistente>` o `/crm/viajes/abc`, cuando lo abro, entonces veo la página 404.
- [ ] (F2) Dada una acción ya obsoleta (p. ej. publicar un viaje que otra persona archivó), cuando confirmo, entonces el diálogo muestra "El viaje ya no está en ese estado. Recarga la página." y no cambia nada.
- [ ] (F2) Dada cualquier Server Action de viajes llamada directamente sin sesión o sin `trips.manage`, entonces devuelve el error `unauthorized` o `forbidden` y no llama al service; dado un campo extra (`status` en el alta, `createdAt`), entonces se ignora (unit test).
- [ ] (F2) Dado `/crm/admin/usuarios`, cuando uso "Revocar", "Asignar" o revocar una invitación tras mover `ConfirmActionButton` a `components/shared/`, entonces funciona igual que antes (regresión manual + unit test del componente compartido).
- [ ] (F2) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar), entonces el tamaño gzip del Worker queda registrado en el resumen de la fase y es menor que el umbral de consulta (2 MiB, o el que fije el usuario al responder la Pregunta abierta 1); si lo supera, se detiene y se consulta al usuario.
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

## Diseño técnico

### Decisiones
- **Contrato de lectura pública: función server, sin `GET /api/trips`.** La landing vive en este mismo repo y en el mismo Worker, así que sus Server Components llaman directamente a `listPublishedTrips()` / `getPublishedTripBySlug()` de `@/modules/trips`:
  - sin salto HTTP interno: un `fetch` a la propia API desde un Server Component repetiría el trabajo del Worker (otra invocación, serialización y CPU sobre el límite de 10 ms de Workers Free) y necesitaría el origen absoluto o `WORKER_SELF_REFERENCE`;
  - tipado de extremo a extremo con `PublicTrip`, sin un schema de respuesta que mantener;
  - no se publica una superficie HTTP nueva que haya que limitar o proteger frente a scraping;
  - si aparece un consumidor externo real (otro sitio, una app, n8n), se añade `app/api/trips/route.ts` como capa delgada sobre la misma función y el mismo `PublicTrip`, sin cambiar el contrato (YAGNI hasta entonces).
- **Las lecturas públicas llaman a `await connection()`** (de `next/server`) antes de consultar, igual que `getCrmAccess`. Así cualquier página que las use se renderiza por petición y nunca se prerenderiza en `build`, donde no hay `DATABASE_URL` y `getEnv()` fallaría. Un viaje publicado aparece en la siguiente carga de la landing sin `revalidatePath`.
- **Campos públicos:** solo los de `PublicTrip`. `id` no es secreto, pero no hace falta en la landing: el `slug` identifica el viaje en URLs y formularios, y la spec de leads resolverá `slug → id` en el servidor comprobando que el viaje está publicado. `status`, `createdAt` y `updatedAt` son internos.
- **Vínculo con leads (preparación):** `trips.id` es un UUID inmutable y nunca se borran viajes (se archivan), así que una FK futura `leads.trip_id → trips.id` no queda colgando. No se crea nada de leads aquí.
- **Schema en `lib/db-schema.ts`:** `drizzle.config.ts` solo lee ese archivo; no se cambia la configuración. La tabla no tiene FK hacia `neon_auth`.
- **Fechas `date` en modo string:** `race_date`, `start_date` y `end_date` son fechas de calendario (`YYYY-MM-DD`), sin hora ni zona horaria. Se formatean con `timeZone: "UTC"` para que el día no se desplace. Por eso no se usa `CRM_TIME_ZONE` ni `formatStaffDateTime` de `staffDisplay`, que son para instantes (`timestamptz`).
- **Listas como `text[]`:** `distances` e `includes` son arrays de PostgreSQL. En el formulario se escriben como texto: distancias separadas por comas e "incluye" una por línea; `tripFormSchema` las transforma.
- **Precio:** un único precio "desde" entero por viaje (pagos manuales; el detalle se cotiza por WhatsApp). La moneda es un código ISO libre de 3 letras hasta resolver la Pregunta abierta 4.
- **Imagen:** URL `https://` externa como MVP (no hay almacenamiento de archivos). La landing la renderiza con `<img>` o `next/image` con `unoptimized` (sin binding de Images); el CRM no muestra la imagen.
- **Una sola ruta dinámica para crear y editar (F2):** `app/crm/(protected)/viajes/[id]/page.tsx` atiende `/crm/viajes/nuevo` (`id === "nuevo"`) y `/crm/viajes/<uuid>`. Con Turbopack cada página nueva bajo `/crm` suma ~160 KiB gzip; una ruta en lugar de dos ahorra ese coste. `nuevo` nunca coincide con un UUID.
- **Edición por `id`, no por slug:** el slug puede cambiar en borrador; el `id` no.
- **Concurrencia:** `updateTrip` y `setTripStatus` deciden con la condición del `WHERE` (estado actual y slug libre), no con una lectura previa en otra petición. Si el índice único salta igualmente por una carrera entre dos altas simultáneas, la acción falla con el error genérico.
- **`ConfirmActionButton` a `components/shared/` (F2):** lo usan `accounts` (usuarios) y `trips` (publicar/despublicar/archivar). SETUP §1 regla 5 y §2 DRY: se sube a `shared` en la segunda repetición, genérico sobre el tipo de estado de la acción.
- **Formulario sin `field` de shadcn:** se mantiene el patrón del proyecto (`Label` + `Input`/`Textarea`/`NativeSelect` + `<p role="alert">`), igual que `accounts` (ver Pregunta abierta 6 de `accounts-roles-permissions.md`).
- **Tamaño del Worker:** F1 no añade rutas, así que no cambia el bundle. F2 añade una o dos rutas bajo `/crm` (~160–320 KiB con Turbopack) sobre los ~1,8 MiB estimados tras `/crm/admin/usuarios`, y la landing de la otra rama también añadirá rutas. `next build --webpack` se midió antes con −458 KiB. Propuesta en la Pregunta abierta 1.

### Base de datos: `lib/db-schema.ts` (modificar, F1)
Todo en `public`, columnas en snake_case:

| Objeto | Definición |
|---|---|
| enum `trip_status` | `draft`, `published`, `archived` |
| `trips.id` | `uuid` PK, `default gen_random_uuid()` (`defaultRandom()`) |
| `trips.slug` | `text not null`; índice único `trips_slug_uq`; CHECK `trips_slug_format_chk`: `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80` |
| `trips.title`, `city`, `country`, `summary` | `text not null` |
| `trips.race_date` | `date not null` (`mode: "string"`) |
| `trips.start_date`, `end_date` | `date` nulos; CHECK `trips_travel_dates_chk`: `(start_date IS NULL) = (end_date IS NULL) AND (start_date IS NULL OR (start_date <= race_date AND race_date <= end_date))` |
| `trips.distances` | `text[] not null`; CHECK `trips_distances_chk`: `cardinality(distances) BETWEEN 1 AND 10` |
| `trips.includes` | `text[] not null default '{}'`; CHECK `trips_includes_chk`: `cardinality(includes) <= 20` |
| `trips.price_amount` | `integer` nulo |
| `trips.price_currency` | `text` nulo; CHECK `trips_price_chk`: `(price_amount IS NULL) = (price_currency IS NULL) AND (price_amount IS NULL OR price_amount >= 0) AND (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$')` |
| `trips.capacity` | `integer` nulo; CHECK `trips_capacity_chk`: `capacity IS NULL OR capacity > 0` |
| `trips.image_url` | `text` nulo; CHECK `trips_image_url_chk`: `image_url IS NULL OR image_url LIKE 'https://%'` |
| `trips.status` | `trip_status not null default 'draft'` |
| `trips.created_at`, `updated_at` | `timestamptz not null default now()`; `updated_at` lo fija el service con `now()` en cada `UPDATE` (sin trigger) |

Migración: `npm run db:generate` → `drizzle/0001_<nombre>.sql`, `drizzle/meta/0001_snapshot.json` y `drizzle/meta/_journal.json` actualizado. El usuario la revisa y la aplica a mano en el SQL Editor de Neon, en la rama correcta, entre `BEGIN;` y `COMMIT;` (mismo procedimiento que `0000` en el README). Si `DATABASE_URL` usa un rol distinto del owner, necesita `SELECT, INSERT, UPDATE` en `trips` (sin `DELETE`).

### Permisos: `lib/auth/permissions.ts` (modificar, F1)
```ts
export type Permission = "crm.access" | "staff.manage" | "trips.manage";
const PERMISSION_MATRIX = {
  "crm.access": ["commercial"],
  "staff.manage": [],
  "trips.manage": [], // provisional: solo admin (Pregunta abierta 2). Para el equipo comercial: ["commercial"].
};
```

### Contrato de lectura pública (F1, para la landing)
Se importa solo desde `@/modules/trips` y solo en Server Components (el `index.ts` reexporta código `server-only`; un componente de cliente recibe los datos ya formateados por props).

```ts
// modules/trips/types/trips.types.ts
export type TripPrice = { amount: number; currency: string }; // entero en unidades de la moneda; ISO 4217

export type PublicTrip = {
  slug: string;              // identificador público estable mientras está publicado
  title: string;
  city: string;
  country: string;
  raceDate: string;          // YYYY-MM-DD
  startDate: string | null;  // YYYY-MM-DD; las dos o ninguna
  endDate: string | null;
  distances: string[];       // 1..10, p. ej. ["42K", "21K", "10K"]
  summary: string;           // 10..300 caracteres
  includes: string[];        // 0..20 elementos
  price: TripPrice | null;   // null → "Precio a consultar"
  capacity: number | null;   // cupos totales informativos
  imageUrl: string | null;   // https://, externa
};

// modules/trips/services/trips.service.ts (server-only)
export async function listPublishedTrips(): Promise<PublicTrip[]>;
// await connection(); WHERE status = 'published' ORDER BY race_date ASC, slug ASC; solo columnas públicas.
export async function getPublishedTripBySlug(slug: string): Promise<PublicTrip | null>;
// await connection(); slug con formato inválido → null sin consultar; WHERE slug = $1 AND status = 'published' LIMIT 1.

// modules/trips/utils/tripDisplay.ts (puro, sin server-only)
export function formatTripDate(date: string): string;                     // "25 de abril de 2027"
export function formatTripDateRange(start: string, end: string): string;  // Intl formatRange, p. ej. "23–27 de abril de 2027"
export function formatTripPrice(price: TripPrice | null): string;          // Intl "es", currency, sin decimales; null → "Precio a consultar"
```
- Los errores de la base se propagan (la página de la landing decide su `error.tsx`); en producción Next no muestra el mensaje original.
- `formatTripDate` y `formatTripDateRange` usan `Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" })` sobre `new Date(\`${date}T00:00:00Z\`)`.

### Schemas, tipos y service del CRM (F1)
- `modules/trips/schemas/trips.schema.ts` (sin `server-only`):
  - `tripStatusSchema = z.enum(["draft", "published", "archived"])` (mismos valores que `trip_status`; lo comprueba el test).
  - `tripSlugSchema`: trim, minúsculas, 3–80, `/^[a-z0-9]+(-[a-z0-9]+)*$/`, mensaje "Usa minúsculas, números y guiones (p. ej. maraton-santiago-2027)."
  - `tripFormSchema` (entrada: strings de `Object.fromEntries(formData)`; `z.object` descarta claves desconocidas como `status`):
    - `title` trim 3–120; `slug` `tripSlugSchema`; `city`, `country` trim 2–80; `raceDate` `z.iso.date()`;
    - `startDate`, `endDate`: `""` → `null`, si no `z.iso.date()`;
    - `distances`: split por `,`, trim, sin vacíos → 1–10 elementos de ≤ 20 caracteres;
    - `summary` trim 10–300;
    - `includes`: split por saltos de línea, trim, sin vacíos → 0–20 elementos de ≤ 160 caracteres;
    - `priceAmount`: `""` → `null`, si no `/^\d+$/` → entero ≤ 1 000 000; `priceCurrency`: `""` → `null`, si no mayúsculas `/^[A-Z]{3}$/`;
    - `capacity`: `""` → `null`, si no `/^\d+$/` → entero 1–10 000;
    - `imageUrl`: `""` → `null`, si no URL `https:` de ≤ 2048 caracteres;
    - refinamientos: precio sin moneda → error en `priceCurrency` ("Indica la moneda."); moneda sin precio → error en `priceAmount` ("Indica el precio."); solo una fecha de viaje → error en la que falta; `endDate < startDate` → error en `endDate`; `raceDate` fuera de `[startDate, endDate]` → error en `raceDate`.
    - Mensajes en español.
  - `tripIdSchema = z.object({ id: z.uuid() })`; `updateTripSchema = tripFormSchema` + `id: z.uuid()`; `tripStatusChangeSchema = z.object({ id: z.uuid(), status: tripStatusSchema })`.
- `modules/trips/types/trips.types.ts`:
  - `Trip = InferSelectModel<typeof trips>` (de `@/lib/db-schema`, solo `import type`); `TripStatus = z.infer<typeof tripStatusSchema>`; `TripInput = z.output<typeof tripFormSchema>`; `TripPrice`, `PublicTrip` (arriba).
  - (F2) `TripActionState`:
    ```ts
    export type TripActionState =
      | { status: "idle" }
      | { status: "success"; message: string }
      | {
          status: "error";
          code: "unauthorized" | "forbidden" | "invalid_input" | "slug_taken" | "slug_locked"
              | "not_found" | "archived" | "invalid_transition";
          message: string;
          fieldErrors?: Record<string, string[]>;
          values?: Record<string, string>; // lo escrito, para restaurar el formulario
        };
    ```
- `modules/trips/services/trips.service.ts` (`server-only`, `getDb()`), además de las dos lecturas públicas:
  ```ts
  // Destino de cada transición → estados de origen permitidos (Requisito 2).
  const STATUS_SOURCES: Record<TripStatus, TripStatus[]> = {
    published: ["draft"], draft: ["published"], archived: ["draft", "published"],
  };
  export async function listTrips(): Promise<Trip[]>;                 // ORDER BY (status = 'archived'), race_date, slug
  export async function getTripById(id: string): Promise<Trip | null>; // id que no es UUID → null sin consultar
  export async function createTrip(input: TripInput): Promise<{ id: string } | "slug_taken">;
  // INSERT … ON CONFLICT (slug) DO NOTHING RETURNING id; status por defecto 'draft' (nunca viene del input).
  export async function updateTrip(id: string, input: TripInput):
    Promise<"updated" | "not_found" | "archived" | "slug_locked" | "slug_taken">;
  // Un db.batch (una transacción, un round-trip):
  //  1) UPDATE … SET campos, updated_at = now() WHERE id = $id AND status <> 'archived'
  //     AND (status = 'draft' OR slug = $slug)
  //     AND NOT EXISTS (SELECT 1 FROM trips other WHERE other.slug = $slug AND other.id <> $id) RETURNING id;
  //  2) SELECT status, slug FROM trips WHERE id = $id.
  // Con fila en 1 → "updated"; si no: sin fila en 2 → "not_found"; archived → "archived";
  // status <> 'draft' y slug distinto → "slug_locked"; resto → "slug_taken".
  export async function setTripStatus(id: string, status: TripStatus): Promise<"changed" | "invalid_transition">;
  // UPDATE trips SET status = $status, updated_at = now() WHERE id = $id AND status = ANY(STATUS_SOURCES[status]) RETURNING id.
  ```

### Server Actions (F2): `modules/trips/actions/trips.actions.ts` (`"use server"`)
Mismo patrón que `staff.actions.ts`: guarda → validación → service → `revalidatePath` si hay éxito. Firma compatible con `useActionState`: `(prev: TripActionState, formData: FormData) => Promise<TripActionState>`.
- `authorize()`: `requirePermission("trips.manage")`; `UnauthorizedError` → `unauthorized`, `ForbiddenError` → `forbidden`.
- `createTripAction`: `tripFormSchema` → `createTrip`. `"slug_taken"` → error con `fieldErrors.slug = ["Ese identificador ya está en uso."]` y `values`. Éxito → `revalidatePath("/crm/viajes")` y `redirect("/crm/viajes")` (fuera de `try/catch`).
- `updateTripAction`: `updateTripSchema` (el `id` llega en un campo oculto) → `updateTrip`. `slug_taken` como en el alta; `slug_locked` → `fieldErrors.slug = ["Solo se puede cambiar en borrador."]`; `not_found` → "El viaje ya no existe. Recarga la página."; `archived` → "Este viaje está archivado y no se puede editar.". Éxito → revalidar y `redirect("/crm/viajes")`.
- `changeTripStatusAction`: `tripStatusChangeSchema` → `setTripStatus`. Éxito → `revalidatePath("/crm/viajes")` y mensaje: `published` "Viaje publicado. Ya aparece en la web.", `draft` "Viaje despublicado. Ya no aparece en la web.", `archived` "Viaje archivado.". `invalid_transition` → "El viaje ya no está en ese estado. Recarga la página."
- `invalid_input` → "Revisa los campos marcados." con `fieldErrors` (mensajes del schema) y `values` (solo los campos conocidos del formulario, como strings).
- Mensajes de `unauthorized`/`forbidden`: "Tu sesión no es válida. Vuelve a iniciar sesión." / "No tienes permiso para gestionar viajes."
- Si el service lanza → `throw new Error("trip action failed")` sin causa (el mensaje de la base no sale).
- No se revalida `/`: las lecturas públicas son por petición (`connection()`).

### Rutas (`app/`, F2)
Ambas bajo `app/crm/(protected)/`, heredan el layout protegido (`CrmShell`, `robots: noindex`) y siguen el patrón de `/crm/admin/usuarios`: `getCrmAccess("trips.manage")`; `unauthenticated` → `redirect("/crm/acceso")`; `forbidden` → `<section>` con el `h1` de la página y el texto sin permiso (texto estático, sin componente nuevo).
- `app/crm/(protected)/viajes/page.tsx` (nuevo): `metadata = { title: "Viajes" }`. `h1` "Viajes", enlace "Nuevo viaje" (`Link` + `buttonVariants()`) a `/crm/viajes/nuevo` y `<TripTable trips={await listTrips()} />`.
- `app/crm/(protected)/viajes/[id]/page.tsx` (nuevo): `metadata = { title: "Viaje" }`.
  - `id === "nuevo"` → `h1` "Nuevo viaje" + `<TripForm />`.
  - si no, `getTripById(id)`; `null` → `notFound()`; `archived` → `h1` "Viaje archivado" + "Este viaje está archivado y no se puede editar." + enlace "Volver a viajes"; resto → `h1` "Editar viaje" + `<TripForm trip={trip} />`.

### Componentes
| Componente | Tipo | Detalle |
|---|---|---|
| `table`, `badge`, `button`, `input`, `label`, `native-select`, `alert-dialog` | shadcn (instalado) | Lista, estado, acciones, formulario y diálogo de confirmación |
| `textarea` | shadcn (instalar: `npx shadcn@latest add textarea`) | `summary` e `includes` |
| `ConfirmActionButton` | existente (`modules/accounts/components/ConfirmActionButton.tsx`) → se mueve a `components/shared/ConfirmActionButton.tsx` (F2) | Genérico: `ConfirmActionButton<State extends ConfirmActionState>` con `action: (prev: State, formData: FormData) => Promise<State>` y las mismas props que hoy (`fields`, `label`, `title`, `description`, `confirmLabel`, `variant`). Exporta `type ConfirmActionState = { status: "idle" } \| { status: "success"; message: string } \| { status: "error"; message: string }`. `StaffActionState` y `TripActionState` encajan sin cambios. Sin `any`. Se borra el original y `StaffTable` e `InvitationsTable` importan desde `@/components/shared/ConfirmActionButton` |
| `CrmShell` | existente (`modules/accounts/components/CrmShell.tsx`) | Añade el enlace "Viajes" a `/crm/viajes` en el `<nav>` si `can(roles, "trips.manage")`, antes de "Usuarios", con el mismo estilo. Props sin cambios |
| `TripTable` | nuevo, `modules/trips/components/TripTable.tsx` (Server; no existe ninguna tabla de viajes) | Props `{ trips: Trip[] }`. Columnas "Viaje" (título + slug en `text-muted-foreground`), "Destino", "Carrera", "Precio", "Estado" (`Badge`: published `default` "Publicado", draft `secondary` "Borrador", archived `outline` "Archivado"; etiquetas en una constante local) y "Acciones" (solo si no está archivado): enlace "Editar" a `/crm/viajes/<id>`; `ConfirmActionButton` "Publicar" (draft) o "Despublicar" (published), `variant="outline"`; y "Archivar", `variant="destructive"`. Todos con `changeTripStatusAction` y `fields={{ id, status: <destino> }}`. Textos de los diálogos: "¿Publicar «{title}»?" / "Aparecerá en la web pública con sus datos actuales."; "¿Despublicar «{title}»?" / "Dejará de aparecer en la web pública. Podrás volver a publicarlo."; "¿Archivar «{title}»?" / "Dejará de aparecer en la web y no se podrá editar ni volver a publicar." Vacío: texto del criterio de F2 |
| `TripForm` | nuevo, `modules/trips/components/TripForm.tsx` (`"use client"`; no existe ningún formulario de viajes) | Props `{ trip?: Trip }`. Sin `trip` usa `createTripAction` (botón "Crear viaje"); con `trip`, `updateTripAction` + campo oculto `id` (botón "Guardar cambios"). `useActionState`. Campos: Título, Identificador (slug; `readOnly` + "Solo se puede cambiar en borrador." si `trip.status !== "draft"`), Ciudad, País, Fecha de la carrera (`type="date"`), Inicio y Fin del viaje (`type="date"`), Distancias ("separadas por comas"), Resumen (`Textarea`), Qué incluye (`Textarea`, "uno por línea"), Precio desde (`type="number"`, `min=0`, `step=1`), Moneda (`maxLength=3`, p. ej. USD), Cupos (`type="number"`, `min=1`), URL de la imagen (`type="url"`). Valores iniciales: `state.values` si hay error; si no, los de `trip` (listas unidas con ", " y saltos de línea; números a string; `null` → ""). Error por campo con `<p role="alert">` y `aria-invalid`; mensaje general arriba. Botón deshabilitado y "Guardando…" mientras `pending`. Debe conservar lo escrito tras un error (React 19 resetea los formularios no controlados al terminar la acción; técnica sugerida: `onSubmit` + `startTransition`, como `InviteStaffForm`, o `key` derivada del estado) |

### API pública del módulo: `modules/trips/index.ts`
- (F1) `listPublishedTrips`, `getPublishedTripBySlug`, `formatTripDate`, `formatTripDateRange`, `formatTripPrice`, `type PublicTrip`, `type TripPrice`.
- (F2) además `listTrips`, `getTripById`, `TripTable`, `TripForm`, `type Trip`.

### Relación con otras specs
- `landing-public-site.md` y `crm-leads-pipeline.md` (obsoletas) citan un contrato anterior (`listPublishedTrips(): Trip[]`, `formatPrice`, `lib/dates.ts`, `lib/formState.ts`). Al reescribirlas deben usar `PublicTrip`, `formatTripPrice`/`formatTripDate` y el `slug` de esta spec.
- La landing de la otra rama puede desarrollar contra este contrato mockeando `@/modules/trips` en sus tests hasta que F1 esté en `main`.

## Reutilización
- `getDb()` y `db.batch` (`lib/db.ts`), `lib/db-schema.ts`, `npm run db:generate` y el procedimiento manual de migración del README; sin cambios en `lib/db.ts`, `lib/env.ts` ni `drizzle.config.ts`.
- `requirePermission`, `UnauthorizedError`/`ForbiddenError` (`lib/auth/`), `can()` y su matriz (ampliada), `getCrmAccess(permission)` (`@/modules/accounts`).
- Patrón de `staff.actions.ts` (guarda → zod → service → revalidate; error genérico sin causa) y de la página `/crm/admin/usuarios`.
- `ConfirmActionButton` (movido a `components/shared/`), `CrmShell`.
- shadcn instalados: `table`, `badge`, `button` (`buttonVariants`), `input`, `label`, `native-select`, `alert-dialog`, `card`. A instalar: `textarea`.
- Fake del cliente Neon HTTP de `modules/accounts/services/staff.service.test.ts` para los tests del service (se copia el patrón en el test de trips; si un tercer módulo lo necesita, se sube a un helper compartido).
- `staffDisplay` (`CRM_TIME_ZONE`, `formatStaffDateTime`) **no** se usa: los viajes solo tienen fechas de calendario (ver Decisiones).

## Tests
- `lib/auth/permissions.test.ts` (F1, ampliar): filas de `trips.manage` (`commercial` → false, `admin` → true, ambos → true, `[]` → false); los bucles "admin tiene todo" y "sin roles nada" incluyen `trips.manage`; los casos existentes no cambian.
- `modules/trips/schemas/trips.schema.test.ts` (F1):
  - `tripStatusSchema.options` coincide con `tripStatusEnum.enumValues`;
  - caso válido completo → listas separadas (`"42K, 21K , ,10K"` → `["42K","21K","10K"]`; líneas en blanco de `includes` descartadas), números enteros, `"usd"` → `"USD"`, vacíos → `null`;
  - slug: mayúsculas se pasan a minúsculas; espacios, tildes, `--`, guion inicial o final y < 3 caracteres → error;
  - `distances` vacío o con 11 elementos → error; `includes` con 21 → error;
  - precio `"-1"`, `"12.5"`, `"abc"` → error; precio sin moneda → error en `priceCurrency`; moneda sin precio → error en `priceAmount`;
  - `capacity` `"0"` → error; `imageUrl` `http://…` → error, `https://…` válido;
  - solo `startDate` → error en `endDate`; `endDate < startDate` → error; `raceDate` fuera del rango → error en `raceDate`;
  - título de 2 caracteres → error; claves extra (`status`) desaparecen;
  - `tripStatusChangeSchema` rechaza id no UUID y estado desconocido.
- `modules/trips/services/trips.service.test.ts` (F1; mocks de `server-only`, `@/lib/db` con el fake de Neon HTTP y `next/server` → `connection`):
  - `listPublishedTrips`: llama a `connection()` antes de la consulta; SQL con `status = 'published'` y `ORDER BY race_date, slug`; no selecciona `id`, `status`, `created_at` ni `updated_at`; mapea `price` (`null` si no hay importe) y devuelve `PublicTrip`;
  - `getPublishedTripBySlug`: slug inválido → `null` sin consulta; sin filas → `null`; con fila → `PublicTrip`;
  - `listTrips`: orden con archivados al final; `getTripById`: id no UUID → `null` sin consulta;
  - `createTrip`: no envía `status`; `ON CONFLICT DO NOTHING` sobre `slug`; sin filas → `"slug_taken"`;
  - `updateTrip`: un único batch de 2 sentencias; los cinco resultados según las filas simuladas; fija `updated_at`;
  - `setTripStatus`: estados de origen correctos para cada destino; sin filas → `"invalid_transition"`.
- `modules/trips/utils/tripDisplay.test.ts` (F1): `formatTripDate("2027-04-25")` → "25 de abril de 2027" y `"2027-01-01"` → "1 de enero de 2027" con `TZ` distinto de UTC (p. ej. `vi.stubEnv("TZ", "America/Lima")` o comparando con la salida esperada fija); `formatTripDateRange` con el mismo mes y con meses distintos; `formatTripPrice(null)` → "Precio a consultar"; importe con moneda sin decimales; importe 0.
- `components/shared/ConfirmActionButton.test.tsx` (F2; jsdom + Testing Library, acción simulada): abre el diálogo con el título y la descripción; al confirmar envía los `fields` como `FormData`; con `success` se cierra; con `error` muestra el mensaje con `role="alert"` y sigue abierto; "Cancelar" cierra sin llamar a la acción.
- `modules/trips/actions/trips.actions.test.ts` (F2; llamada directa con `FormData`; mocks de `server-only`, `@/lib/auth/guards`, del service, `next/cache` y `next/navigation`):
  - sin sesión / sin permiso → `unauthorized` / `forbidden` y el service no se llama (las tres acciones);
  - datos inválidos → `invalid_input` con `fieldErrors` y `values`;
  - alta válida → `createTrip` con la entrada parseada (sin `status` aunque venga en el form), `revalidatePath("/crm/viajes")` y `redirect("/crm/viajes")`; `"slug_taken"` → error en `slug` sin revalidar;
  - edición con id no UUID → `invalid_input`; cada resultado de `updateTrip` → su código y mensaje;
  - cambio de estado válido → `setTripStatus(id, status)`, revalida y mensaje por destino; `"invalid_transition"` → su error;
  - el service lanza → la acción lanza `"trip action failed"` sin el mensaje original.
- Sin unit test (SETUP §3): `lib/db-schema.ts` (cubierto por la migración y la prueba manual), tipos, `TripTable` y `TripForm` (componentes del módulo; su lógica está en schema, acciones y `tripDisplay`), `CrmShell`, páginas async de `app/` y componentes de `components/ui/`.

## Plan de tareas
### Fase 1: datos, permiso y lectura pública (5 tareas, 15 archivos: 2 generados por drizzle-kit)
- [ ] T1 — Base compartida en `lib/`:
  - tabla `trips` y enum `trip_status` en el schema;
  - `npm run db:generate` y revisión del SQL (solo objetos nuevos en `public`, sin `neon_auth` ni `DROP`);
  - permiso `trips.manage` en la matriz y sus tests.

  Archivos: `lib/db-schema.ts`, `drizzle/0001_*.sql` (generado), `drizzle/meta/0001_snapshot.json` (generado), `drizzle/meta/_journal.json`, `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: — · secuencial (base, `lib/`)
- [ ] T2 — Schemas zod y tipos de viajes con su test · archivos: `modules/trips/schemas/trips.schema.ts`, `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/types/trips.types.ts` · depende de: T1 · secuencial
- [ ] T3 — Service (lecturas públicas con `connection()`, lecturas del CRM, alta, edición y cambio de estado) con tests · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: T2 · paralelo (con T4; archivos disjuntos)
- [ ] T4 — Utilidades de formato públicas con test · archivos: `modules/trips/utils/tripDisplay.ts`, `modules/trips/utils/tripDisplay.test.ts` · depende de: T2 · paralelo (con T3)
- [ ] T5 — API pública del módulo y README:
  - `index.ts` con el contrato de F1;
  - README: migración `0001` (revisión, aplicación manual entre `BEGIN`/`COMMIT`, GRANT si el rol no es owner), `INSERT` de ejemplo con marcadores `<...>` para crear un viaje a mano antes de F2, y contrato de lectura para la landing.

  Archivos: `modules/trips/index.ts`, `README.md` · depende de: T3, T4 · secuencial

### Fase 2: gestión en el CRM (5 tareas, 16 archivos: 1 generado por el CLI de shadcn y 1 eliminado)
Requisito previo: Fase 1 de esta spec cerrada y Fase 3 de `accounts-roles-permissions.md` cerrada (existen `StaffTable`, `InvitationsTable` y el `<nav>` de `CrmShell`). Nota: `modules/trips/index.ts` se modifica en la última tarea porque reexporta archivos de las anteriores.
- [ ] T1 — Build y dependencias compartidas:
  - si la Pregunta abierta 1 se resuelve como "webpack": `build` → `next build --webpack` y medir el Worker (`build:worker` + `wrangler deploy --dry-run`, sin desplegar). Se omite si ya se aplicó antes en modo build;
  - `npx shadcn@latest add textarea` (sin sobrescribir archivos existentes).

  Archivos: `package.json`, `components/ui/textarea.tsx` · depende de: Fase 1 · secuencial (base)
- [ ] T2 — `ConfirmActionButton` genérico en `components/shared/` con su test; borrar el de `accounts` y actualizar sus importaciones · archivos: `components/shared/ConfirmActionButton.tsx`, `components/shared/ConfirmActionButton.test.tsx`, `modules/accounts/components/ConfirmActionButton.tsx` (eliminar), `modules/accounts/components/StaffTable.tsx`, `modules/accounts/components/InvitationsTable.tsx` · depende de: F2-T1 · secuencial (`components/shared/`)
- [ ] T3 — `TripActionState` y Server Actions de viajes con tests de llamada directa · archivos: `modules/trips/types/trips.types.ts`, `modules/trips/actions/trips.actions.ts`, `modules/trips/actions/trips.actions.test.ts` · depende de: F2-T2 · secuencial
- [ ] T4 — `TripTable` (Server) y `TripForm` (cliente) · archivos: `modules/trips/components/TripTable.tsx`, `modules/trips/components/TripForm.tsx` · depende de: F2-T3 · secuencial
- [ ] T5 — Navegación, API pública y páginas:
  - enlace "Viajes" en `CrmShell`;
  - exports de F2 en `index.ts`;
  - `/crm/viajes` y `/crm/viajes/[id]`;
  - medir el Worker (`build:worker` + `wrangler deploy --dry-run`, sin desplegar) y registrar el gzip frente a la medida anterior.

  Archivos: `modules/accounts/components/CrmShell.tsx`, `modules/trips/index.ts`, `app/crm/(protected)/viajes/page.tsx`, `app/crm/(protected)/viajes/[id]/page.tsx` · depende de: F2-T4 · secuencial

## Preguntas abiertas
1. **Tamaño del Worker (bloquea F2-T1).** Hoy ~1610 KiB gzip; ~1,8 MiB estimados tras `/crm/admin/usuarios`. F2 añade 1 ruta nueva bajo `/crm` más la dinámica (~160–320 KiB con Turbopack) y la landing de la otra rama sumará las suyas, así que con Turbopack se pasaría el umbral de consulta de 2 MiB (límite Free: 3 MiB). Opciones:
   - (a) **Recomendada:** `next build --webpack` como F2-T1, o antes en modo build (1 archivo) si la landing lo necesita primero. Se midió −458 KiB. `npm run dev` sigue con Turbopack; el coste es que dev y build usan bundlers distintos, así que la verificación con `build:worker` en Linux/WSL sigue siendo obligatoria.
   - (b) Mantener Turbopack y aceptar acercarse a 3 MiB, subiendo el umbral de consulta (¿a cuánto?).
2. **¿Quién gestiona el catálogo?** La spec deja `trips.manage` solo para `admin` (mínimo privilegio). Si el equipo comercial también debe crear, editar y publicar viajes, basta con `"trips.manage": ["commercial"]` en la matriz (y su test). ¿Lo concedemos a `commercial`?
3. **Datos reales de "Maratón de Santiago 2027".** La web de referencia (`carreras-viajeras-santiago-2027.ronaldlora.chatgpt.site`) no resuelve desde este entorno (DNS `ENOTFOUND`), así que los campos salen de tu lista (fechas, ciudad, país, distancias, precio, qué incluye, cupos, imagen, estado). ¿Puedes confirmar fecha de la carrera, fechas del viaje, distancias, precio y moneda, lo que incluye, cupos y URL de imagen? ¿Falta algún campo que la web muestre (hotel, itinerario, requisitos)?
4. **Moneda y precio.** La spec admite cualquier código ISO por viaje y un único precio "desde" entero. ¿Vendes siempre en una moneda (USD, PEN, CLP…)? Si es así, se cambia el campo libre por una lista fija. ¿Necesitas precios distintos por distancia o decimales?
5. **Cupos.** `capacity` son cupos **totales** informativos y la landing decide si los muestra. ¿Prefieres "cupos disponibles" que el equipo actualiza a mano conforme registra pagos?
6. **Archivado.** Archivar es final en el MVP (no se restaura ni se borra). ¿Necesitas "Restaurar a borrador"? Sería una transición más en `STATUS_SOURCES` y un botón.
7. **Rol de base de datos.** Si `DATABASE_URL` no usa el rol owner, necesita `SELECT, INSERT, UPDATE` en `trips`. ¿Preparas tú el GRANT en la consola de Neon junto con los pendientes de `accounts-roles-permissions.md` (Pregunta 4)?
8. **Coordinación con la landing.** ¿La landing tendrá página de detalle por viaje (`/viajes/<slug>`)? La spec ya incluye `getPublishedTripBySlug` para ello. ¿Hay algún consumidor externo que justifique `GET /api/trips`? La recomendación es no crearlo hasta que exista uno.
