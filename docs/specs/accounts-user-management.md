# Gestión de usuarios: una sola pantalla para equipo, patrocinadores y runners, invitación con cualquier rol y ficha de usuario

- Módulo: accounts (con un cambio en `bookings`)
- Estado: borrador
- Depende de:
  - `accounts-roles-permissions.md` (aprobada, F1–F3 implementadas): `profiles`, `staff_assignments`, `staff_invitations`, aceptación atómica en `getCurrentUser`, `can()`, `requirePermission`, `getCrmAccess(permission)`, `/crm/admin/usuarios` (`InviteStaffForm`, `StaffTable`, `InvitationsTable`, `listStaffOverview`), `grantStaffRole`/`revokeStaffRole` con protección del último admin.
  - `sponsors-portal.md` (aprobada; F1 y F2 implementadas): valor `sponsor` en `staff_role`, tabla `sponsors`, `sponsor_id` en invitaciones y asignaciones (CHECK `(role::text = 'sponsor') = (sponsor_id IS NOT NULL)`), la aceptación copia `sponsor_id`, `assignmentRoleSchema`, `STAFF_ROLE_LABELS.sponsor`; F2: CRUD de marcas en `/crm/admin/patrocinadores` y `listSponsors` exportado desde `@/modules/sponsors` (requisito de la Fase 2 de esta spec, ya cumplido). Esta spec sustituye casi toda su F3 (ver "Cambios que requiere en otras specs").
  - `accounts-runner-profiles.md` (aprobada; F1 implementada; F2 en curso en esta rama: T1–T4 con commits, T5 pendiente): tabla `runner_profiles`, `getRunnerProfile`, `RunnerProfile`, utilidades de `runnerProfileDisplay.ts`. Su F2 (`/cuenta/perfil`) no cambia y es la que crea perfiles reales. Esta spec sustituye su F3 (`/crm/corredores`).
  - `runner-portal.md` (aprobada; F1–F2 en `main`): `bookings.runner_user_id`, `listBookings`, `BookingTable`, `bookings.manage`, `/crm/reservas/<id>`. El vínculo reserva ↔ cuenta lo hace `/mis-carreras` (su F5, pendiente).
  - `trips-catalog.md` (aprobada): `formatTripDate` de `@/modules/trips`.
