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

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. Ya existen las tablas de staff (`profiles`, `staff_assignments`, `staff_invitations`), `/crm/acceso` con inicio de sesión, `/crm` protegido y `GET /api/crm/me` (ver [Acceso al CRM](#acceso-al-crm)). Aún no hay tablas de leads ni de viajes, organizaciones de colaboradores ni captura durable de leads: requieren sus specs.

## Preparación local

Requisitos: Node.js 22 o superior y npm. Para verificar el paquete OpenNext, usar Linux o WSL: un build Next correcto por sí solo no valida Workers.

```sh
git clone https://github.com/ronalehm/carreras-viajeras.git
cd carreras-viajeras
npm ci
```

La preparación (PR #1), los roles del equipo (PR #2) y el acceso al CRM (PR #3) están fusionados en `main`.

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

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. La única migración, `drizzle/0000_tough_thor.sql`, crea las tablas de staff y se aplica a mano (ver [Migración de las tablas de staff](#migración-de-las-tablas-de-staff)). `DATABASE_MIGRATION_URL` es la credencial administrativa para operaciones manuales (psql y `scripts/sql/`); es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. Los ajustes de Neon Auth están en [Ajustes de Neon Auth](#ajustes-de-neon-auth).
2. El usuario confirmó el trusted origin exacto `https://carreras-viajeras.mentec.dev` en Neon Auth.
3. `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` se cargan en Cloudflare como **Secret** (nunca como texto). `APP_ORIGIN` no es secreto y vive en `vars` de `wrangler.jsonc`: cada despliegue automático ejecuta `wrangler deploy`, que borra las variables de texto creadas en el panel y no declaradas ahí. Por eso `APP_ORIGIN` aparece en el panel como variable de texto: no borrarla ni duplicarla como Secret; se cambia en `wrangler.jsonc`. Nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. El CRM exige correo verificado y una asignación de staff activa por ID de usuario, con denegación por defecto (ver [Acceso al CRM](#acceso-al-crm)); Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

Los futuros leads y sus eventos se confirmarán juntos en Neon; n8n local los procesará con reintentos mediante API privada. No hay formulario, outbox ni integración WhatsApp API implementados todavía.

## Acceso al CRM

### Modelo de acceso

- **Runners:** visitantes anónimos, sin cuenta ni perfil.
- **Staff** (`commercial`, `admin`): entra solo por invitación. El admin invita un correo con un rol y comparte a mano el enlace `<APP_ORIGIN>/crm/acceso`; la invitación caduca a los 7 días. La página de administración `/crm/admin/usuarios` llega en la Fase 3 de la spec.
- **Aceptación automática:** la primera petición autenticada con el correo **verificado** que coincide (sin distinguir mayúsculas) con una invitación pendiente y vigente la acepta en una sola sentencia: crea el perfil y la asignación. Después, la autorización usa solo el `user.id` estable de Neon Auth, no el correo.
- **Denegación por defecto:** sin sesión → 401; correo sin verificar, cuenta sin rol, invitación caducada o revocada, o error de Neon Auth o de la base → 403. Los roles se leen de la base en cada petición, así que una revocación se aplica en la siguiente. Body, query, cookies propias y `user.role` de Neon Auth nunca conceden permisos.
- **Último admin:** el CRM no permite revocar el rol `admin` del último admin activo. El primer admin se asigna solo con el script de bootstrap, nunca por ser el primer registro.

`GET /api/crm/me` responde `{ userId, staffRoles }` (200) o `{ error }` (401/403), siempre con `Cache-Control: no-store`. `/crm` muestra el correo y los roles, o la pantalla "sin acceso".

### Ajustes de Neon Auth

Los verifica el usuario en la consola de Neon (Auth):

- **Sign-up with Email ON** y **Sign-in ON.** Los invitados necesitan crear su cuenta. **Riesgo aceptado:** cualquiera puede registrarse en Neon Auth, pero sin invitación no obtiene permisos (403) ni filas en `public`.
- **Verificación del correo al registrarse ON, con código (OTP).** El SMTP compartido de Neon envía códigos; los enlaces requerirían SMTP propio. Sin correo verificado nadie pasa las guardas. La cookie de sesión cachea `emailVerified` hasta 5 minutos.
- **Trusted origin** `https://carreras-viajeras.mentec.dev` (configurado). Localhost viene preconfigurado.

**Recuperar la contraseña** mientras no exista la UI (Fase 3 de `accounts-auth-ui.md`): pedir el código y luego restablecer, enviando la cabecera `Origin` con el origen de confianza. Ambos pasos se probaron en producción.

```sh
curl -X POST https://carreras-viajeras.mentec.dev/api/auth/email-otp/request-password-reset \
  -H "Origin: https://carreras-viajeras.mentec.dev" -H "Content-Type: application/json" \
  -d '{"email":"<correo>"}'

curl -X POST https://carreras-viajeras.mentec.dev/api/auth/email-otp/reset-password \
  -H "Origin: https://carreras-viajeras.mentec.dev" -H "Content-Type: application/json" \
  -d '{"email":"<correo>","otp":"<código>","password":"<nueva contraseña>"}'
```

No dejar la contraseña en el historial de la terminal ni pegarla en un chat.

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

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
