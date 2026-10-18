# Roles, invitaciones y permisos del equipo (RBAC del CRM)

- Módulo: accounts
- Estado: borrador
- Depende de: platform-neon-foundation.md (Fase 1 aprobada); accounts-auth-ui.md (Fases 1 y 2 implementadas: `/crm/acceso`, layout protegido `app/crm/(protected)/`, `CrmShell`, `getCrmAccess`), necesaria para la Fase 3

## Objetivo
Implementar la "Fase 2: permisos mínimos" que `platform-neon-foundation.md` deja para una spec separada, adaptada a cómo funciona el MVP:
- **Runners:** son visitantes anónimos. Consultan viajes, completan formularios y escriben por WhatsApp sin registrarse, así que no tienen cuenta ni perfil.
- **Equipo comercial:** entra al CRM con correo y contraseña de Neon Auth.
- **Admin:** gestiona desde el CRM a los usuarios autorizados y sus permisos.
- **Alta de comerciales:** el admin crea una **invitación para el correo** de la persona y le comparte a mano el enlace de acceso (Pregunta 2, resuelta). Una persona solo obtiene permisos si tiene una invitación válida o una asignación hecha por un admin. Registrarse no concede nada.

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
  - (F3) Página `/crm/admin/usuarios` dentro de la zona protegida del CRM (`app/crm/(protected)/admin/usuarios/page.tsx`), con sus componentes:
    - formulario de invitación que muestra el enlace de acceso para copiarlo y compartirlo a mano;
    - tabla de staff activo con asignar y revocar rol;
    - tabla de invitaciones pendientes con revocar;
    - mensaje "sin permiso" para quien tiene acceso al CRM pero no `staff.manage`.
  - (F3) Enlace "Usuarios" en la cabecera de `CrmShell`, solo para quien tiene `staff.manage`. El título de la cabecera pasa a enlazar a `/crm`.
  - (F3) Observaciones del reviewer de F2:
    - `staff.schema.ts` reutiliza `emailSchema`, exportado desde `auth.schema.ts`;
    - `getCrmAccess` acepta el permiso que comprueba.
- No incluye:
  - **UI de autenticación** (`/crm/acceso`: crear cuenta con correo y contraseña, verificar el correo con código, login, logout y recuperación). Es de `accounts-auth-ui.md` (Fases 1 y 2 implementadas, Fase 3 pendiente).
  - **Envío automático del correo de invitación.** El admin copia el enlace `/crm/acceso` que muestra la página y lo comparte a mano, por WhatsApp o su correo (Pregunta 2, resuelta).
  - (F3) **Migrar los formularios a `field` de shadcn.** No se instala `field` en F3; ver "Decisiones" y Pregunta abierta 6.
  - (F3) En la página de administración:
    - `error.tsx` o `loading.tsx` propios;
    - paginación, búsqueda u orden configurable en las tablas;
    - resaltado del enlace activo en la navegación, que requeriría un componente de cliente con `usePathname`;
    - volver a mostrar el enlace desde la tabla de invitaciones: es siempre el mismo `/crm/acceso`;
    - un mensaje de invitación predefinido para copiar;
    - aviso especial al revocarse a uno mismo.
  - **Colaboradores:** tablas `organizations` y `organization_memberships`, enums de organización, `requireOrgRole`/`findMembership`, verificación de organizaciones (`updateOrganizationStatusAction`) y los endpoints de colaboradores. Quedan para una spec futura de colaboradores.
  - **Perfiles OPERACIONES y MODERADOR:** no existen por ahora. Se añadirán en una spec futura, cuando hagan falta, como valores nuevos del enum `staff_role` (migración `ALTER TYPE staff_role ADD VALUE …`) y entradas nuevas en la matriz.
  - **Cuentas o recursos de runner.** Los runners son anónimos en el MVP.
  - Otras pantallas del CRM: leads y embudo. El layout `/crm` ya existe (`accounts-auth-ui.md`).
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
16. **Página de administración (F3):**
    - vive bajo el layout protegido, que ya resuelve "sin sesión" y "sin acceso al CRM";
    - además comprueba ella misma `requirePermission("staff.manage")` mediante `getCrmAccess("staff.manage")`, porque los layouts no se vuelven a renderizar en la navegación de cliente;
    - solo consulta datos (`listStaffOverview`) después de esa comprobación;
    - la UI es la defensa visual; la seguridad sigue en cada Server Action.
