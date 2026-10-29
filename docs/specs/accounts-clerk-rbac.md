# Clerk como proveedor de identidad y RBAC con super admin y organizadores

- Módulo: accounts (también `lib/auth`, `trips` y `scripts/sql`)
- Estado: aprobado
- Depende de (aprobadas e implementadas en `main` 66ffae1): `platform-neon-foundation.md` (Fase 1), `accounts-roles-permissions.md` (F1–F3), `accounts-auth-ui.md` (F1–F4), `trips-catalog.md`, `landing-race-pages.md`, `runner-portal.md` (F1–F2).
- **Sustituye, sin editarlas, las partes de Neon Auth** de `platform-neon-foundation.md`, `accounts-auth-ui.md` y `accounts-roles-permissions.md` (detalle en "Precedencia"). Esa sustitución solo vale si el usuario aprueba esta spec.
- Base revisada: `main` en 66ffae1 (6 migraciones, `0000`–`0005`). Ramas abiertas que tocan los mismos archivos: ver Pregunta abierta 11.

## Objetivo
Conectar la autenticación de **Clerk** con nuestra base de datos Neon para manejar roles y permisos:
- Clerk pasa a ser el **único proveedor de identidad** para el staff (`/crm`, `/crm/acceso`) y para los runners (`/cuenta`). Se retira Neon Auth.
- Los roles y permisos siguen en Neon. Se leen por id estable de usuario en cada petición y se deniega por defecto.
- Se añaden los roles `super_admin` y `organizer`:
  - el super admin (`linderhassinger01@gmail.com`) es el único que crea administradores y organizadores y gestiona sus roles;
  - un organizador gestiona solo sus propios eventos (`trips`).
- Se prepara, **sin ejecutarlo**, un seed de viajes en borrador que se asociará después a un organizador.

## Precedencia y specs afectadas
Si se aprueba, esta spec gana sobre las siguientes partes. Esas specs no se editan.

| Spec | Parte sustituida | Queda vigente |
|---|---|---|
| `platform-neon-foundation.md` | "Neon Auth gestionado (basado en Better Auth)", `getAuth()` y su handler, y `NEON_AUTH_BASE_URL`/`NEON_AUTH_COOKIE_SECRET` en `lib/env.ts`. "user_id es el identificador estable emitido por Neon Auth" pasa a ser "…emitido por Clerk" | Workers Free + OpenNext; Neon + Drizzle `neon-http`; validación perezosa del entorno; migraciones manuales; CRM = sesión + correo verificado + asignación activa por id, denegado por defecto; primer alta por procedimiento manual con id exacto; sin bypass |
| `accounts-auth-ui.md` | Todos los formularios propios (login, alta, verificación por código, recuperación), `authClient`, `AccessPanel` por pasos y `SignOutButton` con `authClient.signOut()` | Rutas `/crm/acceso` y `/cuenta`, audiencias `staff`/`runner`, destinos cerrados (`/crm`, `/cuenta`), layout protegido, `CrmShell`, `NoCrmAccess` y `getCrmAccess` |
| `accounts-roles-permissions.md` | Requisito 1 (Neon Auth como proveedor), "correo verificado según `session.user.emailVerified`" y enum `staff_role` de 2 valores. `bootstrap-admin.sql` pasa a pedir el id de Clerk | Invitaciones por correo con aceptación atómica, matriz estática `can()`, guardas, protección del último admin y página `/crm/admin/usuarios` |
| `runner-portal.md` | `runner_user_id` pasa a ser el id de Clerk. La futura `/mis-carreras` (F5) tendrá que añadirse al `matcher` del middleware (Decisión D3) | Todo lo demás |

`README.md` y `CLAUDE.md` describen Neon Auth: `README.md` se actualiza en F3–F5; `CLAUDE.md` lo actualiza el usuario (ver "Operación").

## Alcance
- Incluye:
  - (F1) `@clerk/nextjs` 7 y `@clerk/localizations`, `middleware.ts` con `clerkMiddleware()` y `<ClerkProvider>` en español en `app/layout.tsx`. Las guardas de `lib/auth/guards.ts` leen la identidad de Clerk (`auth()` + `currentUser()`) y siguen leyendo los roles de Neon. `/crm/acceso` y `/cuenta` usan `<SignIn>` de Clerk. "Cerrar sesión" usa `<SignOutButton>` de Clerk.
  - (F2) Retirar Neon Auth del código: dependencia `@neondatabase/auth`, `overrides` de Better Auth, `lib/auth/server.ts`, `lib/auth/client.ts`, `app/api/auth/[...path]`, los cinco formularios propios y sus schemas y utilidades muertos. Medir el Worker.
  - (F3) Roles `super_admin` y `organizer` en el enum, `trips.organizer_id` y la migración `0006` generada y revisada, sin aplicar. Nueva matriz de permisos y reglas de gestión de roles (`manageableRoles`, `canManageRole`). `bootstrap-admin.sql` con `-v role=super_admin`. Protección del último super admin en `revoke-staff-role.sql`.
  - (F4) Entorno (`CLERK_SECRET_KEY` en `lib/env.ts`, ejemplos y `wrangler.jsonc`). Gestión del staff por rol en las Server Actions y en `/crm/admin/usuarios`. Script de remapeo de ids de Neon Auth a Clerk. README con la puesta en producción.
  - (F5) El organizador gestiona solo sus viajes (service, actions y páginas de `/crm/viajes`). Script de seed de viajes en `draft`, idempotente por slug, con el organizador como parámetro y sin ejecutar. README.
- No incluye:
  - Clerk Organizations, roles o permisos de Clerk, `publicMetadata`/`privateMetadata`, claims personalizados del token ni `auth.protect()` para autorizar. La autorización sigue en Neon.
  - Invitaciones de Clerk (`clerkClient.invitations`) y envío automático de correos de invitación: se mantiene `staff_invitations` y el enlace que se comparte a mano.
  - Webhooks de Clerk (p. ej. `user.deleted`), sincronizar perfiles con Clerk o importar usuarios y contraseñas de Neon Auth a Clerk.
  - `<UserButton>`/`<UserProfile>` (gestión de la cuenta, cambio de correo, MFA), inicio de sesión social y personalizar la apariencia de los componentes de Clerk (se usa el tema por defecto).
  - Permisos por usuario además de los roles (Pregunta abierta 3).
  - Asignar o cambiar el organizador de un viaje desde el CRM, y que el organizador vea leads o reservas (Preguntas abiertas 5 y 6).
  - Ejecutar el seed, aplicar migraciones o scripts en Neon, crear la aplicación de Clerk, cambiar DNS, cargar secretos en Cloudflare o desplegar. Lo hace el usuario con su autorización (ver "Operación").
  - Borrar o modificar el schema `neon_auth` o desactivar Neon Auth en la consola de Neon.
  - `proxy.ts` (Decisión D2).

## Requisitos
1. **Un solo proveedor de identidad:** Clerk. No queda código, dependencia ni ruta de Neon Auth ni de Better Auth (al cerrar F2).
2. **Identidad:** el id estable es el `userId` de Clerk (`user_…`). Se obtiene con `auth()`, que verifica el token de sesión. El correo solo sirve para aceptar invitaciones, para mostrarse y para vincular reservas del runner. Es el **correo primario** de Clerk, en minúsculas y solo si su `verification.status` es `"verified"`.
3. **Roles en Neon, en cada petición:** igual que hoy (`staff_assignments`, `revoked_at IS NULL`). No se guardan roles en Clerk, cookies, JWT ni cachés entre peticiones. `publicMetadata`, `unsafeMetadata` y los campos extra del usuario de Clerk nunca conceden permisos.
4. **Deniega por defecto y falla cerrado:**
   - sin sesión, o `auth()` falla → 401;
   - `currentUser()` falla → 403;
   - correo primario sin verificar, sin roles, permiso desconocido o error de la base → 403.
   Las respuestas y los logs no incluyen el mensaje original de Clerk ni de la base.
