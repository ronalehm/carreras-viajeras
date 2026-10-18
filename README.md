# Carreras Viajeras

MVP para hackathon: preparación técnica sobre la plantilla web actual (`Hello world`), sin construir todavía landing, catálogo, pagos, comunidad ni CRM completo. La landing anterior está en otra carpeta y no forma parte de este repositorio.

> **Precedencia:** la fase 1 aprobada de [`platform-neon-foundation.md`](docs/specs/platform-neon-foundation.md) define esta preparación. Los borradores anteriores que indican D1, Hyperdrive provisional o Access como sustituto de RBAC están obsoletos y no son instrucciones ejecutables. No seguir sus pasos de infraestructura.

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

No se utiliza D1 ni Hyperdrive. PostHog queda desactivado por defecto y Gemini es opcional, fuera de esta fase. La fase 1 no añade frontend ni tablas de negocio. RBAC de CRM/organizaciones y captura durable de leads requieren sus fases y specs posteriores.

## Preparación local

Requisitos: Node.js 22 o superior y npm. Para verificar el paquete OpenNext, usar Linux o WSL: un build Next correcto por sí solo no valida Workers.

```sh
git clone https://github.com/ronalehm/carreras-viajeras.git
cd carreras-viajeras
npm ci
```

Esta preparación ya está fusionada en `main` (PR #1).

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

Con `npm run db:generate`, Drizzle genera SQL revisable localmente sin conexión ni migraciones automáticas al iniciar o compilar. El schema inicial está vacío: aún no hay tablas de negocio que migrar. `DATABASE_MIGRATION_URL` se reserva para una operación administrativa futura; es distinta de `DATABASE_URL` y nunca se entrega al Worker ni a n8n. La configuración de generación no consume esa credencial. No modificar tablas internas de `neon_auth`. No aplicar migraciones contra `production` como parte del setup; antes se requiere revisión y autorización de la operación remota.

## Continuar desde Neon y Cloudflare

1. Neon ya tiene proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo y base `neondb`. El usuario confirmó **Sign-up with Email ON** y **Sign-in ON**; esta preparación no verificó la consola.
2. Comprobar en Neon Auth el trusted origin exacto `https://carreras-viajeras.mentec.dev`. Su estado sigue pendiente de verificación. La cuenta existente no recibe permisos CRM automáticamente.
3. Antes de publicar, preparar secretos del Worker mediante el mecanismo de secretos de Cloudflare y revisar `APP_ORIGIN`; nunca poner credenciales en `wrangler.jsonc`, variables `NEXT_PUBLIC_*` ni el repositorio.
4. Validar sesión y cookies en runtime Workers. Una futura fase CRM exigirá correo verificado y asignación administrativa activa por ID de usuario, con denegación por defecto; Access puede ser una defensa adicional.
5. Revisar el PR y pedir autorización antes de push, merge, despliegue, DNS, migraciones remotas o asignación de roles. `npm run deploy` modifica Cloudflare y no forma parte de estas comprobaciones locales.

Los futuros leads y sus eventos se confirmarán juntos en Neon; n8n local los procesará con reintentos mediante API privada. No hay formulario, outbox ni integración WhatsApp API implementados en esta fase.

## Reglas de colaboración

Leer [`docs/SETUP.md`](docs/SETUP.md) antes de modificar código. El negocio vive en `modules/<domain>/` y `app/` compone rutas. Reutilizar componentes y validar fronteras con Zod. El flujo SDD requiere spec aprobada, implementación y revisión; solo el usuario puede aprobar y ningún agente modifica el registro de aprobaciones.
