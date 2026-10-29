# Cuentas: todo registrado es Runner, acceso al CRM desde /cuenta, solicitud del rol Admin, más roles gestionables y baja de cuentas

- Módulo: accounts
- Estado: aprobado
- Depende de (aprobadas e implementadas): `accounts-clerk-rbac.md`, `accounts-user-management.md` (F1), `accounts-runner-profiles.md` (F1–F2), `sponsors-portal.md` (marcas y rol `sponsor`).
- Enmienda: `accounts-user-management.md` (Decisiones 1 y 2; Requisitos 3 y 4; Alcance "borrar cuentas"; sus criterios con la cuenta N) y `accounts-runner-profiles.md` (Decisión 18, solo para la baja hecha desde el CRM). Las specs aprobadas no se editan: esta spec prevalece donde las contradice (ver "Enmiendas").

## Objetivo

El admin pidió (2026-10-29):

1. "Hay usuarios que se registraron con Clerk, pero no aparecen en la lista de usuarios del administrador. Verificar."
2. "Todos los registrados se deben asignar por defecto como runner."
3. "Si el usuario es administrador o comercial tiene un botón «Ingresar al CRM» desde la landing."
4. "Un botón para que el usuario pueda solicitar su rol como administrador" en la pantalla "Tu cuenta no tiene acceso al CRM".
5. "Un usuario puede tener más de un rol. Los administradores pueden cambiar los roles de los comerciales, runner, organizador o patrocinador."
6. "Revisar que el superadmin pueda borrar o eliminar usuarios."

### Verificación de (1) y (6), hecha sobre `main` d842cb5

- **(1) Es el comportamiento especificado, no un fallo puntual.** `readUsers` (`modules/accounts/services/userDirectory.service.ts`) lista la unión de `profiles`, `runner_profiles` y `bookings.runner_user_id`. Solo se escribe en `profiles` al aceptar una invitación (`acceptInvitationStatement`, `lib/auth/access.service.ts`). La aplicación no lee Clerk ni `neon_auth`. Una cuenta de Clerk sin invitación, sin perfil de runner y sin reserva vinculada no tiene ninguna fila en Neon y no aparece. Así lo fijan el Requisito 3 y la Decisión 2 de `accounts-user-management.md` ("una cuenta registrada sin rol, sin perfil y sin reservas vinculadas no aparece").
- **(5) Varios roles por cuenta ya funcionan**: `staff_assignments_active_uq` es único por (usuario, rol) activo. Lo que falta:
  - `ROLE_MANAGEMENT` (`lib/auth/permissions.ts`) solo deja a `admin` gestionar `commercial`;
  - `organizer` solo lo gestiona `super_admin`;
  - `sponsor` no lo gestiona nadie desde el CRM;
  - `grantStaffRole` exige una fila en `profiles`, así que un registrado sin invitación no puede recibir roles.
- **(6) Hoy nadie, tampoco `super_admin`, puede desactivar ni borrar cuentas desde el CRM.** La supresión es SQL manual (`accounts-runner-profiles.md`, Decisión 18), y `profiles` es FK `restrict` de 26 columnas de autoría: leads, viajes, reservas, asignaciones, contenidos y recompensas.

## Alcance

- Incluye:
  - (F1) Registrar en `profiles` toda cuenta con correo primario verificado que inicia sesión, incluida `/cuenta`, que hoy es estática. Toda cuenta del directorio es "Runner".
  - (F1) Enlace "Ingresar al CRM" en el panel con sesión de `/cuenta`, solo si la cuenta tiene `crm.access`.
  - (F1) Script local que exporta las cuentas existentes de Clerk como SQL revisable para un backfill manual.
  - (F2) Tabla `role_requests`, el botón "Solicitar rol de administrador" en `NoCrmAccess` y la sección "Solicitudes de rol" (aprobar o rechazar) para `super_admin` en `/crm/admin/usuarios`.
  - (F3) "Desactivar", "Reactivar" y "Eliminar definitivamente" una cuenta, solo `super_admin`, en la ficha `/crm/admin/usuarios/<id>`, con efecto en Neon (guardas) y en Clerk (ban o borrado).
  - (F4) `admin` gestiona `commercial`, `organizer` y `sponsor`; `super_admin`, además, `admin`. Asignar `sponsor` desde la ficha exige elegir la marca.
- No incluye:
  - Guardar `runner` como valor de `staff_role`, concederlo o revocarlo (Decisión 1).
  - Webhooks de Clerk (Decisión 2).
  - El enlace "Ingresar al CRM" en `SiteHeader` de todas las páginas públicas (Decisión 4).
  - Solicitar otros roles distintos de `admin`, avisos por correo o n8n de solicitudes nuevas y el historial de solicitudes en la ficha (Preguntas abiertas).
  - Gestionar `super_admin` desde el CRM.
  - Borrar físicamente filas de `profiles`, reservas, leads o recompensas (Decisión 9).
  - Aplicar migraciones, ejecutar el backfill o cambiar la configuración de Clerk: son operaciones manuales del usuario.