5. **Middleware mínimo:** `clerkMiddleware()` solo hace disponible la sesión para `auth()`. No autoriza, no redirige y no lee la base. Las guardas siguen en cada página, Route Handler y Server Action.
6. **Secretos:** `CLERK_SECRET_KEY` solo en el servidor (Cloudflare Secret, `.env.local`, `.dev.vars`), validada de forma perezosa en la petición y nunca en el build. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` es pública por diseño. Un clon limpio sin claves compila.
7. **Roles:** `commercial | admin | super_admin | organizer`. Matriz en "Diseño técnico".
8. **Gestión de roles desde el CRM:**
   - `super_admin` invita, asigna y revoca `admin`, `organizer` y `commercial`;
   - `admin` solo invita, asigna y revoca `commercial`;
   - nadie invita, asigna ni revoca `super_admin` desde el CRM: solo con los scripts SQL.
   Se comprueba en cada Server Action, no solo en la UI.
9. **Último super admin:** el CRM no puede quitarlo (Requisito 8). `revoke-staff-role.sql` se niega a revocar el último `super_admin` activo. Se mantiene la protección existente del último `admin`.
10. **Alta del super admin:** con el script de bootstrap, por id exacto de Clerk, con motivo y en una transacción (Decisión D6). Nunca por coincidir el correo en tiempo de ejecución ni por ser el primer registro.
11. **Organizador:** gestiona (crea, edita, publica, despublica y archiva) **solo** los viajes con `organizer_id = su user_id`. Un viaje ajeno se comporta como inexistente. `organizer_id` nunca viene del formulario. Comercial, admin y super admin siguen viendo y gestionando todos los viajes.
12. **Seed:** script SQL manual que inserta viajes en `draft`, idempotente por `slug`, con `organizer_id` resuelto desde el correo de un usuario con rol `organizer` activo. No se ejecuta en build, arranque ni setup.
13. **Datos existentes:** los ids de Neon Auth de `production` se migran con un script manual de remapeo (Decisión D8). No se ejecuta nada remoto como parte del desarrollo.

## Criterios de aceptación

### Fase 1: identidad con Clerk
- [ ] (F1) Dado `package.json`, entonces tiene `@clerk/nextjs` `^7.9.22` y `@clerk/localizations` `^4.24.3`, y `npm ci` no muestra conflictos de peer con `next` ni `react`. `@neondatabase/auth` sigue instalado hasta F2.
- [ ] (F1) Dado `middleware.ts` en la raíz, entonces:
  - exporta por defecto `clerkMiddleware()` sin callback;
  - su `config.matcher` es exactamente `["/crm/:path*", "/api/crm/:path*"]`;
  - no exporta `runtime`;
  - no contiene `auth.protect`, roles, redirecciones ni acceso a la base;
  - no existe `proxy.ts`.
- [ ] (F1) Dado `app/layout.tsx`, entonces envuelve `{children}` dentro de `<body>` con `<ClerkProvider localization={esMX}>`, sin la prop `dynamic`.
- [ ] (F1) Dado un clon limpio sin claves de Clerk ni de Neon, cuando ejecuto `npm run lint`, `npx vitest run` y `npm run build`, entonces pasan. El build lista el middleware, `/` y `/cuenta` siguen estáticas (`○`) y las rutas de `/crm` son dinámicas (`ƒ`).
- [ ] (F1) Dada una petición a `GET /api/crm/me`:
  - sin sesión (`auth()` → `userId: null`) → 401 `{ "error": "unauthorized" }` con `Cache-Control: no-store`, sin llamar a `currentUser()` ni a la base;
  - `auth()` lanza → 401 y un único `console.error("auth: session lookup failed")` sin datos;
  - `currentUser()` lanza → 403 sin consultar la base y sin el texto original;
  - `currentUser()` devuelve `null`, o un `id` distinto del `userId` de `auth()` → 401.
- [ ] (F1) Dado un usuario de Clerk cuyo correo **primario** `Ana@Example.COM` está verificado y una invitación pendiente y vigente `commercial` para `ana@example.com`, cuando llama a `GET /api/crm/me`, entonces se llama a la aceptación con `("<userId>", "ana@example.com")` y responde 200 `{ userId, staffRoles: ["commercial"] }`.
- [ ] (F1) Dado un usuario con el correo primario sin verificar (aunque tenga otro correo secundario verificado), o sin correo primario, entonces se llama solo a `loadStaffRoles`, la invitación no se consume y responde 403, incluso con rol `admin`.
- [ ] (F1) Dado un usuario sin roles en Neon cuyo usuario de Clerk trae `publicMetadata: { role: "admin" }` y `unsafeMetadata: { staffRoles: ["admin"] }`, y que envía `role=admin` en query, body y cookie, entonces responde 403.
- [ ] (F1) Dado un staff con rol activo, cuando se revoca entre dos peticiones, entonces la primera responde 200 y la segunda 403.
- [ ] (F1) Dado `/crm/acceso` sin sesión, entonces se ve el `<SignIn>` de Clerk con `routing="hash"`, `withSignUp`, `forceRedirectUrl="/crm"` y `signUpForceRedirectUrl="/crm"`, y debajo el texto "Solo para personas invitadas por un administrador.". Con sesión, la página redirige a `/crm`, como hoy.
- [ ] (F1) Dado `/cuenta`:
  - mientras Clerk carga → `role="status"` "Cargando…";
  - sin sesión → `<SignIn>` con destino `/cuenta` y el texto "Este paso identifica tu acceso al sitio. Todavía no crea un perfil viajero independiente ni te inscribe en un evento.";
  - con sesión → h1 "Qué bueno verte de nuevo.", el correo primario y "Cerrar sesión", que vuelve a `/cuenta`.
- [ ] (F1) Dados `CrmShell` y `NoCrmAccess`, cuando pulso "Cerrar sesión", entonces Clerk cierra la sesión y se navega a `/crm/acceso`. `SignOutButton` mantiene sus props (`redirectTo?: "/crm/acceso" | "/cuenta"`).
- [ ] (F1) Dado `AccessPanel`, entonces no lee la URL ni `searchParams`: el destino sale solo de la audiencia.
- [ ] Manual (usuario; instancia de desarrollo de Clerk y rama Neon de desarrollo): crear la cuenta en `/crm/acceso` con un correo invitado → código de verificación → `/crm` muestra "Comercial". Una cuenta sin invitación ve "sin acceso".

### Fase 2: retirar Neon Auth
- [ ] (F2) Dado `package.json`, entonces no contiene `@neondatabase/auth` ni el bloque `overrides` de `@better-auth/*`, y `npm ls @neondatabase/auth better-auth` no encuentra nada.
- [ ] (F2) Dado el repositorio, cuando busco `@neondatabase/auth|better-auth|authClient|getAuth\(` en `app/`, `lib/` y `modules/`, entonces no hay resultados. Se borraron:
  - `lib/auth/server.ts`, `lib/auth/client.ts` y `app/api/auth/[...path]/route.ts`;
  - `SignInForm`, `SignUpForm`, `VerifyEmailForm`, `ForgotPasswordForm` y `ResetPasswordForm`;
  - `utils/authErrorMessage.ts` y su test.
- [ ] (F2) Dado `modules/accounts/schemas/auth.schema.ts`, entonces solo exporta `emailSchema` y `staff.schema.test.ts` pasa sin cambios. `auth.types.ts` solo exporta `AccessAudience`, `AuthDestination` y `SignOutDestination`.
- [ ] (F2) Dado `GET /api/auth/get-session`, entonces responde 404.
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` pasan. Con `npm run build:worker` + `npx wrangler deploy --dry-run --outdir <scratch>`, sin desplegar, se registra el tamaño gzip del Worker en el resumen de la fase. Si supera 2 MiB, se detiene y se consulta al usuario (límite de Workers Free: 3 MiB).

### Fase 3: roles nuevos, matriz y bootstrap del super admin
- [ ] (F3) Dado el schema, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera una sola migración nueva `drizzle/0006_*.sql` (+ `meta/0006_snapshot.json` y `_journal.json`) con exactamente:
  - `ALTER TYPE "public"."staff_role" ADD VALUE 'super_admin'` y `… ADD VALUE 'organizer'`;
  - `ALTER TABLE "trips" ADD COLUMN "organizer_id" text`;
  - la FK `trips.organizer_id → profiles.user_id` `ON DELETE restrict`;
  - `CREATE INDEX "trips_organizer_idx" ON "trips" ("organizer_id")`.
  El SQL no contiene `DROP`, `neon_auth` ni `CREATE SCHEMA`, y `drizzle.config.ts` no cambia.
- [ ] (F3) Dado `can(roles, permission)`, entonces cumple la matriz de permisos de "Diseño técnico" celda a celda. Roles vacíos o un permiso desconocido → `false`. `admin` y `super_admin` → `true` en todos los permisos.
- [ ] (F3) Dado `manageableRoles(roles)`, entonces:
  - `["super_admin"]` → `["commercial", "organizer", "admin"]`;
  - `["admin"]` → `["commercial"]`;
  - `["admin", "super_admin"]` → `["commercial", "organizer", "admin"]`, sin duplicados y en ese orden;
  - `["commercial"]`, `["organizer"]` y `[]` → `[]`;
  - `super_admin` nunca aparece.
  `canManageRole(roles, role)` equivale a `manageableRoles(roles).includes(role)`.
- [ ] (F3) Dado `staffRoleSchema`, entonces sus opciones son `commercial`, `organizer` y `admin` (los valores del enum menos `super_admin`). `inviteStaffSchema` y `staffRoleChangeSchema` rechazan `super_admin` con `invalid_input`.
- [ ] (F3) Dado `STAFF_ROLE_LABELS`, entonces tiene una etiqueta para cada valor del enum: "Comercial", "Admin", "Super admin" y "Organizador".
- [ ] (F3) Dado un `super_admin`, entonces la cabecera de `CrmShell` muestra "Super admin" y los enlaces "Viajes", "Reservas" y "Usuarios". Dado un `organizer`, muestra "Organizador" y solo "Viajes". `CrmShell` no cambia.
- [ ] (F3) Dado `scripts/sql/bootstrap-admin.sql`:
  - sin `-v role`, se comporta como hoy y asigna `admin`;
  - con `-v role=super_admin`, asigna `super_admin` con `granted_by = NULL` y el `reason` dado;
  - con cualquier otro rol, o con `user_id`, `email` o `reason` vacíos, falla sin cambiar nada;
  - la cabecera indica que el `user_id` se copia del panel de Clerk (Users).
- [ ] (F3) Dado `scripts/sql/revoke-staff-role.sql` con `-v role=super_admin`:
  - si es el último `super_admin` activo, falla con "no se puede revocar el último super_admin" y no cambia nada;
  - si hay otro activo, revoca;
  - bloquea las filas `super_admin` activas (`FOR UPDATE`) antes de contar.
  El resto de roles se revocan como hoy.
- [ ] (F3) Dado `README.md`, entonces documenta la migración `0006` (rama de desarrollo primero, compatibilidad hacia atrás, orden respecto al despliegue) y el alta del super admin `linderhassinger01@gmail.com` con `bootstrap-admin.sql -v role=super_admin`.
- [ ] (F3) `npm run lint`, `npx vitest run` y `npm run build` pasan.

### Fase 4: gestión del staff por rol y puesta en producción
- [ ] (F4) Dado `getEnv()`, entonces:
  - exige `CLERK_SECRET_KEY` con formato `sk_test_…` o `sk_live_…`;
  - ya no lee ni exige `NEON_AUTH_BASE_URL` ni `NEON_AUTH_COOKIE_SECRET`;
  - un error solo nombra los campos;
  - importar el módulo no valida nada.
- [ ] (F4) Dados `.env.example` y `.dev.vars.example`, entonces declaran `CLERK_SECRET_KEY=` (y `.env.example` también `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=`) sin valores, y no mencionan Neon Auth.
- [ ] (F4) Dado `wrangler.jsonc`, entonces `vars` contiene `APP_ORIGIN` y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` con la clave `pk_live_…` que facilita el usuario (Pregunta abierta 9). No contiene ningún secreto.
- [ ] (F4) Dado `npm run build:worker` con las dos claves en `.env.local`, entonces `.open-next/cloudflare/next-env.mjs` no contiene `CLERK_SECRET_KEY` y conserva `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. `scripts/strip-env-secrets.mjs` no cambia.
- [ ] (F4) Dadas las Server Actions de administración llamadas directamente con `FormData`:
  - `admin` invita `commercial` → `success`; invita `organizer` o `admin` → `forbidden`, sin llamar al service;
  - `super_admin` invita `commercial`, `organizer` y `admin` → `success`;
  - cualquiera que invite `super_admin` → `invalid_input`;
  - `grantStaffRoleAction` y `revokeStaffRoleAction` aplican la misma regla por rol con `canManageRole`;
  - `commercial` y `organizer` → `forbidden` en todas;
  - sin sesión → `unauthorized`.
- [ ] (F4) Dada una invitación pendiente `admin`, cuando un `admin` llama a `revokeInvitationAction` con su id, entonces devuelve `not_found` y no cambia nada: el service filtra por `role = ANY(<roles gestionables del actor>)`. Un `super_admin` sí la revoca.
- [ ] (F4) Dado un `super_admin` en `/crm/admin/usuarios`, entonces:
  - el selector "Rol" ofrece "Comercial" (por defecto), "Organizador" y "Admin";
  - en "Equipo activo", cada fila ofrece "Asignar <Rol>" para los roles gestionables que le faltan y "Revocar <Rol>" para sus roles gestionables activos;
  - el rol "Super admin" se muestra como `Badge`, sin botones.
- [ ] (F4) Dado un `admin` en `/crm/admin/usuarios`, entonces:
  - el selector solo ofrece "Comercial";
  - solo hay botones para el rol `commercial`; los badges de los demás roles se muestran sin acciones;
  - en "Invitaciones pendientes", las invitaciones `admin` u `organizer` no tienen "Revocar".
- [ ] (F4) Dado `scripts/sql/remap-user-id.sql` con `-v old_user_id=… -v new_user_id=…`, entonces, en una transacción:
  - falla si alguno está vacío, si son iguales, si `old_user_id` no tiene perfil o si `new_user_id` ya tiene perfil;
  - crea el perfil nuevo con el correo del antiguo;
  - actualiza **todas** las columnas con FK a `profiles(user_id)`, descubiertas en `pg_constraint`, y `bookings.runner_user_id`;
  - borra el perfil antiguo;
  - muestra cuántas filas cambió por columna.
- [ ] (F4) Dado `README.md`, entonces documenta:
  - el modelo de acceso con Clerk, los ajustes de Clerk y las variables (tabla);
  - el runbook de puesta en producción y la vuelta atrás;
  - el remapeo de la cuenta admin existente;
  - el checklist manual;
  - que los `user_id` de "Desvincular o reasignar una reserva" se copian de Clerk.
  Ya no describe Neon Auth como proveedor.
- [ ] (F4) `npm run lint`, `npx vitest run` y `npm run build` pasan.

### Fase 5: el organizador gestiona sus viajes y seed
- [ ] (F5) Dado un `organizer` con un viaje propio A y un viaje ajeno B:
  - `/crm/viajes` solo lista A;
  - `/crm/viajes/<id de B>` responde 404;
  - editar B por la acción → `not_found`;
  - publicar, despublicar o archivar B → `invalid_transition`;
  - sobre A, todo funciona como hoy.
- [ ] (F5) Dado un `organizer` que crea un viaje, entonces se guarda con `organizer_id = <su user_id>` y estado `draft`. Si el `FormData` trae `organizerId`, se ignora. Dado un `commercial`, `admin` o `super_admin` que crea un viaje, entonces `organizer_id = NULL`, y esos roles ven y gestionan todos los viajes, A y B incluidos.
- [ ] (F5) Dadas `/crm/reservas` y `/crm/reservas/nueva` con un `commercial`, entonces siguen listando todos los viajes, como hoy.
- [ ] (F5) Dado un viaje de un organizador publicado, entonces aparece en `/viajes/<slug>`: la lectura pública no cambia.
- [ ] (F5) Dado `scripts/sql/seed-trips.sql`:
  - exige `-v organizer_email`;
  - falla sin cambiar nada si no hay exactamente un perfil con ese correo (en minúsculas) y rol `organizer` activo;
  - inserta los viajes del seed con `status = 'draft'` y ese `organizer_id`, con `ON CONFLICT (slug) DO NOTHING`, y devuelve solo las filas insertadas (repetirlo devuelve 0 filas);
  - no modifica viajes existentes.
  No lo invoca ningún script de `package.json`, build ni arranque.
- [ ] (F5) Dado `README.md`, entonces documenta el rol organizador y el seed como pendiente de ejecutar: primero en una rama de desarrollo y en `production` solo con autorización.
- [ ] (F5) `npm run lint`, `npx vitest run` y `npm run build` pasan. Se registra el tamaño gzip del Worker; si supera 2 MiB, se consulta al usuario.

### Manual (usuario, con su autorización; primero instancia de desarrollo de Clerk + rama Neon de desarrollo)
- [ ] Aplicar `0006`: el volcado del schema `neon_auth` es idéntico antes y después.
- [ ] Bootstrap del super admin por id de Clerk → `/crm` muestra "Super admin" y "Usuarios".
- [ ] El super admin invita a un `admin` y a un `organizer`; cada uno crea su cuenta con el correo invitado y la verifica con código → ven "Admin" y "Organizador".
- [ ] El admin solo puede invitar "Comercial" y no ve acciones sobre admins ni organizadores.
- [ ] El organizador crea un viaje, lo ve en `/crm/viajes`, y no ve los viajes ajenos.
- [ ] `revoke-staff-role.sql` sobre el único super admin falla.
- [ ] El admin existente de Neon Auth crea su cuenta en Clerk → `remap-user-id.sql` → `/crm` muestra "Admin" y sus leads y viajes conservan la autoría.
- [ ] Un runner se registra en `/cuenta`, ve su correo y cierra sesión; en `/crm` ve "sin acceso".

## Diseño técnico

### Decisiones y fuentes
Las fuentes oficiales se leyeron en los paquetes publicados en npm. Desde este entorno **no se pudo acceder a `clerk.com` ni a `opennext.js.org`** (bloqueados por la red de la sesión): conviene que el usuario revise los enlaces de Clerk citados.

- **D1. Compatibilidad de versiones.** `@clerk/nextjs@7.9.22` (Clerk Core 3) declara `peerDependencies` `next: "…|| ^16.0.10 || ^16.1.0-0"` y `react: "…|| ~19.2.3 …"`, compatibles con `next ^16.4.2` y `react 19.2.8`. En Core 3, `<SignedIn>`/`<SignedOut>`/`<Protect>` se eliminaron y lanzan un error: se usa `<Show when="signed-in">` o los hooks (`node_modules/@clerk/nextjs/dist/types/removedControlComponents.d.ts`; https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3). Esta spec no usa ninguno de esos componentes.
- **D2. `middleware.ts` (Edge), no `proxy.ts` (Node).**
  - **Next 16:**
    - `middleware` está obsoleto y se renombra a `proxy`;
    - "The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured. If you want to continue using the `edge` runtime, keep using `middleware`" (`next@16.4.3` `dist/docs/01-app/02-guides/upgrading/version-16.md` §"middleware to proxy"; `dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` §Runtime);
    - el build envía `proxy` al servidor Node y `middleware` sin `runtime: "nodejs"` al servidor Edge (`dist/build/entries.js`, `runDependingOnPageType`).
  - **OpenNext Cloudflare** (`@opennextjs/cloudflare@1.20.14`):
    - el middleware Node (`proxy.ts`) se empaqueta para Workers, pero avisa: "Node.js middleware support is experimental in cloudflare, and not officially maintained by OpenNext maintainers. Use at your own risk." (`dist/cli/build/build.js`; `dist/cli/build/open-next/bundle-node-middleware.js`);
    - el middleware Edge es la vía soportada.
  - **Clerk:** `auth()` "Requires `clerkMiddleware()` to be configured" y, sin él, lanza "auth() was called but Clerk can't detect usage of clerkMiddleware()". Con Next ≥ 16, acepta "middleware or proxy" (`dist/types/app-router/server/auth.d.ts`, `dist/esm/server/errors.js`, `dist/esm/utils/sdk-versions.js`; https://clerk.com/docs/reference/nextjs/clerk-middleware).
  - **Riesgos:**
    - `middleware` está obsoleto en Next 16 (aviso en el build) y podría desaparecer en una versión mayor;
    - el middleware Edge debe leer `CLERK_SECRET_KEY` del entorno del Worker. Se comprueba con `npm run preview` antes de desplegar (Operación, paso 6).
  - **Alternativa** si OpenNext deja de soportar el middleware Edge o falla la lectura del secreto: `proxy.ts` con el mismo contenido (soporte experimental de OpenNext), aprobado por el usuario y medido con `preview`. Si tampoco funciona, el bloqueo se lleva al usuario antes de desplegar.
- **D3. `matcher` mínimo.** Solo `/crm/:path*` (incluye `/crm` y `/crm/acceso`) y `/api/crm/:path*`: son las únicas rutas que llaman a las guardas. Las Server Actions del CRM hacen `POST` a su página bajo `/crm`.
  - La landing (`/`, `/viajes/*`, `/contacto`), `/cuenta` (solo usa componentes de cliente de Clerk), `/api/health` y `/api/automation/*` no pasan por Clerk. Así no gastan CPU del plan Free (10 ms por petición) ni amplían superficie.
  - **Regla:** toda ruta nueva que llame a las guardas se añade al `matcher`. Si no, `auth()` lanza y la guarda responde 401: falla cerrado, no abre nada. `runner-portal.md` F5 tendrá que añadir `/mis-carreras`.
- **D4. Identidad en las guardas.** `getCurrentUser` (sigue con `cache()`):
  1. `const { userId } = await auth()`. Con token válido, verifica el JWT de sesión sin consultar la base. Si lanza: `console.error("auth: session lookup failed")` y `null` (401). Las sesiones pendientes se tratan como sin sesión (valor por defecto de Clerk).
  2. `const user = await currentUser()`: `GET /v1/users/{user_id}` del Backend API de Clerk, deduplicado por petición y sujeto a su límite de peticiones (`dist/types/app-router/server/currentUser.d.ts`; https://clerk.com/docs/guides/how-clerk-works/system-limits). Si lanza: `console.error("auth: user lookup failed")` y `ForbiddenError` sin `cause`. Así no hay bucle entre `/crm/acceso` y `/crm`. Si devuelve `null`: `null`.
  3. Valida con zod una forma mínima: `id` (1–255) igual a `userId`, `primaryEmailAddressId: string | null` y `emailAddresses: { id, emailAddress, verification: { status } | null }[]`. Si no pasa, `null`.
  4. Toma el correo primario por `primaryEmailAddressId`: `email = emailAddress.trim().toLowerCase()` y `emailVerified = verification?.status === "verified"`. Sin correo primario: `email = ""` y `emailVerified = false`. Fuente: `@clerk/backend@3.26.4` `dist/api/resources/User.d.ts` y `EmailAddress.d.ts`; https://clerk.com/docs/reference/backend/types/backend-user.
  5. El resto no cambia: aceptación de la invitación si el correo está verificado, roles de Neon y errores de la base → `ForbiddenError`.

  **Coste aceptado:** una llamada al Backend API por petición del CRM. El tráfico del CRM es bajo. Si se acercara al límite, la alternativa es incluir el correo en un claim del token de sesión (otra spec).
- **D5. UI con componentes de Clerk.**
  - `AccessPanel` pasa a ser un Server Component que renderiza `<SignIn routing="hash" withSignUp forceRedirectUrl={destino} signUpForceRedirectUrl={destino} />`. Fuente: tipos `SignInProps` de `@clerk/shared@4.43.0` (`dist/types/clerk.d.ts`).
    - `routing="hash"` evita rutas catch-all (`[[...sign-in]]`) y variables `NEXT_PUBLIC_CLERK_SIGN_IN_URL`.
    - `withSignUp` une entrar y crear cuenta en un solo flujo, para invitados y runners.
  - La recuperación de contraseña y el código de verificación los da el propio `<SignIn>`. Por eso se borran los cinco formularios propios, `authErrorMessage` y los schemas de contraseña y código.
  - `SignOutButton` envuelve el `<Button variant="outline">` de shadcn con `<SignOutButton redirectUrl={redirectTo}>` de Clerk. Se pierde el mensaje propio "No se pudo cerrar sesión.": el error lo gestiona Clerk.
  - `RunnerAccount` sigue siendo de cliente porque `/cuenta` es estática: usa `useUser()`.
  - Textos de Clerk en español con `esMX` de `@clerk/localizations` (Pregunta abierta 8).
- **D6. Alta del super admin: script SQL por id exacto (recomendado).** Se comparan tres opciones:
  - **(a) Conceder `super_admin` en código cuando el correo primario verificado coincida.** Se descarta: deja en el runtime una vía permanente de escalada de privilegios atada a un identificador mutable (el correo). Tras una revocación volvería a conceder el rol en la siguiente petición. Contradice la foundation: "el primer administrador se asigna mediante procedimiento manual auditado por ID exacto".
  - **(b) Invitación precargada por SQL.** No exige conocer el id, pero liga el privilegio máximo al correo, no deja motivo auditado y obliga a que `invited_by` admita `NULL`.
  - **(c, elegida) `bootstrap-admin.sql -v role=super_admin`.** Mismo patrón ya probado que el primer admin: id exacto copiado del panel de Clerk, motivo obligatorio, una transacción, `granted_by = NULL` como marca de script y sin código nuevo en tiempo de ejecución.

  Flujo: Linder crea su cuenta en `/crm/acceso` con `linderhassinger01@gmail.com` y la verifica (ve "sin acceso"). El usuario copia su `user_…` en Clerk → Users y ejecuta el script. En la siguiente petición, Linder es super admin.
- **D7. Gestión de roles.** `can()` decide qué puede hacer cada rol. Qué roles puede gestionar cada actor lo decide `manageableRoles()`/`canManageRole()`, una tabla aparte en `lib/auth/permissions.ts` (única fuente de verdad):
  - `staff.manage` (admin y super_admin) da acceso a `/crm/admin/usuarios`;
  - `canManageRole` limita qué rol se invita, asigna o revoca;
  - `super_admin` no es gestionable desde el CRM, así que el último nunca se pierde por el CRM (Requisito 9);
  - la gestión es por rol: un `admin` puede quitar el rol `commercial` a cualquiera que lo tenga, aunque esa persona también sea admin;
  - se mantienen la protección del último `admin` en `revokeStaffRole` (comportamiento existente) y `StaffActionState` sin cambios.
- **D8. Datos existentes de Neon Auth.** En `production` hay `profiles` y `staff_assignments` con ids de Neon Auth (el usuario es `admin`). También puede haber autoría en `trips`, `leads`, `lead_activities`, `bookings`, `booking_payments`, `trip_updates` y `automation_event_redrives`. Con Clerk esos ids ya no los emite nadie.
  - Recomendado: **`remap-user-id.sql`**, por persona y después de que cree su cuenta en Clerk. Descubre las FK hacia `profiles(user_id)` en `pg_constraint`, así resiste columnas nuevas de otras ramas. Conserva roles y autoría. Las FK son `ON DELETE/UPDATE restrict`, así que no se hace `UPDATE` de la PK, sino insertar el perfil nuevo, mover las referencias y borrar el antiguo.
  - Alternativa sin script: el super admin vuelve a invitar a cada persona. Los perfiles antiguos quedan como histórico inaccesible. Habría que revocar a mano sus asignaciones con `revoke-staff-role.sql` para que no cuenten en la protección del último admin.
  - Las invitaciones pendientes de la etapa Neon Auth siguen siendo válidas: van por correo.
  - Las filas de `lead_activities` se tratan como solo de inserción. El remapeo cambia el `actor_user_id` de esa persona porque es la misma identidad; queda documentado.
- **D9. Clave publicable.**
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` se incrusta en el build: las páginas estáticas (`/`, `/cuenta`) generan las etiquetas `<script>` de Clerk en build. Sin la clave, `ClerkScripts` no renderiza nada y el build no falla (`@clerk/nextjs` `dist/esm/app-router/client/ClerkScripts.js`).
  - Por eso: como **variable de build** de Workers Builds y en `.env.local` para `build:worker`; y en `vars` de `wrangler.jsonc`, igual que `APP_ORIGIN`, para lecturas en tiempo de ejecución. Es pública por diseño.
  - `CLERK_SECRET_KEY` solo como Cloudflare **Secret**. `@clerk/nextjs` la lee de `process.env` (`dist/esm/server/constants.js`).
  - `strip-env-secrets.mjs` ya elimina todo lo que no es `NEXT_PUBLIC_*`.
  - Fuera de desarrollo no hay modo "keyless" (`dist/esm/utils/feature-flags.js`).
- **D10. `ClerkProvider` en el layout raíz** (ubicación documentada por Clerk). Sin `dynamic`, no fuerza el renderizado dinámico (`dist/types/types.d.ts`: "`dynamic` … @default false"). Coste: el script de Clerk se carga también en la landing (Pregunta abierta 12).
- **D11. `organizer_id` y alcance de viajes.**
  - `trips.organizer_id` es `text` nulo, con FK a `profiles(user_id)` `on delete restrict` e índice.
  - `tripScopeFor(user)` devuelve `{ kind: "all" }` si `can(roles, "trips.manage_all")` y, si no, `{ kind: "own", organizerId: user.id }`.
  - El service exige el alcance en **todas** las lecturas y escrituras del CRM: el parámetro es obligatorio, nunca `all` por defecto.
  - Un viaje ajeno se trata como inexistente, para no revelar si existe.
  - `editableColumns` no incluye `organizerId`: el formulario nunca lo fija.
- **D12. Migración `0006`.** `ALTER TYPE … ADD VALUE` puede ir dentro de una transacción (PostgreSQL ≥ 12), siempre que el valor nuevo no se use en ella (https://www.postgresql.org/docs/current/sql-altertype.html). La `0006` no lo usa.
  - **Compatible hacia atrás:** el código anterior ignora la columna nueva y trata un rol desconocido como sin permisos. Se puede aplicar antes del despliegue y permite volver atrás.
  - **Debe aplicarse antes de desplegar F3:** Drizzle selecciona `organizer_id` en `listTrips`/`getTripById`.

### Rutas (`app/`) y raíz
| Archivo | Fase | Tipo | Cambio |
|---|---|---|---|
| `middleware.ts` | F1 | nuevo | `export default clerkMiddleware();` y `export const config = { matcher: ["/crm/:path*", "/api/crm/:path*"] };`, con un comentario que remite a D3 |
| `app/layout.tsx` | F1 | existente | `<body><ClerkProvider localization={esMX}>{children}</ClerkProvider></body>` (`import { esMX } from "@clerk/localizations"`) |
| `app/api/crm/me/route.ts` | F1 | existente | Solo el comentario: "Identity comes from Clerk; roles only from the database." |
| `app/api/auth/[...path]/route.ts` | F2 | borrar | Handler de Neon Auth |
| `app/crm/(protected)/admin/usuarios/page.tsx` | F4 | existente | Calcula `const roles = manageableRoles(access.user.staffRoles)` y lo pasa a `InviteStaffForm`, `StaffTable` e `InvitationsTable`. El resto no cambia |
| `app/crm/(protected)/viajes/page.tsx` | F5 | existente | `listTrips(tripScopeFor(access.user))` |
| `app/crm/(protected)/viajes/[id]/page.tsx` | F5 | existente | `getTripById(id, tripScopeFor(access.user))`; `null` → `notFound()` (también para ajenos) |
| `app/crm/(protected)/reservas/page.tsx` y `reservas/nueva/page.tsx` | F5 | existentes | `listTrips(tripScopeFor(access.user))` (para `bookings.manage` el alcance siempre es `all`) |

Sin cambios: `app/crm/acceso/page.tsx`, `app/cuenta/page.tsx`, `app/crm/(protected)/layout.tsx`, `app/crm/(protected)/page.tsx`, `viajes/nuevo/page.tsx` y `next.config.ts`.

### `lib/`
- `lib/auth/guards.ts` (F1): `readSessionUser` sigue el flujo de D4. Se elimina el import de `@/lib/auth/server`. `CurrentUser` y las firmas públicas no cambian.
- `lib/auth/server.ts` y `lib/auth/client.ts` (F2): se borran.
- `lib/env.ts` (F4): el schema queda en `DATABASE_URL`, `CLERK_SECRET_KEY` (`z.string().regex(/^sk_(test|live)_\S+$/)`) y `APP_ORIGIN` (sin cambios). `getAutomationApiToken` no cambia. La clave publicable no se valida aquí: la consume Clerk (D9).
- `lib/db-schema.ts` (F3):
  - `staffRoleEnum = pgEnum("staff_role", ["commercial", "admin", "super_admin", "organizer"])`: los valores nuevos se añaden al final;
  - en `trips`: `organizerId: text("organizer_id").references(() => profiles.userId, { onDelete: "restrict" })` e `index("trips_organizer_idx").on(table.organizerId)`;
  - el comentario de `profiles` cambia "Neon Auth id" por "Clerk user id";
  - lo mismo en `bookings.runner_user_id`.
- `lib/auth/permissions.ts` (F3):

  ```ts
  export type StaffRole = (typeof staffRoleEnum.enumValues)[number]; // "commercial" | "admin" | "super_admin" | "organizer"
  export type Permission =
    | "crm.access" | "staff.manage" | "trips.manage" | "trips.manage_all" | "leads.manage" | "bookings.manage";
  export function can(roles: readonly StaffRole[], permission: Permission): boolean; // admin y super_admin ⇒ true
  export function manageableRoles(roles: readonly StaffRole[]): StaffRole[];          // orden: commercial, organizer, admin
  export function canManageRole(roles: readonly StaffRole[], role: StaffRole): boolean;
  ```

  Matriz de permisos (✓ = `true`):

  | Permiso | commercial | organizer | admin | super_admin |
  |---|---|---|---|---|
  | `crm.access` | ✓ | ✓ | ✓ | ✓ |
  | `staff.manage` | – | – | ✓ | ✓ |
  | `trips.manage` | ✓ | ✓ (alcance propio, D11) | ✓ | ✓ |
  | `trips.manage_all` | ✓ | – | ✓ | ✓ |
  | `leads.manage` | ✓ | – | ✓ | ✓ |
  | `bookings.manage` | ✓ | – | ✓ | ✓ |

  Roles gestionables desde el CRM:

  | Actor | Puede invitar, asignar y revocar |
  |---|---|
  | `super_admin` | `commercial`, `organizer`, `admin` |
  | `admin` | `commercial` |
  | `commercial`, `organizer` | — |
  | (cualquiera) | nunca `super_admin` |

  Con varios roles, se usa la unión.

### Módulo `modules/accounts/`
| Archivo | Fase | Tipo | Cambio |
|---|---|---|---|
| `components/AccessPanel.tsx` | F1 | existente (reescribir) | Server Component (sin `"use client"`). Props `{ audience?: AccessAudience }` (por defecto `"staff"`). `AUDIENCE_CONFIG`: `staff` → `/crm` + "Solo para personas invitadas por un administrador."; `runner` → `/cuenta` + el texto runner actual. Renderiza `<SignIn routing="hash" withSignUp forceRedirectUrl signUpForceRedirectUrl />` y el aviso en `<p className="text-sm text-muted-foreground">`. Ya no usa `Card` ni pasos |
| `components/AccessPanel.test.tsx` | F1 | existente (reescribir) | Ver Tests |
| `components/RunnerAccount.tsx` | F1 | existente | `"use client"` (`/cuenta` es estática): `useUser()` de `@clerk/nextjs`. `!isLoaded` → "Cargando…"; `!isSignedIn` → `<AccessPanel audience="runner" />`; con sesión → h1, `user.primaryEmailAddress?.emailAddress` y `<SignOutButton redirectTo="/cuenta" />` |
| `components/RunnerAccount.test.tsx` | F1 | existente (reescribir) | Ver Tests |
| `components/SignOutButton.tsx` | F1 | existente | Sin `"use client"`: `<ClerkSignOutButton redirectUrl={redirectTo}><Button variant="outline">Cerrar sesión</Button></ClerkSignOutButton>` (`import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs"`). Props sin cambios |
| `components/{SignIn,SignUp,VerifyEmail,ForgotPassword,ResetPassword}Form.tsx` | F2 | borrar | Sustituidos por `<SignIn>` |
| `utils/authErrorMessage.ts` y su test | F2 | borrar | Errores de Better Auth |
| `schemas/auth.schema.ts` y su test | F2 | existente | Solo queda `emailSchema` (y sus casos de test) |
| `types/auth.types.ts` | F2 | existente | Solo quedan `AccessAudience`, `AuthDestination` y `SignOutDestination` |
| `schemas/staff.schema.ts` | F3 | existente | `staffRoleSchema = z.enum(["commercial", "organizer", "admin"])`. Comentario: "staff_role enum values minus super_admin, which is never managed from the CRM" |
| `schemas/staff.schema.test.ts` | F3 | existente | La comprobación de sincronía pasa a "opciones = `staffRoleEnum.enumValues` sin `super_admin`" (sin depender del orden). Casos nuevos: `organizer` aceptado; `super_admin` rechazado en `inviteStaffSchema` y `staffRoleChangeSchema` |
| `utils/staffDisplay.ts` y su test | F3 | existentes | Etiquetas `super_admin: "Super admin"` y `organizer: "Organizador"`. El test comprueba una etiqueta por cada `staffRoleEnum.enumValues` |
| `services/staff.service.ts` | F4 | existente | `revokeInvitation(invitationId, actorUserId, roles: readonly StaffRole[])` añade `inArray(staffInvitations.role, roles)`; con `roles` vacío devuelve `false` sin consultar. El resto no cambia |
| `actions/staff.actions.ts` | F4 | existente | Orden: `requirePermission("staff.manage")` → `safeParse` → **`canManageRole(actor.staffRoles, input.role)`**, si no `forbidden` sin llamar al service (invitar, asignar y revocar rol) → service. `revokeInvitationAction` pasa `manageableRoles(actor.staffRoles)` al service. Mensajes y `StaffActionState` sin cambios |
| `components/InviteStaffForm.tsx` | F4 | existente | Nueva prop `roles: readonly StaffRole[]` (`import type`). Las opciones del `NativeSelect` salen de `roles`; el valor por defecto es `roles[0]` |
| `components/StaffTable.tsx` | F4 | existente | Nueva prop `manageableRoles: readonly StaffRole[]`. "Asignar <Rol>" solo para gestionables que faltan; "Revocar <Rol>" solo para gestionables activos; `Badge` para todos los activos |
| `components/InvitationsTable.tsx` | F4 | existente | Nueva prop `manageableRoles`. "Revocar" solo si `manageableRoles.includes(invitation.role)` |

Sin cambios: `index.ts`, `CrmShell.tsx`, `NoCrmAccess.tsx`, `utils/crmAccess.ts`, `types/staff.types.ts` y `components/shared/ConfirmActionButton.tsx`.

### Módulo `modules/trips/` (F5)
| Archivo | Tipo | Cambio |
|---|---|---|
| `types/trips.types.ts` | existente | `export type TripScope = { kind: "all" } \| { kind: "own"; organizerId: string };` |
| `utils/tripScope.ts` | nuevo (no existe ninguna utilidad de alcance por usuario; es de un solo dominio) | `import "server-only"`. `tripScopeFor(user: { id: string; staffRoles: readonly StaffRole[] }): TripScope` según D11 |
| `utils/tripScope.test.ts` | nuevo | Ver Tests |
| `services/trips.service.ts` | existente | El alcance es obligatorio en `listTrips(scope)`, `getTripById(id, scope)`, `createTrip(input, scope)`, `updateTrip(id, input, scope)` y `setTripStatus(id, status, scope)`. `own` añade `eq(trips.organizerId, organizerId)` al `WHERE` (también al `UPDATE` y al `SELECT` explicativo de `updateTrip`). `createTrip` guarda `organizerId` = `organizerId` (`own`) o `null` (`all`). Las lecturas públicas no cambian |
| `actions/trips.actions.ts` | existente | `runTripAction` usa el usuario que devuelve `requirePermission("trips.manage")` y pasa `tripScopeFor(user)` a `mutate`. Códigos y mensajes sin cambios (ajeno: `not_found` al editar, `invalid_transition` al cambiar de estado) |
| `index.ts` | existente | Exporta `tripScopeFor` y el tipo `TripScope` |

### Base de datos (F3)
Una migración `0006` (ver criterios de F3). No cambian `staff_invitations` ni `profiles` (solo comentarios).

### Scripts manuales (`scripts/sql/`, psql, `\set ON_ERROR_STOP on`, una transacción, credencial `DATABASE_MIGRATION_URL`)
- `bootstrap-admin.sql` (F3, modificar):
  - `-v role` opcional (`\if :{?role}`; por defecto `admin`). Se valida en el bloque `DO`, solo `admin` o `super_admin`;
  - el `INSERT` usa `(:'role')::staff_role`;
  - cabecera: Clerk → Users → `user_…`, correo primario verificado y el ejemplo con `linderhassinger01@gmail.com` y `-v role=super_admin`.
- `revoke-staff-role.sql` (F3, modificar): si `role = 'super_admin'`, primero `PERFORM … FROM staff_assignments WHERE role = 'super_admin' AND revoked_at IS NULL FOR UPDATE`. Si el conteo es ≤ 1 y el objetivo es activo, `RAISE EXCEPTION 'revoke-staff-role: no se puede revocar el último super_admin'`.
- `remap-user-id.sql` (F4, nuevo): ver criterio F4. Cabecera:
  - requisitos (la cuenta de Clerk existe con el mismo correo verificado; el `new_user_id` se copia de Clerk y el `old_user_id` de `SELECT user_id FROM profiles WHERE email = …`);
  - aviso de ejecutarlo primero en una rama de desarrollo;
  - no toca `neon_auth`.
- `seed-trips.sql` (F5, nuevo). Cabecera "NO EJECUTAR hasta que exista el organizador; primero en una rama de desarrollo". `-v organizer_email` obligatorio. Datos:
  - **`maraton-santiago-2027`** (textos literales de `modules/landing/utils/trips.ts` antes de 51ceec6, más `TRIPS` actual):
    - `title` "Maratón de Santiago 2027"; `city` "Santiago"; `country` "Chile"; `race_date` 2027-05-16; `start_date`/`end_date` NULL;
    - `distances` {42K}; `capacity` 100;
    - `summary` "Viaje grupal desde Lima para correr los 42K de la Maratón de Santiago: vuelos, 3 noches en hotel 4 estrellas, inscripción, desayuno y traslados.";
    - `includes`: los 9 elementos "Título: texto" (Inscripción, Vuelos ida y vuelta, 3 noches de alojamiento, Desayuno, Traslados de aeropuerto, Expo en grupo, Camino a la partida, Seguro médico de viaje, Tarjeta de metro);
    - `excludes`: los 2 elementos;
    - `price_usd` 1499; `installments_price_usd` 1799; `deposit_usd` 300; `companion_price_usd` 1300;
    - `payment_terms`: `paymentNote` + línea "Acompañante: " + `companionNote`;
    - `notes`: los 2 párrafos de `pendingDetails`;
    - `image_url` `https://carreras-viajeras.mentec.dev/images/cover-santiago.webp`; `official_url` `https://maratondesantiago.cl/`.
  - **Resto de carreras:** sin datos en el repo (fecha, distancias y resumen obligatorios); ver Pregunta abierta 1. Cuando lleguen, se añaden con estas imágenes:

    | Slug | Imagen |
    |---|---|
    | `maraton-rio-2027` | `/images/carrera-rio.jpeg` |
    | `maraton-roma-2027` | `/images/carrera-roma.jpeg` |
    | (por definir) | `carrera-medellin.jpeg`, `carrera-buenosaires.jpeg`, `carrera-esp.jpeg`, `carrera-us.jpeg` |

    Los slugs de Río y Roma son los que enlaza la portada (`DestinationsSection`). Las imágenes van con URL `https://carreras-viajeras.mentec.dev/images/…`.

### Configuración y entorno
| Archivo | Fase | Cambio |
|---|---|---|
| `package.json` / `package-lock.json` | F1 | `npm install @clerk/nextjs@^7.9.22 @clerk/localizations@^4.24.3` |
| `package.json` / `package-lock.json` | F2 | `npm uninstall @neondatabase/auth` y se borra el bloque `overrides` (`@better-auth/*`) |
| `.env.example` | F4 | Quita `NEON_AUTH_*`; añade `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=` (pública; en el build) y `CLERK_SECRET_KEY=` (solo servidor; Cloudflare Secret) con comentarios |
| `.dev.vars.example` | F4 | Quita `NEON_AUTH_*`; añade `CLERK_SECRET_KEY=` |
| `wrangler.jsonc` | F4 | `vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "<pk_live_… del usuario>"` |

Antes de F4, quien desarrolle añade a su `.env.local` las dos claves de una instancia de desarrollo de Clerk (precondición de F1). Mientras tanto, `getEnv()` sigue exigiendo las variables `NEON_AUTH_*`, aunque ya no se usan desde F2.

### Contrato
```ts
// GET /api/crm/me (sin cambios de forma)
type CrmMeResponse = { userId: string /* id de Clerk */; staffRoles: ("commercial" | "admin" | "super_admin" | "organizer")[] };
type AuthErrorBody = { error: "unauthorized" } /* 401 */ | { error: "forbidden" } /* 403 */;

