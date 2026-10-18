# Roles y permisos mínimos (RBAC de staff y organizaciones)

- Módulo: accounts
- Estado: borrador
- Depende de: platform-neon-foundation.md (Fase 1 aprobada)

## Objetivo
Implementar la "Fase 2: permisos mínimos" que `platform-neon-foundation.md` deja para una spec separada: tablas de aplicación para perfiles, asignaciones de staff, organizaciones y membresías; guardas de autorización server-only que se ejecutan en cada API y Server Action, y pruebas de todos los casos de denegación que exige la foundation. Sirve a los cuatro perfiles actuales: RUNNER, COLABORADOR (representantes de organizaciones), COMERCIAL y ADMIN, con una sola cuenta de Neon Auth por persona, con permisos que solo concede la aplicación y nunca el cliente.

Precedencia: si algo de esta spec contradice `platform-neon-foundation.md`, gana la foundation.

## Alcance
- Incluye:
  - Schema Drizzle en `public` de cuatro tablas (`profiles`, `staff_assignments`, `organizations`, `organization_memberships`) y sus enums; migración SQL generada con `npm run db:generate` y revisada (sin aplicarla en remoto).
  - Matriz estática y pura de permisos de staff (`can()`).
  - Guardas server-only en `lib/auth/`: `getCurrentUser`, `requireUser`, `requireVerifiedEmail`, `requirePermission`, `requireCrmUser`, `requireOrgRole`; errores `UnauthorizedError`/`ForbiddenError` con mapeo a 401/403.
  - Ruta mínima protegida `GET /api/crm/me`, para probar 401/403/200 con llamadas directas.
  - (Fase 2) Una Server Action protegida y útil: el admin cambia el estado de verificación de una organización. Cubre el criterio de la foundation que exige probar la llamada directa a una Server Action.
  - Scripts SQL manuales y auditables para asignar y revocar roles de staff por `user_id` exacto (primer ADMIN incluido).
  - (Fase 2) Documentación operativa en `README.md`: mapeo de roles, alta del primer ADMIN, aplicación manual de la migración y verificación de que `neon_auth` no cambia.
- No incluye:
  - **UI de autenticación** (registro, login, logout, recuperación de contraseña, verificación de email): irá en la spec siguiente `accounts-auth-ui.md`. Nota para esa spec: `@neondatabase/auth-ui` ya está en el árbol como dependencia de `@neondatabase/auth`. Hoy el Worker pesa ~1071 KiB gzip (límite de Workers Free: 3 MiB), así que hay que medir el impacto en el bundle antes de importarla.
  - UI de CRM (layout `/crm`, embudo, leads), UI o API para gestionar staff, membresías u organizaciones (alta, onboarding, invitaciones, solicitud de verificación).
  - Endpoints para colaboradores o públicos sobre organizaciones (la foundation los prohíbe en esta fase).
  - Recursos de runner (viajes, compras, reservas, itinerarios, comunidad).
  - Plugins Organization (Beta) y Admin de Neon Auth, y el campo `user.role` de Neon Auth: no se usan para autorizar (ver "Decisiones").
  - `proxy.ts`/middleware de rutas, RLS, Cloudflare Access, tabla de auditoría histórica, borrado de cuentas y limpieza de perfiles huérfanos, permisos (GRANT) del rol de base de datos de la app.
  - Perfiles OPERACIONES y MODERADOR: no existen por ahora. Se añadirán en una spec futura, cuando hagan falta, como valores nuevos del enum `staff_role` (migración `ALTER TYPE staff_role ADD VALUE …`) y entradas nuevas en la matriz.
  - Aplicar migraciones o asignar roles en ramas Neon remotas: solo el usuario puede hacerlo, en su máquina y con autorización explícita.

