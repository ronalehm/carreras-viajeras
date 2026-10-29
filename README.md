# Carreras Viajeras

Aplicación de Carreras Viajeras: sitio público, captación omnicanal y CRM de viajes, ofertas, leads, reservas y usuarios. Las funciones implementadas y las entregas futuras se detallan en las specs y en las secciones siguientes.

> **Precedencia:** la fase 1 aprobada de [`platform-neon-foundation.md`](docs/specs/platform-neon-foundation.md) define esta preparación. Los borradores anteriores que indican D1, Hyperdrive provisional o Access como sustituto de RBAC están obsoletos y no son instrucciones ejecutables. No seguir sus pasos de infraestructura. El acceso del equipo al CRM se rige por [`accounts-roles-permissions.md`](docs/specs/accounts-roles-permissions.md) y [`accounts-auth-ui.md`](docs/specs/accounts-auth-ui.md), con las partes de Neon Auth de esas specs y de la foundation sustituidas por [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md): **Clerk es el único proveedor de identidad**.

## Stack y alcance

| Área | Decisión |
|---|---|
| Aplicación | Next.js + React + TypeScript strict |
| Interfaz | Tailwind CSS + shadcn/ui sobre Base UI |
| Ejecución prevista | Cloudflare Workers Free mediante OpenNext |
| Datos | Neon PostgreSQL Free + Drizzle con driver HTTPS `neon-http` |
| Identidad | Clerk (`@clerk/nextjs`); un solo proveedor. Roles y permisos en Neon |
| Validación | Zod; Turnstile opcional en la captura pública |
| Automatización | Outbox persistente en Neon, API privada y n8n Community local |
| Contacto inicial | WhatsApp Business App manual; API oficial posterior |

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` (el `<SignIn>` de Clerk: iniciar sesión, crear cuenta, verificar el correo y recuperar la contraseña con código), `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). El catálogo de viajes tiene su tabla `trips` (ya creada en `production`) y su contrato de lectura para la landing; su gestión en `/crm/viajes` está implementada en la Fase 2 de [`trips-catalog.md`](docs/specs/trips-catalog.md) (ver [Catálogo de viajes](#catálogo-de-viajes)); la migración `0004` le añade los campos de la landing por carrera (`/viajes/<slug>`, ver [`landing-race-pages.md`](docs/specs/landing-race-pages.md)). Las tablas de leads (`leads`, `lead_activities`) llegan con la migración `0002` ([`crm-leads-pipeline.md`](docs/specs/crm-leads-pipeline.md)), y la captura del formulario web y el outbox para n8n (`outbox_events`), con la migración `0005` ([`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)). En `production` ya existen `trips` y las tablas de leads y reservas; faltan `0005` y `0006` (ver [Leads (CRM comercial)](#leads-crm-comercial)). Las organizaciones de colaboradores siguen pendientes de su spec.

## Preparación local

Requisitos: Node.js 22 o superior y npm. Para verificar el paquete OpenNext, usar Linux o WSL: un build Next correcto por sí solo no valida Workers.

```sh
git clone https://github.com/ronalehm/carreras-viajeras.git
cd carreras-viajeras
npm ci
```

La preparación (PR #1), los roles del equipo (PR #2), el acceso al CRM (PR #3), el alta de invitados (PR #4) y la página de usuarios (PR #5) están fusionados en `main`.

Copiar `.env.example` a `.env.local` para Next.js y completar los valores **solo en tu equipo**. Para la ejecución local de Wrangler/OpenNext, copiar `.dev.vars.example` a `.dev.vars`. Son archivos distintos: mantener coherentes sus valores; nunca subirlos ni pegar secretos en un chat. Las plantillas no contienen credenciales.

| Variable | Uso |
|---|---|
| `APP_ORIGIN` | Origen exacto de la aplicación, sin ruta ni slash final. En producción vive en `vars` de `wrangler.jsonc` |
| `DATABASE_URL` | Conexión PostgreSQL con TLS de un rol de aplicación con permisos mínimos |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clave publicable de Clerk (`pk_test_…` en desarrollo, `pk_live_…` en producción). Es pública y se incrusta al compilar: en `.env.local`, como variable de build de Workers Builds y en `vars` de `wrangler.jsonc` |
| `CLERK_SECRET_KEY` | Clave secreta de Clerk (`sk_test_…` o `sk_live_…`), solo servidor: `.env.local`, `.dev.vars` y Cloudflare **Secret**. Nunca como `NEXT_PUBLIC_*` ni en `wrangler.jsonc` |
| `N8N_API_TOKEN` | Opcional. Token de la API privada para n8n (al menos 32 caracteres), solo servidor. Ver [Secretos de integraciones](#secretos-de-integraciones) |
| `TURNSTILE_SECRET_KEY` | Opcional. Secret Key de Turnstile (antispam del formulario), solo servidor. Ver [Activar la protección antispam (Turnstile)](#activar-la-protección-antispam-turnstile) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Opcional. Site Key de Turnstile: es pública y se incrusta al compilar; solo en `.env.local` y en las variables de build |

Las tres variables opcionales se validan solo cuando se usan: si faltan, el CRM y el acceso siguen funcionando, y compilar no las exige.

El origen previsto de producción es `https://carreras-viajeras.mentec.dev`. Para desarrollo, usar el origen local con las dos claves de la **instancia de desarrollo** de Clerk (admite localhost); las claves `pk_live_…`/`sk_live_…` son de la instancia de producción y solo sirven en el dominio previsto (ver [Ajustes de Clerk](#ajustes-de-clerk)). `getEnv()` exige `DATABASE_URL`, `CLERK_SECRET_KEY` y `APP_ORIGIN` y se valida al usarla en una petición; compilar no debe conectarse a Neon ni exigir secretos: un clon sin claves compila (sin clave publicable, las páginas no cargan el script de Clerk).

```sh
npm run dev
npm run lint
npx vitest run
npm run build
```

`/api/health` es liveness pública: confirma que responde la aplicación, sin consultar la base ni revelar detalles de conexión. No acredita readiness de Neon.

## Workers y migraciones

En Linux/WSL, después de instalar las dependencias allí, verificar el empaquetado sin desplegar:

```sh
npm run build:worker
```

`npm run preview` compila con `NODE_ENV=production` y ejecuta el Worker localmente: exige `APP_ORIGIN=https://carreras-viajeras.mentec.dev`, no localhost. Usarlo como smoke test local: antes de desplegar Clerk, comprueba además que `/crm/acceso` muestra el `<SignIn>` y que `GET /api/crm/me` sin sesión responde 401, no 500 (paso 5 de [Puesta en producción de Clerk](#puesta-en-producción-de-clerk)). El inicio de sesión completo con la instancia de producción de Clerk solo se valida en el dominio previsto. Solo `npm run dev`, en modo development, admite `http://localhost:3000` o `http://localhost:8787` como `APP_ORIGIN`. `npm run cf-typegen` regenera los tipos de bindings. El Worker conserva `ASSETS` y `WORKER_SELF_REFERENCE`; `workers.dev` y las URLs de preview remotas permanecen desactivadas. El dominio personalizado se activará solo después de autorizar el despliegue.

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. Hay catorce migraciones (`0000`–`0013`) y todas se aplican a mano. **Estado verificado en `production` el 2026-10-29 (lista de tablas):** ya están aplicadas `0000`–`0004` y también la `0005` antigua de `main` (`0005_abnormal_gladiator`, el outbox del #8 que esta rama retira), así que en `production` **solo faltan `0005_supreme_pepper_potts`, `0006` y `0007`, en ese orden y cada una en dos bloques**, y después `0008`, en un solo bloque, y `0009` (rama de Clerk); detrás van `0010`–`0013`, en orden y siguiendo sus secciones. Las tablas `automation_events` y `automation_event_redrives` y el tipo `automation_event_status` que dejó esa `0005` antigua quedan huérfanos: el código ya no los usa y no estorban a las migraciones nuevas. Borrarlos es una operación aparte que exige comprobar antes que están vacíos y una autorización expresa. Las migraciones: `drizzle/0000_tough_thor.sql` crea las tablas de staff (ya aplicada en `production`; ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)), `drizzle/0001_young_korvac.sql` crea la tabla de viajes (ya aplicada en `production`; ver [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes)), `drizzle/0002_tough_warpath.sql` crea las tablas de leads (ya aplicada en `production`; ver [Migración de la tabla de leads](#migración-de-la-tabla-de-leads)), `drizzle/0003_talented_skin.sql` crea las tablas de reservas (ya aplicada en `production`; ver [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas)), `drizzle/0004_sloppy_bushwacker.sql` añade a `trips` los campos de la landing por carrera (ya aplicada en `production`; ver [Migración de los campos de carrera](#migración-de-los-campos-de-carrera)), `drizzle/0005_supreme_pepper_potts.sql` prepara la captura y el outbox (pendiente, después de `0004` y **en dos bloques**; ver [Migración de captura y outbox](#migración-de-captura-y-outbox)) y `drizzle/0006_flashy_bastion.sql` añade el origen de los leads, el seguimiento con baja y el vínculo reserva ↔ lead (pendiente, después de `0005` y **en dos bloques**; ver [Migración de origen, seguimiento y reservas (`0006`)](#migración-de-origen-seguimiento-y-reservas-0006)) y `drizzle/0007_awesome_dust.sql` añade las campañas, el consentimiento de promociones y el registro repetido (número provisional hasta el turno de merge; pendiente, después de `0006` y **en dos bloques**; ver [Migración de campañas y registro](#migración-de-campañas-y-registro)) y `drizzle/0008_moaning_roulette.sql` crea las ofertas comerciales versionadas y el tipo de cambio (número provisional hasta el turno de merge; pendiente, después de `0007` y **en un solo bloque** y tal cual; ver [Migración de ofertas comerciales (`0008`)](#migración-de-ofertas-comerciales-0008)) y `drizzle/0009_chilly_patriot.sql` añade los roles `super_admin` y `organizer` y `trips.organizer_id` (pendiente, después de `0008` y **antes** de desplegar el código de la Fase 3 de `accounts-clerk-rbac.md`; ver [Migración de roles y organizador](#migración-de-roles-y-organizador-0009)), `drizzle/0010_runner_profiles_sponsors.sql` crea los perfiles de corredor y las marcas patrocinadoras y añade el rol `sponsor` (pendiente, después de `0009`; ver [Migración incremental de la integración](#migración-incremental-de-la-integración)), `drizzle/0011_runner_rewards_content.sql` y `drizzle/0012_reward_operations.sql` añaden las recompensas y el contenido público (pendientes, después de `0010` y cada una en su propia transacción; ver [Mi cuenta, recompensas y noticias](#mi-cuenta-recompensas-y-noticias)) y `drizzle/0013_cute_nebula.sql` crea el contador de visitas por campaña (número provisional hasta el turno de merge; pendiente, después de `0012` y **en un solo bloque**; ver [Migración de visitas por campaña (`0013`)](#migración-de-visitas-por-campaña-0013)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. La identidad la da Clerk; los ajustes están en [Ajustes de Clerk](#ajustes-de-clerk) y el paso desde Neon Auth en [Puesta en producción de Clerk](#puesta-en-producción-de-clerk).
2. Clerk tiene una instancia de desarrollo (localhost) y otra de producción para `https://carreras-viajeras.mentec.dev`.
3. `DATABASE_URL`, `CLERK_SECRET_KEY` y, cuando se usen, `N8N_API_TOKEN` y `TURNSTILE_SECRET_KEY` (ver [Secretos de integraciones](#secretos-de-integraciones)) se cargan en Cloudflare como **Secret** (nunca como texto). `APP_ORIGIN` y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` no son secretos y viven en `vars` de `wrangler.jsonc`: cada despliegue automático ejecuta `wrangler deploy`, que borra las variables de texto creadas en el panel y no declaradas ahí. Por eso aparecen en el panel como variables de texto: no borrarlas ni duplicarlas como Secret; se cambian en `wrangler.jsonc`. La clave publicable también es **variable de build** de Workers Builds, porque se incrusta al compilar. Nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. El CRM exige correo verificado y una asignación de staff activa por ID de usuario, con denegación por defecto (ver [Acceso al CRM](#acceso-al-crm)); Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

Cada lead y su evento se confirman juntos en Neon: el alta manual del CRM ya escribe el evento `lead.created` en el outbox (`outbox_events`, migración `0005`). n8n local los recoge con reintentos mediante una API privada (ver [Automatizaciones con n8n](#automatizaciones-con-n8n)); el formulario web conectado llega en las Fases 3 y 4 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md). No hay integración con la API de WhatsApp.

## Acceso al CRM

### Modelo de acceso

Especificado en [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md): **Clerk da la identidad y Neon, los roles.**

- **Identidad (Clerk):** `/crm/acceso` y `/cuenta` muestran el `<SignIn>` de Clerk en español, con el alta incluida: crear la cuenta, verificar el correo con código, iniciar sesión y recuperar la contraseña los gestiona Clerk. "Cerrar sesión" es el `SignOutButton` de Clerk. El id estable es el `userId` de Clerk (`user_…`), que `auth()` obtiene verificando el token de sesión. El correo solo cuenta si es el **correo primario** de la cuenta y está verificado; se usa en minúsculas para aceptar invitaciones, mostrarse y vincular reservas, nunca para autorizar.
- **Middleware mínimo:** `middleware.ts` (`clerkMiddleware()`) se ejecuta en `/crm/:path*`, `/api/crm/:path*` y `/cuenta/perfil/:path*` y solo hace disponible la sesión: no autoriza, no redirige ni lee la base. Las guardas están en cada página, Route Handler y Server Action. **Toda ruta nueva que llame a las guardas se añade a su `matcher`** (por ejemplo, `/mis-carreras` cuando llegue); si no, `auth()` falla y la guarda responde 401: falla cerrado.
- **Runners:** crean su cuenta de Clerk en `/cuenta`, con el mismo flujo que el staff. Es una cuenta sin roles de staff: no crea filas en `profiles` ni `staff_*` y en `/crm` ve la pantalla "sin acceso" (403). El perfil propio en `/cuenta/perfil` exige su guarda y el correo primario verificado; cada recurso futuro para runners necesitará también su propia guarda en el servidor.
- **Staff** (`commercial`, `organizer`, `admin`, `super_admin`): entra solo por invitación. La invitación no controla quién crea una cuenta (el registro es público); controla los **roles**, que viven en Neon (`staff_assignments`) y se leen en cada petición, así que una revocación se aplica en la siguiente. Se invita desde `/crm/admin/usuarios` y el enlace `<APP_ORIGIN>/crm/acceso` se comparte a mano; la invitación caduca a los 7 días. Quién puede invitar, asignar y revocar cada rol (se comprueba en cada Server Action, no solo en la UI):

  | Actor | Roles que gestiona |
  |---|---|
  | `super_admin` | `commercial`, `organizer` y `admin` |
  | `admin` | solo `commercial` |
  | `commercial`, `organizer` | ninguno |
  | cualquiera | nunca `super_admin`: solo con los scripts SQL |

- **Aceptación automática:** la primera petición autenticada con el correo primario **verificado** que coincide (sin distinguir mayúsculas) con una invitación pendiente y vigente la acepta en una sola sentencia: crea el perfil y la asignación. Después, la autorización usa solo el `user_id` de Clerk, no el correo.
- **Denegación por defecto:** sin sesión o si falla la lectura de la sesión → 401; si falla la lectura del usuario en Clerk, el correo primario no está verificado, la cuenta no tiene rol, la invitación caducó o se revocó, o falla la base → 403. Ni las respuestas ni los logs incluyen el mensaje original de Clerk o de la base. Body, query, cookies propias y metadatos de Clerk (`publicMetadata`, `unsafeMetadata`) nunca conceden permisos: no se guardan roles en Clerk.
- **Último admin y último super admin:** el CRM no permite revocar el rol `admin` del último admin activo, y nunca gestiona `super_admin`; `revoke-staff-role.sql` se niega a revocar el último `super_admin` activo. El primer admin y el super admin se asignan solo con el script de bootstrap, por id exacto de Clerk, nunca por ser el primer registro ni por coincidir el correo.

`GET /api/crm/me` responde `{ userId, staffRoles }` (200) o `{ error }` (401/403), siempre con `Cache-Control: no-store`. `/crm` muestra el correo y los roles, o la pantalla "sin acceso".

### Ajustes de Clerk

Los configura el usuario en el panel de Clerk, con autorización. La UI de `/crm/acceso` y la de `/cuenta` dependen de ellos.

- **Aplicación "Carreras Viajeras"** con dos instancias: **desarrollo** (localhost; claves `pk_test_…`/`sk_test_…`) y **producción** para `carreras-viajeras.mentec.dev` (claves `pk_live_…`/`sk_live_…`). La de producción exige registros DNS en `mentec.dev`, un cambio de DNS que requiere aprobación explícita. Cada instancia tiene sus propios usuarios e ids: no mezclar los de una rama de Neon con los de otra instancia.
- **Correo obligatorio, verificado al registrarse con código.** Contraseña ON. **Registro público ON**, porque los invitados y los runners crean su cuenta. **Riesgo aceptado:** cualquiera puede registrarse, pero sin invitación no obtiene permisos (403) ni filas en `public`.
- **Recuperación de la contraseña:** la del propio `<SignIn>` ("¿Olvidaste tu contraseña?"), por código.
- **Sin** proveedores sociales, Organizations, roles o permisos de Clerk, claims personalizados del token ni metadatos para autorizar.

Cada petición del CRM consulta una vez el Backend API de Clerk (`currentUser()`) para leer el correo primario. Con el tráfico bajo del CRM queda dentro de los límites de Clerk.

### Puesta en producción de Clerk

Runbook del paso de Neon Auth a Clerk. Lo ejecuta el usuario, nunca un agente, y cada paso remoto (panel de Clerk, DNS, Cloudflare, Neon, merge o despliegue) requiere su autorización explícita.

**Orden respecto a Workers Builds.** Cada merge en `main` despliega con Workers Builds. Las Fases 1–5 de `accounts-clerk-rbac.md` se mergean **juntas, en un solo merge**, y solo después de los pasos 1–5. Si entran antes, el sitio queda sin login (faltan las claves de Clerk) o con `/crm/viajes` fallando (falta la columna `organizer_id`).

Antes del merge:

1. **Clerk:** aplicar los [ajustes](#ajustes-de-clerk) en las dos instancias y anotar la `pk_live_…` y la `sk_live_…` de producción.
2. **Repositorio:** poner la `pk_live_…` en `vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` de `wrangler.jsonc`, en la rama que se va a mergear (es pública).
3. **Cloudflare** (Worker `carreras-viajeras`):
   - Secret `CLERK_SECRET_KEY` con la `sk_live_…`;
   - variable de build `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` con la `pk_live_…` en Workers Builds;
   - **no borrar todavía** los Secrets `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET`: los necesita la [vuelta atrás](#vuelta-atrás). El Worker actual ignora las claves nuevas.
4. **Neon:** aplicar las migraciones pendientes hasta `0009`, primero en una rama de desarrollo y después en `production`, cada una según su sección (ver [Workers y migraciones](#workers-y-migraciones) y [Migración de roles y organizador](#migración-de-roles-y-organizador-0009)). Son compatibles con el Worker actual. Comprobar que el volcado de `neon_auth` no cambia.
5. **Smoke local**, en Linux/WSL: `.env.local` con las claves de la instancia de desarrollo y `.dev.vars` con `sk_test_…`, la `DATABASE_URL` de una rama de desarrollo y `APP_ORIGIN=https://carreras-viajeras.mentec.dev`.
   - `npm run build:worker`: `grep -c CLERK_SECRET_KEY .open-next/cloudflare/next-env.mjs` devuelve `0`.
   - `npm run preview`: `/crm/acceso` muestra el `<SignIn>` y `GET /api/crm/me` sin sesión responde 401, no 500.
   - En local, `.dev.vars` prevalece sobre `vars` de `wrangler.jsonc`: si la `pk_live_…` de `wrangler.jsonc` choca con la `sk_test_…`, añadir también `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…` a `.dev.vars`.
   - Si el middleware no ve la clave secreta (500 en `/crm`), **no desplegar**: la alternativa (`proxy.ts`, Decisión D2 de la spec) requiere aprobación del usuario y otra medición con `preview`.

Merge y despliegue:

6. Con autorización, mergear las Fases 1–5 (Workers Builds despliega) o `npm run deploy`. Desde ese momento el staff existente ve "sin acceso" hasta que se remapee su cuenta (paso 8): avisar al equipo y hacerlo en una ventana corta.

Después del despliegue:

7. **Super admin:** Linder crea su cuenta en `/crm/acceso` con `linderhassinger01@gmail.com`, la verifica y ve "sin acceso". El usuario ejecuta `bootstrap-admin.sql -v role=super_admin` con su `user_…` de la instancia de producción ([Alta del super admin](#alta-del-super-admin)). Si su correo ya aparece en la consulta del paso 1 del [remapeo](#remapeo-de-cuentas-de-neon-auth-a-clerk) (tiene perfil con id de Neon Auth), hacer antes el paso 8 para esa cuenta: si no, `remap-user-id.sql` se negará después porque el `user_…` ya tendrá perfil.
8. **Staff existente** (cuentas con id de Neon Auth): cada persona crea su cuenta de Clerk en `/crm/acceso` con **el mismo correo** que tiene en `profiles` y la verifica; después se ejecuta `remap-user-id.sql` para esa persona ([Remapeo de cuentas de Neon Auth a Clerk](#remapeo-de-cuentas-de-neon-auth-a-clerk)). Recupera sus roles y la autoría de sus datos en la siguiente petición. **Remapear antes de dar ningún rol nuevo a esa cuenta de Clerk:** si además debe ser `super_admin`, primero `remap-user-id.sql` y después `bootstrap-admin.sql -v role=super_admin` con el mismo `user_…`.
9. **Reservas de runners:** `SELECT id, trip_id, participant_email FROM bookings WHERE runner_user_id IS NOT NULL AND runner_user_id NOT LIKE 'user\_%';` debería devolver 0 filas. Si devuelve alguna, son vínculos con ids de Neon Auth: desvincularlas dejando el mismo correo, según [Desvincular o reasignar una reserva](#desvincular-o-reasignar-una-reserva), para que el runner las vuelva a vincular con su cuenta de Clerk.
10. **Comprobar** el [checklist manual en producción](#checklist-manual-en-producción).
11. **Limpieza**, cuando todo funcione: borrar en Cloudflare los Secrets `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET`. Desde entonces la vuelta atrás al Worker de Neon Auth ya no funciona. Desactivar Neon Auth en la consola de Neon es opcional; no se tocan las tablas de `neon_auth`.
12. **`CLAUDE.md`:** actualizar sus secciones de Neon Auth (identidad, variables y "Active foundation"). Lo decide y hace el usuario.

### Vuelta atrás

Si tras el despliegue falla el acceso (por ejemplo, 500 en `/crm` o el `<SignIn>` no carga) y no se arregla en el momento, con autorización:

1. En Cloudflare, volver a la versión anterior del Worker (Deployments → la versión previa al merge). Funciona mientras sigan los Secrets de Neon Auth (paso 11 sin hacer). La `0009` es compatible con el código anterior y no se deshace.
2. Workers Builds vuelve a desplegar `main` en el siguiente merge: para quedarse en la versión anterior, revertir el merge en `main` (con autorización) o no mergear nada hasta resolverlo.
3. Las personas ya remapeadas entran de nuevo con su cuenta de Neon Auth solo si se deshace su remapeo: el mismo script con los ids intercambiados (`-v old_user_id='user_…' -v new_user_id='<id de Neon Auth>'`).
4. Lo creado con ids de Clerk (la asignación `super_admin`, perfiles de invitaciones aceptadas) no estorba al código anterior: trata los roles desconocidos como sin permisos y nunca recibe ids de Clerk. Se deja como está.

### Checklist manual en producción

Primero todo con la instancia de desarrollo de Clerk y una rama de Neon de desarrollo; en producción, después del paso 6 del runbook, en `https://carreras-viajeras.mentec.dev/crm/acceso` y `https://carreras-viajeras.mentec.dev/cuenta`:

- [ ] `0009` aplicada y el volcado del schema `neon_auth` es idéntico antes y después.
- [ ] Super admin tras el bootstrap → `/crm` muestra "Super admin" y los enlaces "Viajes", "Reservas" y "Usuarios".
- [ ] Cada persona del staff existente, tras crear su cuenta en Clerk y el remapeo → `/crm` muestra su rol ("Admin" o "Comercial") y sus leads y viajes conservan la autoría.
- [ ] El super admin invita a un `admin` y a un `organizer`; cada uno crea su cuenta con el correo invitado y la verifica con código → ven "Admin" y "Organizador".
- [ ] Un `admin` solo puede invitar "Comercial" y no ve acciones sobre admins, organizadores ni el super admin.
- [ ] El organizador crea un viaje, lo ve en `/crm/viajes` como borrador y no ve los viajes ajenos: `/crm/viajes/<id de un viaje ajeno>` responde 404. Un comercial o un admin sí ven los dos.
- [ ] (Cuando exista el organizador al que se asociarán, con autorización) [`seed-trips.sql`](#seed-de-viajes-pendiente-de-ejecutar) devuelve las filas insertadas en borrador con su `organizer_id`, y repetirlo devuelve 0 filas.
- [ ] (Solo en la rama de desarrollo) `revoke-staff-role.sql -v role=super_admin` sobre el único super admin falla sin cambiar nada.
- [ ] Una cuenta sin rol ve la pantalla "sin acceso", y `GET /api/crm/me` sin sesión responde 401 con `Cache-Control: no-store`.
- [ ] "Cerrar sesión" en el CRM lleva a `/crm/acceso`; la sesión persiste al recargar; recuperar la contraseña con código y volver a entrar funciona.
- [ ] (Runners) Un correo nuevo se registra en `/cuenta`, verifica el código, ve su correo y "Cerrar sesión" vuelve a `/cuenta`. En `/crm` ve "sin acceso" y no aparecen filas nuevas en `profiles` ni `staff_assignments`.

### Migración de las tablas de staff

Ya aplicada por el usuario en `production`. Para otra rama:

1. Revisar `drizzle/0000_tough_thor.sql`: solo objetos en `public`; `grep -i neon_auth drizzle/*.sql` no devuelve nada.
2. Guardar el estado de `neon_auth` (si existe en esa rama): `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido del archivo entre `BEGIN;` y `COMMIT;` y ejecutarlo. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0000_tough_thor.sql`.
4. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).

No hay script `migrate` ni migración automática. Si `DATABASE_URL` usa un rol distinto del owner, necesita `SELECT, INSERT` en `profiles` y `SELECT, INSERT, UPDATE` en `staff_assignments` y `staff_invitations`; esos GRANT quedan fuera de esta spec.

### Migración de roles y organizador (`0009`)

Especificada en [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md) (Fase 3). Se aplica en el paso 4 de [Puesta en producción de Clerk](#puesta-en-producción-de-clerk).

`drizzle/0009_chilly_patriot.sql` añade al enum `staff_role` los valores `super_admin` y `organizer`, y a `trips` la columna nula `organizer_id` (clave foránea a `profiles.user_id`, `ON DELETE restrict`) con el índice `trips_organizer_idx`. Pendiente de aplicar por el usuario: **primero en una rama de desarrollo de Neon**; en `production`, solo después de revisarla y con autorización explícita de la operación remota. **No volver a aplicar ninguna migración ya aplicada** (`0000` está en `production`).

- **Compatible hacia atrás.** El código anterior ignora la columna nueva y trata un rol desconocido como sin permisos. Por eso la migración puede aplicarse antes del despliegue y no impide volver a la versión anterior del Worker.
- **Orden respecto al despliegue: aplicar `0009` antes de desplegar el código de la Fase 3.** La Fase 3 no se mergea sola en `main`: las Fases 1–5 de `accounts-clerk-rbac.md` se mergean juntas, y la `0009` se aplica antes de ese merge (ver [Puesta en producción de Clerk](#puesta-en-producción-de-clerk)). Ese código selecciona `organizer_id` en las lecturas de viajes del CRM (`listTrips`, `getTripById`) y lo incluye al crear viajes: sin la migración fallan por columna inexistente `/crm/viajes`, `/crm/viajes/nuevo`, `/crm/reservas` y `/crm/reservas/nueva`. Lo mismo ocurre con `npm run dev` contra una rama de Neon que no la tenga. La lectura pública de la landing no selecciona esa columna.
- **Rol `organizer`.** Solo un `super_admin` puede invitar o asignar "Organizador" (Fase 4), y la Fase 5 limita su permiso `trips.manage` a sus propios viajes (ver [Rol organizador](#rol-organizador)). Las Fases 1–5 se mergean juntas, en un solo merge, así que ningún despliegue tiene el rol sin ese alcance. El rol "Super admin" se muestra en `/crm/admin/usuarios` como etiqueta, sin botones: solo se asigna y revoca con los scripts.
- **Orden respecto a las demás migraciones:** después de `0008`, respetando el journal de Drizzle. Necesita `profiles` (`0000`) y `trips` (`0001`); en una rama copia de `production`, aplicar antes las que falten de `0005`–`0008` siguiendo sus secciones.
- **No se deshace.** PostgreSQL no permite quitar un valor de un enum. La vuelta atrás es reactivar la versión anterior del Worker, no revertir la migración.

1. Revisar `drizzle/0009_chilly_patriot.sql`: solo contiene cinco sentencias (dos `ALTER TYPE "public"."staff_role" ADD VALUE`, `ALTER TABLE "trips" ADD COLUMN "organizer_id" text`, la clave foránea `trips_organizer_id_profiles_user_id_fk` y `CREATE INDEX "trips_organizer_idx"`). No hay cambios en `profiles`, `staff_assignments` ni `staff_invitations`. `grep -inE 'neon_auth|drop|create schema' drizzle/0009_chilly_patriot.sql` no devuelve nada.
2. Comprobar el estado de esa rama: `SELECT to_regclass('public.profiles'), to_regclass('public.trips'), to_regclass('public.trip_offers');` no devuelve ningún `NULL` (si falta alguna anterior, aplicarla antes siguiendo su sección), y `SELECT enum_range(NULL::staff_role);` devuelve `{commercial,admin}`. Si ya incluye `super_admin` y `organizer`, la `0009` ya está aplicada: no repetirla.
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0009` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0009_chilly_patriot.sql`. `ALTER TYPE … ADD VALUE` puede ir dentro de una transacción (PostgreSQL 12 o superior) porque la migración no usa los valores nuevos.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar el resultado:
   - `SELECT enum_range(NULL::staff_role);` devuelve `{commercial,admin,super_admin,organizer}`;
   - `SELECT conname FROM pg_constraint WHERE conrelid = 'public.trips'::regclass AND contype = 'f';` incluye `trips_organizer_id_profiles_user_id_fk`;
   - `SELECT to_regclass('public.trips_organizer_idx');` no devuelve `NULL`;
   - `SELECT count(*) FROM trips WHERE organizer_id IS NOT NULL;` devuelve 0.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

### Scripts manuales

Se ejecutan con psql y `DATABASE_MIGRATION_URL`, cada uno en una transacción y con `ON_ERROR_STOP`. Primero en una rama de desarrollo; en `production`, solo con autorización explícita. Las instrucciones completas están en la cabecera de cada archivo.

- **Bootstrap de un admin o del super admin** ([`scripts/sql/bootstrap-admin.sql`](scripts/sql/bootstrap-admin.sql)). La cuenta debe existir en Clerk con el correo primario verificado; el `user_id` exacto (`user_…`) y el correo se copian del panel de Clerk (Users → la cuenta). El script no comprueba la verificación. Crea o reutiliza el perfil e inserta una asignación activa con `granted_by = NULL`: `admin` por defecto, o `super_admin` con `-v role=super_admin` (requiere `0009` en esa rama). Falla sin cambiar nada si `user_id`, `email` o `reason` están vacíos, si `role` no es `admin` ni `super_admin`, o si ya tiene ese rol activo. Las cuentas de staff que ya existen en `production` tienen ids de Neon Auth: se pasan a Clerk con el remapeo (abajo), no con este script. Para el super admin, ver [Alta del super admin](#alta-del-super-admin).

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v user_id='<user_id exacto de Clerk>' -v email='<correo>' \
    -v reason='<operador>: <motivo>' [-v role=super_admin] -f scripts/sql/bootstrap-admin.sql
  ```

- **Revocación de emergencia** ([`scripts/sql/revoke-staff-role.sql`](scripts/sql/revoke-staff-role.sql)). Marca `revoked_at` en la asignación activa y devuelve la fila; 0 filas significa que no había nada que revocar. **No protege al último admin:** en condiciones normales, revocar desde el CRM. **Sí protege al último super admin:** con `role='super_admin'` bloquea las asignaciones `super_admin` activas antes de contarlas y, si el objetivo es el último, falla con "no se puede revocar el último super_admin" sin cambiar nada. `organizer` y `super_admin` requieren `0009` en esa rama.

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v user_id='<user_id exacto de Clerk>' \
    -v role='<commercial|organizer|admin|super_admin>' -f scripts/sql/revoke-staff-role.sql
  ```

- **Remapeo de una cuenta de Neon Auth a Clerk** ([`scripts/sql/remap-user-id.sql`](scripts/sql/remap-user-id.sql)). Una ejecución por persona: crea el perfil con el `user_…` de Clerk, mueve a él todas las referencias del id antiguo y borra el perfil antiguo. Ver [Remapeo de cuentas de Neon Auth a Clerk](#remapeo-de-cuentas-de-neon-auth-a-clerk).

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v old_user_id='<id de Neon Auth>' -v new_user_id='<user_id exacto de Clerk>' \
    -f scripts/sql/remap-user-id.sql
  ```

- **Seed de viajes en borrador para un organizador** ([`scripts/sql/seed-trips.sql`](scripts/sql/seed-trips.sql)). **Preparado, sin ejecutar:** solo cuando exista el organizador al que se asociarán. Ver [Seed de viajes](#seed-de-viajes-pendiente-de-ejecutar).

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v organizer_email='<correo del organizador>' -f scripts/sql/seed-trips.sql
  ```

### Alta del super admin

El super admin es `linderhassinger01@gmail.com`. El rol `super_admin` tiene todos los permisos del CRM y, según [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md), es el único que invita, asigna y revoca administradores y organizadores desde `/crm/admin/usuarios`. **El CRM nunca asigna ni revoca `super_admin`:** solo `bootstrap-admin.sql` y `revoke-staff-role.sql`. Puede haber más de un super admin: una cuenta de staff existente también puede recibir el rol, pero solo **después** de su remapeo (paso 8 de [Puesta en producción de Clerk](#puesta-en-producción-de-clerk)).

Requisitos previos, en la rama de Neon donde se vaya a dar el alta:

1. La migración `0009` está aplicada (paso 6 de [Migración de roles y organizador](#migración-de-roles-y-organizador-0009)). Sin ella, el script falla al convertir `super_admin` al enum.
2. Linder crea su cuenta con Clerk en `/crm/acceso` con ese correo y la verifica con el código.
3. El usuario copia del panel de Clerk (Users → la cuenta) el `user_id` exacto, que empieza por `user_`, y comprueba que el correo primario es `linderhassinger01@gmail.com` y está verificado. Las instancias de desarrollo y de producción de Clerk tienen usuarios e ids distintos: en una rama de desarrollo se usa el id de la instancia de desarrollo y en `production`, el de la de producción.

Alta (primero en una rama de desarrollo; en `production`, solo con autorización explícita y en el paso 7 de [Puesta en producción de Clerk](#puesta-en-producción-de-clerk), cuando Linder ya pueda crear su cuenta en la instancia de producción de Clerk):

```sh
psql "$DATABASE_MIGRATION_URL" \
  -v user_id='<user_id exacto de Clerk: user_…>' \
  -v email='linderhassinger01@gmail.com' \
  -v reason='<operador>: alta del super admin' \
  -v role=super_admin \
  -f scripts/sql/bootstrap-admin.sql
```

Devuelve una fila con `role = super_admin`. Comprobación: `SELECT user_id, role, granted_by, reason FROM staff_assignments WHERE role = 'super_admin' AND revoked_at IS NULL;` devuelve una fila por super admin (la primera vez, una sola), con ese `user_id` y `granted_by` nulo. Con el código de Clerk en ese entorno, su sesión obtiene `200` en `GET /api/crm/me` con `super_admin` en `staffRoles`.

**Sustituir o revocar al super admin (emergencia).** Como el script se niega a revocar al último `super_admin` activo, primero se da de alta al sustituto con `bootstrap-admin.sql -v role=super_admin` y después se revoca al anterior con `revoke-staff-role.sql -v role=super_admin`. La revocación se aplica en la siguiente petición al CRM.

**Qué no hacer:**

- Asignar `super_admin` con un `INSERT` a mano, desde el CRM o con metadatos de Clerk (`publicMetadata`, `unsafeMetadata`): los roles solo se leen de Neon y solo se asignan con `bootstrap-admin.sql`.
- Elegir la cuenta por ser el primer registro o por coincidir el correo, o mezclar ids de las instancias de desarrollo y producción de Clerk: siempre el `user_id` exacto copiado del panel.
- Ejecutar los scripts o la migración con `DATABASE_URL` (runtime), o entregar `DATABASE_MIGRATION_URL` al Worker o a n8n.
- Aplicar `0009` o ejecutar los scripts en `production` sin autorización explícita, editar `0009` después de aplicarla en alguna rama, o intentar deshacerla.
- Desplegar el código de la Fase 3 en un entorno cuya rama de Neon no tenga `0009`.
- Modificar el schema `neon_auth`.

### Rol organizador

Especificado en [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md) (Fases 3–5). Es para quien organiza eventos en la plataforma: gestiona **sus propios viajes** (`trips`) y nada más.

- **Qué puede hacer (Fase 5):** en `/crm` ve "Organizador" y solo el enlace "Viajes". En `/crm/viajes` crea, edita, publica, despublica y archiva los viajes cuyo `trips.organizer_id` es su `user_id`. Los viajes que crea se guardan en borrador con su id; el formulario nunca fija el organizador (si el envío trae un `organizerId`, se ignora). Un viaje publicado por un organizador aparece en `/viajes/<slug>` como cualquier otro.
- **Viajes ajenos:** se comportan como inexistentes. No aparecen en su lista, `/crm/viajes/<id>` responde 404, editarlos devuelve "no encontrado" y publicarlos, despublicarlos o archivarlos devuelve una transición no válida.
- **Qué no puede hacer:** ver ni gestionar leads, reservas, ofertas y tipo de cambio (`/crm/ofertas`) ni el staff. Por eso un viaje suyo publicado se ve sin precio («Todavía no publicamos el precio de este viaje.») hasta que un admin cree y active su oferta.
- **El resto del staff:** `commercial`, `admin` y `super_admin` siguen viendo y gestionando todos los viajes, también los de los organizadores. Los viajes que crean ellos quedan sin organizador (`organizer_id` nulo). Si una persona tiene `organizer` y además otro de esos roles, ve todos los viajes.
- **Fuera del alcance:** asignar o cambiar el organizador de un viaje desde el CRM y que el organizador vea los leads o reservas de sus viajes (preguntas abiertas 5 y 6 de la spec). Los viajes nuevos de un organizador los crea él mismo o el [seed](#seed-de-viajes-pendiente-de-ejecutar); un viaje existente no cambia de organizador.

**Cómo dar el rol.** Solo un `super_admin`, desde `/crm/admin/usuarios` (un `admin` no ve la opción "Organizador", y la Server Action la rechaza aunque se envíe a mano):

1. **Persona nueva:** en "Invitar", su correo y el rol "Organizador". Compartir a mano el enlace `<APP_ORIGIN>/crm/acceso`; la invitación caduca a los 7 días.
2. La persona crea su cuenta en `/crm/acceso` **con ese mismo correo** y lo verifica con el código. En su primera entrada se acepta la invitación (se crean su perfil y su asignación) y `/crm` muestra "Organizador".
3. **Persona que ya es staff:** en "Equipo activo", "Asignar Organizador" en su fila.
4. **Quitar el rol:** "Revocar Organizador" en su fila; se aplica en la siguiente petición. Sus viajes conservan su `organizer_id` y los sigue gestionando el resto del staff.

Comprobación: `SELECT p.user_id, p.email FROM profiles p JOIN staff_assignments sa ON sa.user_id = p.user_id WHERE sa.role = 'organizer' AND sa.revoked_at IS NULL;` lista a los organizadores activos.

### Remapeo de cuentas de Neon Auth a Clerk

Las cuentas de staff creadas con Neon Auth tienen en `profiles` un id que Clerk nunca emitirá, así que tras el cambio esas personas ven "sin acceso". [`scripts/sql/remap-user-id.sql`](scripts/sql/remap-user-id.sql) pasa cada cuenta a su nuevo `user_…` de Clerk y **conserva sus roles y la autoría** de sus datos (Decisión D8 de [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md)). Se ejecuta una vez por persona, en el paso 8 de [Puesta en producción de Clerk](#puesta-en-producción-de-clerk); primero en una rama de desarrollo (con ids de la instancia de desarrollo de Clerk) y en `production` solo con autorización explícita.

Qué hace, en una sola transacción:

- valida los dos ids: no vacíos, distintos y exactamente uno con formato de Clerk (`user_` seguido de letras y números); `old_user_id` debe tener perfil y `new_user_id` no;
- crea el perfil nuevo con el correo (y la fecha de alta) del antiguo;
- cambia el id en **todas** las columnas de `public` con clave foránea hacia `profiles(user_id)`, que descubre en `pg_constraint` (roles, invitaciones, viajes, campañas, ofertas, tipo de cambio, leads y sus actividades, reservas, pagos, avisos, y las que añadan otras ramas), y en `bookings.runner_user_id`, que no tiene clave foránea. No toca `updated_at`;
- borra el perfil antiguo y muestra cuántas filas cambió por columna;
- no lee ni modifica `neon_auth`. Si quedara una referencia fuera de `public`, el borrado falla y no cambia nada.

`lead_activities` es de solo inserción, pero su `actor_user_id` también cambia: es la misma persona con otra identidad.

Para cada persona:

1. Listar las cuentas pendientes y sus roles activos:

   ```sql
   SELECT p.user_id, p.email,
          array_agg(a.role ORDER BY a.role) FILTER (WHERE a.revoked_at IS NULL) AS roles
     FROM profiles p
     LEFT JOIN staff_assignments a ON a.user_id = p.user_id
    WHERE p.user_id NOT LIKE 'user\_%'
    GROUP BY p.user_id, p.email
    ORDER BY p.email;
   ```

2. La persona crea su cuenta en `/crm/acceso` con **el mismo correo** que muestra la consulta y la verifica con el código; verá "sin acceso".
3. En el panel de Clerk (Users → la cuenta), comprobar que el correo primario es ese y está verificado, y copiar su `user_…`. El script no lo comprueba.
4. Comprobar que esa cuenta de Clerk aún no tiene perfil: `SELECT user_id FROM profiles WHERE user_id = '<user_…>';` devuelve 0 filas. Si devuelve una (por ejemplo, porque aceptó una invitación nueva o ya se le dio un rol), el script se niega: usar la alternativa de abajo.
5. Ejecutar:

   ```sh
   psql "$DATABASE_MIGRATION_URL" \
     -v old_user_id='<user_id de la consulta del paso 1>' \
     -v new_user_id='<user_id exacto de Clerk: user_…>' \
     -f scripts/sql/remap-user-id.sql
   ```

   Devuelve una fila por columna con las filas cambiadas y el perfil nuevo. Si algo falla, no cambia nada.
6. La persona recarga `/crm` y ve su rol; sus leads y viajes conservan la autoría. La consulta del paso 1 ya no la lista.

Notas:

- **Idempotente:** repetirlo con los mismos ids falla con "el remapeo ya se hizo" sin cambiar nada.
- **Deshacer:** el mismo script con los ids intercambiados (`old_user_id` = el `user_…`, `new_user_id` = el id de Neon Auth). Lo usa la [vuelta atrás](#vuelta-atrás).
- **Bloqueos:** espera como mucho 10 s por filas bloqueadas; si se agota, falla sin cambiar nada y se puede repetir.
- **Roles nuevos después:** dar `super_admin` u otro rol a esa persona solo después del remapeo, con su `user_…`.
- **Alternativa sin script:** el super admin vuelve a invitar a la persona. Su perfil antiguo queda como histórico inaccesible, con la autoría a su nombre antiguo, y hay que revocar a mano sus asignaciones antiguas con `revoke-staff-role.sql` (con el id de Neon Auth) para que no cuenten en la protección del último admin.
- Las invitaciones pendientes de la etapa de Neon Auth siguen siendo válidas: van por correo.
- Los runners no tienen perfil, así que el script no los remapea: ver el paso 9 del runbook.

### Checklist manual

En la máquina del usuario, con su autorización, en una rama Neon de desarrollo y nunca en `production`:

- [ ] Se aplica la migración y el volcado del schema `neon_auth` es idéntico antes y después.
- [ ] Bootstrap del primer admin → `GET /api/crm/me` responde 200.
- [ ] Invitar → crear la cuenta y verificar con código → 200 `commercial`. La cuenta se crea con el `<SignIn>` de Clerk (instancia de desarrollo). Confirma también que la aceptación crea perfil y asignación en la misma sentencia.
- [ ] Revocar el rol → 403 en la siguiente petición.
- [ ] Dos revocaciones concurrentes del penúltimo y del último admin → solo una tiene éxito.

## Catálogo de viajes

Especificado en [`trips-catalog.md`](docs/specs/trips-catalog.md). Cada viaje tiene un `id` (UUID inmutable, para vincular leads en el futuro), un `slug` público (`/viajes/<slug>`) y un estado: `draft` (borrador), `published` (publicado) o `archived` (archivado, final). Solo la landing lee los publicados; los viajes no se borran, se archivan.

### Cómo se cargan los datos

- El equipo crea y mantiene los viajes desde **`/crm/viajes`** (crear, editar, publicar, despublicar y archivar). La Fase 2 implementa el listado, `/crm/viajes/nuevo` y `/crm/viajes/<id>`; requieren la migración `0001` aplicada en el entorno que se utilice.
- Lo pueden hacer `commercial`, `admin` y `super_admin` con todos los viajes, y `organizer` solo con los suyos (permiso `trips.manage`; ver [Rol organizador](#rol-organizador)). Una cuenta sin rol de staff, incluidas las cuentas de runner de la landing (`/cuenta`), no tiene acceso.
- Un viaje nace en borrador y no aparece en la web hasta que se publica. El `slug` solo se puede cambiar mientras está en borrador.
- Los viajes se crean desde el CRM: "Maratón de Santiago 2027" se crea desde `/crm/viajes/nuevo` con el slug exacto `maraton-santiago-2027` y 100 cupos, copiando los datos que tenía la landing. La única carga por SQL prevista es [`seed-trips.sql`](#seed-de-viajes-pendiente-de-ejecutar): manual, sin ejecutar todavía, solo inserta viajes en borrador para un organizador y nunca modifica los que ya existen.
- **El precio vive en las ofertas, no en el viaje.** El viaje es solo el catálogo descriptivo (título, fechas, distancias, qué incluye, cupos informativos…). El precio, los anticipos y las condiciones de pago se cargan, aprueban y activan como ofertas versionadas en **`/crm/ofertas`** ([`trips-commercial-offers.md`](docs/specs/trips-commercial-offers.md); ver [Ofertas comerciales](#migración-de-ofertas-comerciales-0008)). El formulario de `/crm/viajes` ya no tiene "Precio desde", "Precio total en cuotas", "Reserva", "Precio de acompañante" ni "Condiciones de pago", y la lista ya no tiene la columna "Precio".
- **Columnas antiguas de precio, solo como referencia.** Las cinco columnas `price_usd`, `deposit_usd`, `installments_price_usd`, `companion_price_usd` y `payment_terms` **siguen en la tabla `trips`, sin uso**: el código no las muestra, no las publica ni las escribe (al guardar un viaje conservan su valor) y no se publican en la web. No se migraron a ofertas porque sus importes eran contradictorios. Para consultarlas, en el SQL Editor de Neon:

  ```sql
  SELECT slug, price_usd, deposit_usd, installments_price_usd, companion_price_usd, payment_terms FROM trips;
  ```

  Borrarlas (`DROP COLUMN`) será una operación aparte, con su propia migración y autorización expresa; no forma parte de esta spec.

### Seed de viajes (pendiente de ejecutar)

Especificado en [`accounts-clerk-rbac.md`](docs/specs/accounts-clerk-rbac.md) (Fase 5, Requisito 12). [`scripts/sql/seed-trips.sql`](scripts/sql/seed-trips.sql) inserta en `trips` viajes **en borrador** ya asociados a un [organizador](#rol-organizador). **Está preparado y no se ha ejecutado en ninguna rama.** Ningún script de `package.json`, ni el build, el arranque o el setup lo ejecutan. Lo ejecuta el usuario, con su autorización, cuando exista el organizador al que se asociarán.

**Qué inserta.** Solo las carreras con datos completos en el repositorio, porque `trips` exige fecha de carrera, al menos una distancia y un resumen:

| Slug | Título | Datos |
|---|---|---|
| `maraton-santiago-2027` | Maratón de Santiago 2027 | Santiago, Chile · carrera el 2027-05-16, sin fechas de viaje · 42K · 100 cupos · 9 elementos de "Qué incluye", 2 de "No incluye" y 2 párrafos de "Detalles por confirmar" · imagen `https://carreras-viajeras.mentec.dev/images/cover-santiago.webp` · web oficial `https://maratondesantiago.cl/` |

- Los textos salen de `modules/landing/utils/trips.ts` antes de `51ceec6` (`git show 51ceec6^:modules/landing/utils/trips.ts`).
- Río, Roma, Medellín, Buenos Aires, España y EE. UU. no entran: el repositorio solo tiene sus imágenes (`carrera-*.jpeg`, `destino-*.webp`) y "Sin carrera, fecha ni precio confirmados". Se añadirán con una enmienda de la spec cuando el negocio facilite, por carrera, el nombre oficial, la ciudad, la fecha, las distancias y un resumen.
- **Sin precios.** No escribe las columnas antiguas de precio de `trips` ni crea ofertas: el precio lo carga y activa un admin en `/crm/ofertas`. Tampoco copia las condiciones de pago antiguas (`paymentNote`), que pertenecen a la oferta.

**Comportamiento.**

- `-v organizer_email` es obligatorio. Se compara recortado y en minúsculas con `profiles.email`.
- Falla **sin cambiar nada** si el correo está vacío, si falta la migración `0009` en esa rama o si no hay **exactamente un** perfil con ese correo y el rol `organizer` activo (ninguno, o más de uno). Mientras dura, bloquea esa asignación: una revocación simultánea espera a que termine.
- Inserta cada viaje con `status = 'draft'` y `organizer_id` = el `user_id` de ese perfil, en una sola transacción. No aparece en la web hasta que se publica desde `/crm/viajes`.
- Es idempotente por `slug` (`ON CONFLICT (slug) DO NOTHING`): devuelve solo las filas insertadas y repetirlo devuelve 0 filas.
- **No modifica viajes existentes.** Santiago probablemente ya existe en `production` (ver [Precondición operativa](#precondición-operativa-antes-de-mergear)): ahí el seed devuelve 0 filas para ese slug, y el viaje existente no cambia ni pasa al organizador. Asignar un viaje existente a un organizador es una operación aparte, con su propia autorización (pregunta abierta 6 de la spec).

**Cuándo y cómo ejecutarlo.**

1. **Requisitos en esa rama de Neon:** las migraciones hasta `0009` aplicadas y el código de las Fases 1–5 desplegado (o `npm run dev` contra esa rama), para que el organizador gestione sus viajes.
2. **El organizador existe:** un super admin le dio el rol ([Cómo dar el rol](#rol-organizador)), la persona creó y verificó su cuenta y `/crm` le muestra "Organizador". Esta consulta devuelve **exactamente una fila**:

   ```sql
   SELECT p.user_id, p.email
   FROM profiles p
   JOIN staff_assignments sa ON sa.user_id = p.user_id
   WHERE p.email = lower('<correo del organizador>') AND sa.role = 'organizer' AND sa.revoked_at IS NULL;
   ```

3. **Primero en una rama de desarrollo** de Neon, con el organizador de la instancia de desarrollo de Clerk:

   ```sh
   psql "$DATABASE_MIGRATION_URL" -v organizer_email='<correo del organizador>' -f scripts/sql/seed-trips.sql
   ```

4. **Verificar:**
   - la salida lista cada fila insertada (`id`, `slug`, `title`, `status = draft`, `organizer_id` = el `user_id` del paso 2);
   - `SELECT slug, status, organizer_id FROM trips WHERE organizer_id = '<user_id del paso 2>' ORDER BY slug;` devuelve esos viajes;
   - el organizador los ve en `/crm/viajes` como borradores y puede editarlos; un comercial o un admin también los ve;
   - `/viajes/<slug>` responde 404 hasta que se publique;
   - ejecutarlo otra vez devuelve 0 filas.
5. **En `production`**, solo con autorización explícita: repetir los pasos 2–4 con el organizador de la instancia de producción de Clerk. Los `user_id` de desarrollo y de producción son distintos; el script los resuelve por el correo.

**Qué no hacer.**

- Ejecutarlo antes de que exista el organizador, en `production` sin autorización o con `DATABASE_URL` (runtime) en vez de `DATABASE_MIGRATION_URL`.
- Añadirlo a `package.json`, al build, al arranque o a un setup.
- Cambiar el `ON CONFLICT` por `DO UPDATE` o usar el script para asignar viajes existentes: el seed solo inserta.
- Escribir precios en las columnas antiguas de `trips` o añadir carreras sin datos confirmados.
- Publicar los viajes con un `UPDATE` a mano: se publican desde `/crm/viajes`.
- Borrar viajes: si sobra alguno, se archiva desde `/crm/viajes`. En una rama de desarrollo también se puede restablecer la rama.

### Migración de la tabla de viajes

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff. En `production` solo se aplica `0001`.

1. Revisar `drizzle/0001_young_korvac.sql`: solo crea, en `public`, el enum `trip_status`, la tabla `trips` con sus siete CHECK y el índice único `trips_slug_uq`. No hay columna de moneda ni cambios en `profiles`, `staff_assignments` o `staff_invitations`. `grep -inE 'neon_auth|drop|create schema' drizzle/0001_young_korvac.sql` no devuelve nada.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. En el SQL Editor de Neon, con la rama `production` seleccionada, pegar el contenido del archivo entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0001_young_korvac.sql`.
4. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
5. Comprobar la tabla: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.trips'::regclass ORDER BY 1;` lista `trips_pkey` y los siete `trips_*_chk`, y `SELECT count(*) FROM trips;` devuelve 0.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

Prueba manual opcional de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`: la base debe rechazar un slug con mayúsculas o espacios, un slug duplicado, `distances` vacío, `price_usd` negativo, `capacity = 0`, un `image_url` que no empieza por `https://`, y un `start_date` sin `end_date` o con `race_date` fuera del rango del viaje.

### Migración de los campos de carrera

Especificada en [`landing-race-pages.md`](docs/specs/landing-race-pages.md) (Fase 1). Añade a `trips` siete campos opcionales: web oficial, precio total en cuotas, reserva, precio de acompañante, condiciones de pago, qué no incluye y detalles por confirmar. Desde la Fase 4 de [`trips-commercial-offers.md`](docs/specs/trips-commercial-offers.md), el CRM solo muestra y guarda la web oficial, qué no incluye y los detalles por confirmar; las cuatro columnas de precio y condiciones quedan sin uso (ver [Cómo se cargan los datos](#cómo-se-cargan-los-datos)).

Pendiente de aplicar por el usuario en `production` (y en la rama de Neon de pruebas que se use). **Orden: después de `0001` (viajes) y antes de desplegar el código de la Fase 1.** En el orden del journal de Drizzle va después de `0003` (reservas) y antes de `0005` (captura y outbox); no depende de ellas. El código lee y escribe `official_url`, `excludes` y `notes` en las consultas de `trips` (las columnas de precio y condiciones ya no se usan; ver arriba): si se despliega sin la migración, `/viajes/*` y `/crm/viajes` fallan por columnas inexistentes. Es aditiva: los viajes existentes quedan con `NULL` y `excludes = '{}'`; no cambia ninguna otra tabla (leads y reservas, que referencian `trips.id`, no se tocan). **No volver a aplicar `drizzle/0000_tough_thor.sql`** ni ninguna migración ya aplicada.

1. Revisar `drizzle/0004_sloppy_bushwacker.sql`: solo contiene `ALTER TABLE "trips" ADD COLUMN` para `official_url` (`text`), `installments_price_usd`, `deposit_usd` y `companion_price_usd` (`integer`), `payment_terms` y `notes` (`text`) y `excludes` (`text[] DEFAULT '{}' NOT NULL`), y `ADD CONSTRAINT … CHECK` para `trips_official_url_chk` (`https://`), `trips_installments_price_usd_chk`, `trips_deposit_usd_chk`, `trips_companion_price_usd_chk` (nulo o `>= 0`) y `trips_excludes_chk` (hasta 20 elementos). No hay cambios en otras tablas: `grep -inE 'neon_auth|drop|create' drizzle/0004_sloppy_bushwacker.sql` no devuelve nada y `grep -vc '^ALTER TABLE "trips" ' drizzle/0004_sloppy_bushwacker.sql` devuelve `0` (las doce sentencias empiezan por `ALTER TABLE "trips"`).
2. Comprobar que `0001` está aplicada en esa rama: `SELECT to_regclass('public.trips');` no devuelve `NULL`. Si falta, aplicarla antes siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0004` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0004_sloppy_bushwacker.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar la tabla: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.trips'::regclass ORDER BY 1;` lista `trips_pkey` y doce `trips_*_chk` (los siete de `0001` y los cinco nuevos), y `SELECT count(*) FROM trips WHERE excludes <> '{}' OR official_url IS NOT NULL;` devuelve 0.
7. Solo después, desplegar el código de la Fase 1.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

Prueba manual opcional de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`: la base debe rechazar un `official_url` que no empieza por `https://`, un `installments_price_usd`, `deposit_usd` o `companion_price_usd` negativo y un `excludes` con 21 elementos.

### Migración de ofertas comerciales (`0008`)

`drizzle/0008_moaning_roulette.sql` prepara las ofertas comerciales versionadas por carrera y el tipo de cambio USD→PEN ([`trips-commercial-offers.md`](docs/specs/trips-commercial-offers.md)). Es una sola migración para todas las fases de esa spec. Está pendiente de aplicar por el usuario: **primero en una rama de pruebas de Neon** y, cuando las pruebas de abajo salgan bien, en `production`. **Tiene que estar aplicada antes de desplegar el código de la Fase 2** (el CRM de ofertas lee y escribe estas tablas; la Fase 1 no añade rutas ni consultas que se ejecuten en la web).

**El número `0008` es provisional.** El definitivo se fija solo en el turno de merge: si `main` ya tiene otra `0008`, esta se renumera (cambian el nombre del archivo, su snapshot y el journal, no el SQL). Si ya la aplicaste con el número provisional, es la misma migración: no la vuelvas a aplicar con el número nuevo.

**Orden: `0000` → … → `0007` → esta.** Necesita `0007` (la tabla `campaigns`) y, a través de ella, `0001` (`trips`) y `0000` (`profiles`). En `production` siguen pendientes `0005`, `0006` y `0007`: se aplican antes, en ese orden y **cada una en sus dos bloques**, siguiendo [Migración de captura y outbox](#migración-de-captura-y-outbox), [Migración de origen, seguimiento y reservas (`0006`)](#migración-de-origen-seguimiento-y-reservas-0006) y [Migración de campañas y registro](#migración-de-campañas-y-registro). No volver a aplicar `0000` ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace** (todo en `public`):

- crea el enum `trip_offer_status` (`draft`, `approved`, `active`, `closed`);
- crea la tabla `trip_offers`: una fila por **versión** de la oferta de un viaje (sin campaña = oferta general; con campaña = oferta de esa campaña). Precio total y descuento en USD enteros, `final_price_usd` calculado por la base (columna generada `total_price_usd - discount_usd`), de 0 a 3 anticipos (`deposit_options_usd`), fecha límite del saldo, bono sin importes, vigencia en fechas de Lima, cupos opcionales, `terms_version`, condiciones, estado y auditoría (quién y cuándo creó, aprobó, activó y cerró, y qué versión la sustituyó). Tiene:
  - trece CHECK: `trip_offers_version_chk`, `trip_offers_name_chk` (2–80), `trip_offers_price_chk` (total entre 1 y 1,000,000 y descuento menor que el total), `trip_offers_deposits_chk` (hasta 3, sin nulos, mayores que 0 y menores que el precio final), `trip_offers_balance_chk` (fecha de saldo si y solo si hay anticipos), `trip_offers_bonus_chk` (2–200), `trip_offers_validity_chk` (`valid_until ≥ valid_from`), `trip_offers_capacity_chk` (1–10,000), `trip_offers_terms_version_chk` (minúsculas, números y guiones, 3–60), `trip_offers_conditions_chk` (10–2000) y los tres de auditoría: `trip_offers_approved_chk`, `trip_offers_activated_chk` y `trip_offers_closed_chk` (**una versión aprobada o activa siempre tiene quién y cuándo la aprobó, una activa quién y cuándo la activó, y solo una cerrada que estuvo activa puede tener `superseded_by`**);
  - siete claves foráneas `ON DELETE restrict`: el viaje, cuatro hacia `profiles` (autor, aprobación, activación y cierre), la autorreferencia `superseded_by` y la compuesta `trip_offers_campaign_trip_fk (campaign_id, trip_id) → campaigns (id, trip_id)`, que garantiza que la campaña es del mismo viaje;
  - el índice `trip_offers_trip_idx` y seis índices únicos parciales, en pares (general por viaje, campaña por campaña): `trip_offers_general_version_uq` y `trip_offers_campaign_version_uq` (números de versión únicos en su ámbito), `trip_offers_general_active_uq` y `trip_offers_campaign_active_uq` (**una sola versión activa por ámbito**) y `trip_offers_general_pending_uq` y `trip_offers_campaign_pending_uq` (una sola versión pendiente, borrador o aprobada, por ámbito);
- crea la tabla `exchange_rates` (solo inserciones: soles por 1 USD en `numeric(10,4)`, quién lo fijó y desde cuándo rige), con el CHECK `exchange_rates_usd_pen_chk` (mayor que 0 y menor que 100), la clave foránea hacia `profiles` y el índice `exchange_rates_created_idx`;
- añade a `campaigns` la restricción única `campaigns_id_trip_uq (id, trip_id)`, destino de la clave foránea compuesta. Es aditiva: `id` ya es único, así que no cambia nada de las campañas existentes.

No migra los precios antiguos de `trips` (`price_usd`, `deposit_usd`, etc.): las dos tablas nuevas quedan vacías y el admin carga las ofertas desde el CRM.

Revisión previa:

- `grep -inE 'neon_auth|create schema|drop |add value' drizzle/0008_moaning_roulette.sql` no devuelve nada: no hay `DROP`, ni `ALTER TYPE … ADD VALUE`, ni nada en `neon_auth`;
- `grep -E '^(ALTER|CREATE) ' drizzle/0008_moaning_roulette.sql | grep -vE '"(trip_offers|exchange_rates|trip_offer_status)"'` devuelve solo la línea de `campaigns_id_trip_uq`: no toca `trips`, `leads`, `bookings`, `profiles`, `staff_*` ni `outbox_events`.

**Un solo bloque, con el archivo tal cual.** No hay `ADD VALUE` (solo se crea un enum nuevo), así que todo va en una transacción. drizzle-kit escribía la restricción de `campaigns` al final, después de la clave foránea compuesta que la necesita; en el archivo ya está movida a mano a la primera sentencia, con un comentario que lo explica: como en `0006` y `0007`, el archivo lleva una edición manual comentada. El snapshot y el journal no cambian.

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0007` ya está aplicada en esa rama y que esta **no** lo está: `SELECT to_regclass('public.campaigns'), to_regclass('public.trip_offers');` devuelve `campaigns` y `NULL`.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. Escribir `BEGIN;`, debajo el archivo `drizzle/0008_moaning_roulette.sql` completo y, al final, `COMMIT;`, y ejecutarlo todo junto. Las líneas `--> statement-breakpoint` y los comentarios `--` son comentarios de SQL y se pueden dejar.

   Alternativa con terminal (Linux/WSL):

   ```sh
   F=drizzle/0008_moaning_roulette.sql
   psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f "$F"
   ```

   `-1` lo ejecuta todo en una sola transacción. Si el número cambia en el turno de merge, usar el nombre nuevo del archivo en `F`.

   Si falla, la transacción se deshace entera y no se guarda nada. Errores que se pueden ver:
   - `relation "campaigns" does not exist`: falta `0007` en esa rama; aplicarla antes.
   - `relation "campaigns_id_trip_uq" already exists`: ya existe la restricción de `campaigns`. Repetir la consulta del paso 1: si `trip_offers` ya no es `NULL`, la migración ya estaba aplicada y no hay que repetir nada; si sigue en `NULL`, alguien creó la restricción por otra vía y hay que revisarlo antes de seguir.
   - cualquier otro `already exists` (por ejemplo, `type "trip_offer_status" already exists`) o cualquier otro error: la rama no está en el estado esperado. No es la migración ya aplicada; parar y revisar.
4. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
5. Comprobar:
   - el enum: `SELECT enum_range(NULL::trip_offer_status);` devuelve `{draft,approved,active,closed}`;
   - las restricciones de `trip_offers`: `SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.trip_offers'::regclass AND contype IN ('p','c','f');` devuelve 21 (un `*_pkey`, trece `*_chk` y siete claves foráneas);
   - las de `exchange_rates`: la misma consulta con `'public.exchange_rates'::regclass` devuelve 3 (un `*_pkey`, un `*_chk` y un `*_fk`);
   - las de `campaigns`: la misma consulta con `'public.campaigns'::regclass` y `contype IN ('p','c','f','u')` devuelve 10 (las 9 de `0007` más `campaigns_id_trip_uq`);
   - la columna generada: `SELECT attname FROM pg_attribute WHERE attrelid = 'public.trip_offers'::regclass AND attgenerated = 's';` devuelve `final_price_usd`;
   - los índices: `SELECT indexname FROM pg_indexes WHERE tablename IN ('trip_offers', 'exchange_rates') ORDER BY 1;` devuelve los diez: `exchange_rates_created_idx`, `exchange_rates_pkey`, `trip_offers_campaign_active_uq`, `trip_offers_campaign_pending_uq`, `trip_offers_campaign_version_uq`, `trip_offers_general_active_uq`, `trip_offers_general_pending_uq`, `trip_offers_general_version_uq`, `trip_offers_pkey` y `trip_offers_trip_idx`;
   - los datos: `SELECT count(*) FROM trip_offers;` y `SELECT count(*) FROM exchange_rates;` devuelven 0.
6. Solo después, desplegar el código de la Fase 2.

Prueba manual de las restricciones, **solo en la rama de pruebas de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (nada queda guardado). Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite ejecutar todo seguido; en el SQL Editor, pegar la preparación, **un solo caso** y `ROLLBACK;`, ejecutar, y repetir con el siguiente caso.

Preparación (todo esto se **acepta**: un perfil, dos viajes de prueba con una campaña cada uno, la oferta general activa del viaje A con dos anticipos, su borrador v2, una oferta de campaña activa del mismo viaje y un tipo de cambio). La consulta final devuelve tres filas: general v1 `active` con precio final 1800, general v2 `draft` con 1900 y campaña v1 `active` con 1700:

```sql
BEGIN;
INSERT INTO profiles (user_id, email) VALUES ('test-ofertas', 'ofertas@example.com');
INSERT INTO trips (id, slug, title, city, country, race_date, distances, summary) VALUES
  ('00000000-0000-4000-8000-000000000001', 'prueba-ofertas-a', 'Maratón de prueba A', 'Santiago', 'Chile', '2027-04-25', ARRAY['42K'], 'Viaje de prueba A'),
  ('00000000-0000-4000-8000-000000000002', 'prueba-ofertas-b', 'Maratón de prueba B', 'Lima', 'Perú', '2027-05-16', ARRAY['42K'], 'Viaje de prueba B');
INSERT INTO campaigns (id, code, trip_id, channel, name, created_by) VALUES
  ('00000000-0000-4000-8000-000000000011', 'prueba-oferta-a', '00000000-0000-4000-8000-000000000001', 'event', 'Campaña A', 'test-ofertas'),
  ('00000000-0000-4000-8000-000000000012', 'prueba-oferta-b', '00000000-0000-4000-8000-000000000002', 'event', 'Campaña B', 'test-ofertas');
-- Oferta general del viaje A, activa (v1), con dos anticipos.
INSERT INTO trip_offers (id, trip_id, version, status, name, total_price_usd, discount_usd, deposit_options_usd, balance_due_on, valid_from, terms_version, conditions, created_by, approved_by, approved_at, activated_by, activated_at) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 1, 'active', 'General A', 2000, 200, '{100,200}', '2027-03-15', '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now(), 'test-ofertas', now());
-- Borrador v2 de esa oferta general (la versión pendiente de su ámbito).
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES
  ('00000000-0000-4000-8000-000000000001', 2, 'General A v2', 1900, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- Oferta de campaña del mismo viaje, activa (v1).
INSERT INTO trip_offers (trip_id, campaign_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, approved_by, approved_at, activated_by, activated_at) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 1, 'active', 'Campaña A', 1700, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now(), 'test-ofertas', now());
INSERT INTO exchange_rates (usd_pen, created_by) VALUES (3.7512, 'test-ofertas');
SELECT campaign_id IS NOT NULL AS campana, version, status, final_price_usd FROM trip_offers ORDER BY 1, 2;
```

Casos que la base debe **rechazar**, uno por ejecución; el error debe nombrar la restricción indicada en el comentario:

```sql
-- trip_offers_approved_chk: aprobada sin approved_at
INSERT INTO trip_offers (trip_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'approved', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_activated_chk: activa sin approved_at (con activated_at)
INSERT INTO trip_offers (trip_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, activated_by, activated_at) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'active', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now());
-- trip_offers_activated_chk: activa sin activated_at (aprobada)
INSERT INTO trip_offers (trip_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, approved_by, approved_at) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'active', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now());
-- trip_offers_activated_chk: pasar el borrador v2 a activa sin auditoría
UPDATE trip_offers SET status = 'active' WHERE version = 2 AND campaign_id IS NULL;
-- trip_offers_price_chk: repetir cambiando el descuento 2000 por 2500 (descuento > total), y con total 0 y descuento 0
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, discount_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_deposits_chk: repetir cambiando '{0}' por '{2000}' (≥ precio final), '{100,NULL}' y '{100,200,300,400}'
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, deposit_options_usd, balance_due_on, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, '{0}', '2027-03-15', '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_balance_chk: anticipos sin fecha de saldo
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, deposit_options_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, '{100}', '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_balance_chk: fecha de saldo sin anticipos
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, balance_due_on, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, '2027-03-15', '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_validity_chk: valid_until anterior a valid_from
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, valid_from, valid_until, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, '2026-11-01', '2026-10-31', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_terms_version_chk: terms_version con mayúsculas
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, '2026-11-01', 'Prueba-V1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_campaign_trip_fk: oferta del viaje A con la campaña del viaje B
INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000012', 1, 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_general_active_uq: otra general activa del viaje A
INSERT INTO trip_offers (trip_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, approved_by, approved_at, activated_by, activated_at) VALUES ('00000000-0000-4000-8000-000000000001', 3, 'active', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now(), 'test-ofertas', now());
-- trip_offers_campaign_active_uq: otra activa de la misma campaña
INSERT INTO trip_offers (trip_id, campaign_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, approved_by, approved_at, activated_by, activated_at) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 2, 'active', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now(), 'test-ofertas', now());
-- trip_offers_general_pending_uq: otro borrador general del viaje A
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000001', 3, 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_campaign_pending_uq: dos borradores de la misma campaña (ejecutar las dos líneas juntas)
INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 2, 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 3, 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas');
-- trip_offers_general_version_uq: otra v1 general del viaje A (cerrada, para no chocar con las otras reglas)
INSERT INTO trip_offers (trip_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, closed_by, closed_at) VALUES ('00000000-0000-4000-8000-000000000001', 1, 'closed', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now());
-- trip_offers_campaign_version_uq: otra v1 de la misma campaña (cerrada)
INSERT INTO trip_offers (trip_id, campaign_id, version, status, name, total_price_usd, valid_from, terms_version, conditions, created_by, closed_by, closed_at) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 1, 'closed', 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', 'test-ofertas', now());
-- trip_offers_closed_chk: superseded_by en una versión no cerrada
INSERT INTO trip_offers (trip_id, version, name, total_price_usd, valid_from, terms_version, conditions, created_by, superseded_by) VALUES ('00000000-0000-4000-8000-000000000002', 1, 'Prueba', 2000, '2026-11-01', 'prueba-v1', 'Condiciones de prueba.', 'test-ofertas', '00000000-0000-4000-8000-000000000101');
-- exchange_rates_usd_pen_chk: repetir cambiando 0 por 100
INSERT INTO exchange_rates (usd_pen, created_by) VALUES (0, 'test-ofertas');
ROLLBACK;
```

Si un caso se acepta, o falla por otra restricción distinta de la del comentario, no aplicar la migración en `production` y avisar antes de seguir.

### Lectura pública para la landing

El catálogo se lee con funciones de servidor, sin API HTTP (no existe `GET /api/trips`):

```ts
import {
  formatTripDate,
  formatTripDateRange,
  formatTripPrice,
  getPublishedTripBySlug,
  listPublishedTrips,
  type PublicTrip,
} from "@/modules/trips";
```

- **Solo en Server Components.** `@/modules/trips` reexporta código `server-only`: un componente de cliente recibe los datos ya formateados por props.
- `listPublishedTrips()` devuelve los viajes publicados (`PublicTrip[]`), ordenados por fecha de carrera y slug.
- `getPublishedTripBySlug(slug)` devuelve el viaje publicado o `null` si el slug no existe, no es válido, o el viaje está en borrador o archivado. **`null` → `notFound()` (404).**
- Ambas consultan Neon en cada petición (`connection()`): la página nunca se prerenderiza con datos de la base. No usar `generateStaticParams` sobre el catálogo ni `revalidatePath`; un viaje publicado aparece en la siguiente carga.
- `PublicTrip` solo tiene campos públicos: `slug`, `title`, `city`, `country`, `raceDate`, `startDate`, `endDate`, `distances`, `summary`, `includes`, `capacity` e `imageUrl`, más `officialUrl`, `excludes` y `notes` (sin `id`, `status`, fechas de auditoría ni precios: el precio público es la oferta vigente, que se lee con `getPublicOffer`). Las fechas son `YYYY-MM-DD`; `startDate` y `endDate` vienen las dos o ninguna.
- Campos opcionales de la migración `0004`: `officialUrl` es la web oficial de la carrera (URL `https://` externa o `null`); `notes` (detalles por confirmar) es texto de hasta 1000 caracteres con saltos de línea, o `null`; `excludes` (qué no incluye) es una lista de hasta 20 elementos, `[]` si está vacía, como `includes`.
- Formato: `formatTripDate("2027-04-25")` → "25 de abril de 2027"; `formatTripDateRange(startDate, endDate)` → "23–27 de abril de 2027" (solo si ambas no son `null`); `formatTripPrice(1990)` → "US$ 1,990" (formatea los importes de las ofertas; su rama `null`, "Precio a consultar", ya no se usa en la web). Destino: "Ciudad, País". La imagen es una URL `https://` externa: `<img>` o `next/image` con `unoptimized`.
#### Qué usa hoy la landing

Especificado en [`landing-race-pages.md`](docs/specs/landing-race-pages.md) (Fase 2), que sustituye en `/viajes/[slug]` lo descrito en [`landing-public-site.md`](docs/specs/landing-public-site.md) (Fase 4). El bloque de precio lo enmienda [`trips-commercial-offers.md`](docs/specs/trips-commercial-offers.md) (Fase 3).

- **Una landing por carrera publicada:** cada viaje publicado en `/crm/viajes` tiene su página en `/viajes/<slug>`, sin tocar código ni redesplegar. Para difundir una carrera nueva se comparte esa URL (no hay listado `/viajes` ni enlaces desde `/` a carreras distintas de Santiago).
- **El contenido sale del catálogo:** `getCatalogTrip(slug)` (`modules/landing/utils/catalogTrip.ts`) llama a `getPublishedTripBySlug` y convierte el `PublicTrip` en la vista que pinta la plantilla (fechas y cupos formateados; `notes` dividido en un párrafo por línea no vacía). No lee `TRIPS`.
- **El precio sale de las ofertas, no de `trips`:** los campos de precio de `trips` (`price_usd`, `deposit_usd`, `installments_price_usd`, `companion_price_usd` y `payment_terms`) **ya no se publican**, aunque tengan valor: `TripLanding` ya no los tiene. El precio de la página es la oferta comercial vigente que el admin aprobó y activó en `/crm/ofertas` (ver [Ofertas comerciales](#migración-de-ofertas-comerciales-0008)).
- **Plantilla única y minimalista** (`modules/landing/components/TripDetail.tsx`, Server Component): una columna centrada con cabecera ("Ciudad, País · distancias", título, resumen e imagen si hay `imageUrl`), datos clave (carrera, viaje o "Fechas por confirmar", distancias, cupos o "Cupos por confirmar", web oficial si hay), la sección de precio (bloque financiero o aviso sin oferta, ver abajo) y después "Qué incluye", "No incluye" y "Detalles por confirmar", cada uno solo si tiene datos (con o sin oferta). Ningún bloque aparece vacío.
- **Bloque financiero** (`OfferSummary`, Server Component presentacional): `getCatalogOffer(slug, código)` (`modules/landing/utils/catalogOffer.ts`, con `cache` de React) llama a `getPublicOffer` de `@/modules/trips` (una sola consulta: oferta vigente y último tipo de cambio) y la convierte con la función pura `toOfferView`. Muestra «Precio y condiciones»:
  - precio total, descuento (solo si es mayor que 0) y precio final, en USD con su importe en soles entre paréntesis;
  - cada anticipo permitido con su saldo (precio final − anticipo) y la fecha límite del saldo, y «El anticipo se descuenta del precio final.»; sin anticipos, «Pago único del precio final.»;
  - el beneficio, si hay: «Beneficio incluido: <texto>. No es un descuento ni se canjea por dinero.»;
  - la vigencia («Precio válido: <rango> (hora de Lima).» o «Precio vigente desde el <fecha>.»);
  - las condiciones de pago y cancelación (un párrafo por línea) y «Versión de las condiciones: <terms_version>»;
  - la regla del tipo de cambio con el tipo vigente y su fecha (día de Lima). Sin ningún tipo de cambio, solo dólares y «El importe en soles se mostrará antes de pagar.». **Ese texto es provisional** hasta las puertas P-L/P-T (pregunta abierta 1 de la spec); se sustituye en `OfferSummary.tsx` en modo build.

  Cada importe en soles se calcula por separado con `usdToPenCents` (`lib/currency.ts`, aritmética entera, redondeo half-up), así que la suma de dos importes convertidos puede diferir en 1 céntimo de la conversión de su suma. El bloque no tiene botón de pago ni de reserva, ni cupos de la oferta, ni el nombre interno ni la campaña.
- **Qué oferta se muestra (la decide el servidor):** con `?c=<código>` y una oferta de esa campaña activa, vigente (hoy en hora de Lima entre `valid_from` y `valid_until`), de una campaña activa y de la misma carrera, se muestra esa; si no, la oferta general vigente; si tampoco hay, ninguna. Nunca se suman dos ofertas. `?c=` solo **elige** entre ofertas aprobadas y activadas: una campaña cerrada, inexistente o de otra carrera se trata como sin campaña. Cualquier otro parámetro (`price`, `discount`, `deposit`, `offer`, `offerId`, `modo`…) se ignora, y ningún importe sale de la URL ni del navegador.
- **Sin oferta aplicable** (sin ofertas, solo borradores o aprobadas, todas cerradas o la activa vencida): la sección de precio muestra solo «Todavía no publicamos el precio de este viaje.», sin importes, «Desde», «Reserva con», anticipos ni beneficios.
- **Registro de la carrera** (`/viajes/<slug>/registro`): el mismo bloque aparece entre el encabezado y el formulario, con la misma oferta (también según `?c=`); sin oferta no hay bloque, y con `?modo=stand` nunca. «Ver el paquete completo» conserva `?c=`, así que lleva a la misma oferta.
- **Consulta por WhatsApp:** el botón "Consultar por WhatsApp" abre `https://wa.me/51938127170?text=…` en una pestaña nueva con el mensaje de `buildTripInquiryMessage` (`modules/landing/utils/inquiry.ts`): título, fecha de la carrera y lugar, **sin precio** (así no queda desfasado si el equipo lo cambia). La página no enlaza a `/contacto` ni al registro de la carrera (ver [Campañas, QR y modo stand](#campañas-qr-y-modo-stand)).
- **Metadatos:** `<title>` es el título del viaje, la meta description es el resumen y `og:image` es `imageUrl` solo si existe.
- **404:** si el slug no es válido, el viaje no existe o está en borrador o archivado, `getPublishedTripBySlug` devuelve `null` y `notFound()` responde con estado `404`. Un slug mal formado no consulta Neon; uno bien formado pero inexistente sí. No hay `loading.tsx`, para que el estado no quede en `200`.
- **Una consulta por petición:** `getCatalogTrip` va envuelta en `cache` de React; `generateMetadata` y la página comparten el resultado. La página lee además la oferta (`getCatalogOffer`) en paralelo.
- **Errores de la base:** se propagan sin capturar y muestran la página de error por defecto de Next (sin el mensaje original en producción). No hay `error.tsx` en `app/viajes/`.
- **`/` no consulta Neon:** sigue estática y `TRIPS` (`modules/landing/utils/trips.ts`) solo la alimenta a ella, con su propia copia de fecha, precio y cupos de Santiago, igual que los literales "US$1,499" de `MobileCta` y `HeroCarousel`. **Si el equipo cambia la fecha o los cupos de Santiago en `/crm/viajes`, o su precio en `/crm/ofertas`, hay que editar a mano esa copia de la portada**; la página del viaje sí cambia en la siguiente carga, sin redesplegar.
- `npm run build` no necesita `DATABASE_URL`: `/viajes/[slug]` y `/viajes/[slug]/registro` aparecen como dinámicas (`ƒ`).

#### Precondición operativa (antes de mergear)

Si `main` se despliega con Workers Builds, en cuanto se mergea la página pasa a leer `production`; si el despliegue es manual, se comprueba antes de `npm run deploy`. En la rama `production` de Neon:

1. **Migración `0001` aplicada** (ver "Migración de la tabla de viajes"). Comprobación: `SELECT to_regclass('public.trips');` no devuelve `NULL`. Si falta, la página responde **500**.
2. **Migración `0004` aplicada** (ver [Migración de los campos de carrera](#migración-de-los-campos-de-carrera)). Comprobación: `SELECT column_name FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'official_url';` devuelve una fila. Si falta, la página responde **500**.
3. **Viaje creado en `/crm/viajes/nuevo` y publicado**, con:
   - slug `maraton-santiago-2027` (exacto);
   - título "Maratón de Santiago 42K 2027";
   - ciudad "Santiago" y país "Chile";
   - fecha de la carrera 2027-05-16 y distancias "42K";
   - resumen **sin importes** (se pinta en la página y en la meta description, aunque no haya oferta): por ejemplo, "Corre la Maratón de Santiago 42K 2027 con Carreras Viajeras. Propuesta de viaje para runners peruanos: vuelos, alojamiento e inscripción."; si el resumen actual de Santiago ya trae precios, quitarlos en `/crm/viajes`;
   - cupos 100 (el precio desde, el precio en cuotas, la reserva, el acompañante y las condiciones de pago ya no se publican: el precio es la oferta activa de `/crm/ofertas`);
   - para no perder información respecto a la página anterior (precondición F2 de `landing-race-pages.md`): web oficial `https://maratondesantiago.cl/`, imagen con una URL `https://` (p. ej. `https://carreras-viajeras.mentec.dev/images/cover-santiago.webp`), y los textos de qué incluye, qué no incluye y detalles por confirmar que antes estaban fijos en el código (`included`, `excluded`, `prices.paymentNote` y `pendingDetails`; se recuperan con `git show dfa5d8a:modules/landing/utils/trips.ts`).

   Comprobación: `SELECT slug, status, title, race_date, price_usd, capacity FROM trips WHERE slug = 'maraton-santiago-2027';` devuelve una fila con `status = 'published'`. Si no está publicado, la página responde **404** y los enlaces de `/` ("Quiero correr Santiago", "Ver más: paquete completo", "Descubre el viaje", tarjeta de Santiago) llevan a un 404.
4. **Migración `0008` aplicada** (ver [Migración de ofertas comerciales](#migración-de-ofertas-comerciales-0008)). Comprobación: `SELECT to_regclass('public.trip_offers'), to_regclass('public.exchange_rates');` no devuelve `NULL`. Si falta, `/viajes/<slug>` y su registro responden **500** (leen la oferta en cada petición). Sin ninguna oferta activa, la página muestra «Todavía no publicamos el precio de este viaje.».
5. **Despublicar o archivar el viaje en el CRM da 404 al instante** en `/viajes/maraton-santiago-2027` y en esos enlaces de `/`. Es el comportamiento previsto. Un viaje despublicado vuelve a responder `200` al publicarlo de nuevo; el archivado es final.
6. `DATABASE_URL` ya es un Secret del Worker (lo usa el CRM); no hay variables nuevas.

## Leads (CRM comercial)

Especificado en [`crm-leads-pipeline.md`](docs/specs/crm-leads-pipeline.md). El equipo registra a mano las consultas que llegan por WhatsApp como leads y las mueve por el embudo: nuevo → contactado → cotizado → reservado → pagado / perdido. Lo pueden hacer `commercial` y `admin` (permiso `leads.manage`); una cuenta sin rol de staff no tiene acceso. Los leads no se borran: se archivan. Las páginas `/crm/leads` llegan en las fases siguientes de la spec; hoy solo existen las tablas, el permiso y el service.

### Migración de la tabla de leads

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **Orden: primero `0001` (viajes) y después `0002`**, porque `leads.trip_id` referencia `trips.id`. **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff.

1. Revisar `drizzle/0002_tough_warpath.sql`: solo crea, en `public`, los enums `lead_stage`, `lead_source` y `lead_activity_type`, las tablas `leads` (nueve CHECK) y `lead_activities` (tres CHECK), sus ocho claves foráneas (`ON DELETE restrict`, hacia `trips`, `profiles` y `leads`) y el índice `lead_activities_lead_created_idx`. No hay cambios en `profiles`, `staff_assignments`, `staff_invitations` ni `trips`. `grep -inE 'neon_auth|drop|create schema' drizzle/0002_tough_warpath.sql` no devuelve nada.
2. Si `0001` sigue pendiente en esa rama, aplicarla antes siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes). Comprobarlo con `SELECT to_regclass('public.trips');` (no debe devolver `NULL`).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0002` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0002_tough_warpath.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar las tablas: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass) AND contype IN ('p','c','f') ORDER BY 1, 2;` lista 22 restricciones (dos `*_pkey`, doce `*_chk` y ocho `*_fk`), y `SELECT count(*) FROM leads;` devuelve 0.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

Prueba manual de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`. Con un perfil de staff y un viaje de prueba creados en esa misma transacción, la base debe rechazar:

- un teléfono sin `+` o con letras, y un email con mayúsculas;
- `stage = 'lost'` sin `lost_reason`, o un `lost_reason` en otra etapa;
- un `next_action_note` sin `next_action_date`, y una próxima acción en `paid` o `lost`;
- un `archived_at` sin `archived_by`;
- un `trip_id` o un `owner_user_id` inexistentes;
- una actividad `note` sin `body` y una `stage_changed` sin `stage_from`/`stage_to`.

Un lead válido (`'+51938127170'`, email en minúsculas, `source = 'whatsapp'`, `consent_version = 'crm-manual-v1'`) y su actividad `created` sí se insertan.

### Migración de captura y outbox

`drizzle/0005_supreme_pepper_potts.sql` prepara la captura automática del formulario web y el outbox para n8n ([`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)). Está pendiente de aplicar por el usuario. **Primero se prueba en una rama de desarrollo de Neon**, y después se aplica en `production`.

**Orden: `0001` → `0002` → `0003` → `0004` → `0005`.** `0005` solo depende de `0002`, pero aplicarlas en orden evita confusiones. Hoy ninguna de las cinco está aplicada en Neon, así que en cada rama hay que aplicar, en este orden:

1. `0001` (viajes), siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes);
2. `0002` (leads), siguiendo [Migración de la tabla de leads](#migración-de-la-tabla-de-leads);
3. `0003` (reservas), siguiendo [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas);
4. `0004` (campos de carrera), siguiendo [Migración de los campos de carrera](#migración-de-los-campos-de-carrera);
5. `0005` (esta sección), **en dos bloques**.

No volver a aplicar `0000` (ya está en `production`) ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace `0005`** (todo en `public`):

- crea los enums `outbox_event_type` y `outbox_status`, y la tabla `outbox_events` (seis CHECK, la clave foránea hacia `leads` y el índice `outbox_events_ready_idx`);
- añade el tipo de actividad `automation` (`ALTER TYPE … ADD VALUE 'automation'`);
- en `leads`: el responsable (`owner_user_id`) y el autor (`created_by`) pasan a ser opcionales (los leads del formulario web nacen sin ellos), y añade `idempotency_key`, `submission_hash`, el índice único `leads_idempotency_key_uq` y los CHECK `leads_created_by_chk` y `leads_submission_chk`;
- en `lead_activities`: el autor (`actor_user_id`) pasa a ser opcional, añade `source_event_id` (clave foránea hacia `outbox_events` e índice único `lead_activities_source_event_uq`), los CHECK `lead_activities_actor_chk` y `lead_activities_event_chk`, y sustituye `lead_activities_body_chk` y `lead_activities_owner_chk`.

Revisión previa: `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0005_supreme_pepper_potts.sql` no devuelve nada. Los únicos `DROP` del archivo son tres `DROP NOT NULL` y los dos `DROP CONSTRAINT` de los CHECK sustituidos. No toca `profiles`, `staff_*`, `trips` (ni los campos de carrera de `0004`) ni las tablas de reservas de `0003`.

**Por qué en dos bloques:** PostgreSQL no deja usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos usan `'automation'`. Si se pega el archivo entero en una sola transacción, falla con `unsafe use of new value "automation"` y no se guarda nada (se puede repetir bien después).

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0002` ya está aplicada en esa rama: `SELECT to_regclass('public.leads');` no debe devolver `NULL`. Comprobar también que `0005` **no** está aplicada: `SELECT to_regclass('public.outbox_events');` debe devolver `NULL`.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. **Bloque 1.** Ejecutar solo esta línea, sin `BEGIN;` ni `COMMIT;`, y esperar a que termine:

   ```sql
   ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';
   ```

   Comprobar: `SELECT enum_range(NULL::lead_activity_type);` termina en `automation`.
4. **Bloque 2.** Copiar el contenido de `drizzle/0005_supreme_pepper_potts.sql` y **borrar la línea del paso 3** (`ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';--> statement-breakpoint`, la tercera del archivo). Pegar el resto entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Si por error se deja esa línea, la transacción falla con `enum label "automation" already exists` y no cambia nada: quitarla y repetir. Si repites todo el procedimiento y el **bloque 1** responde `already exists`, no pasa nada: el bloque 1 ya estaba aplicado; sigue directamente con el bloque 2.

   Alternativa con terminal (Linux/WSL):

   ```sh
   L="ALTER TYPE \"public\".\"lead_activity_type\" ADD VALUE 'automation';"
   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "$L"
   grep -vF "$L" drizzle/0005_supreme_pepper_potts.sql | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```
5. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar: `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass, 'public.outbox_events'::regclass) AND contype IN ('p','c','f');` devuelve 35 (tres `*_pkey`, veintidós `*_chk` y diez `*_fk`), y `SELECT count(*) FROM outbox_events;` devuelve 0.

Prueba manual de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (se pueden repetir las inserciones; nada queda guardado). Con dos perfiles de staff de prueba creados en esa misma transacción:

- la base **acepta** un lead `source = 'web_form'` sin `owner_user_id` ni `created_by` (`consent_version = 'web-form-v1'`), su actividad `created` sin autor, y una actividad `owner_changed` con `owner_from` nulo y `owner_to` = uno de los perfiles;
- la base **rechaza** en `leads` y `lead_activities`: un lead `whatsapp` sin `created_by`; un `idempotency_key` sin `submission_hash`; un `idempotency_key` repetido; una actividad `note` sin autor; una actividad `automation` sin `source_event_id` o sin texto; un `owner_changed` sin `owner_to`;
- la base **rechaza** en `outbox_events`: `status = 'processing'` sin `lease_token`; `attempts = 9`; `last_error_code = 'Error de SMTP'`; un `payload` de más de 1 KiB; `status = 'succeeded'` sin `processed_at`.

### Migración de origen, seguimiento y reservas (`0006`)

`drizzle/0006_flashy_bastion.sql` prepara el recorrido del corredor ([`crm-journey-automation.md`](docs/specs/crm-journey-automation.md)): por qué canal nos conoció cada lead, la entrada por Google Forms e importación, los recordatorios y la baja ("Pidió no seguir"), y el vínculo entre una reserva y su lead. Es una sola migración para todas las fases de esa spec. Está pendiente de aplicar por el usuario. **Primero se prueba en una rama de desarrollo de Neon**; en `production` solo se aplica con autorización explícita de esa operación.

**Orden: `0001` → `0002` → `0003` → `0004` → `0005` → `0006`.** `0006` necesita `0005` (usa `outbox_events` y `leads.created_by`) y `0003` (añade `bookings.lead_id`); no depende de `0004`, pero se respeta el orden del journal. Si alguna falta en esa rama, aplicarla antes siguiendo su sección; [Migración de captura y outbox](#migración-de-captura-y-outbox) lista el orden completo. El código del CRM a partir de esta spec lee y escribe las columnas nuevas: una versión con ese código solo funciona contra una rama que ya tenga `0006`.

No volver a aplicar `0000` (ya está en `production`) ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace `0006`** (todo en `public`):

- crea los enums `lead_channel` (los 14 orígenes: `event`, `partner`, `referral`, `whatsapp`, `whatsapp_status`, `instagram`, `facebook`, `tiktok`, `youtube`, `google_ads`, `luma`, `web`, `other`, `unknown`) y `contact_preference` (`whatsapp`, `email`, `call`);
- añade al final de enums existentes: `google_form` e `import` a `lead_source`; `channel_changed` y `opted_out` a `lead_activity_type`; `lead.follow_up_due` y `lead.opted_out` a `outbox_event_type` (seis `ALTER TYPE … ADD VALUE`);
- en `leads`: `channel` (`DEFAULT 'unknown' NOT NULL`), `origin_detail`, `utm_source`, `utm_medium`, `utm_campaign`, `referred_by`, `referral_permission` (`DEFAULT false NOT NULL`), `contact_preference` y `contact_opt_out_at`; los CHECK `leads_origin_detail_chk` (2–120 caracteres), `leads_utm_chk` (1–100 cada uno), `leads_referred_by_chk` (2–120), `leads_referral_permission_chk` (el permiso exige referente) y `leads_opt_out_chk` (con baja no hay próxima acción); y sustituye `leads_created_by_chk`, que ahora admite sin autor `web_form`, `google_form` e `import`;
- en `lead_activities`: `channel_from` y `channel_to`, con el CHECK `lead_activities_channel_chk` (obligatorios y distintos en `channel_changed`, nulos en cualquier otro tipo);
- en `outbox_events`: `dedupe_key`, con el CHECK `outbox_events_dedupe_key_chk` (1–120 caracteres, obligatorio en `lead.follow_up_due`) y el índice único parcial `outbox_events_dedupe_key_uq`;
- en `bookings`: `lead_id`, con la clave foránea `bookings_lead_id_leads_id_fk` (`ON DELETE restrict`) y el índice único parcial `bookings_lead_active_uq` (una reserva no cancelada por lead);
- rellena `channel` en los leads que ya existen (ver más abajo).

Revisión previa: `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0006_flashy_bastion.sql` no devuelve nada. El único `DROP` del archivo es el `DROP CONSTRAINT "leads_created_by_chk"`, que se vuelve a crear más abajo con la regla nueva. No toca `neon_auth`, `profiles`, `staff_*` ni `trips`.

**Relleno de `channel`.** Al añadir la columna, todos los leads existentes quedan en `unknown` (Desconocido). Justo después del `ADD COLUMN "channel"`, el archivo lleva dos `UPDATE` añadidos a mano (no los genera drizzle-kit):

```sql
UPDATE "leads" SET "channel" = 'whatsapp' WHERE "source" = 'whatsapp';
UPDATE "leads" SET "channel" = 'web' WHERE "source" = 'web_form';
```

Los `source = 'other'` se quedan en `unknown`: "Otro" describía cómo entró el registro, no cómo nos conoció la persona. El equipo puede corregir el origen después desde la edición del lead.

**Por qué en dos bloques:** PostgreSQL no deja usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos usan `'channel_changed'`, `'google_form'`, `'import'` y `'lead.follow_up_due'`. Si se pega el archivo entero en una sola transacción, falla con `unsafe use of new value "channel_changed"` y no se guarda nada (se puede repetir bien después). El corte se hace **por tipo de sentencia, no por posición**: el bloque 1 son solo las seis líneas `ALTER TYPE … ADD VALUE`; los dos `CREATE TYPE` van en el bloque 2 aunque drizzle-kit los ponga al principio del archivo (los tipos nuevos sí se pueden usar en la misma transacción que los crea).

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0003` y `0005` ya están aplicadas en esa rama y que `0006` **no** lo está: `SELECT to_regclass('public.bookings'), to_regclass('public.outbox_events'), to_regtype('public.lead_channel');` devuelve `bookings`, `outbox_events` y `NULL`.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. **Bloque 1.** Ejecutar solo estas seis líneas, sin `BEGIN;` ni `COMMIT;` (o en su propia transacción, confirmada con `COMMIT;`), y esperar a que termine:

   ```sql
   ALTER TYPE "public"."lead_activity_type" ADD VALUE 'channel_changed';
   ALTER TYPE "public"."lead_activity_type" ADD VALUE 'opted_out';
   ALTER TYPE "public"."lead_source" ADD VALUE 'google_form';
   ALTER TYPE "public"."lead_source" ADD VALUE 'import';
   ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.follow_up_due';
   ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.opted_out';
   ```

   Comprobar: `SELECT enum_range(NULL::lead_source), enum_range(NULL::lead_activity_type), enum_range(NULL::outbox_event_type);` termina, respectivamente, en `google_form,import`, en `channel_changed,opted_out` y en `lead.follow_up_due,lead.opted_out`. Si repites el procedimiento y alguna línea responde `enum label "…" already exists`, ese valor ya estaba: ejecuta solo las que falten (la comprobación anterior dice cuáles) y sigue con el bloque 2.
4. **Bloque 2.** Copiar el contenido de `drizzle/0006_flashy_bastion.sql` y **borrar las seis líneas del paso 3** (las líneas 3 a 8 del archivo, todas las que contienen `ADD VALUE`). Dejar las dos primeras (`CREATE TYPE`) y todo lo demás, incluidos el comentario y los dos `UPDATE` del relleno. Pegar el resto entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Si por error queda alguna línea `ADD VALUE`, la transacción falla con `enum label "…" already exists` y no cambia nada: quitarla y repetir. Si el bloque 2 responde `type "contact_preference" already exists`, `0006` ya estaba aplicada en esa rama: no repetir nada.

   Alternativa con terminal (Linux/WSL):

   ```sh
   F=drizzle/0006_flashy_bastion.sql
   grep -F 'ADD VALUE' "$F" | psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f -
   grep -vF 'ADD VALUE' "$F" | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```

   La primera orden ejecuta el bloque 1 sin transacción (cada línea se confirma sola) y la segunda, el bloque 2 en una sola transacción (`-1`).
5. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar:
   - el relleno: `SELECT source, channel, count(*) FROM leads GROUP BY 1, 2;` muestra `whatsapp` → `whatsapp`, `web_form` → `web` y `other` → `unknown` (y nada más; en una rama sin leads no devuelve filas);
   - las restricciones: `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass, 'public.outbox_events'::regclass) AND contype IN ('p','c','f');` devuelve 42 (tres `*_pkey`, veintinueve `*_chk` y diez `*_fk`), y `SELECT conname FROM pg_constraint WHERE conname IN ('leads_origin_detail_chk', 'leads_utm_chk', 'leads_referred_by_chk', 'leads_referral_permission_chk', 'leads_opt_out_chk', 'leads_created_by_chk', 'lead_activities_channel_chk', 'outbox_events_dedupe_key_chk', 'bookings_lead_id_leads_id_fk');` devuelve esas nueve;
   - los índices: `SELECT indexname FROM pg_indexes WHERE indexname IN ('bookings_lead_active_uq', 'outbox_events_dedupe_key_uq');` devuelve los dos.

**Probar el relleno con datos (solo en la rama de desarrollo).** Si la rama no tiene leads, después de `0005` y **antes del bloque 1** se pueden crear y confirmar tres leads de prueba, uno por `source`. Quedan guardados en esa rama, que después se puede borrar o restablecer desde Neon:

```sql
BEGIN;
INSERT INTO profiles (user_id, email) VALUES ('test-relleno', 'relleno@example.com');
INSERT INTO leads (full_name, phone, source, consent_version, created_by) VALUES
  ('Ana Prueba', '+51900000001', 'whatsapp', 'crm-manual-v1', 'test-relleno'),
  ('Beto Prueba', '+51900000002', 'other', 'crm-manual-v1', 'test-relleno');
INSERT INTO leads (full_name, phone, source, consent_version) VALUES ('Caro Prueba', '+51900000003', 'web_form', 'web-form-v1');
COMMIT;
```

Tras aplicar `0006`, la consulta del relleno del paso 6 debe devolver una fila por cada combinación: `whatsapp`/`whatsapp`, `web_form`/`web` y `other`/`unknown`.

Prueba manual de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (nada queda guardado). Con un perfil de staff, un viaje y un lead `whatsapp` de prueba creados en esa misma transacción. Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite seguir con la siguiente prueba; en el SQL Editor, ejecutar cada caso en su propio `BEGIN;` … `ROLLBACK;`.

- la base **acepta**: un lead `source = 'google_form'` y otro `source = 'import'` sin `created_by`; una actividad `channel_changed` de `unknown` a `instagram` con autor y sin texto; una actividad `opted_out` con autor y sin texto; un evento `lead.follow_up_due` con `dedupe_key`; y, para el mismo lead, una reserva cancelada (`status = 'cancelled'`) más otra no cancelada;
- la base **rechaza** en `leads`: un lead `whatsapp` sin `created_by` (`leads_created_by_chk`); `channel = 'foo'` (`invalid input value for enum lead_channel`); un `origin_detail` o un `referred_by` de 1 o de 121 caracteres (`repeat('a', 121)`); `referral_permission = true` sin `referred_by`; `contact_opt_out_at` con `next_action_date`; un `utm_campaign` de 101 caracteres;
- la base **rechaza** en `lead_activities`: un `channel_changed` sin `channel_to`, o con el mismo origen y destino (`event` → `event`); un `channel_from` en una actividad `note`; un `opted_out` o un `channel_changed` sin autor (`lead_activities_actor_chk`) o con texto (`lead_activities_body_chk`);
- la base **rechaza** en `outbox_events` y `bookings`: un `lead.follow_up_due` sin `dedupe_key`; un segundo evento con el mismo `dedupe_key` (`outbox_events_dedupe_key_uq`); una segunda reserva no cancelada con el mismo `lead_id` (`bookings_lead_active_uq`); una reserva con un `lead_id` inexistente (`bookings_lead_id_leads_id_fk`).

### Migración de campañas y registro

`drizzle/0007_awesome_dust.sql` prepara la captación omnicanal ([`landing-omnichannel-capture.md`](docs/specs/landing-omnichannel-capture.md)): las campañas (cada QR o enlace del CRM, con su carrera y su canal), qué campaña trajo a cada lead, la casilla de promociones y el registro repetido de una misma persona en la misma carrera ("Volvió a registrarse"). Es una sola migración para todas las fases de esa spec. Está pendiente de aplicar por el usuario: **primero en una rama de pruebas de Neon** y, cuando las pruebas de abajo salgan bien, **en `production`, antes del merge**. La ficha del lead de esta rama ya lee las columnas nuevas, así que una versión con este código solo funciona contra una rama de Neon que ya tenga la migración.

**El número `0007` es provisional.** El definitivo se fija solo en el turno de merge: si `main` ya tiene otra `0007`, esta se renumera (cambian el nombre del archivo, su snapshot y el journal, no el SQL). Si ya la aplicaste con el número provisional, es la misma migración: no la vuelvas a aplicar con el número nuevo.

**Orden: `0000` → … → `0006` → esta.** Necesita `0006` (usa el enum `lead_channel`) y, a través de ella, `0001`, `0002`, `0003` y `0005`. Si alguna falta en esa rama, aplicarla antes siguiendo su sección; [Migración de captura y outbox](#migración-de-captura-y-outbox) lista el orden completo. No volver a aplicar `0000` (ya está en `production`) ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace** (todo en `public`):

- añade el tipo de actividad `re_registered` al final de `lead_activity_type` (un `ALTER TYPE … ADD VALUE`);
- crea el enum `campaign_status` (`active`, `closed`) y la tabla `campaigns`: código único (`campaigns_code_uq`), carrera (`trip_id`, con el índice `campaigns_trip_idx`), canal, nombre, evento opcional, estado, autor y cierre. Tiene cinco CHECK: `campaigns_code_chk` (3–32 caracteres, minúsculas, números y guiones simples), `campaigns_channel_chk` (nunca `unknown`), `campaigns_name_chk` (2–80), `campaigns_event_name_chk` (2–120) y `campaigns_closed_chk` (una campaña cerrada tiene `closed_at` y `closed_by`; una activa, ninguno). Sus tres claves foráneas, hacia `trips` y `profiles`, son `ON DELETE restrict`: las campañas nunca se borran, se cierran;
- en `leads`: `campaign_id` (clave foránea hacia `campaigns`, índice parcial `leads_campaign_idx` y CHECK `leads_campaign_chk`: solo un lead `web_form` puede tener campaña) y `marketing_opt_in_at` (promociones aceptadas);
- en `lead_activities`: `submission_id` (índice único `lead_activities_submission_uq` y CHECK `lead_activities_submission_chk`: obligatorio en `re_registered` y prohibido en cualquier otro tipo), y sustituye `lead_activities_actor_chk` (una `re_registered` puede no tener autor) y `lead_activities_body_chk` (una `re_registered` exige texto de hasta 500 caracteres, como `automation`).

Los leads y actividades que ya existen no cambian: las columnas nuevas quedan vacías y los dos CHECK sustituidos solo amplían la regla para `re_registered`, así que las filas actuales los cumplen.

Revisión previa: `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0007_awesome_dust.sql` no devuelve nada. Los únicos `DROP` del archivo son los dos `DROP CONSTRAINT` de `lead_activities_body_chk` y `lead_activities_actor_chk`, que se vuelven a crear al final con la regla nueva. No toca `neon_auth`, `profiles`, `staff_*`, `trips`, `bookings` ni `outbox_events`.

**Por qué en dos bloques:** PostgreSQL no deja usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos usan `'re_registered'`. Si se pega el archivo entero en una sola transacción, falla con `unsafe use of new value "re_registered"` y no se guarda nada (se puede repetir bien después). El bloque 1 es solo la línea `ALTER TYPE … ADD VALUE` (la segunda del archivo); el `CREATE TYPE "campaign_status"` va en el bloque 2, porque un tipo nuevo sí se puede usar en la misma transacción que lo crea. Los comentarios `-- Block 1` y `-- Block 2` del archivo marcan el corte.

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0006` ya está aplicada en esa rama y que esta **no** lo está: `SELECT to_regtype('public.lead_channel'), to_regclass('public.campaigns');` devuelve `lead_channel` y `NULL`.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. **Bloque 1.** Ejecutar solo esta línea, sin `BEGIN;` ni `COMMIT;` (o en su propia transacción, confirmada con `COMMIT;`), y esperar a que termine:

   ```sql
   ALTER TYPE "public"."lead_activity_type" ADD VALUE 're_registered';
   ```

   Comprobar: `SELECT enum_range(NULL::lead_activity_type);` termina en `re_registered`. Si repites el procedimiento y el bloque 1 responde `enum label "re_registered" already exists`, no pasa nada: ya estaba aplicado; sigue con el bloque 2.
4. **Bloque 2.** Copiar el contenido de `drizzle/0007_awesome_dust.sql` y **borrar la línea del paso 3** (`ALTER TYPE "public"."lead_activity_type" ADD VALUE 're_registered';--> statement-breakpoint`, la segunda del archivo y la única que contiene `ADD VALUE`). Pegar el resto entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` y los comentarios `--` son comentarios de SQL y se pueden dejar. Si por error queda la línea `ADD VALUE`, la transacción falla con `enum label "re_registered" already exists` y no cambia nada: quitarla y repetir. Si el bloque 2 responde `type "campaign_status" already exists`, la migración ya estaba aplicada en esa rama: no repetir nada.

   Alternativa con terminal (Linux/WSL):

   ```sh
   F=drizzle/0007_awesome_dust.sql
   grep -F 'ADD VALUE' "$F" | psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f -
   grep -vF 'ADD VALUE' "$F" | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```

   La primera orden ejecuta el bloque 1 sin transacción (se confirma sola) y la segunda, el bloque 2 en una sola transacción (`-1`). Si el número cambia en el turno de merge, usar el nombre nuevo del archivo en `F`.
5. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar:
   - las restricciones de las tablas existentes: `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass, 'public.outbox_events'::regclass) AND contype IN ('p','c','f');` devuelve 45 (tres `*_pkey`, treinta y un `*_chk` y once `*_fk`);
   - las de `campaigns`: `SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.campaigns'::regclass AND contype IN ('p','c','f');` devuelve 9 (un `*_pkey`, cinco `*_chk` y tres `*_fk`);
   - las nuevas o sustituidas: `SELECT conname FROM pg_constraint WHERE conname IN ('leads_campaign_chk', 'leads_campaign_id_campaigns_id_fk', 'lead_activities_submission_chk', 'lead_activities_actor_chk', 'lead_activities_body_chk');` devuelve esas cinco;
   - los índices: `SELECT indexname FROM pg_indexes WHERE indexname IN ('campaigns_code_uq', 'campaigns_trip_idx', 'leads_campaign_idx', 'lead_activities_submission_uq');` devuelve los cuatro;
   - los datos: `SELECT count(*) FROM campaigns;` devuelve 0, y `SELECT count(*) FROM leads WHERE campaign_id IS NOT NULL OR marketing_opt_in_at IS NOT NULL;` devuelve 0.

Prueba manual de las restricciones, **solo en la rama de pruebas de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (nada queda guardado). Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite ejecutar todo seguido; en el SQL Editor, pegar la preparación, **un solo caso** y `ROLLBACK;`, ejecutar, y repetir con el siguiente caso.

Preparación (todo esto se **acepta**: un perfil y un viaje de prueba, una campaña activa válida, un lead `web_form` con esa campaña, un lead `whatsapp` creado a mano, una actividad `re_registered` sin autor en ese lead de WhatsApp y una campaña cerrada válida):

```sql
BEGIN;
INSERT INTO profiles (user_id, email) VALUES ('test-campanas', 'campanas@example.com');
INSERT INTO trips (id, slug, title, city, country, race_date, distances, summary) VALUES
  ('00000000-0000-4000-8000-000000000001', 'prueba-campanas', 'Maratón de prueba', 'Lima', 'Perú', '2027-05-16', ARRAY['42K'], 'Viaje de prueba');
INSERT INTO campaigns (id, code, trip_id, channel, name, event_name, created_by) VALUES
  ('00000000-0000-4000-8000-000000000002', 'expo-lima-26', '00000000-0000-4000-8000-000000000001', 'event', 'Stand Expo Lima', 'Expo de prueba 2026', 'test-campanas');
INSERT INTO leads (id, full_name, phone, email, trip_id, source, channel, campaign_id, consent_version) VALUES
  ('00000000-0000-4000-8000-000000000003', 'Ana Prueba', '+51900000001', 'ana@example.com', '00000000-0000-4000-8000-000000000001', 'web_form', 'event', '00000000-0000-4000-8000-000000000002', 'web-form-v1');
INSERT INTO leads (id, full_name, phone, trip_id, source, channel, consent_version, created_by) VALUES
  ('00000000-0000-4000-8000-000000000004', 'Beto Prueba', '+51900000002', '00000000-0000-4000-8000-000000000001', 'whatsapp', 'whatsapp', 'crm-manual-v1', 'test-campanas');
INSERT INTO lead_activities (lead_id, type, body, submission_id) VALUES
  ('00000000-0000-4000-8000-000000000004', 're_registered', 'Volvió a registrarse desde la web · prueba', '00000000-0000-4000-8000-000000000005');
INSERT INTO campaigns (code, trip_id, channel, name, status, created_by, closed_at, closed_by) VALUES
  ('ig-cerrada', '00000000-0000-4000-8000-000000000001', 'instagram', 'Publicación cerrada', 'closed', 'test-campanas', now(), 'test-campanas');
```

Casos que la base debe **rechazar**, uno por ejecución; el error debe nombrar la restricción indicada en el comentario:

```sql
-- campaigns_code_chk: repetir cambiando 'AB' por 'Mml26' y por '-mml'
INSERT INTO campaigns (code, trip_id, channel, name, created_by) VALUES ('AB', '00000000-0000-4000-8000-000000000001', 'event', 'Prueba', 'test-campanas');
-- campaigns_channel_chk
INSERT INTO campaigns (code, trip_id, channel, name, created_by) VALUES ('prueba-canal', '00000000-0000-4000-8000-000000000001', 'unknown', 'Prueba', 'test-campanas');
-- campaigns_name_chk: repetir cambiando 'A' por repeat('a', 81)
INSERT INTO campaigns (code, trip_id, channel, name, created_by) VALUES ('prueba-nombre', '00000000-0000-4000-8000-000000000001', 'event', 'A', 'test-campanas');
-- campaigns_closed_chk: cerrada sin closed_at
INSERT INTO campaigns (code, trip_id, channel, name, status, created_by) VALUES ('prueba-cerrada', '00000000-0000-4000-8000-000000000001', 'event', 'Prueba', 'closed', 'test-campanas');
-- campaigns_closed_chk: activa con closed_by
INSERT INTO campaigns (code, trip_id, channel, name, created_by, closed_by) VALUES ('prueba-activa', '00000000-0000-4000-8000-000000000001', 'event', 'Prueba', 'test-campanas', 'test-campanas');
-- campaigns_code_uq: mismo código que la campaña de la preparación
INSERT INTO campaigns (code, trip_id, channel, name, created_by) VALUES ('expo-lima-26', '00000000-0000-4000-8000-000000000001', 'tiktok', 'Prueba', 'test-campanas');
-- leads_campaign_chk: un lead whatsapp con campaña
INSERT INTO leads (full_name, phone, source, channel, campaign_id, consent_version, created_by) VALUES ('Caro Prueba', '+51900000003', 'whatsapp', 'whatsapp', '00000000-0000-4000-8000-000000000002', 'crm-manual-v1', 'test-campanas');
-- lead_activities_submission_chk: re_registered sin submission_id
INSERT INTO lead_activities (lead_id, type, body) VALUES ('00000000-0000-4000-8000-000000000004', 're_registered', 'Prueba');
-- lead_activities_body_chk: re_registered sin texto
INSERT INTO lead_activities (lead_id, type, submission_id) VALUES ('00000000-0000-4000-8000-000000000004', 're_registered', gen_random_uuid());
-- lead_activities_submission_chk: una note con submission_id
INSERT INTO lead_activities (lead_id, type, body, actor_user_id, submission_id) VALUES ('00000000-0000-4000-8000-000000000003', 'note', 'Prueba', 'test-campanas', gen_random_uuid());
-- lead_activities_submission_uq: mismo submission_id que la actividad de la preparación
INSERT INTO lead_activities (lead_id, type, body, submission_id) VALUES ('00000000-0000-4000-8000-000000000003', 're_registered', 'Prueba', '00000000-0000-4000-8000-000000000005');
ROLLBACK;
```

Si un caso se acepta, o falla por otra restricción distinta de la del comentario, no aplicar la migración en `production` y avisar antes de seguir.

### Migración de visitas por campaña (`0013`)

`drizzle/0013_cute_nebula.sql` crea el contador de visitas por campaña ([`landing-registration-visits.md`](docs/specs/landing-registration-visits.md)): la tabla `campaign_visit_days`, con una fila por campaña y día de Lima y el número de aperturas del enlace o del QR de ese día. No guarda nada de la persona (ni IP, ni agente de usuario, ni UTM). Está pendiente de aplicar por el usuario: **primero en una rama de desarrollo de Neon** y, cuando las pruebas de abajo salgan bien, en `production`, solo con autorización explícita de la operación remota. Tiene que estar aplicada antes de desplegar el código de esa spec: `POST /api/campaign-visits` escribe en ella (sin la tabla, cada visita se pierde y deja `campaign visit: record failed` en el log) y, en la Fase 2, `/crm/campanas` la lee.

**El número `0013` es provisional.** El definitivo se fija solo en el turno de merge: si `main` ya tiene otra `0013`, esta se renumera (cambian el nombre del archivo, su snapshot y el journal, no el SQL). Si ya la aplicaste con el número provisional, es la misma migración: no la vuelvas a aplicar con el número nuevo.

**Orden: `0000` → … → `0012` → esta.** Necesita `campaigns` (`0007`) y va después de `0012`, respetando el journal de Drizzle. Si falta alguna anterior en esa rama, aplicarla antes siguiendo su sección (para `0010`, [Migración incremental de la integración](#migración-incremental-de-la-integración); para `0011` y `0012`, [Mi cuenta, recompensas y noticias](#mi-cuenta-recompensas-y-noticias)). No volver a aplicar ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace** (todo en `public`):

- crea la tabla `campaign_visit_days` con `campaign_id` (`uuid`), `day` (`date`, el día en Lima) y `visits` (`integer`), las tres obligatorias;
- la clave primaria `campaign_visit_days_campaign_id_day_pk (campaign_id, day)`: una sola fila por campaña y día. La aplicación suma cada visita a la fila del día con una sola sentencia (`INSERT … ON CONFLICT (campaign_id, day) DO UPDATE SET visits = campaign_visit_days.visits + 1`);
- el CHECK `campaign_visit_days_visits_chk` (`visits > 0`);
- la clave foránea `campaign_visit_days_campaign_id_campaigns_id_fk` hacia `campaigns`, `ON DELETE restrict` (las campañas nunca se borran, se cierran).

No cambia ninguna tabla existente. La tabla nueva queda vacía: las visitas empiezan a contar con el despliegue, sin histórico.

Revisión previa:

- `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0013_cute_nebula.sql` no devuelve nada;
- `grep -E '^(ALTER|CREATE) ' drizzle/0013_cute_nebula.sql` devuelve solo dos líneas, `CREATE TABLE "campaign_visit_days"` y `ALTER TABLE "campaign_visit_days" ADD CONSTRAINT …` (la clave foránea): solo crea `campaign_visit_days` y no altera `campaigns`, `trips`, `leads`, `profiles` ni ninguna otra tabla.

**Un solo bloque, con el archivo tal cual.** No hay `ALTER TYPE … ADD VALUE` ni enums nuevos, así que todo va en una transacción.

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0012` ya está aplicada en esa rama y que esta **no** lo está: `SELECT to_regclass('public.campaigns'), to_regprocedure('public.cv_reconcile_rewards(text)'), to_regclass('public.campaign_visit_days');` devuelve `campaigns`, `cv_reconcile_rewards(text)` (una función de `0012`) y `NULL`. Si alguna de las dos primeras es `NULL`, falta una migración anterior: aplicarla antes. Si la tercera no es `NULL`, la `0013` ya está aplicada: no repetirla.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. Escribir `BEGIN;`, debajo el archivo `drizzle/0013_cute_nebula.sql` completo y, al final, `COMMIT;`, y ejecutarlo todo junto. La línea `--> statement-breakpoint` es un comentario de SQL y se puede dejar.

   Alternativa con terminal (Linux/WSL):

   ```sh
   F=drizzle/0013_cute_nebula.sql
   psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f "$F"
   ```

   `-1` lo ejecuta todo en una sola transacción. Si el número cambia en el turno de merge, usar el nombre nuevo del archivo en `F`.

   Si falla, la transacción se deshace entera y no se guarda nada. Errores que se pueden ver:
   - `relation "campaigns" does not exist`: falta `0007` en esa rama; aplicarla antes (y las que falten hasta `0012`).
   - `relation "campaign_visit_days" already exists`: repetir la consulta del paso 1; si la tercera columna no es `NULL`, la migración ya estaba aplicada y no hay que repetir nada.
   - cualquier otro error: la rama no está en el estado esperado; parar y revisar.
4. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
5. Comprobar:
   - las columnas: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign_visit_days' ORDER BY ordinal_position;` devuelve `campaign_id` `uuid` `NO`, `day` `date` `NO` y `visits` `integer` `NO`;
   - las restricciones: `SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.campaign_visit_days'::regclass AND contype IN ('p','c','f') ORDER BY 1;` devuelve tres: `campaign_visit_days_campaign_id_campaigns_id_fk` (`f`), `campaign_visit_days_campaign_id_day_pk` (`p`) y `campaign_visit_days_visits_chk` (`c`);
   - la regla de borrado de la clave foránea: `SELECT confrelid::regclass, confdeltype FROM pg_constraint WHERE conname = 'campaign_visit_days_campaign_id_campaigns_id_fk';` devuelve `campaigns` y `r` (`restrict`);
   - los datos: `SELECT count(*) FROM campaign_visit_days;` devuelve 0.

Prueba manual de las restricciones, **solo en la rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (nada queda guardado). Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite ejecutar todo seguido; en el SQL Editor, pegar la preparación, **un solo caso** y `ROLLBACK;`, ejecutar, y repetir con el siguiente caso.

Preparación (todo esto se **acepta**: un perfil, un viaje y una campaña de prueba, una fila de visitas con `visits = 1` y una segunda visita del mismo día sumada como lo hace la aplicación). La consulta final devuelve una fila: `2026-10-29` con `2` visitas:

```sql
BEGIN;
INSERT INTO profiles (user_id, email) VALUES ('test-visitas', 'visitas@example.com');
INSERT INTO trips (id, slug, title, city, country, race_date, distances, summary) VALUES
  ('00000000-0000-4000-8000-000000000001', 'prueba-visitas', 'Maratón de prueba', 'Lima', 'Perú', '2027-05-16', ARRAY['42K'], 'Viaje de prueba');
INSERT INTO campaigns (id, code, trip_id, channel, name, created_by) VALUES
  ('00000000-0000-4000-8000-000000000002', 'prueba-visitas', '00000000-0000-4000-8000-000000000001', 'event', 'Campaña de prueba', 'test-visitas');
INSERT INTO campaign_visit_days (campaign_id, day, visits) VALUES
  ('00000000-0000-4000-8000-000000000002', '2026-10-29', 1);
INSERT INTO campaign_visit_days (campaign_id, day, visits) VALUES
  ('00000000-0000-4000-8000-000000000002', '2026-10-29', 1)
  ON CONFLICT (campaign_id, day) DO UPDATE SET visits = campaign_visit_days.visits + 1;
SELECT day, visits FROM campaign_visit_days WHERE campaign_id = '00000000-0000-4000-8000-000000000002';
```

Casos que la base debe **rechazar**, uno por ejecución; el error debe nombrar la restricción indicada en el comentario:

```sql
-- campaign_visit_days_visits_chk: visits = 0 (otro día, para no chocar con la clave primaria)
INSERT INTO campaign_visit_days (campaign_id, day, visits) VALUES ('00000000-0000-4000-8000-000000000002', '2026-10-30', 0);
-- campaign_visit_days_campaign_id_day_pk: segunda fila con la misma campaña y el mismo día, sin ON CONFLICT
INSERT INTO campaign_visit_days (campaign_id, day, visits) VALUES ('00000000-0000-4000-8000-000000000002', '2026-10-29', 1);
-- campaign_visit_days_campaign_id_campaigns_id_fk: campaña inexistente
INSERT INTO campaign_visit_days (campaign_id, day, visits) VALUES ('00000000-0000-4000-8000-000000000099', '2026-10-29', 1);
ROLLBACK;
```

Después del `ROLLBACK;`, `SELECT count(*) FROM campaign_visit_days;` sigue devolviendo 0 y no queda el perfil `test-visitas`. Si un caso se acepta, o falla por otra restricción distinta de la del comentario, no aplicar la migración en `production` y avisar antes de seguir.

### Campañas, QR y modo stand

Especificado en [`landing-omnichannel-capture.md`](docs/specs/landing-omnichannel-capture.md). Cada carrera publicada tiene su página de registro en `/viajes/<slug>/registro`: nombre, ciudad y país, fecha, distancias e imagen del catálogo (el encabezado no tiene precios ni cupos), el botón «Quiero correr esta maratón», que baja al formulario, y «Ver el paquete completo», que abre `/viajes/<slug>` (conservando `?c=`). Entre el encabezado y el formulario aparece el bloque financiero de la oferta vigente, si la hay (nunca en el modo stand; ver [Qué usa hoy la landing](#qué-usa-hoy-la-landing)). El formulario pide solo nombre y apellido, WhatsApp con código de país y correo, más la aceptación del texto legal y una casilla opcional de promociones (siempre desmarcada). `/contacto` usa el mismo formulario con un selector de carrera: los viajes publicados y, después, "Río de Janeiro · Quiero novedades" y "Roma · Quiero novedades". Cada envío válido crea un lead "Nuevo" en el CRM, vía "Formulario web", sin responsable.

Hoy el registro solo se alcanza con un QR o un enlace de campaña: ni la portada ni `/viajes/<slug>` enlazan a él.

**Requisitos antes de usarlo en producción:** la [migración de campañas y registro](#migración-de-campañas-y-registro) aplicada en `production`, las claves de [Turnstile](#activar-la-protección-antispam-turnstile) cargadas y el texto legal aprobado (P-L, abajo).

#### Crear una campaña

Una campaña es un QR o un enlace con su carrera y su canal. Sirve para saber qué stand, publicación o aliado trajo a cada persona.

1. En el CRM, **Campañas** → **Nueva campaña** (cuentas `commercial` y `admin`).
2. Rellena:
   - **código:** de 3 a 32 caracteres, en minúsculas, con números y guiones (por ejemplo `mml26` o `ig-preventa-santiago`). Aparece en el enlace y no se puede repetir;
   - **nombre**, para reconocerla en el CRM (por ejemplo "QR stand MML");
   - **viaje** (la carrera a la que lleva el QR);
   - **canal:** "Feria, carrera o activación", "Instagram", "TikTok", "Facebook", "Club, gimnasio o aliado"… (todos los del CRM salvo "Desconocido");
   - **evento o stand**, si lo hay (por ejemplo "Media Maratón de Lima 2026").
3. Al guardar se abre su ficha, con el **enlace público** (`https://carreras-viajeras.mentec.dev/viajes/<slug>/registro?c=<código>`), el **enlace del modo stand** y el **QR** del enlace público.

Cómo se atribuye cada lead:

- Un lead registrado desde el enlace o el QR de una campaña **activa y de la misma carrera** queda con el canal de la campaña, la campaña y, como detalle del origen, su evento (o su nombre si no tiene). Se ve en la ficha del lead, tarjeta "Registro" → "Campaña".
- Sin campaña válida (enlace sin `?c=`, campaña cerrada, inexistente o de otra carrera), el registro funciona igual y el lead queda con el canal "Web". El comercial puede corregir el origen en la ficha; el cambio queda en el historial.
- Puedes añadir UTM al enlace (`&utm_source=instagram&utm_medium=social&utm_campaign=preventa`) o un aliado (`&ref=club-lima`). Se guardan en la ficha ("UTM", referente), pero **no cambian el canal**: lo decide solo la campaña. Ningún parámetro cambia importes, etapa, responsable ni consentimiento: `?c=` solo elige la oferta de una campaña activa de esa carrera, si tiene una vigente.
- En la lista de campañas, la columna de registros **cuenta leads nuevos, no visitas**: abrir la página o escanear el QR no guarda nada. El informe origen × etapa de `/crm` sigue contando por canal.
- **Sin duplicados:** si la misma persona (el mismo correo, sin importar mayúsculas) vuelve a registrarse en la misma carrera, no se crea otro lead: su ficha recibe una actividad "Volvió a registrarse" con la campaña, los UTM, la versión del texto legal y su elección de promociones. El lead existente no cambia (ni origen, ni campaña, ni promociones), y la persona ve el mismo mensaje de éxito. Dos personas con el mismo teléfono y correos distintos son dos leads.

#### Imprimir el QR

1. En la ficha de la campaña, pulsa **Descargar QR (SVG)**: descarga `campana-<código>.svg`. El SVG es vectorial: se puede ampliar sin perder calidad.
2. Descárgalo siempre **desde el CRM de producción** (`carreras-viajeras.mentec.dev`): el enlace del QR usa la dirección del sitio donde lo generas, así que uno descargado con `npm run dev` apuntaría a tu computadora.
3. Antes de imprimir en cantidad, imprime una prueba, escanéala con un par de móviles y comprueba que abre el registro de la carrera correcta. Deja un margen blanco alrededor del código y no lo imprimas demasiado pequeño (como orientación, no menos de 3 × 3 cm).

El QR lleva siempre al registro de su carrera. **Cerrar la campaña no rompe el QR:** sigue abriendo la página y el registro funciona, pero los nuevos leads ya no se atribuyen a esa campaña (quedan como "Web"). Los leads que ya trajo conservan su campaña. Una campaña cerrada no se reabre ni se borra; para una tirada nueva, crea otra campaña con otro código.

Si la carrera se despublica o se archiva, el QR lleva a una página 404 hasta que se vuelva a publicar.

#### Modo stand (tableta del equipo)

Para registrar corredores en una feria desde una tableta:

1. Abre en la tableta el **enlace del modo stand** de la ficha de la campaña (es el enlace público con `&modo=stand`). No lo publiques ni lo conviertas en QR: está pensado para la tableta del equipo (no da ningún permiso especial, solo cambia la presentación).
2. La página muestra solo el nombre de la carrera y el formulario, con campos y botones grandes, sin la cabecera ni el pie del sitio.
3. Cada corredor escribe sus datos y pulsa "Enviar mis datos". Tras un envío correcto se ve "Registro guardado. ¡Gracias!", sin ningún dato del corredor, y el botón **Registrar a otra persona**, que abre un formulario vacío para el siguiente.
4. El formulario no sugiere lo que escribió el corredor anterior (autocompletado desactivado) y no guarda nada en el navegador. Aun así, conviene desactivar en la tableta el guardado de formularios del navegador y no dejarla sin vigilancia.
5. La verificación de Cloudflare (Turnstile) se repite en cada registro; si pide una comprobación, el corredor la resuelve antes de enviar.

Si el servidor rechaza el envío (datos incompletos, verificación fallida o servicio no disponible), el formulario conserva lo escrito para reintentar y, salvo en los errores de datos, ofrece "Escríbenos por WhatsApp" como alternativa.

#### Texto legal y apertura del registro (puerta P-L)

El texto que acepta el corredor, el de la casilla de promociones y su versión viven en `lib/registrationConsent.ts`. Hoy son un **marcador provisional** ("[TEXTO PROVISIONAL – PENDIENTE DE APROBACIÓN LEGAL (P-L)]…", versión `registro-web-pendiente-pl`) a la espera de que el área legal apruebe el definitivo.

**Mientras siga el marcador, el registro en producción está cerrado por código:** `/viajes/<slug>/registro` y `/contacto` muestran "El registro en línea abrirá pronto. Mientras tanto, escríbenos por WhatsApp." con el enlace, en lugar del formulario, y el servidor rechaza cualquier envío sin verificar ni guardar nada. Pasa también con `npm run preview`, que compila en modo producción. Con `npm run dev` el formulario funciona y se ve el marcador. Los QR se pueden crear e imprimir ya: hasta la apertura, quien los escanee verá ese aviso.

Para abrir el registro, cuando el área legal entregue el texto (un cambio de un solo archivo, en modo build):

1. En `lib/registrationConsent.ts`, sustituir `privacyText` y `marketingText` por los textos aprobados, cambiar `version` a `registro-web-v1` y poner `isPlaceholder: false`.
2. El texto definitivo debe cubrir también a quienes ya tratan los datos: n8n en tu computadora, tu proveedor de correo y Gemini (que solo recibe el nombre de pila y el viaje).
3. Una vez publicado, **cualquier cambio del texto exige una versión nueva** (`registro-web-v2`…): cada lead guarda la versión que aceptó.
4. Pendiente de confirmar con el área legal: si basta un aviso informativo en lugar de la casilla obligatoria "Acepto…" (pregunta abierta 1 de la spec).

### Activar la protección antispam (Turnstile)

Turnstile es el control antispam gratuito de Cloudflare: muestra una casilla de verificación en los formularios de `/contacto` y del registro de cada carrera (`/viajes/<slug>/registro`) y el servidor comprueba que la ha resuelto una persona. Esta guía no necesita programar. **Nunca escribas en este README, en un chat ni en un correo los valores reales de las claves.**

1. Entra en el panel de Cloudflare (dash.cloudflare.com) con la cuenta del dominio `mentec.dev` y abre el menú **Turnstile** → **Add widget**.
2. Rellena: nombre "Carreras Viajeras – formulario de contacto"; hostname `carreras-viajeras.mentec.dev`; modo **Managed**; sin *pre-clearance*. Guarda.
3. Cloudflare muestra dos claves: la **Site Key** (pública) y la **Secret Key** (privada). Cópialas a un lugar seguro, como tu gestor de contraseñas. No compartas nunca la Secret Key.
4. **En tu computadora:**
   - abre `.env.local` (la copia de `.env.example`) y pega `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<tu Site Key>` y `TURNSTILE_SECRET_KEY=<tu Secret Key>`;
   - abre `.dev.vars` (la copia de `.dev.vars.example`) y pega solo `TURNSTILE_SECRET_KEY=<tu Secret Key>`.

   Para probar en local sin el widget real, usa las **claves de prueba** que publica Cloudflare: Site Key `1x00000000000000000000AA` y Secret Key `1x0000000000000000000000000000000AA` (siempre aprueban). Solo funcionan con `npm run dev`: fuera de desarrollo el servidor las rechaza. Al revés, tu widget real solo funciona en `carreras-viajeras.mentec.dev`, así que con `npm run dev` usa siempre las de prueba. En `.dev.vars` (que usa `npm run preview`, en modo producción) no pongas claves de prueba.
5. **En Cloudflare (producción):** Workers & Pages → `carreras-viajeras` → **Settings** → **Variables and Secrets** → **Add** → tipo **Secret**, nombre `TURNSTILE_SECRET_KEY`, valor tu Secret Key → guardar. Si prefieres la terminal: `npx wrangler secret put TURNSTILE_SECRET_KEY` y pega el valor cuando lo pida.
6. **Variable de build:** en el mismo Worker, **Settings** → **Build** → *Variables and secrets* → añade `NEXT_PUBLIC_TURNSTILE_SITE_KEY` con tu Site Key. Es pública y se incrusta al compilar. Si despliegas desde tu computadora con `npm run deploy`, se toma de `.env.local`: **antes de desplegar, comprueba que ahí está tu Site Key real y no la de prueba**; si no, el formulario rechazará todos los envíos.
7. **Comprobar:** tras el siguiente despliegue (solo cuando lo autorices), abre `/contacto`. Debe verse la casilla de verificación de Cloudflare y, al enviar un registro de prueba, el mensaje "¡Listo! Recibimos tus datos. Te escribiremos por WhatsApp.". Si aparece "No pudimos verificar el envío", revisa que el hostname del widget sea `carreras-viajeras.mentec.dev` y que las dos claves sean las correctas. Mientras el texto legal siga siendo el marcador P-L, en producción no se ve el formulario sino el aviso "El registro en línea abrirá pronto…" (ver [Texto legal y apertura del registro](#texto-legal-y-apertura-del-registro-puerta-p-l)); hasta entonces, prueba con `npm run dev` y las claves de prueba.
8. **Si una clave se filtra:** en Turnstile → tu widget → **Rotate secret key**, y actualiza el Secret `TURNSTILE_SECRET_KEY` del Worker (paso 5) y tus archivos locales (paso 4).

### Secretos de integraciones

`N8N_API_TOKEN` protege la API privada que usa n8n (ver [Automatizaciones con n8n](#automatizaciones-con-n8n)). No es `DATABASE_URL`: n8n nunca recibe credenciales de la base.

1. Genera un valor aleatorio de al menos 32 caracteres en tu computadora, por ejemplo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Guárdalo como **Secret** del Worker con el nombre `N8N_API_TOKEN` (igual que en el paso 5 de Turnstile, o con `npx wrangler secret put N8N_API_TOKEN`).
3. Para pruebas locales, pégalo en `.env.local` y en `.dev.vars` como `N8N_API_TOKEN=<valor>`.
4. En n8n, el mismo valor va en una credencial de cabecera (`Authorization: Bearer <valor>`); ver [Automatizaciones con n8n](#automatizaciones-con-n8n).

Si falta, la API de n8n responderá que no está configurada y el resto de la aplicación sigue funcionando. Si se filtra, genera otro valor y actualiza el Secret, tus archivos locales y la credencial de n8n.

### Automatizaciones con n8n

n8n corre en tu computadora y no tiene dirección pública, así que **la web nunca llama a n8n**: es n8n quien pregunta cada minuto a una API privada de la web si hay novedades (modelo *pull*). Cada vez que se crea un lead, y cada vez que el equipo le cambia la etapa en el CRM, la base guarda un **evento** en una cola (`outbox_events`). n8n recoge esos eventos, te **avisa por correo** y te **prepara un borrador** del mensaje para el runner. **Nada se envía solo al runner:** tú (o el comercial) revisas el borrador y lo envías a mano desde WhatsApp Business App.

Si n8n está apagado no se pierde nada: los eventos esperan en Neon y se recogen cuando vuelve a encenderse. La API solo responde en la web desplegada (`https://carreras-viajeras.mentec.dev`, cuando autorices el despliegue) o en tu computadora con `npm run dev` (`http://localhost:3000`), y necesita la migración `0005` aplicada (y la `0006` para el alta desde Google Forms y la importación, apartados 10 y 11, y para los recordatorios y el aviso de baja, apartados 12 y 13).

#### 1. Credenciales (solo dentro de n8n)

En n8n → **Credentials** → **Add credential**:

1. **Header Auth** (para hablar con la web): nombre `Authorization`, valor `Bearer <tu N8N_API_TOKEN>` (la palabra `Bearer`, un espacio y el mismo valor que guardaste como Secret, ver [Secretos de integraciones](#secretos-de-integraciones)).
2. **SMTP** (para enviarte los correos): los datos del servidor de correo de tu cuenta.
3. **Google Gemini** (para redactar los borradores): la API key que creas en Google AI Studio.
4. **Google Sheets** (solo para el workflow "Alta desde Google Forms", apartado 10): la cuenta de Google que puede leer la hoja de respuestas del formulario.

Estas credenciales viven **solo en n8n**. Nunca se copian al repositorio, a `.env.local`, a `.dev.vars` ni al Worker. La API key de Gemini nunca llega a la web.

**Asigna la credencial *Header Auth* en cada nodo HTTP** de los workflows ("Reclamar eventos", "Leer lead", "Registrar actividad", "Ack", cada "Fail" y los de los apartados 10 a 12); un nodo importado o duplicado puede quedar sin ella. "Registrar actividad", "Ack" y "Fail" siguen aunque fallen (*On Error* → *Continue*), así que si les falta la credencial no aparece nada en rojo: te llegan los correos, pero los eventos se quedan en `processing`, vuelven a entregarse cada 5 minutos (el paso 5 evita el segundo correo) hasta acabar `dead`, y la salida de esos nodos muestra `Credentials not found`.

**Prueba local con n8n en Docker.** Las direcciones de esta guía apuntan a la web desplegada. Para probar contra `npm run dev`, cambia en los nodos HTTP la dirección base `https://carreras-viajeras.mentec.dev` por `http://localhost:3000`; si n8n corre en Docker, por `http://host.docker.internal:3000` (en Linux, arranca el contenedor con `--add-host=host.docker.internal:host-gateway`): dentro del contenedor, `localhost` es el propio n8n y la petición falla con `ECONNREFUSED`. Antes de usarlo en producción, vuelve a la dirección desplegada.

#### 2. La API privada (qué puede pedir n8n)

Todas las peticiones usan la credencial *Header Auth* y, si llevan cuerpo, `Content-Type: application/json` (como máximo 4 KiB). Las respuestas no se guardan en caché.

| Petición | Cuerpo | Respuesta correcta |
|---|---|---|
| `POST /api/integrations/n8n/events/claim` | `{ "limit": 10 }` (de 1 a 25; sin cuerpo, 10) | `200 { "events": [...] }` (lista vacía si no hay nada) |
| `POST /api/integrations/n8n/events/{id}/ack` | `{ "leaseToken": "..." }` | `200 { "status": "succeeded" }` |
| `POST /api/integrations/n8n/events/{id}/fail` | `{ "leaseToken": "...", "errorCode": "smtp_error" }` | `200 { "status": "pending", "availableAt": "..." }` o `200 { "status": "dead" }` |
| `GET /api/integrations/n8n/leads/{id}` | — | `200` con los datos del lead (abajo) |
| `POST /api/integrations/n8n/leads/{id}/activities` | `{ "eventId": "...", "body": "Borrador para la etapa Cotizado enviado por correo al usuario." }` | `201 { "status": "recorded" }` o `200 { "status": "duplicate" }` (ese evento ya dejó su actividad) |
| `POST /api/integrations/n8n/leads` | Una respuesta de Google Forms o una fila de la importación (abajo) | `201 { "status": "created", "leadId": "..." }`, `200 { "status": "duplicate", "leadId": "..." }` (o `"leadId": null`) o `200 { "status": "existing", "leadId": "..." }` |
| `POST /api/integrations/n8n/follow-ups/enqueue` | `{ "limit": 20 }` (de 1 a 50; sin cuerpo, 20) | `200 { "enqueued": 3 }` (cuántos recordatorios se pusieron en la cola; `0` si no había ninguno pendiente) |

- **claim** ("reclamar"): entrega hasta `limit` eventos listos, los más antiguos primero, y los reserva para ti durante **5 minutos** (*lease*). Cada evento trae `id`, `type` (`lead.created`, `lead.stage_changed`, `lead.follow_up_due` o `lead.opted_out`), `leadId`, `payloadVersion`, `payload` (para `lead.created`, `{ "source": "web_form" | "whatsapp" | "other" | "google_form" | "import", "bulk": true | false }`; `bulk` solo es `true` en la importación única y lo decide la web, no la petición; los eventos anteriores pueden no traerlo. Para `lead.stage_changed` (cada cambio de etapa que el equipo hace en el CRM), `{ "stageFrom": "quoted", "stageTo": "reserved" }` con la etapa anterior y la nueva (los valores son los de `stage`: `new`, `contacted`, `quoted`, `reserved`, `paid` o `lost`); si el cambio lo hizo la confirmación de una reserva vinculada al lead, el payload trae además `"trigger": "booking"` (apartado 6); guardar la misma etapa no genera evento, y "Pidió no seguir" tampoco (genera `lead.opted_out`); para `lead.follow_up_due` (recordatorio, apartado 12), `{ "stage": "new" | "contacted" | "quoted", "dueOn": "AAAA-MM-DD" }` con la etapa y la fecha de la próxima acción vencida; para `lead.opted_out` (el contacto pidió no seguir, apartado 13), `{ "stageFrom" }` con la etapa que tenía antes), `attempts` (intento actual, de 1 a 8), `leaseToken`, `leaseUntil` y `createdAt`.
- **ack** ("listo"): confirma que el evento está procesado. Hay que enviar el `leaseToken` que llegó con ese evento.
- **fail** ("falló"): devuelve el evento a la cola para reintentarlo más tarde (30 s, 1 min, 2 min, 4 min… con algo de variación, hasta 1 hora). `errorCode` es un código corto en minúsculas, números y `_` (máximo 40). Al octavo intento fallido el evento queda `dead` (muerto) y no se vuelve a entregar.
- **leads/{id}**: los datos mínimos del lead: `id`, `fullName`, `firstName` (solo el nombre de pila), `email`, `phone` (con `+` y código de país), `stage`, `source`, `trip` (`{ slug, title }` o `null`), `destinationText`, `owner` (`{ email }` del responsable o `null` si no tiene), `archived`, `createdAt`, `channel` (el origen: `event`, `instagram`, `unknown`…), `originDetail` (detalle del origen o `null`), `contactPreference` (`whatsapp`, `email`, `call` o `null`), `nextActionDate` (`AAAA-MM-DD` o `null`) y `doNotContact` (`true` si el contacto pidió no seguir: **descarta cualquier borrador**). No incluye ciudad, notas, historial, consentimiento, referente, UTM ni ids de usuario.
- **leads/{id}/activities** ("registrar actividad"): deja en el historial del lead, con el autor "n8n", qué hizo n8n con un evento (paso 14). `eventId` es el `id` del evento y `body` un texto fijo de 1 a 500 caracteres; **nunca** copies ahí el texto del borrador. Repetirlo con el mismo `eventId` no duplica nada (`duplicate`). Responde `404 { "error": "not_found" }` si el lead no existe o está archivado, o si el evento es de otro lead.
- **follow-ups/enqueue** ("encolar recordatorios"): lo llama una vez al día el workflow "Recordatorios diarios" (apartado 12). Pone en la cola un evento `lead.follow_up_due` por cada lead que lo necesita, como máximo `limit`, y responde cuántos puso. Llamarlo dos veces no duplica nada.
- **leads** (`POST`): registra a una persona que llega por Google Forms (apartado 10) o por la importación única (apartado 11). El lead entra "Sin asignar", en etapa "Nuevo" y sin autor. Cuerpo:

  | Campo | Obligatorio | Valor |
  |---|---|---|
  | `source` | sí | `"google_form"` o `"import"` |
  | `externalId` | sí | Id de la respuesta o de la fila, único dentro de su vía: letras, números y `_ . : -`, hasta 100 (p. ej. `"<id de la hoja>:42"` o `"mml-2026:17"`) |
  | `consentVersion` | sí | `"google-form-v1"` para `google_form`; `"import-mml-v1"` para `import` (otra versión → `400`) |
  | `consentedAt` | sí | Fecha y hora en que dio el consentimiento, con zona horaria: `"2026-09-14T08:12:00-05:00"` |
  | `fullName` | sí | 2 a 120 caracteres |
  | `phone` | sí | Con código de país (`+51 938 127 170`); la web quita espacios y guiones |
  | `email`, `tripSlug`, `destinationText`, `originDetail`, `referredBy`, `contactPreference` | no | `tripSlug` es el slug de un viaje del catálogo (`maraton-santiago-2027`); `originDetail` y `referredBy`, 2 a 120 caracteres; `contactPreference`, `whatsapp`, `email` o `call`. Una celda vacía (`""`) cuenta como sin dato |
  | `channel` | no | El origen (`event`, `partner`, `referral`, `whatsapp`, `whatsapp_status`, `instagram`, `facebook`, `tiktok`, `youtube`, `google_ads`, `luma`, `web`, `other`, `unknown`); sin él, `unknown`. A diferencia de los campos de arriba, una celda vacía (`""`) o `null` da `400`: si no sabes el origen, omite el campo o envía `"unknown"` |

  Respuestas: `created` (lead nuevo; llega al workflow principal por su `lead.created`); `duplicate` (ese `externalId` ya se registró con los mismos datos: repetir una petición nunca duplica); `existing` (ya hay un lead con ese teléfono, también si está archivado tras pedir no seguir: no se crea otro y `leadId` es el existente); `409 { "error": "conflict" }` (ese `externalId` ya se registró con **otros** datos); `422 { "error": "unknown_trip" }` (el `tripSlug` no es un viaje del catálogo). Ninguna respuesta repite los datos enviados. Responsable, autor, etapa y `bulk` los decide la web: si la petición los trae, se ignoran.

Errores comunes: `400 { "error": "invalid_request" }` (datos mal escritos), `401 { "error": "unauthorized" }` (token ausente o incorrecto), `404 { "error": "not_found" }` (el lead no existe; en `…/activities`, también si está archivado o el evento es de otro lead), `409 { "error": "lease_lost" }` (la reserva de 5 minutos venció o ese evento se volvió a entregar), `409 { "error": "conflict" }` y `422 { "error": "unknown_trip" }` (solo en `POST …/leads`, arriba; en `…/follow-ups/enqueue`, un `limit` fuera de 1–50 o que no es un número da `400`), `500 { "error": "internal_error" }` y `503 { "error": "not_configured" }` (falta `N8N_API_TOKEN` en la web).

Si n8n se reinicia a mitad de un evento, no pasa nada: al vencer los 5 minutos ese evento vuelve a entregarse con otro `leaseToken`. Por eso un evento puede llegar **más de una vez**, y n8n debe evitar avisarte dos veces (apartado 3, paso 5).

#### 3. El workflow, paso a paso

En n8n, `$json` son los datos del nodo **inmediatamente anterior**, que cambian de un paso a otro. Por eso esta guía pone **nombre** a los nodos (el texto entre comillas: haz clic en el título del nodo y escríbelo igual) y toma cada dato del nodo que lo tiene, con `$('Nombre del nodo').item.json.<campo>`. Así el ack siempre usa el `id` y el `leaseToken` del **evento**, y nunca el id del lead.

1. **Schedule Trigger**: cada minuto.
2. **HTTP Request** "Reclamar eventos": `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/events/claim` con la credencial *Header Auth* y cuerpo `{ "limit": 10 }`.
3. **Split Out** "Split Out" sobre el campo `events`: un item por evento. Si la lista viene vacía, el workflow termina ahí.
4. **Loop Over Items** "Uno a uno" con *Batch Size* = `1`. Conecta su salida *loop* al paso 5 y deja sin conectar la salida *done*. Al final de cada camino (el nodo "Ack" y el nodo "Fail", vengan de donde vengan) conecta la salida **de vuelta a la entrada de "Uno a uno"**, para que pase al evento siguiente. Dentro del bucle, el evento actual es siempre `$('Uno a uno').item.json` (`id`, `leadId`, `leaseToken`, `type`, `payload`).

   **Por qué el bucle:** n8n pasa los items en grupo de un nodo al siguiente. Sin el bucle, una búsqueda que no encuentra nada (paso 5) o un nodo que se queda sin salida harían que los demás eventos del lote se perdieran por el camino: volverían a llegar cada 5 minutos y podrían acabar `dead` sin procesarse. Con un solo evento por vuelta, cada uno recorre el flujo completo y termina siempre en "Ack" o en "Fail".
5. **¿Ya lo procesé?** Crea en n8n una tabla (*Data table*) llamada `eventos_procesados` con una columna `event_id` (no la llames `id`: la tabla ya tiene una columna `id` propia).
   - Nodo **Data table** "Buscar procesado": obtener filas donde `event_id` es igual a `{{ $('Uno a uno').item.json.id }}`. En **Settings**, activa *Always Output Data* para que el workflow siga aunque no encuentre nada. (Esa opción actúa sobre el nodo entero, no sobre cada item; por eso es correcta aquí, donde gracias al bucle solo hay un evento por vuelta.)
   - Nodo **If** "¿Ya procesado?": si `{{ $('Buscar procesado').item.json.event_id }}` no está vacío, el correo ya se envió antes: ve directo al nodo "Ack" (paso 15) y termina. No uses un filtro que descarte el evento sin hacer el ack: volvería a llegar una y otra vez hasta quedar `dead`.
6. **HTTP Request** "Leer lead": `GET https://carreras-viajeras.mentec.dev/api/integrations/n8n/leads/{{ $('Uno a uno').item.json.leadId }}` con la credencial *Header Auth*. En **Settings** → *On Error* elige *Continue (using error output)*: si no, un 404 detiene todo el workflow. Conecta la **salida de error** al nodo "Fail" con el código `lead_not_found` (por esa salida también llegan otros fallos de lectura, como la web caída; el evento se reintenta igual). A partir de aquí, el lead es siempre `$('Leer lead').item.json` (`fullName`, `firstName`, `email`, `phone`, `stage`, `source`, `trip`, `destinationText`, `archived`, `channel`, `originDetail`, `contactPreference`, `nextActionDate`, `doNotContact`).

   Conecta la salida correcta de "Leer lead" a un **Switch** "Tipo de evento" sobre `{{ $('Uno a uno').item.json.type }}` (apartado 13): `lead.created`, `lead.stage_changed` y `lead.follow_up_due` siguen al paso 7; `lead.opted_out` va al aviso de baja (apartado 13), sin Gemini; activa en **Options** la *Fallback Output* (cualquier otro tipo) y conéctala directa a "Ack" (paso 15), sin preparar nada.
7. **Edit Fields (Set)** "Datos para Gemini", con *Include Other Input Fields* **desactivado** para que solo salgan estos tres campos:
   - `etapa`: `{{ $('Uno a uno').item.json.type === 'lead.created' ? 'new' : ($('Uno a uno').item.json.type === 'lead.follow_up_due' ? $('Uno a uno').item.json.payload.stage : $('Uno a uno').item.json.payload.stageTo) }}` (la etapa del evento; en un recordatorio, `payload.stage`);
   - `firstName`: `{{ $('Leer lead').item.json.firstName }}`;
   - `viaje`: `{{ $('Leer lead').item.json.trip ? $('Leer lead').item.json.trip.title : ($('Leer lead').item.json.destinationText || 'nuestros viajes') }}`.
8. **If** "¿Sigue vigente?" (condiciones unidas con **OR**): ve al nodo "Ack" sin preparar nada (ni borrador ni correo) si se cumple cualquiera de estas:
   - `{{ $('Leer lead').item.json.archived }}` es verdadero, o `{{ $('Leer lead').item.json.stage }}` es distinto de `{{ $('Datos para Gemini').item.json.etapa }}` (el evento quedó viejo);
   - `{{ $('Leer lead').item.json.doNotContact }}` es verdadero (el contacto pidió no seguir: nunca se prepara un borrador);
   - `{{ $('Uno a uno').item.json.type === 'lead.created' && $('Uno a uno').item.json.payload.bulk === true }}` es verdadero (lead de la importación única, apartado 11: ni borrador ni correo, nada de bienvenidas en masa);
   - `{{ $('Uno a uno').item.json.type === 'lead.follow_up_due' && (!$('Leer lead').item.json.nextActionDate || $('Leer lead').item.json.nextActionDate > $('Uno a uno').item.json.payload.dueOn) }}` es verdadero (recordatorio viejo: el equipo ya quitó o reprogramó la próxima acción; si cambió la etapa, ya lo cubre la primera condición).

   Así se descartan los cambios de etapa viejos: si el equipo cambia la etapa dos veces antes de que n8n recoja los eventos, el primero ya no coincide con la etapa actual del lead y se confirma con ack sin correo; solo te llega el borrador de la última etapa.

   La salida *false* (sigue vigente) va al **Switch** "Etapa del recordatorio" (apartado 13). Su salida de respaldo, todo lo que no es un recordatorio, llega al paso 9.
9. **Switch** "Etapa" sobre `{{ $('Datos para Gemini').item.json.etapa }}`, con una salida por etapa (`new`, `contacted`, `quoted`, `reserved`, `paid`, `lost`). Para `lead.created` la etapa es `new`; para `lead.stage_changed`, la etapa nueva (`payload.stageTo`, paso 7), así que se usan el prompt (apartado 4) y la plantilla de respaldo (apartado 5) de esa etapa.
10. **Nodo de Gemini** en cada salida del Switch (crea uno y duplícalo; solo cambia el objetivo de la etapa, apartado 4). En **Settings** de cada uno: *On Error* → *Continue (using error output)* y tiempo máximo de **20 segundos** (si tu versión del nodo no tiene esa opción, llama a la API de Gemini con un nodo *HTTP Request* y en *Options* → *Timeout* pon `20000`).
11. **Code** "Borrador" (modo *Run Once for Each Item*). Conecta aquí la salida correcta **y** la de error de los seis nodos de Gemini (y de los tres de recordatorio, apartado 13). Elige el texto de Gemini si sirve y, si no, la plantilla de respaldo (apartado 5, o la de recordatorio del apartado 13). Un fallo de Gemini **no** es un error del evento: el workflow sigue con la plantilla.

    ```js
    const datos = $('Datos para Gemini').item.json;
    // Aquí $json es la salida del nodo de Gemini que llegó (correcta o de error).
    // Cambia "text" por el campo donde tu nodo de Gemini deja la respuesta (míralo en su salida).
    const texto = String($json.text ?? '').trim();
    const plantillas = {
      new: 'Hola {firstName}, gracias por escribirnos por {viaje}. Soy del equipo de Carreras Viajeras: ¿qué distancia y fechas te interesan?',
      // …pega aquí las otras cinco plantillas del apartado 5, con su etapa.
    };
    // Recordatorios (apartado 13): una plantilla por etapa de venta.
    const recordatorios = {
      new: 'Hola {firstName}, te escribimos de Carreras Viajeras por tu interés en {viaje}. ¿Te ayudamos con alguna duda? Si prefieres que no te escribamos más, dínoslo y lo respetamos.',
      // …pega aquí las de contacted y quoted del apartado 13.
    };
    const esRecordatorio = $('Uno a uno').item.json.type === 'lead.follow_up_due';
    const respaldo = (esRecordatorio ? recordatorios : plantillas)[datos.etapa].replace('{firstName}', datos.firstName).replace('{viaje}', datos.viaje);
    return { json: { borrador: texto && texto.length <= 1000 ? texto : respaldo } };
    ```
12. **Edit Fields (Set)** "Enlace WhatsApp", con un campo `enlace`: `https://wa.me/{{ $('Leer lead').item.json.phone.replace('+', '') }}?text={{ encodeURIComponent($('Borrador').item.json.borrador) }}`. Al abrirlo, WhatsApp muestra el borrador listo para revisar; no envía nada solo. Si el lead prefiere el correo (`contactPreference` es `email`) y tiene email, el enlace es un `mailto:` con el borrador en lugar de `wa.me` (tampoco envía nada solo):

    ```text
    {{ $('Leer lead').item.json.contactPreference === 'email' && $('Leer lead').item.json.email ? 'mailto:' + $('Leer lead').item.json.email + '?body=' + encodeURIComponent($('Borrador').item.json.borrador) : 'https://wa.me/' + $('Leer lead').item.json.phone.replace('+', '') + '?text=' + encodeURIComponent($('Borrador').item.json.borrador) }}
    ```
13. **Send Email** "Enviar correo" (credencial SMTP) **a ti** (apartado 6). En **Settings** → *On Error* → *Continue (using error output)* y conecta la salida de error al nodo "Fail" con el código `smtp_error`. Después del envío correcto, nodo **Data table** "Guardar procesado": insertar una fila con `event_id` = `{{ $('Uno a uno').item.json.id }}`. (Al mismo "Guardar procesado" llega también el aviso de baja del apartado 13.) Conecta su salida al paso 14.
14. **HTTP Request** "Registrar actividad", entre "Guardar procesado" y "Ack": deja en el historial del lead, en el CRM, que n8n te envió el borrador (aparece como "Automatización (n8n)"). `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/leads/{{ $('Uno a uno').item.json.leadId }}/activities` con la credencial *Header Auth* y cuerpo JSON:

    ```text
    { "eventId": "{{ $('Uno a uno').item.json.id }}", "body": "{{ $('Uno a uno').item.json.type === 'lead.opted_out' ? 'Aviso de baja enviado por correo al usuario.' : 'Borrador para la etapa ' + ({ new: 'Nuevo', contacted: 'Contactado', quoted: 'Cotizado', reserved: 'Reservado', paid: 'Pagado', lost: 'Perdido' })[$('Datos para Gemini').item.json.etapa] + ' enviado por correo al usuario.' }}" }
    ```

    El texto queda, por ejemplo, "Borrador para la etapa Cotizado enviado por correo al usuario." (los nombres de etapa son los del CRM). Es un texto fijo: **nunca** copies el borrador ni datos del lead en `body`. El aviso de baja (apartado 13) también pasa por aquí y deja "Aviso de baja enviado por correo al usuario.". En **Settings** → *On Error* → *Continue*: si este paso falla, el evento **no** se marca como fallido (el correo ya salió y el paso 5 evitaría repetirlo); su salida, correcta o de error, va a "Ack". Si el evento llega dos veces, la web no duplica la actividad.
15. **HTTP Request** "Ack": `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/events/{{ $('Uno a uno').item.json.id }}/ack` con la credencial *Header Auth* y cuerpo JSON `{ "leaseToken": "{{ $('Uno a uno').item.json.leaseToken }}" }`. En **Settings** → *On Error* → *Continue*: si responde 409 (`lease_lost`), no te preocupes; el evento volverá a llegar y el paso 5 evitará un segundo correo. Con *Continue*, un error sale por la salida normal: conéctala de vuelta a "Uno a uno". A "Ack" llegan cuatro caminos: el duplicado (paso 5), un tipo de evento desconocido (paso 6), el evento viejo (paso 8) y "Registrar actividad" (paso 14), por donde pasan el correo enviado (paso 13) y el aviso de baja enviado (apartado 13).

**Rama de error**, nodo **HTTP Request** "Fail": `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/events/{{ $('Uno a uno').item.json.id }}/fail` con la credencial *Header Auth* y cuerpo JSON `{ "leaseToken": "{{ $('Uno a uno').item.json.leaseToken }}", "errorCode": "<código>" }`. Usa un nodo "Fail" por código (o escribe el código en un campo antes de llegar a él). Como "Ack", cada nodo "Fail" tiene *On Error* → *Continue* y su salida vuelve a "Uno a uno". Códigos sugeridos: `smtp_error` (no se pudo enviar el correo), `lead_not_found` (no se pudo leer el lead), `lead_read_error` (si separas la lectura fallida del 404) y `unexpected_error` (cualquier otro). Usa solo códigos cortos: nunca copies el texto del error del proveedor.

Con 10 eventos por minuto, procesados uno a uno, y hasta 20 s de Gemini por evento, el lote cabe holgado en los 5 minutos de reserva.

#### 4. Qué datos recibe Gemini y prompt por etapa

**Lista cerrada de datos que se envían a Gemini:** solo `firstName` (el nombre de pila), la etapa y el viaje (`trip.title`) o el destino (`destinationText`), más el texto fijo del prompt. **Nunca** se envían el teléfono, el correo, los apellidos, las notas, el historial, el origen y su detalle, la preferencia de contacto ni ningún id. El nodo de Gemini no recibe el lead completo: su mensaje se escribe solo con los tres campos del nodo "Datos para Gemini" (paso 7):

```text
Etapa: {{ $('Datos para Gemini').item.json.etapa }}
Nombre de pila: {{ $('Datos para Gemini').item.json.firstName }}
Viaje o destino: {{ $('Datos para Gemini').item.json.viaje }}
```

Los recordatorios (apartado 13) usan exactamente estos tres campos: se distinguen por el texto fijo de su prompt, no por datos. La fecha y la nota de la próxima acción, como el aviso de baja, nunca llegan a Gemini.

Ampliar esta lista exige tu decisión explícita y un cambio de la spec. Ten en cuenta que, en el plan gratuito de la API de Gemini, Google puede usar lo que le envías para mejorar sus productos.

**Instrucciones comunes** (en todas las etapas; ajusta el tono si quieres):

> Eres el asistente comercial de Carreras Viajeras, una agencia peruana de viajes para runners. Escribe un mensaje de WhatsApp breve (máximo 600 caracteres), cálido y en español neutro de Perú, tuteando, sin inventar precios, fechas, cupos ni condiciones que no te doy. Firma como «Equipo Carreras Viajeras». Devuelve solo el texto del mensaje.

**Objetivo de cada etapa** (se añade a las instrucciones comunes):

| Etapa | Objetivo del mensaje |
|---|---|
| `new` (Nuevo) | Dar la bienvenida, agradecer el interés en el viaje o destino y preguntar qué distancia y fechas le interesan. |
| `contacted` (Contactado) | Retomar la conversación y ofrecer resolver dudas. |
| `quoted` (Cotizado) | Recordar que tiene una cotización y ofrecer ayuda para reservar. |
| `reserved` (Reservado) | Agradece la reserva y transmite que desde ahora le acompañamos en cada paso; sin cifras, sin ofrecer otros viajes ni promociones. |
| `paid` (Pagado) | Agradece la confianza y da la bienvenida al viaje; anuncia que le compartiremos la preparación y el itinerario; sin ofrecer otros viajes. |
| `lost` (Perdido) | Despedirse con cordialidad y dejar la puerta abierta a próximos viajes. |

Desde `reserved` la comunicación es de **acompañamiento**, no de venta: por eso los objetivos de `reserved` y `paid` no ofrecen nada y no hay recordatorios automáticos en esas etapas (apartado 12).

#### 5. Plantillas fijas de respaldo

Una por etapa, en un nodo *Set* o *Code*. `{firstName}` es el nombre de pila y `{viaje}` el título del viaje o, si no hay viaje, el destino:

| Etapa | Plantilla |
|---|---|
| `new` | Hola {firstName}, gracias por escribirnos por {viaje}. Soy del equipo de Carreras Viajeras: ¿qué distancia y fechas te interesan? |
| `contacted` | Hola {firstName}, te escribimos de Carreras Viajeras para retomar tu consulta sobre {viaje}. ¿Tienes alguna duda en la que te podamos ayudar? |
| `quoted` | Hola {firstName}, ¿pudiste revisar la cotización de {viaje}? Si quieres, te ayudamos con los pasos para reservar. Equipo Carreras Viajeras |
| `reserved` | Hola {firstName}, ¡gracias por reservar tu lugar en {viaje}! Desde ahora te acompañamos en cada paso y te escribiremos con lo que sigue. Equipo Carreras Viajeras |
| `paid` | Hola {firstName}, ¡tu viaje a {viaje} ya está completo! Gracias por tu confianza. Te iremos compartiendo la preparación y el itinerario. Equipo Carreras Viajeras |
| `lost` | Hola {firstName}, gracias por tu interés en {viaje}. Si más adelante quieres correr con nosotros, aquí estaremos. Equipo Carreras Viajeras |

#### 6. El correo que recibes

- **Asunto:** "Nuevo lead: {fullName} · {viaje}" para un `lead.created` del formulario web (`source = "web_form"`), "Nuevo lead (Google Forms): {fullName} · {viaje}" para un `lead.created` de Google Forms (`source = "google_form"`), "Recordatorio para {fullName} · {etapa}" para un `lead.follow_up_due` (apartado 13), "Reserva confirmada: {fullName}" para un `lead.stage_changed` cuyo `payload.trigger` es `booking` (el lead pasó a Reservado porque el equipo confirmó su reserva en el CRM: `{{ $('Uno a uno').item.json.payload.trigger === 'booking' }}`), o "Lead {fullName}: etapa {etapa}" en los demás casos. El aviso de baja (`lead.opted_out`) tiene su propio correo, sin borrador (apartado 13).
- **De dónde sale cada dato:** `{fullName}`, el correo y el teléfono del lead, de `$('Leer lead').item.json` (`fullName`, `email`, `phone`); `{viaje}` y `{etapa}`, de `$('Datos para Gemini').item.json`; el borrador, de `$('Borrador').item.json.borrador`; el enlace, de `$('Enlace WhatsApp').item.json.enlace`. Para saber si es un lead nuevo del formulario web o de Google Forms: `$('Uno a uno').item.json.type` es `lead.created` y `$('Leer lead').item.json.source` es `web_form` o `google_form`.
- **Contenido:** nombre, correo y teléfono del lead, el viaje o destino, el origen y la preferencia de contacto (abajo), el borrador y el botón o enlace de WhatsApp o de correo (paso 12), con este aviso: "Revisa y edita el mensaje antes de enviarlo. Nada se envía automáticamente.". En un recordatorio, añade debajo: "Es el único recordatorio automático de esta etapa.".
- **Origen y preferencia**, con las mismas etiquetas que el CRM (pega estas dos líneas en el cuerpo del correo):

  ```text
  Origen: {{ ({ event: 'Feria, carrera o activación', partner: 'Club, gimnasio o aliado', referral: 'Referido', whatsapp: 'WhatsApp (mensaje directo)', whatsapp_status: 'Estado de WhatsApp', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', google_ads: 'Google Ads', luma: 'Luma', web: 'Web', other: 'Otro', unknown: 'Desconocido' })[$('Leer lead').item.json.channel] }}{{ $('Leer lead').item.json.originDetail ? ' · ' + $('Leer lead').item.json.originDetail : '' }}
  Prefiere: {{ ({ whatsapp: 'WhatsApp', email: 'Correo', call: 'Llamada' })[$('Leer lead').item.json.contactPreference] || 'Sin preferencia' }}
  ```
- El aviso de **"nuevo lead"** se envía para los leads del formulario web y de Google Forms. Los leads que el equipo crea a mano en el CRM también generan `lead.created`, pero su correo solo lleva el borrador de la etapa. Los de la importación única (`bulk: true`) no generan correo ni borrador (paso 8).
- El correo es el **único** canal de aviso. El mensaje al runner siempre lo revisa y lo envía una persona desde WhatsApp Business App.

#### 7. Eventos muertos (`dead`)

Tras 8 intentos fallidos, un evento queda `dead` y n8n ya no lo recibe. Por ahora se consultan en el SQL Editor de Neon:

```sql
SELECT id, type, lead_id, attempts, last_error_code, created_at
FROM outbox_events WHERE status = 'dead' ORDER BY created_at DESC;
```

Reenviarlos desde el CRM queda para una spec posterior.

#### 8. Prueba manual de la API (rama de desarrollo de Neon)

Con `npm run dev`, `.env.local` apuntando a una **rama de desarrollo** de Neon con `0005` aplicada y `N8N_API_TOKEN` cargado:

```sh
curl -s -X POST -H "Authorization: Bearer $N8N_API_TOKEN" http://localhost:3000/api/integrations/n8n/events/claim
```

- Sin la cabecera, o con otro token, responde `401`.
- Crea dos leads de prueba en el CRM y lanza dos `claim` a la vez (dos terminales, o `& wait`): ningún evento aparece en las dos respuestas.
- Reclama un evento y no lo confirmes: a los 5 minutos vuelve a aparecer en otro `claim` con otro `leaseToken` y `attempts` sube en 1.
- **Cambio de etapa:** cambia la etapa de un lead en el CRM (por ejemplo, de "Nuevo" a "Contactado"): el siguiente `claim` devuelve un evento `lead.stage_changed` con `"payload": { "stageFrom": "new", "stageTo": "contacted" }`. Guardar la misma etapa no crea ningún evento.
- **Dos cambios seguidos:** con n8n apagado, cambia la etapa de un lead dos veces ("Nuevo" → "Contactado" → "Cotizado") y enciende n8n: el primer evento se descarta con ack (obsoleto, paso 8) y solo te llega un correo, el de "Cotizado".
- **Registrar actividad:** con el `id` de un evento y el `leadId` de ese evento:

  ```sh
  curl -s -X POST -H "Authorization: Bearer $N8N_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"eventId":"<id del evento>","body":"Borrador para la etapa Contactado enviado por correo al usuario."}' \
    http://localhost:3000/api/integrations/n8n/leads/<leadId>/activities
  ```

  La primera vez responde `201 { "status": "recorded" }` y el historial del lead muestra la actividad de "n8n"; repetida, `200 { "status": "duplicate" }`; con el `leadId` de otro lead, `404`; con un `body` vacío o de más de 500 caracteres, `400`.
- Alta por Google Forms (necesita `0007` aplicada en esa rama). Usa un teléfono de prueba que no esté en el CRM:

  ```sh
  curl -s -X POST -H "Authorization: Bearer $N8N_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"source":"google_form","externalId":"prueba:2","consentVersion":"google-form-v1","consentedAt":"2026-09-14T08:12:00-05:00","fullName":"Prueba Forms","phone":"+51 900 000 001","tripSlug":"maraton-santiago-2027","channel":"instagram"}' \
    http://localhost:3000/api/integrations/n8n/leads
  ```

  La primera vez responde `201 { "status": "created", … }` y en el CRM aparece "Sin asignar", vía "Google Forms", etapa "Nuevo"; repetida, `200 { "status": "duplicate", … }`; con otro `fullName` y el mismo `externalId`, `409`; con otro `externalId` y el mismo teléfono, `200 { "status": "existing", … }` con el id del primero; con `"tripSlug":"no-existe"` (y otro teléfono y `externalId`), `422`.

#### 9. Regla WAF opcional contra abusos

Es una defensa adicional a Turnstile para los dos formularios públicos: `/contacto` y el registro de cada carrera (`/viajes/<slug>/registro`). Cada envío es una sola petición `POST` a la propia página; abrir la página es un `GET` y no cuenta. Se configura sin tocar código, en el plan Free de Cloudflare (una regla, periodo de 10 segundos, contada por IP):

1. Panel de Cloudflare → el dominio `mentec.dev` → **Security** → **WAF** → **Rate limiting rules** → **Create rule** (si ya existía la regla antigua solo para `POST /contacto`, edítala en lugar de crear otra).
2. Nombre: "Formularios de captación". En **Edit expression**, pega:

   ```txt
   (http.request.method eq "POST" and http.host eq "carreras-viajeras.mentec.dev" and (http.request.uri.path eq "/contacto" or (starts_with(http.request.uri.path, "/viajes/") and ends_with(http.request.uri.path, "/registro"))))
   ```

3. **Characteristics:** IP. **When rate exceeds:** 10 peticiones por **10 segundos**. **Action:** Block durante **10 segundos**.
4. Guarda y despliega la regla.

Por qué ese umbral: un stand envía como mucho un registro cada ~30 segundos desde la misma IP, y en una feria varios móviles pueden salir a Internet con la misma IP del operador o del Wi-Fi del recinto. Con 10 envíos cada 10 segundos ninguno de los dos casos se acerca al límite, y un script que envía en bucle queda bloqueado en segundos (Turnstile ya rechaza los envíos sin verificar). Si el editor de tu plan no ofrece el método o las funciones `starts_with`/`ends_with`, usa solo la ruta (`http.request.uri.path eq "/contacto" or http.request.uri.path wildcard "/viajes/*/registro"`) y sube el umbral a 20 peticiones por 10 segundos, porque entonces también cuentan las visitas. Si alguna vez bloquea a gente real (por ejemplo, en el stand), sube el umbral; no la desactives sin avisar.

#### 10. Workflow "Alta desde Google Forms"

Lleva cada respuesta nueva del Google Forms al CRM. Es un workflow aparte del principal: el lead nuevo llega después al workflow principal por su `lead.created`, que te avisa con el asunto "Nuevo lead (Google Forms): …" y te prepara el borrador. **Actívalo solo cuando** el texto legal de `google-form-v1` esté confirmado y conozcas las columnas reales de la hoja de respuestas (preguntas abiertas 3 y 4 de [`crm-journey-automation.md`](docs/specs/crm-journey-automation.md)).

1. **Google Sheets Trigger** (credencial Google Sheets): evento *Row Added* en la hoja de respuestas del formulario. **No ordenes ni borres filas** de esa hoja: el número de fila forma parte del id de cada respuesta.
2. **Code** "Normalizar" (modo *Run Once for All Items*). Cambia los textos entre comillas por los títulos reales de tus columnas. Descarta las respuestas sin consentimiento:

   ```js
   const HOJA = 'ID_DE_LA_HOJA'; // el id que aparece en la URL de la hoja, entre /d/ y /edit
   // Valores de "¿Cómo nos conociste?" → origen del CRM (sin respuesta o desconocida: unknown).
   const ORIGENES = { 'Instagram': 'instagram', 'Facebook': 'facebook', 'TikTok': 'tiktok', 'Un amigo me recomendó': 'referral', 'En una carrera o feria': 'event' };
   const PREFERENCIAS = { 'WhatsApp': 'whatsapp', 'Correo': 'email', 'Llamada': 'call' };
   const texto = (valor) => String(valor ?? '').trim();
   return $input.all()
     .filter((item) => texto(item.json['Acepto el tratamiento de mis datos']) !== '')
     .map((item) => {
       const fila = item.json;
       // Teléfono: sin espacios ni guiones; 9 dígitos que empiezan por 9 = celular de Perú.
       let telefono = texto(fila['Teléfono (WhatsApp)']).replace(/[\s().-]/g, '');
       if (/^9\d{8}$/.test(telefono)) telefono = '+51' + telefono;
       // Marca temporal "14/09/2026 8:12:00" (hora de Lima) → "2026-09-14T08:12:00-05:00".
       const [fecha, hora] = texto(fila['Marca temporal']).split(' ');
       const [dia, mes, anio] = fecha.split('/');
       const [h, min, seg] = hora.split(':');
       const consentedAt = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${seg}-05:00`;
       return { json: {
         fila: fila.row_number,
         body: {
           source: 'google_form',
           externalId: `${HOJA}:${fila.row_number}`,
           consentVersion: 'google-form-v1',
           consentedAt,
           fullName: texto(fila['Nombre y apellidos']),
           phone: telefono,
           email: texto(fila['Correo electrónico']),
           tripSlug: 'maraton-santiago-2027',
           channel: ORIGENES[texto(fila['¿Cómo nos conociste?'])] ?? 'unknown',
           contactPreference: PREFERENCIAS[texto(fila['¿Cómo prefieres que te contactemos?'])] ?? '',
         },
       } };
     });
   ```
3. **HTTP Request** "Registrar lead": `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/leads` con la credencial *Header Auth* y cuerpo JSON `{{ JSON.stringify($json.body) }}`. En **Settings** → *On Error* → *Continue (using error output)*.
4. **If** "¿Ya existía?" en la salida correcta: si `{{ $json.status }}` es `existing`, **Send Email** a ti con el texto "Este contacto ya está en el CRM: https://carreras-viajeras.mentec.dev/crm/leads/{{ $json.leadId }}" (la persona volvió a llenar el formulario; no se creó otra ficha). Con `created` o `duplicate` no hace falta nada más.
5. En la **salida de error** (respuestas `400`, `409`, `422`, `5xx` o la web caída): **Send Email** a ti con "No se pudo registrar la fila {{ $('Normalizar').item.json.fila }} del formulario". No pongas datos de la persona en ese correo: revisa la fila en la hoja.

Si la misma respuesta se envía dos veces (n8n reintenta o la reprocesas), la web responde `duplicate` y no crea nada.

#### 11. Workflow "Importación única"

Carga **una sola vez** los 180 registros del módulo de la Media Maratón de Lima. Entran "Sin asignar", en "Nuevo" y **sin bienvenida**: su `lead.created` lleva `bulk: true` y el workflow principal hace ack sin preparar borrador ni enviarte correo (apartado 3, paso 8). Nadie recibe nada: después el equipo decide a quién escribir y cuándo, desde el CRM.

**Antes de empezar:** confirma el texto legal de `import-mml-v1` (lo que aceptaron los 180) y las columnas del archivo (preguntas abiertas 3 y 4 de [`crm-journey-automation.md`](docs/specs/crm-journey-automation.md)). Un registro sin un consentimiento que cubra el contacto **no se importa**.

1. **Read/Write Files from Disk** (el CSV de los 180 en tu computadora) → **Extract from File** "Leer CSV" (*Extract From CSV*, con la primera fila como encabezados) → **Code** "Numerar" (modo *Run Once for All Items*) con `return $input.all().map((item, i) => ({ json: { ...item.json, fila: i + 2 } }));` (la fila 1 son los encabezados). Se numera antes de filtrar para que cada registro conserve su número de fila. No reordenes el archivo entre una ejecución y otra: el número de fila forma parte del id.
2. **Filter** "Con consentimiento": deja pasar solo las filas cuyo consentimiento está marcado (ajusta la columna).
3. **Code** "Normalizar" (modo *Run Once for All Items*), como el del apartado 10 pero con `source: "import"` y los datos fijos de la importación. Ajusta los títulos de las columnas y el nombre exacto del evento:

   ```js
   const texto = (valor) => String(valor ?? '').trim();
   return $input.all().map((item) => {
     const fila = item.json;
     let telefono = texto(fila['Teléfono']).replace(/[\s().-]/g, '');
     if (/^9\d{8}$/.test(telefono)) telefono = '+51' + telefono;
     // Fecha del registro "12/04/2026" (hora de Lima) → "2026-04-12T00:00:00-05:00".
     const [dia, mes, anio] = texto(fila['Fecha de registro']).split('/');
     return { json: {
       fila: fila.fila,
       body: {
         source: 'import',
         externalId: `mml-2026:${fila.fila}`,
         consentVersion: 'import-mml-v1',
         consentedAt: `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T00:00:00-05:00`,
         fullName: texto(fila['Nombre']),
         phone: telefono,
         email: texto(fila['Correo']),
         tripSlug: 'maraton-santiago-2027',
         channel: 'event',
         originDetail: 'Media Maratón de Lima 2026', // el nombre exacto del evento
       },
     } };
   });
   ```
4. **Loop Over Items** "Fila a fila" con *Batch Size* = `1`. Su salida *loop* va a un **Wait** de 1 segundo y de ahí a:
5. **HTTP Request** "Importar fila": `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/leads` con la credencial *Header Auth* y cuerpo JSON `{{ JSON.stringify($('Fila a fila').item.json.body) }}`. En **Options** → *Response* activa *Include Response Headers and Status* y *Never Error*, para que un `409` o un `422` no detengan la importación. *Never Error* solo cubre las respuestas HTTP: en **Settings** → *On Error* elige además *Continue*, para que una caída de red o un timeout no corten el bucle y esa fila salga como error en el resumen.
6. **Edit Fields (Set)** "Resultado", con *Include Other Input Fields* desactivado: `fila` = `{{ $('Fila a fila').item.json.fila }}` y `estado` = `{{ $json.body?.status ?? $json.body?.error ?? ($json.statusCode ? 'http_' + $json.statusCode : 'sin_respuesta') }}` (`sin_respuesta`: caída de red o timeout, sin respuesta de la web). Conecta su salida **de vuelta a la entrada de "Fila a fila"**.
7. En la salida *done* de "Fila a fila", **Code** "Resumen" (modo *Run Once for All Items*) y un solo **Send Email** a ti con su texto. Solo lleva conteos y números de fila, nunca datos de las personas:

   ```js
   const conteos = {};
   const conError = [];
   for (const { json } of $input.all()) {
     conteos[json.estado] = (conteos[json.estado] ?? 0) + 1;
     if (!['created', 'duplicate', 'existing'].includes(json.estado)) conError.push(json.fila);
   }
   const lineas = Object.entries(conteos).map(([estado, n]) => `${estado}: ${n}`);
   return [{ json: { texto: `Importación terminada.\n${lineas.join('\n')}\nFilas con error: ${conError.join(', ') || 'ninguna'}` } }];
   ```

   `created` son leads nuevos; `duplicate`, filas ya importadas en una ejecución anterior; `existing`, personas que ya estaban en el CRM con ese teléfono (no se tocan). Las filas con `conflict` (la fila cambió desde la importación anterior), `invalid_request` (algún dato no cumple el formato) o `unknown_trip` se revisan a mano; las de `sin_respuesta` basta con volver a ejecutar el workflow.

**Prueba previa (obligatoria):** con `npm run dev`, `.env.local` apuntando a una **rama de desarrollo** de Neon con `0007` aplicada y un CSV de **3 filas**, cambia en los dos nodos HTTP la dirección por `http://localhost:3000/api/integrations/n8n/leads`. Comprueba en el CRM que aparecen los 3 leads "Sin asignar" con vía "Importación" y que no recibes ningún correo de "nuevo lead". Vuelve a ejecutar el workflow: el resumen debe decir `duplicate: 3` (o `existing`) y no se crea nada.

**La importación real la lanzas tú** contra la web desplegada (`https://carreras-viajeras.mentec.dev`), cuando autorices el despliegue y con la `0007` aplicada en producción. Repetirla por error no duplica personas, siempre que las filas se envíen una a una y en secuencia, como hace el paso 4: dos peticiones simultáneas con el mismo teléfono y distinto `externalId` pueden crear dos leads.

#### 12. Workflow "Recordatorios diarios"

Si un corredor no responde y su próxima acción ya venció, n8n te prepara **un solo** recordatorio por etapa, como borrador para que lo revises (nada se le envía solo). Es un workflow aparte, de dos nodos:

1. **Schedule Trigger** "Cada día": todos los días a las **09:00**. En los **Settings** del workflow, *Timezone* = `America/Lima`, para que las 09:00 sean hora de Lima y no la de tu computadora.
2. **HTTP Request** "Encolar recordatorios": `POST https://carreras-viajeras.mentec.dev/api/integrations/n8n/follow-ups/enqueue` con la credencial *Header Auth* y cuerpo JSON `{ "limit": 20 }`. Responde `{ "enqueued": <n> }`. En **Settings** → *On Error* → *Continue (using error output)* y, en la salida de error, **Send Email** a ti con "No se pudieron preparar los recordatorios de hoy" (sin datos de nadie). Si un día falla, no pasa nada: al día siguiente se encolan los que sigan pendientes.

La web decide quién recibe recordatorio; n8n no filtra nada aquí:

- solo leads en **Nuevo, Contactado o Cotizado**, no archivados y que **no** pidieron no seguir. Desde "Reservado" el acompañamiento es personal y no hay recordatorios automáticos;
- con la **próxima acción para hoy o vencida**, según la fecha de Lima (la calcula la web);
- **uno por etapa:** si el corredor sigue sin responder, no hay un segundo recordatorio en esa etapa, aunque la próxima acción siga vencida o la reprogrames. Cuando el lead cambia de etapa (señal de que respondió o avanzó), puede tener otro. Después del recordatorio, lo que siga lo decides tú en el CRM;
- como máximo **20 al día** (`limit`, de 1 a 50), los más vencidos primero; si hay más, el resto entra al día siguiente.

Llamar a la petición dos veces el mismo día (o reintentarla) no duplica nada. Cada recordatorio llega al workflow principal como un evento `lead.follow_up_due` en el siguiente minuto, y ahí se prepara el borrador y te llega el correo (apartado 13).

**Prueba manual (rama de desarrollo de Neon, `0007` aplicada, `npm run dev`):** en el CRM deja cuatro leads de prueba: uno en "Contactado" con la próxima acción de **ayer**; otro con "Pidió no seguir"; otro en "Reservado" con la próxima acción vencida; y otro con la próxima acción para **mañana**. Luego:

```sh
curl -s -X POST -H "Authorization: Bearer $N8N_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"limit":20}' http://localhost:3000/api/integrations/n8n/follow-ups/enqueue
```

- La primera vez responde `{ "enqueued": 1 }` (solo el de "Contactado") y la segunda, `{ "enqueued": 0 }`.
- Al día siguiente, si su próxima acción sigue vencida, sigue en `0`. Si cambias su etapa a "Cotizado" con una próxima acción vencida, la siguiente llamada devuelve `1`.
- `{"limit":0}`, `{"limit":51}` o `{"limit":"20"}` responden `400`; sin token, `401`.

#### 13. Recordatorios y aviso de baja en el workflow principal

El workflow principal (apartado 3) recibe dos tipos de evento más. El **Switch** "Tipo de evento" (al final del paso 6) los separa:

| Tipo de evento | Camino |
|---|---|
| `lead.created`, `lead.stage_changed` | Como hasta ahora (pasos 7 a 15). |
| `lead.follow_up_due` (recordatorio) | Pasos 7 y 8 con la etapa `payload.stage` → Switch "Etapa del recordatorio" → Gemini de recordatorio → "Borrador" → pasos 12 a 15. |
| `lead.opted_out` (pidió no seguir) | Correo "Aviso de baja", sin Gemini → "Guardar procesado" → "Registrar actividad" → "Ack". |
| Cualquier otro | Salida de respaldo → "Ack", sin preparar nada. |

**Si aún no actualizaste el workflow,** los eventos nuevos no rompen nada: llegan sin `stageTo`, "Datos para Gemini" deja la etapa vacía y "¿Sigue vigente?" (paso 8) hace ack sin preparar borrador ni correo (en un `lead.opted_out`, además, `doNotContact` es verdadero). Simplemente no recibes el recordatorio ni el aviso hasta que lo actualices.

**Aviso de baja (`lead.opted_out`).** Cuando el equipo registra en el CRM que un contacto "Pidió no seguir", puede haber borradores suyos en tu correo que aún no enviaste. Este aviso te pide descartarlos:

1. **Send Email** "Aviso de baja" (credencial SMTP) **a ti**, con asunto "Pidió no seguir: {{ $('Leer lead').item.json.fullName }}" y el texto "Pidió no seguir: {{ $('Leer lead').item.json.fullName }}. Descarta cualquier borrador pendiente de este lead.". Sin borrador, sin enlace de WhatsApp y sin pasar por Gemini. En **Settings** → *On Error* → *Continue (using error output)* y conecta la salida de error al nodo "Fail" con el código `smtp_error`.
2. Después del envío correcto, al mismo **Data table** "Guardar procesado" del paso 13 y de ahí, por "Registrar actividad" (paso 14), a "Ack".

Desde ese momento, "Leer lead" devuelve `doNotContact: true` y el paso 8 hace ack de cualquier otro evento de ese lead sin preparar nada.

**Recordatorio (`lead.follow_up_due`).**

- **"Datos para Gemini"** (paso 7) toma la etapa de `payload.stage`; los tres campos que salen hacia Gemini no cambian (`etapa`, `firstName`, `viaje`).
- **"¿Sigue vigente?"** (paso 8) hace ack sin preparar nada si el lead ya no está en esa etapa, si su próxima acción se quitó o se movió a una fecha posterior a `payload.dueOn`, si está archivado o si pidió no seguir.
- **Switch** "Etapa del recordatorio", entre "¿Sigue vigente?" y el Switch "Etapa" (paso 9), en modo *Rules*, con tres salidas: `{{ $('Uno a uno').item.json.type === 'lead.follow_up_due' && $('Datos para Gemini').item.json.etapa === 'new' }}` (y lo mismo con `contacted` y `quoted`). Activa en **Options** la *Fallback Output* y conéctala al Switch "Etapa": por ahí siguen todos los eventos que no son recordatorios.
- **Tres nodos de Gemini** "Recordatorio new", "Recordatorio contacted" y "Recordatorio quoted", uno por salida, con los mismos *Settings* que los del paso 10 (*On Error* → *Continue (using error output)*, 20 segundos) y su salida correcta y de error conectadas a "Borrador" (paso 11). Su prompt son las instrucciones comunes del apartado 4, el mismo mensaje con los tres campos de "Datos para Gemini" y este objetivo fijo, igual en los tres:

  > Escribe un único recordatorio breve y útil, sin presionar: retoma la consulta, ofrece resolver una duda y deja claro que puede responder cuando quiera o pedirnos que no le escribamos más.

- **Plantillas de respaldo** (en el objeto `recordatorios` del código "Borrador", paso 11):

  | Etapa | Plantilla del recordatorio |
  |---|---|
  | `new` | Hola {firstName}, te escribimos de Carreras Viajeras por tu interés en {viaje}. ¿Te ayudamos con alguna duda? Si prefieres que no te escribamos más, dínoslo y lo respetamos. |
  | `contacted` | Hola {firstName}, ¿pudiste pensar en {viaje}? Estamos para resolver cualquier duda. Si prefieres que no te escribamos más, dínoslo y lo respetamos. |
  | `quoted` | Hola {firstName}, ¿pudiste revisar la propuesta de {viaje}? Si te ayuda, la vemos juntos. Si prefieres que no te escribamos más, dínoslo y lo respetamos. |

- **Correo** (paso 13 y apartado 6): asunto "Recordatorio para {fullName} · {etapa}" y, debajo del aviso de revisión, "Es el único recordatorio automático de esta etapa.". Para el asunto:

  ```text
  {{ $('Uno a uno').item.json.type === 'lead.follow_up_due' ? 'Recordatorio para ' + $('Leer lead').item.json.fullName + ' · ' + $('Datos para Gemini').item.json.etapa : '…el asunto que ya tenías (apartado 6)…' }}
  ```

Si el corredor responde, cambia su etapa en el CRM: eso abre una etapa nueva y, si vuelve a quedarse sin respuesta, tendrá como máximo otro recordatorio. Si pide que no le escribamos más, registra "Pidió no seguir" en su ficha.

## Reservas y portal del runner

Especificado en [`runner-portal.md`](docs/specs/runner-portal.md). El equipo registra en el CRM las reservas, los pagos confirmados, el itinerario y los avisos de cada viaje, y el runner los consulta en una página privada de solo lectura, `/mis-carreras`. La Fase 1 añade las tablas, el permiso y las lecturas del runner; las páginas del CRM y `/mis-carreras` llegan en las fases siguientes.

- **Una reserva por participante.** Cada persona que viaja, incluido un acompañante, tiene su propia reserva con su propio correo (`participant_email`, en minúsculas). El titular no ve las reservas de sus acompañantes. El paquete se distingue con `package_label` (p. ej. "Paquete acompañante").
- **Vínculo por correo verificado, autorización por `user_id`.** En cada carga de `/mis-carreras` con el correo verificado, una sola sentencia vincula las reservas sin cuenta de ese correo (`runner_user_id IS NULL`) al `user.id` de la sesión. Desde entonces el runner solo lee filas con `runner_user_id = <su user.id>`; el correo no vuelve a usarse. Con el correo sin verificar no se vincula ni se lee nada. El correo de la reserva solo se edita mientras no está vinculada. Vincular no crea filas en `profiles` ni `staff_*`.
- **Permiso `bookings.manage`:** lo tienen `admin` y `commercial`. Una cuenta sin rol de staff (runner) no tiene ningún permiso del CRM.
- **Importes en USD enteros**, sin centavos ni columna de moneda: `bookings.total_usd` (`>= 0`) y `booking_payments.amount_usd` (`> 0`) son `integer`, como `trips.price_usd`, y se muestran con `formatTripPrice` ("US$ 1,499"). El saldo (`total_usd` menos los pagos no anulados) se calcula al leer; no se guarda.
- **Sin borrado físico:** las reservas se cancelan y los pagos se anulan (`voided_at` y `voided_by`).
- **Confirmar una reserva solo tras recibir el pago y la aceptación de las condiciones por parte del corredor.** El CRM todavía no lo comprueba. Desde [`crm-journey-automation.md`](docs/specs/crm-journey-automation.md) F5, confirmar una reserva vinculada a un lead pasa ese lead a Reservado y dispara el correo de n8n ("Reserva confirmada"). Las condiciones de la reserva (monto, plazo, reembolso) siguen pendientes: Pregunta abierta 2 de esa spec.
- **El runner nunca recibe** `participant_email`, `internal_note`, `created_by`, `recorded_by`, pagos anulados ni hitos con `runner_visible = false`. Los hitos de nivel viaje (`booking_id` nulo) y los avisos los ven todos los participantes del viaje.

### Migración de las tablas de reservas

> **Numeración.** Esta migración ya está en `main` con su nombre definitivo, `drizzle/0003_talented_skin.sql`. La de captura y outbox del PR #12 se regeneró como `0004` y, al integrar los campos de carrera del PR #20 (`0004_sloppy_bushwacker`), se renumeró como `0005_supreme_pepper_potts`, y la del recorrido del corredor, como `0006_flashy_bastion`, sin cambiar sus sentencias (ver [Migración de captura y outbox](#migración-de-captura-y-outbox)), y cualquier otro PR abierto con una `0003` propia debe regenerarla igual sobre `main`. Una migración ya aplicada nunca se edita.

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **Orden: después de `0001` (viajes) y `0002` (leads).** Las tablas nuevas referencian `trips` y `profiles`. **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff.

1. Revisar `drizzle/0003_talented_skin.sql`: solo crea, en `public`, los enums `booking_status`, `itinerary_kind` e `itinerary_status`, las tablas `bookings` (seis CHECK y la restricción única `bookings_id_trip_uq`), `booking_payments` (tres CHECK), `itinerary_items` (seis CHECK, incluido `itinerary_items_schedule_chk`) y `trip_updates` (dos CHECK), sus nueve claves foráneas (`ON DELETE restrict`, hacia `trips`, `profiles` y `bookings`, incluida la compuesta `itinerary_items_booking_trip_fk`) y siete índices (entre ellos el único parcial `bookings_trip_email_active_uq`). `total_usd` y `amount_usd` son `integer`. No hay cambios en `profiles`, `staff_*`, `trips`, `leads` ni `lead_activities`. `grep -inE 'neon_auth|drop|create schema' drizzle/0003_talented_skin.sql` no devuelve nada.
2. Comprobar que las anteriores están aplicadas en esa rama: `SELECT to_regclass('public.trips'), to_regclass('public.leads');` no devuelve `NULL`. Si falta alguna, aplicarla antes siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes) y [Migración de la tabla de leads](#migración-de-la-tabla-de-leads).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0003` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0003_talented_skin.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar las tablas: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE conrelid IN ('public.bookings'::regclass, 'public.booking_payments'::regclass, 'public.itinerary_items'::regclass, 'public.trip_updates'::regclass) ORDER BY 1, 2;` lista 31 restricciones (cuatro `*_pkey`, `bookings_id_trip_uq`, diecisiete `*_chk` y nueve `*_fk`), y `SELECT count(*) FROM bookings;` devuelve 0.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

### Pruebas manuales de la Fase 1

**Solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`, con un perfil de staff y dos viajes de prueba creados en esa misma transacción. Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite seguir con la siguiente prueba; en el SQL Editor, ejecutar cada caso en su propio `BEGIN;` … `ROLLBACK;`. La base debe rechazar:

- un `participant_email` con mayúsculas;
- un `total_usd` negativo o con decimales. **El decimal se pasa como texto**, igual que lo envía el driver: `total_usd = '1499.5'` falla con `invalid input syntax for type integer`. Sin comillas (`1499.5`), Postgres lo redondea a 1500 al guardarlo en una columna `integer` y la prueba no demuestra nada;
- dos reservas no canceladas del mismo viaje y correo (`bookings_trip_email_active_uq`). Tras cancelar la primera (`status = 'cancelled'`), la segunda sí se inserta;
- un pago con `amount_usd = 0`, o con `voided_at` sin `voided_by`;
- un hito con hora sin fecha, con hora sin zona, con `end_date < start_date`, o con un `booking_id` de una reserva de **otro** viaje (FK compuesta `itinerary_items_booking_trip_fk`);
- un aviso (`trip_updates`) con título vacío;
- un `trip_id` inexistente en `bookings`, `itinerary_items` o `trip_updates`.

Sí se insertan: una reserva válida (`'ana@example.com'`, `total_usd = '1499'`) y la de su acompañante en el mismo viaje con otro correo; un pago de `'300'`; un hito de viaje sin `booking_id`; un vuelo de reserva con salida `2027-05-14 01:30` `America/Lima` y llegada `2027-05-14 06:55` `America/Santiago`; y un aviso con título y mensaje.

### Desvincular o reasignar una reserva

El CRM no permite cambiar la cuenta vinculada. Si el equipo escribió mal el correo y otra cuenta verificada con ese correo llegó a vincular la reserva, se corrige a mano con psql y `DATABASE_MIGRATION_URL`, primero en una rama de desarrollo y en `production` solo con autorización explícita. El `user_id` (`user_…`) y el correo primario de una cuenta se copian del panel de Clerk (Users → la cuenta), de la instancia que corresponde a esa rama de Neon.

- **Desvincular** (la persona correcta aún no tiene cuenta, o la vinculará ella misma). Hay que corregir también el correo: si sigue siendo el de la cuenta equivocada, esa cuenta volvería a vincular la reserva en su siguiente visita a `/mis-carreras`.

  ```sql
  BEGIN;
  UPDATE bookings
     SET runner_user_id = NULL, participant_email = lower('<correo correcto>'), updated_at = now()
   WHERE id = '<booking_id>' AND runner_user_id = '<user_id vinculado por error>'
  RETURNING id, trip_id, status, runner_user_id;
  -- Revisar la salida: 1 fila → COMMIT;  0 filas (no existe o ya no tiene esa cuenta) → ROLLBACK;
  ```

  La persona correcta queda vinculada al cargar `/mis-carreras` con ese correo verificado.

- **Reasignar** a una cuenta concreta que ya existe con el correo verificado:

  ```sql
  BEGIN;
  UPDATE bookings
     SET runner_user_id = '<user_id nuevo>', participant_email = lower('<correo de esa cuenta>'), updated_at = now()
   WHERE id = '<booking_id>' AND runner_user_id = '<user_id actual>'
  RETURNING id, trip_id, status, runner_user_id;
  -- Revisar la salida: 1 fila → COMMIT;  0 filas → ROLLBACK;
  ```

Si el correo nuevo ya tiene otra reserva no cancelada en ese viaje, el `UPDATE` falla por `bookings_trip_email_active_uq`: revisar cuál de las dos es la buena y cancelar la otra desde el CRM. El cambio se aplica en la siguiente petición: la cuenta anterior deja de ver la reserva, porque la autorización se lee de la base en cada carga. No se tocan tablas de `neon_auth` ni filas de `profiles` o `staff_*`.

## Automatización (outbox y n8n)

El outbox del PR #8 ([`automation-outbox.md`](docs/specs/automation-outbox.md)) se retiró al integrar este trabajo: el sistema usa un único outbox (`outbox_events`) y la API `/api/integrations/n8n/*` descritos en [«Automatizaciones con n8n»](#automatizaciones-con-n8n).

## Perfiles, patrocinadores y directorio de usuarios (PR #22)

La integración conserva **Clerk como único proveedor de identidad**, los roles
`super_admin` y `organizer`, las ofertas y el panel administrativo actuales. Las
referencias a Neon Auth y a las migraciones `0005_short_spiral` y
`0006_flat_mariko_yashida` en las specs históricas del PR describen su base antigua;
para esta integración prevalece [el informe del PR #22](docs/integrations/pr-22-accounts.md).

### Perfil propio del runner

Desde `/cuenta`, una sesión de Clerk puede entrar a **Mi perfil** (`/cuenta/perfil`).
Sin sesión se vuelve a `/cuenta`; un correo primario sin verificar no puede leer ni
guardar el perfil. Cada guardado obtiene el `userId` y el correo desde la sesión,
valida los campos en el servidor y exige de nuevo el consentimiento. Nunca acepta
un identificador de otra cuenta desde el formulario. Un perfil no concede permisos
de CRM ni crea asignaciones de equipo.

Los datos de documento, contacto de emergencia y salud son opcionales y sensibles.
Se muestran únicamente al titular en esta entrega. Los errores no incluyen valores
del perfil ni mensajes originales de la base; el directorio administrativo solo
lee las columnas mínimas de presentación. La solicitud de supresión de un perfil
debe tramitarse mediante un procedimiento autorizado y no cambia automáticamente
las reservas o asignaciones que tengan obligaciones de conservación propias.

### Marcas y usuarios

`/crm/admin/patrocinadores` permite a admin y super admin crear y editar marcas.
Los slugs son inmutables y las marcas no se eliminan. El rol `sponsor` no concede
acceso al CRM: `requireSponsor()` exige además una asignación activa a una marca.
Los formularios actuales del equipo mantienen sus límites: super admin gestiona
comercial, organizador y admin; admin solo comercial. La invitación y revocación
de patrocinadores desde esos formularios pertenece a una entrega posterior.

`/crm/admin/usuarios` reúne equipo, patrocinadores y runners, con búsqueda y filtros
por los cinco roles reales o por la condición derivada de runner. Esta última no
es un rol de autorización. La ficha conserva las comprobaciones actuales de
gestión de roles, y la lista está limitada a 200 resultados con aviso de truncado.
El portal de eventos de patrocinadores, su promoción pública y las fichas completas
de corredores permanecen en las fases futuras de sus specs; este PR integra las
fases de perfiles 1–2, patrocinadores 1–2 y directorio de usuarios 1.

### Migración incremental de la integración

`drizzle/0010_runner_profiles_sponsors.sql` se generó contra el snapshot `0009`,
conservando **sin cambios** las migraciones y snapshots `0000`–`0009`. Crea los
enums y `runner_profiles`, la tabla `sponsors`, añade `sponsor` al enum de roles y
las columnas, índices y restricciones de marca/revisión. Conserva el organizador
de cada viaje y todos los objetos de leads, campañas, ofertas y reservas actuales.

Antes de usar este código, revisar el SQL y probarlo en una rama de desarrollo con
`0000`–`0009` aplicadas. Aplicar `0010` una sola vez, mediante una operación manual
autorizada; ningún build, arranque, setup o workflow la ejecuta. Los CHECK de rol
usan `role::text`, por lo que no consumen el nuevo literal de enum como valor
tipado antes de su commit. Verificar después las tablas y restricciones, la
aceptación de invitaciones y que los objetos de `neon_auth` permanezcan intactos.

Si una base ya recibió las migraciones antiguas de la rama del PR #22, detenerse y
reconciliar su esquema real antes de aplicar `0010`: no reaplicar objetos, editar
migraciones ya ejecutadas ni asumir que la numeración histórica sigue disponible.
La aplicación de esta migración en Neon no se ha realizado durante la integración.

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.

## Mi cuenta, recompensas y noticias

La cuenta `/cuenta/perfil` reúne el editor del perfil, las carreras propias y sus
beneficios, referidos, estrellas y canjes. `/mis-carreras` muestra el detalle de
reserva, pagos, itinerario y avisos con Clerk. Administración configura las reglas
y los premios en `/crm/recompensas`; el equipo comercial aplica descuentos desde
la reserva. Una reserva confirmada y su primer pago positivo no anulado permiten
acreditar el referido. Los reintentos no duplican movimientos.

El contenido público se administra en `/crm/contenidos`. Crear o editar guarda
un borrador; publicar lo hace visible en la portada y `/noticias`. La edición de
una noticia publicada conserva su versión pública hasta publicarla de nuevo.

Estas funciones requieren las migraciones incrementales **0011 y 0012**, después
de 0010. No se ejecutan al instalar, arrancar ni compilar; no se ha migrado Neon
con esta entrega. No se sembraron reglas, premios ni noticias reales.

Consulta [operación y pruebas](docs/OPERACION-RUNNER-NOTICIAS.md) y la
[auditoría de la ampliación](docs/audits/2026-10-29-runner-news.md) para configurar
el programa, ejecutar los controles PostgreSQL desechables y conocer los bloqueos
pendientes de autenticación, red y build del Worker.