// lib/auth/guards.ts (sin cambios de firma)
type CurrentUser = { id: string; email: string; emailVerified: boolean; staffRoles: StaffRole[] };

// Server Actions de staff: misma entrada FormData y mismo StaffActionState.
// role ∈ "commercial" | "organizer" | "admin"; "super_admin" → invalid_input; rol no gestionable por el actor → forbidden.

// modules/trips
type TripScope = { kind: "all" } | { kind: "own"; organizerId: string };
listTrips(scope: TripScope): Promise<Trip[]>;
getTripById(id: string, scope: TripScope): Promise<Trip | null>;
createTrip(input: TripInput, scope: TripScope): Promise<{ id: string } | "slug_taken">;
updateTrip(id: string, input: TripInput, scope: TripScope): Promise<"updated" | "not_found" | "archived" | "slug_locked" | "slug_taken">;
setTripStatus(id: string, status: TripStatus, scope: TripScope): Promise<"changed" | "invalid_transition">;

// Componentes (F4)
InviteStaffForm: { roles: readonly StaffRole[] }
StaffTable: { staff: StaffMember[]; manageableRoles: readonly StaffRole[] }
InvitationsTable: { invitations: PendingInvitation[]; manageableRoles: readonly StaffRole[] }
```

```sh
# Scripts (los ejecuta el usuario)
psql "$DATABASE_MIGRATION_URL" -v user_id='user_…' -v email='linderhassinger01@gmail.com' \
  -v reason='<operador>: alta del super admin' -v role=super_admin -f scripts/sql/bootstrap-admin.sql
