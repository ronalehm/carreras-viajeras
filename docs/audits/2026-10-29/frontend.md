# Auditoría completa de frontend — Carreras Viajeras

Fecha: 29 de octubre de 2026. Revisión sobre la integración en curso de `codex/integrate-pr22`, basada en main `4863229`, con Clerk. Esta auditoría fue de solo lectura para el checkout: se escribió únicamente este informe fuera del repositorio. No se iniciaron servidores ni se ejecutaron builds o nuevas suites durante esta revisión.

## Resultado

No se identificaron defectos P0/P1 ni P2 nuevos y confirmados en el frontend inspeccionado. Se detectó una incoherencia P3 de comunicación al integrar perfiles con Clerk, corregida por el agente principal durante la auditoría. Este resultado describe revisión estática; no acredita validación visual autenticada, de accesibilidad con lector de pantalla ni de los flujos conectados a Neon/Clerk.

## Hallazgo corregido

### FE-01 — P3, comunicación de la capacidad de perfil después del acceso

- Ruta: `modules/accounts/components/AccessPanel.tsx:12` (y su test).
- Origen: texto previo de la versión con Clerk que permanecía al integrar `/cuenta/perfil` del #22.
- Reproducción de código: la audiencia runner mostraba «Todavía no crea un perfil viajero independiente»; tras autenticarse, `RunnerAccount` ya enlaza a «Mi perfil». El aviso podía hacer pensar que no había una capacidad que la integración acaba de añadir. No era una fuga ni un bypass: iniciar sesión, efectivamente, no guarda un perfil por sí solo.
- Corrección observada: «Este paso identifica tu acceso al sitio. Después podrás completar tu perfil; no te inscribe en un evento.». El agente principal actualizó el literal del test correspondiente.
- Estado: resuelto en el árbol de trabajo al cerrar este informe. La suite completa posterior corresponde al agente principal; esta auditoría no atribuye a esa corrección una ejecución de tests no observada.

## Cobertura y evidencia

Se inventarió el conjunto completo del frontend: 29 archivos `app/**/page.tsx`, 16 componentes de `components/ui`/`components/shared` y 65 componentes de los dominios landing, accounts, crm, bookings, trips y sponsors (se excluyen los archivos de test de esos recuentos). La revisión combinó lectura de rutas y formularios, seguimiento de props y estados, búsquedas globales de patrones de riesgo y contraste con las specs vigentes. Los Route Handlers/API y la implementación SQL se reservan para la auditoría de backend/seguridad del resto del equipo.

### Rutas, guardas y frontera servidor/cliente

- Todas las páginas de CRM con lectura o edición de datos invocan `getCrmAccess` antes de sus lecturas. El layout protege la entrada y las páginas repiten la autorización; la visibilidad de la navegación no se utiliza como autorización.
- Viajes conserva `tripScopeFor(access.user)` en listado y detalle, evitando que la adaptación de UI quite el alcance del organizador. Ofertas conserva `offers.view` frente a `offers.manage`; los formularios y acciones solo aparecen para el permiso de gestión.
- `/cuenta/perfil` usa el estado de página obtenido en servidor. Sin sesión redirige a `/cuenta`; sin correo verificado no muestra el formulario de datos sensibles. El matcher de Clerk incluye `/cuenta/perfil/:path*`.
- RunnerAccount usa `useUser` de Clerk. No se reintrodujeron `authClient`, Neon Auth ni formularios antiguos. Las props de CrmSidebar son email, etiquetas y destinos serializables; no contienen secretos ni la respuesta completa de Clerk.
- En landing, las Server Actions se reciben como props desde `app`; las referencias a CRM en el hook/formulario son `import type`, no importaciones de negocio en tiempo de ejecución. El catálogo usa las APIs públicas de trips.
- Las nuevas páginas de usuario pasan explícitamente `manageableRoles(access.user.staffRoles)` a los controles de rol. Las tablas no recuperan el antiguo permiso implícito de asignar cualquier rol por ser admin.

### Navegación y accesibilidad de controles

- Se conservaron el sidebar actual, la agrupación del CRM y su `aria-current`, incluido el caso de Mis pendientes. Patrocinadores se añade solo para `sponsors.manage`; pruebas del sidebar comprueban comercial, organizador y super admin.
- El menú móvil del CRM usa un diálogo de Base UI con título, descripción, cierre, Escape y restitución del foco. Hay pruebas existentes de estos recorridos. El menú de la landing reutiliza DropdownMenu de Base UI.
- Formularios inspeccionados: captura pública, lead, cambio de etapa/responsable, actividad, próxima acción, campañas, reservas, viajes, ofertas, tipo de cambio, invitación, patrocinador y perfil del runner. Se revisaron labels, ids, mensajes, `aria-invalid`/`aria-describedby`, estados pendientes, preservación tras error y confirmaciones destructivas.
- ConfirmActionButton conserva el diálogo de confirmación y no cierra al recibir un error. Los controles de enviar quedan deshabilitados mientras su acción está pendiente. Los formularios manuales no fuerzan un reinicio de campos tras un rechazo.
- Las tablas usan contenedor local con scroll horizontal. La navegación del CRM mantiene gestión de foco y el contenido principal no se solapa con el sidebar en el código de layout.
- Los estados de éxito del registro público se anuncian en un `role=status` persistente; modo stand desmonta el formulario y enfoca el botón de otra persona. El hook no guarda la información en almacenamiento persistente del navegador.
- El carrusel respeta la preferencia de movimiento y la pestaña oculta; el foco dentro de una lámina pausa la rotación y los cambios manuales se anuncian. La pausa invisible hasta foco y el h1 de la primera lámina son decisiones explícitas de la spec histórica; no se presentan aquí como regresiones nuevas.

