# Panel de administración del CRM

- Módulos: accounts y crm; componentes compartidos de presentación.
- Estado: borrador
- Referencias: capturas de mentec y Cloudflare adjuntas por el usuario el 2026-10-29; `docs/SETUP.md`, `accounts-roles-permissions.md` y el informe por cohorte de `crm-journey-automation.md`.

## Objetivo

Convertir el CRM actual en un panel de administración con navegación lateral, Dashboard, gestión de usuarios y Configuraciones, conservando las operaciones y la autorización existentes. La captura de mentec es la referencia principal de composición; la segunda captura aporta el patrón de navegación lateral y contenido de trabajo.

## Alcance

Incluye una fase funcional: sidebar fijo en escritorio, menú accesible en móvil, Dashboard en `/crm`, presentación renovada de `/crm/admin/usuarios` y nueva pantalla `/crm/configuraciones` para administradores.

El Dashboard reutiliza exclusivamente los datos del informe actual. Configuraciones presenta la cuenta, los roles y las opciones disponibles del CRM; no introduce opciones de negocio sin respaldo ni botones de guardado sin una operación real. Mantiene accesos a la gestión del equipo y al sitio público.

No incluye migraciones, cambios de roles o permisos, acceso a producción, despliegue, commits, integración con un nuevo proveedor de identidad, métricas financieras, datos ficticios, edición de secretos ni configuración remota de Neon/Cloudflare. La landing y el portal del runner conservan su diseño.

## Requisitos

1. **Identidad y composición.** Usar el logo existente de Carreras Viajeras (`public/images/logo-cv.webp` o su variante horizontal según legibilidad), conservar sus colores y no copiar el nombre mentec. Sidebar blanco con borde, fondo de trabajo claro, selección azul, tarjetas blancas y encabezados compactos. Aplicar los tokens existentes; no cambiar el tema global de la landing.
2. **Navegación.** Dashboard, Leads, Mis pendientes, Campañas, Viajes, Ofertas, Reservas, Usuarios y Configuraciones conservan sus destinos y sus condiciones de permiso. Agrupar el trabajo comercial y la administración. Usuarios y Configuraciones solo aparecen para `staff.manage`; Dashboard para `crm.access`. Mostrar el correo y los roles reales de la sesión y conservar Cerrar sesión.
3. **Estado activo.** `/crm` activa solo Dashboard; las rutas de detalle/alta/edición activan su módulo. En `/crm/leads?responsable=mios&seguimiento=pendientes`, activar solo Mis pendientes; el resto de rutas y filtros de leads activa Leads. Añadir `aria-current="page"` al enlace activo.
4. **Responsive y accesibilidad.** Sidebar fijo de aproximadamente 240 px desde `lg`; contenido desplazable con ancho flexible y sin quedar debajo del menú. En móvil, botón con nombre accesible y panel modal con cierre, Escape, gestión de foco y cierre al navegar. Evitar scroll horizontal de toda la página; las tablas pueden tener scroll propio. Conservar el foco visible y respetar reducción de movimiento.
5. **Dashboard real.** Mantener `/crm` y sus filtros `cohort`, `tripId` y `onlyImported`, incluido el descarte de viajes no disponibles. Mostrar el título Dashboard y cuatro tarjetas con `report.totals`: Total de leads, Nuevos (`stages.new`), Reservados (`stages.reserved`) y Sin responsable (`unassigned`). Aclarar que corresponden a la cohorte y filtros seleccionados. Conservar íntegra la tabla de origen por etapa y su descripción, incluido el estado vacío. No inventar ingresos, porcentajes, tendencias ni tasas de conversión.
6. **Usuarios.** Mantener `/crm/admin/usuarios`, `getCrmAccess("staff.manage")`, las invitaciones y todas las acciones de asignación/revocación y sus confirmaciones. Encabezado con explicación, resumen de miembros activos (`staff.length`) e invitaciones vigentes (excluir caducadas), y paneles para invitar, equipo activo e invitaciones pendientes. Los recuentos usan la respuesta actual de `listStaffOverview`; no añaden consultas.
7. **Configuraciones.** Añadir `/crm/configuraciones` con metadata y guarda propia `getCrmAccess("staff.manage")`, además del layout protegido. Mostrar identidad de la cuenta y roles, información pública del proyecto y accesos funcionales a Usuarios y al sitio público. Un comercial que navegue directamente ve una denegación sin datos administrativos. La pantalla no lee, envía ni representa credenciales, cadenas de conexión o secretos.
8. **Conservación.** Mantener las guardas del servidor en páginas y acciones; la visibilidad del menú no concede permisos. Mantener nombres y URLs de módulos existentes, filtros, acciones, cierre de sesión y los mensajes de error actuales. Los datos de usuarios no se incrustan en fixtures ni en código.

