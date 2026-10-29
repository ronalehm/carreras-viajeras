# Portal del runner: `/mis-carreras` (reservas, pagos, itinerario y avisos)

- Módulo: bookings
- Estado: aprobado
- Depende de:
  - `platform-neon-foundation.md` (aprobada): Neon + Drizzle `neon-http` (`getDb()`, `db.batch` atómico), schema en `lib/db-schema.ts`, migraciones generadas con `npm run db:generate` y aplicadas a mano. "Runner solo accede a recursos propios."
  - `accounts-roles-permissions.md` (aprobada, implementada): `getCurrentUser` (sesión + correo verificado + roles por `user_id`), `requirePermission`, `can()`, `getCrmAccess(permission)`, `profiles`, errores `UnauthorizedError`/`ForbiddenError`. CRM denegado por defecto.
  - `accounts-auth-ui.md` (aprobada; F4 implementada): `AccessPanel audience="runner"`, `RunnerAccount`, `SignOutButton redirectTo="/cuenta"`, destinos cerrados. **La Fase 6 de esta spec requiere enmendarla** (ver "Cambios que requiere en otras specs").
  - `accounts-clerk-rbac.md` (aprobada, implementada en `main`): Clerk es el único proveedor de identidad; `getCurrentUser` lee `auth()` + `currentUser()` y los roles de Neon; `middleware.ts` con `clerkMiddleware()` y un `matcher` cerrado. Prevalece sobre toda mención a Neon Auth de esta spec (Decisión 24).
  - `trips-catalog.md` (aprobada; F1 y F2 en `main`): tabla `trips` (`id` UUID inmutable, nunca se borra), `getTripById`, `listTrips`, `formatTripDate`, `formatTripDateRange`, `formatTripPrice` (USD entero).
  - `landing-public-site.md` (aprobada; F1–F4 en `main`): `/cuenta`, `SiteHeader`/`SiteBrand`/`SiteFooter`, tokens de marca (`primary` #0144ae, `highlight` #7ac734), fuentes y patrones visuales.
  - `crm-leads-pipeline.md` (aprobada; F1 en `main`, F2 en PR #12): sin dependencia de datos; ver "Relación con leads".
- Base revisada: `main` en `c858e15`. PR abiertos revisados: #12 (captura F1 + `/crm/leads`) y #8 (spec `automation-outbox`).

## Objetivo
El runner que compró un paquete hoy no tiene dónde ver su viaje: todo llega por WhatsApp. Esta spec le da **una única página privada, `/mis-carreras`**, donde ingresa, elige su maratón y ve en una sola pantalla el estado de su reserva, el paquete contratado, sus pagos y saldo, la línea de tiempo de preparación e itinerario (documentación, vuelos, hotel, traslados, inscripción, actividades, día de carrera y retorno) y los avisos del equipo.

Para que eso tenga datos reales, el equipo (`admin` y `commercial`) gestiona desde el CRM las reservas, los pagos manuales confirmados, el itinerario y los avisos. No hay un CRM paralelo: son páginas nuevas dentro del CRM existente (`/crm/...`, layout protegido, `CrmShell`) con un permiso nuevo, `bookings.manage`.

Orden (el CRM de reservas no existe): **datos → CRM mínimo (reservas, pagos, itinerario) → portal → redirección tras el login.**

## Alcance
- Incluye:
  - (F1) Modelo de datos mínimo en Neon: `bookings`, `booking_payments`, `itinerary_items` y `trip_updates`, con sus enums, en una migración generada con `npm run db:generate` y aplicada a mano. Permiso `bookings.manage`. Lecturas server-only del runner con filtro por `user_id`, vínculo de la reserva a la cuenta por correo verificado y la lógica pura de la línea de tiempo, con tests. README.
  - (F2) CRM: reservas (`/crm/reservas`, `/crm/reservas/nueva`, `/crm/reservas/<id>`), con el enlace "Reservas" en la cabecera del CRM.
  - (F3) CRM: pagos manuales en la ficha de la reserva (registrar y anular).
  - (F4) CRM: itinerario por viaje y por reserva, y avisos del viaje (`/crm/viajes/<id>/itinerario`, `/crm/itinerario/<id>` y una sección en `/crm/reservas/<id>`).
  - (F5) `/mis-carreras`: página única, responsive y mobile-first, con la guarda en el servidor, el selector de carreras por `?reserva=<id>`, la línea de tiempo y todos los estados (vacío, una, varias, pendiente, parcial, confirmado, terminado, cancelado, sin verificar y error).
  - (F6) Tras ingresar o verificar como runner, el destino pasa de `/cuenta` a `/mis-carreras`; `/cuenta` con sesión muestra el enlace "Ver mis carreras". README.
  - Medición del tamaño del Worker al cerrar F2–F6.
- No incluye:
  - Otras páginas de gestión del runner (perfil, ajustes, detalle por ruta), dashboards o métricas.
  - Pasarela o registro de pagos por el runner, comprobantes, cuotas programadas, reembolsos, otra moneda que no sea USD e importes con centavos (Decisión 10).
  - Reservas con varios participantes: el acompañante tiene su propia reserva (Decisión 16).
  - Referidos, chat, muro social, comunidad avanzada, estrellas o recompensas.
  - Administración de eventos externos (inscripciones en la web del organizador, sincronización con aerolíneas u hoteles).
  - Notificaciones al runner (correo, WhatsApp o push) al publicar un aviso o cambiar un hito, y edición de avisos publicados (Decisión 21).
  - API HTTP para el portal (ni pública ni privada): las lecturas son funciones de servidor.
  - Vínculo reserva ↔ lead (`lead_id`), sincronizar la etapa del lead con la reserva y "crear reserva desde el lead" (Decisión 19).
  - Desvincular una cuenta de una reserva desde el CRM, o reasignarla a otro `user_id` (procedimiento manual por SQL, documentado en el README).
  - Ocultar un hito de nivel viaje para una sola reserva (Decisión 20).
  - Mostrar la hora de Lima junto a la del destino (Decisión 17).
  - Borrado físico de reservas o pagos (se cancelan o se anulan). Restaurar una reserva cancelada.
  - Paginación, búsqueda o exportación en las listas del CRM.
  - `loading.tsx`/`error.tsx` en `/mis-carreras`: el fallo de carga se resuelve en el servidor (Decisión 11).
  - Cambios en `/crm/acceso`, en los flujos del staff, en `requireCrmUser`/`getCrmAccess`, en la matriz de los permisos existentes o en las tablas `profiles`/`staff_*`/`trips`/`leads`.

## Requisitos
1. **Identidad del runner.** Es una cuenta de Clerk (registro en `/cuenta`, `accounts-clerk-rbac.md`). No se crea otro sistema de auth ni filas en `profiles`/`staff_*`. Su identidad estable es `user.id` (el `userId` de Clerk).
2. **Una reserva por participante.** Cada persona que viaja, incluido un acompañante, tiene su propia reserva con su propio correo; cada una se vincula a la cuenta de esa persona.
3. **Vínculo reserva ↔ cuenta (igual que las invitaciones del staff).**
   - El equipo crea la reserva con el **correo del participante** (`participant_email`, minúsculas).
   - En cada carga de `/mis-carreras` con **correo verificado**, una sola sentencia `UPDATE bookings SET runner_user_id = <user.id> WHERE participant_email = <correo verificado> AND runner_user_id IS NULL` vincula las reservas pendientes de vínculo.
   - Desde entonces la autorización usa **solo `runner_user_id`**; el correo no vuelve a usarse. Con el correo sin verificar no se vincula ni se lee nada.
   - `participant_email` solo se puede editar mientras la reserva no está vinculada.
4. **Guarda en el servidor de `/mis-carreras`** (reutiliza `getCurrentUser`, sin guardas nuevas en `lib/auth/`):
   - sin sesión → `redirect("/cuenta")`;
   - con sesión y correo sin verificar → estado "Verifica tu correo" (sin redirección, para no crear un bucle con `/cuenta`);
   - fallo de Clerk o de la base al resolver el usuario (`ForbiddenError` de `getCurrentUser`) o al leer las reservas → estado de error;
   - con sesión verificada → datos del runner.
5. **Lecturas del runner.** Funciones `server-only` con `runner_user_id = <user.id de la sesión>` en **cada** consulta (la lista y cada lectura de detalle). Nunca se devuelven: `participant_email`, `internal_note`, `created_by`, `recorded_by`, pagos anulados, hitos con `runner_visible = false`, datos de otras reservas ni de leads o staff.
6. **Selección de carrera por URL (`?reserva=<id>`).** El detalle se actualiza en la misma página con `<Link>`; el servidor valida el parámetro (UUID y perteneciente a las reservas del usuario). Un id ajeno, inexistente o mal formado se ignora: se muestra la reserva por defecto, sin revelar si existe (sin IDOR).
7. **Orden de las reservas y selección por defecto** (`today` = fecha de hoy en `America/Lima`):
   1. no canceladas y no terminadas, por fecha de carrera ascendente;
   2. terminadas (no canceladas), por fecha de carrera descendente;
   3. canceladas, por fecha de carrera descendente.

   La seleccionada por defecto es la primera. "Terminada" = `today > (trips.end_date ?? trips.race_date)`.
8. **Línea de tiempo (elemento principal).** Tres grupos, en este orden:
   - **"Antes de viajar"**: Reserva (derivado), Pagos (derivado), Documentación (`document`) e Inscripción (`registration`). Orden fijo por tipo; dentro de cada tipo, por fecha y hora (sin fecha al final) y título.
   - **"Tu viaje"**: hitos con fecha de tipo vuelo, traslado, hotel, actividad, día de carrera y retorno, en orden cronológico por `(fecha, hora — sin hora primero —, tipo, título)`.
   - **"Por programar"**: hitos de "Tu viaje" sin fecha, por tipo (vuelo, traslado, hotel, actividad, carrera, retorno) y título, con el texto "Fecha por confirmar".
   - **Estados:** `pending` Pendiente, `provisional` Provisional, `confirmed` Confirmado, `completed` Completado, `cancelled` Cancelado. Siempre como texto (`Badge`), no solo color.
   - **Sin datos inventados:** si falta fecha, hora o ubicación, no se muestra nada en su lugar salvo "Fecha por confirmar" en el grupo "Por programar". Solo se derivan hitos de datos reales:
     - Reserva: estado de `bookings.status` (`pending`→Pendiente, `confirmed`→Confirmado, `cancelled`→Cancelado) y fecha de alta (`created_at` en `America/Lima`).
     - Pagos: Completado si el saldo es ≤ 0; si no, Pendiente con "Pagado US$ X de US$ Y" y, si existe, la fecha límite del saldo.
     - Día de carrera: si no hay un hito visible de tipo `race`, se deriva de `trips.race_date` con ubicación "Ciudad, País" del catálogo; Completado si `today > race_date`, si no Confirmado. Un hito `race` visible lo sustituye.
   - **Zona horaria:** las horas se guardan y muestran como **hora local del lugar** del hito, con su zona IANA: "vie, 14 may 2027 · 06:55 hora de Santiago". No se convierte a la hora de Lima (Decisión 17). Las fechas sin hora no llevan zona.
9. **Pagos y saldo.** Importes en **USD enteros**, sin centavos, coherentes con `trips.price_usd` y formateados con `formatTripPrice` ("US$ 1,499"). Saldo = `total_usd − Σ pagos no anulados`, calculado al leer (no se guarda). Saldo < 0 se muestra como "Saldo a favor".
10. **CRM (F2–F4).** Cada página nueva comprueba `getCrmAccess("bookings.manage")` y cada Server Action `requirePermission("bookings.manage")`. `bookings.manage` lo tienen **`admin` y `commercial`** (matriz `["commercial"]`; admin tiene todos los permisos). El actor es siempre el `user.id` de la sesión. Las escrituras son atómicas y deciden por la condición de su `WHERE`, como en `trips` y `leads`.
11. **Privacidad.** Ningún dato personal ni mensaje original de la base llega a logs, `Error.message` ni respuestas de error. Los hitos de nivel viaje y los avisos los ven todos los participantes del viaje: el formulario del CRM lo advierte ("No incluyas datos de un participante concreto").
12. **Cuentas sin rol de staff** (runners) no obtienen ningún permiso del CRM: `can([], "bookings.manage") === false`, ven `NoCrmAccess` en `/crm/*` y las acciones devuelven `forbidden`. Vincular una reserva no crea filas en `profiles` ni `staff_*`.
13. **Coherencia visual con la landing:** cabecera con `SiteBrand`, pie `SiteFooter`, eyebrows en mayúsculas con tracking, el `h1` y el `h2` del viaje con la utilidad `display-title` de `app/globals.css` (Archivo condensada, la de la landing rediseñada; Decisión 23) y los `h2` de sección ("Avisos del viaje", "Tu línea de tiempo", "Tu paquete", "Pagos") como eyebrows, azul `primary` y acento `highlight`, selector con subrayado verde en la opción activa (patrón de `selector-horizontal.png` y de las pestañas de `cuenta.html`). Solo tokens del tema, sin hex.
14. **Tamaño del Worker:** se mide al cerrar F2–F6 sin desplegar; umbral de consulta 2 MiB (límite Free 3 MiB).

## Criterios de aceptación

### Fase 1 — Datos, permiso y lecturas del runner (sin UI)
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera **una sola** migración nueva (el siguiente número libre en la rama: `0003` sobre `c858e15`, o `0004` si se integró antes PR #12 u #8) con los enums `booking_status`, `itinerary_kind` e `itinerary_status`, las tablas `bookings`, `booking_payments`, `itinerary_items` y `trip_updates`, sus FK, CHECK e índices. Las columnas de importe (`total_usd`, `amount_usd`) son `integer`. El SQL no contiene `neon_auth`, `DROP`, `CREATE SCHEMA` ni cambios en tablas existentes, y `drizzle.config.ts` no cambia.
- [ ] (F1, manual del usuario en una rama de desarrollo de Neon) Con la migración aplicada, la base rechaza: email con mayúsculas; `total_usd` negativo o con decimales (`1499.5`); dos reservas no canceladas del mismo viaje y correo; pago con importe 0 o anulado sin `voided_by`; hito con hora sin fecha, con hora sin zona, con `end_date < start_date`, o con `booking_id` de una reserva de **otro** viaje (FK compuesta); aviso con título vacío; `trip_id` inexistente.
- [ ] (F1) Dado `can()`, entonces `admin` y `commercial` tienen `bookings.manage`, `[]` (runner) no, y los permisos existentes no cambian (unit test).
- [ ] (F1) Dado `loadRunnerPortal(userId, email, param, today)` con la base simulada (unit test):
  - el primer `db.batch` contiene el `UPDATE` de vínculo (`participant_email = $email AND runner_user_id IS NULL`) **antes** de la lista, y la lista filtra `runner_user_id = $userId`;
  - ninguna consulta selecciona `participant_email`, `internal_note`, `created_by` ni `recorded_by`;
  - sin reservas → `{ bookings: [], selected: null }` y no hay segundo batch;
  - `param` válido y presente en la lista → es la seleccionada; `param` mal formado, repetido (array) o ajeno → se selecciona la primera según el Requisito 7 (el resultado es idéntico al de no pasar `param`);
  - las lecturas de detalle incluyen la condición de propiedad (`bookings.runner_user_id = $userId`), excluyen pagos anulados (`voided_at IS NULL`) y hitos no visibles (`runner_visible`), y leen hitos `trip_id = <viaje> AND (booking_id IS NULL OR booking_id = <reserva>)`;
  - las horas se devuelven como `HH:MM` y los importes como enteros.
- [ ] (F1) Dadas las utilidades puras (unit test):
  - `orderRunnerBookings` cumple el Requisito 7, incluido el caso de `end_date` nula (usa `race_date`);
  - `getPaymentSummary`: saldo 0 → `completed`; parcial → `pending` con `dueOn`; pagos por encima del total → saldo negativo y `completed`; total 0 sin pagos → `completed`;
  - `buildTimeline`: los grupos, el orden y "Por programar" del Requisito 8; la carrera derivada (Confirmado antes, Completado después de la fecha) y su sustitución por un hito `race`; la reserva derivada con su estado; el texto de pagos con `formatTripPrice` ("Pagado US$ 300 de US$ 1,499"); `itineraryConfirmed` según la Decisión 9;
  - `limaDate(new Date("2026-10-19T03:00:00Z"))` → `"2026-10-18"` con cualquier `TZ` del proceso; `formatShortDate("2027-05-16")` → `"dom, 16 may 2027"`; `timeZoneLabel("America/Argentina/Buenos_Aires")` → `"hora de Buenos Aires"`; `formatScheduleEdge` con y sin hora.
- [ ] (F1) Dado `README.md`, entonces documenta la revisión y aplicación manual de la migración (después de las anteriores, entre `BEGIN;`/`COMMIT;`, sin GRANT) y las pruebas manuales de F1.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. F1 no añade rutas.

### Fase 2 — CRM: reservas
- [ ] (F2) Dado un `admin` o un `commercial` verificado, entonces la cabecera de `CrmShell` muestra "Reservas" (→ `/crm/reservas`) y puede abrir las tres páginas. Una cuenta sin rol de staff ve `NoCrmAccess`; sin sesión, redirección a `/crm/acceso`. Si en el futuro un rol del CRM no tiene `bookings.manage`, la página muestra el `h1` y "No tienes permiso para gestionar reservas. Si lo necesitas, pídeselo a un administrador." (rama `forbidden`, cubierta por el test de `getCrmAccess`).
- [ ] (F2) Dado `/crm/reservas`, entonces veo "Reservas", el enlace "Nueva reserva", un filtro "Viaje" (`<form method="get">`, `?viaje=<id>`) y una tabla con Participante (nombre y correo), Viaje, Paquete, Estado (`Badge`), Total, Pagado, Saldo y Cuenta ("Vinculada" o "Sin vincular"). Sin reservas: "Aún no hay reservas. Crea la primera con «Nueva reserva»."; con filtro sin resultados: "Ningún resultado para ese viaje.".
- [ ] (F2) Dado `/crm/reservas/nueva` con viaje no archivado, nombre, correo `  Ana@Example.com `, paquete y total `1499`, cuando pulso "Crear reserva", entonces llego a `/crm/reservas/<id>` con la reserva "Pendiente de confirmación", correo `ana@example.com` y cuenta "Sin vincular". El selector de viaje no ofrece viajes archivados.
- [ ] (F2) Dado un correo que ya tiene una reserva no cancelada en ese viaje, cuando creo otra, entonces veo "Ese correo ya tiene una reserva activa en este viaje." bajo el correo y se conserva lo escrito. Con un total con decimales (`1499.50`), negativo o no numérico, veo "Indica el total en dólares, sin decimales." bajo el campo.
- [ ] (F2) Dado un acompañante, cuando el equipo lo registra, entonces se crea una reserva aparte con su propio correo; el formulario no ofrece añadir participantes a una reserva existente.
- [ ] (F2) Dada una reserva vinculada, cuando la edito, entonces el correo es de solo lectura con "La cuenta ya está vinculada; el correo no se puede cambiar." y la acción rechaza un cambio de correo (`email_locked`). El viaje no se puede cambiar después de crear la reserva.
- [ ] (F2) Dada una reserva pendiente, cuando pulso "Confirmar reserva" y confirmo, entonces pasa a "Confirmada". "Cancelar reserva" (pendiente o confirmada) la deja "Cancelada" y en solo lectura, sin formularios. Una transición no permitida devuelve "La reserva ya no está en ese estado. Recarga la página.".
- [ ] (F2) Dada una reserva no cancelada de un viaje archivado, entonces la ficha muestra "Viaje archivado: la reserva solo se puede cancelar.", los datos en solo lectura (como una cancelada) y solo "Cancelar reserva". Editarla o confirmarla llamando a la acción directamente devuelve "El viaje está archivado: la reserva solo se puede cancelar. Recarga la página." (`trip_archived`); cancelarla sigue permitido (Decisión 22).
- [ ] (F2) Dadas las Server Actions de reservas llamadas directamente (unit test): sin sesión → `unauthorized`; cuenta sin rol de staff → `forbidden` sin llamar al service; `commercial` y `admin` → éxito; campos extra (`runnerUserId`, `status`, `createdBy`) se ignoran; el actor es el de la sesión; si el service lanza, la acción lanza `"booking action failed"` sin el mensaje original ni `console.*`.
- [ ] (F2) Medición del Worker (`npm run build:worker` + `npx wrangler deploy --dry-run --outdir <scratch>`, en Linux/WSL, sin desplegar) registrada frente a la última referencia (1411 KiB en `main`; 1450 KiB si PR #12 ya está integrado) y < 2 MiB. Lint, vitest y build sin errores.

### Fase 3 — CRM: pagos
- [ ] (F3) Dada una reserva no cancelada, cuando registro un pago (importe entero ≥ 1, fecha y concepto), entonces aparece en "Pagos" de `/crm/reservas/<id>` con la fecha, el concepto, el importe (`formatTripPrice`) y el correo de quien lo registró, y Pagado/Saldo se actualizan en la ficha y en `/crm/reservas`.
- [ ] (F3) Dado un importe `0`, `300.50`, negativo o vacío, cuando registro el pago, entonces veo "Indica el importe en dólares, sin decimales." bajo el campo, no se crea nada y se conserva lo escrito.
- [ ] (F3) Dado "Anular" en un pago, cuando confirmo, entonces el pago queda "Anulado" y deja de sumar. Un pago ya anulado no se puede anular otra vez (`not_found`). En una reserva cancelada no hay formulario de pago ni "Anular", y la acción devuelve `not_found`.
- [ ] (F3) Dadas las acciones de pagos llamadas directamente (unit test): las mismas garantías de autorización, campos extra (`recordedBy`, `voidedBy`) y errores que en F2.
- [ ] (F3) Medición del Worker como en F2. Lint, vitest y build sin errores.

### Fase 4 — CRM: itinerario y avisos
- [ ] (F4) Dado `/crm/reservas?viaje=<id>`, entonces aparece el enlace "Itinerario y avisos del viaje" → `/crm/viajes/<id>/itinerario`. Dado `/crm/viajes/<uuid inexistente>/itinerario` o un id no UUID, entonces 404.
- [ ] (F4) Dado `/crm/viajes/<id>/itinerario`, entonces veo "Itinerario y avisos", el título del viaje, la tabla "Hitos del viaje (todos los participantes)" con Tipo, Título, Estado, Inicio, Fin, Visible y Acciones ("Editar", "Eliminar"), el formulario "Añadir hito" y la sección "Avisos" con el formulario "Publicar aviso" y la lista de avisos (más reciente primero) con "Eliminar".
- [ ] (F4) Dado `/crm/reservas/<id>`, entonces aparece la sección "Servicios de esta reserva" (hitos solo de esa reserva) con su tabla, "Añadir hito" y el enlace "Ver itinerario del viaje". En una reserva cancelada la sección es de solo lectura.
- [ ] (F4) Dado "Añadir hito" con tipo Vuelo, título, estado Confirmado, salida 2027-05-14 01:30 `America/Lima` y llegada 2027-05-14 06:55 `America/Santiago`, cuando lo guardo, entonces aparece en la tabla. Con hora sin fecha, hora sin zona, zona inválida (`Mars/Base`) o fin anterior al inicio, veo el error bajo el campo y se conserva lo escrito. "Visible para el corredor" viene marcado por defecto.
- [ ] (F4) Dado "Editar" en un hito, cuando cambio su estado a Completado y guardo en `/crm/itinerario/<id>`, entonces vuelvo a la página de origen (itinerario del viaje o ficha de la reserva) con el cambio. "Eliminar" pide confirmación y lo borra.
- [ ] (F4) Dado "Publicar aviso" con título y mensaje, entonces aparece primero en la lista; sin título o con un mensaje de más de 2000 caracteres, error bajo el campo. Los avisos publicados no se editan: se eliminan y se vuelven a publicar.
- [ ] (F4) Dadas las acciones de itinerario y avisos (unit test): las mismas garantías de autorización, campos extra y errores que en F2; un hito de reserva siempre toma el `trip_id` de su reserva en el servidor (un `tripId` enviado por el formulario se ignora).
- [ ] (F4) Medición del Worker como en F2. Lint, vitest y build sin errores.

### Fase 5 — `/mis-carreras`
Acceso:
- [ ] (F5) Dado un visitante sin sesión, cuando abre `/mis-carreras` (también con `?reserva=<id>`), entonces se le redirige a `/cuenta`.
- [ ] (F5) Dada una sesión con el correo sin verificar, entonces ve "Verifica tu correo para ver tus carreras." y "Cierra sesión y vuelve a ingresar: te enviaremos un código." con "Cerrar sesión" (→ `/cuenta`), sin reservas ni consulta de reservas (unit test de `getRunnerPortal`).
- [ ] (F5) Dada una cuenta de staff o de runner, cuando abre `/mis-carreras`, entonces solo ve las reservas vinculadas a su `user_id`; no cambia ningún acceso del CRM y no se crean filas en `profiles` ni `staff_*`.
- [ ] (F5) Dados el runner A (reserva X) y el runner B (reserva Y), cuando A abre `/mis-carreras?reserva=<Y>`, entonces ve la reserva X, igual que en `/mis-carreras`, y ningún dato de Y (unit test del service + prueba manual).
- [ ] (F5) Dado `middleware.ts`, su `matcher` incluye `/mis-carreras`; con sesión de Clerk el portal carga en lugar de redirigir a `/cuenta`, y el saludo usa `firstName`/`lastName` de Clerk (unit test de `getCurrentUser` + prueba manual) (Decisión 24).

Estados:
- [ ] (F5) **Sin carreras:** veo "Hola, <nombre>." (o "Mis carreras" si la sesión no trae nombre), y un `Empty` con "Aún no tienes carreras registradas.", "Cuando el equipo registre tu reserva con <correo>, la verás aquí.", el enlace "Explorar experiencias" → `/#destinos` y "Escríbenos por WhatsApp" (`wa.me/51938127170`, otra pestaña).
- [ ] (F5) **Una carrera:** no hay selector; se ve el detalle directamente.
- [ ] (F5) **Varias:** veo `<nav aria-label="Tus carreras">` con un enlace por reserva (título, fecha corta de carrera y, si aplica, "Pendiente", "Terminado" o "Cancelada"), en el orden del Requisito 7; la activa tiene `aria-current="page"` y subrayado `highlight`. Al pulsar otra, la URL pasa a `?reserva=<id>`, el detalle cambia sin recargar la página completa y "Atrás" vuelve a la anterior.
- [ ] (F5) **Reserva pendiente de confirmación:** `Badge` "Pendiente de confirmación" y un `Alert` "Tu reserva está pendiente de confirmación. Te avisaremos cuando el equipo la confirme; los datos pueden cambiar.". El hito Reserva muestra "Pendiente".
- [ ] (F5) **Viaje parcialmente configurado:** sobre la línea de tiempo aparece "Estamos preparando tu itinerario. Los hitos pendientes se completarán cuando se confirmen."; los hitos sin fecha aparecen en "Por programar" con "Fecha por confirmar"; un hito sin ubicación no muestra ubicación.
- [ ] (F5) **Itinerario confirmado:** "Tu viaje" muestra el `Badge` "Itinerario confirmado" y no aparece el aviso de preparación.
- [ ] (F5) **Viaje terminado:** `Badge` "Viaje terminado", el texto "Gracias por correr con nosotros." y el enlace "Explorar próximas experiencias" → `/#destinos`; la línea de tiempo, el paquete y los pagos siguen visibles; no aparece el aviso de preparación.
- [ ] (F5) **Reserva cancelada:** `Badge` "Cancelada" y "Esta reserva fue cancelada. Si tienes dudas, escríbenos por WhatsApp."; no se muestran la línea de tiempo ni los avisos.
- [ ] (F5) **Error al cargar:** con la base caída, veo la cabecera con "Cerrar sesión", el `h1` "Mis carreras" y un `Alert` destructivo "No pudimos cargar tus carreras. Inténtalo de nuevo en unos minutos." con el enlace "Reintentar" → `/mis-carreras`. La respuesta no contiene el mensaje original y el log solo el texto fijo `runner-portal: load failed` (unit test).

Contenido:
- [ ] (F5) Dada una reserva confirmada, entonces veo el título del viaje (`h2`), "Ciudad, País", "Carrera: <formatTripDate>", "Viaje: <formatTripDateRange>" (solo si hay fechas de viaje), "Tu paquete" (etiqueta, distancia si existe y `<details>` "Qué incluye (n)" con `trips.includes`, omitido si está vacío), "Pagos" (Total acordado, Pagado, Saldo pendiente o "Pagado por completo" o "Saldo a favor", todos con `formatTripPrice`; Fecha límite si existe y `<details>` "Pagos confirmados (n)" con fecha, concepto e importe) y "Avisos del viaje" (el más reciente completo y el resto en `<details>` "Avisos anteriores (n)"; sin avisos: "Sin avisos por ahora.").
- [ ] (F5) Dado un hito vuelo con salida en `America/Lima` y llegada en `America/Santiago`, entonces muestra "Sale vie, 14 may 2027 · 01:30 hora de Lima" y "Llega vie, 14 may 2027 · 06:55 hora de Santiago", sin equivalencia en hora de Lima. Un hotel muestra "Entrada"/"Salida"; el resto, "Inicio"/"Fin".
- [ ] (F5) Dados un hito no visible, un pago anulado o una nota interna en el CRM, entonces no aparecen en el HTML de `/mis-carreras`.
- [ ] (F5) Dado un viewport de 360 px, entonces no hay scroll horizontal de la página (el selector desplaza solo su propia fila) y el orden es: cabecera, saludo, selector, viaje y estado, avisos, línea de tiempo, paquete, pagos y contacto. Desde 1024 px, la línea de tiempo ocupa la columna principal y avisos, paquete, pagos y contacto la columna lateral.
- [ ] (F5) Dado el HTML, entonces hay un único `h1`, `<title>` "Mis carreras | Carreras Viajeras" y `robots` `noindex, nofollow`. Dado el árbol de componentes, entonces no hay ningún `"use client"` nuevo (el único componente de cliente es `SignOutButton`, existente).
- [ ] (F5) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores, `/mis-carreras` aparece como dinámica (`ƒ`) y `/cuenta` sigue estática (`○`). Medición del Worker como en F2. Lint y vitest sin errores.
- [ ] (F5) Dado el portal, entonces el `h1` y el `h2` del viaje usan `display-title` (como la landing) y los `h2` de sección siguen como eyebrows en mayúsculas (wireframes); los títulos de grupo de la línea de tiempo y el número del selector ("01/02") tienen contraste AA (texto `primary`; el acento `highlight` solo en borde, punto o subrayado activo), un correo largo en el estado vacío no provoca scroll horizontal a 360 px, y hay un solo enlace de WhatsApp reutilizado (también en la reserva cancelada) (Decisión 23).

### Fase 6 — Redirección del runner tras ingresar
Requisito previo: enmiendas de `accounts-auth-ui.md` y `landing-public-site.md` aprobadas (ver "Cambios que requiere en otras specs").
- [ ] (F6) Dado `<AccessPanel audience="runner" />`, cuando el login o la verificación con sesión tienen éxito, entonces se llama a `router.replace("/mis-carreras")` y `router.refresh()` (unit test). Con `<AccessPanel />` (staff) sigue siendo `/crm` y los tests de staff pasan sin cambios.
- [ ] (F6) Dado `AuthDestination`, entonces es `"/crm" | "/mis-carreras"`; `SignOutDestination` no cambia (`"/crm/acceso" | "/cuenta"`). Ningún componente lee `searchParams`, `location` ni `?next=`.
- [ ] (F6) Dado `RunnerAccount` con sesión, entonces muestra "Qué bueno verte de nuevo.", el correo, el enlace "Ver mis carreras" → `/mis-carreras` y "Cerrar sesión" (unit test). `/cuenta` no redirige, sigue sin llamar a guardas ni a la base y sigue estática.
- [ ] (F6) Dado `README.md`, entonces el modelo de acceso describe el portal (`/mis-carreras`, vínculo por correo verificado, una reserva por participante, solo lectura) y el checklist manual de esta spec.
- [ ] (F6) Medición del Worker como en F2. Lint, vitest y build sin errores.

### Manual en producción (el usuario, con su autorización; los agentes no acceden a Neon)
- [ ] Migración aplicada en `production` tras las anteriores; `neon_auth` sin cambios (`pg_dump --schema-only --schema=neon_auth` idéntico antes y después).
- [ ] Un `commercial` crea una reserva para un correo nuevo → la persona se registra en `/cuenta` con ese correo y verifica el código → llega a `/mis-carreras` y ve su reserva "Pendiente de confirmación"; en el CRM la cuenta pasa a "Vinculada".
- [ ] El equipo confirma la reserva, registra un pago, añade un vuelo con zonas distintas y un aviso → el runner los ve al recargar, con la hora local de cada lugar.
- [ ] Una reserva de acompañante con otro correo solo la ve la cuenta de ese correo, no la del titular.
- [ ] Una segunda cuenta verificada abre `/mis-carreras?reserva=<id de la primera>` → no ve esa reserva. Al abrir `/crm` ve "sin acceso" y `GET /api/crm/me` responde 403.
- [ ] "Cerrar sesión" en `/mis-carreras` lleva a `/cuenta` sin sesión; el login de admin en `/crm/acceso` sigue llevando a `/crm`.

## Diseño técnico

### Decisiones
1. **Un módulo de dominio, `modules/bookings`.** El dominio es la reserva; el portal y el CRM son dos vistas del mismo dato. Un módulo `runner-portal` aparte solo reexportaría `bookings` (SETUP §1, regla 1). Las páginas de `app/` componen `@/modules/bookings` con `@/modules/accounts` (`getCrmAccess`, `SignOutButton`) y `@/modules/landing` (`SiteBrand`, `SiteFooter`).
2. **Selección por `?reserva=<id>` en un Server Component, no estado de cliente.**
   - Enlace directo y botón "Atrás" funcionan; la URL identifica la carrera vista.
   - Cero JavaScript para seleccionar: el selector son `<Link>` (el `scroll` por defecto de Next 16 mantiene la posición si la página es visible). El estado de cliente obligaría a precargar el detalle de todas las reservas o a crear una API.
   - El servidor vuelve a validar la propiedad en cada petición (Requisito 6). La página ya es dinámica por la sesión, así que no hay coste de caché perdido.
3. **Vínculo por correo verificado, como `staff_invitations`.** Es la única forma segura de que el runner vea "sus" carreras sin que el staff conozca su `user_id`. El `UPDATE … WHERE runner_user_id IS NULL` es idempotente y sin carreras (bloqueo de fila); se ejecuta en el mismo `db.batch` (una transacción) que la lista, que ya ve las filas recién vinculadas. Riesgo aceptado: si el equipo escribe mal el correo y ese correo existe y está verificado, esa persona vería la reserva. Mitigación: la columna "Cuenta" del CRM y el correo bloqueado tras vincular; la corrección es manual por SQL (README).
4. **`/cuenta` con sesión sigue mostrando el panel, con "Ver mis carreras"** (valor por defecto confirmado). No se redirige a `/mis-carreras` desde `/cuenta`:
   - `/cuenta` sigue estática (`○`): sin leer la sesión ni consultar Neon en cada visita (CPU de Workers Free);
   - no hay bucles: `/mis-carreras` manda a `/cuenta` a quien no tiene sesión, y una sesión sin verificar se queda en `/mis-carreras` con su estado propio;
   - el staff que usa `/cuenta` no queda forzado al portal.
   El destino **tras ingresar o verificar** sí pasa a `/mis-carreras` (F6).
5. **El nombre del corredor sale de la sesión.** `getCurrentUser` añade `name?: string` (nombre y apellido de Clerk, recortados, omitido si queda vacío; sin límite en el schema para no invalidar sesiones). Es opcional para no romper fixtures ni el contrato de `CurrentUser`; no participa en la autorización. Se muestra el primer nombre ("Hola, Ana.").
6. **Tablas y YAGNI:**
   | Tabla | Por qué existe | Qué se descartó |
   |---|---|---|
   | `bookings` | Una reserva = un participante en un viaje (Decisión 16): estado, paquete, total, vínculo a la cuenta. Sin ella no hay "mis carreras" | Tabla `participants` aparte; `completed` como estado guardado (se deriva de las fechas); FK a `leads` (Decisión 19) |
   | `booking_payments` | El runner ve pagos confirmados con fecha y concepto, y el saldo debe ser auditable | Una columna `paid_usd` (sin historial ni anulación); pagos pendientes o cuotas programadas; método de pago |
   | `itinerary_items` | Vuelos, hotel, traslados, inscripción, documentación, actividades, carrera y retorno con estado, fechas, ubicación y visibilidad. `booking_id` nulo = hito de todo el viaje (un vuelo grupal se carga una vez para 100 cupos) | Una tabla por tipo de servicio; proveedores, costes y localizadores estructurados (van en `details`) |
   | `trip_updates` | Avisos del equipo a todos los participantes de un viaje | Avisos por reserva; edición e historial (Decisión 21) |
7. **Horas locales (wall-clock) + zona IANA por extremo.** `start_date`/`start_time`/`start_time_zone` y `end_*`. Un vuelo Lima → Santiago necesita una zona para la salida y otra para la llegada. Se muestra la hora tal como se guardó, con "hora de <ciudad>" derivado de la zona (último segmento, `_` → espacio): sin conversiones ni dependencias, y sin desfases por horario de verano. Las fechas sin hora no llevan zona. La zona se valida en el servidor con `Intl.DateTimeFormat` (Workers lo soporta) y el formulario sugiere zonas con `<datalist>` nativo.
   - `ponytail:` el orden de "Tu viaje" compara fecha y hora locales; dos hitos del mismo día en zonas distintas pueden quedar en orden distinto al real. Si molesta, ordenar por `(fecha + hora) AT TIME ZONE zona` en SQL.
8. **Hitos de viaje vs. de reserva.** El runner ve la unión de los hitos de su viaje (`booking_id IS NULL`) y los de su reserva. Una FK compuesta `(booking_id, trip_id) → bookings(id, trip_id)` garantiza en la base que un hito de reserva pertenece al mismo viaje.
9. **"Itinerario confirmado"** = "Por programar" vacío, todos los hitos de "Tu viaje" en Confirmado, Completado o Cancelado, y al menos un hito que no sea la carrera derivada del catálogo. En otro caso (reserva no cancelada ni terminada) se muestra el aviso de preparación.
10. **Montos en USD enteros, sin centavos (decisión del usuario).** `bookings.total_usd` y `booking_payments.amount_usd` son `integer` (CHECK `>= 0` y `> 0`), como `trips.price_usd`. Los schemas zod solo aceptan `/^\d+$/` ("sin decimales") y todos los importes se muestran con `formatTripPrice` de `@/modules/trips`. No hay columna de moneda.
11. **Errores resueltos en el servidor, sin `error.tsx`.** `getRunnerPortal` convierte el fallo de lectura en un estado `error` que se pinta con `Alert` en un Server Component, con la cabecera y "Cerrar sesión" disponibles. Un `error.tsx` exige un componente de cliente y perdería la cabecera. `await connection()` va antes del `try` (como `getCrmAccess`) y `redirect()` fuera de él.
12. **Rondas a Neon por carga:** `getCurrentUser` (1 batch, existente) + vínculo y lista (1 batch) + detalle (1 batch: pagos, hitos y avisos). El detalle depende de la reserva elegida, que depende de la lista; unirlos en SQL complicaría la consulta sin ganancia real (la E/S no cuenta como CPU en Workers).
13. **`bookings.manage` para `admin` y `commercial` (decisión del usuario).** Matriz `"bookings.manage": ["commercial"]`; `admin` lo tiene por la regla general. Así el equipo comercial que cierra la venta registra la reserva y los pagos. Las cuentas sin rol (`[]`) siguen sin acceso.
14. **Reservas canceladas: finales y en solo lectura**, como los viajes archivados. Una reserva no se borra; una nueva para el mismo correo y viaje es posible tras cancelar (índice único parcial).
15. **Componentes de shadcn:** `empty` (estado vacío) y `alert` (avisos de estado y error), ambos del estilo `base-nova`, solo con `cn` + `class-variance-authority` (instalados) y aptos para Server Components. Descartados: `tabs` (estado de cliente; el selector es navegación), `skeleton`/`progress` (sin `loading.tsx` ni porcentajes), un componente de timeline (no existe en `@shadcn`; se compone con `<ol>` y `Badge`).
16. **Una reserva por participante, también para el acompañante (decisión del usuario).** Cada persona tiene su propia reserva, su propio correo y su propio vínculo de cuenta; el titular no ve las reservas de sus acompañantes. El paquete se distingue con `package_label` (p. ej. "Paquete acompañante"). No hay tabla de participantes ni reservas de grupo.

Decisiones por defecto (antes preguntas no bloqueantes; el usuario aceptó el valor propuesto):

17. **Sin hora de Lima.** Solo la hora local del lugar con su zona; no se convierten zonas.
18. **`/cuenta` con enlace, sin redirección** (Decisión 4).
19. **`lead_id` en una fase futura.** Esta spec no vincula reservas con leads (ver "Relación con leads").
20. **Un hito de viaje no se oculta por participante.** Lo ven todos los participantes del viaje; lo individual va como hito de reserva.
21. **Avisos sin edición ni notificación.** Se publican y se eliminan; no se envía nada al runner.

Enmienda tras la revisión de F2:

22. **Un viaje archivado congela sus reservas.** Sus reservas no se editan ni se confirman; solo se pueden cancelar (para cerrar una venta caída). Se garantiza en el `WHERE` de cada escritura, como la Decisión 14. Pagos, hitos y avisos de un viaje archivado no cambian en esta spec.

Enmienda tras la revisión de F5:

23. **Títulos del portal con `display-title`.** El rediseño de la portada (`landing-home-redesign`) retiró Barlow Condensed: `--font-heading` es ahora la sans y la landing titula con `display-title`. El portal la sigue para mantener la coherencia del Requisito 13.

Enmienda tras la migración a Clerk (`accounts-clerk-rbac.md`, en `main`):

24. **El portal usa la identidad de Clerk.** `user.id` es el `userId` de Clerk y `runner_user_id` guarda ese id. El nombre del saludo (Decisión 5) sale de `firstName` y `lastName` del usuario de Clerk; si la instancia no los pide, el saludo queda en "Mis carreras". `/mis-carreras` entra en el `matcher` de `middleware.ts` (regla D3 de `accounts-clerk-rbac.md`): fuera de él, `auth()` lanza, la guarda ve "sin sesión" y el portal redirigiría siempre a `/cuenta`. El correo sin verificar sigue en el estado "Verifica tu correo", aunque Clerk verifica al registrarse y casi nunca se alcanza.

### Modelo de datos: `lib/db-schema.ts` (F1)
Todo en `public`, snake_case, sin FK hacia `neon_auth`. `updated_at` lo fija el service con `now()` en cada `UPDATE`. Las FK son `ON DELETE RESTRICT`.

| Objeto | Definición |
|---|---|
| enum `booking_status` | `pending`, `confirmed`, `cancelled` |
| enum `itinerary_kind` | `document`, `registration`, `flight`, `transfer`, `hotel`, `activity`, `race`, `return` |
| enum `itinerary_status` | `pending`, `provisional`, `confirmed`, `completed`, `cancelled` |
| `bookings.id` | `uuid` PK `defaultRandom()` |
| `bookings.trip_id` | `uuid not null` → `trips.id` |
| `bookings.participant_name` | `text not null`; CHECK `char_length BETWEEN 2 AND 120` |
| `bookings.participant_email` | `text not null`; CHECK `= lower(participant_email) AND char_length <= 254` |
| `bookings.runner_user_id` | `text` nulo (`userId` de Clerk, sin FK); NULL = sin vincular |
| `bookings.status` | `booking_status not null default 'pending'` |
| `bookings.package_label` | `text not null`; CHECK 1–80 (p. ej. "Paquete corredor", "Paquete acompañante") |
| `bookings.distance` | `text` nulo; CHECK ≤ 20 (p. ej. "42K") |
| `bookings.total_usd` | `integer not null`; CHECK `>= 0` (USD enteros) |
| `bookings.balance_due_on` | `date` nulo (modo string): fecha límite del saldo |
| `bookings.internal_note` | `text` nulo; CHECK ≤ 2000. **Nunca la lee el runner** |
| `bookings.created_by` | `text not null` → `profiles.user_id` |
| `bookings.created_at`, `updated_at` | `timestamptz not null default now()` |
| restricciones de `bookings` | `unique bookings_id_trip_uq (id, trip_id)` (destino de la FK compuesta); índice único parcial `bookings_trip_email_active_uq (trip_id, participant_email) WHERE status <> 'cancelled'`; índice `bookings_runner_user_idx (runner_user_id)`; índice parcial `bookings_unlinked_email_idx (participant_email) WHERE runner_user_id IS NULL` |
| `booking_payments.id` | `uuid` PK |
| `booking_payments.booking_id` | `uuid not null` → `bookings.id`; índice `booking_payments_booking_idx` |
| `booking_payments.amount_usd` | `integer not null`; CHECK `> 0` (USD enteros) |
| `booking_payments.paid_on` | `date not null` (modo string) |
| `booking_payments.concept` | `text not null`; CHECK 1–80 (p. ej. "Reserva", "Cuota 2") |
| `booking_payments.recorded_by` | `text not null` → `profiles.user_id` |
| `booking_payments.created_at` | `timestamptz not null default now()` |
| `booking_payments.voided_at` / `voided_by` | `timestamptz` / `text` → `profiles.user_id`; CHECK `(voided_at IS NULL) = (voided_by IS NULL)` |
| `itinerary_items.id` | `uuid` PK |
| `itinerary_items.trip_id` | `uuid not null` → `trips.id`; índice `itinerary_items_trip_idx` |
| `itinerary_items.booking_id` | `uuid` nulo; FK compuesta `itinerary_items_booking_trip_fk (booking_id, trip_id) → bookings (id, trip_id)` (MATCH SIMPLE: con `booking_id` nulo no se comprueba); índice `itinerary_items_booking_idx` |
| `itinerary_items.kind` | `itinerary_kind not null` |
| `itinerary_items.status` | `itinerary_status not null default 'pending'` |
| `itinerary_items.title` | `text not null`; CHECK 1–120 |
| `itinerary_items.details` | `text` nulo; CHECK ≤ 1000 (visible para el runner) |
| `itinerary_items.location` | `text` nulo; CHECK ≤ 160 |
| `itinerary_items.start_date`, `end_date` | `date` nulos (modo string) |
| `itinerary_items.start_time`, `end_time` | `time` nulos (hora local del lugar) |
| `itinerary_items.start_time_zone`, `end_time_zone` | `text` nulos; CHECK `~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length <= 64` |
| CHECK `itinerary_items_schedule_chk` | `(start_time IS NULL OR start_date IS NOT NULL) AND (end_time IS NULL OR end_date IS NOT NULL) AND (start_time IS NULL) = (start_time_zone IS NULL) AND (end_time IS NULL) = (end_time_zone IS NULL) AND (end_date IS NULL OR (start_date IS NOT NULL AND end_date >= start_date))` |
| `itinerary_items.runner_visible` | `boolean not null default true` |
| `itinerary_items.created_at`, `updated_at` | `timestamptz not null default now()` |
| `trip_updates.id` | `uuid` PK |
| `trip_updates.trip_id` | `uuid not null` → `trips.id` |
| `trip_updates.title` | `text not null`; CHECK 3–120 |
| `trip_updates.body` | `text not null`; CHECK 1–2000 |
| `trip_updates.created_by` | `text not null` → `profiles.user_id` |
| `trip_updates.published_at` | `timestamptz not null default now()`; índice `trip_updates_trip_published_idx (trip_id, published_at)` |

El developer puede reescribir los CHECK de forma equivalente; el criterio manual de F1 valida el comportamiento. Migración: `npm run db:generate` → `drizzle/000N_<nombre>.sql`, su snapshot y `_journal.json`. Si otra rama integra antes una migración (PR #12 y PR #8 generan cada una su `0003`), se regenera sobre ella; nunca se edita una migración ya aplicada.

### Visibilidad para el runner
| Dato | Runner | CRM (`bookings.manage`: admin y commercial) |
|---|---|---|
| Sus reservas (`runner_user_id` = su id): estado, paquete, distancia, total, fecha límite, fecha de alta | Sí | Sí |
| `participant_name`, `participant_email` | No (no hace falta: usa los de su sesión) | Sí |
| Reservas de sus acompañantes | No (cada una se vincula a la cuenta de su correo) | Sí |
| `internal_note`, `created_by`, `recorded_by`, `voided_by` | No | Sí |
| Pagos no anulados: fecha, concepto, importe | Sí | Sí, también anulados |
| Hitos del viaje y de su reserva con `runner_visible = true` | Sí | Sí, todos |
| Avisos de su viaje | Sí (incluso si el viaje está archivado) | Sí |
| Datos del viaje: título, ciudad, país, fechas, `includes` (aunque el viaje esté en borrador o archivado) | Sí | Sí |
| Reservas, pagos o hitos de otros participantes; leads; staff | No | Sí (reservas); leads según `leads.manage` |

### Permisos: `lib/auth/permissions.ts` (F1)
```ts
export type Permission = "crm.access" | "staff.manage" | "trips.manage" | "leads.manage" | "bookings.manage";
// PERMISSION_MATRIX: "bookings.manage": ["commercial"]  — admin pasa siempre; [] (runner) → false
```

### `lib/auth/guards.ts` (F5, cambio mínimo)
`clerkUserSchema` añade `firstName` y `lastName` (`z.string().nullable().optional().catch(null)`: un valor ausente o con otra forma nunca invalida la sesión). `CurrentUser` añade `name?: string` = `firstName` y `lastName` recortados y unidos por un espacio, omitido si queda vacío. Nada más cambia (roles, invitaciones, errores). `toEqual` de los tests existentes ignora la propiedad ausente.

### `middleware.ts` (F5)
El `matcher` añade `"/mis-carreras"` a `["/crm/:path*", "/api/crm/:path*"]`. Nada más cambia. `/cuenta` sigue fuera (estática).

### Rutas (`app/`)
| Ruta | Fase | Contenido |
|---|---|---|
| `app/crm/(protected)/reservas/page.tsx` | F2 (mod. F4) | `getCrmAccess("bookings.manage")`; `unauthenticated` → `redirect("/crm/acceso")`; `forbidden` → `h1` "Reservas" + texto sin permiso. `?viaje` con `z.uuid().catch(undefined)`. Compone `h1`, enlace "Nueva reserva", `BookingFilters` y `BookingTable`. F4 añade el enlace "Itinerario y avisos del viaje" si hay filtro. `metadata.title = "Reservas"` |
| `app/crm/(protected)/reservas/nueva/page.tsx` | F2 | Misma guarda. `listTrips()` de `@/modules/trips` filtrado a no archivados → `<BookingForm tripOptions />`. `metadata.title = "Nueva reserva"` |
| `app/crm/(protected)/reservas/[id]/page.tsx` | F2 (mod. F3, F4) | Misma guarda. `getBookingById(id)`; `null` (incluye id no UUID) → `notFound()`. F2 compone `h1` (participante) + `Badge` de estado, `ConfirmActionButton` "Confirmar reserva"/"Cancelar reserva" según estado y `BookingForm booking`; cancelada → aviso "Reserva cancelada: solo lectura." y solo los datos. F3 añade "Pagos" (`listBookingPayments`, `PaymentTable`, `PaymentForm` si no está cancelada). F4 añade "Servicios de esta reserva". `metadata.title = "Reserva"` |
| `app/crm/(protected)/viajes/[id]/itinerario/page.tsx` | F4 | Misma guarda. `getTripById(id)` de `@/modules/trips` (`null` → `notFound()`) + `getTripItinerary(id)`. Compone `h1` "Itinerario y avisos", título del viaje, `ItineraryTable`, `ItineraryItemForm tripId`, `TripUpdateForm` y `TripUpdateList`. `metadata.title = "Itinerario y avisos"` |
| `app/crm/(protected)/itinerario/[id]/page.tsx` | F4 | Misma guarda. `getItineraryItemById(id)` (`null` → `notFound()`) → `h1` "Editar hito" + `<ItineraryItemForm item />` + enlace "Volver" a la página de origen |
| `app/mis-carreras/page.tsx` | F5 | `metadata = { title: "Mis carreras" }` (template del layout; `robots` heredado). `const state = await getRunnerPortal((await searchParams).reserva)`; `if (state.status === "unauthenticated") redirect("/cuenta")`; `return <><RunnerPortal state={state} /><SiteFooter /></>`. Sin `try/catch`, sin `loading.tsx`/`error.tsx` |

Todas las páginas del CRM heredan el layout protegido (`NoCrmAccess`, `CrmShell`, `noindex`). `params` y `searchParams` son promesas (consultar `node_modules/next/dist/docs/` antes de escribirlas).

### Módulo `modules/bookings/`
| Archivo | Fase | Tipo | Contenido |
|---|---|---|---|
| `types/bookings.types.ts` | F1 (mod. F2, F3, F4) | tipos | Ver "Contratos". F2 añade `BookingActionState`, `CrmBookingListItem`, `CrmBooking` y las entradas de reserva (`z.output`). F3 añade `CrmPayment` y `PaymentInput`. F4 añade `CrmItineraryItem`, `CrmTripUpdate` y sus entradas |
| `utils/bookingDisplay.ts` | F1 | puro, sin `server-only` | `BOOKING_STATUS_LABELS` ("Pendiente de confirmación", "Confirmada", "Cancelada"), `ITINERARY_STATUS_LABELS`, `ITINERARY_KIND_LABELS` (Documentación, Inscripción, Vuelo, Traslado, Hotel, Actividad, Día de carrera, Retorno), `ITINERARY_STATUS_BADGE` (variante + clase), `SCHEDULE_EDGE_LABELS` por tipo ("Sale"/"Llega" en `flight`, `return`, `transfer`; "Entrada"/"Salida" en `hotel`; "Inicio"/"Fin" en el resto), `limaDate`, `formatShortDate`, `timeZoneLabel`, `formatScheduleEdge`, `firstName` |
| `utils/runnerBookings.ts` | F1 | puro (importa `formatTripPrice` de `@/modules/trips`; solo se usa en servidor) | `orderRunnerBookings`, `isTripFinished`, `getPaymentSummary`, `buildTimeline` |
| `services/runnerPortal.service.ts` | F1 | `server-only` | `loadRunnerPortal` (Requisitos 3, 5, 6, 7) |
| `index.ts` | F1 (amp. F2–F5) | API pública | F1: `loadRunnerPortal` y tipos del runner. F2: servicios, componentes y tipos de reservas. F3: los de pagos. F4: los de itinerario y avisos. F5: `getRunnerPortal`, `RunnerPortal` |
| `schemas/bookings.schema.ts` | F2 (amp. F3, F4) | zod, sin `server-only` | Ver "Schemas" |
| `services/bookings.service.ts` | F2 | `server-only` | CRM de reservas |
| `actions/bookings.actions.ts` | F2 | `"use server"` | Acciones de reservas |
| `actions/runBookingAction.ts` | F2 (enmienda) | `server-only`, sin `"use server"` | `runBookingAction`, `failure`, mensajes de error; base común de las acciones de F2–F4 |
| `components/BookingStatusBadge.tsx` | F2 (enmienda) | Server | `Badge` del estado de la reserva; lo usan `BookingTable`, la ficha y `BookingOverview` |
| `services/payments.service.ts` | F3 | `server-only` | CRM de pagos |
| `actions/payments.actions.ts` | F3 | `"use server"` | Acciones de pagos |
| `services/itinerary.service.ts` | F4 | `server-only` | CRM de hitos y avisos |
| `actions/itinerary.actions.ts` | F4 | `"use server"` | Acciones de hitos y avisos |
| `utils/runnerPortal.ts` | F5 | `server-only` | `getRunnerPortal` (guarda y estados) |

### Schemas (`schemas/bookings.schema.ts`, mensajes en español; entrada: strings de `Object.fromEntries(formData)`; `z.object` descarta claves desconocidas)
- Ayudante local `usdIntegerSchema(min, message)`: `trim` + `/^\d+$/` → `Number` entero en `[min, 1 000 000]`; rechaza decimales (`"1499.50"`), signos, vacíos y letras. Lo usan el total y el importe del pago (DRY dentro del módulo).
- (F2) `bookingStatusSchema`, `itineraryKindSchema`, `itineraryStatusSchema`: mismos valores que los enums (el test lo comprueba).
- (F2) `bookingFormSchema`: `tripId` `z.uuid()`; `participantName` trim 2–120; `participantEmail` trim, minúsculas, `z.email()`, ≤ 254 ("Introduce un correo válido."); `packageLabel` trim 1–80; `distance` `""` → `null`, si no trim ≤ 20; `totalUsd` `usdIntegerSchema(0, "Indica el total en dólares, sin decimales.")`; `balanceDueOn` `""` → `null`, si no `z.iso.date()`; `internalNote` `""` → `null`, si no trim ≤ 2000. `updateBookingSchema` = sin `tripId` + `bookingId: z.uuid()`.
- (F2) `bookingStatusChangeSchema = { bookingId: z.uuid(), status: z.enum(["confirmed", "cancelled"]) }`.
- (F3) `paymentFormSchema`: `bookingId` uuid; `amountUsd` `usdIntegerSchema(1, "Indica el importe en dólares, sin decimales.")`; `paidOn` `z.iso.date()`; `concept` trim 1–80. `paymentVoidSchema = { paymentId: z.uuid() }`.
- (F4) `itineraryItemFormSchema`: `tripId` uuid (solo hitos de viaje) o `bookingId` uuid (hitos de reserva) — exactamente uno; `kind`, `status`; `title` trim 1–120; `details` y `location` `""` → `null`, ≤ 1000 / ≤ 160; `startDate`, `endDate` `""` → `null` o `z.iso.date()`; `startTime`, `endTime` `""` → `null` o `/^\d{2}:\d{2}$/`; `startTimeZone`, `endTimeZone` `""` → `null` o zona válida (`isValidTimeZone`: `new Intl.DateTimeFormat("en", { timeZone })` no lanza); `runnerVisible` `"on"` → `true`, ausente → `false`. Refinamientos con el error en su campo: hora sin fecha → error en la fecha ("Indica la fecha."); hora sin zona → error en la zona ("Indica la zona horaria."); zona sin hora → `null` (se descarta); fin sin inicio → error en `startDate`; `endDate < startDate` → error en `endDate` ("El fin no puede ser anterior al inicio."). `updateItineraryItemSchema` = campos sin `tripId`/`bookingId` + `itemId`. `itemIdSchema = { itemId: z.uuid() }`.
- (F4) `tripUpdateFormSchema = { tripId: z.uuid(), title: trim 3–120, body: trim 1–2000 }`; `tripUpdateIdSchema = { updateId: z.uuid() }`.

### Services del CRM
```ts
// services/bookings.service.ts (F2, server-only). Patrón de trips.service/leads.service.
export async function listBookings(tripId?: string): Promise<CrmBookingListItem[]>;
//   bookings JOIN trips; paidUsd = COALESCE(SUM(amount_usd) FILTER (WHERE voided_at IS NULL), 0) (0 hasta que existan pagos);
//   ORDER BY trips.race_date DESC, participant_name. Sin paginación (YAGNI; añadirla si > 200 filas).
export async function getBookingById(id: string): Promise<CrmBooking | null>;  // id no UUID → null sin consultar; incluye paidUsd
export async function createBooking(input: BookingInput, actorUserId: string): Promise<{ id: string } | "invalid_trip" | "duplicate">;
//   INSERT … SELECT FROM trips WHERE id = $trip AND status <> 'archived' ON CONFLICT DO NOTHING RETURNING id;
//   status 'pending' por defecto; runner_user_id nunca viene del input. Distingue invalid_trip/duplicate en el mismo batch.
export async function updateBooking(input: UpdateBookingInput): Promise<"updated" | "not_found" | "cancelled" | "trip_archived" | "email_locked" | "duplicate">;
//   UPDATE … WHERE id AND status <> 'cancelled' AND viaje no archivado AND (runner_user_id IS NULL OR participant_email = $email)
//   AND NOT EXISTS (otra reserva activa del mismo viaje con ese email); + SELECT de diagnóstico en el mismo batch.
//   Si un alta concurrente gana la carrera, la violación 23505 de bookings_trip_email_active_uq (directa o en `cause`)
//   → "duplicate"; cualquier otro error se relanza.
export async function setBookingStatus(bookingId: string, status: "confirmed" | "cancelled"): Promise<"changed" | "invalid_transition" | "trip_archived">;
//   confirmed ← pending (viaje no archivado; si no, "trip_archived"); cancelled ← pending | confirmed (también con viaje archivado).
//   getBookingById incluye trip.archived (boolean) para la ficha.

// services/payments.service.ts (F3, server-only)
export async function listBookingPayments(bookingId: string): Promise<CrmPayment[]>;
//   todos (también anulados) con email de profiles (recorded_by), ORDER BY paid_on, created_at.
export async function addPayment(input: PaymentInput, actorUserId: string): Promise<"added" | "not_found">;
//   INSERT … SELECT WHERE EXISTS (reserva con id y status <> 'cancelled').
export async function voidPayment(paymentId: string, actorUserId: string): Promise<{ bookingId: string } | "not_found">;
//   UPDATE … SET voided_at = now(), voided_by WHERE id AND voided_at IS NULL AND reserva no cancelada RETURNING booking_id.

// services/itinerary.service.ts (F4, server-only)
export async function getTripItinerary(tripId: string): Promise<{ items: CrmItineraryItem[]; updates: CrmTripUpdate[] }>; // booking_id IS NULL
export async function listBookingItems(bookingId: string): Promise<CrmItineraryItem[]>;
export async function getItineraryItemById(id: string): Promise<CrmItineraryItem | null>;
export async function createItineraryItem(input: ItineraryItemInput): Promise<{ id: string } | "not_found">;
//   De reserva: INSERT … SELECT b.trip_id FROM bookings b WHERE b.id = $booking AND b.status <> 'cancelled'.
//   De viaje: INSERT … SELECT FROM trips WHERE id = $trip.
export async function updateItineraryItem(input: UpdateItineraryItemInput): Promise<{ tripId: string; bookingId: string | null } | "not_found">;
export async function deleteItineraryItem(itemId: string): Promise<{ tripId: string; bookingId: string | null } | "not_found">;
//   update/delete: WHERE id AND (booking_id IS NULL OR EXISTS (reserva booking_id con status <> 'cancelled')).
//   Un hito de una reserva cancelada → "not_found" (Decisión 14: la ficha cancelada es de solo lectura).
export async function createTripUpdate(input: TripUpdateInput, actorUserId: string): Promise<"created" | "not_found">;
export async function deleteTripUpdate(updateId: string): Promise<{ tripId: string } | "not_found">;
```

### Server Actions (`"use server"`)
Mismo patrón que `trips.actions.ts`: `requirePermission("bookings.manage")` → zod → service → `revalidatePath` si hay éxito. Firma `(prev: BookingActionState, formData: FormData) => Promise<BookingActionState>`; `BookingActionState` encaja en `ConfirmActionState` de `components/shared/ConfirmActionButton`. Lo usan los tres archivos de acciones a través de `runBookingAction` (`actions/runBookingAction.ts`, `server-only`, sin `"use server"`), que acepta mensajes propios por código (p. ej. el `not_found` de F3 y F4).
- `unauthorized`: "Tu sesión no es válida. Vuelve a iniciar sesión."; `forbidden`: "No tienes permiso para gestionar reservas."; `invalid_input`: "Revisa los campos marcados." con `fieldErrors` y `values`; error del service → `throw new Error("booking action failed")` sin causa ni `console.*`.
- (F2, `bookings.actions.ts`) `createBookingAction` (éxito → `redirect("/crm/reservas/<id>")`; `duplicate` → `fieldErrors.participantEmail` "Ese correo ya tiene una reserva activa en este viaje."; `invalid_trip` → `fieldErrors.tripId` "Ese viaje ya no está disponible."), `updateBookingAction` (`email_locked` → `fieldErrors.participantEmail` "La cuenta ya está vinculada; el correo no se puede cambiar."; `cancelled`/`not_found` → "La reserva ya no existe o está cancelada. Recarga la página."; `trip_archived` → "El viaje está archivado: la reserva solo se puede cancelar. Recarga la página."), `changeBookingStatusAction` (`trip_archived` con el mismo texto) ("Reserva confirmada." / "Reserva cancelada."). Revalidan `/crm/reservas` y `/crm/reservas/<id>`.
- (F3, `payments.actions.ts`) `addPaymentAction` ("Pago registrado."), `voidPaymentAction` ("Pago anulado."); `not_found` → "La reserva o el pago ya no admiten cambios. Recarga la página.". Revalidan `/crm/reservas` y `/crm/reservas/<id>`.
- (F4, `itinerary.actions.ts`) `createItineraryItemAction`, `updateItineraryItemAction` (éxito → `redirect` a la página de origen), `deleteItineraryItemAction`, `createTripUpdateAction`, `deleteTripUpdateAction`. Revalidan la página de origen. `not_found` → "El elemento ya no existe. Recarga la página.". `/mis-carreras` no se revalida: es dinámica por petición.

### Componentes
| Componente | Tipo | Fase | Detalle |
|---|---|---|---|
| `button` (`buttonVariants`), `badge`, `card`, `table`, `input`, `label`, `native-select`, `textarea`, `alert-dialog` | shadcn (instalado) | F2–F5 | Formularios, tablas, estados y confirmaciones |
| `empty` | shadcn (instalar: `npx shadcn@latest add empty`) | F5 | Estado sin carreras |
| `alert` | shadcn (instalar: `npx shadcn@latest add alert`) | F5 | Pendiente de confirmación, sin verificar, error |
| `ConfirmActionButton` | existente (`components/shared/ConfirmActionButton.tsx`) | F2–F4 | Confirmar/cancelar reserva, anular pago, eliminar hito y aviso |
| `CrmShell` | existente (`modules/accounts/components/CrmShell.tsx`) | F2 | Enlace "Reservas" → `/crm/reservas` si `can(roles, "bookings.manage")` (admin y commercial), mismo estilo, props sin cambios |
| `SignOutButton` | existente (`modules/accounts`, se exporta en F5) | F5 | `redirectTo="/cuenta"` en la cabecera del portal y en el estado sin verificar |
| `SiteBrand`, `SiteFooter` | existentes (`modules/landing`; `SiteBrand` se exporta en F5) | F5 | Marca de la cabecera y pie, para coherencia con la landing |
| `buildWhatsAppUrl`, `WHATSAPP_NUMBER` | existentes (`modules/landing/utils/inquiry.ts`; se exportan en F5) | F5 | "Escríbenos por WhatsApp" con el texto "Hola, tengo una consulta sobre mi reserva de <viaje>." |
| `RunnerAccount` | existente (`modules/accounts`) | F6 | Con sesión añade el enlace "Ver mis carreras" (`Link` + `buttonVariants()`) |
| `BookingFilters` | nuevo, Server (`modules/bookings/components/`; no existe un filtro por viaje) | F2 | `<form method="get" action="/crm/reservas">` con `NativeSelect` "Viaje" (Todos + viajes), "Filtrar" y "Limpiar". Sin JS |
| `BookingTable` | nuevo, Server | F2 | Columnas del criterio de F2; montos con `formatTripPrice`; el nombre enlaza a la ficha |
| `BookingForm` | nuevo, `"use client"` (`useActionState`, `onSubmit` + `startTransition` para conservar lo escrito) | F2 | Alta (con `NativeSelect` de viaje) y edición (sin viaje; correo `readOnly` si está vinculada). Ayuda del correo: "Debe ser el correo con el que esta persona se registra en la web; se usa para vincular su cuenta. Cada acompañante necesita su propia reserva." Total: `type="number"`, `min=0`, `step=1`, "USD, sin decimales". Nota interna: "Solo la ve el equipo." |
| `PaymentTable` | nuevo, Server | F3 | Fecha, Concepto, Importe, Registrado por, Estado ("Anulado" `Badge` outline) y "Anular" (`ConfirmActionButton` destructive: "¿Anular el pago de <importe>?" / "Dejará de contar en el saldo. No se puede deshacer."). Pie: Total, Pagado, Saldo |
| `PaymentForm` | nuevo, `"use client"` | F3 | Importe (`type="number"`, `min=1`, `step=1`, "USD, sin decimales"), Fecha del pago (`type="date"`), Concepto; "Registrar pago"/"Registrando…"; se vacía tras el éxito |
| `ItineraryTable` | nuevo, Server | F4 | Props `{ items, editable }`. Tipo, Título, Estado (`Badge`), Inicio y Fin (`formatScheduleEdge`), Visible ("Sí"/"No"), "Editar" (→ `/crm/itinerario/<id>`) y "Eliminar" (`ConfirmActionButton`) |
| `ItineraryItemForm` | nuevo, `"use client"` | F4 | Campos del schema; zonas con `<Input list>` + `<datalist>` de sugerencias (`America/Lima`, `America/Santiago`, `America/Argentina/Buenos_Aires`, `America/Bogota`, `America/Panama`, `America/Mexico_City`, `America/New_York`, `Europe/Madrid`, `Europe/Berlin`, `Asia/Tokyo`); "Visible para el corredor" con `<input type="checkbox">` nativo marcado por defecto (como en la landing). En hitos de viaje: "Lo verán todos los participantes del viaje. No incluyas datos de un participante concreto." |
| `TripUpdateForm` | nuevo, `"use client"` | F4 | Título y Mensaje (`Textarea`); "Publicar aviso"; se vacía tras el éxito |
| `TripUpdateList` | nuevo, Server | F4 | Título, fecha (`formatShortDate(limaDate(publishedAt))`), cuerpo `whitespace-pre-line` y "Eliminar" (`ConfirmActionButton`) |
| `PortalHeader` | nuevo, Server (no existe una cabecera con sesión: `SiteHeader` es estática y muestra "Ingresar / Registrarse") | F5 | Props `{ name?: string }`. `SiteBrand`, nombre (`sm:` visible) y `SignOutButton redirectTo="/cuenta"`. Mismo alto y sombra que `SiteHeader`; sin `sticky` |
| `RaceSelector` | nuevo, Server | F5 | Props `{ bookings, selectedId, today }`. `<nav aria-label="Tus carreras">` con `<ul>` horizontal (`overflow-x-auto`, `snap-x`); cada `Link href="/mis-carreras?reserva=<id>"` muestra número ("01"), título, `formatShortDate(raceDate)` y la etiqueta de estado; la activa con `aria-current="page"` y `border-b-3 border-highlight`. No se renderiza con una sola reserva |
| `BookingOverview` | nuevo, Server | F5 | Props: detalle seleccionado + `today`. Encabezado del viaje (`h2`, destino, fechas, `Badge` de estado), avisos de estado (pendiente, terminado, cancelado), "Tu paquete" y "Pagos" (`getPaymentSummary` + `formatTripPrice`) |
| `TripTimeline` | nuevo, Server | F5 | Props `{ timeline }` (`buildTimeline`). `<section aria-labelledby>` "Tu línea de tiempo"; aviso de preparación o `Badge` "Itinerario confirmado"; `h3` por grupo; `<ol>` con línea vertical (`border-l-2 border-primary/25`) y un punto por hito (Pendiente: hueco; Provisional: borde discontinuo; Confirmado: `bg-primary`; Completado: `bg-highlight` + `Check`; Cancelado: atenuado y título tachado), icono lucide del tipo (`aria-hidden`), título, `Badge` de estado, `formatScheduleEdge` de inicio y fin con su etiqueta, ubicación y detalles si existen |
| `TripUpdates` | nuevo, Server | F5 | Props `{ updates }`. "Avisos del viaje": el más reciente completo (borde izquierdo `highlight`) y el resto en `<details>`; vacío: "Sin avisos por ahora." |
| `RunnerPortal` | nuevo, Server | F5 | Props `{ state: RunnerPortalState }` (sin `unauthenticated`). Compone `PortalHeader` y, según el estado: sin verificar (`Alert` + `SignOutButton`), error (`Alert` destructivo + "Reintentar"), vacío (`Empty`), o saludo + `RaceSelector` + `BookingOverview` + `TripUpdates` + `TripTimeline` + contacto, en el orden de los criterios (rejilla `lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` con colocación explícita para el lateral). Un único `h1` |

Todos los componentes nuevos son de un solo dominio y viven en `modules/bookings/components/`. Ninguno existe en el proyecto ni en `@shadcn` (búsquedas: `timeline` sin resultados; `tabs`, `skeleton`, `progress`, `item` descartados en la Decisión 15).

### Contratos (tipos y funciones de servidor; sin API HTTP)
```ts
// modules/bookings/types/bookings.types.ts (F1)
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];     // "pending" | "confirmed" | "cancelled"
export type ItineraryKind = (typeof itineraryKindEnum.enumValues)[number];
export type ItineraryStatus = (typeof itineraryStatusEnum.enumValues)[number];
export type RunnerTrip = {
  title: string; city: string; country: string;
  raceDate: string; startDate: string | null; endDate: string | null; // YYYY-MM-DD
  includes: string[];
};
export type RunnerBookingSummary = { id: string; status: BookingStatus; trip: RunnerTrip };
export type RunnerPayment = { id: string; amountUsd: number /* USD entero */; paidOn: string; concept: string };
export type ScheduleEdge = { date: string; time: string | null /* HH:MM */; timeZone: string | null };
export type RunnerItineraryItem = {
  id: string; kind: ItineraryKind; status: ItineraryStatus; title: string;
  details: string | null; location: string | null; start: ScheduleEdge | null; end: ScheduleEdge | null;
};
export type RunnerTripUpdate = { id: string; title: string; body: string; publishedAt: Date };
export type RunnerBookingDetail = RunnerBookingSummary & {
  packageLabel: string; distance: string | null; totalUsd: number /* USD entero */; balanceDueOn: string | null; createdAt: Date;
  payments: RunnerPayment[]; items: RunnerItineraryItem[]; updates: RunnerTripUpdate[];
};
export type RunnerPortalData = { bookings: RunnerBookingSummary[]; selected: RunnerBookingDetail | null };
export type PaymentSummary = {
  totalUsd: number; paidUsd: number; balanceUsd: number; dueOn: string | null; status: "pending" | "completed";
};
export type TimelineEntry = {
  key: string; kind: ItineraryKind | "booking" | "payments"; status: ItineraryStatus;
  title: string; details: string | null; location: string | null;
  start: ScheduleEdge | null; end: ScheduleEdge | null; derived: boolean;
};
export type Timeline = {
  preparation: TimelineEntry[]; trip: TimelineEntry[]; unscheduled: TimelineEntry[]; itineraryConfirmed: boolean;
};

// modules/bookings/services/runnerPortal.service.ts (F1, server-only)
export async function loadRunnerPortal(
  userId: string, email: string /* verificado, minúsculas */, bookingParam: unknown, today: string,
): Promise<RunnerPortalData>;

// modules/bookings/utils/runnerBookings.ts (F1)
export function orderRunnerBookings<T extends RunnerBookingSummary>(bookings: readonly T[], today: string): T[];
export function isTripFinished(trip: Pick<RunnerTrip, "raceDate" | "endDate">, today: string): boolean;
export function getPaymentSummary(totalUsd: number, payments: readonly RunnerPayment[], balanceDueOn: string | null): PaymentSummary;
export function buildTimeline(detail: RunnerBookingDetail, today: string): Timeline;

// modules/bookings/utils/bookingDisplay.ts (F1)
export function limaDate(instant: Date): string;            // YYYY-MM-DD en America/Lima (Intl "en-CA")
export function formatShortDate(date: string): string;      // "dom, 16 may 2027" (timeZone "UTC")
export function timeZoneLabel(timeZone: string): string;    // "hora de Santiago"
export function formatScheduleEdge(edge: ScheduleEdge): string; // "vie, 14 may 2027 · 06:55 hora de Santiago" | "vie, 14 may 2027"
export function firstName(name?: string): string | undefined;

// modules/bookings/utils/runnerPortal.ts (F5, server-only)
export type RunnerPortalState =
  | { status: "unauthenticated" }
  | { status: "unverified"; name?: string; email: string }
  | { status: "error"; name?: string }
  | { status: "ok"; name?: string; email: string; today: string; data: RunnerPortalData };
export async function getRunnerPortal(bookingParam: unknown): Promise<RunnerPortalState>;
//  1. await connection();
//  2. getCurrentUser(): ForbiddenError → { status: "error" }; otra excepción → se relanza; null → unauthenticated.
//  3. !emailVerified → unverified (no se llama al service).
//  4. today = limaDate(new Date()); try loadRunnerPortal(...) → ok; catch → console.error("runner-portal: load failed") + error.
```

### Wireframes
Móvil, 360 px (varias carreras; reserva confirmada; viaje parcialmente configurado):
```
┌────────────────────────────────────┐
│ ↗ CARRERAS            [Cerrar sesión]│  PortalHeader (SiteBrand + SignOutButton)
│   VIAJERAS                          │
├────────────────────────────────────┤
│ MIS CARRERAS                        │  eyebrow
│ Hola, Ana.                    (h1)  │  display-title
├────────────────────────────────────┤
│ 01 Santiago 2027  │ 02 Lima 2026  ▸ │  RaceSelector: fila con scroll propio
│ dom, 16 may 2027  │ Terminado       │
│ ═════════════════                   │  activa: subrayado highlight
├────────────────────────────────────┤
│ Maratón de Santiago 42K 2027  (h2)  │  BookingOverview (encabezado)
│ Santiago, Chile                     │
│ Carrera: 16 de mayo de 2027         │
│ Viaje: 14–18 de mayo de 2027        │
│ [Confirmada]                        │
├────────────────────────────────────┤
│ AVISOS DEL VIAJE              (h2)  │  TripUpdates
│ ┃ Recojo de kits · dom, 10 may 2027 │
│ ┃ Lleva tu DNI y la confirmación…   │
│ ▸ Avisos anteriores (2)             │
├────────────────────────────────────┤
│ TU LÍNEA DE TIEMPO            (h2)  │  TripTimeline
│ Estamos preparando tu itinerario.   │
│ Los hitos pendientes se completarán │
│ cuando se confirmen.                │
│ ANTES DE VIAJAR               (h3)  │
│ ● Reserva            [Confirmado]   │
│ │ Registrada · lun, 3 mar 2027      │
│ ○ Pagos              [Pendiente]    │
│ │ Pagado US$ 300 de US$ 1,499       │
│ │ Fecha límite · jue, 1 abr 2027    │
│ ○ Documentación      [Pendiente]    │
│ │ Pasaporte o DNI vigente           │
│ TU VIAJE                      (h3)  │
│ ● Vuelo de ida       [Confirmado]   │
│ │ Sale vie, 14 may 2027 · 01:30     │
│ │   hora de Lima                    │
│ │ Llega vie, 14 may 2027 · 06:55    │
│ │   hora de Santiago                │
│ │ Aeropuerto Jorge Chávez (LIM)     │
│ ◌ Hotel              [Provisional]  │
│ │ Entrada vie, 14 may 2027          │
│ ● Día de carrera     [Confirmado]   │
│ │ dom, 16 may 2027 · Santiago, Chile│
│ POR PROGRAMAR                 (h3)  │
│ ○ Traslado           [Pendiente]    │
│ │ Fecha por confirmar               │
│ ○ Retorno            [Pendiente]    │
│   Fecha por confirmar               │
├────────────────────────────────────┤
│ TU PAQUETE                    (h2)  │
│ Paquete corredor · 42K              │
│ ▸ Qué incluye (9)                   │
├────────────────────────────────────┤
│ PAGOS                         (h2)  │
│ Total acordado          US$ 1,499   │
│ Pagado                    US$ 300   │
│ Saldo pendiente         US$ 1,199   │
│ Fecha límite      jue, 1 abr 2027   │
│ ▸ Pagos confirmados (1)             │
├────────────────────────────────────┤
│ ¿Dudas? Escríbenos por WhatsApp ↗   │
├────────────────────────────────────┤
│ SiteFooter (MAZ, redes, proveedor)  │
└────────────────────────────────────┘
```

Escritorio, ≥ 1024 px:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ↗ CARRERAS VIAJERAS                                   Ana Pérez [Cerrar sesión]│
├──────────────────────────────────────────────────────────────────────────────┤
│ MIS CARRERAS                                                                  │
│ Hola, Ana.                                                                    │
│ 01 Maratón de Santiago 42K 2027      02 Maratón de Lima 2026                  │
│    dom, 16 may 2027                     Terminado                             │
│ ══════════════════════════════════                                            │
├────────────────────────────────────────────────┬─────────────────────────────┤
│ Maratón de Santiago 42K 2027      [Confirmada] │ AVISOS DEL VIAJE            │
│ Santiago, Chile · Carrera: 16 de mayo de 2027  │ ┃ Recojo de kits            │
│ Viaje: 14–18 de mayo de 2027                   │ ┃ Lleva tu DNI…             │
│                                                │ ▸ Avisos anteriores (2)     │
│ TU LÍNEA DE TIEMPO                             ├─────────────────────────────┤
│ Estamos preparando tu itinerario…              │ TU PAQUETE                  │
│  ANTES DE VIAJAR                               │ Paquete corredor · 42K      │
│  ● Reserva ....................... [Confirmado]│ ▸ Qué incluye (9)           │
│  ○ Pagos ......................... [Pendiente] ├─────────────────────────────┤
│  ○ Documentación ................. [Pendiente] │ PAGOS                       │
│  TU VIAJE                                      │ Total acordado  US$ 1,499   │
│  ● Vuelo de ida .................. [Confirmado]│ Pagado            US$ 300   │
│  ◌ Hotel ......................... [Provisional│ Saldo pendiente US$ 1,199   │
│  ● Día de carrera ................ [Confirmado]│ Fecha límite  1 abr 2027    │
│  POR PROGRAMAR                                 │ ▸ Pagos confirmados (1)     │
│  ○ Traslado ...................... [Pendiente] ├─────────────────────────────┤
│  ○ Retorno ....................... [Pendiente] │ ¿Dudas? WhatsApp ↗          │
├────────────────────────────────────────────────┴─────────────────────────────┤
│ SiteFooter                                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Variantes de estado (móvil; la cabecera y el pie no cambian):
```
VACÍO                                   PENDIENTE DE CONFIRMACIÓN
│ MIS CARRERAS                       │  │ Maratón de Santiago 42K 2027       │
│ Hola, Ana.                         │  │ [Pendiente de confirmación]        │
│ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │  │ ┌ Alert ─────────────────────────┐ │
│ ╎          ⚑ (icono)             ╎ │  │ │ Tu reserva está pendiente de   │ │
│ ╎ Aún no tienes carreras         ╎ │  │ │ confirmación. Te avisaremos    │ │
│ ╎ registradas.                   ╎ │  │ │ cuando el equipo la confirme;  │ │
│ ╎ Cuando el equipo registre tu   ╎ │  │ │ los datos pueden cambiar.      │ │
│ ╎ reserva con ana@correo.com, la ╎ │  │ └────────────────────────────────┘ │
│ ╎ verás aquí.                    ╎ │  │ ANTES DE VIAJAR                    │
│ ╎ [Explorar experiencias ↗]      ╎ │  │ ○ Reserva           [Pendiente]    │
│ ╎ Escríbenos por WhatsApp ↗      ╎ │  │ │ Registrada · lun, 3 mar 2027     │
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │  │ ○ Pagos             [Pendiente]    │

PARCIALMENTE CONFIGURADO                ITINERARIO CONFIRMADO
│ TU LÍNEA DE TIEMPO                 │  │ TU VIAJE   [Itinerario confirmado] │
│ Estamos preparando tu itinerario.  │  │ ● Vuelo de ida      [Confirmado]   │
│ Los hitos pendientes se completarán│  │ ● Hotel             [Confirmado]   │
│ cuando se confirmen.               │  │ ● Día de carrera    [Confirmado]   │
│ TU VIAJE                           │  │ ● Retorno           [Confirmado]   │
│ ● Día de carrera    [Confirmado]   │  │ (sin "Por programar")              │
│ POR PROGRAMAR                      │
│ ○ Vuelo de ida      [Pendiente]    │
│ │ Fecha por confirmar              │
│ ○ Hotel             [Pendiente]    │

VIAJE TERMINADO                         ERROR AL CARGAR
│ Maratón de Lima 2026               │  │ MIS CARRERAS                       │
│ [Viaje terminado]                  │  │ Mis carreras                 (h1)  │
│ Gracias por correr con nosotros.   │  │ ┌ Alert destructivo ─────────────┐ │
│ [Explorar próximas experiencias ↗] │  │ │ No pudimos cargar tus carreras.│ │
│ TU LÍNEA DE TIEMPO                 │  │ │ Inténtalo de nuevo en unos     │ │
│ ● Reserva           [Confirmado]   │  │ │ minutos.                       │ │
│ ✓ Día de carrera    [Completado]   │  │ │ [Reintentar]                   │ │
│ (sin aviso de preparación)         │  │ └────────────────────────────────┘ │

CANCELADA                               CORREO SIN VERIFICAR
│ Maratón de Santiago 42K 2027       │  │ ┌ Alert ─────────────────────────┐ │
│ [Cancelada]                        │  │ │ Verifica tu correo para ver tus│ │
│ Esta reserva fue cancelada. Si     │  │ │ carreras. Cierra sesión y      │ │
│ tienes dudas, escríbenos por       │  │ │ vuelve a ingresar: te          │ │
│ WhatsApp ↗                         │  │ │ enviaremos un código.          │ │
│ (paquete y pagos; sin línea de     │  │ │ [Cerrar sesión]                │ │
│  tiempo ni avisos)                 │  │ └────────────────────────────────┘ │
```

CRM, ficha de reserva (F2–F4, escritorio, orientativo):
```
│ Ana Pérez  [Confirmada]          [Cancelar reserva]                          │
│ Cuenta: Vinculada · Maratón de Santiago 42K 2027                              │
│ ┌ Datos de la reserva (F2) ─────────┐ ┌ Pagos (F3) ──────────────────────────┐│
│ │ Nombre, correo (bloqueado), ...   │ │ 03/03/2027 Reserva US$ 300 [Anular]  ││
│ │ Nota interna: solo la ve el equipo│ │ Total 1,499 · Pagado 300 · Saldo 1,199││
│ └───────────────────────────────────┘ └──────────────────────────────────────┘│
│ Servicios de esta reserva (F4) · Ver itinerario del viaje                     │
```

### Relación con leads (`crm-leads-pipeline.md`, PR #12)
- **Sin FK ni sincronización en esta spec** (Decisión 19). La etapa del lead (`reserved`, `paid`) sigue siendo comercial y manual; la reserva es el dato operativo que ve el runner. El portal no lee `leads`.
- **Fase futura** ("crear reserva desde el lead", tras la ficha de leads F3): `ALTER TABLE bookings ADD COLUMN lead_id uuid REFERENCES leads(id)` nula y un botón en la ficha que precargue nombre, correo y viaje. Requiere su propia spec o enmienda.
- **PR #12 (`crm-leads-capture.md`, P1)** propone enlazar una cuenta de runner con su lead por correo verificado en una columna `runner_user_id`. Esta spec usa el mismo nombre y el mismo mecanismo en `bookings`; si se implementa, conviene una sola sentencia de vínculo en la misma petición del portal.
- **PR #8 (`automation-outbox`)**: sin solape de tablas. Un futuro evento `trip_update.published` para avisar al runner encaja en su outbox; queda fuera (Decisión 21).

## Reutilización
- `getCurrentUser` (+ `name` opcional), `requirePermission`, `UnauthorizedError`/`ForbiddenError`, `can()` (ampliada) de `lib/auth/`; `getCrmAccess`, `CrmShell`, `NoCrmAccess`, `SignOutButton` (exportado en F5), `AccessPanel`, `RunnerAccount` de `@/modules/accounts`.
- `getDb()`/`db.batch`, `lib/db-schema.ts` (`trips`, `profiles`), `npm run db:generate` y el procedimiento manual del README.
- `getTripById`, `listTrips`, `formatTripDate`, `formatTripDateRange`, `formatTripPrice` de `@/modules/trips` (sin tocar el módulo).
- `SiteBrand` y `SiteFooter`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER` de `@/modules/landing` (se exportan en F5); tokens `primary`/`highlight`, utilidad `display-title`; `WhatsAppLink` del portal (uno solo, también en la reserva cancelada).
- `ConfirmActionButton` compartido; patrones de `trips.actions.ts`, `staff.service.ts` (CTE + `db.batch`), `InviteStaffForm` (`onSubmit` + `startTransition`), `LeadFilters` (`<form method="get">`), `blankToNull` (subido a `lib/blankToNull.ts` en el tercer uso; lo usan trips, leads y bookings) y `formValues` (`lib/formValues.ts`, compartido con `trips.actions.ts`).
- Fake del cliente Neon HTTP de `staff.service.test.ts` para los tests de services (se copia el patrón).
- shadcn instalados: `button`, `badge`, `card`, `table`, `input`, `label`, `native-select`, `textarea`, `alert-dialog`. A instalar: `empty`, `alert`.
- Nativo: `<details>`, `<datalist>`, `<input type="checkbox">`, `<input type="date|time|number">`, `Intl.DateTimeFormat`.

## Tests
Los de servidor con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`; sin red ni secretos.
- `lib/auth/permissions.test.ts` (F1, ampliar): filas de `bookings.manage` (`admin` → true; `commercial` → true; ambos → true; `[]` → false); los bucles "admin tiene todo" y "sin roles nada" lo incluyen; el resto no cambia.
- `modules/bookings/utils/bookingDisplay.test.ts` (F1): `limaDate` (incl. cambio de día UTC y `TZ` del proceso distinto), `formatShortDate`, `timeZoneLabel` (`America/Lima`, `America/Argentina/Buenos_Aires`, `America/New_York` → "hora de New York"), `formatScheduleEdge` con y sin hora, `firstName` (`" Ana  Pérez "` → "Ana"; vacío o ausente → `undefined`); cada valor de los enums tiene etiqueta.
- `modules/bookings/utils/runnerBookings.test.ts` (F1): los casos del criterio de F1, más: documentos sin fecha al final de su tipo; un hito `cancelled` se mantiene en su grupo; `itineraryConfirmed` falso con solo la carrera derivada; los importes del texto de pagos con `formatTripPrice`.
- `modules/bookings/services/runnerPortal.service.test.ts` (F1; `@/lib/db` con el fake de Neon HTTP): los casos del criterio de F1, inspeccionando el SQL y los parámetros.
- `modules/bookings/schemas/bookings.schema.test.ts` (F2, ampliado en F3 y F4): enums = `enumValues`; normalización del correo; `totalUsd` `"1499.50"`, `"12.5"`, `"-1"`, `"abc"` y `""` → error y `"0"` → 0, `"1499"` → 1499; claves extra descartadas (`runnerUserId`, `status`, `createdBy`); (F3) `amountUsd` `"0"`, `"300.50"` → error y `"300"` → 300; (F4) cada refinamiento del hito, zona inválida, `runnerVisible` ausente → `false`, exactamente uno de `tripId`/`bookingId`; aviso de 2001 caracteres → error.
- `modules/bookings/services/bookings.service.test.ts` (F2): `createBooking` sin `status` ni `runner_user_id` en el `INSERT`, viaje no archivado, `duplicate`/`invalid_trip`; `updateBooking` con sus seis resultados en un batch (incluido `trip_archived`) y la violación 23505 concurrente → `duplicate` (otra constraint se relanza); `setBookingStatus` con los orígenes permitidos, confirmar con viaje archivado → `trip_archived` y cancelar con viaje archivado → `changed`; `listBookings` excluye anulados del pagado y filtra por viaje; `getBookingById` con id no UUID → `null` sin consulta.
- `modules/bookings/actions/bookings.actions.test.ts` (F2): para cada acción, `unauthorized` sin sesión y `forbidden` con cuenta sin rol, sin llamar al service; `commercial` y `admin` → éxito; `invalid_input` con `fieldErrors` y `values`; mapeo de cada resultado; actor de la sesión; error del service → `"booking action failed"` sin `console.*`; `revalidatePath`/`redirect` solo si hay éxito.
- `modules/bookings/services/payments.service.test.ts` y `actions/payments.actions.test.ts` (F3): `addPayment` rechaza reservas canceladas e inserta `recorded_by` = actor; `voidPayment` exige `voided_at IS NULL` y reserva no cancelada; `listBookingPayments` incluye anulados con el email de quien registró; acciones con las mismas garantías que F2 e ignorando `recordedBy`/`voidedBy`.
- `modules/bookings/services/itinerary.service.test.ts` y `actions/itinerary.actions.test.ts` (F4): mismas garantías; el hito de reserva toma `trip_id` de `bookings` (un `tripId` del form se ignora); crear, editar o eliminar un hito de una reserva cancelada → `not_found`; borrar devuelve el origen para redirigir.
- `lib/auth/guards.test.ts` (F5, ampliar): usuario de Clerk con `firstName: " Ana "` y `lastName: "Pérez "` → `name: "Ana Pérez"`; solo uno de los dos → ese; ambos ausentes, `null`, vacíos, en blanco o con otro tipo → sin propiedad y la sesión sigue válida; el resto de casos no cambia.
- `modules/bookings/utils/runnerPortal.test.ts` (F5; `@/lib/auth/guards`, el service y `next/server` mockeados): los casos de la Decisión 11 y de los criterios de acceso y error de F5 (`connection()` antes de todo; `today` de `limaDate`).
- `modules/accounts/components/AccessPanel.test.tsx` y `RunnerAccount.test.tsx` (F6): los casos runner pasan a esperar `/mis-carreras`; nuevo caso del enlace "Ver mis carreras"; los casos de staff no cambian.
- Sin unit tests (SETUP §3): `lib/db-schema.ts` (migración + prueba manual), tipos, componentes de `modules/bookings/components/` (presentacionales o de un solo dominio; su lógica está en utils, schemas y acciones), `CrmShell`, páginas async de `app/` y `components/ui/`.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer) y, desde F2, con la medición del Worker en su última tarea. Nadie aplica migraciones, despliega ni hace commits.

### Fase 1 — Datos, permiso y lecturas del runner (4 tareas, 15 archivos: 2 generados por drizzle-kit)
Coordinación: PR #12 y PR #8 modifican `lib/db-schema.ts`, `drizzle/meta/_journal.json` y `README.md`; F1-T1 se ejecuta sobre lo que haya en `main` en ese momento y genera el siguiente número de migración.
- [x] T1 — Base compartida: enums y 4 tablas en el schema (importes `integer`); `npm run db:generate` y revisión del SQL (solo objetos nuevos en `public`; sin `neon_auth`, `DROP` ni cambios en otras tablas); permiso `bookings.manage` para `commercial` (y `admin` implícito) y sus tests · archivos: `lib/db-schema.ts`, `drizzle/000N_*.sql` (generado), `drizzle/meta/000N_snapshot.json` (generado), `drizzle/meta/_journal.json`, `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — Tipos y utilidades puras (orden, pagos, línea de tiempo, formato) con tests · archivos: `modules/bookings/types/bookings.types.ts`, `modules/bookings/utils/bookingDisplay.ts`, `modules/bookings/utils/bookingDisplay.test.ts`, `modules/bookings/utils/runnerBookings.ts`, `modules/bookings/utils/runnerBookings.test.ts` · depende de: T1 · paralelo (con T4)
- [x] T3 — Service de lectura del runner (vínculo + lista + detalle) con tests y API pública del módulo · archivos: `modules/bookings/services/runnerPortal.service.ts`, `modules/bookings/services/runnerPortal.service.test.ts`, `modules/bookings/index.ts` · depende de: T2 · secuencial
- [x] T4 — README, sección "Reservas y portal del runner": revisar la migración (`grep -inE 'neon_auth|drop|create schema'`), aplicarla a mano después de las anteriores entre `BEGIN;`/`COMMIT;` sin GRANT, pruebas manuales de F1 y procedimiento SQL para desvincular o reasignar una reserva · archivos: `README.md` · depende de: T1 · paralelo (con T2)

### Fase 2 — CRM: reservas (5 tareas, 15 archivos)
Requisitos previos: F1 cerrada y migración aplicada en la rama de Neon de prueba. Si PR #12 sigue abierto, F2-T5 se ejecuta después de integrarlo (ambos tocan `CrmShell`).
- [x] T1 — Schemas de reserva (con `usdIntegerSchema`) y tests; tipos de reservas del CRM · archivos: `modules/bookings/schemas/bookings.schema.ts`, `modules/bookings/schemas/bookings.schema.test.ts`, `modules/bookings/types/bookings.types.ts` · depende de: Fase 1 · secuencial
- [x] T2 — Service de reservas con tests · archivos: `modules/bookings/services/bookings.service.ts`, `modules/bookings/services/bookings.service.test.ts` · depende de: T1 · secuencial
- [x] T3 — Server Actions de reservas con tests de llamada directa · archivos: `modules/bookings/actions/bookings.actions.ts`, `modules/bookings/actions/bookings.actions.test.ts` · depende de: T2 · secuencial
- [x] T4 — Componentes: `BookingFilters`, `BookingTable`, `BookingForm` · archivos: `modules/bookings/components/BookingFilters.tsx`, `modules/bookings/components/BookingTable.tsx`, `modules/bookings/components/BookingForm.tsx` · depende de: T3 · secuencial
- [x] T5 — Enlace "Reservas" en `CrmShell`, exports y páginas; medir el Worker · archivos: `modules/accounts/components/CrmShell.tsx`, `modules/bookings/index.ts`, `app/crm/(protected)/reservas/page.tsx`, `app/crm/(protected)/reservas/nueva/page.tsx`, `app/crm/(protected)/reservas/[id]/page.tsx` · depende de: T4 · secuencial
- [x] T6 — Enmienda: viaje archivado congela sus reservas (Decisión 22): `trip_archived` en `updateBooking` y `setBookingStatus`, `trip.archived` en `getBookingById`, mensaje en las acciones y ficha en solo lectura con "Cancelar reserva"; tests · archivos: `modules/bookings/types/bookings.types.ts`, `modules/bookings/services/bookings.service.ts`, `modules/bookings/services/bookings.service.test.ts`, `modules/bookings/actions/runBookingAction.ts`, `modules/bookings/actions/bookings.actions.test.ts`, `app/crm/(protected)/reservas/[id]/page.tsx` · depende de: T5 · secuencial

### Fase 3 — CRM: pagos (4 tareas, 11 archivos)
- [ ] T1 — Schemas de pago con tests; tipos de pagos · archivos: `modules/bookings/schemas/bookings.schema.ts`, `modules/bookings/schemas/bookings.schema.test.ts`, `modules/bookings/types/bookings.types.ts` · depende de: Fase 2 · secuencial
- [ ] T2 — Service de pagos con tests · archivos: `modules/bookings/services/payments.service.ts`, `modules/bookings/services/payments.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Server Actions de pagos con tests · archivos: `modules/bookings/actions/payments.actions.ts`, `modules/bookings/actions/payments.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `PaymentTable` y `PaymentForm`, exports y sección "Pagos" en la ficha; medir el Worker · archivos: `modules/bookings/components/PaymentTable.tsx`, `modules/bookings/components/PaymentForm.tsx`, `modules/bookings/index.ts`, `app/crm/(protected)/reservas/[id]/page.tsx` · depende de: T3 · secuencial

### Fase 4 — CRM: itinerario y avisos (5 tareas, 16 archivos)
- [ ] T1 — Schemas de hito y aviso con tests; tipos · archivos: `modules/bookings/schemas/bookings.schema.ts`, `modules/bookings/schemas/bookings.schema.test.ts`, `modules/bookings/types/bookings.types.ts` · depende de: Fase 3 · secuencial
- [ ] T2 — Service de itinerario y avisos con tests · archivos: `modules/bookings/services/itinerary.service.ts`, `modules/bookings/services/itinerary.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Server Actions de itinerario y avisos con tests · archivos: `modules/bookings/actions/itinerary.actions.ts`, `modules/bookings/actions/itinerary.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — Componentes: `ItineraryTable`, `ItineraryItemForm`, `TripUpdateForm`, `TripUpdateList` · archivos: `modules/bookings/components/ItineraryTable.tsx`, `modules/bookings/components/ItineraryItemForm.tsx`, `modules/bookings/components/TripUpdateForm.tsx`, `modules/bookings/components/TripUpdateList.tsx` · depende de: T3 · secuencial
- [ ] T5 — Exports, páginas nuevas, sección de servicios en la ficha y enlace desde la lista; medir el Worker · archivos: `modules/bookings/index.ts`, `app/crm/(protected)/viajes/[id]/itinerario/page.tsx`, `app/crm/(protected)/itinerario/[id]/page.tsx`, `app/crm/(protected)/reservas/[id]/page.tsx`, `app/crm/(protected)/reservas/page.tsx` · depende de: T4 · secuencial

### Fase 5 — `/mis-carreras` (6 tareas, 17 archivos: 2 generados por el CLI de shadcn)
- [x] T1 — Base compartida: `npx shadcn@latest add empty alert` (sin sobrescribir archivos existentes); `name` opcional en `getCurrentUser` con su test; exportar `SignOutButton` de `@/modules/accounts`; exportar `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER` de `@/modules/landing` · archivos: `components/ui/empty.tsx`, `components/ui/alert.tsx`, `lib/auth/guards.ts`, `lib/auth/guards.test.ts`, `modules/accounts/index.ts`, `modules/landing/index.ts` · depende de: Fase 4 (en código solo necesita F1; los datos de F2–F4 hacen falta para la prueba manual) · secuencial (base)
- [x] T2 — `getRunnerPortal` (guarda y estados) con tests · archivos: `modules/bookings/utils/runnerPortal.ts`, `modules/bookings/utils/runnerPortal.test.ts` · depende de: T1 · paralelo (con T3)
- [x] T3 — Componentes presentacionales del portal · archivos: `modules/bookings/components/PortalHeader.tsx`, `modules/bookings/components/RaceSelector.tsx`, `modules/bookings/components/BookingOverview.tsx`, `modules/bookings/components/TripTimeline.tsx`, `modules/bookings/components/TripUpdates.tsx` · depende de: T1 · paralelo (con T2)
- [x] T4 — Composición `RunnerPortal`, exports y ruta `/mis-carreras`; comprobar `ƒ /mis-carreras` y `○ /cuenta` en el build; medir el Worker · archivos: `modules/bookings/components/RunnerPortal.tsx`, `modules/bookings/index.ts`, `app/mis-carreras/page.tsx` · depende de: T2, T3 · secuencial
- [x] T5 — Enmienda (Decisión 23): `h1` y `h2` del viaje con `display-title`; títulos de grupo de `TripTimeline` y número de `RaceSelector` en `primary` con el acento en borde, punto o subrayado (contraste AA); `break-words` en el correo del estado vacío; un único `WhatsAppLink` reutilizado en `BookingOverview` (reserva cancelada) y `RunnerPortal` · archivos: `modules/bookings/components/RunnerPortal.tsx`, `modules/bookings/components/BookingOverview.tsx`, `modules/bookings/components/RaceSelector.tsx`, `modules/bookings/components/TripTimeline.tsx` · depende de: T4 · secuencial
- [x] T6 — Enmienda (Decisión 24): integrar `main` con Clerk; `name` desde `firstName`/`lastName` en `getCurrentUser` con sus tests; `/mis-carreras` en el `matcher` de `middleware.ts`; lint, vitest y build (`ƒ /mis-carreras`, `○ /cuenta`) · archivos: `lib/auth/guards.ts`, `lib/auth/guards.test.ts`, `middleware.ts` · depende de: T5 · secuencial

### Fase 6 — Redirección del runner tras ingresar (3 tareas, 6 archivos)
Requisito previo: enmiendas de `accounts-auth-ui.md` y `landing-public-site.md` aprobadas por el usuario, y F5 cerrada (si no, el runner llegaría a una ruta inexistente).
- [ ] T1 — Destino del runner `/mis-carreras` en tipos y `AccessPanel`, con tests · archivos: `modules/accounts/types/auth.types.ts`, `modules/accounts/components/AccessPanel.tsx`, `modules/accounts/components/AccessPanel.test.tsx` · depende de: Fase 5 · paralelo (con T2; archivos disjuntos)
- [ ] T2 — Enlace "Ver mis carreras" en `RunnerAccount` con test · archivos: `modules/accounts/components/RunnerAccount.tsx`, `modules/accounts/components/RunnerAccount.test.tsx` · depende de: Fase 5 · paralelo (con T1)
- [ ] T3 — README: modelo de acceso con el portal y checklist manual de esta spec; medir el Worker · archivos: `README.md` · depende de: T1, T2 · secuencial

## Cambios que requiere en otras specs (no editados aquí; cada uno vuelve a `borrador` y necesita tu aprobación)
1. **`accounts-auth-ui.md` — bloqueante para F6.**
   - Requisito 12, "Audiencias y destinos": `runner` → `/mis-carreras` (en lugar de `/cuenta`); los formularios reciben `"/crm" | "/mis-carreras"`.
   - Requisito 12, `RunnerAccount` con sesión: añade el enlace "Ver mis carreras" → `/mis-carreras`; `/cuenta` no redirige.
   - "No incluye" (destino tras el login) y "Seguridad → Redirecciones": la lista cerrada pasa a `/crm`, `/crm/acceso`, `/cuenta` (solo salida) y `/mis-carreras`.
   - Criterios F4: "se llama a `router.replace("/mis-carreras")`"; tipos `"/crm" | "/mis-carreras"` y `"/crm/acceso" | "/cuenta"`; el manual de producción "queda en `/cuenta` con sesión" pasa a "llega a `/mis-carreras`".
   - Tabla del módulo: `types/auth.types.ts` con el nuevo `AuthDestination`; `index.ts` exporta también `SignOutButton` (F5 de esta spec).
   - Nota: "Implementado en `runner-portal.md` F6".
2. **`landing-public-site.md` — bloqueante para F6 (el cambio de exports de F5 es no bloqueante).**
   - Requisito 9, "Navegación": tras ingresar o verificar en `/cuenta`, la persona va a `/mis-carreras` (también si es staff); tras cerrar sesión vuelve a `/cuenta`.
   - Criterio F3 "me quedo en `/cuenta` con sesión" → "llego a `/mis-carreras`; al volver a `/cuenta` veo «Qué bueno verte de nuevo.» y «Ver mis carreras»".
   - "API pública de `modules/landing/index.ts`": añade `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER`, consumidos por `modules/bookings`.
   - "Base para el trabajo futuro → Runner": la guarda de runner existe en `runner-portal.md`.
3. **`accounts-roles-permissions.md` — no bloqueante (recomendado).**
   - Matriz de permisos: nueva fila `bookings.manage` concedida a `commercial` (y a `admin` por la regla general); `[]` → false. Igual que `trips.manage` y `leads.manage`.
   - `CurrentUser` documenta `name?: string` (solo presentación; no participa en la autorización).
   - El texto "Los runners son anónimos en el MVP" está desactualizado (ya señalado en `landing-public-site.md`, Pregunta 2): los runners tienen cuenta y consultan sus reservas en `/mis-carreras`.
4. **`trips-catalog.md`, `crm-leads-pipeline.md`, `platform-neon-foundation.md`:** sin cambios. Nota para `crm-leads-pipeline` F4: al crear `lib/dates.ts`, mover allí `limaDate` de `modules/bookings/utils/bookingDisplay.ts` (segundo uso real de "hoy en Lima").

## Preguntas abiertas
Ninguna. Las respuestas del usuario están en las Decisiones 10 (USD enteros), 13 (`bookings.manage` para admin y commercial) y 16 (una reserva por participante); los valores por defecto aceptados, en las Decisiones 17–21.
