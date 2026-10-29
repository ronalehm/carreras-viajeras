# CLAUDE.md

Guía para Claude Code en Carreras Viajeras. El idioma de trabajo es español.

@AGENTS.md

Este repositorio es una aplicación Next.js independiente. No aplican instrucciones de Astro de directorios vecinos. Lee `docs/SETUP.md` antes de escribir código y `README.md` para el estado operativo y las migraciones vigentes.

## Comandos

```sh
npm ci                              # dependencias con lockfile
npm run dev                         # Next development
npm run lint                        # ESLint
npm test -- --run --maxWorkers=3     # Vitest, una ejecución
./node_modules/.bin/next typegen     # tipos de rutas
./node_modules/.bin/tsc --noEmit     # TypeScript, tras generar tipos
npm run build                       # build Next con webpack
npm run build:worker                # Next + OpenNext + limpieza de secretos; sin deploy
npm run preview                     # build soportado y Worker local
npm run cf-typegen                  # regenerar tipos al cambiar bindings
npm run db:generate                 # SQL local para revisión; sin conexión remota
```

`npm run deploy` modifica Cloudflare y requiere autorización explícita. No se aplica SQL remoto, seed, DNS, alta de recursos o roles como parte del desarrollo, instalación, build o arranque.

## Identidad y entorno vigentes

Clerk es el único proveedor de identidad. La spec aprobada `docs/specs/accounts-clerk-rbac.md` sustituye las partes de Neon Auth en las specs históricas. El id estable es el `userId` de Clerk; el correo primario verificado permite aceptar invitaciones y vincular reservas. Los roles y sus permisos se leen en Neon por petición, con denegación por defecto. La metadata de Clerk, cookies y formularios no conceden roles. Conserva los límites de gestión del equipo y los viajes propios del organizador.

La aplicación usa Neon PostgreSQL por Drizzle `neon-http` y HTTPS; no D1 ni Hyperdrive. El runtime valida perezosamente `DATABASE_URL` con TLS, `CLERK_SECRET_KEY` y `APP_ORIGIN`. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` es pública y se incorpora al build. Next lee `.env.local` y Wrangler local lee `.dev.vars`; no sobrescribas archivos existentes ni reveles valores. `DATABASE_MIGRATION_URL` es una credencial administrativa separada, nunca un secreto del Worker o de n8n. Las variables opcionales de n8n y Turnstile se validan solo al usarlas.

Usa una instancia Clerk de desarrollo para localhost y una rama Neon de desarrollo. La instancia Clerk de producción corresponde al dominio previsto. `APP_ORIGIN` admite los orígenes de desarrollo definidos por `lib/env.ts`; la preview en modo production conserva el origen de producción y solo acredita liveness hasta validar autenticación en el dominio correcto. No crees otra aplicación de Clerk ni claves ficticias para sortear configuración pendiente.

`/api/health` es liveness pública, sin consulta de base de datos. No equivale a una prueba de autenticación, autorización o datos. Consulta el README para lo que está implementado y lo que aún es una fase futura.

## Workers

Conserva `ASSETS`, `WORKER_SELF_REFERENCE`, observabilidad y los límites vigentes de acceso remoto en `wrangler.jsonc`. `npm run build:worker` ejecuta OpenNext y después `scripts/strip-env-secrets.mjs`; este último elimina los valores no públicos que OpenNext copia de `.env*` al artefacto. No uses build/preview/deploy directos del adaptador que omitan esta limpieza. Un build Next correcto no acredita Workers. No imprimas el módulo de entorno empaquetado al revisar secretos.

Las migraciones se generan localmente para revisión y se aplican a mano mediante una operación autorizada. No reescribas migraciones aplicadas ni modifiques tablas internas de `neon_auth`. La captura y automatización usan un outbox persistente y la API privada existente de n8n; conserva su contrato. Para leads, `source` es la vía de entrada inmutable y `channel` es el origen comercial editable: `crm-journey-automation.md` sustituye la propuesta antigua `crm-lead-sources.md`.

## Flujo de agentes y aprobación

`docs/SETUP.md` define estructura, criterios build/SDD, fases de hasta cinco tareas y aproximadamente quince archivos, y revisión. Los agentes de Claude están en `.claude/agents/`: orquestador, spec, developer y reviewer. El orquestador coordina; el reviewer no modifica código. Solo se paralelizan tareas independientes con archivos disjuntos. Paquetes, schema, `lib/`, componentes compartidos y exports van en secuencia; los builds no se ejecutan simultáneamente.

Para SDD, no se inicia implementación sin que el usuario escriba exactamente `apruebo docs/specs/<slug>.md` sobre la spec vigente. Ningún agente puede aprobarla, cambiarla a aprobada por su cuenta ni modificar el registro de aprobaciones. Los hooks de `.claude/settings.json` y `.claude/hooks/spec-approval.mjs` registran en Claude Code la aprobación humana con una firma por máquina y comprueban la versión de la spec. No se leen claves de firma ni se falsifican registros; una firma de otra máquina no demuestra aprobación local. Las casillas de progreso se actualizan según el flujo documentado.

La configuración de Codex se describe en `docs/CODEX.md`; esos archivos no convierten los hooks de Claude en hooks de Codex. La revisión de IA, las aprobaciones de specs y los checks de CI tienen propósitos distintos y se informan por separado.

## Interfaz y tests

Mantén la estructura de `AGENTS.md` y `docs/SETUP.md`: negocio en `modules/<domain>/`, `app/` compone rutas, inglés para identificadores y español para el producto. Reutiliza componentes, Zod y utilidades existentes. Tailwind v4 usa los tokens de `app/globals.css`; shadcn se construye sobre Base UI. Next 16 genera `PageProps` y `LayoutProps` en sus tipos de rutas.

Vitest usa jsdom y Testing Library, con alias de TypeScript. Los tests de servicios simulan la base/API; los Async Server Components requieren además validación funcional. Informa pruebas ejecutadas y limitaciones reales. No declares build, Workers o flujos autenticados validados si fallaron o faltan prerrequisitos.