## Requisitos
1. Un solo proveedor de identidad: Neon Auth vía `getAuth()` (`lib/auth/server.ts`). No se instala otro servidor Better Auth ni dependencias nuevas.
2. La identidad de la aplicación es `session.user.id` de Neon Auth (string estable). El correo nunca es clave de autorización.
3. RUNNER = cualquier usuario autenticado. Su fila en `profiles` se crea de forma perezosa en la primera petición autenticada. El registro público nunca crea staff, membresías ni organizaciones verificadas: esas filas solo nacen de procedimientos internos.
4. COLABORADOR = usuario con membresía (`owner|admin|member`) en una organización. Una persona puede ser runner, tener membresías en varias organizaciones con roles distintos y además tener roles de staff, con una sola cuenta.
5. Staff = asignación activa (`revoked_at IS NULL`) en `staff_assignments` con rol `commercial|admin`. Los roles se leen de la base de datos en **cada petición**: no se guardan en cookies, JWT, metadatos de Neon Auth ni caché entre peticiones.
6. La autorización deniega por defecto: un permiso desconocido, una lista de roles vacía, una sesión ausente o malformada, un error de Neon Auth o un error de base de datos terminan en denegación.
7. Solo cuentan los datos del servidor. Los campos de body, query, cookies propias o `session.user` (por ejemplo, `role`, `verified`, `organizationId`, `verifiedBy`) nunca elevan privilegios.
8. CRM (foundation): sesión válida + email verificado + asignación de staff activa con un rol al que la matriz conceda `crm.access`.
9. Colaborador (foundation): sesión + email verificado + membresía en **esa** organización + organización con `status = 'verified'` + rol de membresía permitido. El acceso a otra organización (acceso cruzado) y a una organización no verificada se deniegan.
10. ADMIN tiene todos los permisos de staff. No tiene bypass sobre las guardas de organización: actuar como colaborador exige membresía.
11. No existe bypass de desarrollo: ninguna variable de entorno, `NODE_ENV` ni flag omite las guardas.
12. El primer ADMIN (y cualquier rol antes de que exista una UI de gestión) se asigna con un script SQL manual, por `user_id` exacto y con un motivo obligatorio. Nunca se asigna por ser el primer registro.
13. Las guardas se ejecutan dentro de cada Route Handler y Server Action, no solo en layouts.
14. Los errores que se devuelven y registran no incluyen el mensaje original de la base de datos ni de Neon Auth.

## Criterios de aceptación
Fase 1:
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera una sola migración en `drizzle/` que crea 4 enums y 4 tablas en `public`. El SQL no contiene `neon_auth`, `DROP` ni `CREATE SCHEMA`, y `drizzle.config.ts` no cambia.
- [ ] (F1) Dado un clon limpio sin secretos, cuando ejecuto `npm run lint`, `npx vitest run` y `npm run build`, entonces pasan sin conectar con Neon.
- [ ] (F1) Dada una petición sin sesión, cuando llamo directamente a `GET /api/crm/me`, entonces responde 401 `{ "error": "unauthorized" }` con `Cache-Control: no-store` y no se ejecuta ninguna consulta a la base de datos.
- [ ] (F1) Dado que Neon Auth devuelve un error o una sesión con `user.id` vacío o malformado, cuando llamo a `GET /api/crm/me`, entonces responde 401.
- [ ] (F1) Dado un usuario con sesión pero `emailVerified: false` (aunque tenga asignación `admin` activa), cuando llamo a `GET /api/crm/me`, entonces responde 403 `{ "error": "forbidden" }`.
- [ ] (F1) Dado un runner con email verificado y sin asignaciones, cuando llamo a `GET /api/crm/me`, entonces responde 403. En esa petición se hace el upsert perezoso de su perfil y la lectura de roles en un solo `db.batch`.
- [ ] (F1) Dado un usuario verificado con asignación activa `commercial` o `admin`, cuando llamo a `GET /api/crm/me`, entonces responde 200 `{ userId, staffRoles }`.
- [ ] (F1) Dado un staff con acceso, cuando su asignación se revoca entre dos peticiones, entonces la primera responde 200 y la siguiente 403 (sin caché entre peticiones).
- [ ] (F1) Dado que la consulta de perfil o roles falla, cuando llamo a `GET /api/crm/me`, entonces responde 403 con cuerpo `{ "error": "forbidden" }`, sin el texto del error original.
- [ ] (F1) Dado un runner verificado que envía `role=admin` en body, query y cookie, y cuya sesión de Neon Auth trae `user.role: "admin"`, cuando llamo a `GET /api/crm/me`, entonces responde 403.
- [ ] (F1) Dada `requireOrgRole(orgId, ...roles)`, entonces deniega con 403: un `orgId` que no es UUID (sin consultar la base de datos), una organización en la que el usuario no tiene membresía (acceso cruzado aunque tenga membresía en otra), una organización con estado `unverified|pending|rejected|suspended` y un rol de membresía no incluido en `roles`. Con membresía, organización `verified` y rol permitido devuelve `{ user, organizationId, role }`. Con `roles` vacío acepta cualquier rol de membresía.
- [ ] (F1) Dado `can(roles, permission)`, entonces devuelve `false` para roles vacíos o un permiso desconocido, `true` para `admin` en todos los permisos y exactamente la matriz de "Diseño técnico" para los demás.
- [ ] (F1) Dado el código de `lib/auth/`, `app/api/` y `modules/`, cuando lo reviso, entonces no hay ninguna variable de entorno, `NODE_ENV` ni flag que omita las guardas, ni ninguna caché de roles a nivel de módulo.
- [ ] (F1) Dado `scripts/sql/grant-staff-role.sql` ejecutado con psql y las variables `user_id`, `role` y `reason`, entonces inserta una asignación activa. Falla si el perfil no existe (FK), si ya hay una asignación activa del mismo rol (índice único parcial) o si `reason` está vacío. `scripts/sql/revoke-staff-role.sql` marca `revoked_at` y devuelve la fila afectada.