17. **Navegación (F3):** el enlace "Usuarios" solo se muestra si `can(roles, "staff.manage")`. Ocultarlo es solo visual; la página y las acciones vuelven a comprobar el permiso.
18. **Invitación sin envío automático (F3):**
    - la página muestra el `acceptUrl` que devuelve `inviteStaffAction` para que el admin lo copie y lo comparta a mano;
    - el enlace es el mismo para todos y no es secreto: la invitación se liga al correo verificado (Requisito 5).
19. **Tamaño del Worker (F3):** se mide sin desplegar al cerrar la fase. Si el gzip supera 2 MiB, se detiene y se consulta al usuario (límite de Workers Free: 3 MiB).

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

Fase 3 (página de administración en el CRM):

Acceso y navegación:
- [ ] (F3) Dado un admin verificado, cuando abre `/crm/admin/usuarios`, entonces la página se ve dentro de `CrmShell` (correo, roles y "Cerrar sesión") con el título "Usuarios del equipo" y estas secciones:
  - "Invitar a una persona": campos "Correo" y "Rol" (`Comercial`, seleccionado por defecto, y `Admin`) y botón "Invitar";
  - "Equipo activo": tabla con las columnas "Correo", "Roles", "Alta" y "Acciones";
    - "Roles" muestra cada rol activo como `Badge` "Comercial" o "Admin";
    - "Alta" es la fecha del rol activo más antiguo con el formato "18 oct 2026, 10:30";
  - "Invitaciones pendientes": tabla con las columnas "Correo", "Rol", "Caduca" y "Acciones";
    - si `expired`, junto a la fecha aparece un `Badge` "Caducada";
    - sin invitaciones, se ve el texto "Sin invitaciones pendientes".
- [ ] (F3) Dado un `commercial` verificado, cuando abre `/crm/admin/usuarios` (URL directa o navegación de cliente), entonces:
  - ve el shell con el título "Usuarios del equipo" y el texto "No tienes permiso para gestionar el equipo. Si lo necesitas, pídeselo a un administrador.";
  - no ve el formulario ni las tablas;
  - la respuesta es 200, no 403 ni 404;
  - en el código, `listStaffOverview()` solo se llama después de que `getCrmAccess("staff.manage")` devuelva `ok`.
- [ ] (F3) Dada una cuenta verificada sin roles, o con el correo sin verificar, cuando abre `/crm/admin/usuarios`, entonces ve la pantalla de `NoCrmAccess` del layout, sin shell. Sin sesión, se le redirige a `/crm/acceso`.
- [ ] (F3) Dado un admin, entonces la cabecera de `CrmShell` muestra el enlace "Usuarios" a `/crm/admin/usuarios`. Dado un `commercial`, no lo muestra. En ambos casos, el título "CRM Carreras Viajeras" enlaza a `/crm`.

Invitar:
- [ ] (F3) Dado el formulario de invitación con `Luis@Example.com` y rol `Comercial`, cuando pulso "Invitar", entonces:
  - mientras espera, el botón queda deshabilitado con "Invitando…";
  - se llama a `inviteStaffAction`;
  - aparece (`role="status"`) el mensaje "Invitación creada para luis@example.com. Comparte el enlace de acceso.";
  - el enlace `<APP_ORIGIN>/crm/acceso` aparece en un campo de solo lectura "Enlace para compartir", con el botón "Copiar enlace";
  - aparece el texto "Envíalo tú (por WhatsApp o correo). La persona debe crear su cuenta con el correo invitado y verificarlo con el código que recibirá.";
  - el formulario se vacía y la invitación aparece en "Invitaciones pendientes" (`revalidatePath`);
  - no se envía ningún correo.
- [ ] (F3) Dado el enlace mostrado, cuando pulso "Copiar enlace", entonces se llama a `navigator.clipboard.writeText(acceptUrl)` y aparece "Enlace copiado.". Si la escritura falla, aparece "No se pudo copiar. Selecciona el enlace y cópialo a mano.".
- [ ] (F3) Dado un correo vacío o mal formado, cuando pulso "Invitar", entonces:
  - aparece "Introduce un correo válido." junto al campo, con `aria-invalid` y `aria-describedby`;
  - el valor escrito y el rol elegido se conservan;
  - no aparece ningún enlace.
- [ ] (F3) Dado un correo con una invitación pendiente y vigente, cuando lo invito, entonces aparece un error general (`role="alert"`) "Ya hay una invitación pendiente y vigente para ese correo." y el formulario conserva los valores.