## Criterios de aceptación

- [ ] Dada una sesión admin y una pantalla de escritorio, al entrar al CRM aparece el sidebar con identidad, secciones, correo, roles y Cerrar sesión; el contenido no queda oculto por él.
- [ ] Dada una sesión comercial, no aparecen Usuarios ni Configuraciones; acceder directamente a Configuraciones se deniega mediante comprobación del servidor.
- [ ] Dadas rutas de listado, detalle, alta y edición, solo está activo su módulo; Mis pendientes se distingue por sus dos parámetros, independientemente del orden y de otros parámetros.
- [ ] Dado un viewport móvil de 390 px, el menú se abre y cierra con controles accesibles; Escape lo cierra, el foco vuelve al disparador y navegar cierra el panel. No se pierde acceso a ningún módulo permitido.
- [ ] Dado el informe de una cohorte y filtros concretos, las cuatro tarjetas reproducen sus totales exactos; cambiar los filtros actualiza tarjetas y tabla juntas. Una cohorte vacía muestra ceros y el estado vacío existente.
- [ ] Dada la vista Usuarios, siguen funcionando invitación, copia del enlace, asignación y revocación con sus mensajes y confirmaciones; sus tarjetas cuentan miembros únicos e invitaciones no caducadas.
- [ ] Dada la nueva vista Configuraciones, los enlaces llevan a destinos existentes; no hay formularios aparentes, acciones sin implementar ni datos secretos.
- [ ] Dada cualquier página de la landing o `/cuenta`, su presentación y comportamiento se conservan.
- [ ] Pasan lint, tipos y tests existentes y nuevos. Se intentan las compilaciones de Next y Workers, diferenciando fallos del entorno de defectos del código. La revisión visual y autenticada se registra como pendiente si faltan las credenciales de desarrollo.

## Diseño técnico

### Rutas y componentes

- `modules/accounts/components/CrmShell.tsx` — existente, servidor. Calcula los destinos visibles mediante `can()` y transmite al sidebar únicamente los datos de presentación autorizados. Conserva el slot `children` de las páginas del servidor.
- `modules/accounts/components/CrmSidebar.tsx` — nuevo, cliente. Navegación, estado activo con `usePathname`/`useSearchParams`, menú móvil e identidad; conserva `SignOutButton`. No importa `server-only` ni calcula permisos de autorización. El menú móvil compone Dialog de Base UI, ya instalado, siguiendo el patrón de Sheet de shadcn.
- `components/shared/CrmPageHeader.tsx` y `components/shared/SummaryCard.tsx` — nuevos, presentación reutilizable de encabezados e indicadores; composición de Card, tipografía e iconos ya disponibles.
- `modules/crm/components/CrmDashboard.tsx` — nuevo, presentación que compone las tarjetas y los existentes `LeadReportFilters` y `LeadReportTable` dentro de su módulo.
- `modules/accounts/components/CrmSettings.tsx` — nuevo, presentación de la configuración disponible, sin operaciones ni almacenamiento nuevo.
- `app/crm/(protected)/page.tsx` — existente; conserva la carga, guardas y filtros actuales y compone el Dashboard mediante la API pública de `modules/crm`.
- `app/crm/(protected)/admin/usuarios/page.tsx` — existente; añade encabezado, resúmenes y contenedores sin cambiar las acciones.
- `app/crm/(protected)/configuraciones/page.tsx` — nueva; metadata, guarda y composición desde `modules/accounts`.
- `modules/accounts/index.ts` y `modules/crm/index.ts` — existentes; exportan los nuevos componentes de sus respectivos módulos.

No se añaden dependencias ni se modifican manifests, lockfiles, CSS global, servicios, esquemas de datos o permisos. Reutilizar Card, Badge, Button, Table y los iconos de Lucide instalados. Revisar las guías del Next instalado antes de implementar los componentes del cliente y las rutas.

### Contratos