psql "$DATABASE_MIGRATION_URL" -v old_user_id='<id Neon Auth>' -v new_user_id='user_…' -f scripts/sql/remap-user-id.sql
psql "$DATABASE_MIGRATION_URL" -v organizer_email='<correo del organizador>' -f scripts/sql/seed-trips.sql
```

## Operación (la realiza el usuario; ningún agente)
**Integración.** Las fases F1–F4 cambian el proveedor de identidad. Si `main` se despliega con Workers Builds, F1–F4 se mergean juntas y solo después de los pasos 1–5. Si no, el sitio quedaría sin login o con `/crm/viajes` fallando por la columna `organizer_id`. F5 puede mergearse después: no necesita otra migración.

Runbook de puesta en producción, que documenta el README en F4:
1. **Clerk** (panel), con autorización:
   - aplicación "Carreras Viajeras", con instancia de desarrollo para localhost e instancia de producción para `carreras-viajeras.mentec.dev`. La de producción exige registros DNS en `mentec.dev`, un cambio de DNS que requiere aprobación explícita;
   - "Email address" obligatorio con **verificación al registrarse por código**; contraseña ON; registro público ON (runners e invitados);
   - sin proveedores sociales (Pregunta abierta 7), sin Organizations y sin claims personalizados.
2. **Cloudflare:**
   - Secret `CLERK_SECRET_KEY` (`sk_live_…`);
   - variable de build `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` en Workers Builds;
   - `pk_live_…` en `wrangler.jsonc` (F4).
3. **Neon:** aplicar `0006`, primero en una rama de desarrollo y después en `production`, y comprobar que `neon_auth` no cambia.
4. **Despliegue** (con aprobación: `npm run deploy` o merge con Workers Builds).
5. **Super admin:** Linder crea su cuenta en `/crm/acceso` y la verifica; el usuario ejecuta `bootstrap-admin.sql -v role=super_admin` con su `user_…`.
6. **Smoke previo**, antes del paso 4: `npm run preview` con `.dev.vars` (claves de desarrollo y `APP_ORIGIN` de producción). `/crm/acceso` muestra el `<SignIn>` y `GET /api/crm/me` sin sesión responde 401, no 500. Si el middleware no ve el secreto, se aplica la alternativa de D2 antes de desplegar.
7. **Admin existente:** crea su cuenta en Clerk con el mismo correo → `remap-user-id.sql`, o bien se le vuelve a invitar (D8).
8. **Limpieza:** borrar los Secrets `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` de Cloudflare. Desactivar Neon Auth en la consola es opcional; no se tocan las tablas de `neon_auth`.
9. **Vuelta atrás:** reactivar la versión anterior del Worker en Cloudflare (Neon Auth sigue configurado hasta el paso 8; `0006` es compatible). Los remapeos ya hechos se deshacen con el mismo script, intercambiando los ids.
10. **`CLAUDE.md`:** actualizar las secciones de Neon Auth (identidad, variables y "Active foundation"). Lo decide y hace el usuario; esta spec no lo modifica.

## Reutilización
- **Existente:**
  - `getCurrentUser`/`require*`/`getCrmAccess` (solo cambia la lectura de la identidad);
  - `acceptInvitationAndLoadStaffRoles`/`loadStaffRoles` (sin cambios);
  - `can()` (se amplía);
  - `staff.service`/`staff.actions` (`runAdminAction`, mensajes, `StaffActionState`);
  - `ConfirmActionButton` (`components/shared`), `InviteStaffForm`, `StaffTable`, `InvitationsTable` y `CrmShell` (sin cambios gracias a `STAFF_ROLE_LABELS` y `can`);
  - `trips.service` (patrones `db.batch` y `RETURNING`) y `trips.actions` (`runTripAction`);
  - patrón de scripts SQL (`bootstrap-admin.sql`, `seed-automation-demo.sql`);
  - `strip-env-secrets.mjs` (sin cambios).
- **Clerk:** `clerkMiddleware`, `auth`, `currentUser` (`@clerk/nextjs/server`), `ClerkProvider`, `SignIn`, `SignOutButton` y `useUser` (`@clerk/nextjs`), y `esMX` (`@clerk/localizations`). No se escriben formularios de autenticación propios.
- **shadcn:** ya instalados `button`, `badge`, `table`, `native-select`, `alert-dialog` e `input`. No hace falta ningún componente nuevo; `card` deja de usarse en `AccessPanel`, pero sigue en `NoCrmAccess`.
- **Tests:** patrón `// @vitest-environment node` + `vi.mock("server-only", () => ({}))` y `drizzle.mock()`/fake DB de los tests existentes.