Fase 2:
- [ ] (F2) Dada `updateOrganizationStatusAction` llamada directamente: sin sesión devuelve `{ status: "error", code: "unauthorized" }`; con runner verificado o `commercial` verificado, `forbidden`; con `admin` verificado y la organización existente, `{ status: "success" }`. En los casos denegados no se llama al service.
- [ ] (F2) Dado un admin revocado entre dos llamadas, cuando llamo a la acción por segunda vez, entonces devuelve `forbidden`. Si la base de datos falla dentro de la guarda, también devuelve `forbidden`.
- [ ] (F2) Dado un input con campos extra (`verifiedBy`, `role`, `userId`), cuando la acción tiene éxito, entonces los ignora y `verified_by` es el `user.id` de la sesión.
- [ ] (F2) Dado un `organizationId` que no es UUID o un `status` fuera de `verified|rejected|suspended`, entonces devuelve `invalid_input` sin actualizar nada. Si la organización no existe, devuelve `not_found`.
- [ ] (F2) Dado `status: "verified"`, entonces se guardan `verified_at = now()` y `verified_by = actor`. Con `rejected` o `suspended` ambos quedan en `NULL`. En todos los casos se actualiza `updated_at`.
- [ ] (F2) Dado `README.md`, entonces documenta: el mapeo de roles, el alta y revocación manual de staff con los scripts, la aplicación manual de la migración en una rama de desarrollo y cómo verificar que `neon_auth` no cambió.
- [ ] (F2, manual en la máquina del usuario y con su autorización) Dada una rama Neon de desarrollo: se aplica la migración; el volcado del schema `neon_auth` es idéntico antes y después; tras iniciar sesión y asignar `admin` por script, `GET /api/crm/me` responde 200; tras revocarlo responde 403 en la siguiente petición. Esto no se ejecuta en `production`.

## Diseño técnico

### Decisiones (y relación con la foundation)
- **Nombre de tabla:** `staff_assignments`, tal como lo nombra la foundation, en lugar de `staff_role_assignments`.
- **Columna `active` de la foundation:** se expresa como `revoked_at IS NULL`. Así hay una sola fuente de verdad y se conserva el historial de revocaciones.
- **Columna `status` de la foundation:** se mantiene el nombre `status` en `organizations`, con valores `unverified|pending|verified|rejected|suspended`.
- **Roles de staff (decidido por el usuario):** el enum `staff_role` es `commercial | admin`. Mapeo desde la foundation: `crm_admin` → `admin` (contiene todo) y `crm_agent` → `commercial`. Otros perfiles internos se añadirán en specs futuras con `ALTER TYPE staff_role ADD VALUE …`.
- **Matriz única:** las guardas de staff reciben un **permiso**, no listas de roles (`requirePermission(permission)`), y `can()` es la única fuente de la matriz. Esto evita listas de roles repetidas por el código. Sustituye al `requireStaffRole(...roles)` propuesto. `requireCrmUser()` se mantiene como nombre de la foundation y equivale a `requirePermission("crm.access")`.
- **Plugins de Neon Auth no usados:** ni Organization (Beta, sin roles ni permisos propios) ni el `user.role` del plugin Admin. La foundation define tablas de aplicación y prohíbe confiar en metadatos de identidad.
- **Sin FK hacia `neon_auth.user`:**
  - Para que `drizzle-kit` genere esa FK habría que modelar `neon_auth.user` en el schema, y entonces generaría `CREATE SCHEMA`/`CREATE TABLE` sobre un schema gestionado por Neon. Además, una FK entre schemas podría bloquear operaciones internas de Neon Auth.
  - `profiles.user_id` es `text`, que admite un id con forma de UUID o de texto, y solo se rellena desde sesiones validadas.
  - Las demás tablas hacen FK a `profiles.user_id`, dentro de `public`.
  - Antes de aplicar la migración, el usuario comprueba el tipo real del id con `SELECT data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'id';`.
  - Una FK posterior queda como Pregunta abierta 4.
