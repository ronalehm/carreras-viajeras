# Base técnica MVP de Carreras Viajeras

- Módulo: platform
- Estado: aprobado
- Base revisada: PR #1, fbbd7acb50fd02bb68d7be5cc2d9af0c6353db45; main 4d50f8dbfccc2e6fcfd87851f83e392f6fdcb0dd

## Objetivo y precedencia
Preparar únicamente infraestructura, entorno y controles de acceso para el hackathon. Este borrador propone sustituir las decisiones D1/Access sin roles de platform-cloudflare-deploy.md, crm-auth.md y las dependencias D1 de los demás borradores. No ejecutar sus instrucciones D1. No declara aprobado ningún documento ni habilita implementación SDD.

## Alcance
Next.js + React + TypeScript + Tailwind + shadcn/ui existentes; Cloudflare Workers Free con OpenNext; Neon PostgreSQL Free y Drizzle; Neon Auth gestionado (basado en Better Auth). Un solo proveedor de identidad: no instalar un segundo servidor Better Auth.
Se conservan landing y rutas actuales sin construir catálogo, pagos, itinerarios, comunidad ni CRM completo. PostHog desactivado por defecto; Gemini opcional y fuera de esta fase. WhatsApp Business App manual; API oficial posterior.

## Diseño técnico verificable
### Entorno y datos
- Elegir Drizzle neon-http y @neondatabase/serverless: acceso HTTPS a Neon sin Hyperdrive. Retirar binding HYPERDRIVE provisional, pg/@types/pg y tracing pg-cloudflare solo después de sustituir lib/db.ts y sus consumidores. D1 ya no está en el HEAD revisado: verificar que no vuelva en tipos, scripts o instrucciones.
- Mantener versiones compatibles y lockfile; no instalar indiscriminadamente latest ni rc. Resolver y revisar los avisos peer de Better Auth encontrados por npm ci.
- lib/env.ts valida con Zod, de forma diferida al recibir una petición: DATABASE_URL PostgreSQL con TLS, NEON_AUTH_BASE_URL HTTPS, cookie secret aleatorio >=32 caracteres, APP_ORIGIN exacto. No lanzar validación de secretos al importar durante build. Errores con nombres de campos únicamente, nunca entradas ni errores originales con credenciales.
- drizzle.config.ts para generar migraciones revisables; secret de migraciones separado del de la app y permisos mínimos. Ninguna migración automática en arranque/build. No modificar tablas internas neon_auth.
- workers_dev:false y preview_urls:false; conservar ASSETS y WORKER_SELF_REFERENCE. Ruta carreras-viajeras.mentec.dev solo se activa tras autorización de despliegue. Regenerar CloudflareEnv tras retirar Hyperdrive. Sin R2, Images ni ISR en esta fase.
- /api/health: liveness pública barata sin consulta; readiness autenticada o solo herramienta local. Sin fecha de base, detalles de conexión o errores originales en logs. Separar SQL del handler conforme a SETUP.

### Identidad y permisos
- Reutilizar getAuth() y handler del SDK instalado. Verificar sus métodos/tipos contra la versión fijada antes de cambiarlo; server-only para módulos con secretos.
- Registro público crea runners, nunca staff/admin ni colaboradores verificados. No aceptar roles, verified u organizationId confiables desde formularios o metadatos del cliente.
- Tablas de aplicación previstas: staff_assignments(user_id, role, active), organizations(id, status), organization_memberships(user_id, organization_id, role). user_id es el identificador estable emitido por Neon Auth, no el correo como clave de autorización.
- CRM: sesión válida + correo verificado + asignación administrativa activa. Roles iniciales crm_admin y crm_agent; denegar por defecto y consultar asignación vigente por petición. El primer administrador se asigna mediante procedimiento manual auditado por ID exacto, nunca por ser el primer registro.
- Colaborador: sesión y membresía + organización verificada; filtrar todos los recursos por organization_id autorizado. Runner solo accede a recursos propios. No publicar endpoints colaboradores durante esta fase.
- requireCrmUser se ejecuta en cada lectura sensible, API y Server Action, además del layout; no confiar únicamente en proxy/middleware o esconder botones. Sin bypass CRM por variable de desarrollo en producción.
- Cloudflare Access podrá añadirse como defensa adicional; no sustituye RBAC y no debe bloquear el registro público de runners.