## Requisitos

### Fase 1: toda cuenta registrada es Runner
1. **Registro al iniciar sesión.** Cada lectura de roles de una cuenta con correo primario verificado (`getCurrentUser` → `acceptInvitationAndLoadStaffRoles`) inserta en `profiles` `(user_id, email)` si no existe. Si existe y el correo cambió, lo actualiza. No toca más columnas. Es una sentencia más **dentro del `db.batch` existente**: no añade viajes de red. Las cuentas sin correo verificado no se registran (siguen usando `loadStaffRoles`). El correo se guarda en minúsculas, como hoy, y solo sirve de presentación: nunca autoriza.
2. **`/cuenta` registra.** `/cuenta` sigue siendo estática. Con sesión, `RunnerAccount` llama una vez por `user.id` a la Server Action `registerAccountAction()`, que:
   - no recibe argumentos;
   - usa `requireVerifiedEmail()` (la guarda ya registra por el Requisito 1);
   - devuelve solo `{ canAccessCrm: boolean }` = `can(user.staffRoles, "crm.access")`.
   Ante 401, 403 o cualquier error devuelve `{ canAccessCrm: false }` sin registrar en `console` datos de la cuenta. `/cuenta` se añade al `matcher` de `middleware.ts`, porque la acción hace POST a esa ruta y `auth()` lo necesita (`accounts-clerk-rbac.md`, D3).
3. **Runner = toda cuenta del directorio.**
   - `UserListItem.isRunner` y `UserDetail.isRunner` son `true` en toda cuenta listada, se calculan en SQL como `true` y se conservan los campos para no cambiar los componentes;
   - `?rol=runner` lista todas las cuentas;
   - `can()`, la matriz y las guardas no cambian: Runner no concede permisos y sus recursos siguen protegidos por propiedad.
4. **Enlace "Ingresar al CRM".** Si `registerAccountAction` devuelve `canAccessCrm: true`, el panel con sesión de `/cuenta` muestra un enlace `buttonVariants()` "Ingresar al CRM" → `/crm`, como primer botón. Lo ven `admin`, `super_admin`, `commercial` y `organizer`; `sponsor` y los runners, no. Mientras la acción no responde, el enlace no aparece. Es solo presentación: el layout de `/crm` sigue siendo la guarda.
5. **Backfill manual.** `node scripts/export-clerk-accounts.mjs > accounts-backfill.sql`:
   - lee `CLERK_SECRET_KEY` del entorno del proceso sin imprimirla;
   - pagina `GET https://api.clerk.com/v1/users` (100 por página) por HTTPS;
   - escribe en stdout una sola sentencia `INSERT INTO profiles (user_id, email) VALUES … ON CONFLICT (user_id) DO NOTHING;` con las cuentas de correo primario verificado, en minúsculas y con los literales escapados.
   No se conecta a Neon ni escribe archivos. Lo revisa y lo aplica el usuario a mano (README).

### Fase 2: solicitud del rol Admin
6. **Tabla `role_requests`.** `id uuid`, `user_id` (FK `profiles`, `restrict`), `role staff_role` (check `role = 'admin'`), `status role_request_status` (`pending`, `approved`, `rejected`), `created_at`, `decided_at` y `decided_by` (FK `profiles`, `restrict`). Check: `(status = 'pending') = (decided_at IS NULL AND decided_by IS NULL)`. Índice único parcial `(user_id) WHERE status = 'pending'`: como mucho una solicitud pendiente por cuenta.
7. **Pantalla sin acceso.** `NoCrmAccess` pasa a ser un Server Component async. Lee `getCurrentUser()` (cacheado en el render) y, como mucho, `getPendingRoleRequest(user.id)`. Según el caso, muestra:
   - correo no verificado: "Tu cuenta no tiene acceso al CRM. Verifica tu correo para poder solicitar acceso." y sin botón;
   - solicitud pendiente: "Tu cuenta no tiene acceso al CRM." + "Solicitud enviada el <fecha>. Un super administrador la revisará.";
   - en otro caso: "Tu cuenta no tiene acceso al CRM." + el botón "Solicitar rol de administrador".
   Siempre se ve "Cerrar sesión". Si falla la lectura de la solicitud, se muestra el botón: la acción es idempotente.
8. **Solicitar.** `requestAdminRoleAction(prev, formData)`:
   - usa `requireVerifiedEmail()` e ignora el `formData`: la cuenta y el rol salen de la sesión y de la constante `admin`;
   - si la cuenta ya tiene `crm.access`, devuelve el error "Tu cuenta ya tiene acceso al CRM. Recarga la página.";
   - `createAdminRoleRequest(userId)` hace `INSERT … ON CONFLICT DO NOTHING`; repetirla devuelve el mismo éxito;
   - éxito: "Solicitud enviada. Un super administrador la revisará." y `revalidatePath("/crm", "layout")`.