- **Ubicación del schema:** se queda en `lib/db-schema.ts`, sin cambiar `drizzle.config.ts` (KISS). Son tablas transversales que consultan las guardas de `lib/auth/` y varios módulos. Dividir en `db/schema/*.ts` se decidirá cuando haya tablas de dominio que lo justifiquen.
- **Fallo de base de datos dentro de la autorización:** se convierte en `ForbiddenError` (403, falla cerrado). El 401 queda reservado para la ausencia de sesión.
- **Caché de sesión:** `getSession()` usa la cookie de datos de sesión de Neon Auth (TTL por defecto de 300 s), así que `emailVerified` puede ir hasta 5 minutos por detrás. Los roles de staff y las membresías no se cachean nunca.
- **`cache()` de React:** memoiza `getCurrentUser` dentro de un render RSC. En Route Handlers y Server Actions no cachea, y cada guarda consulta de nuevo; eso es correcto y deseado.

### Rutas (`app/`)
- `app/api/crm/me/route.ts` (nuevo, F1): `GET` delgado.
  ```ts
  export async function GET() {
    try {
      const user = await requireCrmUser();
      return Response.json({ userId: user.id, staffRoles: user.staffRoles }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return authErrorResponse(error); }
  }
  ```
  No lee body, query ni cookies propias. Para otros métodos, Next responde 405.
- No hay páginas nuevas.

### Componentes
Ninguno: esta spec no tiene UI. No se instala ningún componente de shadcn.

### Base de datos: `lib/db-schema.ts` (modificar, F1)
Drizzle `pg-core`, columnas en snake_case y todo en `public`:

| Objeto | Definición |
|---|---|
| enum `staff_role` | `commercial`, `admin` |
| enum `organization_type` | `club`, `brand`, `organizer`, `gym`, `ally` (ver Pregunta abierta 1) |
| enum `organization_status` | `unverified`, `pending`, `verified`, `rejected`, `suspended` |
| enum `organization_role` | `owner`, `admin`, `member` |
| `profiles` | `user_id text PK` (id de Neon Auth); `created_at timestamptz not null default now()` |
| `staff_assignments` | `id uuid PK default gen_random_uuid()`; `user_id text not null → profiles.user_id`; `role staff_role not null`; `reason text not null`; `granted_by text null → profiles.user_id` (NULL = script manual); `granted_at timestamptz not null default now()`; `revoked_at timestamptz null`; `revoked_by text null → profiles.user_id`; índice único parcial `staff_assignments_active_uq (user_id, role) WHERE revoked_at IS NULL` |
| `organizations` | `id uuid PK default gen_random_uuid()`; `type organization_type not null`; `name text not null`; `slug text not null unique`; `status organization_status not null default 'unverified'`; `verified_at timestamptz null`; `verified_by text null → profiles.user_id`; `created_at`, `updated_at timestamptz not null default now()` |
| `organization_memberships` | `organization_id uuid not null → organizations.id on delete cascade`; `user_id text not null → profiles.user_id`; `role organization_role not null`; `created_at timestamptz not null default now()`; PK `(organization_id, user_id)` |

FK hacia `profiles` con `on delete restrict` (valor por defecto). El archivo exporta las tablas y los enums; los tipos se derivan con `$inferSelect` y `enumValues`, sin escribirlos dos veces.

