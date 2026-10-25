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

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` (iniciar sesión, crear cuenta, verificar el correo y recuperar la contraseña con código), `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). El catálogo de viajes tiene su tabla `trips` (migración pendiente de aplicar) y su contrato de lectura para la landing; su gestión en `/crm/viajes` está implementada en la Fase 2 de [`trips-catalog.md`](docs/specs/trips-catalog.md) (ver [Catálogo de viajes](#catálogo-de-viajes)). Aún no hay tablas de leads, organizaciones de colaboradores ni captura durable de leads: requieren sus specs.

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

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. Hay siete migraciones y todas se aplican a mano: `drizzle/0000_tough_thor.sql` crea las tablas de staff (ya aplicada en `production`; ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)), `drizzle/0001_young_korvac.sql` crea la tabla de viajes (pendiente; ver [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes)), `drizzle/0002_tough_warpath.sql` crea las tablas de leads (pendiente, después de `0001`; ver [Migración de la tabla de leads](#migración-de-la-tabla-de-leads)), `drizzle/0003_talented_skin.sql` crea las tablas de reservas (pendiente, después de `0002` y solo cuando su rama esté en `main`; ver [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas)), `drizzle/0004_sloppy_bushwacker.sql` añade a `trips` los campos de la landing por carrera (pendiente, después de `0001` y **antes** de desplegar el código que la usa; ver [Migración de los campos de carrera](#migración-de-los-campos-de-carrera)), `drizzle/0005_short_spiral.sql` crea la tabla de perfiles de runners (pendiente, después de `0004`; ver [Migración de la tabla de perfiles](#migración-de-la-tabla-de-perfiles)) y `drizzle/0006_flat_mariko_yashida.sql` añade los patrocinadores (pendiente, después de `0005` y antes de desplegar su código; ver [Migración de patrocinadores](#migración-de-patrocinadores)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

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

- El equipo crea y mantiene los viajes desde **`/crm/viajes`** (crear, editar, publicar, despublicar y archivar). La Fase 2 implementa el listado, `/crm/viajes/nuevo` y `/crm/viajes/<id>`; requieren la migración `0001` aplicada en el entorno que se utilice.
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

### Migración de los campos de carrera

Especificada en [`landing-race-pages.md`](docs/specs/landing-race-pages.md) (Fase 1). Añade a `trips` siete campos opcionales que el CRM muestra y guarda: web oficial, precio total en cuotas, reserva, precio de acompañante, condiciones de pago, qué no incluye y detalles por confirmar.

Pendiente de aplicar por el usuario en `production` (y en la rama de Neon de pruebas que se use). **Orden: después de `0001` (viajes) y antes de desplegar el código de la Fase 1.** El código lee y escribe estas columnas en todas las consultas de `trips`: si se despliega sin la migración, `/viajes/*` y `/crm/viajes` fallan por columnas inexistentes. Es aditiva: los viajes existentes quedan con `NULL` y `excludes = '{}'`; no cambia ninguna otra tabla (leads y reservas, que referencian `trips.id`, no se tocan). **No volver a aplicar `drizzle/0000_tough_thor.sql`** ni ninguna migración ya aplicada.

1. Revisar `drizzle/0004_sloppy_bushwacker.sql`: solo contiene `ALTER TABLE "trips" ADD COLUMN` para `official_url` (`text`), `installments_price_usd`, `deposit_usd` y `companion_price_usd` (`integer`), `payment_terms` y `notes` (`text`) y `excludes` (`text[] DEFAULT '{}' NOT NULL`), y `ADD CONSTRAINT … CHECK` para `trips_official_url_chk` (`https://`), `trips_installments_price_usd_chk`, `trips_deposit_usd_chk`, `trips_companion_price_usd_chk` (nulo o `>= 0`) y `trips_excludes_chk` (hasta 20 elementos). No hay cambios en otras tablas: `grep -inE 'neon_auth|drop|create' drizzle/0004_sloppy_bushwacker.sql` no devuelve nada y `grep -vc '^ALTER TABLE "trips" ' drizzle/0004_sloppy_bushwacker.sql` devuelve `0` (las doce sentencias empiezan por `ALTER TABLE "trips"`).
2. Comprobar que `0001` está aplicada en esa rama: `SELECT to_regclass('public.trips');` no devuelve `NULL`. Si falta, aplicarla antes siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0004` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0004_sloppy_bushwacker.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar la tabla: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.trips'::regclass ORDER BY 1;` lista `trips_pkey` y doce `trips_*_chk` (los siete de `0001` y los cinco nuevos), y `SELECT count(*) FROM trips WHERE excludes <> '{}' OR official_url IS NOT NULL;` devuelve 0.
7. Solo después, desplegar el código de la Fase 1.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

Prueba manual opcional de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`: la base debe rechazar un `official_url` que no empieza por `https://`, un `installments_price_usd`, `deposit_usd` o `companion_price_usd` negativo y un `excludes` con 21 elementos.

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
- `PublicTrip` solo tiene campos públicos: `slug`, `title`, `city`, `country`, `raceDate`, `startDate`, `endDate`, `distances`, `summary`, `includes`, `priceUsd`, `capacity` e `imageUrl`, más los de la migración `0004`: `officialUrl`, `installmentsPriceUsd`, `depositUsd`, `companionPriceUsd`, `paymentTerms`, `excludes` y `notes` (sin `id`, `status` ni fechas de auditoría). Las fechas son `YYYY-MM-DD`; `startDate` y `endDate` vienen las dos o ninguna.
- Campos de la migración `0004`, todos opcionales: `officialUrl` es la web oficial de la carrera (URL `https://` externa o `null`); `installmentsPriceUsd` (precio total en cuotas), `depositUsd` (reserva) y `companionPriceUsd` (precio de acompañante) son enteros en dólares o `null`, y se formatean con `formatTripPrice`; `paymentTerms` (condiciones de pago) y `notes` (detalles por confirmar) son texto de hasta 1000 caracteres con saltos de línea, o `null`; `excludes` (qué no incluye) es una lista de hasta 20 elementos, `[]` si está vacía, como `includes`.
- Formato: `formatTripDate("2027-04-25")` → "25 de abril de 2027"; `formatTripDateRange(startDate, endDate)` → "23–27 de abril de 2027" (solo si ambas no son `null`); `formatTripPrice(1990)` → "US$ 1,990" y `formatTripPrice(null)` → "Precio a consultar". Destino: "Ciudad, País". La imagen es una URL `https://` externa: `<img>` o `next/image` con `unoptimized`.
#### Qué usa hoy la landing

Especificado en [`landing-race-pages.md`](docs/specs/landing-race-pages.md) (Fase 2), que sustituye en `/viajes/[slug]` lo descrito en [`landing-public-site.md`](docs/specs/landing-public-site.md) (Fase 4).

- **Una landing por carrera publicada:** cada viaje publicado en `/crm/viajes` tiene su página en `/viajes/<slug>`, sin tocar código ni redesplegar. Para difundir una carrera nueva se comparte esa URL (no hay listado `/viajes` ni enlaces desde `/` a carreras distintas de Santiago).
- **Todo sale del catálogo:** `getCatalogTrip(slug)` (`modules/landing/utils/catalogTrip.ts`) llama a `getPublishedTripBySlug` y convierte el `PublicTrip` en la vista que pinta la plantilla (fechas, precios y cupos formateados; `paymentTerms` y `notes` divididos en un párrafo por línea no vacía). No lee `TRIPS`.
- **Plantilla única y minimalista** (`modules/landing/components/TripDetail.tsx`, Server Component): una columna centrada con cabecera ("Ciudad, País · distancias", título, resumen e imagen si hay `imageUrl`), datos clave (carrera, viaje o "Fechas por confirmar", distancias, cupos o "Cupos por confirmar", web oficial si hay), precio "Desde" (`formatTripPrice`, "Precio a consultar" si falta) con las líneas de cuotas, reserva y acompañante solo si tienen valor, y las condiciones de pago; después "Qué incluye", "No incluye" y "Detalles por confirmar", cada uno solo si tiene datos. Ningún bloque aparece vacío.
- **Consulta por WhatsApp:** el botón "Consultar por WhatsApp" abre `https://wa.me/51938127170?text=…` en una pestaña nueva con el mensaje de `buildTripInquiryMessage` (`modules/landing/utils/inquiry.ts`): título, fecha de la carrera y lugar, **sin precio** (así no queda desfasado si el equipo lo cambia). La página no enlaza a `/contacto`, cuyos destinos siguen fijos (`DESTINATION_IDS`).
- **Metadatos:** `<title>` es el título del viaje, la meta description es el resumen y `og:image` es `imageUrl` solo si existe.
- **404:** si el slug no es válido, el viaje no existe o está en borrador o archivado, `getPublishedTripBySlug` devuelve `null` y `notFound()` responde con estado `404`. Un slug mal formado no consulta Neon; uno bien formado pero inexistente sí. No hay `loading.tsx`, para que el estado no quede en `200`.
- **Una consulta por petición:** `getCatalogTrip` va envuelta en `cache` de React; `generateMetadata` y la página comparten el resultado.
- **Errores de la base:** se propagan sin capturar y muestran la página de error por defecto de Next (sin el mensaje original en producción). No hay `error.tsx` en `app/viajes/`.
- **`/` no consulta Neon:** sigue estática y `TRIPS` (`modules/landing/utils/trips.ts`) solo la alimenta a ella, con su propia copia de fecha, precio y cupos de Santiago, igual que los literales "US$1,499" de `MobileCta`, `HeroCarousel` y del mensaje de `/contacto`. **Si el equipo cambia la fecha, el precio o los cupos de Santiago en el CRM, hay que editar a mano esa copia de la portada**; la página del viaje sí cambia en la siguiente carga, sin redesplegar.
- `npm run build` no necesita `DATABASE_URL`: `/viajes/[slug]` aparece como dinámica (`ƒ`).

#### Precondición operativa (antes de mergear)

Si `main` se despliega con Workers Builds, en cuanto se mergea la página pasa a leer `production`; si el despliegue es manual, se comprueba antes de `npm run deploy`. En la rama `production` de Neon:

1. **Migración `0001` aplicada** (ver "Migración de la tabla de viajes"). Comprobación: `SELECT to_regclass('public.trips');` no devuelve `NULL`. Si falta, la página responde **500**.
2. **Migración `0004` aplicada** (ver [Migración de los campos de carrera](#migración-de-los-campos-de-carrera)). Comprobación: `SELECT column_name FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'official_url';` devuelve una fila. Si falta, la página responde **500**.
3. **Viaje creado en `/crm/viajes/nuevo` y publicado**, con:
   - slug `maraton-santiago-2027` (exacto);
   - título "Maratón de Santiago 42K 2027";
   - ciudad "Santiago" y país "Chile";
   - fecha de la carrera 2027-05-16 y distancias "42K";
   - resumen: "Corre la Maratón de Santiago 42K 2027 con Carreras Viajeras. Propuesta de viaje para runners peruanos: vuelos, alojamiento e inscripción en preventa: US$1,499 al contado o US$1,799 en cuotas.";
   - precio desde 1499 y cupos 100;
   - para no perder información respecto a la página anterior (precondición F2 de `landing-race-pages.md`): web oficial `https://maratondesantiago.cl/`, precio total en cuotas 1799, reserva 300, acompañante 1300, imagen con una URL `https://` (p. ej. `https://carreras-viajeras.mentec.dev/images/cover-santiago.webp`), y los textos de qué incluye, qué no incluye, condiciones de pago y detalles por confirmar que antes estaban fijos en el código (`included`, `excluded`, `prices.paymentNote` y `pendingDetails`; se recuperan con `git show dfa5d8a:modules/landing/utils/trips.ts`).

   Comprobación: `SELECT slug, status, title, race_date, price_usd, capacity FROM trips WHERE slug = 'maraton-santiago-2027';` devuelve una fila con `status = 'published'`. Si no está publicado, la página responde **404** y los enlaces de `/` ("Quiero correr Santiago", "Ver más: paquete completo", "Descubre el viaje", tarjeta de Santiago) llevan a un 404.
4. **Despublicar o archivar el viaje en el CRM da 404 al instante** en `/viajes/maraton-santiago-2027` y en esos enlaces de `/`. Es el comportamiento previsto. Un viaje despublicado vuelve a responder `200` al publicarlo de nuevo; el archivado es final.
4. `DATABASE_URL` ya es un Secret del Worker (lo usa el CRM); no hay variables nuevas.

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

## Reservas y portal del runner

Especificado en [`runner-portal.md`](docs/specs/runner-portal.md). El equipo registra en el CRM las reservas, los pagos confirmados, el itinerario y los avisos de cada viaje, y el runner los consulta en una página privada de solo lectura, `/mis-carreras`. La Fase 1 añade las tablas, el permiso y las lecturas del runner; las páginas del CRM y `/mis-carreras` llegan en las fases siguientes.

- **Una reserva por participante.** Cada persona que viaja, incluido un acompañante, tiene su propia reserva con su propio correo (`participant_email`, en minúsculas). El titular no ve las reservas de sus acompañantes. El paquete se distingue con `package_label` (p. ej. "Paquete acompañante").
- **Vínculo por correo verificado, autorización por `user_id`.** En cada carga de `/mis-carreras` con el correo verificado, una sola sentencia vincula las reservas sin cuenta de ese correo (`runner_user_id IS NULL`) al `user.id` de la sesión. Desde entonces el runner solo lee filas con `runner_user_id = <su user.id>`; el correo no vuelve a usarse. Con el correo sin verificar no se vincula ni se lee nada. El correo de la reserva solo se edita mientras no está vinculada. Vincular no crea filas en `profiles` ni `staff_*`.
- **Permiso `bookings.manage`:** lo tienen `admin` y `commercial`. Una cuenta sin rol de staff (runner) no tiene ningún permiso del CRM.
- **Importes en USD enteros**, sin centavos ni columna de moneda: `bookings.total_usd` (`>= 0`) y `booking_payments.amount_usd` (`> 0`) son `integer`, como `trips.price_usd`, y se muestran con `formatTripPrice` ("US$ 1,499"). El saldo (`total_usd` menos los pagos no anulados) se calcula al leer; no se guarda.
- **Sin borrado físico:** las reservas se cancelan y los pagos se anulan (`voided_at` y `voided_by`).
- **El runner nunca recibe** `participant_email`, `internal_note`, `created_by`, `recorded_by`, pagos anulados ni hitos con `runner_visible = false`. Los hitos de nivel viaje (`booking_id` nulo) y los avisos los ven todos los participantes del viaje.

### Migración de las tablas de reservas

> **Numeración.** Los PR abiertos #12 y #8 también generan una migración `0003`. Si alguno se integra antes, esta se regenera con `npm run db:generate` sobre lo que haya en `main` y pasa a ser la `0004` (con otro nombre). **No aplicar nada hasta que la rama `feat/runner-portal` esté en `main`**, y usar entonces el nombre de archivo definitivo en los pasos siguientes. Una migración ya aplicada nunca se edita.

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

El CRM no permite cambiar la cuenta vinculada. Si el equipo escribió mal el correo y otra cuenta verificada con ese correo llegó a vincular la reserva, se corrige a mano con psql y `DATABASE_MIGRATION_URL`, primero en una rama de desarrollo y en `production` solo con autorización explícita. El `user_id` y el correo de una cuenta se copian de la consola de Neon (Auth → Users).

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

## Perfiles de runners

Especificado en [`accounts-runner-profiles.md`](docs/specs/accounts-runner-profiles.md). Hoy el equipo pide por WhatsApp, en cada viaje, el nombre completo, el documento, la talla de polo o un contacto de emergencia. El perfil del runner guarda esos datos una sola vez: el propio runner lo completa y edita en `/cuenta/perfil`, y `admin` y `commercial` lo consultan, en solo lectura, en `/crm/corredores`. La Fase 1 añade la tabla, los schemas y el service del propio perfil; la página del runner y las del CRM llegan en las fases siguientes.

- **Una fila por cuenta de Neon Auth.** La clave es el `user.id` de la sesión (`runner_profiles.user_id`), sin FK hacia `neon_auth`. Guardar el perfil no crea filas en `profiles` ni `staff_*` y no concede roles; una cuenta de staff también puede tener su perfil de runner.
- **Qué guarda:** datos personales (nombre completo y teléfono/WhatsApp en E.164, obligatorios; país, ciudad y fecha de nacimiento), documento de viaje (tipo, número y vencimiento), datos de carrera (talla de polo, distancia preferida, mejor marca y club) y contacto de emergencia (nombre y teléfono, y alergias o condiciones médicas opcionales). Solo nombre y teléfono son obligatorios, para que el runner pueda guardar por partes; el perfil "completo" se calcula al leer, no se guarda.
- **Grupos coherentes:** tipo y número de documento van juntos y el vencimiento exige documento; nombre y teléfono de emergencia van juntos. Lo validan zod y los CHECK de la base, aunque alguien escriba por SQL.
- **Correo:** `email` es una copia del correo verificado de la sesión, en minúsculas, que se refresca en cada guardado. Solo sirve para que el CRM identifique y busque al runner (no puede leer `neon_auth`); nunca autoriza ni vincula reservas. El vínculo reserva ↔ cuenta sigue siendo el de `/mis-carreras` (ver [Reservas y portal del runner](#reservas-y-portal-del-runner)).
- **Consentimiento versionado:** cada guardado exige marcar la casilla de consentimiento y registra `consent_version` (constante del servidor) y `consented_at = now()`. Cambiar el texto obliga a cambiar la versión.
- **Solo el propio perfil.** El runner escribe con una única sentencia `INSERT … ON CONFLICT (user_id) DO UPDATE` con el `user_id` y el correo de su sesión; el formulario nunca los envía y cualquier campo extra se descarta.

### Datos sensibles

El documento (tipo, número y vencimiento) y las alergias o condiciones médicas son datos sensibles; por extensión, también la fecha de nacimiento y el contacto de emergencia.

- Nunca aparecen en logs, mensajes de error ni respuestas de error. Un error de Postgres (p. ej. un CHECK) incluye en su detalle los valores de la fila: no se registra ni se propaga; el log solo lleva un texto fijo.
- La respuesta del guardado no devuelve los valores del formulario: lo escrito se conserva en el navegador porque el formulario no se reinicia.
- En el CRM, la lista no los selecciona en SQL (solo nombre, correo, ciudad y país, si tiene perfil, reservas activas y fecha de actualización). La ficha de cada corredor los muestra solo en Server Components, bajo el rótulo "Dato sensible".
- No hay cifrado de columnas en la aplicación: Neon cifra en reposo y el acceso lo limita el RBAC del CRM. Riesgo aceptado para el MVP.
- No hay exportación ni copia a otros sistemas. Las consultas manuales con psql se hacen con `DATABASE_MIGRATION_URL` y no se pegan resultados con datos personales en chats ni issues.

### Migración de la tabla de perfiles

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **Orden: después de `0001` (viajes), `0002` (leads), `0003` (reservas) y `0004` (campos de carrera).** La tabla no tiene claves foráneas, pero las migraciones se aplican en el orden del journal y el CRM de corredores lee también `bookings`. **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff. Una migración ya aplicada nunca se edita.

1. Revisar `drizzle/0005_short_spiral.sql`: solo crea, en `public`, los enums `travel_document_type` (`passport`, `national_id`, `foreign_id`), `shirt_size` (`xs` … `xxl`) y `race_distance` (`5k`, `10k`, `21k`, `42k`, `ultra`) y la tabla `runner_profiles` (PK `user_id` y quince CHECK). No tiene claves foráneas, índices adicionales ni cambios en tablas existentes. `grep -inE 'neon_auth|drop|create schema|references|alter table' drizzle/0005_short_spiral.sql` no devuelve nada.
2. Comprobar que las anteriores están aplicadas en esa rama: `SELECT to_regclass('public.trips'), to_regclass('public.leads'), to_regclass('public.bookings');` no devuelve `NULL`. Si falta alguna, aplicarla antes siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes), [Migración de la tabla de leads](#migración-de-la-tabla-de-leads) y [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0005` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0005_short_spiral.sql`.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar la tabla: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.runner_profiles'::regclass ORDER BY 1;` lista 16 restricciones (`runner_profiles_pkey` y quince `runner_profiles_*_chk`), y `SELECT count(*) FROM runner_profiles;` devuelve 0.

No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

### Pruebas manuales de la Fase 1

**Solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;`. Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite seguir con la siguiente prueba; en el SQL Editor, ejecutar cada caso en su propio `BEGIN;` … `ROLLBACK;`. Los `user_id` son de prueba (no hace falta una cuenta real: no hay FK).

Sí se inserta una fila mínima:

```sql
BEGIN;
INSERT INTO runner_profiles (user_id, email, full_name, phone, consent_version)
VALUES ('test-runner-1', 'ana@example.com', 'Ana Pérez', '+51938127170', 'runner-profile-2026-10')
RETURNING user_id, consented_at, created_at, updated_at;
ROLLBACK;
```

Y también una completa, con `document_type = 'passport'`, `document_number = 'AB123456'`, `document_expires_on = '2030-01-31'`, `birth_date = '1990-04-12'`, `shirt_size = 'm'`, `preferred_distance = '42k'` y contacto de emergencia (`'Luis Pérez'`, `'+51987654321'`).

Partiendo de la fila mínima, la base debe rechazar:

- un `email` con mayúsculas (`'Ana@example.com'`);
- un `phone` sin `+` (`'51938127170'`) o con letras (`'+51abc12345'`);
- un `full_name` de 1 carácter (`'A'`);
- un `document_type` sin `document_number`, y un `document_number` sin `document_type`;
- un `document_number` con minúsculas (`'ab123456'`) o con espacios (`'AB 123456'`);
- un `document_expires_on` sin documento;
- un `emergency_contact_name` sin `emergency_contact_phone`, y al revés;
- `birth_date = '1899-12-31'`;
- `medical_notes = repeat('a', 501)`;
- una talla fuera del enum (`shirt_size = 'xxxl'`: `invalid input value for enum shirt_size`);
- una segunda fila con el mismo `user_id` (`runner_profiles_pkey`).

### Supresión a petición del titular

No hay botón de borrado: el runner rectifica sus datos editando su perfil, y si pide por WhatsApp o correo que se borren, el usuario lo hace a mano con psql y `DATABASE_MIGRATION_URL`, primero en una rama de desarrollo y en `production` solo con autorización explícita. Antes, confirmar que la petición viene del titular (desde el correo de la cuenta o el teléfono del perfil). El `user_id` se copia de la consola de Neon (Auth → Users) o se busca por el correo del perfil:

```sql
SELECT user_id, email, full_name, updated_at FROM runner_profiles WHERE email = lower('<correo del titular>');

BEGIN;
DELETE FROM runner_profiles WHERE user_id = '<user_id>'
RETURNING user_id, email;
-- Revisar la salida: 1 fila → COMMIT;  0 filas (no existe o el id no es el correcto) → ROLLBACK;
```

Borra solo el perfil: la cuenta de Neon Auth, sus reservas y sus pagos no cambian (no se tocan tablas de `neon_auth` ni filas de `profiles`, `staff_*` o `bookings`). Si tiene reservas vinculadas, seguirá apareciendo en el CRM de corredores con el nombre y el correo de su reserva más reciente y "Sin perfil". Si vuelve a guardar su perfil en `/cuenta/perfil`, se crea una fila nueva con un consentimiento nuevo.

## Patrocinadores

Especificado en [`sponsors-portal.md`](docs/specs/sponsors-portal.md). Las marcas patrocinadoras publican y promocionan sus eventos dentro del mismo catálogo de viajes, siempre con revisión del equipo: el admin da de alta cada marca e invita a sus personas, la persona patrocinadora crea borradores en `/patrocinador` y los envía a revisión, y `commercial` y `admin` los publican, los devuelven con un motivo o los destacan en la portada. La Fase 1 añade las tablas, el rol, los permisos y las guardas; el CRM de marcas, el portal y la promoción pública llegan en las fases siguientes.

- **Rol `sponsor`, solo por invitación.** Es un valor nuevo del enum `staff_role`. El admin invita con `role = 'sponsor'` y la marca (`sponsor_id`), y la aceptación copia la marca a la asignación en la misma sentencia. Registrarse sin invitación no concede nada.
- **Sin acceso al CRM.** `sponsor` solo tiene el permiso `sponsor.portal`: `/crm/**` le muestra el aviso sin acceso y `GET /api/crm/me` responde 403. Gestionar marcas (`sponsors.manage`) es solo de `admin`.
- **Una marca por cuenta.** Una asignación `sponsor` siempre lleva `sponsor_id` y una de staff nunca la lleva; lo mismo en las invitaciones (CHECK). Los eventos pertenecen a la marca (`trips.sponsor_id`), no a la persona.
- **Revisión sin tocar `trip_status`.** `review_status` (`in_review`, `changes_requested`) y `review_note` (el último motivo de devolución) solo existen en borradores de patrocinador; `featured` solo en viajes publicados. Las lecturas públicas siguen filtrando `status = 'published'`.

### Migración de patrocinadores

Pendiente de aplicar por el usuario en `production` (y en cualquier rama de Neon que la necesite). **Orden: después de `0005` (perfiles de runners), la última documentada en [Migración de la tabla de perfiles](#migración-de-la-tabla-de-perfiles).** Modifica `staff_assignments`, `staff_invitations` (de `0000`) y `trips` (de `0001`), y las migraciones se aplican en el orden del journal. **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production` y crearía de nuevo las tablas de staff. Una migración ya aplicada nunca se edita; si otra rama integra antes en `main` una migración `0006`, esta se regenera con `npm run db:generate` y se usa el nombre de archivo definitivo en los pasos siguientes.

> **Aplicar antes de desplegar.** El código de la Fase 1 ya usa las columnas nuevas; si se despliega antes de migrar:
>
> - **Todo el equipo pierde el CRM, incluido el admin.** La sentencia de aceptación de invitaciones (`acceptInvitationStatement` en `lib/auth/access.service.ts`) hace `RETURNING … sponsor_id` e `INSERT … sponsor_id`, y PostgreSQL la analiza aunque no haya invitaciones pendientes. Se ejecuta en cada petición de una cuenta con correo verificado, así que falla siempre (`column ... does not exist`), `loadRoles` falla cerrado y `/crm/**` muestra el aviso sin acceso, `GET /api/crm/me` responde 403 y todas las acciones del CRM se rechazan.
> - Aunque se llegara al CRM, `/crm/viajes`, `/crm/viajes/[id]` y las páginas de reservas que listan viajes fallan, porque sus `select()` de `trips` leen todas las columnas; y `createTrip` y `createInvitation` fallan porque Drizzle incluye las columnas nuevas (con `default`) en el `INSERT`.
>
> El catálogo público no se ve afectado: `/` es estática y `/viajes/<slug>` solo lee las columnas públicas. Al revés no hay problema: el código desplegado hoy no lee las columnas nuevas, que tienen valores por defecto (`featured = false`, el resto `NULL`), así que la migración se puede aplicar antes de mergear.

1. Revisar `drizzle/0006_flat_mariko_yashida.sql`: solo afecta a objetos de `public`.
   - Crea el enum `trip_review_status` (`in_review`, `changes_requested`) y añade el valor `sponsor` a `staff_role`.
   - Crea la tabla `sponsors` (cinco CHECK, FK `created_by` → `profiles` e índice único `sponsors_slug_uq`).
   - Añade `sponsor_id` a `staff_assignments` y `staff_invitations` (FK → `sponsors`, `ON DELETE restrict`, y un CHECK `*_sponsor_chk` en cada tabla).
   - Añade a `trips` las columnas `sponsor_id` (FK e índice `trips_sponsor_idx`), `featured`, `review_status` y `review_note`, con tres CHECK (`trips_featured_chk`, `trips_review_chk` y `trips_review_note_chk`).

   No cambia columnas existentes ni inserta filas. Los CHECK que comparan el rol usan `role::text = 'sponsor'`, sin el literal del enum, para que todo el archivo se ejecute en una transacción. `grep -inE 'neon_auth|drop|create schema|alter column|rename' drizzle/0006_flat_mariko_yashida.sql` no devuelve nada.
2. Comprobar los prerrequisitos en esa rama:
   - `SELECT to_regclass('public.trips'), to_regclass('public.staff_invitations'), to_regclass('public.runner_profiles');` no devuelve `NULL`. Si falta alguna, aplicar antes las migraciones pendientes en orden, siguiendo sus secciones.
   - `SELECT enum_range(NULL::staff_role);` devuelve `{commercial,admin}`. Si ya incluye `sponsor` (por un intento anterior con la alternativa del paso 4), omitir la línea `ALTER TYPE … ADD VALUE` al aplicar.
   - `SELECT to_regclass('public.sponsors');` devuelve `NULL` (la migración no está aplicada).
3. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
4. En el SQL Editor de Neon, con la rama correcta seleccionada, pegar el contenido de `0006` entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Alternativa: `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0006_flat_mariko_yashida.sql`.

   **Si Neon responde `unsafe use of new value`.** PostgreSQL permite `ALTER TYPE … ADD VALUE` dentro de una transacción, pero el valor nuevo no se puede usar hasta el `COMMIT`. La migración no debería usarlo, pero si aun así aparece el error: `ROLLBACK;`, ejecutar sola (fuera de `BEGIN;`) la línea `ALTER TYPE "public"."staff_role" ADD VALUE 'sponsor';` y después el resto del archivo, sin esa línea, entre `BEGIN;` y `COMMIT;`. Con psql:

   ```sh
   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "ALTER TYPE \"public\".\"staff_role\" ADD VALUE 'sponsor';"
   grep -v "ADD VALUE 'sponsor'" drizzle/0006_flat_mariko_yashida.sql | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```

   **El valor `sponsor` no se puede eliminar:** PostgreSQL no tiene `DROP VALUE` para enums. Dentro de la transacción normal, un `ROLLBACK` lo deshace junto con el resto; pero una vez confirmado (con la alternativa o tras el `COMMIT`), queda en `staff_role` para siempre. Si la migración se abandona después de ese paso, el valor queda sin uso y es inofensivo: ninguna fila lo usa y el código desplegado hoy no lo asigna.
5. Repetir el paso 3 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Verificar:
   - `SELECT enum_range(NULL::staff_role);` devuelve `{commercial,admin,sponsor}` y `SELECT enum_range(NULL::trip_review_status);` devuelve `{in_review,changes_requested}`.
   - `SELECT conname FROM pg_constraint WHERE conrelid = 'public.sponsors'::regclass ORDER BY 1;` lista 7 restricciones (`sponsors_pkey`, cinco `sponsors_*_chk` y `sponsors_created_by_profiles_user_id_fk`).
   - `SELECT conrelid::regclass, conname FROM pg_constraint WHERE conrelid IN ('public.staff_assignments'::regclass, 'public.staff_invitations'::regclass, 'public.trips'::regclass) AND (conname LIKE '%sponsor%' OR conname IN ('trips_featured_chk', 'trips_review_chk', 'trips_review_note_chk')) ORDER BY 1, 2;` lista 8 restricciones (`staff_assignments_sponsor_chk`, `staff_assignments_sponsor_id_sponsors_id_fk`, las dos equivalentes de `staff_invitations`, `trips_sponsor_id_sponsors_id_fk` y los tres CHECK de `trips`).
   - `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('sponsors_slug_uq', 'trips_sponsor_idx');` devuelve las dos filas.
   - `SELECT count(*) FROM sponsors;` devuelve 0 y `SELECT count(*) FROM trips WHERE sponsor_id IS NOT NULL OR featured OR review_status IS NOT NULL;` devuelve 0.

Las filas existentes de `staff_*` y `trips` siguen siendo válidas: PostgreSQL comprueba cada `ADD CONSTRAINT … CHECK` contra las filas que ya hay, así que si la migración termina sin error, todas cumplen los CHECK nuevos (staff sin `sponsor_id`, viajes sin revisión ni destacado). No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

### Pruebas manuales de la Fase 1

**Solo en una rama de desarrollo de Neon**, con la migración ya confirmada (el valor `sponsor` no se puede usar en la misma transacción que lo añade), y dentro de `BEGIN;` … `ROLLBACK;`. Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite seguir con la siguiente prueba; en el SQL Editor, ejecutar cada caso en su propio `BEGIN;` … `ROLLBACK;`, repitiendo los datos de partida. Los `user_id` son de prueba (no hace falta una cuenta real: `profiles` no tiene FK hacia `neon_auth`).

Datos de partida, que también deben insertarse sin error:

```sql
BEGIN;
INSERT INTO profiles (user_id, email) VALUES
  ('test-admin-1', 'admin@example.com'),
  ('test-sponsor-1', 'marca@example.com'),
  ('test-commercial-1', 'ventas@example.com');
INSERT INTO sponsors (slug, name, created_by)
VALUES ('marca-prueba', 'Marca de prueba', 'test-admin-1')
RETURNING id, created_at, updated_at;
INSERT INTO staff_invitations (email, role, invited_by, sponsor_id)
VALUES ('marca@example.com', 'sponsor', 'test-admin-1', (SELECT id FROM sponsors WHERE slug = 'marca-prueba'));
INSERT INTO staff_assignments (user_id, role, reason, sponsor_id)
VALUES ('test-sponsor-1', 'sponsor', 'prueba', (SELECT id FROM sponsors WHERE slug = 'marca-prueba'));
INSERT INTO trips (slug, title, city, country, race_date, distances, summary, sponsor_id, review_status)
VALUES ('evento-prueba', 'Evento de prueba', 'Lima', 'Perú', '2027-05-16', ARRAY['42k'], 'Evento de prueba de la marca.',
        (SELECT id FROM sponsors WHERE slug = 'marca-prueba'), 'in_review')
RETURNING id, status, featured, review_status;
-- … casos de prueba …
ROLLBACK;
```

También se insertan: una marca completa (`slug = 'otra-marca'`, `logo_url` y `website_url` con `https://`, `description` de 10 a 500 caracteres); una invitación `commercial` sin `sponsor_id` (`'ventas@example.com'`) y una asignación `commercial` sin `sponsor_id` (`'test-commercial-1'`); un borrador de la marca con `review_status = 'changes_requested'` y `review_note = 'Falta la imagen del evento.'`; y un viaje del equipo (`sponsor_id` nulo) con `status = 'published'` y `featured = true`.

La base debe rechazar (en los viajes, cada caso con un `slug` propio, y en invitaciones y asignaciones, con un correo o `user_id` que no choque con los de partida):

- una invitación o una asignación `sponsor` sin `sponsor_id`, y una `commercial` con `sponsor_id` (`staff_invitations_sponsor_chk` y `staff_assignments_sponsor_chk`);
- un `sponsors.slug` con mayúsculas (`'Marca-Prueba'`) o duplicado (`'marca-prueba'`, `sponsors_slug_uq`);
- un `sponsors.logo_url` o `website_url` con `http://` (`'http://example.com/logo.png'`);
- un `sponsors.name` de 1 carácter (`'A'`);
- un viaje con `review_status = 'in_review'` y `sponsor_id` nulo, y uno de la marca con `review_status = 'in_review'` y `status = 'published'` (`trips_review_chk`);
- un borrador de la marca con `review_status = 'changes_requested'` sin `review_note`, y uno con `review_note` y `review_status` nulo o `'in_review'` (`trips_review_note_chk`);
- un viaje con `featured = true` y `status = 'draft'` (`trips_featured_chk`).

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