9. **Resolver.** En `/crm/admin/usuarios` (página con `staff.manage`), la sección "Solicitudes de rol" solo se lee y se muestra si `canManageRole(actor.staffRoles, "admin")`, es decir, para `super_admin`.
   - **Tabla:** Correo, Rol solicitado ("Admin"), Fecha y acciones "Aprobar" y "Rechazar" (`ConfirmActionButton`). Vacía: "No hay solicitudes pendientes.".
   - **`approveRoleRequestAction`:** usa `requirePermission("staff.manage")` + `canManageRole(…, "admin")` y valida el `requestId` con `z.uuid()`. `approveRoleRequest` es **una sentencia**: `UPDATE role_requests SET status='approved', decided_at=now(), decided_by=actor WHERE id=$1 AND status='pending' RETURNING …` + `INSERT INTO staff_assignments (user_id, role, reason, granted_by) … 'role_request:'||id … ON CONFLICT DO NOTHING`. Si la solicitud ya no está pendiente, devuelve `not_found` ("Ya no está pendiente. Recarga la página.").
   - **`rejectRoleRequestAction`:** igual, con `status='rejected'` y sin asignación.
   - Tras rechazar, la persona puede volver a solicitar.
   - Ambas acciones revalidan la lista y la ficha.

### Fase 3: desactivar y eliminar cuentas (solo `super_admin`)
10. **Quién.** `canRemoveAccounts(roles)` en `lib/auth/permissions.ts` devuelve `roles.includes("super_admin")`; no es una entrada de la matriz (Decisión 7). Las acciones usan `requirePermission("staff.manage")` + `canRemoveAccounts(actor.staffRoles)`. Nunca actúan sobre la propia cuenta (`self`) ni sobre una cuenta con `super_admin` activo (`protected`). El servicio comprueba la segunda condición en la misma sentencia.
11. **Schema.** `profiles` recibe `disabled_at`, `disabled_by` (FK `profiles`), `deleted_at` y `deleted_by` (FK `profiles`), todas nulas. Check: `deleted_at IS NULL OR disabled_at IS NOT NULL`, porque eliminar implica bloquear.
12. **Guardas.** El batch de `acceptInvitationAndLoadStaffRoles` y la lectura de `loadStaffRoles` devuelven también `blocked = disabled_at IS NOT NULL`. Con `blocked`, `getCurrentUser` devuelve la cuenta sin roles y `requireUser` lanza `ForbiddenError("account_disabled")`. Fallan cerrados `/crm`, `/patrocinador`, `/cuenta/perfil`, `/mis-carreras`, las Server Actions y los Route Handlers con guarda. El upsert del Requisito 1 nunca toca `disabled_*` ni `deleted_*`, y la aceptación de invitaciones no inserta asignaciones para una cuenta bloqueada.
13. **Desactivar.**
    - **Neon (una sentencia):** fija `disabled_at` y `disabled_by` y revoca todas las asignaciones activas (`revoked_at`, `revoked_by` = actor). Respeta "último admin": si deja sin admins activos, no hace nada y devuelve `last_admin`.
    - **Clerk:** después llama a `clerkClient().users.banUser(userId)`, que cierra sus sesiones e impide entrar.
    - **Si Clerk falla:** la cuenta queda bloqueada en Neon y la acción devuelve "Cuenta desactivada en la aplicación, pero no se pudo bloquear en Clerk. Reintenta." La ficha muestra entonces "Reintentar en Clerk", que repite solo la llamada a Clerk.
14. **Reactivar.** Limpia `disabled_*` (solo si `deleted_at IS NULL`) y llama a `unbanUser`. No devuelve roles: se asignan de nuevo desde la ficha.
15. **Eliminar definitivamente.** El diálogo exige escribir el correo de la cuenta. La acción valida en el servidor que coincide con `profiles.email`.
    1. Un `db.batch` (transacción) que:
       - revoca las asignaciones activas (con la regla del último admin);
       - rechaza las solicitudes pendientes (`decided_by` = actor);
       - borra `runner_profiles` y `referral_codes` de la cuenta;
       - pone `bookings.runner_user_id = NULL`;
       - anonimiza `profiles.email` = `'deleted-' || md5(user_id) || '@invalid'`;
       - fija `disabled_*` (si no estaban) y `deleted_at`/`deleted_by`.
    2. Después, `clerkClient().users.deleteUser(userId)`. Si falla, la cuenta queda eliminada y bloqueada en Neon, y la ficha muestra "Reintentar en Clerk".
    - La fila de `profiles` se conserva como autora del historial: leads, viajes, contenidos, recompensas y asignaciones.
    - Las reservas conservan sus datos de participante, porque son un registro comercial y no de la cuenta.
    - `reward_accounts`, `reward_ledger`, `reward_redemptions` y `runner_referrals` se conservan por su valor contable y no tienen datos de contacto.