### `lib/auth/` (server-only; `import "server-only"` en cada archivo de código)

`lib/auth/permissions.ts` (nuevo, F1): pura, sin E/S.
```ts
export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type OrganizationRole = (typeof organizationRoleEnum.enumValues)[number];
export type Permission = "crm.access" | "organizations.verify";
// Matriz (admin siempre permitido por regla explícita):
// crm.access           → commercial
// organizations.verify → (ningún rol además de admin)
export function can(roles: readonly StaffRole[], permission: Permission): boolean;
```
Solo se definen los permisos que tienen consumidor en esta spec. Los futuros (por ejemplo, `leads.*` → commercial, `staff.manage` → admin) los añadirá la spec que los use, con este mismo patrón.

`lib/auth/errors.ts` (nuevo, F1):
```ts
export class UnauthorizedError extends Error {} // → 401
export class ForbiddenError extends Error {}    // → 403
// 401 { error: "unauthorized" } | 403 { error: "forbidden" }, Cache-Control: no-store; cualquier otro error se relanza.
export function authErrorResponse(error: unknown): Response;
```

`lib/auth/access.service.ts` (nuevo, F1): acceso a datos de autorización con `getDb()`.
```ts
// Un solo db.batch (un round-trip HTTPS): INSERT profiles ON CONFLICT DO NOTHING + SELECT role FROM staff_assignments WHERE user_id = $1 AND revoked_at IS NULL.
export async function syncProfileAndLoadStaffRoles(userId: string): Promise<StaffRole[]>;
// JOIN organization_memberships + organizations por (user_id, organization_id); null si no hay membresía.
export async function findMembership(userId: string, organizationId: string): Promise<{ role: OrganizationRole; status: OrganizationStatus } | null>;
```
Los errores de la base de datos se propagan: la guarda decide.

`lib/auth/guards.ts` (nuevo, F1):
```ts
export type CurrentUser = { id: string; email: string; emailVerified: boolean; staffRoles: StaffRole[] };
export const getCurrentUser: () => Promise<CurrentUser | null>; // cache() de React
export function requireUser(): Promise<CurrentUser>;            // 401 sin sesión
export function requireVerifiedEmail(): Promise<CurrentUser>;   // + 403 si !emailVerified
export function requirePermission(permission: Permission): Promise<CurrentUser>; // + 403 si !can()
export function requireCrmUser(): Promise<CurrentUser>;         // requirePermission("crm.access")
export function requireOrgRole(organizationId: string, ...roles: OrganizationRole[]):
  Promise<{ user: CurrentUser; organizationId: string; role: OrganizationRole }>;
```
Flujo de `getCurrentUser`:
1. `getAuth().getSession()`.
2. Si hay `error`, falta `data` o la sesión no pasa un schema zod mínimo (`user.id` string 1–255, `user.email` string, `user.emailVerified` boolean), devuelve `null`. Los demás campos de `user` (incluido `role`) se descartan.
3. `syncProfileAndLoadStaffRoles(user.id)`. Si lanza, lanza `ForbiddenError` sin `cause` ni el mensaje original.

`requireOrgRole`:
1. Valida `organizationId` con `z.uuid()` y, si no es válido, lanza `ForbiddenError` sin consultar.
2. `requireVerifiedEmail()`.
3. `findMembership()`, cuyos errores se convierten en `ForbiddenError`.
4. Lanza `ForbiddenError` si devuelve `null`, si `status !== "verified"` o si `roles.length > 0` y el rol no está incluido.

### Módulo `modules/accounts/` (F2)
- `modules/accounts/schemas/organizations.schema.ts`: `updateOrganizationStatusSchema = z.object({ organizationId: z.uuid(), status: z.enum(["verified", "rejected", "suspended"]) })`. `z.object` descarta las claves desconocidas.
- `modules/accounts/types/organizations.types.ts`: `UpdateOrganizationStatusInput` (`z.infer`) y `UpdateOrganizationStatusResult`.
- `modules/accounts/services/organizations.service.ts`:
  ```ts
  // UPDATE organizations SET status, verified_at, verified_by, updated_at WHERE id = $1 RETURNING id; false si 0 filas.
  export async function updateOrganizationStatus(input: UpdateOrganizationStatusInput, actorUserId: string): Promise<boolean>;
  ```
