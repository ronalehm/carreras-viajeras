# Despliegue en Cloudflare (Workers + D1 + Access + Turnstile)

- Módulo: plataforma (infraestructura; sin código de dominio)
- Estado: borrador
- Orden en el roadmap: 5 de 5 (`crm-auth` → `trips-catalog` → `crm-leads-pipeline` → `landing-public-site` → `platform-cloudflare-deploy`)
- Depende de: Fase 0 de stack (coordinador: next 16.4.2, `@opennextjs/cloudflare` 1.20.x, `wrangler` 4.x, `wrangler.jsonc` con worker `carreras-viajeras`, binding D1 `DB` → `carreras_viajeras_db` con `database_id` provisional, `migrations_dir: "migrations"`, custom domain `carreras-viajeras.mentec.dev`, `open-next.config.ts` sin R2, scripts `preview`/`deploy`/`cf-typegen`). La Fase 2 de esta spec requiere además las specs anteriores implementadas (al menos `crm-auth`, `trips-catalog` F1–F3, `crm-leads-pipeline` F1 y `landing-public-site` F1–F2).

## Objetivo
Publicar la plataforma en `https://carreras-viajeras.mentec.dev` sobre Cloudflare Workers (adaptador OpenNext) con base de datos D1, el CRM protegido por Cloudflare Access y el formulario protegido por Turnstile, dejando al usuario (principiante) una guía paso a paso y sin sorpresas de coste.

## Reglas de seguridad operativa (obligatorias)
1. **Confirmación previa del usuario** antes de cualquier acción que **cueste dinero** (pasar a Workers Paid, activar R2 u otro servicio de pago, añadir medio de pago) o que **borre o sobrescriba algo** (`wrangler d1 delete`, `wrangler delete`, borrar o reemplazar registros DNS existentes de `mentec.dev`, `wrangler d1 execute --remote` con `DROP`/`DELETE`, sobrescribir secrets ya definidos, `wrangler rollback`). Se pide confirmación comando a comando, mostrando el comando exacto.
2. Crear recursos gratuitos (D1, Worker, custom domain, aplicación de Access, widget de Turnstile) también se anuncia antes de ejecutarlo.
3. **Red de este entorno:** hoy bloquea `api.cloudflare.com` y `dash.cloudflare.com`, así que **la Fase 2 no puede ejecutarse aquí** hasta que el usuario habilite esos dominios en la configuración de red del entorno, o la ejecute él mismo desde su máquina siguiendo la guía. Lo local (`next dev`, `wrangler d1 ... --local`, `npm run preview`) sí funciona aquí.
4. Nunca se suben datos de ejemplo (`db/seed.local.sql`) a la base remota.
5. Ningún secreto se escribe en el repositorio (`.dev.vars` ya está en `.gitignore`).

## Alcance
- Incluye:
  - Endurecer `wrangler.jsonc`: desactivar `workers_dev` y `preview_urls` (evitan llegar al CRM por `*.workers.dev` sin pasar por Access) y activar `observability` (logs del Worker).
  - `public/_headers` con caché inmutable para `/_next/static/*`.
  - Guía `docs/deploy-cloudflare.md` en español: desarrollo local, previsualización en runtime de Workers, despliegue, Access, Turnstile, secrets, verificación, vuelta atrás, límites y costes.
  - Fase 2: pasos remotos (crear D1, migraciones remotas, despliegue, secrets, pruebas en producción).
- No incluye:
  - Caché incremental en R2, binding de Images, Durable Objects (R2 requiere medio de pago; la app no usa ISR).
  - CI/CD (Workers Builds / GitHub Actions), entornos de staging.
  - Reglas WAF / rate limiting, analítica, alertas.
  - Backups automáticos de D1 (D1 tiene Time Travel; se documenta, no se automatiza).
  - Configurar el correo de `mentec.dev`.