16. **Directorio.**
    - Las cuentas con `deleted_at` no aparecen en la lista. Su ficha responde 404, salvo para `super_admin`, que ve la cabecera "Cuenta eliminada" y "Reintentar en Clerk" mientras siga pendiente.
    - Las cuentas desactivadas aparecen con el `Badge` "Desactivada".
    - El campo nuevo `UserListItem.status` toma los valores `active`, `disabled` o `deleted`.
17. **Ficha.** La sección "Cuenta" aparece solo si `canRemoveAccounts` y la cuenta no es la propia ni de un `super_admin`. Muestra:
    - "Desactivar" (`destructive`; "¿Desactivar la cuenta de <correo>?" / "Perderá todos sus roles y no podrá iniciar sesión. Podrás reactivarla.") o "Reactivar";
    - "Eliminar definitivamente" (`destructive`; diálogo con el campo de correo; "Se borrarán su perfil de runner y su cuenta de Clerk, y sus reservas quedarán sin vincular. No se puede deshacer.").
18. **Clerk en el servidor.** Solo se usa `clerkClient()` de `@clerk/nextjs/server` dentro de las acciones, tras la guarda. Nunca se registra en `console` el error original de Clerk, porque puede contener el correo; solo un texto fijo.

### Fase 4: varios roles y más roles gestionables
19. **Matriz de gestión.**
    - `ROLE_MANAGEMENT.admin` = `commercial`, `organizer` y `sponsor`.
    - `ROLE_MANAGEMENT.super_admin` = `commercial`, `organizer`, `sponsor` y `admin`.
    - `MANAGEABLE_ROLE_ORDER` = `commercial`, `organizer`, `sponsor` y `admin`.
    - `super_admin` sigue sin gestionarse desde el CRM, y la regla del último admin no cambia.
20. **Conceder Patrocinador.**
    - `staffRoleChangeSchema` acepta `sponsor` con un `sponsorId` (`z.uuid()`) obligatorio solo para ese rol.
    - `grantStaffRole` inserta `sponsor_id`, y solo si la marca existe (`INSERT … SELECT … FROM profiles JOIN sponsors`), de modo que una marca inexistente da `no_change`.
    - Una cuenta tiene como mucho una asignación `sponsor` activa (el índice existente).
    - La invitación con Patrocinador sigue siendo de `accounts-user-management.md` F2.
21. **Ficha.**
    - `StaffTable` concede los roles gestionables que la cuenta no tiene, como hoy.
    - Para `sponsor`, en lugar del botón, muestra el formulario `GrantSponsorRoleForm`: `NativeSelect` "Marca" con `listSponsors()`, que la página lee solo si el actor puede gestionar `sponsor`, y el botón "Asignar Patrocinador".
    - Revocar cualquier rol gestionable usa la acción existente.
    - "Runner" se muestra siempre como `Badge` sin acciones.
22. **Cuentas sin `profiles`.** Desde la F1, toda cuenta que inició sesión tiene `profiles`, así que se le pueden conceder roles desde la ficha sin invitación. Se mantiene el mensaje `no_change` para las que nunca iniciaron sesión desde esta versión.

### Transversales
23. **Minimización.** Las sentencias nuevas no seleccionan ni devuelven teléfono, documento, fecha de nacimiento, datos médicos, notas internas ni importes. Las respuestas de las acciones no incluyen correos ni ids de otras cuentas.
24. **Errores.** Las lecturas propagan al error boundary. Las acciones devuelven mensajes fijos en español con el patrón de `staff.actions.ts` y nunca el error de la base ni el de Clerk.

## Criterios de aceptación

### Fase 1
- [ ] Dada una cuenta nueva de Clerk con correo verificado, cuando inicia sesión en `/cuenta`, entonces aparece en `/crm/admin/usuarios` con el `Badge` "Runner" y su correo, sin roles.
- [ ] Dada una cuenta con el correo sin verificar, cuando abre `/cuenta`, entonces no se crea fila en `profiles` (unit test de guards y access.service).
- [ ] Dada `acceptInvitationAndLoadStaffRoles` (unit test), entonces el batch contiene, antes de la aceptación, `INSERT INTO profiles … ON CONFLICT (user_id) DO UPDATE SET email = excluded.email WHERE profiles.email <> excluded.email`. No hay sentencias ni viajes de red adicionales.
- [ ] Dada una cuenta `commercial`, `admin`, `super_admin` u `organizer` en `/cuenta` con sesión, entonces ve "Ingresar al CRM" (→ `/crm`). Una cuenta runner, una `sponsor` o una respuesta con error no lo ven (unit test de `RunnerAccount` con la acción mockeada; la acción se llama una sola vez por `user.id` y nunca sin sesión).
- [ ] Dada `registerAccountAction` (unit test), entonces devuelve `{ canAccessCrm }` y nada más, y con 401, 403 o error de base devuelve `{ canAccessCrm: false }`.
- [ ] Dado `?rol=runner`, entonces aparecen todas las cuentas listadas. `C2` (commercial) muestra `Comercial` y `Runner`.
- [ ] Dado `scripts/export-clerk-accounts.mjs` sin `CLERK_SECRET_KEY`, entonces termina con código 1 y un mensaje sin valores. Con una respuesta simulada de Clerk, emite un único `INSERT … ON CONFLICT (user_id) DO NOTHING;` solo con correos primarios verificados, en minúsculas y con `'` escapado (unit test con `fetch` mockeado).
- [ ] Dado `README.md`, entonces "Usuarios del CRM" explica por qué antes no aparecían los registrados y documenta el backfill: ejecutar el script, revisar el SQL y aplicarlo a mano en la rama correcta.