Confirmar acciones:
- [ ] (F3) Dado "Revocar <Rol>" en una fila de "Equipo activo", "Asignar <Rol>" o "Revocar" en una invitación, cuando lo pulso, entonces se abre un `AlertDialog` con el correo y el rol afectados y los botones "Cancelar" y el de confirmar.
  - "Cancelar" cierra el diálogo sin llamar a la acción.
  - Confirmar envía los campos ocultos (`userId` y `role`, o `invitationId`) a la acción; mientras espera, el botón queda deshabilitado con "Procesando…".
  - Si hay éxito, el diálogo se cierra y la tabla refleja el cambio (`revalidatePath`).
- [ ] (F3) Dado el último admin activo, cuando confirmo "Revocar Admin" sobre él (incluido uno mismo), entonces el diálogo sigue abierto con el error (`role="alert"`) "No se puede revocar el rol del último admin activo." y la tabla no cambia. Cualquier otro `code` de error muestra su `message` de la misma forma.
- [ ] (F3) Dado un staff solo con rol `Comercial`, entonces su fila ofrece "Asignar Admin". Si solo tiene `Admin`, ofrece "Asignar Comercial". Si tiene los dos, no ofrece asignar. Cada rol activo tiene su botón "Revocar <Rol>".

Calidad:
- [ ] (F3) Dado el árbol de componentes, entonces:
  - `"use client"` solo aparece en `InviteStaffForm` y `ConfirmActionButton`;
  - la página, `StaffTable`, `InvitationsTable` y `CrmShell` son Server Components;
  - `staffDisplay.ts` solo usa `import type` de `@/lib/auth/permissions`.
- [ ] (F3) Dado `auth.schema.ts`, entonces exporta `emailSchema` e `inviteStaffSchema` lo reutiliza. `staff.schema.test.ts` y `auth.schema.test.ts` pasan sin cambios.
- [ ] (F3) Dado `npx shadcn@latest add table badge native-select alert-dialog`, entonces solo se crean esos cuatro archivos en `components/ui/` y `components/ui/button.tsx` no cambia.
- [ ] (F3) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar), entonces el tamaño gzip del Worker se registra en el resumen de la fase. Se compara con los 1610 KiB de referencia y debe ser < 2 MiB; si lo supera, se detiene y se consulta al usuario.
- [ ] (F3) `npm run lint`, `npx vitest run` y `npm run build` pasan.

Manual (en la máquina del usuario, con su autorización, en una rama Neon de desarrollo y nunca en `production`):
- [ ] Se aplica la migración y el volcado del schema `neon_auth` es idéntico antes y después.
- [ ] Bootstrap del primer admin → `GET /api/crm/me` responde 200.
- [ ] Invitar → crear la cuenta y verificar con código → 200 `commercial`. Esto requiere la UI de `accounts-auth-ui.md` o la API de Neon Auth.
- [ ] Revocar el rol → 403 en la siguiente petición.
- [ ] Dos revocaciones concurrentes del penúltimo y del último admin → solo una tiene éxito.
- [ ] (F3) Desde `/crm/admin/usuarios`:
  - invitar y copiar el enlace;
  - la persona crea su cuenta y verifica su correo;
  - al recargar, aparece en "Equipo activo" y desaparece de "Invitaciones pendientes".
- [ ] (F3) Esa persona (`commercial`):
  - no ve "Usuarios" en la cabecera;
  - al abrir la URL directa ve el mensaje sin permiso.

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
- **Página de administración (F3):**
  - vive en `app/crm/(protected)/admin/usuarios/page.tsx` para heredar el layout protegido y `CrmShell`;
  - el route group no cambia la URL, así que el `revalidatePath("/crm/admin/usuarios")` de las acciones de F2 sigue siendo correcto;
  - sin sesión usa `redirect("/crm/acceso")` de `next/navigation`;
  - sin `staff.manage` muestra un mensaje dentro del shell (respuesta 200), no la página 404: quien ya está en el CRM entiende por qué no ve la página;
  - no usa `forbidden()`/`unauthorized()` porque requieren `experimental.authInterrupts`;
  - el mensaje sin permiso es texto estático en la página, como la bienvenida de `app/crm/(protected)/page.tsx`. No se crea un componente para él.
- **`getCrmAccess(permission)` (F3):**
  - se amplía la util existente con un parámetro `permission: Permission = "crm.access"` y pasa a llamar a `requirePermission(permission)`;
  - el layout y `/crm` no cambian, porque el valor por defecto mantiene su comportamiento;
  - `cache()` de `getCurrentUser` hace que el layout y la página compartan una sola consulta de sesión y roles por render;
  - así la página no repite en `app/` el `try/catch` de las guardas.
