# Roles, invitaciones y permisos del equipo (RBAC del CRM)

- Módulo: accounts
- Estado: borrador
- Depende de: platform-neon-foundation.md (Fase 1 aprobada)

## Objetivo
Implementar la "Fase 2: permisos mínimos" que `platform-neon-foundation.md` deja para una spec separada, adaptada a cómo funciona el MVP:
- **Runners:** son visitantes anónimos. Consultan viajes, completan formularios y escriben por WhatsApp sin registrarse, así que no tienen cuenta ni perfil.
- **Equipo comercial:** entra al CRM con correo y contraseña de Neon Auth.
- **Admin:** gestiona desde el CRM a los usuarios autorizados y sus permisos.
- **Alta de comerciales:** el admin envía una **invitación por correo**. Una persona solo obtiene permisos si tiene una invitación válida o una asignación hecha por un admin. Registrarse no concede nada.

Precedencia: si algo de esta spec contradice `platform-neon-foundation.md`, gana la foundation. La foundation exige que el registro público nunca cree staff; aquí se cumple porque registrarse sin invitación no concede ningún permiso.

## Alcance
- Incluye:
  - Schema Drizzle en `public`: enum `staff_role` (`commercial | admin`) y tres tablas: `profiles`, `staff_assignments` y `staff_invitations`. La migración SQL se genera con `npm run db:generate` y se revisa, sin aplicarla en remoto.
  - Matriz estática y pura de permisos (`can()`).
  - Guardas server-only en `lib/auth/`:
    - `getCurrentUser`, que también acepta de forma atómica una invitación pendiente;
    - `requireUser`, `requireVerifiedEmail`, `requirePermission` y `requireCrmUser`;
    - errores `UnauthorizedError`/`ForbiddenError`, que se mapean a 401/403.
  - Ruta mínima protegida `GET /api/crm/me`.
  - Scripts SQL manuales: alta del primer admin (bootstrap) y revocación de emergencia.
  - (F2) Módulo `modules/accounts/`: schemas, service y Server Actions de administración (invitar, revocar invitación, asignar rol a un staff existente y revocar rol), protegidas con `requirePermission("staff.manage")`. Incluye la documentación operativa en `README.md`.
  - (F3) Página `/crm/admin/usuarios` con sus componentes.
- No incluye:
  - **UI de autenticación** (`/crm/acceso`: crear cuenta con correo y contraseña, verificar el correo con código, login, logout y recuperación). Va en la spec siguiente, `accounts-auth-ui.md`.
    - `@neondatabase/auth-ui` ya está en el árbol como dependencia de `@neondatabase/auth`.
    - El Worker pesa hoy ~1071 KiB gzip (límite de Workers Free: 3 MiB), así que hay que medir antes de importarla.
  - **Envío automático del correo de invitación.** En el MVP, el admin comparte a mano el enlace `/crm/acceso` (Pregunta abierta 2).
  - **Colaboradores:** tablas `organizations` y `organization_memberships`, enums de organización, `requireOrgRole`/`findMembership`, verificación de organizaciones (`updateOrganizationStatusAction`) y los endpoints de colaboradores. Quedan para una spec futura de colaboradores.
  - **Perfiles OPERACIONES y MODERADOR:** no existen por ahora. Se añadirán en una spec futura, cuando hagan falta, como valores nuevos del enum `staff_role` (migración `ALTER TYPE staff_role ADD VALUE …`) y entradas nuevas en la matriz.
  - **Cuentas o recursos de runner.** Los runners son anónimos en el MVP.
  - Otras pantallas del CRM: layout `/crm`, leads y embudo.
  - Plugins Admin y Organization de Neon Auth, y su `user.role`: no se usan para autorizar.
  - `proxy.ts`/middleware, RLS, Cloudflare Access, tabla de auditoría histórica aparte, borrado de cuentas y permisos (GRANT) del rol de base de datos de la app.
  - Aplicar migraciones o asignar roles en ramas Neon remotas. Solo lo hace el usuario, en su máquina y con autorización explícita.

## Requisitos
1. Un solo proveedor de identidad: Neon Auth vía `getAuth()` (`lib/auth/server.ts`), con correo y contraseña. No se instala otro servidor Better Auth ni dependencias de runtime nuevas.
2. **Identidad:** después de aceptar la invitación, la autorización usa solo `session.user.id`, el id estable de Neon Auth. El correo solo se usa en un momento: para emparejar la cuenta con una invitación pendiente, en minúsculas y solo si `emailVerified = true`.
3. **Perfiles:** `profiles` solo contiene cuentas de staff. La fila se crea al aceptar una invitación o con el script de bootstrap. Una cuenta de Neon Auth sin invitación no crea filas.
4. **Staff:** cuenta con asignación activa (`revoked_at IS NULL`) en `staff_assignments`, con rol `commercial | admin`. Los roles se leen de la base de datos en **cada petición**: no se guardan en cookies, JWT, metadatos de Neon Auth ni en ninguna caché entre peticiones.
5. **Aceptación de la invitación:** ocurre en la primera petición autenticada con correo verificado. Hace falta una invitación pendiente (`accepted_at IS NULL AND revoked_at IS NULL`) y vigente (`expires_at > now()`) para `lower(email)`. Se ejecuta como una única sentencia SQL dentro de un `db.batch`, que hace tres cosas: marca la invitación como aceptada, crea el perfil y crea la asignación con `reason = 'invitation:<id>'` y `granted_by = invited_by`. O se completan las tres o ninguna. Una invitación no se acepta dos veces.
6. **Deniega por defecto.** Terminan en denegación:
   - permiso desconocido o roles vacíos;
   - sesión ausente o malformada;
   - correo no verificado;
   - error de Neon Auth o de la base de datos.