## Requisitos
1. `npm run preview` levanta la app en el runtime local de Workers con D1 local migrado (requiere build).
2. En producción, el único hostname público es `carreras-viajeras.mentec.dev` (sin `*.workers.dev` ni URLs de preview).
3. Variables en producción como secrets de Wrangler: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. `CRM_DEV_USER_EMAIL` nunca se define en producción.
4. Access protege `carreras-viajeras.mentec.dev/crm` (y subrutas) con una política *Allow* para los emails del equipo.
5. La guía indica para cada paso quién lo hace (usuario en el panel / comando), si crea recursos y si requiere confirmación.

## Criterios de aceptación
- [ ] (F1) `wrangler.jsonc` contiene `"workers_dev": false`, `"preview_urls": false` y `"observability": { "enabled": true }`, sin cambios en el resto (binding `DB`, ruta custom domain, assets, `WORKER_SELF_REFERENCE`).
- [ ] (F1) `public/_headers` aplica `Cache-Control: public,max-age=31536000,immutable` a `/_next/static/*`.
- [ ] (F1) Dado un clon limpio, cuando sigo la sección "Desarrollo local" de `docs/deploy-cloudflare.md` (crear `.dev.vars`, `npm run db:migrate:local`, `npm run db:seed:local`, `npm run dev`), entonces veo la landing con "Maratón de Santiago 2027" y el CRM en `/crm` con el usuario de desarrollo.
- [ ] (F1) Dado el D1 local migrado, cuando ejecuto `npm run preview`, entonces la landing responde en el puerto local de Wrangler y muestra el catálogo; `/crm` responde 404 (no hay Access ni usuario de desarrollo en build de producción), lo que confirma que falla cerrado.
- [ ] (F1) La guía incluye: tabla de costes/límites del plan gratuito, lista de acciones que requieren confirmación, aviso de red bloqueada en el entorno cloud, y la salida esperada de cada comando clave.
- [ ] (F2) `wrangler.jsonc` tiene el `database_id` real y `npx wrangler d1 migrations list carreras_viajeras_db --remote` no muestra migraciones pendientes.
- [ ] (F2) `https://carreras-viajeras.mentec.dev` muestra la landing con certificado válido; el formulario crea un lead visible en el CRM.
- [ ] (F2) `https://carreras-viajeras.mentec.dev/crm` en una ventana privada redirige al login de Cloudflare Access; tras entrar con un email permitido se ve el CRM con ese email; con un email no permitido, Access deniega.
- [ ] (F2) La URL `*.workers.dev` del Worker no sirve la app.
- [ ] (F2) El tamaño comprimido del Worker que informa `wrangler deploy` es < 3 MiB (límite del plan gratuito) o, si no, se ha pedido confirmación al usuario antes de pasar a Workers Paid.

## Diseño técnico

### Compatibilidad y riesgos verificados (octubre 2026)
| Tema | Hallazgo | Decisión |
|---|---|---|
| Versión de Next | `@opennextjs/cloudflare` 1.20.12 declara `peerDependencies.next: ">=15.5.28 <16 \|\| >=16.4.1"`; la plantilla traía 16.3.8 | Fase 0 sube a 16.4.2. Antes de actualizar Next en el futuro, comprobar el rango del adaptador (`npm view @opennextjs/cloudflare peerDependencies`) |
| Runtime | OpenNext ejecuta el runtime **Node.js** de Next sobre Workers con `nodejs_compat`; el runtime `edge` no está soportado | Nunca usar `export const runtime = "edge"` |
| `proxy.ts` (ex `middleware.ts`) | En Next 16 el proxy siempre corre en Node; OpenNext lo soporta desde 1.20.3 como **experimental** | No se usa proxy: autorización en layout + cada Server Action (`crm-auth`) |
| Server Actions | Se invocan con POST desde cualquier ruta; Access solo cubre `/crm` | Cada action del CRM llama `requireCrmUser()` (verificación del JWT de Access) |
| Caché / ISR | Sin R2 no hay caché incremental compartida | Páginas con datos dinámicas (`await connection()`); suficiente para el tráfico esperado |
| `getCloudflareContext()` | Síncrono solo en petición; en build/SSG requiere `{ async: true }` y usaría datos locales | Las páginas que leen D1 no se prerenderizan |
| Imágenes | Sin binding `IMAGES`, `/_next/image` no optimiza | `next/image` con `unoptimized` |
| Límites plan gratuito Workers | 3 MiB comprimido por Worker; 10 ms de CPU por petición; 100.000 peticiones/día | Vigilar tamaño en `deploy` y errores 1102 (CPU) en logs; si aparecen, proponer Workers Paid (5 USD/mes) **con confirmación** |
| D1 gratuito | 5 GB, 5 M filas leídas/día, 100.000 escritas/día; al superar se rechazan consultas (no se cobra) | Suficiente; documentar |
| `*.workers.dev` | Por defecto activo; saltaría Access | `workers_dev: false`, `preview_urls: false` + verificación JWT en la app (falla cerrado) |
| Zero Trust | Plan Free hasta 50 usuarios; el alta puede pedir medio de pago aunque cueste 0 | Lo hace el usuario en el panel; confirmar antes |
| Red del entorno cloud | `api.cloudflare.com` y `dash.cloudflare.com` bloqueados (403 del proxy) | Fase 2 pendiente de que el usuario habilite los dominios o la ejecute en su máquina |