### Leads y procesamiento posterior (contrato; no construir formularios ahora)
- Validación Zod, tamaño máximo 16 KiB, consentimiento explícito versionado y Turnstile Siteverify en servidor: success, hostname exacto y action lead_submit. Token inválido/expirado/reutilizado o servicio indisponible: no insertar lead.
- Guardar lead y evento lead.created en UNA transacción PostgreSQL (batch no interactivo soportado por el driver, o sentencia CTE atómica); no dos llamadas HTTP independientes. Idempotency key única; mismo key y payload devuelve resultado previo; distinto payload devuelve conflicto. Token Turnstile no persistido.
- Outbox: id, type, lead_id, payload_version, status(pending/processing/succeeded/dead), attempts, available_at, lease_until, lease_token, created_at, processed_at, last_error_code. Payload mínimo, sin cookies, contraseñas ni texto de error de proveedor.
- n8n Community local consulta por HTTPS una API privada de claim/ack, con bearer secreto en credenciales n8n, paginación y límite de lote. No requiere exponer n8n ni conectar Workers a localhost. No entregar DATABASE_URL a n8n.
- Claim con UPDATE/CTE y FOR UPDATE SKIP LOCKED; lease y token por intento; ack solo con token vigente. Recuperar leases expiradas. Reintentos con backoff y jitter, máximo 8; luego dead y reenvío administrativo auditado. Entrega al menos una vez; consumidor deduplica event_id. No prometer exactly-once ante efectos externos.
- Con n8n apagado, el formulario confirma solo tras commit y los eventos permanecen en Neon; no depender de waitUntil como cola durable. WhatsApp entrante se registra manualmente, sin scraping ni automatización de WhatsApp Web.

## Reutilización
lib/auth/server.ts, lib/db.ts, rutas API existentes, Zod instalado, OpenNext y configuración de shadcn. Código de negocio nuevo en modules/<domain>/ con index.ts público.

## Criterios de aceptación y pruebas
- [ ] Clon limpio: npm ci, lint, Vitest, next build y build OpenNext pasan sin secretos ni acceso a Neon durante build.
- [ ] No quedan referencias operativas D1 ni binding Hyperdrive provisional; CloudflareEnv regenerado.
- [ ] .env.example y .dev.vars.example contienen solo valores vacíos/comentarios; gitignore permite esas dos plantillas y sigue ignorando archivos reales.
- [ ] Env incompleto o inválido falla cerrado sin registrar valores; build no exige credenciales.
- [ ] Sin sesión: CRM denegado; runner incluso con email verificado: denegado; staff activo: permitido por rol; staff revocado: denegado en la siguiente petición; error DB: denegado. Pruebas de llamada directa a API y Server Action, no solo layout.
- [ ] Rol/admin/organización falsificados en body/cookie no elevan privilegios; organización pendiente y acceso cruzado se deniegan.
- [ ] Prueba de integración en rama Neon de desarrollo separada, con permiso: transacción lead+evento se revierte completa al fallar; dos consumidores no reclaman simultáneamente; lease expirada recuperable; ack antiguo rechazado; duplicados deduplicados; reinicio n8n no pierde eventos.
- [ ] Turnstile: validar action/hostname, expirado/reuso y caída de Siteverify. No producir datos de prueba en production.
- [ ] Antes de publicar: medir bundle/startup/CPU en Workers Free y autenticar en runtime Workers. Un build Next exitoso no prueba compatibilidad de despliegue.

## Plan de tareas
### Fase 1: configuración y datos (sin producto nuevo; máximo ~15 archivos)
- [x] T1 — Entorno diferido y plantillas: lib/env.ts, lib/env.test.ts, .env.example, .dev.vars.example, .gitignore.
- [x] T2 — Drizzle HTTPS y migraciones vacías/iniciales revisadas: lib/db.ts, drizzle.config.ts, package.json, package-lock.json; depende T1. No ejecutar migraciones remotas.
- [x] T3 — Config Workers y tipos: wrangler.jsonc, cloudflare-env.d.ts, next.config.ts; depende T2.
- [x] T4 — Endurecer auth y health existentes: lib/auth/server.ts, app/api/health/route.ts; depende T1/T2. Sin nuevo CRM ni formulario.
- [x] T5 — Reconciliar documentos operativos obsoletos y verificar comandos locales; resumir resultados sin afirmar pruebas cloud no ejecutadas. Si excede ~15 archivos, documentación en fase separada.
### Fase 2: permisos mínimos
Spec separada a aprobar para tablas de asignaciones, guardas y pruebas. No crear interfaz CRM completa.
### Fase 3: captura durable mínima
Spec separada a aprobar para outbox, formulario protegido, claim/ack y workflow n8n. No implementar por adelantado esta fase.

## Operación y aprobación
Nada de merge, push, despliegue, cambios de DNS, migraciones remotas, asignación de roles o creación de recursos externos en esta preparación. La cuenta Neon existente no obtiene permisos CRM automáticamente. Revisar Sign-up with Email ON, Sign-in ON y trusted origin en consola: pendientes de evidencia, no verificables desde el código.

## Fuentes oficiales
- https://opennext.js.org/cloudflare/get-started
- https://neon.com/docs/auth/quick-start/nextjs-api-only
- https://neon.com/docs/auth/guides/configure-domains
- https://orm.drizzle.team/docs/connect-neon
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/workers/platform/limits/