- `modules/accounts/actions/organizations.actions.ts` (`"use server"`):
  ```ts
  export async function updateOrganizationStatusAction(input: unknown): Promise<UpdateOrganizationStatusResult>;
  // requirePermission("organizations.verify") → safeParse → updateOrganizationStatus(data, user.id)
  ```
  Los errores `UnauthorizedError`/`ForbiddenError` se convierten en `code`; cualquier otro error se relanza sin datos sensibles. No hay `revalidatePath` porque todavía no hay páginas.
- `modules/accounts/index.ts`: exporta `updateOrganizationStatusAction` y el tipo `UpdateOrganizationStatusResult`.

### Contrato de API
```ts
// GET /api/crm/me
type CrmMeResponse = { userId: string; staffRoles: ("commercial" | "admin")[] }; // 200
type AuthErrorBody = { error: "unauthorized" } /* 401 */ | { error: "forbidden" } /* 403 */;

// Server Action (F2)
// input: { organizationId: string /* uuid */; status: "verified" | "rejected" | "suspended" }
type UpdateOrganizationStatusResult =
  | { status: "success" }
  | { status: "error"; code: "unauthorized" | "forbidden" | "invalid_input" | "not_found" };
```

### Scripts manuales (F1)
`scripts/sql/grant-staff-role.sql` y `scripts/sql/revoke-staff-role.sql`, para `psql` con `\set ON_ERROR_STOP on` dentro de una transacción. Variables:
- grant: `-v user_id=… -v role=… -v reason=…`
- revoke: `-v user_id=… -v role=…`

Comportamiento:
- **Grant:** verifica que `reason` no esté vacío; inserta con `granted_by = NULL` y `RETURNING id, user_id, role, granted_at`.
- **Revoke:** `UPDATE … SET revoked_at = now() WHERE revoked_at IS NULL RETURNING …`.

La cabecera de cada script documenta el uso:
- Obtener el `user_id` exacto en la consola de Neon (Auth → Users) y comprobar ahí el correo.
- El usuario debe haber iniciado sesión al menos una vez, porque su `profiles` se crea de forma perezosa.
- Formato de `reason`: `"<operador>: <motivo>"`.
- Credencial: `DATABASE_MIGRATION_URL`.
- Usar primero una rama de desarrollo; en `production`, solo con autorización explícita.
- Ejemplo: `psql "$DATABASE_MIGRATION_URL" -v user_id='…' -v role=admin -v reason='ronald: primer admin' -f scripts/sql/grant-staff-role.sql`.

### Migración y operación
1. `npm run db:generate` genera `drizzle/0000_*.sql` y `drizzle/meta/*`. Revisarlo: solo `CREATE TYPE`, `CREATE TABLE`, FKs e índices en `public`; `grep -i neon_auth drizzle/*.sql` no devuelve nada.
2. Aplicarla es manual y solo la hace el usuario en una rama Neon de desarrollo, con autorización explícita: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0000_*.sql`. No se añade ningún script `migrate` ni migración automática en build o arranque.
3. Verificar que `neon_auth` no cambió:
   - `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth > before.sql` antes de aplicar y `after.sql` después; `diff before.sql after.sql` debe salir vacío.
   - Alternativa sin `pg_dump`: comparar la salida de `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;`.
4. Contexto: la red de este entorno bloquea `*.neon.tech` y `api.cloudflare.com`, así que la integración contra Neon solo se prueba en la máquina del usuario (o tras habilitar esos dominios). La aprobación de esta spec ("apruebo docs/specs/accounts-roles-permissions.md") debe escribirse en el entorno donde se implemente, porque el registro se firma por máquina.

## Reutilización
- `getAuth()` de `lib/auth/server.ts` (sesión), `getDb()` de `lib/db.ts` (Drizzle `neon-http`, con `db.batch`) y `lib/env.ts` de forma indirecta. Ninguno se modifica.
- `drizzle.config.ts` y el script `db:generate` existentes, sin cambios.
- zod v4 (`z.uuid()`, `safeParse`), `server-only`, `cache` de React.
- El patrón de tests de `lib/env.test.ts`: `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`.
- `drizzle.mock()` de `drizzle-orm/neon-http` (incluido en `drizzle-orm`) para inspeccionar el SQL con `.toSQL()` en los tests de los services, sin conexión.
- shadcn: no aplica (sin UI). No se añaden dependencias.

## Tests
Todos con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`, sin red ni secretos.