- **Navegación (F3):**
  - `CrmShell` calcula `can(roles, "staff.manage")` con la matriz de `lib/auth/permissions.ts`, la única fuente de verdad. Es un Server Component, así que puede importarla;
  - si es `true`, añade un `<nav>` con un `Link` "Usuarios" (`next/link`, estilo `buttonVariants({ variant: "ghost" })`);
  - el título pasa a ser un `Link` a `/crm` para volver desde la página de usuarios;
  - no hay resaltado del enlace activo (necesitaría `usePathname` en cliente; YAGNI);
  - cabe en F3 sin pasar de 5 tareas: solo modifica `CrmShell.tsx`.
- **Asignar rol sin selector (F3):**
  - con dos roles, a un staff solo le puede faltar uno, así que un selector por fila tendría como mucho una opción;
  - por eso se sustituye el `StaffRoleForm` planificado por un `ConfirmActionButton` "Asignar <Rol>". Así se pide confirmación también al elevar privilegios y hay un archivo menos;
  - si en el futuro hay más roles (Alcance: OPERACIONES, MODERADOR), se volverá a valorar el selector.
- **Sin `field` en F3:**
  - `field` existe en el estilo `base-nova` (`registryDependencies`: `label` y `separator`), pero no se instala:
    - los tres formularios existentes (`SignInForm`, `SignUpForm` y `VerifyEmailForm`) y los dos de recuperación que añadirá `accounts-auth-ui.md` F3 usan `Label` + `Input` + `<p role="alert">`;
    - mezclar dos patrones rompe la consistencia;
    - migrarlos inflaría la fase (5+ archivos) y chocaría con `accounts-auth-ui.md` F3, que modifica `SignInForm` y `AccessPanel`.
  - `InviteStaffForm` sigue el patrón actual. Ver Pregunta abierta 6.
- **El formulario de invitación conserva los valores si hay error (F3):**
  - React 19 resetea los campos no controlados de un `<form action={…}>` al terminar la acción;
  - sugerencia: enviar con `onSubmit` + `event.preventDefault()` + `startTransition(() => formAction(new FormData(form)))`, y llamar a `form.reset()` solo cuando el estado sea `success`.

  El criterio de aceptación es el comportamiento, no la técnica.
- **Fechas (F3):**
  - `formatStaffDateTime(date)` usa `Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: CRM_TIME_ZONE })`;
  - `CRM_TIME_ZONE = "America/Lima"` es provisional, la misma zona que propone el borrador `crm-leads-pipeline.md` (Pregunta abierta 5);
  - vive en el módulo (`utils/staffDisplay.ts`) y se subirá a `lib/` cuando otro dominio lo necesite (SETUP §1, regla 5).
- **Etiquetas de rol (F3):**
  - `STAFF_ROLE_LABELS` (`commercial` → "Comercial", `admin` → "Admin") se mueve de `CrmShell` a `utils/staffDisplay.ts`, porque ahora la usan `CrmShell`, las tablas y `InviteStaffForm` (DRY);
  - `staffDisplay.ts` importa `StaffRole` solo con `import type`, para que el componente de cliente no arrastre `server-only`.
- **Tamaño del Worker (F3):**
  - medido el 2026-10-18 sobre `4fd366e` con `npm run build:worker` + `npx wrangler deploy --dry-run`: **1610,41 KiB gzip** (7699,80 KiB sin comprimir);
  - cada página nueva bajo `/crm` suma ~160 KiB gzip con Turbopack, así que la estimación tras F3 es ~1,8 MiB (una página, `AlertDialog` de Base UI y dos componentes de cliente), por debajo del umbral de consulta de 2 MiB;
  - después quedará margen para ~1 página más antes de ese umbral. Las specs siguientes con páginas en `/crm` (p. ej. `crm-leads-pipeline.md`) tendrán que tenerlo en cuenta.

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
- `app/crm/(protected)/admin/usuarios/page.tsx` (nuevo, F3): Server Component delgado bajo el layout protegido existente (`app/crm/(protected)/layout.tsx`, sin cambios). Exporta `metadata = { title: "Usuarios del equipo" }`; `robots` se hereda del layout.
  ```tsx
  export default async function StaffAdminPage() {
    const access = await getCrmAccess("staff.manage");
    if (access.status === "unauthenticated") redirect("/crm/acceso");
    // h1 "Usuarios del equipo" en ambos casos
    if (access.status === "forbidden") return /* <section> con h1 + texto sin permiso (Criterios F3) */;
    const { staff, invitations } = await listStaffOverview();
    return /* <section>: h1; InviteStaffForm; h2 "Equipo activo" + <StaffTable staff={staff} />;
              h2 "Invitaciones pendientes" + <InvitationsTable invitations={invitations} /> */;
  }
  ```
  - `redirect()` se llama fuera de `try/catch`.
  - Todo se importa desde `@/modules/accounts`.
  - Si `listStaffOverview()` falla, el error se propaga al error boundary por defecto de Next, que en producción no muestra el mensaje original. No se añade `error.tsx` (No incluye).

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

