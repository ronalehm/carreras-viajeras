<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Carreras Viajeras: instrucciones comunes

El idioma de trabajo es español. Lee `docs/SETUP.md` antes de modificar código y consulta `README.md` para el estado operativo actual. Este repositorio es una aplicación Next.js independiente: no aplican instrucciones de Astro de directorios vecinos.

## Arquitectura vigente

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 y shadcn/ui sobre Base UI.
- Clerk es el único proveedor de identidad. Los roles y permisos se consultan en Neon mediante Drizzle `neon-http`; la autorización falla cerrada.
- El id estable es `userId` de Clerk. Solo el correo primario verificado permite aceptar invitaciones y vincular reservas. Metadata, claims del cliente, cookies y formularios no conceden roles.
- `super_admin`, `admin`, `organizer`, `commercial` y `sponsor` tienen una matriz explícita. El rol `sponsor` no concede acceso al CRM y requiere una marca activa para su guarda específica. Conserva las restricciones de gestión de roles y el alcance de viajes del organizador.
- La spec `accounts-clerk-rbac.md` sustituye las partes de Neon Auth de las specs históricas. No reintroduzcas `getAuth`, Better Auth ni las variables `NEON_AUTH_*`.
- Para leads, `source` es la vía de entrada inmutable y `channel` el origen comercial editable. `crm-journey-automation.md` sustituye la propuesta histórica de `crm-lead-sources.md`.

## Código y permisos

`app/` compone rutas; el negocio vive en `modules/<domain>/`. Usa la API pública de cada módulo, alias `@/` y Zod en fronteras de confianza. Reutiliza componentes y funciones antes de crear otros. Server Components por defecto; `"use client"` solo donde se necesite.

Cada página, Route Handler y Server Action verifica sus permisos en el servidor. Middleware solo expone la sesión de Clerk: no sustituye las guardas. Añade al matcher cualquier ruta nueva que llame a `auth()` o a sus guardas. El actor, el propietario y el ámbito se obtienen de la sesión; los formularios no los deciden.

Minimiza los datos expuestos. Listas generales, logs, respuestas de error y payloads de automatización no deben filtrar documentos, notas médicas, notas internas ni datos de otra cuenta o marca. Revisa aislamiento por id estable y consultas atómicas cuando corresponda.

## Trabajo y revisión

Conserva los cambios existentes del usuario. Cada tarea cloud ya está aislada: usa el checkout existente y no crees un Git worktree salvo petición explícita.

Sigue la clasificación build/SDD de `docs/SETUP.md`. Una spec nueva se escribe como `Estado: borrador`; su implementación requiere aprobación humana expresa de la versión vigente, con el formato `apruebo docs/specs/<slug>.md`. Ningún agente concede esa aprobación ni modifica `docs/specs/approvals.jsonl` para aparentarla. No modifiques specs aprobadas; prepara una enmienda como borrador y conserva el historial (las casillas de progreso se actualizan según el flujo del proyecto).

El agente principal coordina los roles de `.codex/agents/`. Solo se delegan tareas con alcance de archivos explícito. Shared schema, paquetes, `lib/`, componentes compartidos y exports se trabajan en secuencia. Nunca ejecutes dos builds sobre el mismo directorio de salida. El reviewer es de solo lectura; el agente principal ejecuta los checks que escriban outputs y proporciona evidencia.

Los hooks de `.claude/` pertenecen a Claude Code: leerlos en Codex no los instala ni ejecuta. Verifica aprobación en la conversación real; no fabriques firmas HMAC ni des por válida en esta máquina una aprobación firmada en otra. Las instrucciones y límites operativos de Codex están en `docs/CODEX.md`.

## Validación

Node.js 24 y npm; usa `npm ci` para respetar el lockfile. Desde la raíz:

```sh
npm run lint
npm test -- --run --maxWorkers=3
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
npm run build:worker
```

Ejecuta primero los checks relevantes al cambio. `build:worker` compila Next y limpia secretos del artefacto; no declares compatibilidad con Workers por un build de Next aislado. Async Server Components necesitan comprobaciones funcionales además de los unit tests disponibles. Registra casos ejecutados, fallidos, omitidos y pendientes; un bloqueo del entorno no es una prueba superada.

`npm run dev` inicia el desarrollo. `/api/health` es liveness pública, sin consulta a Neon: no acredita autenticación ni readiness de datos. Valida los flujos con una instancia Clerk de desarrollo y una rama Neon de desarrollo.

## Entorno y operaciones externas

Reutiliza bindings existentes: inspecciona solo nombres y presencia, nunca valores ni volcados del entorno. `DATABASE_URL` necesita TLS; `CLERK_SECRET_KEY` solo servidor y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` es pública. `.env.local` es para Next y `.dev.vars` para Wrangler; no sobrescribas archivos privados existentes ni introduzcas credenciales en instrucciones guardadas.

Cloudflare Workers mediante OpenNext conserva `ASSETS`, `WORKER_SELF_REFERENCE` y la configuración de observabilidad. No uses D1 ni Hyperdrive. Las migraciones y seeds son manuales y revisables; nunca se ejecutan al instalar, compilar o arrancar. No modifiques tablas internas de `neon_auth`.

Usa `npm run build:worker` y `npm run preview`: no omitas `scripts/strip-env-secrets.mjs` mediante comandos directos del adaptador. Conserva TLS y verificación de firmas/checksums. No inventes claves para superar comprobaciones.

Commits, actualizaciones de PR, fusiones, despliegues, DNS, migraciones remotas, recursos y asignaciones de roles requieren su alcance autorizado por el usuario. La revisión de IA o un check correcto no conceden ese alcance. No envíes mensajes ni comentarios externos por iniciativa propia. Informa qué operaciones ocurrieron realmente y qué queda pendiente.