## Tests
Sin red ni secretos. `@clerk/nextjs` y `@clerk/nextjs/server` siempre mockeados.

- **F1**
  - `lib/auth/guards.test.ts` (modificar; mocks de `@clerk/nextjs/server` y `@/lib/auth/access.service`):
    - `userId: null` → `UnauthorizedError` sin llamar a `currentUser` ni al service;
    - `auth()` lanza → `UnauthorizedError` y `console.error` con el texto fijo;
    - `currentUser()` lanza → `ForbiddenError` sin `cause` ni el mensaje original, y sin llamar al service;
    - `currentUser()` `null` o con otro `id` → `UnauthorizedError`;
    - primario verificado `Ana@Example.COM` → aceptación con `ana@example.com`;
    - primario sin verificar pero secundario verificado → `loadStaffRoles` y `requirePermission` lanza aun con `admin`;
    - sin `primaryEmailAddressId` → no verificado;
    - `publicMetadata.role`/`unsafeMetadata` no aportan roles;
    - se mantienen los casos de roles, revocación entre llamadas y error de la base.
  - `app/api/crm/me/route.test.ts` (modificar; mocks de Clerk y del service, no de las guardas): 401 sin sesión, 401 si `auth()` lanza, 403 si `currentUser()` lanza (cuerpo sin texto original), 403 sin verificar, 403 sin roles, 200 `commercial`/`admin`, 403 tras revocar, 403 con `role=admin` en query/cookie/body y en `publicMetadata`, y `no-store` en todas.
  - `modules/accounts/components/AccessPanel.test.tsx` (reescribir; `SignIn` mockeado que registra sus props):
    - `staff` → `routing: "hash"`, `withSignUp: true`, `forceRedirectUrl` y `signUpForceRedirectUrl` `"/crm"`, y el aviso staff;
    - sin `audience` → staff;
    - `runner` → `"/cuenta"` y el aviso runner.
  - `modules/accounts/components/RunnerAccount.test.tsx` (reescribir; `useUser`, `SignIn` y `SignOutButton` de Clerk mockeados):
    - cargando → "Cargando…";
    - sin sesión → `SignIn` con destino `/cuenta`;
    - con sesión → h1, correo primario y `SignOutButton` de Clerk con `redirectUrl: "/cuenta"` y el botón "Cerrar sesión".