- `lib/auth/permissions.test.ts` (F1):
  - matriz completa rol × permiso;
  - `admin` es `true` en todos los permisos;
  - roles vacíos → `false`;
  - permiso desconocido (forzado con un cast) → `false`;
  - `commercial` tiene `crm.access` y no tiene `organizations.verify`;
  - `organizations.verify` solo es `true` con `admin`.
- `lib/auth/access.service.test.ts` (F1, `@/lib/db` mockeado):
  - `syncProfileAndLoadStaffRoles` hace un único `batch` con `INSERT … ON CONFLICT DO NOTHING` para el `userId` recibido y un `SELECT` filtrado por `user_id` y `revoked_at IS NULL`;
  - mapea las filas a `StaffRole[]`;
  - propaga el rechazo de la base de datos;
  - `findMembership` filtra por `user_id` **y** `organization_id` y devuelve `null` sin filas.
- `lib/auth/guards.test.ts` (F1; `@/lib/auth/server` y `@/lib/auth/access.service` mockeados):
  - sin sesión, con `error` de Neon Auth o con `user.id` vacío → `requireUser` lanza `UnauthorizedError` sin consultar la base de datos;
  - `emailVerified: false` con rol `admin` → `requirePermission` lanza `ForbiddenError`;
  - runner verificado sin roles → `ForbiddenError` en `requireCrmUser`;
  - `commercial` y `admin` → permitido en `requireCrmUser`;
  - `commercial` → denegado en `requirePermission("organizations.verify")`; `admin` → permitido;
  - revocación: el mock devuelve `["commercial"]` y luego `[]` → la segunda llamada lanza, y el service se llama dos veces (sin caché entre peticiones);
  - error de la base de datos → `ForbiddenError`, sin `cause` y sin el mensaje original;
  - una sesión con `user.role: "admin"` y campos extra no aporta roles;
  - `requireOrgRole`:
    - UUID inválido → lanza sin llamar a `findMembership`;
    - sin membresía (acceso cruzado) → `ForbiddenError`;
    - cada estado distinto de `verified` → `ForbiddenError`;
    - rol no permitido → `ForbiddenError`;
    - `roles` vacío y membership `member` en una organización verificada → ok;
    - error de la base de datos → `ForbiddenError`;
    - `admin` de staff sin membresía → `ForbiddenError`.
- `app/api/crm/me/route.test.ts` (F1; llamada directa a `GET` con un `Request` real; mocks de la sesión y del service; no se mockean las guardas):
  - 401 sin sesión;
  - 403 runner verificado;
  - 403 email no verificado;
  - 200 con `{ userId, staffRoles }` para `commercial` y para `admin`;
  - 403 tras revocar;
  - 403 con error de la base de datos y un cuerpo sin el texto original;
  - 403 para un runner con `role=admin` en query, cookie y body;
  - `Cache-Control: no-store` en todas las respuestas.
- `modules/accounts/services/organizations.service.test.ts` (F2, `@/lib/db` mockeado):
  - `verified` → `SET verified_at`, `verified_by = actor` y `updated_at`;
  - `rejected` y `suspended` → `verified_at` y `verified_by` a `NULL`;
  - 0 filas → `false`.
- `modules/accounts/actions/organizations.actions.test.ts` (F2, llamada directa; mocks de la sesión, `access.service` y el service de organizaciones):
  - `unauthorized` sin sesión;
  - `forbidden` para runner y `commercial`;
  - `success` para `admin`;
  - admin revocado → `forbidden` en la segunda llamada;
  - error de la base de datos en la guarda → `forbidden`;
  - `invalid_input` con UUID inválido y con `status` `pending`/`unverified`;
  - `not_found` cuando el service devuelve `false`;
  - los campos extra (`verifiedBy`, `role`) se ignoran y el service recibe `user.id` de la sesión;
  - en los casos denegados o inválidos el service no se llama.
- Sin unit tests (según SETUP): `lib/db-schema.ts` (declarativo), scripts SQL (se verifican de forma manual en la rama de desarrollo), schema zod de F2 (sin refinements) y tipos.