### Fase 2
- [ ] Dada una cuenta verificada sin roles en `/crm`, entonces ve "Solicitar rol de administrador" y "Cerrar sesión". Al pulsar, ve "Solicitud enviada. Un super administrador la revisará." y, al recargar, el texto con la fecha y sin botón.
- [ ] Dada una cuenta con el correo sin verificar en `/crm`, entonces ve el texto de verificación sin botón.
- [ ] Dada `requestAdminRoleAction` con campos `userId`/`role` falsificados, entonces se ignoran y la solicitud es de la cuenta de la sesión con rol `admin` (unit test). Dos envíos dejan una sola solicitud pendiente.
- [ ] Dado un `super_admin` en `/crm/admin/usuarios`, entonces ve "Solicitudes de rol" con las pendientes. Un `admin` no ve la sección, y sus llamadas directas a aprobar o rechazar devuelven "forbidden".
- [ ] Dado "Aprobar", entonces la solicitud pasa a `approved` con `decided_by` = actor, la cuenta recibe `admin` (`reason` `role_request:<id>`) y entra en el CRM como Admin. Aprobar dos veces devuelve `not_found` la segunda (unit test: una sola sentencia con `WHERE status = 'pending'`).
- [ ] Dado "Rechazar", entonces la solicitud pasa a `rejected` sin asignación, y la persona vuelve a ver el botón.
- [ ] Dado el SQL generado por `npm run db:generate`, entonces solo crea `role_request_status` y `role_requests` con sus FK, checks e índice. No toca `neon_auth` ni otras tablas.

### Fase 3
- [ ] Dado un `admin`, entonces la ficha no muestra "Cuenta", y sus llamadas directas a las acciones devuelven "forbidden" (unit test).
- [ ] Dado un `super_admin` sobre su propia ficha o la de otro `super_admin`, entonces no ve "Cuenta", y las acciones devuelven `self` o `protected`.
- [ ] Dado "Desactivar" sobre un `commercial`, entonces sus asignaciones quedan revocadas, `disabled_at` fijado y `banUser` llamado. Al intentar entrar en `/crm` o `/cuenta/perfil` con una sesión anterior, ve `NoCrmAccess` o 403. La lista muestra "Desactivada".
- [ ] Dado "Desactivar" sobre el último `admin` activo, entonces no cambia nada y se ve "No se puede revocar el rol del último admin activo.".
- [ ] Dado `banUser` que falla (mock), entonces la cuenta queda bloqueada en Neon, el mensaje lo indica y "Reintentar en Clerk" solo llama a Clerk.
- [ ] Dado "Reactivar", entonces `disabled_at` queda nulo, se llama a `unbanUser` y la cuenta vuelve sin roles.
- [ ] Dado "Eliminar definitivamente" con un correo distinto, entonces no cambia nada ("El correo no coincide."). Con el correo correcto:
  - el batch revoca roles, rechaza solicitudes, borra `runner_profiles` y `referral_codes`, desvincula reservas, anonimiza el correo y fija `deleted_*` (unit test del SQL);
  - después se llama a `deleteUser`;
  - la cuenta desaparece de la lista;
  - su ficha da 404 a quien no es `super_admin`.
- [ ] Dada una cuenta desactivada o eliminada, cuando se acepta una invitación pendiente de su correo, entonces no se inserta ninguna asignación (unit test).

### Fase 4
- [ ] Dado un `admin` en la ficha de una cuenta, entonces puede conceder y revocar `Comercial`, `Organizador` y `Patrocinador`, pero no `Admin`; un `super_admin`, también `Admin`. La cuenta puede tener varios roles a la vez, y la lista los muestra todos con "Runner".
- [ ] Dado "Asignar Patrocinador" sin marca o con una marca inexistente, entonces no se asigna ("Elige la marca del patrocinador." / `no_change`). Con una marca válida, la cuenta entra en `/patrocinador` con esa marca.
- [ ] Dado `permissions.test.ts`, entonces `manageableRoles(["admin"])` = `commercial`, `organizer` y `sponsor`, y `manageableRoles(["super_admin"])` = `commercial`, `organizer`, `sponsor` y `admin`. `canManageRole(["admin"], "admin")` y `canManageRole(["admin"], "super_admin")` son `false`.