7. **Datos del cliente:** body, query, cookies propias y los campos extra de `session.user` (`role`, `staffRoles`, `invitedBy`, `userId`…) nunca elevan privilegios. El actor de cada acción es siempre `user.id` de la sesión.
8. **CRM** (foundation): sesión válida + correo verificado + asignación activa con un rol al que la matriz conceda `crm.access`.
9. **Administración:** cada Server Action de administración llama a `requirePermission("staff.manage")` (solo admin), además de la guarda de la página.
10. **Último admin:** no se puede revocar el rol `admin` del último admin activo. La comprobación va en la misma sentencia que la revocación y bloquea las filas para evitar carreras.
11. **Invitaciones pendientes:** solo puede haber una por correo. Invitar a un correo con invitación pendiente y vigente devuelve un error controlado. Una invitación pendiente pero caducada se revoca automáticamente al invitar de nuevo.
12. **Sin bypass de desarrollo:** ninguna variable de entorno, `NODE_ENV` ni flag omite las guardas.
13. **Primer admin:** se asigna con el script SQL de bootstrap, por `user_id` exacto y con un motivo. Nunca se asigna por ser el primer registro.
14. Las guardas se ejecutan dentro de cada Route Handler y Server Action, no solo en páginas.
15. Las respuestas y los logs no incluyen el mensaje original de la base de datos ni de Neon Auth.

## Criterios de aceptación
Fase 1:
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera una sola migración en `drizzle/` con el enum `staff_role`, las 3 tablas, los CHECK de minúsculas y los índices únicos parciales en `public`. El SQL no contiene `neon_auth`, `DROP` ni `CREATE SCHEMA`, y `drizzle.config.ts` no cambia.
- [ ] (F1) Dado un clon limpio sin secretos, cuando ejecuto `npm run lint`, `npx vitest run` y `npm run build`, entonces pasan sin conectar con Neon.
- [ ] (F1) Dada una petición sin sesión, o una sesión con error o `user.id` vacío, cuando llamo directamente a `GET /api/crm/me`, entonces responde 401 `{ "error": "unauthorized" }` con `Cache-Control: no-store` y sin consultar la base de datos.
- [ ] (F1) Dada una persona invitada que creó su cuenta pero aún no verificó el correo, cuando llama a `GET /api/crm/me`, entonces responde 403 y la invitación sigue pendiente: no se ejecuta la sentencia de aceptación.
- [ ] (F1) Dada una cuenta verificada sin invitación (registro libre), cuando llama a `GET /api/crm/me`, entonces responde 403 y no se crea perfil ni asignación.
- [ ] (F1) Dada una invitación caducada o revocada para el correo de la cuenta, cuando llama a `GET /api/crm/me` con el correo verificado, entonces responde 403 y la invitación no se marca como aceptada.
- [ ] (F1) Dada una invitación pendiente y vigente para `ana@example.com` con rol `commercial`, cuando la persona llama con correo verificado `Ana@Example.COM`, entonces se empareja, la aceptación se ejecuta en una sola sentencia dentro de un único `db.batch` y responde 200 `{ userId, staffRoles: ["commercial"] }`.
- [ ] (F1) Dada una invitación ya aceptada, cuando otra cuenta con el mismo correo verificado (o la misma cuenta en otra petición) hace una petición, entonces no se acepta de nuevo: la condición `accepted_at IS NULL` y el bloqueo de fila del `UPDATE` lo impiden.
- [ ] (F1) Dado que la sentencia de aceptación falla, cuando llamo a `GET /api/crm/me`, entonces responde 403 sin el texto del error original y no queda nada a medias. La parte de unit test comprueba que hay una única sentencia en el batch; la parte de integración se comprueba en la rama de desarrollo.
- [ ] (F1) Dado un staff verificado con asignación activa `commercial` o `admin`, cuando llamo a `GET /api/crm/me`, entonces responde 200 con sus roles.
- [ ] (F1) Dado un staff con acceso, cuando su asignación se revoca entre dos peticiones, entonces la primera responde 200 y la siguiente 403.
- [ ] (F1) Dada una cuenta verificada sin roles que envía `role=admin` en body, query y cookie, y cuya sesión trae `user.role: "admin"`, cuando llama a `GET /api/crm/me`, entonces responde 403.
- [ ] (F1) Dado `can(roles, permission)`, entonces:
  - devuelve `false` con roles vacíos o un permiso desconocido;
  - `admin` es `true` en todos los permisos;
  - `commercial` tiene `crm.access` y no tiene `staff.manage`.
- [ ] (F1) Dado el código de `lib/auth/`, `app/` y `modules/`, cuando lo reviso, entonces no hay bypass por variable de entorno, `NODE_ENV` o flag, ni caché de roles a nivel de módulo.
- [ ] (F1) Dado `scripts/sql/bootstrap-admin.sql` ejecutado con psql y las variables `user_id`, `email` y `reason`, entonces crea o reutiliza el perfil (email en minúsculas) e inserta una asignación `admin` activa con `granted_by = NULL`. Falla si `reason` está vacío o si ya hay una asignación `admin` activa para ese usuario. `scripts/sql/revoke-staff-role.sql` marca `revoked_at` y devuelve la fila afectada.