## Plan de tareas
### Fase 1: schema, guardas y API protegida (5 tareas, 15 archivos)
- [ ] T1 — Schema Drizzle (4 enums, 4 tablas, índice único parcial) y migración generada con `npm run db:generate`, revisada sin `neon_auth` · archivos: `lib/db-schema.ts`, `drizzle/0000_*.sql` (generado), `drizzle/meta/0000_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base)
- [ ] T2 — Matriz de permisos pura y errores de autorización con su mapeo a 401/403 · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts`, `lib/auth/errors.ts` · depende de: T1 · secuencial (`lib/`)
- [ ] T3 — Service de acceso (`db.batch` de profile y roles; membresía) y guardas con sus tests · archivos: `lib/auth/access.service.ts`, `lib/auth/access.service.test.ts`, `lib/auth/guards.ts`, `lib/auth/guards.test.ts` · depende de: T1, T2 · secuencial (`lib/`)
- [ ] T4 — Ruta `GET /api/crm/me` y test de llamada directa · archivos: `app/api/crm/me/route.ts`, `app/api/crm/me/route.test.ts` · depende de: T3 · paralelo (con T5)
- [ ] T5 — Scripts SQL manuales de asignación y revocación de staff, con cabecera de uso · archivos: `scripts/sql/grant-staff-role.sql`, `scripts/sql/revoke-staff-role.sql` · depende de: T1 · paralelo (con T2–T4; archivos disjuntos)

### Fase 2: Server Action protegida y documentación operativa (3 tareas, 8 archivos)
- [ ] T1 — Schema, tipos y service de cambio de estado de organización · archivos: `modules/accounts/schemas/organizations.schema.ts`, `modules/accounts/types/organizations.types.ts`, `modules/accounts/services/organizations.service.ts`, `modules/accounts/services/organizations.service.test.ts` · depende de: Fase 1 · secuencial
- [ ] T2 — Server Action `updateOrganizationStatusAction`, sus tests de llamada directa y la API pública del módulo · archivos: `modules/accounts/actions/organizations.actions.ts`, `modules/accounts/actions/organizations.actions.test.ts`, `modules/accounts/index.ts` · depende de: F2-T1 · secuencial
- [ ] T3 — README: mapeo de roles, alta y revocación manual de staff, aplicación manual de la migración, verificación de `neon_auth`, checklist de la prueba manual en una rama de desarrollo, y actualizar la frase "La fase 1 no añade … tablas de negocio" · archivos: `README.md` · depende de: Fase 1 · paralelo (con F2-T1 y F2-T2)

## Preguntas abiertas
1. **Tipos de organización.** Tu documento menciona clubes, marcas y organizadores. ¿Se incluyen también `gym` y `ally` en el enum, o solo `club|brand|organizer`?
2. **Email verificado para colaboradores.** La foundation lo exige para el CRM, pero no lo menciona para los colaboradores. Esta spec lo exige también en `requireOrgRole`. ¿De acuerdo?
3. **Transiciones de verificación.** Se propone que el admin pase cualquier organización a `verified|rejected|suspended`, sin reglas de transición. ¿Hay transiciones prohibidas (por ejemplo, `rejected` → `verified` directo)? ¿Quién pasa una organización a `pending`? (Se asume que el futuro onboarding, fuera de alcance.)
4. **FK hacia `neon_auth.user`.** Esta fase no la crea (ver Decisiones). ¿Quieres añadirla después con una migración SQL personalizada, una vez confirmado el tipo del id y que Neon lo admite? ¿Qué debe pasar con `profiles`, membresías y asignaciones si se borra un usuario en Neon Auth?
5. **Auditoría.** Las asignaciones guardan `reason`, `granted_by`/`revoked_by` y fechas, pero los cambios de estado de organización solo guardan `verified_at`/`verified_by` y `updated_at`. ¿Hace falta ya una tabla de historial de verificaciones, o basta para el MVP?
6. **Rol de base de datos de la app.** ¿`DATABASE_URL` usa un rol de permisos mínimos distinto del owner? Si es así, necesitará `SELECT, INSERT` en `profiles`, `SELECT` en `staff_assignments` y `organization_memberships` y `SELECT, UPDATE` en `organizations`. Los GRANT quedan fuera de esta spec. ¿Los preparas tú en la consola de Neon o se especifican aparte?
