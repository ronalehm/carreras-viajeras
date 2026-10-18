# Carreras Viajeras

MVP para hackathon: preparación técnica sobre la plantilla web actual (`Hello world`), sin construir todavía landing, catálogo, pagos, comunidad ni CRM completo. La landing anterior está en otra carpeta y no forma parte de este repositorio.

> **Precedencia:** la fase 1 aprobada de [`platform-neon-foundation.md`](docs/specs/platform-neon-foundation.md) define esta preparación. Los borradores anteriores que indican D1, Hyperdrive provisional o Access como sustituto de RBAC están obsoletos y no son instrucciones ejecutables. No seguir sus pasos de infraestructura. El acceso del equipo al CRM se rige por [`accounts-roles-permissions.md`](docs/specs/accounts-roles-permissions.md) y [`accounts-auth-ui.md`](docs/specs/accounts-auth-ui.md).

## Stack y alcance

| Área | Decisión |
|---|---|
| Aplicación | Next.js + React + TypeScript strict |
| Interfaz | Tailwind CSS + shadcn/ui sobre Base UI |
| Ejecución prevista | Cloudflare Workers Free mediante OpenNext |
| Datos | Neon PostgreSQL Free + Drizzle con driver HTTPS `neon-http` |
| Identidad | Neon Auth gestionado, basado en Better Auth; un solo proveedor |
| Validación | Zod; Turnstile para futuros formularios |
| Operación posterior | Outbox persistente en Neon y n8n Community local |
| Contacto inicial | WhatsApp Business App manual; API oficial posterior |

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` (iniciar sesión, crear cuenta, verificar el correo y recuperar la contraseña con código), `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). El catálogo de viajes tiene su tabla `trips` (migración pendiente de aplicar) y su contrato de lectura para la landing; su gestión en `/crm/viajes` está implementada en la Fase 2 de [`trips-catalog.md`](docs/specs/trips-catalog.md) (ver [Catálogo de viajes](#catálogo-de-viajes)). Las tablas de leads (`leads`, `lead_activities`) llegan con la migración `0002` ([`crm-leads-pipeline.md`](docs/specs/crm-leads-pipeline.md)), y la captura del formulario web y el outbox para n8n (`outbox_events`), con la migración `0003` ([`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)); ambas están pendientes de aplicar (ver [Leads (CRM comercial)](#leads-crm-comercial)). Las organizaciones de colaboradores siguen pendientes de su spec.

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
| `APP_ORIGIN` | Origen exacto de la aplicación, sin ruta ni slash final; debe coincidir con el trusted origin de Neon Auth |
| `DATABASE_URL` | Conexión PostgreSQL con TLS de un rol de aplicación con permisos mínimos |
| `NEON_AUTH_BASE_URL` | Endpoint HTTPS de Neon Auth, no el dominio de la aplicación |
| `NEON_AUTH_COOKIE_SECRET` | Secreto aleatorio de al menos 32 caracteres, solo servidor |
| `N8N_API_TOKEN` | Opcional. Token de la API privada para n8n (al menos 32 caracteres), solo servidor. Ver [Secretos de integraciones](#secretos-de-integraciones) |
| `TURNSTILE_SECRET_KEY` | Opcional. Secret Key de Turnstile (antispam del formulario), solo servidor. Ver [Activar la protección antispam (Turnstile)](#activar-la-protección-antispam-turnstile) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Opcional. Site Key de Turnstile: es pública y se incrusta al compilar; solo en `.env.local` y en las variables de build |

Las tres variables opcionales se validan solo cuando se usan: si faltan, el CRM y el acceso siguen funcionando, y compilar no las exige.

El origen previsto de producción es `https://carreras-viajeras.mentec.dev`. Para desarrollo, usar el origen local. Neon Auth incluye localhost preconfigurado; comprobar el callback y el origen local si aparece un problema de autenticación. La configuración se valida al usarla en una petición; compilar no debe conectarse a Neon ni exigir secretos.

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

`npm run preview` compila con `NODE_ENV=production` y ejecuta el Worker localmente: exige `APP_ORIGIN=https://carreras-viajeras.mentec.dev`, no localhost. Usarlo como smoke test local de liveness; la autenticación queda pendiente de validación con el dominio previsto. Solo `npm run dev`, en modo development, admite `http://localhost:3000` o `http://localhost:8787` como `APP_ORIGIN`. `npm run cf-typegen` regenera los tipos de bindings. El Worker conserva `ASSETS` y `WORKER_SELF_REFERENCE`; `workers.dev` y las URLs de preview remotas permanecen desactivadas. El dominio personalizado se activará solo después de autorizar el despliegue.

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. Hay cuatro migraciones y todas se aplican a mano: `drizzle/0000_tough_thor.sql` crea las tablas de staff (ya aplicada en `production`; ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)), `drizzle/0001_young_korvac.sql` crea la tabla de viajes (pendiente; ver [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes)), `drizzle/0002_tough_warpath.sql` crea las tablas de leads (pendiente, después de `0001`; ver [Migración de la tabla de leads](#migración-de-la-tabla-de-leads)) y `drizzle/0003_chunky_sinister_six.sql` prepara la captura y el outbox (pendiente, después de `0002` y **en dos bloques**; ver [Migración de captura y outbox](#migración-de-captura-y-outbox)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. Los ajustes de Neon Auth están en [Ajustes de Neon Auth](#ajustes-de-neon-auth).
2. El usuario confirmó el trusted origin exacto `https://carreras-viajeras.mentec.dev` en Neon Auth.
3. `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` se cargan en Cloudflare como **Secret** (nunca como texto). `APP_ORIGIN` no es secreto y vive en `vars` de `wrangler.jsonc`: cada despliegue automático ejecuta `wrangler deploy`, que borra las variables de texto creadas en el panel y no declaradas ahí. Por eso `APP_ORIGIN` aparece en el panel como variable de texto: no borrarla ni duplicarla como Secret; se cambia en `wrangler.jsonc`. Nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. El CRM exige correo verificado y una asignación de staff activa por ID de usuario, con denegación por defecto (ver [Acceso al CRM](#acceso-al-crm)); Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

Cada lead y su evento se confirman juntos en Neon: el alta manual del CRM ya escribe el evento `lead.created` en el outbox (`outbox_events`, migración `0003`). n8n local los procesará con reintentos mediante una API privada que llega en la Fase 2 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md); el formulario web conectado llega en sus Fases 3 y 4. No hay integración con la API de WhatsApp.

## Acceso al CRM

### Modelo de acceso

- **Runners:** visitantes anónimos, sin cuenta ni perfil.
- **Staff** (`commercial`, `admin`): entra solo por invitación. El admin invita un correo con un rol y comparte a mano el enlace `<APP_ORIGIN>/crm/acceso`; la invitación caduca a los 7 días. Se invita desde `/crm/admin/usuarios` (solo admin), que muestra el enlace para copiarlo.
- **Aceptación automática:** la primera petición autenticada con el correo **verificado** que coincide (sin distinguir mayúsculas) con una invitación pendiente y vigente la acepta en una sola sentencia: crea el perfil y la asignación. Después, la autorización usa solo el `user.id` estable de Neon Auth, no el correo.
- **Denegación por defecto:** sin sesión → 401; correo sin verificar, cuenta sin rol, invitación caducada o revocada, o error de Neon Auth o de la base → 403. Los roles se leen de la base en cada petición, así que una revocación se aplica en la siguiente. Body, query, cookies propias y `user.role` de Neon Auth nunca conceden permisos.
- **Último admin:** el CRM no permite revocar el rol `admin` del último admin activo. El primer admin se asigna solo con el script de bootstrap, nunca por ser el primer registro.

`GET /api/crm/me` responde `{ userId, staffRoles }` (200) o `{ error }` (401/403), siempre con `Cache-Control: no-store`. `/crm` muestra el correo y los roles, o la pantalla "sin acceso".

### Ajustes de Neon Auth

Requisitos previos manuales: los configura y verifica el usuario en la consola de Neon (Auth). La UI de `/crm/acceso` depende de ellos.

- **Dominio de confianza** `https://carreras-viajeras.mentec.dev` (configurado). Localhost viene preaprobado para desarrollo.
- **Sign-up with Email ON** (y Sign-in ON). Los invitados necesitan crear su cuenta. **Riesgo aceptado:** cualquiera puede registrarse en Neon Auth, pero sin invitación no obtiene permisos (403) ni filas en `public`.
- **Verificación del correo al registrarse ON, con código (OTP).** El SMTP compartido de Neon envía códigos de 6 dígitos; los enlaces requerirían SMTP propio. Sin correo verificado nadie pasa las guardas. La cookie de sesión cachea `emailVerified` hasta 5 minutos.
- **Recuperación de la contraseña por código.** `/crm/acceso` → "¿Olvidaste tu contraseña?" usa `POST /api/auth/email-otp/request-password-reset` y `/api/auth/email-otp/reset-password`; ambos se probaron en producción. La recuperación por enlace no se usa (requiere SMTP propio).

La solicitud de recuperación responde siempre "Si existe una cuenta con ese correo, te enviamos un código." para no revelar qué cuentas existen.

### Checklist manual en producción

Lo ejecuta el usuario, con su autorización (los agentes no tienen acceso a Neon desde su entorno), en `https://carreras-viajeras.mentec.dev/crm/acceso`:

- [ ] Login de admin (tras el bootstrap) → `/crm` muestra "Admin".
- [ ] Una cuenta sin rol ve la pantalla sin acceso.
- [ ] "Cerrar sesión" lleva a `/crm/acceso`.
- [ ] El admin invita a un correo desde `/crm/admin/usuarios` → la persona crea su cuenta → recibe el código → verifica → `/crm` muestra "Comercial".
- [ ] Recuperar la contraseña con código y volver a iniciar sesión.
- [ ] Comprobar que llega el código de 6 dígitos y que la sesión persiste al recargar.

### Migración de las tablas de staff

Ya aplicada por el usuario en `production`. Para otra rama:

1. Revisar `drizzle/0000_tough_thor.sql`: solo objetos en `public`; `grep -i neon_auth drizzle/*.sql` no devuelve nada.
2. Comprobar el tipo del id de Neon Auth: `SELECT data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'id';`.
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido del archivo entre `BEGIN;` y `COMMIT;` y ejecutarlo. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0000_tough_thor.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).

No hay script `migrate` ni migración automática. Si `DATABASE_URL` usa un rol distinto del owner, necesita `SELECT, INSERT` en `profiles` y `SELECT, INSERT, UPDATE` en `staff_assignments` y `staff_invitations`; esos GRANT quedan fuera de esta spec.

### Scripts manuales

Se ejecutan con psql y `DATABASE_MIGRATION_URL`, cada uno en una transacción y con `ON_ERROR_STOP`. Primero en una rama de desarrollo; en `production`, solo con autorización explícita. Las instrucciones completas están en la cabecera de cada archivo.

- **Bootstrap del primer admin** ([`scripts/sql/bootstrap-admin.sql`](scripts/sql/bootstrap-admin.sql)). La cuenta debe existir en Neon Auth con el correo verificado; el `user_id` exacto y el correo se copian de la consola (Auth → Users). Crea o reutiliza el perfil e inserta una asignación `admin` con `granted_by = NULL`. Falla si `reason` está vacío o si ya es admin activo. El usuario ya se dio de alta como admin en `production`.

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v user_id='<user_id>' -v email='<correo>' \
    -v reason='<operador>: <motivo>' -f scripts/sql/bootstrap-admin.sql
  ```

- **Revocación de emergencia** ([`scripts/sql/revoke-staff-role.sql`](scripts/sql/revoke-staff-role.sql)). Marca `revoked_at` en la asignación activa y devuelve la fila; 0 filas significa que no había nada que revocar. **No protege al último admin:** en condiciones normales, revocar desde el CRM.

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v user_id='<user_id>' -v role='<commercial|admin>' \
    -f scripts/sql/revoke-staff-role.sql
  ```

### Checklist manual

En la máquina del usuario, con su autorización, en una rama Neon de desarrollo y nunca en `production`:

- [ ] Se aplica la migración y el volcado del schema `neon_auth` es idéntico antes y después.
- [ ] Bootstrap del primer admin → `GET /api/crm/me` responde 200.
- [ ] Invitar → crear la cuenta y verificar con código → 200 `commercial`. Requiere la UI de alta de `accounts-auth-ui.md` (Fase 2) o la API de Neon Auth. Confirma también que la aceptación crea perfil y asignación en la misma sentencia.
- [ ] Revocar el rol → 403 en la siguiente petición.
- [ ] Dos revocaciones concurrentes del penúltimo y del último admin → solo una tiene éxito.

## Catálogo de viajes

Especificado en [`trips-catalog.md`](docs/specs/trips-catalog.md). Cada viaje tiene un `id` (UUID inmutable, para vincular leads en el futuro), un `slug` público (`/viajes/<slug>`) y un estado: `draft` (borrador), `published` (publicado) o `archived` (archivado, final). Solo la landing lee los publicados; los viajes no se borran, se archivan.

### Cómo se cargan los datos

- El equipo crea y mantiene los viajes desde **`/crm/viajes`** (crear, editar, publicar, despublicar y archivar). La Fase 2 implementa el listado, `/crm/viajes/nuevo` y `/crm/viajes/<id>`; requieren la migración `0001` aplicada en el entorno que se utilice.
- Lo pueden hacer `commercial` y `admin` (permiso `trips.manage`). Una cuenta sin rol de staff, incluidas las futuras cuentas de runner de la landing, no tiene acceso.
- Un viaje nace en borrador y no aparece en la web hasta que se publica. El `slug` solo se puede cambiar mientras está en borrador.
- No hay seeds ni `INSERT` manuales: "Maratón de Santiago 2027" se creará desde el CRM con el slug exacto `maraton-santiago-2027` y 100 cupos, copiando los datos que hoy tiene la landing.
- **Precio:** un único precio "desde", siempre en dólares estadounidenses, entero y sin decimales (`priceUsd`). No hay campo de moneda. Se muestra como `US$ 1,990` (`US$ 12,500`, `US$ 0`); sin precio, "Precio a consultar".

### Migración de la tabla de viajes

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff. En `production` solo se aplica `0001`.

1. Revisar `drizzle/0001_young_korvac.sql`: solo crea, en `public`, el enum `trip_status`, la tabla `trips` con sus siete CHECK y el índice único `trips_slug_uq`. No hay columna de moneda ni cambios en `profiles`, `staff_assignments` o `staff_invitations`. `grep -inE 'neon_auth|drop|create schema' drizzle/0001_young_korvac.sql` no devuelve nada.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. En el SQL Editor de Neon, con la rama `production` seleccionada, pegar el contenido del archivo entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0001_young_korvac.sql`.
4. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
5. Comprobar la tabla: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.trips'::regclass ORDER BY 1;` lista `trips_pkey` y los siete `trips_*_chk`, y `SELECT count(*) FROM trips;` devuelve 0.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

Prueba manual opcional de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`: la base debe rechazar un slug con mayúsculas o espacios, un slug duplicado, `distances` vacío, `price_usd` negativo, `capacity = 0`, un `image_url` que no empieza por `https://`, y un `start_date` sin `end_date` o con `race_date` fuera del rango del viaje.

### Lectura pública para la landing

La landing (otra rama) lee el catálogo con funciones de servidor, sin API HTTP (no existe `GET /api/trips`):

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
- `PublicTrip` solo tiene campos públicos: `slug`, `title`, `city`, `country`, `raceDate`, `startDate`, `endDate`, `distances`, `summary`, `includes`, `priceUsd`, `capacity` e `imageUrl` (sin `id`, `status` ni fechas de auditoría). Las fechas son `YYYY-MM-DD`; `startDate` y `endDate` vienen las dos o ninguna.
- Formato: `formatTripDate("2027-04-25")` → "25 de abril de 2027"; `formatTripDateRange(startDate, endDate)` → "23–27 de abril de 2027" (solo si ambas no son `null`); `formatTripPrice(1990)` → "US$ 1,990" y `formatTripPrice(null)` → "Precio a consultar". Destino: "Ciudad, País". La imagen es una URL `https://` externa: `<img>` o `next/image` con `unoptimized`.
- Llamar a `getPublishedTripBySlug` en `generateMetadata` y en la página son dos consultas; la landing puede envolverla con `cache` de React en su propio módulo. Los errores de la base se propagan al `error.tsx` de la página.
- **Cuándo cambiar al catálogo:** hasta que esta Fase 1 esté en `main`, la migración aplicada y "Maratón de Santiago 2027" creado y publicado desde `/crm/viajes` (Fase 2), la landing mantiene su contenido fijo; si cambiara antes, `/viajes/maraton-santiago-2027` devolvería 404. Mientras tanto, sus tests pueden simular `@/modules/trips`. Lo que no está en `PublicTrip` (itinerario, hotel, FAQ, testimonios, WhatsApp, `/contacto`) sigue como contenido fijo.

## Leads (CRM comercial)

Especificado en [`crm-leads-pipeline.md`](docs/specs/crm-leads-pipeline.md). El equipo registra a mano las consultas que llegan por WhatsApp como leads y las mueve por el embudo: nuevo → contactado → cotizado → reservado → pagado / perdido. Lo pueden hacer `commercial` y `admin` (permiso `leads.manage`); una cuenta sin rol de staff no tiene acceso. Los leads no se borran: se archivan. Las páginas `/crm/leads` llegan en las fases siguientes de la spec; hoy solo existen las tablas, el permiso y el service.

### Migración de la tabla de leads

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **Orden: primero `0001` (viajes) y después `0002`**, porque `leads.trip_id` referencia `trips.id`. **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff.

1. Revisar `drizzle/0002_tough_warpath.sql`: solo crea, en `public`, los enums `lead_stage`, `lead_source` y `lead_activity_type`, las tablas `leads` (nueve CHECK) y `lead_activities` (tres CHECK), sus ocho claves foráneas (`ON DELETE restrict`, hacia `trips`, `profiles` y `leads`) y el índice `lead_activities_lead_created_idx`. No hay cambios en `profiles`, `staff_assignments`, `staff_invitations` ni `trips`. `grep -inE 'neon_auth|drop|create schema' drizzle/0002_tough_warpath.sql` no devuelve nada.
2. Si `0001` sigue pendiente en esa rama, aplicarla antes siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes). Comprobarlo con `SELECT to_regclass('public.trips');` (no debe devolver `NULL`).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0002` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0002_tough_warpath.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar las tablas: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass) ORDER BY 1, 2;` lista 22 restricciones (dos `*_pkey`, doce `*_chk` y ocho `*_fk`), y `SELECT count(*) FROM leads;` devuelve 0.

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

`drizzle/0003_chunky_sinister_six.sql` prepara la captura automática del formulario web y el outbox para n8n ([`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)). Está pendiente de aplicar por el usuario. **Primero se prueba en una rama de desarrollo de Neon**, y después se aplica en `production`.

**Orden obligatorio: `0001` → `0002` → `0003`.** Hoy ni `0001` ni `0002` están aplicadas en Neon, así que en cada rama hay que aplicar, en este orden:

1. `0001` (viajes), siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes);
2. `0002` (leads), siguiendo [Migración de la tabla de leads](#migración-de-la-tabla-de-leads);
3. `0003` (esta sección), **en dos bloques**.

No volver a aplicar `0000` (ya está en `production`) ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace `0003`** (todo en `public`):

- crea los enums `outbox_event_type` y `outbox_status`, y la tabla `outbox_events` (seis CHECK, la clave foránea hacia `leads` y el índice `outbox_events_ready_idx`);
- añade el tipo de actividad `automation` (`ALTER TYPE … ADD VALUE 'automation'`);
- en `leads`: el responsable (`owner_user_id`) y el autor (`created_by`) pasan a ser opcionales (los leads del formulario web nacen sin ellos), y añade `idempotency_key`, `submission_hash`, el índice único `leads_idempotency_key_uq` y los CHECK `leads_created_by_chk` y `leads_submission_chk`;
- en `lead_activities`: el autor (`actor_user_id`) pasa a ser opcional, añade `source_event_id` (clave foránea hacia `outbox_events` e índice único `lead_activities_source_event_uq`), los CHECK `lead_activities_actor_chk` y `lead_activities_event_chk`, y sustituye `lead_activities_body_chk` y `lead_activities_owner_chk`.

Revisión previa: `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0003_chunky_sinister_six.sql` no devuelve nada. Los únicos `DROP` del archivo son tres `DROP NOT NULL` y los dos `DROP CONSTRAINT` de los CHECK sustituidos. No toca `profiles`, `staff_*` ni `trips`.

**Por qué en dos bloques:** PostgreSQL no deja usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos usan `'automation'`. Si se pega el archivo entero en una sola transacción, falla con `unsafe use of new value "automation"` y no se guarda nada (se puede repetir bien después).

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0002` ya está aplicada en esa rama: `SELECT to_regclass('public.leads');` no debe devolver `NULL`. Comprobar también que `0003` **no** está aplicada: `SELECT to_regclass('public.outbox_events');` debe devolver `NULL`.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. **Bloque 1.** Ejecutar solo esta línea, sin `BEGIN;` ni `COMMIT;`, y esperar a que termine:

   ```sql
   ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';
   ```

   Comprobar: `SELECT enum_range(NULL::lead_activity_type);` termina en `automation`.
4. **Bloque 2.** Copiar el contenido de `drizzle/0003_chunky_sinister_six.sql` y **borrar la línea del paso 3** (`ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';--> statement-breakpoint`, la tercera del archivo). Pegar el resto entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Si por error se deja esa línea, la transacción falla con `enum label "automation" already exists` y no cambia nada: quitarla y repetir.

   Alternativa con terminal (Linux/WSL):

   ```sh
   L="ALTER TYPE \"public\".\"lead_activity_type\" ADD VALUE 'automation';"
   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "$L"
   grep -vF "$L" drizzle/0003_chunky_sinister_six.sql | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```
5. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar: `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass, 'public.outbox_events'::regclass);` devuelve 35 (tres `*_pkey`, veintidós `*_chk` y diez `*_fk`), y `SELECT count(*) FROM outbox_events;` devuelve 0.

Prueba manual de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (se pueden repetir las inserciones; nada queda guardado). Con dos perfiles de staff de prueba creados en esa misma transacción:

- la base **acepta** un lead `source = 'web_form'` sin `owner_user_id` ni `created_by` (`consent_version = 'web-form-v1'`), su actividad `created` sin autor, y una actividad `owner_changed` con `owner_from` nulo y `owner_to` = uno de los perfiles;
- la base **rechaza** en `leads` y `lead_activities`: un lead `whatsapp` sin `created_by`; un `idempotency_key` sin `submission_hash`; un `idempotency_key` repetido; una actividad `note` sin autor; una actividad `automation` sin `source_event_id` o sin texto; un `owner_changed` sin `owner_to`;
- la base **rechaza** en `outbox_events`: `status = 'processing'` sin `lease_token`; `attempts = 9`; `last_error_code = 'Error de SMTP'`; un `payload` de más de 1 KiB; `status = 'succeeded'` sin `processed_at`.

### Activar la protección antispam (Turnstile)

Turnstile es el control antispam gratuito de Cloudflare: muestra una casilla de verificación en el formulario de `/contacto` y el servidor comprueba que la ha resuelto una persona. Esta guía no necesita programar. **Nunca escribas en este README, en un chat ni en un correo los valores reales de las claves.**

1. Entra en el panel de Cloudflare (dash.cloudflare.com) con la cuenta del dominio `mentec.dev` y abre el menú **Turnstile** → **Add widget**.
2. Rellena: nombre "Carreras Viajeras – formulario de contacto"; hostname `carreras-viajeras.mentec.dev`; modo **Managed**; sin *pre-clearance*. Guarda.
3. Cloudflare muestra dos claves: la **Site Key** (pública) y la **Secret Key** (privada). Cópialas a un lugar seguro, como tu gestor de contraseñas. No compartas nunca la Secret Key.
4. **En tu computadora:**
   - abre `.env.local` (la copia de `.env.example`) y pega `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<tu Site Key>` y `TURNSTILE_SECRET_KEY=<tu Secret Key>`;
   - abre `.dev.vars` (la copia de `.dev.vars.example`) y pega solo `TURNSTILE_SECRET_KEY=<tu Secret Key>`.

   Para probar en local sin el widget real, usa las **claves de prueba** que publica Cloudflare: Site Key `1x00000000000000000000AA` y Secret Key `1x0000000000000000000000000000000AA` (siempre aprueban). Solo funcionan con `npm run dev`: fuera de desarrollo el servidor las rechaza.
5. **En Cloudflare (producción):** Workers & Pages → `carreras-viajeras` → **Settings** → **Variables and Secrets** → **Add** → tipo **Secret**, nombre `TURNSTILE_SECRET_KEY`, valor tu Secret Key → guardar. Si prefieres la terminal: `npx wrangler secret put TURNSTILE_SECRET_KEY` y pega el valor cuando lo pida.
6. **Variable de build:** en el mismo Worker, **Settings** → **Build** → *Variables and secrets* → añade `NEXT_PUBLIC_TURNSTILE_SITE_KEY` con tu Site Key. Es pública y se incrusta al compilar. Si despliegas desde tu computadora con `npm run deploy`, basta con que esté en `.env.local`.
7. **Comprobar:** tras el siguiente despliegue (solo cuando lo autorices), abre `/contacto`. Debe verse la casilla de verificación de Cloudflare y, al enviar una consulta de prueba, el mensaje "¡Listo! Recibimos tu consulta…". Si aparece "No pudimos verificar el envío", revisa que el hostname del widget sea `carreras-viajeras.mentec.dev` y que las dos claves sean las correctas. (El formulario conectado llega en la Fase 4 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md); hasta entonces solo se cargan las claves.)
8. **Si una clave se filtra:** en Turnstile → tu widget → **Rotate secret key**, y actualiza el Secret `TURNSTILE_SECRET_KEY` del Worker (paso 5) y tus archivos locales (paso 4).

### Secretos de integraciones

`N8N_API_TOKEN` protege la API privada que usará n8n (Fase 2 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)). No es `DATABASE_URL`: n8n nunca recibe credenciales de la base.

1. Genera un valor aleatorio de al menos 32 caracteres en tu computadora, por ejemplo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Guárdalo como **Secret** del Worker con el nombre `N8N_API_TOKEN` (igual que en el paso 5 de Turnstile, o con `npx wrangler secret put N8N_API_TOKEN`).
3. Para pruebas locales, pégalo en `.env.local` y en `.dev.vars` como `N8N_API_TOKEN=<valor>`.
4. En n8n, el mismo valor va en una credencial de cabecera (`Authorization: Bearer <valor>`); la guía de n8n llega con la Fase 2.

Si falta, la API de n8n responderá que no está configurada y el resto de la aplicación sigue funcionando. Si se filtra, genera otro valor y actualiza el Secret, tus archivos locales y la credencial de n8n.

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
