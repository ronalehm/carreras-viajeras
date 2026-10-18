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

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` (iniciar sesión, crear cuenta, verificar el correo y recuperar la contraseña con código), `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). El catálogo de viajes tiene su tabla `trips` (migración pendiente de aplicar) y su contrato de lectura para la landing; su gestión en `/crm/viajes` llega en la Fase 2 de [`trips-catalog.md`](docs/specs/trips-catalog.md) (ver [Catálogo de viajes](#catálogo-de-viajes)). Aún no hay tablas de leads, organizaciones de colaboradores ni captura durable de leads: requieren sus specs.

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

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. Hay dos migraciones y ambas se aplican a mano: `drizzle/0000_tough_thor.sql` crea las tablas de staff (ya aplicada en `production`; ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)) y `drizzle/0001_young_korvac.sql` crea la tabla de viajes (pendiente; ver [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. Los ajustes de Neon Auth están en [Ajustes de Neon Auth](#ajustes-de-neon-auth).
2. El usuario confirmó el trusted origin exacto `https://carreras-viajeras.mentec.dev` en Neon Auth.
3. `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` se cargan en Cloudflare como **Secret** (nunca como texto). `APP_ORIGIN` no es secreto y vive en `vars` de `wrangler.jsonc`: cada despliegue automático ejecuta `wrangler deploy`, que borra las variables de texto creadas en el panel y no declaradas ahí. Por eso `APP_ORIGIN` aparece en el panel como variable de texto: no borrarla ni duplicarla como Secret; se cambia en `wrangler.jsonc`. Nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. El CRM exige correo verificado y una asignación de staff activa por ID de usuario, con denegación por defecto (ver [Acceso al CRM](#acceso-al-crm)); Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

Los futuros leads y sus eventos se confirmarán juntos en Neon; n8n local los procesará con reintentos mediante API privada. No hay formulario, outbox ni integración WhatsApp API implementados todavía.

## Acceso al CRM

### Modelo de acceso

- **Runners:** pueden crear una cuenta de Neon Auth desde la landing (`/cuenta`) con el mismo flujo que el staff: registro, verificación del correo con código, login y recuperación de la contraseña. Es una cuenta sin roles de staff: no crea filas en `profiles` ni `staff_*` y en `/crm` ve la pantalla "sin acceso" (403). Todavía no hay perfil de runner, datos en la base ni recursos protegidos para runners; cada recurso futuro necesitará su propia guarda en el servidor.
- **Staff** (`commercial`, `admin`): entra solo por invitación. La invitación no controla quién crea una cuenta (el registro es público); controla los **roles**, que se aceptan en el servidor por correo verificado y quedan ligados al `user_id` estable. El admin invita un correo con un rol y comparte a mano el enlace `<APP_ORIGIN>/crm/acceso`; la invitación caduca a los 7 días. Se invita desde `/crm/admin/usuarios` (solo admin), que muestra el enlace para copiarlo.
- **Aceptación automática:** la primera petición autenticada con el correo **verificado** que coincide (sin distinguir mayúsculas) con una invitación pendiente y vigente la acepta en una sola sentencia: crea el perfil y la asignación. Después, la autorización usa solo el `user.id` estable de Neon Auth, no el correo.
- **Denegación por defecto:** sin sesión → 401; correo sin verificar, cuenta sin rol, invitación caducada o revocada, o error de Neon Auth o de la base → 403. Los roles se leen de la base en cada petición, así que una revocación se aplica en la siguiente. Body, query, cookies propias y `user.role` de Neon Auth nunca conceden permisos.
- **Último admin:** el CRM no permite revocar el rol `admin` del último admin activo. El primer admin se asigna solo con el script de bootstrap, nunca por ser el primer registro.

`GET /api/crm/me` responde `{ userId, staffRoles }` (200) o `{ error }` (401/403), siempre con `Cache-Control: no-store`. `/crm` muestra el correo y los roles, o la pantalla "sin acceso".

### Ajustes de Neon Auth

Requisitos previos manuales: los configura y verifica el usuario en la consola de Neon (Auth). La UI de `/crm/acceso` y la de `/cuenta` dependen de ellos.

- **Dominio de confianza** `https://carreras-viajeras.mentec.dev` (configurado). Localhost viene preaprobado para desarrollo.
- **Sign-up with Email ON** (y Sign-in ON). Los invitados y los runners necesitan crear su cuenta. **Riesgo aceptado:** cualquiera puede registrarse en Neon Auth, pero sin invitación no obtiene permisos (403) ni filas en `public`.
- **Verificación del correo al registrarse ON, con código (OTP).** El SMTP compartido de Neon envía códigos de 6 dígitos; los enlaces requerirían SMTP propio. Sin correo verificado nadie pasa las guardas. La cookie de sesión cachea `emailVerified` hasta 5 minutos.
- **Recuperación de la contraseña por código.** `/crm/acceso` → "¿Olvidaste tu contraseña?" usa `POST /api/auth/email-otp/request-password-reset` y `/api/auth/email-otp/reset-password`; ambos se probaron en producción. La recuperación por enlace no se usa (requiere SMTP propio).

La solicitud de recuperación responde siempre "Si existe una cuenta con ese correo, te enviamos un código." para no revelar qué cuentas existen.

### Checklist manual en producción

Lo ejecuta el usuario, con su autorización (los agentes no tienen acceso a Neon desde su entorno), en `https://carreras-viajeras.mentec.dev/crm/acceso` y, para los runners, en `https://carreras-viajeras.mentec.dev/cuenta`:

- [ ] Login de admin (tras el bootstrap) → `/crm` muestra "Admin".
- [ ] Una cuenta sin rol ve la pantalla sin acceso.
- [ ] "Cerrar sesión" lleva a `/crm/acceso`.
- [ ] El admin invita a un correo desde `/crm/admin/usuarios` → la persona crea su cuenta → recibe el código → verifica → `/crm` muestra "Comercial".
- [ ] Recuperar la contraseña con código y volver a iniciar sesión.
- [ ] Comprobar que llega el código de 6 dígitos y que la sesión persiste al recargar.
- [ ] (Runners) Un correo nuevo se registra en `/cuenta`, verifica el código y queda en `/cuenta` con sesión. Al abrir `/crm` ve la pantalla "sin acceso", `GET /api/crm/me` responde 403 y no aparecen filas nuevas en `profiles` ni `staff_assignments`.
- [ ] (Runners) "Cerrar sesión" en `/cuenta` vuelve a `/cuenta` sin sesión, y el login de admin en `/crm/acceso` sigue llevando a `/crm`.

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

- El equipo crea y mantiene los viajes desde **`/crm/viajes`** (crear, editar, publicar, despublicar y archivar). Esa página llega en la Fase 2 de la spec; hoy no existe.
- Lo pueden hacer `commercial` y `admin` (permiso `trips.manage`). Una cuenta sin rol de staff, incluidas las cuentas de runner de la landing (`/cuenta`), no tiene acceso.
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

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