- Base revisada: rama `claude/trusting-darwin-oxck2t` (PR #22) en `b736839`, ya mergeada con `main`. La enmienda de `accounts-auth-ui.md` ya está aprobada y la de `landing-public-site.md` sigue en borrador; esta spec no cambia ninguna de las dos.
- Precedencia: si algo contradice `platform-neon-foundation.md`, gana la foundation. Esta spec **no añade migraciones**: solo lee tablas que ya existen.

## Objetivo
Hoy `/crm/admin/usuarios` solo muestra cuentas con algún rol activo y solo invita a `Comercial` o `Admin`. El rol `sponsor` y las marcas ya existen, pero no hay forma de invitar a un patrocinador ni de ver su marca en la gestión de usuarios, y los runners (cuentas con perfil o con reservas vinculadas) no aparecen en ningún sitio. El admin pide "los roles que faltan y mejorar la gestión de usuarios":

1. **Una sola pantalla** (`/crm/admin/usuarios`) que lista a todas las personas con cuenta conocida por la aplicación: equipo (`admin`, `commercial`), patrocinadores (con su marca) y runners, con filtro por rol y búsqueda por nombre o correo.
2. **Invitar con cualquier rol** desde esa pantalla: Comercial, Admin o Patrocinador (eligiendo su marca).
3. **Ficha de usuario** (`/crm/admin/usuarios/<id>`): roles actuales con asignar y revocar, historial de altas y bajas de rol, marca si es patrocinador, perfil de runner (datos sensibles con el tratamiento de `accounts-runner-profiles.md`) y reservas vinculadas.
4. **"Runner" visible como rol** en la lista y en la ficha, sin ser un rol que conceda permisos.
5. El perfil editable del runner (`/cuenta/perfil`) ya está especificado en `accounts-runner-profiles.md` F2: esta spec no lo redefine, solo lo ordena en el plan de entrega.

## Alcance
- Incluye:
  - (F1) Lista unificada en `/crm/admin/usuarios` (solo lectura, con enlace a la ficha) con búsqueda `?q=` y filtro `?rol=` (`admin`, `commercial`, `sponsor`, `runner`), máximo 200 filas con aviso. Ficha `/crm/admin/usuarios/<id>` con cabecera (nombre, correo, roles, "Runner", marca) y sección "Roles" con asignar y revocar (reutiliza `StaffTable`). `listPendingInvitations` sustituye a `listStaffOverview`. Las acciones de staff revalidan también la ficha.
  - (F2) Invitar como Patrocinador eligiendo la marca; "Patrocinador · <marca>" en las invitaciones pendientes; "Revocar Patrocinador" desde la ficha. README: sección "Usuarios del CRM".
  - (F3) Ficha completa: "Historial de roles", "Perfil de runner" (`RunnerProfileDetails`) y "Reservas vinculadas" (`listBookingsByRunner` + `BookingTable`).
  - (F4) Permiso `runners.view` (commercial; admin implícito): el equipo comercial ve el perfil del runner dentro de la ficha de una reserva vinculada (`/crm/reservas/<id>`). Ver Pregunta abierta 1.
  - Medición del Worker al cerrar F1 y F3.
- No incluye:
  - Guardar "runner" como rol (`staff_role`), asignarlo o revocarlo (Decisión 1).
  - Listar cuentas de Neon Auth que no tienen rol, perfil ni reservas: `neon_auth` no se lee (Decisión 2).
  - Paginación, orden configurable, exportación (CSV/Excel), filtros por viaje, país, talla o perfil incompleto.
  - Acciones por fila en la lista (las acciones viven en la ficha, Decisión 4).
  - Asignar un rol a una cuenta sin fila en `profiles` (runner sin rol) o reactivar sin invitación a quien ya no tiene roles activos: se invita con su correo (Decisión 6).
  - Editar desde el CRM el perfil del runner, notas internas sobre personas, borrar cuentas o perfiles (la supresión sigue siendo manual por SQL, `accounts-runner-profiles.md`).
  - Las páginas `/crm/corredores` y `/crm/corredores/<id>` de `accounts-runner-profiles.md` F3 (sustituidas).
  - "Personas con acceso" en la ficha de la marca (`sponsors-portal.md` F3, sustituida).
  - Envío automático de invitaciones (sigue siendo manual, `accounts-roles-permissions.md`).
  - Cambios de schema, migraciones, `neon_auth`, `CurrentUser`, `getCurrentUser`, `CrmShell` o la matriz salvo `runners.view` (F4).
  - Nueva API HTTP: lecturas con funciones `server-only` y escrituras con las Server Actions existentes.

## Requisitos
1. **Acceso.** Lista y ficha viven bajo el layout protegido (`crm.access`) y cada página comprueba además `getCrmAccess("staff.manage")` (solo admin). `commercial` ve el `h1` y un texto sin permiso (respuesta 200); `sponsor`, runner o cuenta sin roles ven `NoCrmAccess`; sin sesión, `redirect("/crm/acceso")`. Ninguna lectura de datos ocurre antes de que la guarda devuelva `ok`.
2. **Escrituras.** Solo las Server Actions existentes de `staff.actions.ts`, todas con `requirePermission("staff.manage")` y el actor tomado de la sesión. Esta spec cambia su validación (F2) y su revalidación (F1), no su guarda.
3. **Quién aparece** (Decisión 2): la unión de `profiles` (cuentas que tuvieron alguna vez rol de equipo o de patrocinador, incluidas las que ya no tienen roles activos), `runner_profiles` y `bookings.runner_user_id IS NOT NULL`. Una cuenta registrada sin rol, sin perfil y sin reservas vinculadas no aparece. Las invitaciones pendientes se muestran aparte, por correo.
4. **Runner = rol derivado** (Decisión 1): una cuenta es "Runner" si tiene fila en `runner_profiles` o al menos una reserva con `runner_user_id` igual a su id (también cancelada). No está en `staff_role`, no concede permisos y `can()` y las guardas no cambian para runners: sus recursos siguen protegidos por propiedad (`user_id` de la sesión).
5. **Identidad mostrada.** Nombre: `runner_profiles.full_name`; si no hay, el `participant_name` de la reserva vinculada más reciente; si tampoco, sin nombre (se muestra el correo). Correo: `profiles.email`, si no `runner_profiles.email`, si no `participant_email` de esa reserva. Todos son copias en minúsculas y solo de presentación: nunca autorizan.
6. **Búsqueda y filtro.** `q` se recorta; se ignora si está vacío, repetido (array) o pasa de 100 caracteres. Busca por subcadena literal sin distinguir mayúsculas en nombre y correo. `rol` admite `admin`, `commercial`, `sponsor` (rol activo) y `runner` (derivado); cualquier otro valor o un array se ignora. `q` y `rol` se combinan con Y. Orden alfabético por nombre (o correo si no hay nombre). Máximo 200 filas; si hay más, aviso.
7. **Minimización en la lista.** Solo id, nombre, correo, roles activos, nombre de la marca, "Runner" y número de reservas activas (no canceladas). El SQL de la lista no selecciona teléfono, fecha de nacimiento, documento, contacto de emergencia, datos médicos, notas internas ni importes.
8. **Ficha.** Un id vacío, de más de 255 caracteres, mal codificado o sin fila en `profiles`, `runner_profiles` ni reservas vinculadas → 404. El `<title>` es fijo ("Usuario"), sin nombre ni correo. Los datos sensibles del perfil (F3) solo se renderizan en Server Components de la ficha, con el rótulo "Dato sensible"; ningún componente de cliente los recibe.
9. **Invitación con cualquier rol** (F2): `Comercial`, `Admin` o `Patrocinador`; con `Patrocinador`, la marca es obligatoria y debe ser una marca existente. El enlace para compartir es `<APP_ORIGIN>/crm/acceso` para el equipo y `<APP_ORIGIN>/patrocinador/acceso` para patrocinadores. Sigue habiendo una sola invitación pendiente por correo.
10. **Revocar Patrocinador** (F2) desde la ficha con la misma acción y la misma sentencia que el resto de roles. Asignar `sponsor` sin invitación sigue sin existir (`grantStaffRole` solo acepta `commercial | admin`).
11. **Datos personales fuera de logs y errores.** Ninguna función nueva escribe en `console.*`; los errores de la base se propagan sin envolver hasta el error boundary por defecto (lecturas) o el error genérico "staff action failed" (acciones), como hoy.
12. **Rendimiento (Workers Free).** Lista: 1 sentencia para las cuentas + 1 para las invitaciones, en paralelo. Ficha: 1 `db.batch` (F1); en F3, ese batch + `getRunnerProfile` + `listBookingsByRunner`, en paralelo. Sin N+1.

## Criterios de aceptación

### Fase 1 — Lista unificada con búsqueda y filtro, y ficha con roles
Acceso:
- [ ] (F1) Dado un admin verificado, cuando abre `/crm/admin/usuarios`, entonces ve dentro de `CrmShell` el `h1` "Usuarios" y, en este orden: "Invitar a una persona" (el `InviteStaffForm` actual, sin cambios en F1), la sección "Cuentas" (formulario de filtros y tabla) y "Invitaciones pendientes" (la `InvitationsTable` actual).
- [ ] (F1) Dado un `commercial` verificado, cuando abre `/crm/admin/usuarios` o `/crm/admin/usuarios/<id>` (URL directa o navegación de cliente), entonces ve el `h1` "Usuarios" (o "Usuario" en la ficha) y "No tienes permiso para gestionar usuarios. Si lo necesitas, pídeselo a un administrador.", con respuesta 200 y sin formularios ni tablas. En el código, `listUsers`, `listPendingInvitations` y `getUserDetail` solo se llaman después de que `getCrmAccess("staff.manage")` devuelva `ok`.
- [ ] (F1) Dada una cuenta `sponsor`, un runner sin roles o una cuenta con el correo sin verificar, cuando abre cualquiera de las dos rutas, entonces ve `NoCrmAccess`. Sin sesión, se le redirige a `/crm/acceso`.

Lista:
- [ ] (F1) Dadas estas cuentas: admin A; commercial C; patrocinador S de la marca "Marca Norte"; R con perfil de runner; B sin perfil con una reserva vinculada; E que fue commercial y tiene el rol revocado; C2 commercial que además tiene perfil de runner; y N registrada en Neon Auth sin rol, perfil ni reservas, cuando el admin abre la lista sin filtros, entonces aparecen A, C, S, R, B, E y C2, y no aparece N. La columna "Roles" muestra: A `Admin`; C `Comercial`; S `Patrocinador · Marca Norte`; R `Runner`; B `Runner`; E el texto "Sin rol activo"; C2 `Comercial` y `Runner`.
- [ ] (F1) Dada la tabla, entonces tiene las columnas "Usuario", "Roles" y "Reservas activas". "Usuario" muestra el nombre (enlace a `/crm/admin/usuarios/<encodeURIComponent(id)>`) con el correo debajo; sin nombre, el correo es el enlace. B muestra el nombre y el correo de su reserva vinculada más reciente. "Reservas activas" cuenta las reservas vinculadas no canceladas (0 si no tiene).
- [ ] (F1) Dado el formulario `<form method="get">` con "Buscar por nombre o correo" (`q`, `maxLength=100`), "Rol" (`NativeSelect` `rol` con "Todos", "Comercial", "Admin", "Patrocinador" y "Runner"), "Buscar" y "Limpiar" (→ `/crm/admin/usuarios`), cuando busco `?q=ANA@`, entonces aparecen las cuentas cuyo nombre o correo contienen `ana@` sin distinguir mayúsculas, y el campo conserva lo buscado. `?q=%` y `?q=_` buscan esos caracteres literalmente.
- [ ] (F1) Dado `?rol=sponsor`, entonces solo aparecen cuentas con rol `sponsor` activo; `?rol=runner`, solo las derivadas como runner (R, B, C2); `?rol=admin` o `?rol=commercial`, solo quien tiene ese rol activo (E no aparece). `?rol=runner&q=ana` combina ambos. Un `rol` desconocido, repetido o vacío y un `q` vacío, repetido o de más de 100 caracteres se ignoran y la lista se muestra sin ese filtro.
- [ ] (F1) Dado un filtro sin resultados, entonces se ve "Ningún usuario coincide con la búsqueda."; sin cuentas y sin filtros, "Aún no hay usuarios.". Dadas más de 200 cuentas que cumplen el filtro, entonces la tabla muestra 200 y "Se muestran los primeros 200 resultados. Afina la búsqueda o filtra por rol.".
- [ ] (F1) Dada `listUsers` (unit test): una sola sentencia que une `profiles`, `runner_profiles` y `bookings` con `runner_user_id IS NOT NULL`; filtra con `strpos(lower(…), lower($q)) > 0` sobre nombre y correo; filtra el rol con el array de roles activos o con `is_runner`; ordena por nombre o correo y luego por id; pide 201 filas y devuelve `truncated`; **no selecciona** `phone`, `birth_date`, `document_*`, `emergency_contact_*`, `medical_notes`, `internal_note` ni `total_usd`.

Invitaciones:
- [ ] (F1) Dada "Invitaciones pendientes", entonces se comporta como hoy (correo, rol, caducidad con `Badge` "Caducada", revocar). `listPendingInvitations` hace un único `SELECT` con el predicado de pendiente y el indicador `expired` calculado en la base (unit test); `listStaffOverview` deja de existir.

Ficha:
- [ ] (F1) Dado un admin en la ficha de C, entonces ve el `h1` con el correo de C (no tiene nombre), los `Badge` de sus roles y la sección "Roles" con la fila de `StaffTable` ("Asignar Admin", "Revocar Comercial"), con los mismos diálogos de confirmación que hoy, y el enlace "Volver a usuarios" (→ `/crm/admin/usuarios`).
- [ ] (F1) Dada la ficha de C, cuando confirmo "Revocar Comercial", entonces el diálogo se cierra, la ficha muestra "Sin roles activos. Para devolverle el acceso, invítala de nuevo con su correo." y, al volver a la lista, C aparece con "Sin rol activo". Revocar el `admin` del último admin activo muestra en el diálogo "No se puede revocar el rol del último admin activo." y no cambia nada (comportamiento existente).
- [ ] (F1) Dada la ficha de R (runner sin fila en `profiles`), entonces ve el nombre, el correo, el `Badge` `Runner` y "Esta cuenta no tiene roles del equipo ni de patrocinador. Para dárselos, invítala con su correo desde Usuarios.", sin `StaffTable`.
- [ ] (F1) Dada la ficha de S, entonces la cabecera muestra `Patrocinador · Marca Norte` y "Marca: Marca Norte".
- [ ] (F1) Dado `/crm/admin/usuarios/<id>` con un id sin perfil, sin perfil de runner y sin reservas vinculadas, de más de 255 caracteres o mal codificado, entonces responde 404 (no 500). El `<title>` de la ficha es "Usuario | Carreras Viajeras" para cualquier persona.
- [ ] (F1) Dada `getUserDetail` (unit test): id vacío o de más de 255 caracteres → `null` sin consultar; un único `db.batch` cuyas sentencias filtran por ese id (`profiles`, asignaciones activas con su marca, identidad de `runner_profiles` y reserva vinculada más reciente); sin filas en ninguna → `null`; `member` es `null` sin roles activos; `sponsor` sale de la asignación `sponsor` activa; la identidad sigue el Requisito 5.
- [ ] (F1) Dada cualquier acción de staff con éxito, entonces se llama a `revalidatePath("/crm/admin/usuarios")` y a `revalidatePath("/crm/admin/usuarios/[id]", "page")`; con error, a ninguna (unit test).

Calidad:
- [ ] (F1) Dado el árbol de componentes, entonces no hay ningún `"use client"` nuevo: `UserFilters`, `UserTable` y las dos páginas son Server Components; los únicos componentes de cliente siguen siendo `InviteStaffForm` y `ConfirmActionButton`.
- [ ] (F1) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores y `/crm/admin/usuarios/[id]` aparece como dinámica (`ƒ`). Dado `npm run build:worker` + `npx wrangler deploy --dry-run --outdir <scratch>` (Linux/WSL, sin desplegar), entonces el gzip del Worker se registra en el resumen de la fase frente a la última referencia y es menor de 2 MiB; si lo supera, se detiene y se consulta al usuario.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 2 — Invitar como Patrocinador y revocar Patrocinador
Requisito previo: `sponsors-portal.md` F2 cerrada (ya hecha: `listSponsors` exportado desde `@/modules/sponsors`).
- [ ] (F2) Dadas marcas existentes, cuando abro "Invitar a una persona", entonces "Rol" ofrece `Comercial` (por defecto), `Admin` y `Patrocinador`. Al elegir `Patrocinador` aparece "Marca" (`NativeSelect` `sponsorId` con "Elige una marca" y las marcas por nombre); con otro rol, "Marca" no se muestra ni se envía.
- [ ] (F2) Dado que no hay marcas, entonces `Patrocinador` aparece deshabilitado y debajo se lee "Para invitar a un patrocinador, crea antes su marca en Patrocinadores." con enlace a `/crm/admin/patrocinadores`.
- [ ] (F2) Dado `Lucia@Marca.com`, rol `Patrocinador` y la marca "Marca Norte", cuando pulso "Invitar", entonces aparece "Invitación creada para lucia@marca.com. Comparte el enlace de acceso.", el enlace `<APP_ORIGIN>/patrocinador/acceso` con "Copiar enlace", el formulario vuelve a `Comercial` y vacío, y la invitación aparece en "Invitaciones pendientes" con el rol "Patrocinador · Marca Norte".
- [ ] (F2) Dado `Patrocinador` sin marca elegida, cuando pulso "Invitar", entonces aparece "Elige la marca del patrocinador." bajo "Marca" (`aria-invalid`, `aria-describedby`), se conservan el correo y el rol, y no se crea nada.
- [ ] (F2) Dada una invitación `Comercial` o `Admin`, entonces el resultado no cambia respecto a hoy (enlace `/crm/acceso`, `sponsor_id` nulo) aunque el formulario traiga un `sponsorId` (unit test).
- [ ] (F2) Dada `inviteStaffSchema` (unit test): `sponsor` sin `sponsorId` o con un `sponsorId` que no es UUID → error en `sponsorId`; `commercial`/`admin` con `sponsorId` → salida con `sponsorId: null`; `operations` o vacío → error en `role`; correo normalizado como hoy; claves extra (`invitedBy`, `expiresAt`) descartadas. `revokeStaffRoleSchema` acepta `sponsor`; `staffRoleChangeSchema` (asignar) lo sigue rechazando.
- [ ] (F2) Dada `inviteStaffAction` (unit test): con `sponsor` llama a `createInvitation({ email, role: "sponsor", sponsorId }, actor)` y `acceptUrl` termina en `/patrocinador/acceso`; con rol de equipo, `sponsorId: null` y `/crm/acceso`; `invalid_input` con `fieldErrors.sponsorId = ["Elige la marca del patrocinador."]`. Un `sponsorId` válido pero inexistente choca con la FK y termina en el error genérico "staff action failed" sin la causa.
- [ ] (F2) Dada `createInvitation` (unit test): sigue siendo un batch de dos sentencias (revocar caducadas e insertar con `ON CONFLICT DO NOTHING RETURNING`) e inserta `sponsor_id` (nulo para el equipo). Dada `listPendingInvitations`: `LEFT JOIN sponsors` y devuelve `sponsorName` (o `null`).
- [ ] (F2) Dada la ficha de una persona con rol `sponsor` activo, cuando confirmo "Revocar Patrocinador", entonces se revoca (`revokeStaffRoleAction` con `revokeStaffRoleSchema`), la ficha lo refleja y, en su siguiente petición, la persona pierde el portal (`requireSponsor` → `ForbiddenError`). `grantStaffRoleAction` con `role=sponsor` → `invalid_input` (unit test).
- [ ] (F2) Dado `README.md`, entonces la sección "Usuarios del CRM" documenta: quién aparece y quién no (Requisito 3), "Runner" como rol derivado, búsqueda y filtro, la ficha, invitar con cada rol (Patrocinador exige marca; el enlace `/patrocinador/acceso` funciona desde `sponsors-portal.md` F4 y no se comparte con patrocinadores reales antes), reactivar a quien no tiene roles con una invitación nueva y la minimización de datos.
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 3 — Ficha completa: historial, perfil de runner y reservas
- [ ] (F3) Dada la ficha de cualquier cuenta con fila en `profiles`, entonces la sección "Historial de roles" muestra una fila por asignación (activas y revocadas), de la más reciente a la más antigua, con: "Rol" (con " · <marca>" en las de patrocinador), "Alta" (`formatStaffDateTime`), "Origen" ("Invitación", "Asignado en el CRM" o "Alta por script"), "Concedido por" (correo o "—"), "Baja" (fecha o `Badge` "Activo") y "Revocado por" (correo o "—"). Sin asignaciones: "Sin historial de roles.". El texto libre de `reason` nunca se muestra.
- [ ] (F3) Dada la ficha de un runner con perfil, entonces la sección "Perfil de runner" muestra `RunnerProfileDetails`: `Badge` "Perfil completo" o "Perfil incompleto" con "Falta: …" (`getMissingProfileSections` con el día UTC), "Actualizado el …" y una `Card` por sección: "Datos personales" (teléfono, país, ciudad, fecha de nacimiento), "Documento de viaje" (tipo, número, vencimiento; `Badge` "Dato sensible"), "Datos de carrera" (talla, distancia preferida, mejor marca, club), "Contacto de emergencia" (nombre, teléfono, "Alergias o condiciones médicas"; `Badge` "Dato sensible") y "Consentimiento" (versión y fecha). Los vacíos muestran "—"; las fechas de calendario usan `formatTripDate`. Sin formularios ni acciones.
- [ ] (F3) Dada la ficha de un runner sin perfil (solo reservas vinculadas), entonces "Perfil de runner" muestra "Esta persona aún no completó su perfil.".
- [ ] (F3) Dada la ficha de un runner, entonces "Reservas vinculadas" muestra `BookingTable` con todas las reservas cuyo `runner_user_id` es ese id (también canceladas) o "Sin reservas vinculadas a esta cuenta.". Dada una cuenta que no es runner, entonces no aparecen "Perfil de runner" ni "Reservas vinculadas".
- [ ] (F3) Dada `getUserDetail` (unit test): el batch añade el historial (`staff_assignments` de ese id con `LEFT JOIN sponsors` y dos `LEFT JOIN profiles` para los correos de quien concedió y quien revocó, `origin` calculado: `granted_by IS NULL` → `script`, `reason LIKE 'invitation:%'` → `invitation`, resto → `crm`, sin seleccionar `reason`); el perfil sale de `getRunnerProfile(id)`; la identidad y el 404 siguen el Requisito 5 y el 8.
- [ ] (F3) Dada `listBookingsByRunner(id)` (unit test): filtra `runner_user_id = $id`, excluye los pagos anulados del pagado y ordena como `listBookings`; los tests de `listBookings` siguen pasando sin cambios.
- [ ] (F3) Dado el árbol, entonces `RoleHistoryTable` y `RunnerProfileDetails` son Server Components y el perfil no llega a ningún componente de cliente. Medición del Worker como en F1. `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 4 — Perfil del runner en la reserva para el equipo comercial
Requisito previo: Fase 3 cerrada (`RunnerProfileDetails`). Ver Pregunta abierta 1.
- [ ] (F4) Dado `can()` (unit test), entonces `commercial` y `admin` tienen `runners.view`; `sponsor` y `[]` no; los bucles "admin tiene todo" y "sin roles nada" lo incluyen y los permisos existentes no cambian.
- [ ] (F4) Dado un `commercial` en `/crm/reservas/<id>` de una reserva vinculada cuya cuenta tiene perfil, entonces ve, después de los datos de la reserva, la sección "Perfil del runner" con `RunnerProfileDetails`. Vinculada sin perfil: "La persona aún no completó su perfil.". Sin vincular: la sección no aparece.
- [ ] (F4) Dada `getBookingRunnerProfile(bookingId)` (unit test): un id que no es UUID → `null` sin consultar; una sola sentencia que une `bookings.runner_user_id = runner_profiles.user_id` filtrando por `bookings.id`; sin fila → `null`. La página solo la llama si `booking.linked` y `can(access.user.staffRoles, "runners.view")`.
- [ ] (F4) Dado un `commercial`, entonces sigue sin acceso a `/crm/admin/usuarios` ni a las fichas de usuario.
- [ ] (F4) Dado `README.md`, entonces "Usuarios del CRM" documenta quién ve el perfil del runner y dónde. `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Manual en producción (el usuario, con su autorización; los agentes no acceden a Neon)
- [ ] (F1) La lista muestra al admin y a los comerciales; los filtros y la búsqueda funcionan; revocar y asignar desde la ficha surte efecto en la siguiente petición de la persona (`GET /api/crm/me`).
- [ ] (F2, tras `sponsors-portal.md` F4) Invitar como Patrocinador → la persona crea su cuenta en `/patrocinador/acceso`, verifica el correo y llega a `/patrocinador` → en la lista aparece como "Patrocinador · <marca>" y su invitación desaparece de pendientes.
- [ ] (F3, tras `accounts-runner-profiles.md` F2) Un runner completa `/cuenta/perfil` → aparece con `Runner` y su ficha muestra el perfil con los rótulos "Dato sensible"; en la lista no aparecen su teléfono, documento ni datos médicos.
- [ ] (F4) Un `commercial` abre una reserva vinculada y ve el perfil del runner; al abrir `/crm/admin/usuarios` ve el mensaje sin permiso.

## Diseño técnico

### Decisiones
1. **"Runner" es un rol derivado, no un valor de `staff_role`.** Se calcula al leer: fila en `runner_profiles` o alguna reserva con `runner_user_id`. Motivos frente a guardarlo como rol:
   - **No concede nada.** Los recursos del runner (`/cuenta/perfil`, `/mis-carreras`) se protegen por propiedad (`user_id` de la sesión), no por rol. Un rol `runner` en la matriz no tendría permisos, y `can()`/las guardas no cambian.
   - **Es autoservicio.** Cualquier cuenta verificada puede crear su perfil o vincular reservas sin intervención del admin. Guardarlo exigiría que esos flujos escribieran en `profiles` y `staff_assignments`, que hoy solo escriben las invitaciones y el admin, con auditoría (`granted_by`). Eso rompe "registrarse no concede nada" y mezcla una tabla de autorización con un hecho de negocio.
   - **Revocarlo no tendría efecto:** la persona seguiría pudiendo entrar y editar su perfil. Un botón "Revocar Runner" sería engañoso. Por eso "Runner" se muestra como `Badge` sin acciones.
   - **Sin migración ni duplicación.** Un valor nuevo del enum es irreversible (`ALTER TYPE … ADD VALUE`), y el dato quedaría guardado dos veces (rol + perfil/reservas) con riesgo de desincronizarse.
2. **Fuente de la lista.** `neon_auth` no se lee ni se modela (foundation), así que la lista es la unión de los tres orígenes del Requisito 3. Consecuencias aceptadas:
   - una cuenta registrada sin rol, sin perfil y sin reservas vinculadas no aparece; si se la invita, aparece en "Invitaciones pendientes" por su correo y, al aceptar, en la lista;
   - hasta que existan perfiles (`accounts-runner-profiles.md` F2) o reservas vinculadas (`runner-portal.md` F5), el filtro "Runner" está vacío;
   - `profiles` conserva a quien ya no tiene roles activos: aparece con "Sin rol activo", lo que hoy no ocurre (desaparecía de "Equipo activo").
3. **Una sola sentencia para la lista** (CTE `ids` + `LEFT JOIN` + `LATERAL`, ver "Contratos"). Sin N+1 ni paginación: el MVP tiene decenas de personas del equipo y cientos de runners; la búsqueda y el filtro sirven para encontrar a alguien y el límite de 200 filas (201 pedidas para saber si hay más) acota la CPU del Worker. Mismo criterio que `accounts-runner-profiles.md` (Decisión 11).
4. **Lista de solo lectura; acciones en la ficha.** Hoy cada fila de `StaffTable` monta hasta tres `ConfirmActionButton` (cliente). Con 200 filas de todo tipo serían cientos de diálogos hidratados para una acción poco frecuente. La ficha da el contexto (historial, marca, perfil) antes de cambiar un rol. Coste: un clic más.
5. **Ficha reutiliza `StaffTable` con una sola fila** (`staff={[detail.member]}`) para asignar y revocar: mismos botones, textos, diálogos y acciones que hoy, sin un componente nuevo. Solo se renderiza si hay roles activos (`member` no nulo), porque "Alta" se calcula con el rol activo más antiguo.
6. **Asignar requiere fila en `profiles`.** `grantStaffRole` ya exige un perfil (FK). Para dar un rol a un runner sin perfil de staff, o reactivar a quien no tiene roles activos, se usa la invitación existente: liga el rol al correo verificado, que es la garantía de identidad del sistema. Sin botón "Asignar" para esos casos (YAGNI).
7. **Permisos:**
   - **Lista y ficha: `staff.manage`** (solo admin). Gestionan quién tiene acceso, que ya es `staff.manage`, y la ficha muestra datos sensibles de runners. No se crea `users.manage`: solo lo tendría `admin`, igual que `staff.manage`.
   - **`commercial`** no ve la pantalla de usuarios. Para organizar viajes necesita el perfil (documento, talla, emergencia) de quien viaja, no un directorio de todas las cuentas: lo ve en la ficha de la reserva vinculada (F4), con **`runners.view`**, que se mantiene con el mismo valor que aprobó `accounts-runner-profiles.md` (`["commercial"]`, admin implícito) pero cambia de superficie: sustituye `/crm/corredores` (Pregunta abierta 1).
   - **`sponsor`** sigue sin `crm.access`, `staff.manage` ni `runners.view`.
   - La ficha (admin) no vuelve a comprobar `runners.view` ni `bookings.manage`: `staff.manage` hoy solo lo tiene `admin`, que tiene todos los permisos. Si algún día otro rol obtuviera `staff.manage`, esta spec se revisa.
8. **Invitar con cualquier rol desde un único formulario.** `InviteStaffForm` gana `Patrocinador` y la "Marca"; `inviteStaffAction` acepta `sponsor` con `sponsorId` y elige el enlace de acceso según el rol. No hay `inviteSponsorMemberAction` ni una segunda sección de personas en la marca (`sponsors-portal.md` F3). La lista de marcas la pasa la página (`listSponsors` de `@/modules/sponsors`, mapeada a `{ id, name }`): `accounts` no importa `sponsors`, que ya depende de `accounts` (`SignOutButton`), así que no hay ciclo.
9. **Enlace de patrocinadores antes del portal.** La invitación `sponsor` se puede crear desde F2 (con marcas de `sponsors-portal.md` F2), pero `/patrocinador/acceso` existe desde `sponsors-portal.md` F4. Se acepta la ventana: el README pide no compartir el enlace con patrocinadores reales hasta cerrar esa fase (como ya pide `sponsors-portal.md` F4). Si la persona entrara antes por `/crm/acceso`, la invitación se acepta igual y ve `NoCrmAccess` (sin permisos indebidos).
10. **"Revocar Patrocinador" funciona desde F2.** Hoy `StaffTable` ya muestra ese botón para asignaciones `sponsor` y la acción responde `invalid_input` (valida con `staffRoleSchema`). F1 no lo empeora; F2 lo corrige con `revokeStaffRoleSchema` (`assignmentRoleSchema`). Hasta entonces, las asignaciones `sponsor` solo pueden existir por SQL manual y se revocan con `scripts/sql/revoke-staff-role.sql`.
11. **Revalidación.** Las acciones revalidan la lista y todas las fichas (`revalidatePath("/crm/admin/usuarios")` y `revalidatePath("/crm/admin/usuarios/[id]", "page")`). No se usa `"layout"` porque no hay `layout.tsx` en ese segmento. Ya no hace falta revalidar `/crm/admin` (layout) como planeaba `sponsors-portal.md` F3, porque la marca no muestra personas.
12. **Historial sin texto libre.** `reason` puede contener el operador y el motivo del script de bootstrap. La ficha muestra solo el origen derivado (`invitation | crm | script`) y los correos de `profiles` de quien concedió o revocó.
13. **Identidad y `<title>`.** El nombre y el correo son copias de presentación (Requisito 5). El `<title>` de la ficha es fijo para no dejar datos personales en el historial del navegador ni en pestañas compartidas.
14. **Parámetros de URL.** Segmento en español (`/crm/admin/usuarios`), parámetros `q` y `rol` (como `?viaje=` y `?reserva=`); los valores de `rol` son los del código (`admin`, `commercial`, `sponsor`, `runner`). Los enlaces a la ficha usan `encodeURIComponent(userId)`; si el id llega codificado y no se puede decodificar, 404.
15. **"Hoy" para la completitud del perfil = día UTC** (`accounts-runner-profiles.md`, Decisión 15), calculado en la página de la ficha después de la guarda y pasado a `RunnerProfileDetails`.
16. **Componentes de shadcn.** Todos instalados: `table`, `badge`, `button` (`buttonVariants`), `input`, `label`, `native-select`, `card`, `alert-dialog`. Revisados y descartados: `tabs` (Base UI, de cliente; el filtro por rol es un `<form method="get">` sin JavaScript, patrón de `BookingFilters`), `separator` (sin necesidad) y un componente de lista de definiciones (no existe en `@shadcn`; se usa `<dl>`, patrón de la ficha de reserva).

### Visibilidad
| Dato | Lista (admin) | Ficha (admin) | Reserva vinculada (`runners.view`, F4) |
|---|---|---|---|
| Nombre, correo | Sí | Sí | Ya visibles en la reserva |
| Roles activos, marca | Sí | Sí | No |
| "Runner", reservas activas | Sí (número) | Sí (`BookingTable`, F3) | — |
| Historial de roles | No | Sí (F3) | No |
| Teléfono, país/ciudad, nacimiento, datos de carrera | No | Sí (F3) | Sí, de la cuenta vinculada (F4) |
| Documento, contacto de emergencia, datos médicos | No | Sí, "Dato sensible" (F3) | Sí, "Dato sensible" (F4) |

### Rutas (`app/`)
| Ruta | Fase | Contenido |
|---|---|---|
| `app/crm/(protected)/admin/usuarios/page.tsx` | F1 (mod. F2) | `metadata.title = "Usuarios"`. `getCrmAccess("staff.manage")`: `unauthenticated` → `redirect("/crm/acceso")`; `forbidden` → `h1` + texto sin permiso. `const filter = userListFilterSchema.parse(await searchParams)`; `const [{ users, truncated }, invitations] = await Promise.all([listUsers(filter), listPendingInvitations()])`. Compone `h1` "Usuarios", `InviteStaffForm`, `h2` "Cuentas" + `UserFilters` + `UserTable`, `h2` "Invitaciones pendientes" + `InvitationsTable`. F2: añade `listSponsors()` al `Promise.all` y pasa `sponsors={sponsors.map(({ id, name }) => ({ id, name }))}` a `InviteStaffForm` |
| `app/crm/(protected)/admin/usuarios/[id]/page.tsx` | F1 (mod. F3) | `metadata.title = "Usuario"`. Misma guarda (`h1` "Usuario" en `forbidden`). `getUserDetail(id)` (`null` → `notFound()`). Compone la cabecera (`h1` nombre o correo, correo, `Badge` de roles y `Runner`, "Marca: …"), "Roles" (`StaffTable` o el texto que corresponda) y "Volver a usuarios". F3: `Promise.all([getUserDetail(id), listBookingsByRunner(id)])`, "Historial de roles" (`RoleHistoryTable`) y, si `isRunner`, "Perfil de runner" (`RunnerProfileDetails` o texto) y "Reservas vinculadas" (`BookingTable bookings filtered={false}` o texto) |
| `app/crm/(protected)/reservas/[id]/page.tsx` | F4 (mod.) | Tras los datos de la reserva: si `booking.linked && can(access.user.staffRoles, "runners.view")`, `getBookingRunnerProfile(id)` → sección "Perfil del runner" con `RunnerProfileDetails` o "La persona aún no completó su perfil." |

`params` y `searchParams` son promesas (consultar `node_modules/next/dist/docs/` antes de escribirlas). `redirect()` y `notFound()` fuera de `try/catch`. Sin `loading.tsx` ni `error.tsx`: un fallo de la base llega al error boundary por defecto, que en producción no muestra el mensaje.

### Módulo `modules/accounts/`
| Archivo | Fase | Tipo | Cambio |
|---|---|---|---|
| `types/userDirectory.types.ts` | F1 (amp. F3) | nuevo, tipos | `UserRoleFilter`, `UserListFilter`, `UserListItem`, `UserDetail`; F3: `RoleHistoryEntry` y `UserDetail.roleHistory`/`runnerProfile` (ver "Contratos") |
| `schemas/userDirectory.schema.ts` | F1 | nuevo, zod | `userRoleFilterSchema`, `userListFilterSchema` |
| `services/userDirectory.service.ts` | F1 (mod. F3) | nuevo, `server-only` | `USER_LIST_LIMIT`, `listUsers`, `getUserDetail` |
| `utils/staffDisplay.ts` | F1 | existente | `USER_ROLE_FILTER_LABELS: Record<UserRoleFilter, string>` = `{ ...STAFF_ROLE_LABELS, runner: "Runner" }` (con `import type`; sigue sin `server-only`) |
| `services/staff.service.ts` | F1, F2 | existente | F1: `listStaffOverview` → `listPendingInvitations()` (solo la consulta de invitaciones). F2: `listPendingInvitations` con `LEFT JOIN sponsors` (`sponsorName`); `createInvitation(input: CreateInvitationInput, actor)` inserta `sponsorId`; `revokeStaffRole(input: RevokeStaffRoleInput, actor)` (SQL sin cambios) |
| `actions/staff.actions.ts` | F1, F2 | existente | F1: revalidación de lista y ficha (Decisión 11). F2: `inviteStaffAction` pasa `{ email, role, sponsorId }` y devuelve `acceptUrl` de `/patrocinador/acceso` si `role === "sponsor"` (si no, `/crm/acceso`); `revokeStaffRoleAction` valida con `revokeStaffRoleSchema`; `FIELD_MESSAGES.sponsorId = "Elige la marca del patrocinador."`. Mensaje de éxito y guarda sin cambios |
| `schemas/staff.schema.ts` | F2 | existente | `inviteStaffSchema`: `role` de `assignmentRoleSchema`; `sponsorId` (`z.uuid()`) obligatorio si `role = "sponsor"` (error en `sponsorId`) e ignorado si no; salida `{ email, role, sponsorId: string \| null }`. `revokeStaffRoleSchema = z.object({ userId: z.string().min(1).max(255), role: assignmentRoleSchema })`. `staffRoleSchema`, `staffRoleChangeSchema` e `invitationIdSchema` sin cambios |
| `types/staff.types.ts` | F2 | existente | `CreateInvitationInput` (= salida de `inviteStaffSchema`, sustituye a `InviteStaffInput`), `RevokeStaffRoleInput`, `PendingInvitation.sponsorName: string \| null` |
| `components/UserFilters.tsx` | F1 | nuevo, Server (patrón de `BookingFilters`; no existe un filtro de usuarios) | Props `{ q?: string; role?: UserRoleFilter }`. `<form method="get" action="/crm/admin/usuarios">`: `Label` "Buscar por nombre o correo" + `Input name="q" maxLength={100} defaultValue={q}`; `Label` "Rol" + `NativeSelect name="rol" defaultValue={role ?? ""}` con "Todos" y `USER_ROLE_FILTER_LABELS` en el orden de `userRoleFilterSchema.options`; `Button` "Buscar"; `Link` "Limpiar" (`buttonVariants({ variant: "ghost" })`) |
| `components/UserTable.tsx` | F1 | nuevo, Server (no existe una tabla de cuentas; `StaffTable` es por miembro con acciones) | Props `{ users: UserListItem[]; truncated: boolean; filtered: boolean }`. Columnas y textos de los criterios F1. `Badge variant="secondary"` por rol activo en el orden del enum (`Patrocinador · <marca>` si `sponsorName`), `Badge variant="outline"` "Runner" si `isRunner`, "Sin rol activo" (`text-muted-foreground`) si no hay ninguno |
| `components/InviteStaffForm.tsx` | F2 | existente, `"use client"` | Prop `sponsors: { id: string; name: string }[]`. Opciones de `assignmentRoleSchema.options` con `STAFF_ROLE_LABELS`; estado local del rol para mostrar "Marca" (`NativeSelect name="sponsorId"`, "Elige una marca" con valor vacío) solo con `sponsor`; `sponsor` deshabilitado y el aviso con enlace si `sponsors` está vacío; al tener éxito, además de `form.reset()`, el rol vuelve a `commercial`. Errores de `sponsorId` con el mismo patrón que `email` y `role` |
| `components/InvitationsTable.tsx` | F2 | existente, Server | Columna "Rol": `Patrocinador · <sponsorName>` si hay marca |
| `components/RoleHistoryTable.tsx` | F3 | nuevo, Server (no existe un historial de roles) | Props `{ entries: RoleHistoryEntry[] }`. Columnas y textos del criterio F3; `ROLE_ORIGIN_LABELS` local (`invitation` → "Invitación", `crm` → "Asignado en el CRM", `script` → "Alta por script"); fechas con `formatStaffDateTime` |
| `components/RunnerProfileDetails.tsx` | F3 | nuevo, Server (diseño de `accounts-runner-profiles.md` F3, que no se llegó a implementar) | Props `{ profile: RunnerProfile; today: string }`. Contenido del criterio F3 con `DOCUMENT_TYPE_LABELS`, `SHIRT_SIZE_LABELS`, `RACE_DISTANCE_LABELS`, `PROFILE_SECTION_LABELS`, `getMissingProfileSections`, `formatProfileTimestamp` y `formatTripDate` (`@/modules/trips`); `Card` por sección con `<dl>`; "Dato sensible" como `Badge variant="outline"` |
| `services/runnerProfile.service.ts` | F4 | existente | `getBookingRunnerProfile(bookingId)` (mismas columnas que `getRunnerProfile`) |
| `index.ts` | F1, F3, F4 | API pública | F1: añade `listUsers`, `getUserDetail`, `listPendingInvitations`, `userListFilterSchema`, `UserFilters`, `UserTable`; quita `listStaffOverview`. F3: `RoleHistoryTable`, `RunnerProfileDetails`. F4: `getBookingRunnerProfile` |

`modules/bookings/` (F3): `services/bookings.service.ts` añade `listBookingsByRunner(runnerUserId)` (mismas columnas y `GROUP BY` que `listBookings` mediante un helper interno; `listBookings` no cambia de firma ni de resultado) e `index.ts` lo exporta.

`lib/auth/permissions.ts` (F4): `Permission` añade `"runners.view"`; `PERMISSION_MATRIX["runners.view"] = ["commercial"]`. `can()` no cambia.

### Contratos (funciones de servidor; sin API HTTP)
```ts
// modules/accounts/schemas/userDirectory.schema.ts (F1)
export const userRoleFilterSchema = z.enum(["commercial", "admin", "sponsor", "runner"]); // runner = derivado
export const userListFilterSchema: z.ZodType<UserListFilter, { q?: unknown; rol?: unknown }>;
//   q: string, trim, 1–100; array, vacío o largo → undefined (.catch)
//   rol: userRoleFilterSchema; desconocido o array → undefined (.catch). Salida { q?, role? }

// modules/accounts/types/userDirectory.types.ts
export type UserRoleFilter = z.infer<typeof userRoleFilterSchema>;
export type UserListFilter = { q?: string; role?: UserRoleFilter };
export type UserListItem = {
  userId: string;
  name: string | null;          // Requisito 5
  email: string;
  roles: StaffRole[];           // asignaciones activas, orden del enum
  sponsorName: string | null;   // marca de la asignación sponsor activa
  isRunner: boolean;            // runner_profiles o alguna reserva vinculada
  activeBookings: number;       // reservas vinculadas no canceladas
};
export type UserDetail = {
  userId: string;
  name: string | null;
  email: string;
  hasRoleProfile: boolean;                  // fila en profiles
  member: StaffMember | null;               // roles activos con grantedAt (StaffTable); null sin roles activos
  sponsor: { id: string; name: string } | null;
  isRunner: boolean;
  roleHistory: RoleHistoryEntry[];          // F3
  runnerProfile: RunnerProfile | null;      // F3
};
export type RoleHistoryEntry = {          // F3
  id: string;
  role: StaffRole;
  sponsorName: string | null;
  origin: "invitation" | "crm" | "script";
  grantedAt: Date;
  grantedByEmail: string | null;
  revokedAt: Date | null;
  revokedByEmail: string | null;
};

// modules/accounts/services/userDirectory.service.ts (server-only, getDb())
export const USER_LIST_LIMIT = 200;
export async function listUsers(filter: UserListFilter): Promise<{ users: UserListItem[]; truncated: boolean }>;
export async function getUserDetail(userId: string): Promise<UserDetail | null>;
//   userId vacío o > 255 → null sin consultar.
//   F1: un db.batch: profiles; asignaciones activas (+ sponsors); runner_profiles (full_name, email);
//       reserva vinculada más reciente (participant_name, participant_email) y si existe alguna.
//   F3: el batch añade el historial y sustituye la lectura de runner_profiles por getRunnerProfile(userId) en paralelo.
//   Ninguna fila en profiles, runner_profiles ni reservas vinculadas → null.

// modules/accounts/services/staff.service.ts
export async function listPendingInvitations(): Promise<PendingInvitation[]>; // F1; F2 añade sponsorName
export async function createInvitation(input: CreateInvitationInput, actorUserId: string):
  Promise<{ id: string; expiresAt: Date } | "pending_invitation_exists">;    // F2: + sponsor_id
export async function revokeStaffRole(input: RevokeStaffRoleInput, actorUserId: string):
  Promise<"revoked" | "not_found" | "last_admin">;                           // F2: acepta sponsor; SQL igual

// modules/accounts/services/runnerProfile.service.ts (F4)
export async function getBookingRunnerProfile(bookingId: string): Promise<RunnerProfile | null>;

// modules/bookings/services/bookings.service.ts (F3)
export async function listBookingsByRunner(runnerUserId: string): Promise<CrmBookingListItem[]>;

// Server Actions: firma y StaffActionState sin cambios. FormData de inviteStaffAction (F2): email, role, sponsorId?
```

SQL orientativo de `listUsers` (una sentencia; el developer puede escribirla de forma equivalente):
```sql
WITH ids AS (
  SELECT user_id FROM profiles
  UNION SELECT user_id FROM runner_profiles
  UNION SELECT runner_user_id FROM bookings WHERE runner_user_id IS NOT NULL
), directory AS (
  SELECT ids.user_id,
         coalesce(rp.full_name, lb.participant_name)            AS name,
         coalesce(p.email, rp.email, lb.participant_email)      AS email,
         coalesce(a.roles, '{}')                                AS roles,      -- text[]
         a.sponsor_name,
         (rp.user_id IS NOT NULL OR lb.participant_email IS NOT NULL) AS is_runner,
         coalesce(bk.active, 0)                                 AS active_bookings
  FROM ids
  LEFT JOIN profiles p         ON p.user_id = ids.user_id
  LEFT JOIN runner_profiles rp ON rp.user_id = ids.user_id
  LEFT JOIN LATERAL (SELECT array_agg(sa.role::text ORDER BY sa.role) AS roles, max(s.name) AS sponsor_name
                     FROM staff_assignments sa LEFT JOIN sponsors s ON s.id = sa.sponsor_id
                     WHERE sa.user_id = ids.user_id AND sa.revoked_at IS NULL) a ON true
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE status <> 'cancelled') AS active
                     FROM bookings WHERE runner_user_id = ids.user_id) bk ON true
  LEFT JOIN LATERAL (SELECT participant_name, participant_email FROM bookings
                     WHERE runner_user_id = ids.user_id ORDER BY created_at DESC, id LIMIT 1) lb ON true
)
SELECT user_id, name, email, roles, sponsor_name, is_runner, active_bookings FROM directory
WHERE ($q::text IS NULL OR strpos(lower(coalesce(name, '')), lower($q)) > 0 OR strpos(email, lower($q)) > 0)
  AND ($role::text IS NULL OR ($role = 'runner' AND is_runner) OR $role = ANY (roles))
ORDER BY lower(coalesce(name, email)), user_id
LIMIT 201;
```
Notas: `role::text` en el `array_agg` hace que el driver devuelva un array de JS (un array del enum llegaría como texto); `count(*)` es `bigint` y se convierte a número (como `paidUsd` en `listBookings`). Los correos ya están en minúsculas por los CHECK de las tres tablas.

### Wireframes (escritorio, orientativo)
```
│ Usuarios                                                                   (h1) │
│ Invitar a una persona   Correo [            ] Rol [Patrocinador ▾] Marca [Marca Norte ▾] [Invitar] │
│ Cuentas                                                                    (h2) │
│ Buscar por nombre o correo [ana        ]  Rol [Todos ▾]  [Buscar]  Limpiar      │
│ Usuario                      Roles                              Reservas activas │
│ Ana Pérez                    [Runner]                           1                │
│   ana@correo.com                                                                 │
│ luis@carreras.com            [Comercial] [Runner]               0                │
│ lucia@marca.com              [Patrocinador · Marca Norte]       0                │
│ pedro@carreras.com           Sin rol activo                     0                │
│ Invitaciones pendientes                                                    (h2) │

│ Ana Pérez                                                                  (h1) │
│ ana@correo.com · [Runner]                                                        │
│ Roles: Esta cuenta no tiene roles del equipo ni de patrocinador. Para dárselos…  │
│ Historial de roles (F3) · Perfil de runner (F3) · Reservas vinculadas (F3)       │
│ Volver a usuarios                                                                │
```

## Reutilización
- `getCrmAccess`, `CrmShell` (sin cambios; ya enlaza "Usuarios" con `staff.manage`), `NoCrmAccess`, layout protegido, `InviteStaffForm`, `InvitationsTable`, `StaffTable`, `ConfirmActionButton` (`components/shared/`), las cuatro Server Actions de staff y sus mensajes, `grantStaffRole`/`revokeStaffRole` (último admin), `createInvitation`, `assignmentRoleSchema`, `staffRoleSchema`, `STAFF_ROLE_LABELS`, `formatStaffDateTime`.
- `getRunnerProfile`, `RunnerProfile`, `getMissingProfileSections`, etiquetas y `formatProfileTimestamp` de `runnerProfileDisplay.ts`.
- `BookingTable` y las columnas de `listBookings` (`@/modules/bookings`); `formatTripDate` (`@/modules/trips`); `listSponsors` (`@/modules/sponsors`, F2 de esa spec).
- `can()` y `requirePermission` de `lib/auth/`; `getDb()`/`db.batch`.
- Patrones: `BookingFilters` (`<form method="get">`), página de reservas (`z…catch(undefined)` sobre `searchParams`, `Promise.all`), ficha de reserva (`<dl>`), fake de Neon HTTP de `staff.service.test.ts`.
- shadcn instalados: `table`, `badge`, `button`, `input`, `label`, `native-select`, `card`, `alert-dialog`. No se instala nada ni se añaden dependencias.

## Tests
Los de servidor con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`, sin red ni secretos.
- `modules/accounts/schemas/userDirectory.schema.test.ts` (F1): `q` recortado; `""`, `"   "`, array y 101 caracteres → `undefined`; `rol` válido por cada opción; desconocido, vacío o array → `undefined`; salida con la clave `role`; claves extra descartadas.
- `modules/accounts/services/userDirectory.service.test.ts` (F1, F3; `@/lib/db` con el fake de Neon HTTP; F3 mockea `getRunnerProfile`): `listUsers` (criterio F1: unión de los tres orígenes, búsqueda, cada filtro de rol, orden, `LIMIT 201` y `truncated` con 201 filas, mapeo de `roles`/`activeBookings` a tipos de JS, sin columnas sensibles en el SQL). `getUserDetail` (criterios F1 y F3: id inválido sin consulta, un batch filtrado por id, `null` sin filas, precedencia de identidad, `member`, `sponsor`, historial y `origin`, sin `reason` en el `SELECT`).
- `modules/accounts/services/staff.service.test.ts` (F1, F2): F1: `listPendingInvitations` (un `SELECT`, predicado de pendiente, `expired`); se quitan los casos de `listStaffOverview`. F2: `createInvitation` con y sin `sponsorId`; `listPendingInvitations` con `sponsorName`; `revokeStaffRole` con `sponsor`.
- `modules/accounts/actions/staff.actions.test.ts` (F1, F2): F1: revalidación de las dos rutas solo con éxito, en cada acción. F2: casos de `inviteStaffAction` y `revokeStaffRoleAction` del criterio F2; `grantStaffRoleAction` con `sponsor` → `invalid_input`; los casos existentes siguen pasando.
- `modules/accounts/schemas/staff.schema.test.ts` (F2): casos del criterio F2 de `inviteStaffSchema`, `revokeStaffRoleSchema` y `staffRoleChangeSchema`.
- `modules/bookings/services/bookings.service.test.ts` (F3, ampliar): `listBookingsByRunner`.
- `lib/auth/permissions.test.ts` (F4, ampliar): filas de `runners.view`; bucles de admin y sin roles.
- `modules/accounts/services/runnerProfile.service.test.ts` (F4, ampliar): `getBookingRunnerProfile`.
- Sin unit tests (SETUP §3 o por limitación): tipos; `staffDisplay.ts` (`USER_ROLE_FILTER_LABELS` es un `Record` que TypeScript obliga a completar); componentes del módulo (`UserFilters`, `UserTable`, `RoleHistoryTable`, `RunnerProfileDetails`, `InviteStaffForm`, `InvitationsTable`, `StaffTable`: de un solo dominio, su lógica está en schemas, services y acciones); páginas async de `app/`. Se cubren con los criterios y el checklist manual.

## Plan de tareas
Cada fase termina con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer). Los developers en paralelo solo verifican sus archivos con `vitest`/`eslint`. Nadie aplica migraciones (esta spec no tiene), despliega ni hace commits.

### Fase 1 — Lista unificada con búsqueda y filtro, y ficha con roles (5 tareas, 15 archivos)
Requisito previo: las migraciones de `accounts-runner-profiles.md` F1 y `sponsors-portal.md` F1 aplicadas en la rama de Neon de prueba (y en `production` antes de desplegar): la lista lee `runner_profiles` y `sponsors`.
- [ ] T1 — Base compartida: tipos del directorio, schema del filtro con tests y etiquetas del filtro · archivos: `modules/accounts/types/userDirectory.types.ts`, `modules/accounts/schemas/userDirectory.schema.ts`, `modules/accounts/schemas/userDirectory.schema.test.ts`, `modules/accounts/utils/staffDisplay.ts` · depende de: — · secuencial (base)
- [ ] T2 — Service del directorio (`listUsers`, `getUserDetail`) con tests · archivos: `modules/accounts/services/userDirectory.service.ts`, `modules/accounts/services/userDirectory.service.test.ts` · depende de: T1 · paralelo (con T3 y T4)
- [ ] T3 — `listPendingInvitations` en lugar de `listStaffOverview` y revalidación de lista y ficha en las acciones, con tests · archivos: `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts`, `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: — · paralelo (con T2 y T4; archivos disjuntos)
- [ ] T4 — Componentes `UserFilters` y `UserTable` · archivos: `modules/accounts/components/UserFilters.tsx`, `modules/accounts/components/UserTable.tsx` · depende de: T1 · paralelo (con T2 y T3)
- [ ] T5 — API pública, página de lista reescrita y ficha; comprobar `ƒ /crm/admin/usuarios/[id]` y medir el Worker (`build:worker` + `wrangler deploy --dry-run`, Linux/WSL, sin desplegar) · archivos: `modules/accounts/index.ts`, `app/crm/(protected)/admin/usuarios/page.tsx`, `app/crm/(protected)/admin/usuarios/[id]/page.tsx` · depende de: T2, T3, T4 · secuencial

### Fase 2 — Invitar como Patrocinador y revocar Patrocinador (5 tareas, 11 archivos)
Requisitos previos: Fase 1 cerrada; `sponsors-portal.md` F2 cerrada (ya hecha); la enmienda de `sponsors-portal.md` (F3 reducida a T4) aprobada para que nadie implemente dos veces lo mismo.
- [ ] T1 — Schemas de invitación con marca y de revocación con `sponsor`, con tests; tipos `CreateInvitationInput`, `RevokeStaffRoleInput` y `PendingInvitation.sponsorName` · archivos: `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/accounts/types/staff.types.ts` · depende de: Fase 1 · secuencial
- [ ] T2 — `createInvitation` con `sponsor_id`, `listPendingInvitations` con la marca y `revokeStaffRole` con `RevokeStaffRoleInput`, con tests · archivos: `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — `inviteStaffAction` (enlace según el rol, `sponsorId`) y `revokeStaffRoleAction` con `revokeStaffRoleSchema`, con tests · archivos: `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `InviteStaffForm` con `Patrocinador` y "Marca", `InvitationsTable` con la marca y la página con `listSponsors` · archivos: `modules/accounts/components/InviteStaffForm.tsx`, `modules/accounts/components/InvitationsTable.tsx`, `app/crm/(protected)/admin/usuarios/page.tsx` · depende de: T3 · secuencial
- [ ] T5 — README, sección "Usuarios del CRM" (criterio F2) · archivos: `README.md` · depende de: — · paralelo (con T1–T4)

### Fase 3 — Ficha completa: historial, perfil de runner y reservas (4 tareas, 11 archivos)
Requisitos previos: Fase 1 cerrada; la enmienda de `accounts-runner-profiles.md` (F3 sustituida) aprobada. Para ver datos reales: `accounts-runner-profiles.md` F2 (perfiles) y `runner-portal.md` F5 (reservas vinculadas). Si `runner-portal.md` F3–F5 están en curso, T1 y T4 no se ejecutan en paralelo con ellas (`modules/bookings/index.ts`).
- [ ] T1 — `listBookingsByRunner` en `bookings` con tests y export · archivos: `modules/bookings/services/bookings.service.ts`, `modules/bookings/services/bookings.service.test.ts`, `modules/bookings/index.ts` · depende de: Fase 1 · paralelo (con T2)
- [ ] T2 — `getUserDetail` con historial y perfil de runner, con tests; tipo `RoleHistoryEntry` · archivos: `modules/accounts/services/userDirectory.service.ts`, `modules/accounts/services/userDirectory.service.test.ts`, `modules/accounts/types/userDirectory.types.ts` · depende de: Fase 1 · paralelo (con T1)
- [ ] T3 — Componentes `RoleHistoryTable` y `RunnerProfileDetails` · archivos: `modules/accounts/components/RoleHistoryTable.tsx`, `modules/accounts/components/RunnerProfileDetails.tsx` · depende de: T2 · secuencial
- [ ] T4 — Exports, secciones nuevas de la ficha y README ("Usuarios del CRM": ficha completa, datos sensibles, de dónde salen las reservas vinculadas); medir el Worker · archivos: `modules/accounts/index.ts`, `app/crm/(protected)/admin/usuarios/[id]/page.tsx`, `README.md` · depende de: T1, T3 · secuencial

### Fase 4 — Perfil del runner en la reserva para el equipo comercial (3 tareas, 7 archivos)
Requisito previo: Fase 3 cerrada. Si la respuesta a la Pregunta abierta 1 es "solo admin", esta fase no se hace. Si `runner-portal.md` F3 o F4 están en curso, T3 se ejecuta después de ellas (`app/crm/(protected)/reservas/[id]/page.tsx`).
- [ ] T1 — Base compartida: permiso `runners.view` (commercial; admin implícito) con tests · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: Fase 3 · secuencial (base, `lib/`)
- [ ] T2 — `getBookingRunnerProfile` con tests y export · archivos: `modules/accounts/services/runnerProfile.service.ts`, `modules/accounts/services/runnerProfile.service.test.ts`, `modules/accounts/index.ts` · depende de: T1 · secuencial
- [ ] T3 — Sección "Perfil del runner" en la ficha de la reserva y README · archivos: `app/crm/(protected)/reservas/[id]/page.tsx`, `README.md` · depende de: T2 · secuencial

## Orden de entrega recomendado (todas las specs)
Ya está hecho en esta rama: `accounts-roles-permissions.md` F1–F3, `accounts-runner-profiles.md` F1 (F2 en curso), `sponsors-portal.md` F1–F2 y `runner-portal.md` F1–F2.

| Paso | Fase | Qué ve el usuario | Requisito previo |
|---|---|---|---|
| 1 | **Esta spec F1** | Lista única con todos, filtro y búsqueda; ficha con asignar y revocar | Migraciones de F1 de perfiles y patrocinadores aplicadas |
| 2 | `sponsors-portal.md` F2 (**ya hecha**) | Alta y edición de marcas | — |
| 3 | **Esta spec F2** | Invitar como Patrocinador con su marca; revocar Patrocinador | Paso 2; enmienda de `sponsors-portal.md` |
| 4 | `sponsors-portal.md` F3 (solo T4) y F4 | El patrocinador invitado entra en `/patrocinador` ("usable") | Paso 3 (para la prueba manual con una invitación real) |
| 5 | `accounts-runner-profiles.md` F2 (en curso: falta T5) | `/cuenta/perfil`: los runners aparecen en la lista | Para T5, enmienda de `landing-public-site.md` aprobada (la de `accounts-auth-ui.md` ya lo está) |
| 6 | **Esta spec F3** | Ficha completa: historial, perfil de runner, reservas | Paso 1; enmienda de `accounts-runner-profiles.md` |
| 7 | **Esta spec F4** | El comercial ve el perfil en la reserva | Paso 6; salvo que la Pregunta abierta 1 se responda "solo admin" |
| — | `sponsors-portal.md` F5–F7, `runner-portal.md` F3–F6 | Eventos de marca y portal del runner | Independientes; `runner-portal.md` F5 es la que vincula reservas a cuentas |

Los pasos 5 y 6 son independientes de los pasos 2–4: como el paso 5 ya está en curso, puede cerrarse antes o después del paso 1, pero **no en paralelo con F1-T5** (ambos tocan `modules/accounts/index.ts`).

## Coordinación
- `modules/accounts/index.ts`: lo tocan esta spec (F1, F3, F4), `accounts-runner-profiles.md` F2-T5 (en curso) y `sponsors-portal.md` F4-T1. Se ejecutan en secuencia; F1-T5 parte de lo que haya integrado en ese momento y conserva sus exports.
- `staff.schema.ts`, `staff.service.ts`, `staff.actions.ts`, `InviteStaffForm.tsx`, `InvitationsTable.tsx`, `StaffTable.tsx`: tras la enmienda, solo los toca esta spec.
- `modules/bookings/index.ts` y `bookings.service.ts`: esta spec F3-T1 y `runner-portal.md` F3–F5; en secuencia.
- `app/crm/(protected)/reservas/[id]/page.tsx`: esta spec F4-T3 y `runner-portal.md` F3-T4/F4-T5; en secuencia.
- `lib/auth/permissions.ts`: esta spec F4-T1 (sustituye a `accounts-runner-profiles.md` F3-T1).
- `CrmShell.tsx`: esta spec no lo cambia (ya enlaza "Usuarios" y, desde `sponsors-portal.md` F2, "Patrocinadores").
- `README.md`: lo tocan varias specs; cada tarea solo edita su sección.

## Cambios que requiere en otras specs (no editados aquí; cada una vuelve a `borrador` y necesita tu aprobación)
1. **`sponsors-portal.md` — antes de la Fase 2 de esta spec.** Su F3 queda reducida a **una sola tarea, F3-T4** (audiencia `sponsor` en `AccessPanel`, `AuthDestination`/`SignOutDestination`), que no cambia. **Dejan de hacerse:**
   - **F3-T1:** `inviteSponsorMemberSchema`, `InviteSponsorMemberInput` y `StaffOverviewScope` no se crean. `revokeStaffRoleSchema`, `RevokeStaffRoleInput` y `CreateInvitationInput` los hace esta spec (F2-T1), con `sponsorId` dentro de `inviteStaffSchema`.
   - **F3-T2:** `createInvitation` con `sponsorId` lo hace esta spec (F2-T2). `listStaffOverview(scope)` no se hace: `listStaffOverview` desaparece en esta spec (F1-T3).
   - **F3-T3:** `inviteSponsorMemberAction` no existe; `inviteStaffAction` acepta `sponsor` (F2-T3). La revocación de `sponsor` la hace esta spec (F2-T3). No se revalida `/crm/admin` como layout.
   - **F3-T5:** no hay sección "Personas con acceso" en `/crm/admin/patrocinadores/<id>`, ni prop `sponsorId` en `InviteStaffForm`, ni `assignableRoles` en `StaffTable`; `[id]/page.tsx` de marcas no se modifica en F3.
   - Criterios de F3 sustituidos por los de F2 de esta spec: personas de la marca, "la invitación aparece en la marca y **no** en `/crm/admin/usuarios`", "`/crm/admin/usuarios` excluye el rol `sponsor`", `createInvitation`, `inviteSponsorMemberAction` y `grant/revoke` con `sponsor`. Se mantiene el criterio de `AccessPanel audience="sponsor"`.
   - Alcance F3, Decisión 1 (riesgo "Mezcla en la lista del equipo": ahora la lista muestra a todos con su rol y filtro), Decisión 10 ("la página de usuarios sigue siendo del equipo") y las filas F3 de "Cambios en `modules/accounts/`" quedan sustituidas. La Decisión 9 (invitar y revocar personas con `staff.manage`) se mantiene.
   - F4 (prueba manual), F5-T5 (README "crear marca → invitar") y el checklist manual en producción: la invitación se crea en `/crm/admin/usuarios` con rol `Patrocinador` y la marca.
2. **`accounts-runner-profiles.md` — antes de la Fase 3 de esta spec.** Su **F3 completa queda sustituida** y no se implementa:
   - **F3-T1** (`runners.view`): lo hace esta spec en F4-T1, con el mismo valor (`["commercial"]`).
   - **F3-T2** (`listBookingsByRunner`): lo hace esta spec en F3-T1.
   - **F3-T3** (`runnerDirectory.service.ts`: `listRunners`, `getRunnerDetail`; tipos `RunnerListItem`, `CrmRunnerDetail`): no se hace; lo sustituyen `listUsers`/`getUserDetail` (`userDirectory.service.ts`).
   - **F3-T4:** `RunnerSearch` y `RunnerTable` no se hacen (`UserFilters`/`UserTable`); `RunnerProfileDetails` lo hace esta spec en F3-T3 con el mismo diseño.
   - **F3-T5:** no se añaden el enlace "Corredores" a `CrmShell` ni `/crm/corredores` ni `/crm/corredores/[id]`; el README lo cubre esta spec.
   - Objetivo (punto 2), Alcance F3, Requisitos 8–10, tabla "Visibilidad", criterios F3 y Decisiones 11–13 quedan sustituidos por los de esta spec (la ficha es de admin; el comercial ve el perfil desde la reserva vinculada). F1 y F2 no cambian.
3. **`accounts-roles-permissions.md` — no bloqueante (implementada; solo descripción).**
   - F3: la página se titula "Usuarios"; "Equipo activo" se sustituye por "Cuentas" (lista unificada de solo lectura) y `StaffTable` pasa a la ficha `/crm/admin/usuarios/<id>`; los criterios "su fila ofrece Asignar Admin…" aplican a la ficha; el texto sin permiso pasa a "No tienes permiso para gestionar usuarios…"; "No incluye: búsqueda" deja de aplicar (búsqueda y filtro incluidos, sin paginación); `listStaffOverview` se sustituye por `listPendingInvitations` + `listUsers`.
   - F2: `inviteStaffSchema` acepta `sponsor` con `sponsorId` ("rol fuera de `commercial|admin` → `invalid_input`" pasa a "fuera de `commercial|admin|sponsor`, o `sponsor` sin marca"); `revokeStaffRoleAction` acepta `sponsor`; las acciones revalidan también la ficha.
   - Matriz: `runners.view` (`commercial`) desde F4 de esta spec. "Los runners son visitantes anónimos" ya no es cierto: tienen cuenta, perfil y reservas, y aparecen como "Runner" derivado sin roles.
4. **`runner-portal.md`:** sin cambios funcionales; solo la coordinación de "Coordinación".
5. **`accounts-auth-ui.md`, `landing-public-site.md` (enmiendas en borrador), `trips-catalog.md`, `crm-leads-pipeline.md`, `platform-neon-foundation.md`:** sin cambios.

## Preguntas abiertas
1. **(No bloqueante; decide si se hace la Fase 4) ¿El equipo comercial debe ver el perfil del runner?** `accounts-runner-profiles.md` lo había aprobado para `commercial` con un directorio propio (`/crm/corredores`). Con una sola pantalla de usuarios solo para admin, la propuesta por defecto es que `commercial` vea el perfil (documento, talla, contacto de emergencia) **solo dentro de la ficha de una reserva vinculada** (F4, `runners.view`): es lo que necesita para organizar el viaje y no le da acceso a un directorio de todas las cuentas. Alternativa: solo el admin ve perfiles; entonces F4 no se hace y `runners.view` no se crea. Si no respondes, se implementa la propuesta.
2. **(No bloqueante) ¿Una persona patrocinadora puede tener también un rol del equipo?** Hoy nada lo impide y la ficha ofrecerá "Asignar Comercial"/"Asignar Admin" a cualquier cuenta con perfil de rol, también a una de marca, con confirmación. Esa persona vería el CRM (leads, reservas) además de su portal. Propuesta por defecto: se mantiene así (el admin decide y confirma). Si prefieres prohibirlo, se añade la condición en `grantStaffRole` (sin rol `sponsor` activo → `no_change`) y se ocultan esos botones en su ficha.