Fase 2:
- [ ] (F2) Dada cualquier Server Action de administración (`inviteStaffAction`, `revokeInvitationAction`, `grantStaffRoleAction`, `revokeStaffRoleAction`) llamada directamente:
  - sin sesión → `{ status: "error", code: "unauthorized" }`;
  - con un `commercial` verificado → `forbidden`;
  - con un admin verificado y datos válidos → `{ status: "success" }`;
  - en los casos denegados no se llama al service.
- [ ] (F2) Dado un admin que invita a `  Luis@Example.com ` con rol `commercial`, entonces se guarda la invitación con `email = 'luis@example.com'`, `invited_by = user.id` de la sesión y `expires_at` a 7 días. La respuesta incluye la URL `<APP_ORIGIN>/crm/acceso` para compartir. Los campos extra del formulario (`invitedBy`, `expiresAt`) se ignoran.
- [ ] (F2) Dado un correo con una invitación pendiente y vigente, cuando el admin lo invita otra vez, entonces devuelve `code: "pending_invitation_exists"` sin crear filas. Si la invitación pendiente estaba caducada, se revoca y se crea la nueva.
- [ ] (F2) Dado un correo o rol inválido (rol fuera de `commercial|admin`), o un `invitationId`/`userId` mal formado, entonces devuelve `invalid_input` con `fieldErrors` y no toca la base de datos.
- [ ] (F2) Dada una invitación pendiente, cuando el admin la revoca, entonces se guardan `revoked_at` y `revoked_by`. Revocar una invitación inexistente, aceptada o ya revocada devuelve `not_found`.
- [ ] (F2) Dado un usuario con perfil, cuando el admin le asigna un rol que no tiene activo, entonces se crea la asignación con `granted_by = actor`. Si el perfil no existe o el rol ya está activo, devuelve `no_change`.
- [ ] (F2) Dado un rol activo que no es el último admin, cuando el admin lo revoca, entonces se guardan `revoked_at` y `revoked_by`. Si es el `admin` del último admin activo (incluido el propio actor), devuelve `last_admin` y no cambia nada.
- [ ] (F2) Dadas dos revocaciones concurrentes de los dos únicos admins, entonces solo una tiene éxito. Lo garantiza el bloqueo `FOR UPDATE` de la sentencia; se verifica de forma manual en la rama de desarrollo.
- [ ] (F2) Dada una acción de administración con éxito, entonces se llama a `revalidatePath("/crm/admin/usuarios")`.
- [ ] (F2) Dado `README.md`, entonces documenta:
  - el modelo de acceso (runners anónimos, staff invitado);
  - los ajustes necesarios de Neon Auth y el riesgo aceptado del registro abierto;
  - el bootstrap y la revocación de emergencia;
  - la aplicación manual de la migración y la verificación de `neon_auth`;
  - el checklist de la prueba manual en la rama de desarrollo.

Fase 3:
- [ ] (F3) Dado un admin verificado, cuando abre `/crm/admin/usuarios`, entonces ve:
  - el formulario de invitación (correo + rol);
  - la tabla de staff activo (correo, roles como `Badge`, fecha de alta, asignar rol y revocar rol);
  - la tabla de invitaciones pendientes (correo, rol, caducidad, insignia "Caducada" cuando aplica, revocar).
- [ ] (F3) Dado un `commercial` verificado o una cuenta sin roles, cuando abre `/crm/admin/usuarios`, entonces ve la página 404. Sin sesión, se le redirige a `/crm/acceso`.
- [ ] (F3) Dado el botón de revocar, cuando lo pulso, entonces un `AlertDialog` pide confirmación y, si la acción devuelve error (por ejemplo `last_admin`), se muestra el mensaje en español.
- [ ] (F3) Dado el formulario de invitación válido, cuando se envía, entonces aparece la URL para compartir y la invitación figura en la tabla. Con errores, se muestran por campo.
- [ ] (F3) `"use client"` solo aparece en `InviteStaffForm`, `StaffRoleForm` y `ConfirmActionButton`.

Manual (en la máquina del usuario, con su autorización, en una rama Neon de desarrollo y nunca en `production`):
- [ ] Se aplica la migración y el volcado del schema `neon_auth` es idéntico antes y después.
- [ ] Bootstrap del primer admin → `GET /api/crm/me` responde 200.
- [ ] Invitar → crear la cuenta y verificar con código → 200 `commercial`. Esto requiere la UI de `accounts-auth-ui.md` o la API de Neon Auth.
- [ ] Revocar el rol → 403 en la siguiente petición.
- [ ] Dos revocaciones concurrentes del penúltimo y del último admin → solo una tiene éxito.

## Diseño técnico