### Todas las fases
- [ ] `npm run lint`, `npm test -- --run --maxWorkers=3`, `next typegen`, `tsc --noEmit` y `npm run build:worker` sin errores. `/cuenta` sigue estática (`○`).

## Diseño técnico

- **Rutas (`app/`):**
  - `app/crm/(protected)/admin/usuarios/page.tsx`: F2, sección de solicitudes;
  - `app/crm/(protected)/admin/usuarios/[id]/page.tsx`: F3, sección "Cuenta"; F4, marcas para `GrantSponsorRoleForm`;
  - `app/crm/(protected)/layout.tsx` no cambia: `NoCrmAccess` lee la sesión por sí mismo.
- **Middleware:** `matcher` + `"/cuenta"` (exacto; `/cuenta/perfil/:path*` ya está).
- **`lib/`:**
  - `lib/auth/access.service.ts`: registro (F1) y `blocked` (F3);
  - `lib/auth/guards.ts`: `account_disabled` (F3);
  - `lib/auth/permissions.ts`: `canRemoveAccounts` (F3) y matriz de gestión (F4);
  - `lib/db-schema.ts`: comentario de `profiles` (F1), `role_requests` (F2) y columnas de baja (F3).
- **Módulo `accounts`:**
  - Acciones:
    - `actions/account.actions.ts`: `registerAccountAction` (F1);
    - `actions/roleRequest.actions.ts`: solicitar, aprobar y rechazar (F2);
    - `actions/accountStatus.actions.ts`: desactivar, reactivar, eliminar y reintentar en Clerk (F3).
  - Servicios:
    - `services/roleRequest.service.ts` (F2);
    - `services/accountStatus.service.ts` (F3);
    - `services/staff.service.ts` (`grantStaffRole` con marca, F4);
    - `services/userDirectory.service.ts` (F1 runner, F3 estado).
  - Schemas: `schemas/roleRequest.schema.ts` (F2), `schemas/accountStatus.schema.ts` (F3) y `schemas/staff.schema.ts` (F4).
  - Componentes:
    - `RunnerAccount` (F1);
    - `NoCrmAccess` + `RequestAdminRoleForm` (F2);
    - `RoleRequestsTable` (F2);
    - `AccountStatusSection` + `DeleteAccountDialog` (F3);
    - `StaffTable` + `GrantSponsorRoleForm` (F4);
    - `UserTable` ("Desactivada", F3).
- **Script:** `scripts/export-clerk-accounts.mjs` (F1), sin dependencias nuevas (`fetch` de Node 24).
- **Contratos:**
  - `registerAccountAction(): Promise<{ canAccessCrm: boolean }>`;
  - `RoleRequestActionState` y `AccountStatusActionState` extienden `ConfirmActionState`;
  - `UserListItem.status: "active" | "disabled" | "deleted"`.

## Reutilización

- **Guardas y permisos:** `requireVerifiedEmail`, `requirePermission`, `getCurrentUser` y `can`/`canManageRole`/`manageableRoles`.
- **Acciones de staff:** el patrón `runAdminAction` y `ERROR_MESSAGES` de `staff.actions.ts`, y la sentencia de "último admin" de `revokeStaffRole`.
- **Componentes:** `ConfirmActionButton` (`components/shared`), `Card`, `Badge`, `Button`/`buttonVariants`, `NativeSelect`, `SignOutButton`, `StaffTable` y `UserTable`.
- **Otros módulos y Clerk:** `listSponsors` (`@/modules/sponsors`) y `clerkClient` de `@clerk/nextjs/server`, ya instalado.

## Tests

- **Servicios:** `access.service` (registro y `blocked`), `roleRequest.service`, `accountStatus.service`, `staff.service` (sponsor con marca) y `userDirectory.service` (runner y estado). Todos con la base mockeada y comprobando SQL y parámetros.
- **Acciones:** `account.actions`, `roleRequest.actions` y `accountStatus.actions` (Clerk mockeado, incluidos sus fallos), y `staff.actions` (sponsor).
- **Permisos y schemas:** `permissions.test` (`canRemoveAccounts` y la matriz) y los schemas nuevos (`requestId` y el correo de confirmación; `sponsorId` obligatorio para `sponsor`).
- **Componentes:** `RunnerAccount.test` y `RequestAdminRoleForm` (estados).
- **Script:** `scripts/export-clerk-accounts.test.mjs`, o `.ts` si Vitest lo requiere.
- `NoCrmAccess` y las páginas son Async Server Components: se validan funcionalmente con Clerk y Neon de desarrollo.