- **F2**
  - `modules/accounts/schemas/auth.schema.test.ts`: solo quedan los casos de `emailSchema`.
  - Se borra `authErrorMessage.test.ts`.
- **F3**
  - `lib/auth/permissions.test.ts`: la matriz completa celda a celda, roles vacíos, permiso desconocido, y `manageableRoles`/`canManageRole` con los casos del criterio F3.
  - `staff.schema.test.ts` y `staffDisplay.test.ts`: ver la tabla del módulo.
- **F4**
  - `lib/env.test.ts`: `CLERK_SECRET_KEY` ausente o con formato inválido → error que solo nombra el campo; `NEON_AUTH_*` ya no se exigen; validación perezosa.
  - `staff.service.test.ts`: `revokeInvitation` añade `role in (…)` con los roles dados; con `[]` no consulta.
  - `staff.actions.test.ts`: la matriz de actor × rol de los criterios F4 para las cuatro acciones; el service no se llama si es `forbidden` o `invalid_input`; `revokeInvitationAction` pasa `manageableRoles` del actor (`["commercial"]` para admin; los tres para super admin).
- **F5**
  - `modules/trips/utils/tripScope.test.ts`: `commercial`, `admin` y `super_admin` → `all`; `organizer` → `own` con su id; `organizer` + `commercial` → `all`.
  - `trips.service.test.ts` (modificar):
    - `own` añade `"organizer_id" = $n` en `listTrips`, `getTripById`, el `UPDATE` y el `SELECT` de `updateTrip`, y en `setTripStatus`;
    - `all` no lo añade;
    - `createTrip` inserta `organizer_id` del alcance (o `null`);
    - un `organizerId` en la entrada se ignora.
  - `trips.actions.test.ts` (modificar):
    - el organizador crea con su id;
    - editar un ajeno → `not_found`;
    - cambiar el estado de un ajeno → `invalid_transition`;
    - el comercial sigue con alcance `all`.