### Decisiones (y relación con la foundation)
- **Tabla de staff:** se mantiene el nombre `staff_assignments` de la foundation. Su columna `active` se expresa como `revoked_at IS NULL`, así hay una sola fuente de verdad y se conserva el historial.
- **Mapeo de roles desde la foundation:** `crm_admin` → `admin` (contiene todo) y `crm_agent` → `commercial`.
- **Guardas por permiso:** reciben un permiso, no listas de roles (`requirePermission`), y `can()` es la única matriz. `requireCrmUser()` se mantiene con el nombre de la foundation y equivale a `requirePermission("crm.access")`.
- **`profiles.email`:** no estaba en el pedido; se añade (`text not null`, en minúsculas) **solo para mostrar** quién es cada staff en la tabla de administración. Nunca se usa para autorizar. Se toma de la invitación al aceptarla o del script de bootstrap.
- **`staff_invitations.revoked_by`:** se añade para auditar quién revocó, igual que en `staff_assignments`.
- **Una sola sentencia para aceptar.** La aceptación usa una única sentencia SQL con CTE: primero `UPDATE staff_invitations … RETURNING` y, a partir de sus filas, `INSERT profiles` e `INSERT staff_assignments`. No se usan tres sentencias sueltas en el batch por estas razones:
  - si el `UPDATE` no afecta a ninguna fila (caducada, revocada, ya aceptada o inexistente), no se inserta nada;
  - el bloqueo de fila del `UPDATE` impide que se acepte dos veces y evita carreras con una revocación simultánea;
  - las FK no diferibles se comprueban al final de la sentencia, así que `accepted_user_id → profiles` es válido aunque el perfil se inserte en otro CTE de la misma sentencia (hay que verificarlo en la prueba manual).

  El `db.batch` agrupa esa sentencia y el `SELECT` de roles en un solo round-trip HTTPS y en una transacción.
- **Último admin:** `revokeStaffRole` usa `WITH admins AS MATERIALIZED (SELECT … WHERE role = 'admin' AND revoked_at IS NULL FOR UPDATE)`. Con `READ COMMITTED`, la segunda transacción concurrente espera, vuelve a evaluar las filas y ve que solo queda un admin activo.
- **Una invitación pendiente por correo:** índice único parcial `(email) WHERE accepted_at IS NULL AND revoked_at IS NULL`. Como el predicado no puede usar `now()`, `createInvitation` revoca en el mismo batch las pendientes caducadas de ese correo y después inserta con `ON CONFLICT … DO NOTHING RETURNING`. Si no devuelve ninguna fila, el resultado es `pending_invitation_exists`.
- **Sin FK hacia `neon_auth.user`:**
  - Modelar `neon_auth.user` en Drizzle haría que `drizzle-kit` generara SQL sobre un schema gestionado por Neon, y una FK entre schemas podría bloquear operaciones internas de Neon Auth.
  - `profiles.user_id` es `text` y solo se rellena desde sesiones validadas o desde el script.
  - Antes de aplicar la migración, el usuario comprueba el tipo real con `SELECT data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'id';` (Pregunta abierta 3).
- **Ubicación del schema:** se queda en `lib/db-schema.ts`, sin cambiar `drizzle.config.ts`. Son tablas transversales que consultan las guardas de `lib/auth/`.
- **Fallos dentro de la autorización:** un fallo de base de datos se convierte en `ForbiddenError` (403, falla cerrado). El 401 queda reservado para la ausencia de sesión.
- **Caché de sesión:** `getSession()` usa la cookie de datos de sesión de Neon Auth (TTL por defecto de 300 s), así que `emailVerified` puede ir hasta 5 minutos por detrás. Los roles y las invitaciones no se cachean. `cache()` de React solo memoiza dentro de un render RSC; en Route Handlers y Server Actions cada guarda consulta de nuevo.
- **Ajustes de Neon Auth necesarios:** los verifica el usuario en la consola; se documentan en el README.
  - **Sign-up with Email ON:** los invitados crean su cuenta. **Riesgo aceptado:** cualquiera puede crear una cuenta en Neon Auth, pero sin invitación no obtiene permisos (403) ni filas en `public`.
  - **Verificación de correo al registrarse ON, con código OTP:** el SMTP compartido de Neon envía códigos; los enlaces requieren SMTP propio. Sin verificación, nadie pasa `requireVerifiedEmail`.
- **Página de administración:** usa `redirect`/`notFound` de `next/navigation`. No usa `forbidden()`/`unauthorized()` porque requieren `experimental.authInterrupts`.

### Rutas (`app/`)
- `app/api/crm/me/route.ts` (nuevo, F1):
  ```ts
  export async function GET() {
    try {
      const user = await requireCrmUser();
      return Response.json({ userId: user.id, staffRoles: user.staffRoles }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return authErrorResponse(error); }
  }
  ```
- `app/crm/admin/usuarios/page.tsx` (nuevo, F3): Server Component delgado.
  1. Llama a `requirePermission("staff.manage")`. Con `UnauthorizedError` hace `redirect("/crm/acceso")` (esa ruta llega con `accounts-auth-ui.md`); con `ForbiddenError`, `notFound()`.
  2. Llama a `listStaffOverview()`.
  3. Compone `InviteStaffForm`, `StaffTable` e `InvitationsTable` desde `@/modules/accounts`.

  Es la defensa visual; la seguridad está en cada Server Action.

### Base de datos: `lib/db-schema.ts` (modificar, F1)
Columnas en snake_case, todo en `public`:

