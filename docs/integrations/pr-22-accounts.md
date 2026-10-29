# Integración del PR #22 con Clerk y el panel actual

La ejecución fue solicitada por el usuario el 29 de octubre de 2026 sobre el plan
revisado de PR #22, PR #23 y Codex. Esta integración conserva las fases existentes
del PR; no convierte sus fases futuras en funcionalidades terminadas.

## Base y precedencia

- main: `4863229c87cd56eb44fd36075893e18c35c922cc`.
- Head original del PR #22: `5ba213bfe10d86dab136ae45a1f2575c68fa4a0f`.
- Se conservan Clerk, `super_admin`, `organizer`, el alcance por organizador,
  ofertas comerciales, captura omnicanal, panel administrativo y Workers Logs.
- Las specs `accounts-runner-profiles`, `sponsors-portal` y
  `accounts-user-management` de la rama describen el alcance ya implementado.
  `accounts-clerk-rbac` y las specs posteriores de main prevalecen en identidad,
  matriz de gestión de roles y contratos compartidos. Las referencias históricas
  a Neon Auth no son instrucciones de ejecución.
- El registro de aprobaciones conserva los historiales mediante el merge de Git;
  no se generaron firmas ni se registraron aprobaciones nuevas en nombre del usuario.

## Entregas integradas

| Entrega | Resultado |
| --- | --- |
| Datos y permisos | `sponsor` como quinto rol; perfiles, marcas y campos de revisión añadidos al schema actual. Los demás roles y objetos se conservan. |
| Perfil F1–F2 | Perfil propio en `/cuenta/perfil`, correo primario verificado y consentimiento exigido en cada guardado. Identidad y correo proceden del servidor. |
| Patrocinadores F1–F2 | Marcas del CRM, validación y guardas. `sponsor` carece de acceso al CRM y solo satisface `requireSponsor` con marca activa. |
| Usuarios F1 | Directorio unificado, búsqueda, filtros de los cinco roles y runner, ficha y gestión de roles según el actor. Se conserva el diseño del panel. |
| Compatibilidad | Middleware de Clerk cubre el perfil; no se recuperan `authClient`, Better Auth ni rutas de autenticación eliminadas. |

Admin y super admin pueden gestionar marcas. La gestión actual de roles se mantiene:
super admin gestiona comercial, organizador y admin; admin solo comercial.
`sponsor` y `super_admin` no son asignables desde formularios de equipo. El filtro
del directorio sí los admite, porque consultar un rol no lo concede.

## Migración incremental

Se generó `0010_runner_profiles_sponsors` mediante Drizzle desde `0009`.
Las migraciones, snapshots y entradas anteriores del journal no se renumeran ni
reescriben. Las migraciones alternativas `0005_short_spiral` y
`0006_flat_mariko_yashida` de la rama antigua no se añaden al árbol integrado.
El historial del PR sigue accesible en sus commits originales.

La migración crea solo los objetos incrementales de esta entrega en `public`.
Sus CHECK de roles usan `role::text` para evitar consumir el nuevo valor tipado
del enum antes de confirmar la transacción. La prueba en una base local efímera
se registra en la evidencia final; no se ha migrado Neon ni producción.

Si alguna base ya recibió las migraciones alternativas, requiere conciliación de
su esquema real antes de usar `0010`. El setup y los workflows no aplican SQL.

## Alcance posterior conservado

Siguen pendientes runner-profiles F3, sponsors-portal F3–F7 y
accounts-user-management F2–F4. Incluyen el CRM completo de corredores, invitación
de patrocinadores, portal de eventos, revisión/promoción pública e historial
completo de usuarios. El directorio actual no expone documentos, contactos de
emergencia ni notas médicas.

## Evidencia de validación

- Suite completa del árbol integrado: 78 archivos y 2.348 pruebas correctas.
  Los siete tests de hooks necesitan procesos y repositorios temporales; la suite
  final se ejecutó con esos permisos, sin modificar sus aserciones.
- ESLint y TypeScript: correctos tras generar los tipos de rutas de Next.
- PostgreSQL 18.6 mediante PGlite 0.5.13: 138 comprobaciones y 282 aserciones,
  sin fallos ni omisiones. Se aplicaron 0000–0009 y después 0010 completa en una
  transacción. Se probaron CHECK/FK, roles con marca y preservación del organizador.
- Auditoría independiente: saneamiento del directorio corregido para impedir que
  Next registre parámetros personales al fallar una lectura; invalidación de la
  ficha corregida con su route group `(protected)`; aviso del perfil actualizado.
- Se intentó `npm run build:worker`, que ejecuta el build de Next: falla al
  descargar Google Fonts por la política de red. No se modificó TLS ni se usaron
  fuentes simuladas. No hay evidencia de un Worker empaquetado correctamente.
- Faltan las variables de Clerk y Neon de desarrollo; las comprobaciones visuales,
  autenticadas y contra Neon/Cloudflare reales siguen pendientes.

Los límites operativos anteriores no se presentan como pruebas superadas ni como
una migración, activación de CI o despliegue realizados.
