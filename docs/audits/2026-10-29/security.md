# Auditoría de seguridad: identidad, autorización y privacidad

Fecha: 29 de octubre de 2026. Revisión independiente de solo lectura sobre el
árbol integrado de `codex/integrate-pr22`, comparado con `origin/main` y con el
head original `origin/pr-22`. El único archivo escrito por esta revisión es este
informe, fuera del checkout.

## Resultado

Se identificó un defecto de privacidad P2 en las nuevas lecturas del directorio.
El agente principal lo corrigió durante la auditoría y se verificó la corrección
por inspección del árbol actualizado. No se identificaron otros defectos críticos
o altos sustentados en el alcance revisado. Esto no certifica los flujos reales
de Clerk/Neon ni la ejecución del Worker, que necesitan sus comprobaciones de entorno.

## F-SEC-01 — P2 — Parámetros personales en errores no saneados del directorio

**Estado: corregido en el árbol revisado; pruebas de regresión añadidas por el agente principal.**

Las páginas nuevas de Usuarios (`app/crm/(protected)/admin/usuarios/page.tsx:44`
y `app/crm/(protected)/admin/usuarios/[id]/page.tsx:46`) dejaban escapar errores de
las lecturas hasta el manejador de errores de Next. `DrizzleQueryError` incluye
SQL, parámetros y causa en el error. Con una búsqueda por correo y un fallo de
base, el mensaje original podía llegar al log de producción y conservar el correo
buscado; los identificadores de cuenta también se podían exponer en errores de ficha.
No era una omisión de autorización ni una respuesta pública con datos de otra cuenta.

La reproducción local ejecutó el `createReactServerErrorHandler` real de Next
en modo de producción con un `DrizzleQueryError` y un correo ficticio `.invalid`:
el callback de errores recibió el objeto original con sus parámetros. Se comprobó
además en el código instalado que `NextNodeServer.instrumentationOnRequestError`
lo remite a `logError` en producción. No se necesitó una credencial ni acceso a Neon.

El supuesto de la spec histórica `accounts-user-management.md:54` —que propagar
errores al boundary evita su registro— no se sostiene frente al manejador real
de Next. El defecto procedía del PR #22 original y se habría conservado al integrarlo.

Corrección inspeccionada: `modules/accounts/services/userDirectory.service.ts:159`
introduce un límite público que transforma cualquier fallo en un `Error` nuevo
con texto fijo `user-directory: load failed`, sin `cause`, parámetros ni propiedades
de Drizzle. `listUsers` y `getUserDetail` pasan por ese límite. Los tests del
service incluyen ahora fallos con información privada y comprueban el texto fijo
y la ausencia de `cause`/`params`. La ejecución definitiva de esos tests se registra
en el informe general del agente principal; esta revisión no ejecutó suites del proyecto.

## Cobertura y evidencia

| Área revisada | Resultado observado |
| --- | --- |
| Identidad Clerk | `auth()` identifica y `currentUser()` debe coincidir con ese id. Solo el correo primario con verificación `verified` permite aceptar invitaciones o superar `requireVerifiedEmail`. Metadata de Clerk no concede roles. |
| Autorización | Los roles se leen de asignaciones activas en Neon. `can` rechaza permisos desconocidos; `manageableRoles` conserva super admin → comercial/organizador/admin y admin → comercial. Sponsor no obtiene CRM, viajes, ofertas o gestión de equipo. |
| Patrocinadores | `requireSponsor` exige permiso y marca de asignación activa; un admin/super admin sin esa marca también es rechazado. Los errores de la consulta de marca se convierten en ForbiddenError sin causa original. |
| Rutas y middleware | Páginas CRM vuelven a comprobar sus permisos; el layout no es el único control. El perfil añade `/cuenta/perfil/:path*` al matcher de Clerk. Las acciones públicas pueden fallar cerradas si no tienen sesión/middleware. |
| Perfil propio | Página/acción obtienen identidad desde servidor. Lectura y upsert filtran por id de sesión; campos extra de actor, correo o consentimiento/versionado no se aceptan del formulario. El consentimiento vuelve a desmarcarse tras un guardado correcto. |
| Datos sensibles | Documento, salud y emergencia permanecen en el perfil del titular. El directorio selecciona explícitamente presentación y conteos; no carga esos campos ni importes/notas internas. El formulario no devuelve valores sensibles en el estado de acción. |
| Cambios de roles | La autorización se comprueba antes del service. El schema excluye `super_admin` y `sponsor` como objetivos actuales de formularios de equipo. Revocación de invitaciones incorpora el conjunto gestionable al mismo UPDATE; la protección del último admin usa bloqueo ordenado. |
| SQL/inputs | Consultas revisadas parametrizadas; búsqueda de usuarios usa `strpos` literal, no concatena SQL del usuario. Schemas acotan ids, búsqueda, fechas, teléfonos, tamaños, relaciones de documento/emergencia y URLs HTTPS. |
| Errores de acciones | Acciones de staff/patrocinadores eliminan el error original; perfil registra únicamente texto fijo y devuelve errores sin valores del perfil. Las guardas no propagan mensajes de Clerk ni de la base. |
| CSRF y destinos | Las mutaciones de cuentas/patrocinadores son Server Actions con guardas y sin una relajación de orígenes en next.config. Los destinos de login/logout están cerrados por tipos/audiencia, no proceden de query params. No se verificó el comportamiento de un host desplegado. |
| API de integraciones | Todas las rutas n8n revisadas pasan por el wrapper Bearer, que valida antes de acceder a la base, compara hashes sin salida temprana, limita JSON a 4 KiB y devuelve `no-store`/errores fijos. No hay CORS permisivo. |
| Configuración sensible | Variables de servidor se validan de forma perezosa, el URL de base exige TLS y los errores de configuración solo exponen nombres. No se imprimieron valores ni se leyeron archivos de credenciales. |

Se inspeccionaron los tests de guardas, matrices de roles, acciones de staff,
perfil y patrocinadores, directorio y matcher. Contienen casos de primary no
verificado con secondary verificado, id discordante, metadata forjada, actor
extra, falta de rol, revocación y errores con causas privadas. La revisión no
tomó el conteo de tests como sustituto de revisar los límites de confianza reales.

## Límites

No se probaron sesiones reales ni cuentas de Clerk, conexiones Neon, condiciones
de carrera contra un servidor PostgreSQL concurrente o despliegue Cloudflare.
No se enviaron formularios a producción ni se alteraron asignaciones o datos.
Las revisiones de lógica comercial, migraciones, dependencias, frontend y CI se
documentan en sus informes independientes. No se encontraron credenciales reales
ni se intentó extraerlas.