| Objeto | Definición |
|---|---|
| enum `staff_role` | `commercial`, `admin` |
| `profiles` | `user_id text PK` (id de Neon Auth); `email text not null` + `CHECK (email = lower(email))` (solo para mostrar); `created_at timestamptz not null default now()` |
| `staff_assignments` | `id uuid PK default gen_random_uuid()`; `user_id text not null → profiles`; `role staff_role not null`; `reason text not null`; `granted_by text null → profiles` (NULL = script de bootstrap); `granted_at timestamptz not null default now()`; `revoked_at timestamptz null`; `revoked_by text null → profiles`; índice único parcial `staff_assignments_active_uq (user_id, role) WHERE revoked_at IS NULL` |
| `staff_invitations` | `id uuid PK default gen_random_uuid()`; `email text not null` + `CHECK (email = lower(email))`; `role staff_role not null`; `invited_by text not null → profiles`; `created_at timestamptz not null default now()`; `expires_at timestamptz not null default now() + interval '7 days'`; `accepted_at timestamptz null`; `accepted_user_id text null → profiles`; `revoked_at timestamptz null`; `revoked_by text null → profiles`; índice único parcial `staff_invitations_pending_email_uq (email) WHERE accepted_at IS NULL AND revoked_at IS NULL` |

Las FK hacia `profiles(user_id)` son `on delete restrict`. Los tipos se derivan con `$inferSelect` y `staffRoleEnum.enumValues`.

### `lib/auth/` (server-only; `import "server-only"` en cada archivo de código)
`lib/auth/permissions.ts` (nuevo, F1): pura.
```ts
export type StaffRole = (typeof staffRoleEnum.enumValues)[number]; // "commercial" | "admin"
export type Permission = "crm.access" | "staff.manage";
// Matriz: crm.access → commercial; staff.manage → (ningún rol además de admin). Regla explícita: admin ⇒ true.
export function can(roles: readonly StaffRole[], permission: Permission): boolean;
```

`lib/auth/errors.ts` (nuevo, F1):
```ts
export class UnauthorizedError extends Error {} // → 401
export class ForbiddenError extends Error {}    // → 403
// 401 { error: "unauthorized" } | 403 { error: "forbidden" }, Cache-Control: no-store; cualquier otro error se relanza.
export function authErrorResponse(error: unknown): Response;
```

`lib/auth/access.service.ts` (nuevo, F1): usa `getDb()` y propaga los errores; la guarda decide.
```ts
// Un db.batch: [sentencia CTE de aceptación de invitación (ver Decisiones), SELECT role FROM staff_assignments WHERE user_id = $1 AND revoked_at IS NULL].
// La CTE filtra por email = $2 (ya en minúsculas), accepted_at IS NULL, revoked_at IS NULL y expires_at > now().
export async function acceptInvitationAndLoadStaffRoles(userId: string, email: string): Promise<StaffRole[]>;
// Solo el SELECT de roles activos (correo no verificado: no se intenta aceptar nada).
export async function loadStaffRoles(userId: string): Promise<StaffRole[]>;
```

`lib/auth/guards.ts` (nuevo, F1):
```ts
export type CurrentUser = { id: string; email: string; emailVerified: boolean; staffRoles: StaffRole[] };
export const getCurrentUser: () => Promise<CurrentUser | null>; // cache() de React
export function requireUser(): Promise<CurrentUser>;              // 401 sin sesión
export function requireVerifiedEmail(): Promise<CurrentUser>;     // + 403 si !emailVerified
export function requirePermission(permission: Permission): Promise<CurrentUser>; // + 403 si !can()
export function requireCrmUser(): Promise<CurrentUser>;           // requirePermission("crm.access")
```
Flujo de `getCurrentUser`:
1. `getAuth().getSession()`. Si hay `error`, falta `data` o la sesión no pasa un schema zod mínimo (`user.id` string 1–255, `user.email` string, `user.emailVerified` boolean), devuelve `null`. Los demás campos de `user` se descartan.
2. Normaliza `email = user.email.trim().toLowerCase()`.
3. Si `emailVerified`, llama a `acceptInvitationAndLoadStaffRoles(id, email)`; si no, a `loadStaffRoles(id)`.
4. Cualquier excepción del paso anterior lanza `ForbiddenError`, sin `cause` ni el mensaje original.

### Módulo `modules/accounts/`
F2:
- `schemas/staff.schema.ts`:
  - `staffRoleSchema = z.enum(["commercial", "admin"])`;
  - `inviteStaffSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), role: staffRoleSchema })`;
  - `invitationIdSchema = z.object({ invitationId: z.uuid() })`;
  - `staffRoleChangeSchema = z.object({ userId: z.string().min(1).max(255), role: staffRoleSchema })`.

  `z.object` descarta las claves desconocidas.
- `types/staff.types.ts`: `InviteStaffInput`, `StaffRoleChangeInput` (`z.infer`), `StaffMember` (`{ userId, email, roles: { role, grantedAt }[] }`), `PendingInvitation` (`{ id, email, role, expiresAt, expired: boolean }`) y `StaffActionState`.
- `services/staff.service.ts`:
  ```ts
  export async function listStaffOverview(): Promise<{ staff: StaffMember[]; invitations: PendingInvitation[] }>; // batch de 2 SELECT
  export async function createInvitation(input: InviteStaffInput, actorUserId: string): Promise<{ id: string; expiresAt: Date } | "pending_invitation_exists">;
  export async function revokeInvitation(invitationId: string, actorUserId: string): Promise<boolean>; // false = not_found
  export async function grantStaffRole(input: StaffRoleChangeInput, actorUserId: string): Promise<boolean>;
  // INSERT … SELECT FROM profiles WHERE user_id = $1 ON CONFLICT DO NOTHING RETURNING; reason = 'crm-admin'; false = no_change
  export async function revokeStaffRole(input: StaffRoleChangeInput, actorUserId: string): Promise<"revoked" | "not_found" | "last_admin">;
  // Sentencia con CTE `admins` MATERIALIZED … FOR UPDATE (ver Decisiones)
  ```