Fuentes: `node_modules/next/dist/docs/` (16.4.2: `proxy.md`, `deploying-to-platforms.md`, `connection.md`, `route-segment-config`), documentación y CHANGELOG de `opennextjs/opennextjs-cloudflare` y `opennextjs/docs` (`get-started`, `bindings`, `howtos/db`, `index`).

### Archivos (Fase 1)
- `wrangler.jsonc` (modificar): añadir `"workers_dev": false`, `"preview_urls": false`, `"observability": { "enabled": true }`.
- `public/_headers` (nuevo):
  ```
  /_next/static/*
    Cache-Control: public,max-age=31536000,immutable
  ```
- `docs/deploy-cloudflare.md` (nuevo), secciones:
  1. Requisitos (Node 22, cuenta Cloudflare con la zona `mentec.dev`).
  2. Desarrollo local: contenido de `.dev.vars` (`NEXTJS_ENV=development`, `CRM_DEV_USER_EMAIL=...`, claves de prueba de Turnstile `TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`), `npm run db:migrate:local`, `npm run db:seed:local`, `npm run dev`, `npm run preview`.
  3. Preparación en el panel (usuario): zona, Zero Trust + aplicación Access + política, widget Turnstile.
  4. Despliegue (comandos de la Fase 2 con su orden, quién y confirmación).
  5. Verificación en producción.
  6. Operación: ver logs (`npx wrangler tail`), nuevas migraciones (`--remote`), vuelta atrás (`npx wrangler rollback`, requiere confirmación), D1 Time Travel.
  7. Costes y límites (tabla de esta spec) y acciones que requieren confirmación.