Se conservan `CrmShellProps`, `CrmAccess`, `LeadReport`, `LeadReportFilters`, `StaffMember` y `PendingInvitation`. El sidebar recibe una lista serializable de destinos visibles (texto, URL e identificador de icono), correo y etiquetas de roles; no recibe secretos ni funciones del servidor. El Dashboard consume los agregados existentes y no crea endpoints. Las comprobaciones de permiso y la lectura de datos permanecen en el servidor.

## Tests

- `CrmSidebar.test.tsx`: selección exacta y por segmento, distinción Leads/Mis pendientes, parámetros reordenados, navegación móvil, cierre con Escape, recuperación del foco y enlace de cierre de sesión conservado. Las pruebas simulan navegación y datos de presentación; no sustituyen la autorización del servidor.
- `CrmDashboard.test.tsx`: coherencia de tarjetas con el informe proporcionado, actualización al cambiar los datos y ceros sin inventar cifras.
- `CrmSettings.test.tsx`: identidad, roles, enlaces reales y ausencia de campos de credenciales.
- Ejecutar los tests existentes de permisos, guardas, usuarios y reporte, junto con la suite completa; `npm run lint`, `next typegen`, `tsc --noEmit`, `npm run build` y `npm run build:worker`. No iniciar dos builds simultáneos.
- Revisar en navegador escritorio/móvil las tres pantallas, el menú, los filtros, los estados vacíos y el acceso admin/comercial con la rama Neon `dev-test`, cuando se suministren sus bindings. No usar una sesión falsa como evidencia de integración.

## Plan de tareas

### Fase 1 — Panel CRM (5 tareas, 14 archivos de implementación y tests)

- [x] T1 — Base compartida y APIs públicas · archivos: `components/shared/CrmPageHeader.tsx`, `components/shared/SummaryCard.tsx`, `modules/accounts/index.ts`, `modules/crm/index.ts` · depende de: aprobación · secuencial; coordinar las exportaciones con los componentes de T2–T4 antes de validar.
- [x] T2 — Shell y navegación responsive · archivos: `modules/accounts/components/CrmShell.tsx`, `modules/accounts/components/CrmSidebar.tsx`, `modules/accounts/components/CrmSidebar.test.tsx` · depende de: T1 · independiente de T3 y T4.
- [x] T3 — Dashboard del informe existente · archivos: `app/crm/(protected)/page.tsx`, `modules/crm/components/CrmDashboard.tsx`, `modules/crm/components/CrmDashboard.test.tsx` · depende de: T1 · independiente de T2 y T4.
- [x] T4 — Usuarios y Configuraciones · archivos: `app/crm/(protected)/admin/usuarios/page.tsx`, `app/crm/(protected)/configuraciones/page.tsx`, `modules/accounts/components/CrmSettings.tsx`, `modules/accounts/components/CrmSettings.test.tsx` · depende de: T1 · independiente de T2 y T3.
- [x] T5 — Revisión integrada, validaciones y prueba visual · archivos: no añade archivos de producto · depende de: T2, T3 y T4 · secuencial; conservar la distinción entre checks pasados, fallos diagnosticados y pruebas pendientes.

## Condiciones actuales del entorno

El repositorio seleccionado es `ronalehm/carreras-viajeras`, HEAD `ce8fa4f01912a8d9efbd36e7efbdc40930a9fe24`; el acceso Git de lectura funciona. No se ha podido comprobar todavía la asociación de la sesión GitHub con `ronalehm@gmail.com` porque `api.github.com` está bloqueado por la política de red. No se asume esa identidad.

Instalación con `npm ci`, lint, generación de tipos, TypeScript y 1.764 tests de la aplicación pasan antes del rediseño; también pasan los 7 tests de los hooks del repositorio. Home y `/api/health` responden HTTP 200 en desarrollo. La compilación de producción falla al descargar Google Fonts por red; se guardaron las adiciones de dominios en el borrador del entorno. La compilación de Workers queda pendiente de resolver ese requisito.

El usuario indicó la rama Neon `dev-test`; aún faltan sus endpoints y los bindings `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` para validación autenticada. Nunca pedir sus valores secretos en el chat ni aplicar migraciones remotas como parte de esta fase.

## Preguntas abiertas

No hay decisiones de interfaz que impidan aprobar esta fase. Una futura edición de preferencias de negocio persistidas necesita requisitos propios; la pantalla de Configuraciones de esta fase muestra solamente información y accesos respaldados por funciones actuales.