## Plan de tareas

### Fase 1: registrados = Runner y "Ingresar al CRM"
- [x] T1 — Registro en `profiles` dentro del batch de la guarda y comentario de `profiles`, con tests · archivos: `lib/auth/access.service.ts`, `lib/auth/access.service.test.ts`, `lib/db-schema.ts` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — `registerAccountAction`, `matcher` de `/cuenta` y `RunnerAccount` con "Ingresar al CRM", con tests · archivos: `modules/accounts/actions/account.actions.ts`, `modules/accounts/actions/account.actions.test.ts`, `middleware.ts`, `modules/accounts/components/RunnerAccount.tsx`, `modules/accounts/components/RunnerAccount.test.tsx` · depende de: T1 · paralelo (con T3, T4)
- [x] T3 — Runner para toda cuenta del directorio, con tests · archivos: `modules/accounts/services/userDirectory.service.ts`, `modules/accounts/services/userDirectory.service.test.ts`, `modules/accounts/types/userDirectory.types.ts` · depende de: T1 · paralelo (con T2, T4)
- [x] T4 — Script de backfill con test y README · archivos: `scripts/export-clerk-accounts.mjs`, `scripts/export-clerk-accounts.test.ts`, `README.md` · depende de: — · paralelo (con T2, T3)

### Fase 2: solicitud del rol Admin
- [x] T1 — Schema `role_requests` y migración generada · archivos: `lib/db-schema.ts`, `drizzle/0015_*.sql`, `drizzle/meta/*` · depende de: Fase 1 · secuencial (base)
- [x] T2 — Schema Zod, tipos y servicio con tests · archivos: `modules/accounts/schemas/roleRequest.schema.ts`, `modules/accounts/schemas/roleRequest.schema.test.ts`, `modules/accounts/types/roleRequest.types.ts`, `modules/accounts/services/roleRequest.service.ts`, `modules/accounts/services/roleRequest.service.test.ts` · depende de: T1 · secuencial
- [x] T3 — Acciones con tests · archivos: `modules/accounts/actions/roleRequest.actions.ts`, `modules/accounts/actions/roleRequest.actions.test.ts` · depende de: T2 · secuencial
- [x] T4 — `NoCrmAccess` async, `RequestAdminRoleForm` y `RoleRequestsTable` · archivos: `modules/accounts/components/NoCrmAccess.tsx`, `modules/accounts/components/RequestAdminRoleForm.tsx`, `modules/accounts/components/RequestAdminRoleForm.test.tsx`, `modules/accounts/components/RoleRequestsTable.tsx` · depende de: T3 · secuencial
- [x] T5 — Exports, sección en la página de usuarios y README · archivos: `modules/accounts/index.ts`, `app/crm/(protected)/admin/usuarios/page.tsx`, `README.md` · depende de: T4 · secuencial

### Fase 3: desactivar y eliminar cuentas
- [x] T1 — Columnas de baja, migración, `canRemoveAccounts`, `blocked` en la guarda y aceptación de invitaciones, con tests · archivos: `lib/db-schema.ts`, `drizzle/0016_*.sql`, `drizzle/meta/*`, `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts`, `lib/auth/access.service.ts`, `lib/auth/access.service.test.ts`, `lib/auth/guards.ts`, `lib/auth/guards.test.ts` · depende de: Fase 2 · secuencial (base, `lib/`)
- [x] T2 — Servicio y schema de estado de cuenta con tests · archivos: `modules/accounts/services/accountStatus.service.ts`, `modules/accounts/services/accountStatus.service.test.ts`, `modules/accounts/schemas/accountStatus.schema.ts`, `modules/accounts/schemas/accountStatus.schema.test.ts` · depende de: T1 · paralelo (con T3)
- [x] T3 — Estado en el directorio (`status`, eliminadas fuera) y "Desactivada" en `UserTable`, con tests · archivos: `modules/accounts/services/userDirectory.service.ts`, `modules/accounts/services/userDirectory.service.test.ts`, `modules/accounts/types/userDirectory.types.ts`, `modules/accounts/components/UserTable.tsx` · depende de: T1 · paralelo (con T2)
- [x] T4 — Acciones con Clerk, con tests · archivos: `modules/accounts/actions/accountStatus.actions.ts`, `modules/accounts/actions/accountStatus.actions.test.ts` · depende de: T2 · secuencial
- [x] T5 — `AccountStatusSection`, `DeleteAccountDialog`, exports, ficha y README · archivos: `modules/accounts/components/AccountStatusSection.tsx`, `modules/accounts/components/DeleteAccountDialog.tsx`, `modules/accounts/index.ts`, `app/crm/(protected)/admin/usuarios/[id]/page.tsx`, `README.md` · depende de: T3, T4 · secuencial