- `actions/staff.actions.ts` (`"use server"`): `inviteStaffAction`, `revokeInvitationAction`, `grantStaffRoleAction` y `revokeStaffRoleAction`, todas con firma `(prev: StaffActionState, formData: FormData) => Promise<StaffActionState>`, compatible con `useActionState`. Cada una sigue este orden:
  1. `requirePermission("staff.manage")`; `UnauthorizedError`/`ForbiddenError` se convierten en `code`.
  2. `safeParse` del `FormData`.
  3. Llamada al service con `user.id` como actor.
  4. `revalidatePath("/crm/admin/usuarios")` si hay éxito.

  Cualquier otro error se relanza sin datos sensibles. `inviteStaffAction` devuelve `acceptUrl = new URL("/crm/acceso", getEnv().APP_ORIGIN).toString()`.

F3 (componentes en `modules/accounts/components/`):

| Componente | Tipo | Descripción |
|---|---|---|
| `InviteStaffForm` | nuevo, `"use client"` | `useActionState(inviteStaffAction)`; `Field` + `Input type="email"` + `NativeSelect` (Comercial/Admin) + `Button`; errores por campo con `FieldError`; si hay éxito, muestra la URL para compartir |
| `StaffRoleForm` | nuevo, `"use client"` | Por fila de staff: `NativeSelect` con los roles que no tiene + `Button` "Asignar"; usa `grantStaffRoleAction` y muestra el error en línea |
| `ConfirmActionButton` | nuevo, `"use client"` | `AlertDialog` de confirmación que envía un `<form>` con campos ocultos a una acción recibida por props (`revokeStaffRoleAction` o `revokeInvitationAction`) y muestra el mensaje de error devuelto. Hacen falta estado y eventos, así que es cliente; es reutilizable dentro del módulo |
| `StaffTable` | nuevo, Server | `Table` con correo, roles como `Badge`, fecha de alta, `StaffRoleForm` y un `ConfirmActionButton` por rol |
| `InvitationsTable` | nuevo, Server | `Table` con correo, rol, caducidad, `Badge` "Caducada" y un `ConfirmActionButton` "Revocar"; si no hay ninguna, "Sin invitaciones pendientes" |

- `index.ts` (F3): exporta `InviteStaffForm`, `StaffTable`, `InvitationsTable` y `listStaffOverview`.
- shadcn:
  - instalado: `button`;
  - por instalar (F3): `npx shadcn@latest add table badge input native-select alert-dialog field`. `field` arrastra `label` y `separator`. Todos existen en `@shadcn`, según `npx shadcn@latest search`.

### Contrato
```ts
// GET /api/crm/me
type CrmMeResponse = { userId: string; staffRoles: ("commercial" | "admin")[] }; // 200
type AuthErrorBody = { error: "unauthorized" } /* 401 */ | { error: "forbidden" } /* 403 */;

// Server Actions (F2), entrada FormData:
// inviteStaffAction: email, role · revokeInvitationAction: invitationId · grantStaffRoleAction / revokeStaffRoleAction: userId, role
type StaffActionState =
  | { status: "idle" }
  | { status: "success"; message: string; acceptUrl?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]>;
      code: "unauthorized" | "forbidden" | "invalid_input" | "pending_invitation_exists" | "not_found" | "no_change" | "last_admin" };
```

### Scripts manuales (F1)
Se ejecutan con `psql`, `\set ON_ERROR_STOP on` y dentro de una transacción. Credencial: `DATABASE_MIGRATION_URL`. Primero en una rama de desarrollo; en `production`, solo con autorización explícita.
- `scripts/sql/bootstrap-admin.sql`:
  - variables `-v user_id=… -v email=… -v reason=…`;
  - valida que `reason` no esté vacío;
  - `INSERT profiles (user_id, lower(email)) ON CONFLICT DO NOTHING`;
  - `INSERT staff_assignments (role 'admin', granted_by NULL) RETURNING …`.

  La cabecera documenta los requisitos previos:
  - la cuenta ya existe en Neon Auth y tiene el correo verificado;
  - el `user_id` exacto y el correo se obtienen en la consola de Neon (Auth → Users);
  - formato de `reason`: `"<operador>: <motivo>"`.
- `scripts/sql/revoke-staff-role.sql` (emergencia):
  - variables `-v user_id=… -v role=…`;
  - `UPDATE … SET revoked_at = now() WHERE revoked_at IS NULL RETURNING …`.

  La cabecera advierte que no protege al último admin: está pensado para emergencias.