### Datos expuestos, enlaces y recursos

- Búsqueda global en app, landing, componentes compartidos y componentes de cuentas/CRM/reservas/viajes/patrocinadores: no se encontraron `dangerouslySetInnerHTML`, `eval`, `document.cookie`, localStorage ni sessionStorage. No se encontraron accesos a secretos de proceso en componentes cliente; las únicas variables de sitio halladas son las públicas de Turnstile consumidas por secciones servidor.
- Los textos recibidos del catálogo se renderizan como nodos de React. Los enlaces externos relevantes usan `rel="noopener noreferrer"` con `target="_blank"`. Las URLs de WhatsApp se construyen con `encodeURIComponent`; no añaden datos personales del formulario como alternativa de error.
- El view model público de ofertas elimina ids, nombre interno, campaña, cupos y auditoría. Las páginas de detalle usan ofertas resueltas por el servidor, no importes de query params. El view model del catálogo no publica los precios antiguos de trips.
- El formulario del perfil solo recibe el perfil propio autorizado y no devuelve valores sensibles dentro del estado de error. El directorio presenta nombre/email/roles/marca/recuento y no renderiza notas médicas, documentos, contactos de emergencia ni notas internas.
- Se comprobaron todos los literales `/images/...` encontrados en app/modules/components: ninguno apunta a un archivo ausente de `public`.
- Los títulos de metadatos de usuario/CRM son fijos y no trasladan nombre o email al historial de pestañas. Metadatos de viajes proceden solo del catálogo publicado. El idioma de raíz es español y el indexado está desactivado por decisión del proyecto.

## Pruebas revisadas y alcance real de su evidencia

Se inspeccionaron los tests de RunnerAccount, AccessPanel, CrmSidebar, CrmSettings, ConfirmActionButton, el hook useLeadCapture, utilidades de catálogo/ofertas y parámetros de consulta, además de la nueva cobertura de middleware. Antes de esta auditoría, durante la implementación UI, se habían ejecutado y aprobado 41 pruebas en cuatro archivos (RunnerAccount, CrmSidebar, runnerProfilePage y middleware) y ESLint targeted de 15 archivos. Esos resultados no equivalen a un E2E ni a una comprobación de los archivos que el agente principal cambió después.

## Limitaciones y decisiones conocidas que no se cuentan como defectos nuevos

- Faltan credenciales de desarrollo de Clerk/Neon para verificar visualmente roles, perfil, directorio y CRM con sesiones reales. Las pruebas mockeadas y la inspección de código no sustituyen esa comprobación.
- El bloqueo de Google Fonts impide afirmar que Next/Workers compilan en esta instancia hasta repetir la operación con la red habilitada. No se usaron fuentes simuladas ni se desactivó TLS para producir una evidencia aparente.
- El texto legal P-L continúa cerrando el formulario público en producción mientras sea provisional. Es un control aprobado, no un error de formulario.
- Home conserva copia estática de precios/fechas/cupos y demo de comunidad/beneficios por decisión documentada en README y specs. No se calificó como regresión del #22/#23.
- Los enlaces estáticos de Río/Roma llevan a slugs de catálogo que pueden responder 404 mientras no se publiquen esos viajes; es una limitación histórica reconocida en la enmienda de landing-public-site y no se dispone de consulta a la base para afirmar el estado de esas filas.
- Portal del patrocinador, fichas avanzadas de corredores, pagos/itinerarios y portal completo del runner tienen fases o PR posteriores. No se reportó su ausencia como una nueva función rota de esta integración.
- Contraste final, zoom, teclado en navegador real, lector de pantalla, dispositivos móviles y composición del widget real de Clerk/Turnstile quedan pendientes. No se ha afirmado cumplimiento WCAG completo.

## Recomendación de cierre

Conservar estas limitaciones en la entrega. Completar la suite conjunta y las comprobaciones de compilación del agente principal; después verificar con cuentas de desarrollo los recorridos permitidos y denegados. No hay un bloqueo de frontend nuevo confirmado que justifique reintroducir la UI antigua o ampliar el alcance del PR a fases futuras.
