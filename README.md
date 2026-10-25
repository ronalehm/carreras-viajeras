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
| Automatización | Outbox persistente en Neon, API privada y n8n Community local |
| Contacto inicial | WhatsApp Business App manual; API oficial posterior |

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` (iniciar sesión, crear cuenta, verificar el correo y recuperar la contraseña con código), `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). El catálogo de viajes tiene su tabla `trips` (migración pendiente de aplicar) y su contrato de lectura para la landing; su gestión en `/crm/viajes` está implementada en la Fase 2 de [`trips-catalog.md`](docs/specs/trips-catalog.md) (ver [Catálogo de viajes](#catálogo-de-viajes)). Las tablas de leads (`leads`, `lead_activities`) existen con su migración pendiente de aplicar (ver [Leads](#leads-crm-comercial)). La outbox de automatización (`automation_events`), la API privada para n8n y el workflow de n8n que avisa al equipo por correo están implementados según [`automation-outbox.md`](docs/specs/automation-outbox.md) (ver [Automatización (outbox y n8n)](#automatización-outbox-y-n8n)). Aún no hay formulario de leads protegido con Turnstile (que encolará los eventos reales) ni organizaciones de colaboradores: requieren sus specs.

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
| `AUTOMATION_API_TOKEN` | Secreto aleatorio de al menos 32 caracteres, solo servidor, para la API privada de n8n. El mismo valor va en la credencial Header Auth de n8n como `Bearer <token>`. Sin él (o con menos de 32 caracteres) la API privada responde `503` y el resto de la aplicación funciona igual (ver [Automatización](#automatización-outbox-y-n8n)) |

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

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. Hay cinco migraciones y todas se aplican a mano: `drizzle/0000_tough_thor.sql` crea las tablas de staff (ya aplicada en `production`; ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)), `drizzle/0001_young_korvac.sql` crea la tabla de viajes (pendiente; ver [Migración de la tabla de viajes](#migración-de-la-tabla-de-viajes)), `drizzle/0002_tough_warpath.sql` crea las tablas de leads (pendiente, después de `0001`; ver [Migración de la tabla de leads](#migración-de-la-tabla-de-leads)), `drizzle/0003_talented_skin.sql` crea las tablas de reservas (pendiente, después de `0002` y solo cuando su rama esté en `main`; ver [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas)), y `drizzle/0004_classy_tenebrous.sql` crea la outbox de automatización (pendiente, después de `0003`; ver [Migración del outbox](#migración-del-outbox)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. Los ajustes de Neon Auth están en [Ajustes de Neon Auth](#ajustes-de-neon-auth).
2. El usuario confirmó el trusted origin exacto `https://carreras-viajeras.mentec.dev` en Neon Auth.
3. `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` y `AUTOMATION_API_TOKEN` se cargan en Cloudflare como **Secret** (nunca como texto). `APP_ORIGIN` no es secreto y vive en `vars` de `wrangler.jsonc`: cada despliegue automático ejecuta `wrangler deploy`, que borra las variables de texto creadas en el panel y no declaradas ahí. Por eso `APP_ORIGIN` aparece en el panel como variable de texto: no borrarla ni duplicarla como Secret; se cambia en `wrangler.jsonc`. Nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. El CRM exige correo verificado y una asignación de staff activa por ID de usuario, con denegación por defecto (ver [Acceso al CRM](#acceso-al-crm)); Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

La outbox en Neon, la API privada y el workflow de n8n local que la procesa con reintentos ya están implementados (ver [Automatización (outbox y n8n)](#automatización-outbox-y-n8n)); la migración `0003` sigue pendiente de aplicar. Los futuros leads de la landing y su evento se confirmarán juntos en Neon cuando exista el formulario protegido con Turnstile, que sigue pendiente, igual que la integración con la API de WhatsApp.

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

## Automatización (outbox y n8n)

Especificado en [`automation-outbox.md`](docs/specs/automation-outbox.md). Objetivo: que ningún aviso de un lead nuevo se pierda aunque n8n esté apagado, se reinicie o falle a mitad de un envío.

- **Outbox en Neon.** Cada evento es una fila de `automation_events`, guardada en la misma transacción (`db.batch([...])`) que el dato que lo origina. Hoy solo hay un tipo: **`lead.created`, versión de payload 1**, con `{ leadId, tripSlug, source: "landing_contact" }` (`tripSlug` puede ser `null`). El payload no lleva datos de contacto ni secretos, y un mismo lead no genera dos `lead.created`. Hasta que exista el formulario protegido de la landing, los eventos solo se crean con el [seed de datos ficticios](#scripts-del-outbox).
- **Entrega al menos una vez.** n8n Community, en local, reclama eventos con un **lease de 5 minutos** y un token por intento, y los confirma (`ack`) o informa del fallo (`fail`). Un fallo vuelve a `pending` con backoff exponencial con jitter (de 15–30 s tras el intento 1 a 16–32 min tras el intento 7); una lease vencida sin respuesta se reclama de nuevo. Tras **8 intentos** el evento pasa a `dead` y solo vuelve a `pending` con el [reenvío auditado](#scripts-del-outbox). Como un evento puede llegar dos veces, n8n deduplica por `eventId`.
- **n8n no se expone a Internet** ni recibe `DATABASE_URL` o `DATABASE_MIGRATION_URL`: solo hace peticiones salientes a la API privada.

### API privada

Tres rutas, solo `POST`, con `Authorization: Bearer <AUTOMATION_API_TOKEN>` (sensible a mayúsculas, comparado en tiempo constante):

| Ruta | Body | Respuesta correcta |
|---|---|---|
| `/api/automation/events/claim` | `{ "limit": 1–25 }` (por defecto 10) | `200 { events: [...] }`, cada uno con `eventId`, `type`, `payloadVersion`, `payload`, `attempt`, `occurredAt`, `leaseToken` y `leaseExpiresAt` |
| `/api/automation/events/<id>/ack` | `{ "leaseToken": "<uuid>" }` | `200 { status: "succeeded" }` (repetirlo con el mismo token también responde 200) |
| `/api/automation/events/<id>/fail` | `{ "leaseToken": "<uuid>", "errorCode": "<código>" }` (`^[a-z0-9_]{1,64}$`) | `200 { status: "pending", retryAt }` o `200 { status: "dead" }` |

Errores, siempre `{ error: "<código>" }` con `Cache-Control: no-store` y sin detalles de SQL, entrada ni entorno:

| Código | Cuándo |
|---|---|
| `503 unavailable` | `AUTOMATION_API_TOKEN` ausente o con menos de 32 caracteres (sin indicar qué falta), o error de la base |
| `401 unauthorized` | Falta la cabecera `Authorization` o el token no coincide |
| `404 not_found` | `<id>` no es un UUID |
| `413 payload_too_large` | Body JSON de más de 4 KiB |
| `400 invalid_request` | Body inválido, campos extra o `limit` fuera de 1–25 |
| `409 lease_conflict` | `ack`/`fail` con token antiguo, lease vencida o evento inexistente |

El secreto se valida solo en estas rutas y al recibir la petición: su ausencia no afecta al resto de la aplicación ni a `npm run build`. Para generarlo en tu equipo, por ejemplo, `openssl rand -base64 48`. En local va en `AUTOMATION_API_TOKEN` de `.env.local` (y de `.dev.vars` para Wrangler); en producción, como Cloudflare Secret (ver [Continuar desde Neon y Cloudflare](#continuar-desde-neon-y-cloudflare)). El mismo valor se guarda en la credencial Header Auth de n8n como `Bearer <token>`. Nunca en `wrangler.jsonc`, variables `NEXT_PUBLIC_*`, el JSON del workflow ni el repositorio.

### Aviso por correo al equipo

Por cada `lead.created` v1, n8n envía un correo (credencial SMTP de n8n) a los destinatarios configurados en el workflow (`TEAM_EMAILS`). El asunto es `Nuevo lead para <tripSlug>` (o `Nuevo lead sin viaje`), y el cuerpo, en texto, lleva el viaje, la fecha del evento y el enlace `<APP_BASE_URL>/crm/leads/<leadId>`, con la indicación de que los datos de contacto solo se ven en el CRM. **No incluye nombre, correo ni WhatsApp del interesado.** El enlace abrirá la ficha cuando exista la vista de leads del CRM. Solo se hace `ack` si el envío tuvo éxito; si falla, `fail` con `email_send_failed`, y un evento desconocido se marca `unsupported_event`.

### Importar el workflow en n8n

La guía completa está en [`n8n/README.md`](n8n/README.md): importar [`n8n/workflows/automation-outbox-poller.json`](n8n/workflows/automation-outbox-poller.json), crear las credenciales Header Auth y SMTP, rellenar `APP_BASE_URL`, `TEAM_EMAILS` y `FROM_EMAIL`, activar el workflow y probarlo con datos ficticios. El JSON no contiene secretos ni direcciones reales.

### Migración del outbox

Pendiente de aplicar por el usuario. **Primero en una rama de desarrollo de Neon**; en `production`, solo después de revisarla y con autorización explícita de la operación remota. **No volver a aplicar `drizzle/0000_tough_thor.sql`**: ya está aplicada en `production`.

1. Revisar `drizzle/0004_classy_tenebrous.sql`: solo crea, en `public`, el enum `automation_event_status`, las tablas `automation_events` (seis CHECK, el índice único `automation_events_type_lead_uq` y los índices parciales `automation_events_pending_idx` y `automation_events_lease_idx`) y `automation_event_redrives` (un CHECK y dos claves foráneas `ON DELETE restrict`, hacia `automation_events` y `profiles`). `lead_id` no tiene clave foránea todavía. No hay cambios en las tablas existentes. `grep -inE 'neon_auth|drop|create schema' drizzle/0004_classy_tenebrous.sql` no devuelve nada.
2. Orden: si faltan en esa rama, aplicar antes `0001`, `0002_tough_warpath` (leads, ver [Migración de la tabla de leads](#migración-de-la-tabla-de-leads)) y `0003_talented_skin` (reservas, ver [Migración de las tablas de reservas](#migración-de-las-tablas-de-reservas)); después, `0004`. Comprobarlo con `SELECT to_regclass('public.profiles'), to_regclass('public.leads'), to_regclass('public.bookings');` (ninguno debe ser `NULL`). El outbox no depende de las reservas, pero se respeta el orden del journal de Drizzle.
3. Aplicar `0004` con el mismo procedimiento y la misma comprobación de `neon_auth` que en [Migración de las tablas de staff](#migración-de-las-tablas-de-staff) (pasos 3 a 5): guardar el estado de `neon_auth`, pegar el archivo entre `BEGIN;` y `COMMIT;` en el SQL Editor de Neon con la rama correcta seleccionada (o `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f drizzle/0004_classy_tenebrous.sql`) y comprobar que el volcado de `neon_auth` es idéntico (`diff` vacío). Las líneas `--> statement-breakpoint` son comentarios de SQL y se pueden dejar.
4. Comprobar las tablas: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE conrelid IN ('public.automation_events'::regclass, 'public.automation_event_redrives'::regclass) AND contype <> 'n' ORDER BY 1, 2;` lista 11 restricciones (dos `*_pkey`, siete `*_chk` y dos `*_fk`; el filtro `contype <> 'n'` excluye los `NOT NULL`, que PostgreSQL 18 también guarda como restricciones), y `SELECT count(*) FROM automation_events;` devuelve 0.

**GRANT.** Hoy `DATABASE_URL` usa el rol owner y no necesita GRANT. Si pasa a un rol de aplicación con permisos mínimos, ese rol necesita exactamente `SELECT, INSERT, UPDATE` en `automation_events` (sin `DELETE`) y ningún permiso en `automation_event_redrives`, que solo escribe el script de reenvío con `DATABASE_MIGRATION_URL`. Se conceden con la credencial administrativa, primero en la rama de desarrollo:

```sql
GRANT SELECT, INSERT, UPDATE ON automation_events TO <rol_de_la_app>;
```

No hay script `migrate` ni migración automática.

### Scripts del outbox

Se ejecutan con psql y `DATABASE_MIGRATION_URL` (nunca la URL de runtime del Worker ni de n8n), cada uno en una transacción y con `ON_ERROR_STOP`. Requieren la migración `0003` aplicada en esa rama. Las instrucciones completas están en la cabecera de cada archivo.

- **Datos ficticios** ([`scripts/sql/seed-automation-demo.sql`](scripts/sql/seed-automation-demo.sql)). **Solo en una rama de desarrollo de Neon, nunca en `production`**: comprobar en la consola que la cadena de conexión apunta a esa rama. Inserta cuatro eventos `lead.created` `pending` con UUID fijos (prefijo `de000000`) y slugs ficticios (`maraton-demo-2027`, `media-maraton-demo`, `trail-demo-2027` y uno sin viaje). Es idempotente: repetirlo no duplica eventos. Con `-v cleanup=on` borra exactamente esos eventos y sus filas de reenvío, sin tocar otros.

  ```sh
  psql "$DATABASE_MIGRATION_URL" -f scripts/sql/seed-automation-demo.sql
  psql "$DATABASE_MIGRATION_URL" -v cleanup=on -f scripts/sql/seed-automation-demo.sql
  ```

- **Reenvío auditado de un evento `dead`** ([`scripts/sql/redrive-automation-event.sql`](scripts/sql/redrive-automation-event.sql)). `event_id` es el id del evento en `automation_events` (el `eventId` que ve n8n), no el `lead_id`; `performed_by` es el `user_id` de un staff con asignación activa; `reason` sigue el formato `<operador>: <motivo>` (1–500 caracteres). En una sola sentencia inserta la fila de auditoría en `automation_event_redrives` y devuelve el evento a `pending` con `attempts = 0` y sin lease; si el evento no está `dead` o `performed_by` no es staff activo, no cambia nada. Siempre devuelve una fila con `applied`, `previous_status`, `current_status`, `performed_by_is_staff` y `redrive_id`. Primero en una rama de desarrollo; en `production`, solo con autorización explícita.

  ```sh
  psql "$DATABASE_MIGRATION_URL" -v event_id='<id del evento>' \
    -v performed_by='<user_id del staff>' -v reason='<operador>: <motivo>' \
    -f scripts/sql/redrive-automation-event.sql
  ```

### Checklist manual de la Fase 3

La ejecuta el usuario, con su autorización (los agentes no tienen acceso a Neon), en una rama Neon de desarrollo con la migración y el seed aplicados, `npm run dev` apuntando a esa rama y una dirección de prueba como destinataria, nunca la del equipo real. La lista y cómo comprobar cada punto están en [Checklist de la Fase 3 de `n8n/README.md`](n8n/README.md#checklist-de-la-fase-3).

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