F3, base del módulo (modificaciones):

| Archivo | Tipo | Cambio |
|---|---|---|
| `schemas/auth.schema.ts` | existente | `emailSchema` pasa a `export const emailSchema`, sin otros cambios |
| `schemas/staff.schema.ts` | existente | `inviteStaffSchema = z.object({ email: emailSchema, role: staffRoleSchema })`, con `import { emailSchema } from "./auth.schema"`. Mismo comportamiento: trim, minúsculas y `z.email()`; el mensaje de campo de la acción no cambia (`FIELD_MESSAGES`) |
| `utils/crmAccess.ts` | existente | `getCrmAccess(permission: Permission = "crm.access")` llama a `requirePermission(permission)` en lugar de `requireCrmUser()`. El mapeo de errores y `await connection()` no cambian |
| `utils/staffDisplay.ts` | nuevo (no existe ningún formateador de fechas ni etiquetas compartidas; `lib/dates.ts` solo está en specs en borrador) | `STAFF_ROLE_LABELS: Record<StaffRole, string>`; `CRM_TIME_ZONE = "America/Lima"` (provisional); `formatStaffDateTime(date: Date): string`. Sin `server-only`, porque lo usa un componente de cliente |
| `components/CrmShell.tsx` | existente | Usa `STAFF_ROLE_LABELS` (elimina su `ROLE_LABELS` local), el título enlaza a `/crm` y añade el enlace "Usuarios" si `can(roles, "staff.manage")`. Las props no cambian |

F3, componentes nuevos en `modules/accounts/components/` (no existen en el proyecto; son de un solo dominio):

| Componente | Tipo | Descripción |
|---|---|---|
| `InviteStaffForm` | nuevo, `"use client"` | Sección "Invitar a una persona" con un formulario `noValidate`: `useActionState(inviteStaffAction, { status: "idle" })`; `Label` + `Input type="email" name="email" autoComplete="off"`; `Label` + `NativeSelect name="role"` con `staffRoleSchema.options` y las etiquetas de `STAFF_ROLE_LABELS` (`commercial` por defecto); `Button` "Invitar"/"Invitando…". Errores por campo de `state.fieldErrors` y error general, con el mismo patrón que `SignInForm`. Si hay `success`, muestra `state.message`, el `acceptUrl` en un `Input readOnly`, el botón "Copiar enlace" (`navigator.clipboard.writeText`, con estado local "Enlace copiado." o el texto de fallo) y el texto de instrucciones (Criterios F3). Conserva los valores si hay error (ver Decisiones) |
| `ConfirmActionButton` | nuevo, `"use client"` | `AlertDialog` (trigger `Button`) con un `<form>` de campos ocultos (`fields`) enviado a `action` mediante `useActionState`. "Cancelar" cierra; confirmar queda deshabilitado con "Procesando…" mientras espera; si hay `success`, cierra el diálogo; si hay `error`, muestra `state.message` con `role="alert"` y el diálogo sigue abierto. Hacen falta estado y eventos, así que es cliente. Lo reutilizan las tres acciones de fila |
| `StaffTable` | nuevo, Server | Props `{ staff: StaffMember[] }`. `Table` con las columnas "Correo", "Roles" (`Badge` por rol con `STAFF_ROLE_LABELS`), "Alta" (`formatStaffDateTime` del `grantedAt` mínimo) y "Acciones": un `ConfirmActionButton` "Asignar <Rol>" (`grantStaffRoleAction`, `variant="outline"`) para el rol que le falte, si le falta alguno, y un `ConfirmActionButton` "Revocar <Rol>" (`revokeStaffRoleAction`, `variant="destructive"`) por cada rol activo. Importa las acciones desde `../actions/staff.actions` y las pasa por props |
| `InvitationsTable` | nuevo, Server | Props `{ invitations: PendingInvitation[] }`. `Table` con las columnas "Correo", "Rol", "Caduca" (`formatStaffDateTime(expiresAt)`, más `Badge variant="destructive"` "Caducada" si `expired`) y "Acciones" (`ConfirmActionButton` "Revocar", `revokeInvitationAction`, `variant="destructive"`). Lista vacía: "Sin invitaciones pendientes" |