### Migración y operación
1. `npm run db:generate` genera `drizzle/0000_*.sql` y `drizzle/meta/*`. Revisarlo: solo objetos en `public`; `grep -i neon_auth drizzle/*.sql` no devuelve nada.
2. Aplicarla es manual y solo la hace el usuario, en una rama Neon de desarrollo y con autorización explícita: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0000_*.sql`. No se añade ningún script `migrate` ni migración automática.
3. Verificar que `neon_auth` no cambió:
   - comparar `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth` de antes y de después; `diff` debe salir vacío;
   - alternativa: comparar la salida de `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;`.
4. Contexto:
   - La red de este entorno bloquea `*.neon.tech` y `api.cloudflare.com`, así que la integración contra Neon se prueba en la máquina del usuario.
   - La aprobación ("apruebo docs/specs/accounts-roles-permissions.md") debe escribirse en el entorno donde se implemente, porque el registro se firma por máquina.

## Reutilización
- `getAuth()` (`lib/auth/server.ts`), `getDb()` (`lib/db.ts`, con `db.batch`) y `getEnv()` (`lib/env.ts`), sin modificarlos. `drizzle.config.ts` y `db:generate`, sin cambios.
- zod v4, `server-only`, `cache` de React, `revalidatePath`, `redirect`/`notFound` de Next.
- Patrón de tests de `lib/env.test.ts`: `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`.
- `drizzle.mock()` de `drizzle-orm/neon-http` para inspeccionar el SQL con `.toSQL()` sin conexión.
- shadcn: `button` (instalado); `table`, `badge`, `input`, `native-select`, `alert-dialog` y `field` (por instalar en F3). No se añaden dependencias de runtime.

## Tests
Todos con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`, sin red ni secretos.

- `lib/auth/permissions.test.ts` (F1):
  - matriz completa;
  - `admin` es `true` en todos los permisos;
  - roles vacíos → `false`;
  - permiso desconocido (forzado con un cast) → `false`;
  - `commercial` tiene `crm.access` y no tiene `staff.manage`.
- `lib/auth/access.service.test.ts` (F1, `@/lib/db` mockeado):
  - `acceptInvitationAndLoadStaffRoles` hace un único `batch` de 2 sentencias;
  - la primera contiene `UPDATE staff_invitations … RETURNING` con las condiciones `email`, `accepted_at IS NULL`, `revoked_at IS NULL` y `expires_at > now()`, y los `INSERT` de `profiles` y `staff_assignments` se alimentan de ese `RETURNING` (`reason` `'invitation:' || id`, `granted_by = invited_by`);
  - la segunda filtra roles por `user_id` y `revoked_at IS NULL`;
  - `loadStaffRoles` no toca `staff_invitations`;
  - los rechazos de la base de datos se propagan.
- `lib/auth/guards.test.ts` (F1; `@/lib/auth/server` y `@/lib/auth/access.service` mockeados):
  - sin sesión, con `error` de Neon Auth o con `user.id` vacío → `UnauthorizedError` sin llamar al service;
  - correo no verificado → se llama a `loadStaffRoles` (no a la aceptación) y `requirePermission` lanza `ForbiddenError` incluso con rol `admin`;
  - correo verificado `Ana@Example.COM` → se llama a la aceptación con `ana@example.com`;
  - sin roles → `ForbiddenError`;
  - `commercial` y `admin` → `requireCrmUser` ok; `commercial` → `requirePermission("staff.manage")` lanza;
  - revocación entre llamadas → la segunda lanza y el service se llama dos veces;
  - error de la base de datos → `ForbiddenError` sin `cause` ni el mensaje original;
  - `user.role: "admin"` en la sesión no aporta roles.
- `app/api/crm/me/route.test.ts` (F1; llamada directa a `GET`; mocks de la sesión y del service, no de las guardas):
  - 401 sin sesión;
  - 403 sin verificar (invitación no consumida: no se llama a la aceptación);
  - 403 registro libre (roles `[]`);
  - 403 invitación caducada o revocada (la aceptación devuelve `[]`);
  - 200 para `commercial` y para `admin`;
  - 403 tras revocar;
  - 403 con error de la base de datos y un cuerpo sin el texto original;
  - 403 con `role=admin` en query, cookie y body;
  - `Cache-Control: no-store` en todas las respuestas.
- `modules/accounts/schemas/staff.schema.test.ts` (F2):
  - `inviteStaffSchema` hace trim y pasa a minúsculas;
  - rechaza correos inválidos y roles `operations`/`moderator`/vacío;
  - descarta claves extra;
  - `invitationIdSchema` rechaza ids que no son UUID.
- `modules/accounts/services/staff.service.test.ts` (F2, `@/lib/db` mockeado):
  - `createInvitation` hace un batch: revoca las caducadas del correo e inserta con `ON CONFLICT DO NOTHING RETURNING`; sin filas → `"pending_invitation_exists"`;
  - `revokeInvitation` filtra pendientes (`accepted_at IS NULL AND revoked_at IS NULL`) y guarda `revoked_by`;
  - `grantStaffRole` hace `INSERT … SELECT FROM profiles` con `ON CONFLICT DO NOTHING`;
  - `revokeStaffRole` usa una CTE `admins` con `FOR UPDATE` y mapea los conteos a `revoked`/`not_found`/`last_admin`;
  - `listStaffOverview` agrupa los roles por usuario y marca `expired`.
- `modules/accounts/actions/staff.actions.test.ts` (F2, llamada directa con `FormData`; mocks de la sesión, `access.service`, `staff.service`, `next/cache` y `@/lib/env`):
  - para **cada** acción: `unauthorized` sin sesión, `forbidden` con `commercial` y con cuenta sin roles (sin llamar al service), `success` con admin;
  - `invalid_input` con `fieldErrors`;
  - se mapean `pending_invitation_exists`, `not_found`, `no_change` y `last_admin`;
  - el actor es `user.id` de la sesión aunque el `FormData` traiga `invitedBy`/`grantedBy`;
  - `revalidatePath` solo si hay éxito;
  - `acceptUrl` termina en `/crm/acceso`.