- **Sin unit tests** (según SETUP o por limitación): `middleware.ts`, `app/layout.tsx`, páginas async de `app/`, `SignOutButton` (envoltorio sin lógica), `InviteStaffForm`/`StaffTable`/`InvitationsTable` (su lógica está en `manageableRoles` y en las acciones), `lib/db-schema.ts`, la migración y los scripts SQL. Se cubren con los criterios, el checklist manual y E2E cuando exista.

## Plan de tareas

### Fase 1: identidad con Clerk (3 tareas, 13 archivos)
Precondición: el usuario crea una instancia de desarrollo de Clerk y pone `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` en su `.env.local`. Los tests no la necesitan.
- [x] T1 — Instalar Clerk, `middleware.ts` (Edge, `matcher` mínimo) y `ClerkProvider` con `esMX` · archivos: `package.json`, `package-lock.json`, `middleware.ts`, `app/layout.tsx` · depende de: — · secuencial (base)
- [x] T2 — Guardas con la identidad de Clerk (D4) y tests de guardas y de `/api/crm/me` · archivos: `lib/auth/guards.ts`, `lib/auth/guards.test.ts`, `app/api/crm/me/route.ts`, `app/api/crm/me/route.test.ts` · depende de: T1 · paralelo (con T3)
- [x] T3 — `AccessPanel` con `<SignIn>`, `RunnerAccount` con `useUser`, `SignOutButton` de Clerk y sus tests · archivos: `modules/accounts/components/AccessPanel.tsx`, `modules/accounts/components/AccessPanel.test.tsx`, `modules/accounts/components/RunnerAccount.tsx`, `modules/accounts/components/RunnerAccount.test.tsx`, `modules/accounts/components/SignOutButton.tsx` · depende de: T1 · paralelo (con T2; archivos disjuntos)