Textos de `ConfirmActionButton` por uso (`<email>` y `<Rol>` vienen de la fila):

| Uso | Disparador | Título | Descripción | Confirmar |
|---|---|---|---|---|
| Revocar rol | "Revocar <Rol>" | "¿Revocar el rol <Rol>?" | "<email> dejará de tener el rol <Rol> en su próxima petición." | "Revocar" |
| Asignar rol | "Asignar <Rol>" | "¿Asignar el rol <Rol>?" | "<email> tendrá el rol <Rol> desde su próxima petición." | "Asignar" |
| Revocar invitación | "Revocar" | "¿Revocar la invitación?" | "<email> ya no podrá aceptar esta invitación." | "Revocar" |

- `index.ts` (F3): además de lo que ya exporta (`AccessPanel`, `CrmShell`, `NoCrmAccess`, `getCrmAccess`), exporta `InviteStaffForm`, `StaffTable`, `InvitationsTable` y `listStaffOverview`.
- shadcn:
  - instalados: `button`, `input`, `label`, `card`. No se reinstalan.
  - por instalar (F3-T1): `npx shadcn@latest add table badge native-select alert-dialog`. Comprobado en el registro del estilo `base-nova` (`https://ui.shadcn.com/r/styles/base-nova/<name>.json`) y con `npx shadcn@latest search @shadcn`:

    | Componente | Archivo | Dependencias |
    |---|---|---|
    | `table` | `components/ui/table.tsx` | ninguna |
    | `badge` | `components/ui/badge.tsx` | `@base-ui/react` y `class-variance-authority`, ya instalados |
    | `native-select` | `components/ui/native-select.tsx` | icono de `lucide-react` |
    | `alert-dialog` | `components/ui/alert-dialog.tsx` | `@base-ui/react/alert-dialog`; `registryDependencies: ["button"]`, ya instalado |

    Si el CLI pregunta si sobrescribe `button.tsx`, se responde que no.
  - `field` existe en `base-nova` (añadiría `field.tsx` y `separator.tsx`), pero no se instala en F3 (ver Decisiones).

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

