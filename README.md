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

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` (iniciar sesión, crear cuenta, verificar el correo y recuperar la contraseña con código), `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). El catálogo de viajes tiene su tabla `trips` (migración pendiente de aplicar) y su contrato de lectura para la landing; su gestión en `/crm/viajes` está implementada en la Fase 2 de [`trips-catalog.md`](docs/specs/trips-catalog.md) (ver [Catálogo de viajes](#catálogo-de-viajes)). Las tablas de leads (`leads`, `lead_activities`) llegan con la migración `0002` ([`crm-leads-pipeline.md`](docs/specs/crm-leads-pipeline.md)), y la captura del formulario web y el outbox para n8n (`outbox_events`), con la migración `0004` ([`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)); ambas están pendientes de aplicar (ver [Leads (CRM comercial)](#leads-crm-comercial)). Las organizaciones de colaboradores siguen pendientes de su spec.

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

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. Hay seis migraciones y todas se aplican a mano (las pendientes, en el orden `0001` → `0002` → `0003` → `0004` → `0005`): `drizzle/0000_tough_thor.sql` crea las tablas de staff (ya aplicada en `production`; ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)), `drizzle/0001_young_korvac.sql` crea la tabla de viajes (pendiente; ver [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes)), `drizzle/0002_tough_warpath.sql` crea las tablas de leads (pendiente, después de `0001`; ver [Migración de la tabla de leads](#migración-de-la-tabla-de-leads)), `drizzle/0003_talented_skin.sql` crea las tablas de reservas (pendiente, después de `0002`; ver [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas)), `drizzle/0004_fluffy_prodigy.sql` prepara la captura y el outbox (pendiente, después de `0003` y **en dos bloques**; ver [Migración de captura y outbox](#migración-de-captura-y-outbox)) y `drizzle/0005_dark_jasper_sitwell.sql` añade el origen de los leads, el seguimiento con baja y el vínculo reserva ↔ lead (pendiente, después de `0004` y **en dos bloques**; ver [Migración de origen, seguimiento y reservas (`0005`)](#migración-de-origen-seguimiento-y-reservas-0005)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. Los ajustes de Neon Auth están en [Ajustes de Neon Auth](#ajustes-de-neon-auth).
2. El usuario confirmó el trusted origin exacto `https://carreras-viajeras.mentec.dev` en Neon Auth.
3. `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` se cargan en Cloudflare como **Secret** (nunca como texto). `APP_ORIGIN` no es secreto y vive en `vars` de `wrangler.jsonc`: cada despliegue automático ejecuta `wrangler deploy`, que borra las variables de texto creadas en el panel y no declaradas ahí. Por eso `APP_ORIGIN` aparece en el panel como variable de texto: no borrarla ni duplicarla como Secret; se cambia en `wrangler.jsonc`. Nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. El CRM exige correo verificado y una asignación de staff activa por ID de usuario, con denegación por defecto (ver [Acceso al CRM](#acceso-al-crm)); Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

Cada lead y su evento se confirman juntos en Neon: el alta manual del CRM ya escribe el evento `lead.created` en el outbox (`outbox_events`, migración `0004`). n8n local los recoge con reintentos mediante una API privada (ver [Automatizaciones con n8n](#automatizaciones-con-n8n)); el formulario web conectado llega en las Fases 3 y 4 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md). No hay integración con la API de WhatsApp.

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
- `PublicTrip` solo tiene campos públicos: `slug`, `title`, `city`, `country`, `raceDate`, `startDate`, `endDate`, `distances`, `summary`, `includes`, `priceUsd`, `capacity` e `imageUrl` (sin `id`, `status` ni fechas de auditoría). Las fechas son `YYYY-MM-DD`; `startDate` y `endDate` vienen las dos o ninguna.
- Formato: `formatTripDate("2027-04-25")` → "25 de abril de 2027"; `formatTripDateRange(startDate, endDate)` → "23–27 de abril de 2027" (solo si ambas no son `null`); `formatTripPrice(1990)` → "US$ 1,990" y `formatTripPrice(null)` → "Precio a consultar". Destino: "Ciudad, País". La imagen es una URL `https://` externa: `<img>` o `next/image` con `unoptimized`.
#### Qué usa hoy la landing

Especificado en [`landing-public-site.md`](docs/specs/landing-public-site.md) (Fase 4).

- **`/viajes/[slug]`** se renderiza en cada petición: `getCatalogTrip(slug)` (`modules/landing/utils/catalogTrip.ts`) llama a `getPublishedTripBySlug` y combina el resultado con el contenido fijo de `TRIPS`. Del catálogo salen el título (`h1` y `<title>`), el resumen (meta description), la fecha de la carrera, el precio "desde" (`formatTripPrice`, en "EL PAQUETE" y "AL CONTADO") y los cupos ("100 cupos definidos", o "Cupos por confirmar" si no hay). El resto (portada, ruta, destacados, cuotas, reserva, acompañante, incluidos, pendientes, enlace oficial y CTA) sigue como contenido fijo de la landing. No se muestran `imageUrl`, `includes`, `distances`, `city`, `country` ni las fechas de viaje.
- **404:** un slug sin contenido fijo en `TRIPS` devuelve `null` sin consultar Neon; si el viaje no existe, está en borrador o archivado, `getPublishedTripBySlug` devuelve `null`. En ambos casos, `notFound()` responde con estado `404`. No hay `loading.tsx`, para que el estado no quede en `200`.
- **Una consulta por petición:** `getCatalogTrip` va envuelta en `cache` de React; `generateMetadata` y la página comparten el resultado.
- **Errores de la base:** se propagan sin capturar y muestran la página de error por defecto de Next (sin el mensaje original en producción). No hay `error.tsx` en `app/viajes/`.
- **`/` no consulta Neon:** sigue estática y conserva su propia copia de fecha, precio y cupos en `TRIPS` (`modules/landing/utils/trips.ts`), igual que los literales "US$1,499" de `MobileCta`, `HeroCarousel` y del mensaje de consulta. **Si el equipo cambia la fecha, el precio o los cupos en el CRM, hay que editar a mano esa copia en la landing**; la página del viaje sí cambia en la siguiente carga, sin redesplegar.
- `npm run build` no necesita `DATABASE_URL`: `/viajes/[slug]` aparece como dinámica (`ƒ`).

#### Precondición operativa (antes de mergear)

Si `main` se despliega con Workers Builds, en cuanto se mergea la página pasa a leer `production`; si el despliegue es manual, se comprueba antes de `npm run deploy`. En la rama `production` de Neon:

1. **Migración `0001` aplicada** (ver "Migración de la tabla de viajes"). Comprobación: `SELECT to_regclass('public.trips');` no devuelve `NULL`. Si falta, la página responde **500**.
2. **Viaje creado en `/crm/viajes/nuevo` y publicado**, con:
   - slug `maraton-santiago-2027` (exacto);
   - título "Maratón de Santiago 42K 2027";
   - ciudad "Santiago" y país "Chile";
   - fecha de la carrera 2027-05-16 y distancias "42K";
   - resumen: "Corre la Maratón de Santiago 42K 2027 con Carreras Viajeras. Propuesta de viaje para runners peruanos: vuelos, alojamiento e inscripción en preventa: US$1,499 al contado o US$1,799 en cuotas.";
   - precio desde 1499 y cupos 100;
   - sin fechas de viaje ni imagen (no se muestran).

   Comprobación: `SELECT slug, status, title, race_date, price_usd, capacity FROM trips WHERE slug = 'maraton-santiago-2027';` devuelve una fila con `status = 'published'`. Si no está publicado, la página responde **404** y los enlaces de `/` ("Quiero correr Santiago", "Ver más: paquete completo", "Descubre el viaje", tarjeta de Santiago) llevan a un 404.
3. **Despublicar o archivar el viaje en el CRM da 404 al instante** en `/viajes/maraton-santiago-2027` y en esos enlaces de `/`. Es el comportamiento previsto. Un viaje despublicado vuelve a responder `200` al publicarlo de nuevo; el archivado es final.
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

`drizzle/0004_fluffy_prodigy.sql` prepara la captura automática del formulario web y el outbox para n8n ([`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)). Está pendiente de aplicar por el usuario. **Primero se prueba en una rama de desarrollo de Neon**, y después se aplica en `production`.

**Orden: `0001` → `0002` → `0003` → `0004`.** `0004` solo depende de `0002`, pero aplicarlas en orden evita confusiones. Hoy ninguna de las cuatro está aplicada en Neon, así que en cada rama hay que aplicar, en este orden:

1. `0001` (viajes), siguiendo [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes);
2. `0002` (leads), siguiendo [Migración de la tabla de leads](#migración-de-la-tabla-de-leads);
3. `0003` (reservas), siguiendo [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas);
4. `0004` (esta sección), **en dos bloques**.

No volver a aplicar `0000` (ya está en `production`) ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace `0004`** (todo en `public`):

- crea los enums `outbox_event_type` y `outbox_status`, y la tabla `outbox_events` (seis CHECK, la clave foránea hacia `leads` y el índice `outbox_events_ready_idx`);
- añade el tipo de actividad `automation` (`ALTER TYPE … ADD VALUE 'automation'`);
- en `leads`: el responsable (`owner_user_id`) y el autor (`created_by`) pasan a ser opcionales (los leads del formulario web nacen sin ellos), y añade `idempotency_key`, `submission_hash`, el índice único `leads_idempotency_key_uq` y los CHECK `leads_created_by_chk` y `leads_submission_chk`;
- en `lead_activities`: el autor (`actor_user_id`) pasa a ser opcional, añade `source_event_id` (clave foránea hacia `outbox_events` e índice único `lead_activities_source_event_uq`), los CHECK `lead_activities_actor_chk` y `lead_activities_event_chk`, y sustituye `lead_activities_body_chk` y `lead_activities_owner_chk`.

Revisión previa: `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0004_fluffy_prodigy.sql` no devuelve nada. Los únicos `DROP` del archivo son tres `DROP NOT NULL` y los dos `DROP CONSTRAINT` de los CHECK sustituidos. No toca `profiles`, `staff_*`, `trips` ni las tablas de reservas de `0003`.

**Por qué en dos bloques:** PostgreSQL no deja usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos usan `'automation'`. Si se pega el archivo entero en una sola transacción, falla con `unsafe use of new value "automation"` y no se guarda nada (se puede repetir bien después).

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0002` ya está aplicada en esa rama: `SELECT to_regclass('public.leads');` no debe devolver `NULL`. Comprobar también que `0004` **no** está aplicada: `SELECT to_regclass('public.outbox_events');` debe devolver `NULL`.
2. Guardar el estado de `neon_auth`: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'neon_auth' ORDER BY 1, 2;` (o `pg_dump "$DATABASE_MIGRATION_URL" --schema-only --schema=neon_auth`).
3. **Bloque 1.** Ejecutar solo esta línea, sin `BEGIN;` ni `COMMIT;`, y esperar a que termine:

   ```sql
   ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';
   ```

   Comprobar: `SELECT enum_range(NULL::lead_activity_type);` termina en `automation`.
4. **Bloque 2.** Copiar el contenido de `drizzle/0004_fluffy_prodigy.sql` y **borrar la línea del paso 3** (`ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';--> statement-breakpoint`, la tercera del archivo). Pegar el resto entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Si por error se deja esa línea, la transacción falla con `enum label "automation" already exists` y no cambia nada: quitarla y repetir. Si repites todo el procedimiento y el **bloque 1** responde `already exists`, no pasa nada: el bloque 1 ya estaba aplicado; sigue directamente con el bloque 2.

   Alternativa con terminal (Linux/WSL):

   ```sh
   L="ALTER TYPE \"public\".\"lead_activity_type\" ADD VALUE 'automation';"
   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "$L"
   grep -vF "$L" drizzle/0004_fluffy_prodigy.sql | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```
5. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar: `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass, 'public.outbox_events'::regclass) AND contype IN ('p','c','f');` devuelve 35 (tres `*_pkey`, veintidós `*_chk` y diez `*_fk`), y `SELECT count(*) FROM outbox_events;` devuelve 0.

Prueba manual de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (se pueden repetir las inserciones; nada queda guardado). Con dos perfiles de staff de prueba creados en esa misma transacción:

- la base **acepta** un lead `source = 'web_form'` sin `owner_user_id` ni `created_by` (`consent_version = 'web-form-v1'`), su actividad `created` sin autor, y una actividad `owner_changed` con `owner_from` nulo y `owner_to` = uno de los perfiles;
- la base **rechaza** en `leads` y `lead_activities`: un lead `whatsapp` sin `created_by`; un `idempotency_key` sin `submission_hash`; un `idempotency_key` repetido; una actividad `note` sin autor; una actividad `automation` sin `source_event_id` o sin texto; un `owner_changed` sin `owner_to`;
- la base **rechaza** en `outbox_events`: `status = 'processing'` sin `lease_token`; `attempts = 9`; `last_error_code = 'Error de SMTP'`; un `payload` de más de 1 KiB; `status = 'succeeded'` sin `processed_at`.

### Migración de origen, seguimiento y reservas (`0005`)

`drizzle/0005_dark_jasper_sitwell.sql` prepara el recorrido del corredor ([`crm-journey-automation.md`](docs/specs/crm-journey-automation.md)): por qué canal nos conoció cada lead, la entrada por Google Forms e importación, los recordatorios y la baja ("Pidió no seguir"), y el vínculo entre una reserva y su lead. Es una sola migración para todas las fases de esa spec. Está pendiente de aplicar por el usuario. **Primero se prueba en una rama de desarrollo de Neon**; en `production` solo se aplica con autorización explícita de esa operación.

**Orden: `0001` → `0002` → `0003` → `0004` → `0005`.** `0005` necesita `0004` (usa `outbox_events` y `leads.created_by`) y `0003` (añade `bookings.lead_id`). Si alguna falta en esa rama, aplicarla antes siguiendo su sección; [Migración de captura y outbox](#migración-de-captura-y-outbox) lista el orden completo. El código del CRM a partir de esta spec lee y escribe las columnas nuevas: una versión con ese código solo funciona contra una rama que ya tenga `0005`.

No volver a aplicar `0000` (ya está en `production`) ni ninguna migración que ya esté aplicada. No hace falta GRANT: `DATABASE_URL` usa el rol owner. No hay script `migrate` ni migración automática.

**Qué hace `0005`** (todo en `public`):

- crea los enums `lead_channel` (los 14 orígenes: `event`, `partner`, `referral`, `whatsapp`, `whatsapp_status`, `instagram`, `facebook`, `tiktok`, `youtube`, `google_ads`, `luma`, `web`, `other`, `unknown`) y `contact_preference` (`whatsapp`, `email`, `call`);
- añade al final de enums existentes: `google_form` e `import` a `lead_source`; `channel_changed` y `opted_out` a `lead_activity_type`; `lead.follow_up_due` y `lead.opted_out` a `outbox_event_type` (seis `ALTER TYPE … ADD VALUE`);
- en `leads`: `channel` (`DEFAULT 'unknown' NOT NULL`), `origin_detail`, `utm_source`, `utm_medium`, `utm_campaign`, `referred_by`, `referral_permission` (`DEFAULT false NOT NULL`), `contact_preference` y `contact_opt_out_at`; los CHECK `leads_origin_detail_chk` (2–120 caracteres), `leads_utm_chk` (1–100 cada uno), `leads_referred_by_chk` (2–120), `leads_referral_permission_chk` (el permiso exige referente) y `leads_opt_out_chk` (con baja no hay próxima acción); y sustituye `leads_created_by_chk`, que ahora admite sin autor `web_form`, `google_form` e `import`;
- en `lead_activities`: `channel_from` y `channel_to`, con el CHECK `lead_activities_channel_chk` (obligatorios y distintos en `channel_changed`, nulos en cualquier otro tipo);
- en `outbox_events`: `dedupe_key`, con el CHECK `outbox_events_dedupe_key_chk` (1–120 caracteres, obligatorio en `lead.follow_up_due`) y el índice único parcial `outbox_events_dedupe_key_uq`;
- en `bookings`: `lead_id`, con la clave foránea `bookings_lead_id_leads_id_fk` (`ON DELETE restrict`) y el índice único parcial `bookings_lead_active_uq` (una reserva no cancelada por lead);
- rellena `channel` en los leads que ya existen (ver más abajo).

Revisión previa: `grep -inE 'neon_auth|create schema|drop (table|type|column|schema)' drizzle/0005_dark_jasper_sitwell.sql` no devuelve nada. El único `DROP` del archivo es el `DROP CONSTRAINT "leads_created_by_chk"`, que se vuelve a crear más abajo con la regla nueva. No toca `neon_auth`, `profiles`, `staff_*` ni `trips`.

**Relleno de `channel`.** Al añadir la columna, todos los leads existentes quedan en `unknown` (Desconocido). Justo después del `ADD COLUMN "channel"`, el archivo lleva dos `UPDATE` añadidos a mano (no los genera drizzle-kit):

```sql
UPDATE "leads" SET "channel" = 'whatsapp' WHERE "source" = 'whatsapp';
UPDATE "leads" SET "channel" = 'web' WHERE "source" = 'web_form';
```

Los `source = 'other'` se quedan en `unknown`: "Otro" describía cómo entró el registro, no cómo nos conoció la persona. El equipo puede corregir el origen después desde la edición del lead.

**Por qué en dos bloques:** PostgreSQL no deja usar en la misma transacción un valor de enum recién añadido, y los CHECK nuevos usan `'channel_changed'`, `'google_form'`, `'import'` y `'lead.follow_up_due'`. Si se pega el archivo entero en una sola transacción, falla con `unsafe use of new value "channel_changed"` y no se guarda nada (se puede repetir bien después). El corte se hace **por tipo de sentencia, no por posición**: el bloque 1 son solo las seis líneas `ALTER TYPE … ADD VALUE`; los dos `CREATE TYPE` van en el bloque 2 aunque drizzle-kit los ponga al principio del archivo (los tipos nuevos sí se pueden usar en la misma transacción que los crea).

Pasos en el SQL Editor de Neon, con la rama correcta seleccionada:

1. Comprobar que `0003` y `0004` ya están aplicadas en esa rama y que `0005` **no** lo está: `SELECT to_regclass('public.bookings'), to_regclass('public.outbox_events'), to_regtype('public.lead_channel');` devuelve `bookings`, `outbox_events` y `NULL`.
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
4. **Bloque 2.** Copiar el contenido de `drizzle/0005_dark_jasper_sitwell.sql` y **borrar las seis líneas del paso 3** (las líneas 3 a 8 del archivo, todas las que contienen `ADD VALUE`). Dejar las dos primeras (`CREATE TYPE`) y todo lo demás, incluidos el comentario y los dos `UPDATE` del relleno. Pegar el resto entre `BEGIN;` y `COMMIT;` y ejecutarlo. Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar. Si por error queda alguna línea `ADD VALUE`, la transacción falla con `enum label "…" already exists` y no cambia nada: quitarla y repetir. Si el bloque 2 responde `type "contact_preference" already exists`, `0005` ya estaba aplicada en esa rama: no repetir nada.

   Alternativa con terminal (Linux/WSL):

   ```sh
   F=drizzle/0005_dark_jasper_sitwell.sql
   grep -F 'ADD VALUE' "$F" | psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f -
   grep -vF 'ADD VALUE' "$F" | psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f -
   ```

   La primera orden ejecuta el bloque 1 sin transacción (cada línea se confirma sola) y la segunda, el bloque 2 en una sola transacción (`-1`).
5. Repetir el paso 2 y comparar: la salida debe ser idéntica (`diff` vacío).
6. Comprobar:
   - el relleno: `SELECT source, channel, count(*) FROM leads GROUP BY 1, 2;` muestra `whatsapp` → `whatsapp`, `web_form` → `web` y `other` → `unknown` (y nada más; en una rama sin leads no devuelve filas);
   - las restricciones: `SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass, 'public.lead_activities'::regclass, 'public.outbox_events'::regclass) AND contype IN ('p','c','f');` devuelve 42 (tres `*_pkey`, veintinueve `*_chk` y diez `*_fk`), y `SELECT conname FROM pg_constraint WHERE conname IN ('leads_origin_detail_chk', 'leads_utm_chk', 'leads_referred_by_chk', 'leads_referral_permission_chk', 'leads_opt_out_chk', 'leads_created_by_chk', 'lead_activities_channel_chk', 'outbox_events_dedupe_key_chk', 'bookings_lead_id_leads_id_fk');` devuelve esas nueve;
   - los índices: `SELECT indexname FROM pg_indexes WHERE indexname IN ('bookings_lead_active_uq', 'outbox_events_dedupe_key_uq');` devuelve los dos.

**Probar el relleno con datos (solo en la rama de desarrollo).** Si la rama no tiene leads, después de `0004` y **antes del bloque 1** se pueden crear y confirmar tres leads de prueba, uno por `source`. Quedan guardados en esa rama, que después se puede borrar o restablecer desde Neon:

```sql
BEGIN;
INSERT INTO profiles (user_id, email) VALUES ('test-relleno', 'relleno@example.com');
INSERT INTO leads (full_name, phone, source, consent_version, created_by) VALUES
  ('Ana Prueba', '+51900000001', 'whatsapp', 'crm-manual-v1', 'test-relleno'),
  ('Beto Prueba', '+51900000002', 'other', 'crm-manual-v1', 'test-relleno');
INSERT INTO leads (full_name, phone, source, consent_version) VALUES ('Caro Prueba', '+51900000003', 'web_form', 'web-form-v1');
COMMIT;
```

Tras aplicar `0005`, la consulta del relleno del paso 6 debe devolver una fila por cada combinación: `whatsapp`/`whatsapp`, `web_form`/`web` y `other`/`unknown`.

Prueba manual de las restricciones, **solo en una rama de desarrollo de Neon** y dentro de `BEGIN;` … `ROLLBACK;` (nada queda guardado). Con un perfil de staff, un viaje y un lead `whatsapp` de prueba creados en esa misma transacción. Cada rechazo aborta la transacción: en psql, `\set ON_ERROR_ROLLBACK on` permite seguir con la siguiente prueba; en el SQL Editor, ejecutar cada caso en su propio `BEGIN;` … `ROLLBACK;`.

- la base **acepta**: un lead `source = 'google_form'` y otro `source = 'import'` sin `created_by`; una actividad `channel_changed` de `unknown` a `instagram` con autor y sin texto; una actividad `opted_out` con autor y sin texto; un evento `lead.follow_up_due` con `dedupe_key`; y, para el mismo lead, una reserva cancelada (`status = 'cancelled'`) más otra no cancelada;
- la base **rechaza** en `leads`: un lead `whatsapp` sin `created_by` (`leads_created_by_chk`); `channel = 'foo'` (`invalid input value for enum lead_channel`); un `origin_detail` o un `referred_by` de 1 o de 121 caracteres (`repeat('a', 121)`); `referral_permission = true` sin `referred_by`; `contact_opt_out_at` con `next_action_date`; un `utm_campaign` de 101 caracteres;
- la base **rechaza** en `lead_activities`: un `channel_changed` sin `channel_to`, o con el mismo origen y destino (`event` → `event`); un `channel_from` en una actividad `note`; un `opted_out` o un `channel_changed` sin autor (`lead_activities_actor_chk`) o con texto (`lead_activities_body_chk`);
- la base **rechaza** en `outbox_events` y `bookings`: un `lead.follow_up_due` sin `dedupe_key`; un segundo evento con el mismo `dedupe_key` (`outbox_events_dedupe_key_uq`); una segunda reserva no cancelada con el mismo `lead_id` (`bookings_lead_active_uq`); una reserva con un `lead_id` inexistente (`bookings_lead_id_leads_id_fk`).

### Activar la protección antispam (Turnstile)

Turnstile es el control antispam gratuito de Cloudflare: muestra una casilla de verificación en el formulario de `/contacto` y el servidor comprueba que la ha resuelto una persona. Esta guía no necesita programar. **Nunca escribas en este README, en un chat ni en un correo los valores reales de las claves.**

1. Entra en el panel de Cloudflare (dash.cloudflare.com) con la cuenta del dominio `mentec.dev` y abre el menú **Turnstile** → **Add widget**.
2. Rellena: nombre "Carreras Viajeras – formulario de contacto"; hostname `carreras-viajeras.mentec.dev`; modo **Managed**; sin *pre-clearance*. Guarda.
3. Cloudflare muestra dos claves: la **Site Key** (pública) y la **Secret Key** (privada). Cópialas a un lugar seguro, como tu gestor de contraseñas. No compartas nunca la Secret Key.
4. **En tu computadora:**
   - abre `.env.local` (la copia de `.env.example`) y pega `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<tu Site Key>` y `TURNSTILE_SECRET_KEY=<tu Secret Key>`;
   - abre `.dev.vars` (la copia de `.dev.vars.example`) y pega solo `TURNSTILE_SECRET_KEY=<tu Secret Key>`.

   Para probar en local sin el widget real, usa las **claves de prueba** que publica Cloudflare: Site Key `1x00000000000000000000AA` y Secret Key `1x0000000000000000000000000000000AA` (siempre aprueban). Solo funcionan con `npm run dev`: fuera de desarrollo el servidor las rechaza. Al revés, tu widget real solo funciona en `carreras-viajeras.mentec.dev`, así que con `npm run dev` usa siempre las de prueba. En `.dev.vars` (que usa `npm run preview`, en modo producción) no pongas claves de prueba.
5. **En Cloudflare (producción):** Workers & Pages → `carreras-viajeras` → **Settings** → **Variables and Secrets** → **Add** → tipo **Secret**, nombre `TURNSTILE_SECRET_KEY`, valor tu Secret Key → guardar. Si prefieres la terminal: `npx wrangler secret put TURNSTILE_SECRET_KEY` y pega el valor cuando lo pida.
6. **Variable de build:** en el mismo Worker, **Settings** → **Build** → *Variables and secrets* → añade `NEXT_PUBLIC_TURNSTILE_SITE_KEY` con tu Site Key. Es pública y se incrusta al compilar. Si despliegas desde tu computadora con `npm run deploy`, se toma de `.env.local`: **antes de desplegar, comprueba que ahí está tu Site Key real y no la de prueba**; si no, el formulario rechazará todos los envíos.
7. **Comprobar:** tras el siguiente despliegue (solo cuando lo autorices), abre `/contacto`. Debe verse la casilla de verificación de Cloudflare y, al enviar una consulta de prueba, el mensaje "¡Listo! Recibimos tu consulta…". Si aparece "No pudimos verificar el envío", revisa que el hostname del widget sea `carreras-viajeras.mentec.dev` y que las dos claves sean las correctas. (El formulario conectado llega en la Fase 4 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md); hasta entonces solo se cargan las claves.)
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

Si n8n está apagado no se pierde nada: los eventos esperan en Neon y se recogen cuando vuelve a encenderse. La API solo responde en la web desplegada (`https://carreras-viajeras.mentec.dev`, cuando autorices el despliegue) o en tu computadora con `npm run dev` (`http://localhost:3000`), y necesita la migración `0004` aplicada (y la `0005` para el alta desde Google Forms y la importación, apartados 10 y 11, y para los recordatorios y el aviso de baja, apartados 12 y 13).

#### 1. Credenciales (solo dentro de n8n)

En n8n → **Credentials** → **Add credential**:

1. **Header Auth** (para hablar con la web): nombre `Authorization`, valor `Bearer <tu N8N_API_TOKEN>` (la palabra `Bearer`, un espacio y el mismo valor que guardaste como Secret, ver [Secretos de integraciones](#secretos-de-integraciones)).
2. **SMTP** (para enviarte los correos): los datos del servidor de correo de tu cuenta.
3. **Google Gemini** (para redactar los borradores): la API key que creas en Google AI Studio.
4. **Google Sheets** (solo para el workflow "Alta desde Google Forms", apartado 10): la cuenta de Google que puede leer la hoja de respuestas del formulario.

Estas credenciales viven **solo en n8n**. Nunca se copian al repositorio, a `.env.local`, a `.dev.vars` ni al Worker. La API key de Gemini nunca llega a la web.

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

Con `npm run dev`, `.env.local` apuntando a una **rama de desarrollo** de Neon con `0004` aplicada y `N8N_API_TOKEN` cargado:

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
- Alta por Google Forms (necesita `0005` aplicada en esa rama). Usa un teléfono de prueba que no esté en el CRM:

  ```sh
  curl -s -X POST -H "Authorization: Bearer $N8N_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"source":"google_form","externalId":"prueba:2","consentVersion":"google-form-v1","consentedAt":"2026-09-14T08:12:00-05:00","fullName":"Prueba Forms","phone":"+51 900 000 001","tripSlug":"maraton-santiago-2027","channel":"instagram"}' \
    http://localhost:3000/api/integrations/n8n/leads
  ```

  La primera vez responde `201 { "status": "created", … }` y en el CRM aparece "Sin asignar", vía "Google Forms", etapa "Nuevo"; repetida, `200 { "status": "duplicate", … }`; con otro `fullName` y el mismo `externalId`, `409`; con otro `externalId` y el mismo teléfono, `200 { "status": "existing", … }` con el id del primero; con `"tripSlug":"no-existe"` (y otro teléfono y `externalId`), `422`.

#### 9. Regla WAF opcional contra abusos

En el plan Free de Cloudflare, sin tocar código: panel de Cloudflare → el dominio `mentec.dev` → **Security** → **WAF** → **Rate limiting rules** → crear una regla para las peticiones `POST` a la ruta `/contacto` que bloquee una IP cuando supere unas pocas peticiones cada 10 segundos. Es una defensa adicional a Turnstile, que protegerá el formulario cuando se conecte (Fase 4 de [`crm-leads-capture.md`](docs/specs/crm-leads-capture.md)).

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

**Prueba previa (obligatoria):** con `npm run dev`, `.env.local` apuntando a una **rama de desarrollo** de Neon con `0005` aplicada y un CSV de **3 filas**, cambia en los dos nodos HTTP la dirección por `http://localhost:3000/api/integrations/n8n/leads`. Comprueba en el CRM que aparecen los 3 leads "Sin asignar" con vía "Importación" y que no recibes ningún correo de "nuevo lead". Vuelve a ejecutar el workflow: el resumen debe decir `duplicate: 3` (o `existing`) y no se crea nada.

**La importación real la lanzas tú** contra la web desplegada (`https://carreras-viajeras.mentec.dev`), cuando autorices el despliegue y con la `0005` aplicada en producción. Repetirla por error no duplica personas, siempre que las filas se envíen una a una y en secuencia, como hace el paso 4: dos peticiones simultáneas con el mismo teléfono y distinto `externalId` pueden crear dos leads.

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

**Prueba manual (rama de desarrollo de Neon, `0005` aplicada, `npm run dev`):** en el CRM deja cuatro leads de prueba: uno en "Contactado" con la próxima acción de **ayer**; otro con "Pidió no seguir"; otro en "Reservado" con la próxima acción vencida; y otro con la próxima acción para **mañana**. Luego:

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

> **Numeración.** Esta migración ya está en `main` con su nombre definitivo, `drizzle/0003_talented_skin.sql`. La de captura y outbox del PR #12 se regeneró como `0004` (ver [Migración de captura y outbox](#migración-de-captura-y-outbox)), y cualquier otro PR abierto con una `0003` propia debe regenerarla igual sobre `main`. Una migración ya aplicada nunca se edita.

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

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