### Fase 2: retirar Neon Auth del código (2 tareas, 15 archivos; 10 se borran sin más)
- [x] T1 — Desinstalar `@neondatabase/auth` y borrar `overrides`; borrar `lib/auth/server.ts`, `lib/auth/client.ts` y `app/api/auth/[...path]/route.ts` · archivos: `package.json`, `package-lock.json`, `lib/auth/server.ts`, `lib/auth/client.ts`, `app/api/auth/[...path]/route.ts` · depende de: Fase 1 · secuencial (base)
- [x] T2 — Borrar los formularios y utilidades muertos y reducir `auth.schema` y `auth.types`; medir el Worker (`build:worker` + `wrangler deploy --dry-run`, sin desplegar) · archivos: `modules/accounts/components/SignInForm.tsx`, `modules/accounts/components/SignUpForm.tsx`, `modules/accounts/components/VerifyEmailForm.tsx`, `modules/accounts/components/ForgotPasswordForm.tsx`, `modules/accounts/components/ResetPasswordForm.tsx`, `modules/accounts/utils/authErrorMessage.ts`, `modules/accounts/utils/authErrorMessage.test.ts`, `modules/accounts/schemas/auth.schema.ts`, `modules/accounts/schemas/auth.schema.test.ts`, `modules/accounts/types/auth.types.ts` · depende de: T1 · secuencial

### Fase 3: roles nuevos, matriz y bootstrap del super admin (5 tareas, 13 archivos)
- [ ] T1 — Enum con `super_admin` y `organizer`, `trips.organizer_id` con índice, y migración `0006` generada y revisada · archivos: `lib/db-schema.ts`, `drizzle/0006_*.sql` (generado), `drizzle/meta/0006_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: Fase 2 · secuencial (base)
- [ ] T2 — Matriz `can()` nueva, `manageableRoles` y `canManageRole` con tests · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: T1 · secuencial (`lib/`)
- [ ] T3 — `staffRoleSchema` sin `super_admin` y etiquetas de los cuatro roles, con tests · archivos: `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/accounts/utils/staffDisplay.ts`, `modules/accounts/utils/staffDisplay.test.ts` · depende de: T1 · paralelo (con T2 y T4; archivos disjuntos)
- [ ] T4 — `bootstrap-admin.sql` con `-v role` y protección del último super admin en `revoke-staff-role.sql` · archivos: `scripts/sql/bootstrap-admin.sql`, `scripts/sql/revoke-staff-role.sql` · depende de: T1 · paralelo (con T2 y T3)
- [ ] T5 — README: migración `0006` y alta del super admin · archivos: `README.md` · depende de: T1, T4 · secuencial

### Fase 4: gestión del staff por rol y puesta en producción (5 tareas, 15 archivos)
Precondición: el usuario facilita la clave `pk_live_…` (Pregunta abierta 9).
- [ ] T1 — Entorno: `CLERK_SECRET_KEY` en `getEnv` sin `NEON_AUTH_*`, ejemplos y clave publicable en `wrangler.jsonc`; comprobar `next-env.mjs` tras `build:worker` · archivos: `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.dev.vars.example`, `wrangler.jsonc` · depende de: Fase 3 · secuencial (base, `lib/`)
- [ ] T2 — `revokeInvitation` filtrado por roles gestionables, con test · archivos: `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Server Actions con `canManageRole` y tests de la matriz actor × rol · archivos: `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — UI por rol: formulario, tablas y página · archivos: `modules/accounts/components/InviteStaffForm.tsx`, `modules/accounts/components/StaffTable.tsx`, `modules/accounts/components/InvitationsTable.tsx`, `app/crm/(protected)/admin/usuarios/page.tsx` · depende de: T3 · secuencial
- [ ] T5 — `remap-user-id.sql` y README (modelo de acceso con Clerk, ajustes, variables, runbook, vuelta atrás, remapeo y checklist) · archivos: `scripts/sql/remap-user-id.sql`, `README.md` · depende de: T1 · paralelo (con T2–T4; archivos disjuntos)

### Fase 5: el organizador gestiona sus viajes y seed (5 tareas, 14 archivos)
- [ ] T1 — `TripScope`, `tripScopeFor` con test y exports · archivos: `modules/trips/types/trips.types.ts`, `modules/trips/utils/tripScope.ts`, `modules/trips/utils/tripScope.test.ts`, `modules/trips/index.ts` · depende de: Fase 4 · secuencial (base)
- [ ] T2 — Alcance obligatorio en el service de viajes, con tests · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Acciones de viajes con el alcance del actor, con tests · archivos: `modules/trips/actions/trips.actions.ts`, `modules/trips/actions/trips.actions.test.ts` · depende de: T2 · paralelo (con T4)
- [ ] T4 — Páginas de viajes y reservas con `tripScopeFor` · archivos: `app/crm/(protected)/viajes/page.tsx`, `app/crm/(protected)/viajes/[id]/page.tsx`, `app/crm/(protected)/reservas/page.tsx`, `app/crm/(protected)/reservas/nueva/page.tsx` · depende de: T2 · paralelo (con T3; archivos disjuntos)
- [ ] T5 — `seed-trips.sql` (sin ejecutar) y README (rol organizador y seed); medir el Worker al cerrar la fase · archivos: `scripts/sql/seed-trips.sql`, `README.md` · depende de: Fase 4 (schema de F3) · paralelo (con T1–T4)

## Preguntas abiertas
1. **Datos de las demás carreras para el seed.** En el repo solo hay datos completos de Santiago 2027. Río y Roma aparecen como "Sin carrera, fecha ni precio confirmados", y de Medellín, Buenos Aires, España y EE. UU. solo hay imágenes. `trips` exige fecha de carrera, al menos una distancia y un resumen. **Recomendación:** el seed sale con Santiago. Cuando nos pases, por carrera, nombre oficial, ciudad, fecha, distancias y un resumen (precios opcionales), se añaden como filas `draft` (enmienda de esta spec) con las imágenes de la tabla de scripts.
2. **Santiago probablemente ya existe en `production`.** Con `ON CONFLICT (slug) DO NOTHING`, el seed no lo toca y no lo asocia al organizador. ¿Debe el seed asignar el organizador a viajes existentes con `organizer_id IS NULL`? **Recomendación:** no. El seed solo inserta; la asignación de viajes existentes se hace aparte y explícitamente (ver 6).
3. **"Manejar sus permisos": ¿permisos por usuario además de roles?** **Recomendación:** solo roles y matriz estática (esta spec). El super admin cambia lo que alguien puede hacer asignando o revocando roles. Los permisos por usuario (tabla de excepciones) añaden complejidad y riesgo; se valorarían en otra spec si hay un caso concreto.
4. **¿El organizador puede publicar, despublicar y archivar sus viajes, o la publicación requiere revisión del equipo?** Esta spec sigue la lectura literal: los "gestiona" todos. **Alternativa más prudente:** el organizador solo crea y edita borradores, y publicar queda para `commercial`/`admin` (un permiso `trips.publish` más). Confírmalo antes de aprobar.
5. **¿El organizador debe ver los leads y las reservas de sus viajes?** **Recomendación:** no en esta spec; requiere alcance por viaje en leads y reservas (otra spec).
6. **Asignar o cambiar el organizador de un viaje desde el CRM.** **Recomendación:** fuera de esta spec. Por ahora, el seed para los viajes nuevos y SQL manual para los existentes. Si se usa a menudo, una acción "Organizador" en `/crm/viajes/<id>` para super admin/admin.
7. **Métodos de acceso en Clerk.** **Recomendación:** solo correo + contraseña con verificación por código (paridad con lo actual). El acceso con Google sería cómodo para runners, pero no está pedido.
8. **Idioma de los componentes de Clerk.** **Recomendación:** `esMX` (español latinoamericano; el público es peruano). Alternativa: `esES`.
9. **Instancia de producción de Clerk.** Exige registros DNS en `mentec.dev` y la clave `pk_live_…`, que va en `wrangler.jsonc` (pública). **Recomendación:** crearla antes de F4 y facilitar la `pk_live_…`. Mientras tanto, solo la instancia de desarrollo en local.
10. **Datos existentes de Neon Auth.** **Recomendación:** `remap-user-id.sql` para el admin actual: conserva su rol y la autoría de leads, viajes y reservas. La alternativa es volver a invitarle y revocar a mano sus asignaciones antiguas (D8). ¿Hay otras cuentas de staff o runners vinculados en `production` que remapear?
11. **Ramas abiertas que se solapan.** `claude/brave-thompson-gmnusb` reescribe las migraciones `0005`/`0006`, y su README indica que `production` tiene `0000`–`0005` de `main` aplicadas. `claude/trusting-darwin-oxck2t` toca `modules/accounts` (gestión de usuarios, perfiles de runner). Esta spec parte de `main` 66ffae1. **Recomendación:** integrar o descartar esas ramas antes de F3. Si entran antes, regenerar la migración con `npm run db:generate` (cambiará su número) y revisar los archivos de `modules/accounts` del plan.
12. **`ClerkProvider` en la raíz carga el script de Clerk también en la landing.** **Recomendación:** aceptarlo en el MVP (es la ubicación documentada y la más simple). Si el rendimiento de la portada importa, en otra spec se mueve a layouts de `/crm` y `/cuenta`.