// F3 (sin cambios en el contrato de las acciones ni en StaffActionState)
// modules/accounts/utils/crmAccess.ts
export function getCrmAccess(permission?: Permission /* = "crm.access" */): Promise<CrmAccess>;
// modules/accounts/utils/staffDisplay.ts
export const STAFF_ROLE_LABELS: Record<StaffRole, string>; // { commercial: "Comercial", admin: "Admin" }
export const CRM_TIME_ZONE = "America/Lima";                // provisional (Pregunta abierta 5)
export function formatStaffDateTime(date: Date): string;    // "18 oct 2026, 10:30"
// modules/accounts/components/ConfirmActionButton.tsx
type ConfirmActionButtonProps = {
  action: (prev: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  fields: Record<string, string>; // campos ocultos: { userId, role } o { invitationId }
  label: string;                  // texto del disparador
  title: string;
  description: string;
  confirmLabel: string;
  variant: "outline" | "destructive"; // variante del disparador
};
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
- zod v4, `server-only`, `cache` de React, `revalidatePath`, `redirect` de Next.
- Patrón de tests de `lib/env.test.ts`: `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`.
- `drizzle.mock()` de `drizzle-orm/neon-http` para inspeccionar el SQL con `.toSQL()` sin conexión.
- shadcn:
  - ya instalados: `button` (con `buttonVariants` para el enlace de navegación), `input` y `label`;
  - por instalar en F3: `table`, `badge`, `native-select` y `alert-dialog`.

  No se añaden dependencias de runtime.
- (F3) Existentes en el proyecto:
  - el layout `app/crm/(protected)/layout.tsx`, `CrmShell`, `NoCrmAccess` y `getCrmAccess`, de `accounts-auth-ui.md`;
  - `listStaffOverview`, las cuatro Server Actions con sus mensajes en español (`ERROR_MESSAGES`/`FIELD_MESSAGES`), `staffRoleSchema` y los tipos `StaffMember`, `PendingInvitation` y `StaffActionState`, de F2;
  - `emailSchema`, de `auth.schema.ts`;
  - `can()`, de `lib/auth/permissions.ts`;
  - el patrón de campos y errores de `SignInForm`.
- (F3) De Next/React: `next/link`, `useActionState` y `startTransition`.

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
- `modules/accounts/utils/crmAccess.test.ts` (F3, modificar; se mockea `requirePermission` en lugar de `requireCrmUser`):
  - se mantienen los cuatro casos actuales (`unauthenticated`, `forbidden`, `ok` y relanzar cualquier otro error);
  - sin argumento llama a `requirePermission("crm.access")`;
  - con `"staff.manage"` llama a `requirePermission("staff.manage")`;
  - un `ForbiddenError` con ese permiso (caso `commercial`) → `{ status: "forbidden" }`.
- `modules/accounts/utils/staffDisplay.test.ts` (F3, nuevo):
  - `formatStaffDateTime(new Date("2026-10-18T15:30:00Z"))` → `"18 oct 2026, 10:30"`;
  - `formatStaffDateTime(new Date("2026-10-19T03:00:00Z"))` → `"18 oct 2026, 22:00"`: no salta al día UTC y no depende de la zona horaria del proceso;
  - `STAFF_ROLE_LABELS` tiene una etiqueta para cada valor de `staffRoleSchema.options`.
- `modules/accounts/schemas/staff.schema.test.ts` y `auth.schema.test.ts` (F3): pasan sin cambios tras reutilizar `emailSchema`.
- Sin unit tests (según SETUP o por limitación):
  - `lib/db-schema.ts`, scripts SQL y tipos;
  - componentes de `components/ui/`;
  - página async de `app/` (Server Component asíncrono);
  - componentes del módulo (`InviteStaffForm`, `ConfirmActionButton`, `StaffTable`, `InvitationsTable`, `CrmShell`): son de un solo dominio y su lógica está en las acciones y en `staffDisplay`. Se cubren con los criterios de F3, el checklist manual y E2E cuando exista.

## Plan de tareas
### Fase 1: schema, guardas, aceptación de invitaciones y API protegida (5 tareas, 15 archivos)
- [x] T1 — Schema Drizzle (enum, 3 tablas, CHECK, índices parciales) y migración generada, revisada sin `neon_auth` · archivos: `lib/db-schema.ts`, `drizzle/0000_*.sql` (generado), `drizzle/meta/0000_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base)
- [x] T2 — Matriz de permisos y errores con su mapeo a 401/403 · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts`, `lib/auth/errors.ts` · depende de: T1 · secuencial (`lib/`)
- [x] T3 — Service de acceso (aceptación atómica + roles) y guardas con sus tests · archivos: `lib/auth/access.service.ts`, `lib/auth/access.service.test.ts`, `lib/auth/guards.ts`, `lib/auth/guards.test.ts` · depende de: T1, T2 · secuencial (`lib/`)
- [x] T4 — `GET /api/crm/me` y test de llamada directa · archivos: `app/api/crm/me/route.ts`, `app/api/crm/me/route.test.ts` · depende de: T3 · paralelo (con T5)
- [x] T5 — Scripts SQL de bootstrap del primer admin y de revocación de emergencia · archivos: `scripts/sql/bootstrap-admin.sql`, `scripts/sql/revoke-staff-role.sql` · depende de: T1 · paralelo (con T2–T4; archivos disjuntos)

### Fase 2: administración del staff en servidor y documentación (4 tareas, 8 archivos)
- [x] T1 — Schemas zod y tipos de staff con su test · archivos: `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/accounts/types/staff.types.ts` · depende de: Fase 1 · secuencial
- [x] T2 — Service de staff (listar, invitar, revocar invitación, asignar y revocar rol con protección del último admin) con tests · archivos: `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts` · depende de: F2-T1 · secuencial
- [x] T3 — Server Actions de administración con tests de llamada directa · archivos: `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: F2-T2 · secuencial
- [x] T4 — README:
  - modelo de acceso;
  - ajustes de Neon Auth (Sign-up ON como riesgo aceptado, verificación por código);
  - bootstrap y revocación de emergencia;
  - aplicación manual de la migración y verificación de `neon_auth`;
  - checklist manual en la rama de desarrollo;
  - actualizar la frase "La fase 1 no añade … tablas de negocio".

  Archivos: `README.md` · depende de: Fase 1 · paralelo (con F2-T1 a F2-T3)

### Fase 3: página de administración en el CRM (5 tareas, 17 archivos: 4 generados por el CLI de shadcn y 13 escritos a mano)
Coordinación: F3-T2 modifica `modules/accounts/schemas/auth.schema.ts`, que también toca `accounts-auth-ui.md` F3-T1. No se ejecutan en la misma sesión ni en paralelo.
- [ ] T1 — Instalar shadcn: `npx shadcn@latest add table badge native-select alert-dialog` (sin sobrescribir `button.tsx`) · archivos: `components/ui/table.tsx`, `components/ui/badge.tsx`, `components/ui/native-select.tsx`, `components/ui/alert-dialog.tsx` · depende de: Fase 2 · secuencial (base, `components/ui/`)
- [ ] T2 — Base del módulo:
  - exportar `emailSchema` y reutilizarlo en `inviteStaffSchema`;
  - `getCrmAccess(permission)` con su test;
  - `staffDisplay` (etiquetas de rol y `formatStaffDateTime`) con su test.

  Archivos: `modules/accounts/schemas/auth.schema.ts`, `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/utils/crmAccess.ts`, `modules/accounts/utils/crmAccess.test.ts`, `modules/accounts/utils/staffDisplay.ts`, `modules/accounts/utils/staffDisplay.test.ts` · depende de: F3-T1 · paralelo (con F3-T3; archivos disjuntos)
- [ ] T3 — `ConfirmActionButton` (cliente, `AlertDialog` + `useActionState`) · archivos: `modules/accounts/components/ConfirmActionButton.tsx` · depende de: F3-T1 · paralelo (con F3-T2; archivos disjuntos y sin dependencia entre ellas)
- [ ] T4 — `InviteStaffForm` (cliente, con el enlace para copiar) y tablas Server `StaffTable` e `InvitationsTable` · archivos: `modules/accounts/components/InviteStaffForm.tsx`, `modules/accounts/components/StaffTable.tsx`, `modules/accounts/components/InvitationsTable.tsx` · depende de: F3-T2, F3-T3 · secuencial
- [ ] T5 — Navegación, API pública y página:
  - `CrmShell` con el enlace "Usuarios" y `STAFF_ROLE_LABELS`;
  - exports en `index.ts`;
  - `app/crm/(protected)/admin/usuarios/page.tsx`;
  - medir el Worker con `build:worker` + `wrangler deploy --dry-run` sin desplegar, y registrar el gzip frente a 1610 KiB.

  Archivos: `modules/accounts/components/CrmShell.tsx`, `modules/accounts/index.ts`, `app/crm/(protected)/admin/usuarios/page.tsx` · depende de: F3-T4 · secuencial

## Preguntas abiertas
1. ~~**Caducidad de las invitaciones.**~~ **Resuelta:** 7 días (default de `expires_at`), ya implementado en F1/F2.
2. ~~**Aviso de la invitación.**~~ **Resuelta:** aviso manual.
   - El admin comparte el enlace `/crm/acceso` por WhatsApp o su correo, y la persona se registra con el correo invitado.
   - F3 muestra el enlace para copiarlo.
   - El envío automático queda para una spec futura (requiere SMTP propio o un proveedor).
3. **FK hacia `neon_auth.user`.** No se crea en esta fase. ¿Quieres añadirla después con una migración SQL propia, cuando se confirme el tipo del id y que Neon lo admite? ¿Qué debe pasar con el perfil y las asignaciones si se borra la cuenta en Neon Auth?
4. **Rol de base de datos con permisos mínimos.** ¿`DATABASE_URL` usa un rol distinto del owner? Si es así, necesitará:
   - `SELECT, INSERT` en `profiles`;
   - `SELECT, INSERT, UPDATE` en `staff_assignments` y `staff_invitations`.

   Los GRANT quedan fuera de esta spec. ¿Los preparas tú en la consola de Neon o se especifican aparte?
5. **Zona horaria de las fechas (F3).** "Alta" y "Caduca" se muestran con `CRM_TIME_ZONE = "America/Lima"`, la misma zona provisional que el borrador `crm-leads-pipeline.md`. ¿Es la zona en la que trabaja el equipo? Si no, basta con cambiar la constante.
6. **Migrar los formularios a `field` de shadcn.** F3 no lo instala y mantiene el patrón actual de `Label` + `Input` + `<p role="alert">` (ver Decisiones). ¿Prefieres:
   - (a) mantener el patrón actual (propuesta), o
   - (b) una tarea posterior, después de `accounts-auth-ui.md` F3, que instale `field` y migre todos los formularios (`SignInForm`, `SignUpForm`, `VerifyEmailForm`, los de recuperación e `InviteStaffForm`)?