### Fase 4: más roles gestionables
- [ ] T1 — Matriz de gestión con tests · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: — · secuencial (base, `lib/`)
- [ ] T2 — Schema, servicio y acción de concesión con marca, con tests · archivos: `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts`, `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: T1 · secuencial
- [ ] T3 — `GrantSponsorRoleForm`, `StaffTable` y ficha con marcas · archivos: `modules/accounts/components/GrantSponsorRoleForm.tsx`, `modules/accounts/components/StaffTable.tsx`, `app/crm/(protected)/admin/usuarios/[id]/page.tsx` · depende de: T2 · secuencial

Orden: F1 → F4 → F2 → F3 es válido, porque F4 solo depende de F1. La F2 de `accounts-user-management.md` (invitar Patrocinador) toca `staff.schema.ts`, `staff.service.ts` y `staff.actions.ts`: se ejecuta antes o después de esta F4, nunca en paralelo.

## Decisiones

1. **Runner no es un valor de `staff_role`.** Es la condición base de toda cuenta registrada. Se mantienen los motivos de la Decisión 1 de `accounts-user-management.md`: no concede permisos, añadir un valor al enum es irreversible y revocarlo no tendría efecto. Lo que cambia es la fuente: deja de derivarse de perfil o reservas y pasa a ser "toda cuenta conocida".
2. **Registro al iniciar sesión, no webhook.** No requiere configurar Clerk ni guardar un secreto nuevo, y cubre a las cuentas existentes cuando vuelven a entrar; el backfill cubre al resto. Coste: una sentencia `INSERT … ON CONFLICT` más en el batch de cada petición con guarda, sin viajes de red extra.
3. **`profiles` pasa a ser "cuentas conocidas".** Ya era el destino de las FK de autoría y la condición de `grantStaffRole`. Una tabla nueva duplicaría `user_id`/correo, y `grantStaffRole` seguiría sin funcionar para registrados. Es compatible: quien no tiene roles ya aparecía con "Sin rol activo".
4. **"Ingresar al CRM" solo en `/cuenta`.** Es donde aterriza el acceso ("Ingresar / Registrarse" del header). Llevarlo a `SiteHeader` exigiría una llamada al servidor en cada página pública con sesión. Si se quiere en el header, se hará en una enmienda.
5. **`crm.access` y no "admin o comercial".** `organizer` también entra al CRM hoy. Ocultarle el enlace sería inconsistente, y la guarda decide igualmente.
6. **Solo `super_admin` resuelve solicitudes de Admin**, porque es el único que puede conceder `admin` (`ROLE_MANAGEMENT`).
7. **`canRemoveAccounts` fuera de la matriz.** `FULL_ACCESS_ROLES` concede a `admin` todo permiso de la matriz, y el usuario pidió que esto sea del `super_admin`.
8. **Neon primero, Clerk después.** Si Clerk falla, la cuenta queda bloqueada en la aplicación (fallo cerrado) y el reintento es idempotente. Al revés, una cuenta borrada en Clerk podría seguir con roles en Neon.
9. **Eliminar = anonimizar + bloquear, no `DELETE` de `profiles`.** Las 26 FK `restrict` de autoría lo impiden y el historial comercial y contable debe conservarse. Se borran los datos personales propios de la cuenta (perfil de runner, código de referido y correo) y la identidad en Clerk.

## Enmiendas a specs aprobadas

- `accounts-user-management.md`:
  - **Requisito 3 y Decisión 2:** la lista es toda cuenta de `profiles` (no eliminada) más `runner_profiles` y reservas vinculadas, y toda cuenta que inicia sesión entra en `profiles`. Su criterio F1 "N … no aparece" queda sustituido: N aparece como Runner tras iniciar sesión o tras el backfill.
  - **Requisito 4 y Decisión 1:** "Runner" = toda cuenta del directorio.
  - **Alcance "borrar cuentas":** sustituido por la Fase 3 de esta spec, solo `super_admin`.
  - **Requisito 10:** "asignar `sponsor` sin invitación sigue sin existir" queda sustituido por la Fase 4.
- `accounts-runner-profiles.md`, **Decisión 18:** la supresión manual por SQL sigue disponible; además, `super_admin` puede eliminar la cuenta completa desde el CRM (Fase 3).

## Preguntas abiertas

1. **Avisos de solicitudes.** ¿Avisar a los `super_admin` (correo o n8n) cuando llega una solicitud? Propuesta: no en esta spec; la sección de la página de usuarios basta para el volumen actual.
2. **Otros roles solicitables.** Ahora solo se puede pedir `admin`. ¿Más adelante se pedirán Comercial u Organizador, resueltos por un `admin`?
3. **Conservación de recompensas al eliminar.** Se propone conservar el libro de recompensas por su valor contable (no tiene datos de contacto) y borrar solo el código de referido. ¿Hace falta algo distinto por la Ley 29733?