### Pasos remotos (Fase 2)
| Paso | Quién | Comando / acción | Crea / cuesta / borra | Confirmación |
|---|---|---|---|---|
| a | Usuario (panel) | Comprobar que `mentec.dev` está activa en la cuenta y si ya existe un registro DNS `carreras-viajeras` | — | Si existe un registro, no se toca sin confirmación |
| b | Usuario (panel) | Zero Trust → nombre de equipo → Access → Application (self-hosted) `carreras-viajeras.mentec.dev`, ruta `/crm` → política Allow con los emails del equipo → copiar *Application Audience (AUD) Tag* | Crea recursos gratis | Sí (puede pedir medio de pago) |
| c | Usuario (panel) | Turnstile → Add widget (Managed) para `carreras-viajeras.mentec.dev` → copiar site key y secret | Gratis | Aviso |
| d | Usuario o Claude (si la red lo permite) | `npx wrangler login` (o `CLOUDFLARE_API_TOKEN` con permisos mínimos: Workers Scripts Edit, D1 Edit, Workers Routes Edit y DNS Edit en `mentec.dev`) y `npx wrangler whoami` | — | — |
| e | Usuario o Claude | `npx wrangler d1 create carreras_viajeras_db` → copiar `database_id` a `wrangler.jsonc` | Crea D1 (gratis) | Sí |
| f | Usuario o Claude | `npx wrangler d1 migrations apply carreras_viajeras_db --remote` | Crea tablas | Sí |
| g | Usuario o Claude | `npm run deploy` (build OpenNext + deploy; crea el custom domain y su DNS/certificado) | Crea Worker y DNS | Sí |
| h | Usuario o Claude | `npx wrangler secret put CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` / `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | — (sobrescribir uno existente requiere confirmación) | Sí |
| i | Usuario | Pruebas de los criterios F2; dar de alta el primer viaje real desde el CRM | — | — |

## Reutilización
- Configuración de Fase 0 (`wrangler.jsonc`, `open-next.config.ts`, scripts `preview`/`deploy`/`cf-typegen`).
- Scripts `db:migrate:local` / `db:seed:local` de `trips-catalog`.
- Variables definidas en `lib/env.ts` (`crm-auth`, `landing-public-site` F3).

## Tests
- No hay código de aplicación nuevo: sin unit tests.
- Verificación manual con los criterios de aceptación; el reviewer comprueba F1 con `npm run lint`, `npx vitest run`, `npm run build` y `npm run preview` (esta última con D1 local migrado).

## Plan de tareas
### Fase 1 — Preparación local (ejecutable en este entorno)
- [ ] T1 — Endurecer `wrangler.jsonc` y añadir `public/_headers` · archivos: `wrangler.jsonc`, `public/_headers` · depende de: — · secuencial (base)
- [ ] T2 — Guía de despliegue en español · archivos: `docs/deploy-cloudflare.md` · depende de: — · paralelo con T1
- [ ] T3 — Verificar `npm run preview` con D1 local y documentar la salida en la guía · archivos: `docs/deploy-cloudflare.md` · depende de: T1, T2 · secuencial

### Fase 2 — Despliegue remoto (bloqueada hasta que el usuario habilite `api.cloudflare.com`/`dash.cloudflare.com` en la red del entorno o lo ejecute en su máquina; cada paso con confirmación según "Reglas de seguridad operativa")
- [ ] T1 — Pasos a–c en el panel de Cloudflare (usuario) · archivos: — · depende de: Fase 1 · secuencial
- [ ] T2 — Pasos d–e: login de Wrangler, crear D1 y fijar `database_id` · archivos: `wrangler.jsonc` · depende de: T1 · secuencial
- [ ] T3 — Paso f: migraciones remotas · archivos: — · depende de: T2 · secuencial
- [ ] T4 — Pasos g–h: despliegue y secrets · archivos: — · depende de: T3 · secuencial
- [ ] T5 — Paso i: verificación en producción y anotar resultados en la guía · archivos: `docs/deploy-cloudflare.md` · depende de: T4 · secuencial

## Preguntas abiertas
1. **Zona `mentec.dev`:** ¿está ya añadida y activa en tu cuenta de Cloudflare (DNS gestionado por Cloudflare)? ¿Existe ya algún registro `carreras-viajeras`?
2. **Red del entorno:** ¿prefieres habilitar `api.cloudflare.com` y `dash.cloudflare.com` en la configuración de red de este entorno (para que Claude ejecute los comandos con tu confirmación) o ejecutar la Fase 2 tú en tu máquina con la guía?
3. **Credenciales:** si Claude ejecuta los comandos, ¿usarás un API token con permisos mínimos (recomendado) en lugar de `wrangler login`?
4. **Plan de pago:** si el Worker supera 3 MiB comprimido o los 10 ms de CPU del plan gratuito, ¿aceptarías Workers Paid (5 USD/mes)? No se activa sin tu confirmación explícita.
5. **R2 / caché e imágenes:** R2 requiere medio de pago. ¿Lo quieres más adelante (para subir fotos de viajes o caché)? Por ahora queda fuera.