- Sin unit tests (según SETUP o por limitación):
  - `lib/db-schema.ts`, scripts SQL y tipos;
  - componentes de `components/ui/`;
  - página async de `app/` (Server Component asíncrono);
  - componentes del módulo: son de un solo dominio y su lógica está en las acciones. Se cubren con el checklist manual de F3 y con E2E cuando exista.

## Plan de tareas
### Fase 1: schema, guardas, aceptación de invitaciones y API protegida (5 tareas, 15 archivos)
- [ ] T1 — Schema Drizzle (enum, 3 tablas, CHECK, índices parciales) y migración generada, revisada sin `neon_auth` · archivos: `lib/db-schema.ts`, `drizzle/0000_*.sql` (generado), `drizzle/meta/0000_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base)
- [ ] T2 — Matriz de permisos y errores con su mapeo a 401/403 · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts`, `lib/auth/errors.ts` · depende de: T1 · secuencial (`lib/`)
- [ ] T3 — Service de acceso (aceptación atómica + roles) y guardas con sus tests · archivos: `lib/auth/access.service.ts`, `lib/auth/access.service.test.ts`, `lib/auth/guards.ts`, `lib/auth/guards.test.ts` · depende de: T1, T2 · secuencial (`lib/`)
- [ ] T4 — `GET /api/crm/me` y test de llamada directa · archivos: `app/api/crm/me/route.ts`, `app/api/crm/me/route.test.ts` · depende de: T3 · paralelo (con T5)
- [ ] T5 — Scripts SQL de bootstrap del primer admin y de revocación de emergencia · archivos: `scripts/sql/bootstrap-admin.sql`, `scripts/sql/revoke-staff-role.sql` · depende de: T1 · paralelo (con T2–T4; archivos disjuntos)

### Fase 2: administración del staff en servidor y documentación (4 tareas, 8 archivos)
- [ ] T1 — Schemas zod y tipos de staff con su test · archivos: `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/accounts/types/staff.types.ts` · depende de: Fase 1 · secuencial
- [ ] T2 — Service de staff (listar, invitar, revocar invitación, asignar y revocar rol con protección del último admin) con tests · archivos: `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts` · depende de: F2-T1 · secuencial
- [ ] T3 — Server Actions de administración con tests de llamada directa · archivos: `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: F2-T2 · secuencial
- [ ] T4 — README:
  - modelo de acceso;
  - ajustes de Neon Auth (Sign-up ON como riesgo aceptado, verificación por código);
  - bootstrap y revocación de emergencia;
  - aplicación manual de la migración y verificación de `neon_auth`;
  - checklist manual en la rama de desarrollo;
  - actualizar la frase "La fase 1 no añade … tablas de negocio".

  Archivos: `README.md` · depende de: Fase 1 · paralelo (con F2-T1 a F2-T3)

### Fase 3: página de administración en el CRM (4 tareas, ~15 archivos)
- [ ] T1 — Instalar shadcn: `npx shadcn@latest add table badge input native-select alert-dialog field` · archivos: `components/ui/table.tsx`, `badge.tsx`, `input.tsx`, `native-select.tsx`, `alert-dialog.tsx`, `field.tsx`, `label.tsx`, `separator.tsx` (los que genere el CLI) · depende de: Fase 2 · secuencial (base)
- [ ] T2 — Componentes de cliente · archivos: `modules/accounts/components/InviteStaffForm.tsx`, `modules/accounts/components/StaffRoleForm.tsx`, `modules/accounts/components/ConfirmActionButton.tsx` · depende de: F3-T1 · secuencial (T3 los compone)
- [ ] T3 — Tablas Server · archivos: `modules/accounts/components/StaffTable.tsx`, `modules/accounts/components/InvitationsTable.tsx` · depende de: F3-T2 · secuencial
- [ ] T4 — API pública del módulo y página `/crm/admin/usuarios` · archivos: `modules/accounts/index.ts`, `app/crm/admin/usuarios/page.tsx` · depende de: F3-T3 · secuencial

## Preguntas abiertas
1. **Caducidad de las invitaciones.** Se propone 7 días (default de `expires_at`). ¿Te sirve, o prefieres otro plazo?
2. **Aviso de la invitación.** En el MVP, el admin comparte a mano el enlace `/crm/acceso` (por WhatsApp o correo propio) y la persona se registra con el correo invitado. El envío automático por correo quedaría para una spec futura (requiere SMTP propio o un proveedor). ¿De acuerdo?
3. **FK hacia `neon_auth.user`.** No se crea en esta fase. ¿Quieres añadirla después con una migración SQL propia, cuando se confirme el tipo del id y que Neon lo admite? ¿Qué debe pasar con el perfil y las asignaciones si se borra la cuenta en Neon Auth?
4. **Rol de base de datos con permisos mínimos.** ¿`DATABASE_URL` usa un rol distinto del owner? Si es así, necesitará:
   - `SELECT, INSERT` en `profiles`;
   - `SELECT, INSERT, UPDATE` en `staff_assignments` y `staff_invitations`.

   Los GRANT quedan fuera de esta spec. ¿Los preparas tú en la consola de Neon o se especifican aparte?
