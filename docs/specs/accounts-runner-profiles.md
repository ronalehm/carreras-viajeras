# Perfil del runner: `/cuenta/perfil` y fichas de corredores en el CRM

- Módulo: accounts
- Estado: aprobado
- Depende de:
  - `platform-neon-foundation.md` (aprobada): Neon + Drizzle `neon-http` (`getDb()`), schema en `lib/db-schema.ts`, migraciones generadas con `npm run db:generate` y aplicadas a mano por el usuario. Datos personales fuera de logs y errores.
  - `accounts-roles-permissions.md` (aprobada, implementada): `getCurrentUser`, `requireVerifiedEmail`, `requirePermission`, `can()`, `getCrmAccess(permission)`, `UnauthorizedError`/`ForbiddenError`. `profiles` y `staff_*` son solo del staff. CRM denegado por defecto.
  - `accounts-auth-ui.md` (aprobada; F4 implementada): cuenta del runner en `/cuenta` (`RunnerAccount`, `AccessPanel audience="runner"`, `SignOutButton redirectTo="/cuenta"`). **La Fase 2 de esta spec requiere enmendarla** (ver "Cambios que requiere en otras specs").
  - `landing-public-site.md` (aprobada; F1–F4 en `main`): `/cuenta` estática con `SiteHeader`/`SiteFooter` y `AccountSection`. **La Fase 2 requiere enmendarla.**
  - `runner-portal.md` (aprobada; F1 y F2 en `main`, F3–F6 pendientes): `bookings.runner_user_id`, `listBookings`, `BookingTable`, permiso `bookings.manage`, CRM de reservas. El vínculo reserva ↔ cuenta lo hace `/mis-carreras` (F5). Ver "Compatibilidad con `runner-portal.md`".
  - `trips-catalog.md` (aprobada): `formatTripDate` de `@/modules/trips` (fechas de calendario).
- Base revisada: `main` en `0b5f723`. En paralelo se redacta otra spec para un rol "patrocinador"; esta spec no lo incluye (ver Decisión 19).

## Objetivo
Hoy el runner tiene una cuenta de Neon Auth pero ningún dato propio: el equipo pide por WhatsApp, en cada viaje, el nombre completo, el documento, la talla de polo o un contacto de emergencia, y los guarda donde puede. Esta spec añade:

1. **Un perfil del runner** que él mismo completa y edita en `/cuenta/perfil`, con sus datos personales básicos, su documento de viaje, sus datos de carrera y un contacto de emergencia.
2. **Fichas de corredores en el CRM, de solo lectura**, para `admin` y `commercial`: `/crm/corredores` (lista con búsqueda) y `/crm/corredores/<id>` (perfil completo y reservas vinculadas), con el permiso nuevo `runners.view`.

Orden: **datos y servidor → página del runner → CRM.**

## Alcance
- Incluye:
  - (F1) Tabla `runner_profiles` y tres enums en `public`, en una migración generada con `npm run db:generate` y aplicada a mano por el usuario. Helpers de formulario compartidos en `lib/form-schema.ts`. Schema zod del perfil, tipos, utilidades de presentación (etiquetas, secciones incompletas) y service de lectura/guardado del propio perfil, con tests. README: migración y pruebas manuales.
  - (F2) `/cuenta/perfil`: guarda en el servidor, estados (sin verificar, error, perfil vacío, perfil incompleto, perfil completo), formulario de edición y Server Action de guardado. Enlace "Mi perfil" en `/cuenta` con sesión. Ajuste del texto de `AccountSection` ("no hay perfiles persistentes" deja de ser cierto). README: modelo de acceso.
  - (F3) CRM: permiso `runners.view` (admin y commercial), enlace "Corredores" en `CrmShell`, `/crm/corredores` (búsqueda simple por nombre o correo, máximo 200 filas) y `/crm/corredores/<id>` (ficha con el perfil y las reservas vinculadas). Lectura de reservas por `runner_user_id` en `modules/bookings`. README.
  - Medición del tamaño del Worker al cerrar F2 y F3.
- No incluye:
  - El rol "patrocinador" y cualquier permiso suyo (otra spec).
  - Edición del perfil por el equipo, notas internas sobre el runner, etiquetas o segmentación. El CRM es de solo lectura.
  - Paginación, filtros avanzados (por viaje, país, talla, perfil incompleto) y exportación (CSV, Excel) de corredores (Decisión 11).
  - Borrado del perfil por el runner desde la web; la supresión a petición se hace a mano por SQL (README, Decisión 18).
  - Cambio del correo o de la contraseña con sesión (sigue fuera, `accounts-auth-ui.md`).
  - Foto, biografía, redes sociales, perfil público, comunidad, estrellas o recompensas.
  - Vincular reservas desde el perfil o por el correo del perfil: el vínculo sigue siendo el de `runner-portal.md` (Decisión 10).
  - Prellenar reservas con los datos del perfil, o usar el perfil en `/mis-carreras` (posible fase futura, ver "Compatibilidad").
  - Cifrado de columnas en la aplicación (Decisión 8).
  - Nueva API HTTP: las lecturas son funciones de servidor y la escritura es una Server Action.
  - Cambios en `/crm/acceso`, en la matriz de los permisos existentes, en `profiles`/`staff_*`/`bookings`/`trips`/`leads`, en el destino tras el login o en `/mis-carreras`.
  - Migrar las copias existentes de `blankToNull`/`requiredText`/teléfono E.164 de `trips`, `bookings` y `crm` a `lib/form-schema.ts` (refactor de seguimiento en modo build, Decisión 16).

## Requisitos
1. **Identidad.** El perfil pertenece a la cuenta de Neon Auth: su clave es el `user.id` de la sesión. No se crean filas en `profiles` ni `staff_*`, no se lee ni modifica `neon_auth` y no hay FK hacia ese esquema. Una cuenta de staff también puede tener su perfil de runner; eso no cambia sus roles.
2. **Acceso del runner a `/cuenta/perfil`** (reutiliza `getCurrentUser`, sin guardas nuevas en `lib/auth/`):
   - sin sesión → `redirect("/cuenta")`;
   - con sesión y correo sin verificar → estado "Verifica tu correo" (sin consultar el perfil ni redirigir, para no crear un bucle con `/cuenta`);
   - fallo de Neon Auth o de la base (`ForbiddenError` de `getCurrentUser`, o error al leer el perfil) → estado de error;
   - con correo verificado → formulario con su perfil (o vacío si aún no existe).
3. **Escritura del runner.** Una sola Server Action, `saveRunnerProfileAction`: `requireVerifiedEmail()` → zod → una única sentencia `INSERT … ON CONFLICT (user_id) DO UPDATE` con el `user_id` y el correo **de la sesión**. El formulario nunca envía el `user_id` ni el correo; cualquier campo extra (`userId`, `email`, `consentVersion`, `createdAt`…) se descarta en el schema. Ninguna sentencia toca filas de otro `user_id` (sin IDOR).
4. **Campos del perfil** (ver "Modelo de datos"):
   - **Datos personales:** nombre completo y teléfono/WhatsApp (obligatorios), país, ciudad y fecha de nacimiento.
   - **Documento de viaje (dato sensible):** tipo, número y fecha de vencimiento.
   - **Datos de carrera:** talla de polo, distancia preferida, mejor marca y club/equipo.
   - **Contacto de emergencia:** nombre y teléfono; alergias o condiciones médicas (opcional, **dato sensible**).
   - Solo nombre y teléfono son obligatorios: el runner puede guardar por partes. Los grupos son coherentes: tipo y número de documento van juntos (el vencimiento exige documento); nombre y teléfono de emergencia van juntos.
5. **Perfil completo** (derivado al leer, no se guarda): las cuatro secciones lo están si hay país, ciudad y fecha de nacimiento (personales); tipo, número y vencimiento no vencido (documento); talla de polo (carrera); nombre y teléfono de emergencia (emergencia). Distancia preferida, mejor marca, club y datos médicos son opcionales y no cuentan.
6. **Consentimiento.** Cada guardado exige marcar "Acepto que Carreras Viajeras guarde estos datos, incluidos mi documento y mi información médica, para organizar mis viajes. Solo los ve el equipo de Carreras Viajeras." y registra `consent_version` (constante del servidor) y `consented_at = now()`.
7. **Datos sensibles.** Documento (tipo, número, vencimiento) y datos médicos, y por extensión la fecha de nacimiento y el contacto de emergencia:
   - nunca en logs, `Error.message`, `cause` ni respuestas de error (el detalle de un error de Postgres incluye los valores de la fila: nunca se registra ni se propaga);
   - la respuesta de la Server Action no devuelve valores del formulario (`values`): el formulario conserva lo escrito porque no se reinicia (Decisión 8);
   - la lista del CRM no los selecciona en SQL (Requisito 9);
   - en el CRM solo se muestran en la ficha, en Server Components, bajo el rótulo "Dato sensible".
8. **Permiso `runners.view`.** Lo tienen `admin` y `commercial` (matriz `["commercial"]`; admin tiene todos). Cada página del CRM comprueba `getCrmAccess("runners.view")`. Una cuenta sin rol de staff ve `NoCrmAccess`; sin sesión, `redirect("/crm/acceso")`.
9. **Lista del CRM (`/crm/corredores`).** Muestra a las cuentas que tienen perfil **y/o** al menos una reserva vinculada (`bookings.runner_user_id`); no se puede listar `neon_auth`. Columnas: Nombre (enlace a la ficha), Correo, Ciudad y país, Perfil ("Con perfil"/"Sin perfil"), Reservas activas (no canceladas) y Actualizado. Sin perfil, nombre y correo salen de la reserva vinculada más reciente. Búsqueda `?q=` por nombre o correo (subcadena, sin distinguir mayúsculas). Orden alfabético por nombre. Máximo 200 filas, con aviso si hay más.
10. **Ficha del CRM (`/crm/corredores/<id>`).** Nombre, correo, estado del perfil, secciones del perfil (personales, documento, carrera, emergencia y consentimiento), las secciones que faltan, y "Reservas vinculadas" (`runner_user_id = <id>`) con `BookingTable`. Solo lectura: sin formularios ni acciones. Un id que no tiene perfil ni reservas vinculadas → 404.
11. **Rendimiento (Workers Free).** `/cuenta` sigue estática (`○`). `/cuenta/perfil`: `getCurrentUser` (existente) + 1 consulta. `/crm/corredores`: 1 consulta. Ficha: 1 batch + 1 consulta de reservas.

## Criterios de aceptación

### Fase 1 — Datos, schemas y service del perfil (sin UI)
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera **una sola** migración nueva con el **siguiente número libre** de la rama (hoy sería `0004` sobre `0b5f723`, pero puede ser otro si la spec del patrocinador u otra integra antes la suya; nunca se edita una migración ya aplicada) con los enums `travel_document_type`, `shirt_size` y `race_distance` y la tabla `runner_profiles` con su PK y sus CHECK. El SQL no contiene `neon_auth`, `DROP`, `CREATE SCHEMA`, `REFERENCES` ni `ALTER TABLE` sobre tablas existentes, y `drizzle.config.ts` no cambia.
- [ ] (F1, manual del usuario en una rama de desarrollo de Neon) Con la migración aplicada, la base acepta una fila mínima (`user_id`, `email`, `full_name`, `phone`, `consent_version`) y rechaza: correo con mayúsculas; teléfono sin `+` o con letras; `full_name` de 1 carácter; `document_type` sin `document_number` (y al revés); `document_number` con minúsculas o espacios; `document_expires_on` sin documento; nombre de emergencia sin teléfono (y al revés); `birth_date = '1899-12-31'`; `medical_notes` de 501 caracteres; una talla fuera del enum; una segunda fila con el mismo `user_id`.
- [ ] (F1) Dado `lib/form-schema.ts` (unit test): `blankToNull` convierte `""`, `"   "` y la clave ausente en `null` y valida el resto recortado; `requiredText` recorta y aplica mínimo y máximo con el mensaje dado; `e164PhoneSchema` normaliza `"+51 938-127.170"` → `"+51938127170"` y rechaza `"938127170"`, `"+0123456789"` y `"+51abc"` con el mensaje dado.
- [ ] (F1) Dado `runnerProfileFormSchema(today)` (unit test, `today = "2026-10-25"`):
  - acepta solo `fullName`, `phone` y `consent = "on"`; el resto queda en `null`;
  - descarta claves extra (`userId`, `email`, `consentVersion`, `consentedAt`, `createdAt`);
  - `documentNumber` `" ab-123.456 "` → `"AB123456"`; `"ab"` y `"ÑÑÑÑ"` → error;
  - documento con tipo y sin número → error en `documentNumber` ("Indica el número del documento."); número sin tipo → error en `documentType` ("Elige el tipo de documento."); vencimiento sin documento → error en `documentType`;
  - `documentExpiresOn` `"2026-10-24"` → error ("La fecha de vencimiento ya pasó."), `"2026-10-25"` → válido;
  - `birthDate` `"2026-10-26"` o `"1899-12-31"` → error ("Indica una fecha de nacimiento válida.");
  - nombre de emergencia sin teléfono → error en `emergencyContactPhone`; teléfono sin nombre → error en `emergencyContactName`;
  - `medicalNotes` de 501 caracteres → error; `consent` ausente → error en `consent`;
  - `documentType`, `shirtSize` y `preferredDistance` usan los mismos valores que los enums de la base (el test compara con `enumValues`);
  - ningún mensaje de error contiene el valor introducido.
- [ ] (F1) Dadas las utilidades de presentación (unit test): cada valor de los tres enums tiene etiqueta; `getMissingProfileSections(null, today)` → las cuatro secciones; un perfil con todo → `[]`; documento con vencimiento anterior a `today` → incluye `"document"`; sin talla → incluye `"race"`; sin fecha de nacimiento → incluye `"personal"`; los campos opcionales no cuentan. `formatProfileTimestamp` formatea en `America/Lima` con cualquier `TZ` del proceso.
- [ ] (F1) Dado el service (unit test con el fake de Neon HTTP):
  - `getRunnerProfile(userId)` hace un `SELECT … WHERE user_id = $userId` y devuelve `null` sin fila;
  - `saveRunnerProfile(userId, email, input)` ejecuta **una sola** sentencia `INSERT … ON CONFLICT ("user_id") DO UPDATE` cuyo `user_id` es el parámetro (nunca un campo del input), fija `email`, `consent_version = RUNNER_PROFILE_CONSENT.version`, `consented_at = now()` y `updated_at = now()`, y no actualiza `user_id` ni `created_at`;
  - si la base falla, el error se propaga sin envolverlo (la acción decide) y el service no llama a `console.*`.
- [ ] (F1) Dado `README.md`, entonces la sección "Perfiles de runners" documenta la revisión de la migración (`grep -inE 'neon_auth|drop|create schema|references|alter table'`), su aplicación manual en el orden correcto entre `BEGIN;`/`COMMIT;` sin GRANT, la comprobación de `neon_auth` antes y después, las pruebas manuales de F1 y la supresión de un perfil a petición del titular (`DELETE FROM runner_profiles WHERE user_id = …`, con autorización).
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. F1 no añade rutas.

### Fase 2 — `/cuenta/perfil`
Requisito previo: enmiendas de `accounts-auth-ui.md` y `landing-public-site.md` aprobadas por el usuario (solo para F2-T5).

Acceso:
- [ ] (F2) Dado un visitante sin sesión, cuando abre `/cuenta/perfil`, entonces se le redirige a `/cuenta`.
- [ ] (F2) Dada una sesión con el correo sin verificar, entonces ve el `h1` "Mi perfil", un `Alert` "Verifica tu correo para completar tu perfil." con "Cierra sesión y vuelve a ingresar: te enviaremos un código." y "Cerrar sesión" (→ `/cuenta`), sin formulario ni consulta del perfil (unit test de `getRunnerProfilePage`).
- [ ] (F2) Dado un fallo de Neon Auth o de la base, entonces ve el `h1` "Mi perfil" y un `Alert` destructivo "No pudimos cargar tu perfil. Inténtalo de nuevo en unos minutos." con "Reintentar" (→ `/cuenta/perfil`). La respuesta no contiene el mensaje original y el log solo el texto fijo `runner-profile: load failed` (unit test).

Edición:
- [ ] (F2) Dado un runner verificado sin perfil, entonces ve "Mi perfil", "Correo de tu cuenta: <correo>" (solo lectura), "Te falta completar: Datos personales, Documento de viaje, Datos de carrera, Contacto de emergencia." y el formulario vacío en cuatro grupos (`fieldset` con `legend`): "Datos personales", "Documento de viaje", "Datos de carrera" y "Contacto de emergencia", más la casilla de consentimiento y "Guardar perfil".
- [ ] (F2) Dado ese formulario con nombre `Ana Pérez`, teléfono `+51 938 127 170` y el consentimiento marcado, cuando pulso "Guardar perfil", entonces veo "Perfil guardado." y, al recargar, los valores guardados (teléfono `+51938127170`) y las secciones que faltan.
- [ ] (F2) Dado un perfil con todas las secciones completas y el documento vigente, entonces veo "Tu perfil está completo." en lugar de la lista de secciones que faltan.
- [ ] (F2) Dado un teléfono sin código de país, un número de documento sin tipo, un vencimiento pasado, un contacto de emergencia sin teléfono o el consentimiento sin marcar, cuando guardo, entonces veo "Revisa los campos marcados." y el error bajo cada campo, lo escrito se conserva (incluidos el documento y los datos médicos) y no se guarda nada.
- [ ] (F2) Dados los campos de documento y de datos médicos, entonces cada grupo muestra "Dato sensible: solo lo ve el equipo de Carreras Viajeras para gestionar tu viaje.".
- [ ] (F2) Dada `saveRunnerProfileAction` llamada directamente (unit test): sin sesión → `unauthorized` sin llamar al service; correo sin verificar → `forbidden` sin llamar al service; `invalid_input` con `fieldErrors` y **sin** `values`; campos extra `userId`/`email` → se ignoran y el service recibe el `id` y el correo de la sesión; éxito → `"Perfil guardado."` y `revalidatePath("/cuenta/perfil")`; si el service lanza (incluido un error cuyo mensaje contiene datos del formulario) → `save_failed` con "No pudimos guardar tu perfil. Inténtalo de nuevo en unos minutos.", `console.error` solo con `runner-profile: save failed` y ningún dato del formulario en el estado devuelto.
- [ ] (F2) Dada una cuenta de staff, cuando guarda su perfil, entonces se crea su fila en `runner_profiles`, sus roles y su acceso al CRM no cambian y no se crean filas en `profiles` ni `staff_*`.

Navegación y página:
- [ ] (F2) Dado `RunnerAccount` con sesión, entonces muestra "Qué bueno verte de nuevo.", el correo, el enlace "Mi perfil" → `/cuenta/perfil` y "Cerrar sesión" (unit test). `/cuenta` sigue sin leer la sesión en el servidor ni consultar la base.
- [ ] (F2) Dado `/cuenta` sin sesión, entonces la nota de `AccountSection` dice "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay descuentos activos." (ya no "no hay perfiles persistentes").
- [ ] (F2) Dado el HTML de `/cuenta/perfil`, entonces hay `SiteHeader` y `SiteFooter`, un único `h1`, `<title>` "Mi perfil | Carreras Viajeras", `robots` `noindex, nofollow` (heredado) y el enlace "Volver a mi cuenta" → `/cuenta`. El único componente de cliente nuevo es `RunnerProfileForm`.
- [ ] (F2) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores, `/cuenta/perfil` es dinámica (`ƒ`) y `/cuenta` sigue estática (`○`). Medición del Worker (`npm run build:worker` + `npx wrangler deploy --dry-run --outdir <scratch>`, en Linux/WSL, sin desplegar) registrada frente a la última referencia y < 2 MiB. Lint y vitest sin errores.

### Fase 3 — CRM: corredores (solo lectura)
- [ ] (F3) Dado `can()` (unit test), entonces `admin` y `commercial` tienen `runners.view`, `[]` (runner) no, los bucles "admin tiene todo" y "sin roles nada" lo incluyen y los permisos existentes no cambian.
- [ ] (F3) Dado un `admin` o `commercial` verificado, entonces la cabecera de `CrmShell` muestra "Corredores" (→ `/crm/corredores`) entre "Reservas" y "Usuarios". Una cuenta sin rol de staff ve `NoCrmAccess`; sin sesión, redirección a `/crm/acceso`. Si un rol del CRM no tiene `runners.view`, las dos páginas muestran su `h1` y "No tienes permiso para ver corredores. Si lo necesitas, pídeselo a un administrador.".
- [ ] (F3) Dado `/crm/corredores`, entonces veo el `h1` "Corredores", un formulario `<form method="get">` con "Buscar por nombre o correo" (`?q=`), "Buscar" y "Limpiar", y una tabla con Nombre, Correo, Ciudad y país, Perfil (`Badge` "Con perfil"/"Sin perfil"), Reservas activas y Actualizado. Sin corredores: "Aún no hay corredores. Aparecen aquí cuando completan su perfil o se vincula una reserva a su cuenta."; con búsqueda sin resultados: "Ningún corredor coincide con «<q>».".
- [ ] (F3) Dados un runner con perfil y sin reservas, uno sin perfil con una reserva vinculada y una cuenta sin perfil ni reservas vinculadas, entonces la lista muestra los dos primeros (el segundo con el nombre y el correo de su reserva más reciente y "Sin perfil") y no la tercera.
- [ ] (F3) Dado `?q=ANA@`, entonces aparecen los corredores cuyo nombre o correo contienen `ana@` sin distinguir mayúsculas; `?q=%` y `?q=_` buscan esos caracteres literalmente; un `q` vacío, repetido (array) o de más de 100 caracteres se ignora y se muestra la lista completa.
- [ ] (F3) Dados más de 200 corredores que cumplen el criterio, entonces la tabla muestra 200 y "Se muestran los primeros 200 resultados. Afina la búsqueda.".
- [ ] (F3) Dado `listRunners` (unit test): el SQL une `runner_profiles` y `bookings.runner_user_id IS NOT NULL`, filtra con `strpos(lower(…), lower($q)) > 0` sobre nombre y correo, cuenta solo reservas no canceladas, ordena por nombre, pide 201 filas y devuelve `truncated`; **no selecciona** `phone`, `birth_date`, `document_*`, `emergency_contact_*` ni `medical_notes`.
- [ ] (F3) Dada `/crm/corredores/<id>` de un runner con perfil, entonces veo el `h1` con el nombre, el correo, el `Badge` "Perfil completo" o "Perfil incompleto" con "Falta: …", "Actualizado el …", y las secciones "Datos personales" (teléfono, país, ciudad, fecha de nacimiento), "Documento de viaje" (tipo, número, vencimiento; rótulo "Dato sensible"), "Datos de carrera" (talla, distancia preferida, mejor marca, club), "Contacto de emergencia" (nombre, teléfono y "Alergias o condiciones médicas"; rótulo "Dato sensible") y "Consentimiento" (versión y fecha). Los campos vacíos muestran "—". No hay formularios, botones de edición ni Server Actions.
- [ ] (F3) Dada la ficha de un corredor sin perfil, entonces veo su nombre y correo (de la reserva más reciente) y "Esta persona aún no completó su perfil.".
- [ ] (F3) Dada la ficha, entonces la sección "Reservas vinculadas" muestra `BookingTable` con las reservas cuyo `runner_user_id` es ese id (todas, también canceladas), o "Sin reservas vinculadas a esta cuenta." si no hay. La sección solo aparece si la persona del CRM tiene también `bookings.manage` (hoy: admin y commercial).
- [ ] (F3) Dado `/crm/corredores/<id>` con un id sin perfil ni reservas vinculadas, o de más de 255 caracteres, entonces 404.
- [ ] (F3) Dado `getRunnerDetail` (unit test): id vacío o de más de 255 caracteres → `null` sin consultar; lee perfil e identidad de respaldo en un solo batch filtrando por `user_id = $id` / `runner_user_id = $id`; sin perfil ni reservas → `null`. Dado `listBookingsByRunner` (unit test): filtra `runner_user_id = $id`, excluye pagos anulados del pagado y ordena como `listBookings`; `listBookings` no cambia de comportamiento.
- [ ] (F3) Medición del Worker como en F2. Lint, vitest y build sin errores (`/crm/corredores` y `/crm/corredores/[id]` dinámicas).

### Manual en producción (el usuario, con su autorización; los agentes no acceden a Neon)
- [ ] Migración aplicada en `production` tras las anteriores; `neon_auth` sin cambios (comparación antes/después).
- [ ] Un runner verificado completa su perfil por partes en `/cuenta/perfil` y lo ve completo al terminar; con el correo sin verificar ve el aviso y no el formulario.
- [ ] Un `commercial` encuentra al runner en `/crm/corredores` por parte de su correo, abre su ficha y ve el documento y el contacto de emergencia; en la lista no aparecen el teléfono, el documento ni los datos médicos.
- [ ] Una segunda cuenta verificada, desde las herramientas del navegador, envía la acción con `userId` de la primera: solo cambia su propio perfil.
- [ ] Un runner sin rol abre `/crm/corredores` → "sin acceso"; `GET /api/crm/me` → 403.

## Diseño técnico

### Decisiones
1. **Módulo `modules/accounts`.** El perfil es de la cuenta (identidad y gestión de usuarios), como el staff; un módulo `runners` aparte duplicaría guardas y estados de sesión ya existentes en `accounts`. `modules/bookings` solo añade `listBookingsByRunner` a su API pública; las páginas de `app/` componen ambos módulos.
2. **`/cuenta/perfil` en lugar de editar dentro de `/cuenta`.**
   - `/cuenta` es estática (`○`) y no lee la sesión en el servidor (`runner-portal.md`, Decisión 4; `accounts-auth-ui.md` F4): meter el formulario la haría dinámica en cada visita.
   - El formulario necesita el perfil leído en el servidor con la sesión verificada: una página dinámica propia lo resuelve sin API.
   - Es compatible con `runner-portal.md` F6: el destino tras ingresar puede pasar a `/mis-carreras` sin tocar esta ruta; `/cuenta` con sesión tendrá ambos enlaces ("Mi perfil" y "Ver mis carreras").
3. **Tabla propia `runner_profiles`, PK `user_id` text, sin FK a `neon_auth`**, como anticipó `landing-public-site.md` ("Base para el trabajo futuro → Runner"). No va en `profiles` (solo staff). Una fila por cuenta.
4. **`email` en la tabla: copia de solo lectura del correo verificado de la sesión**, refrescada en cada guardado. El CRM lo necesita para identificar y buscar al runner porque `neon_auth` no se puede leer. Nunca se usa para autorizar ni para vincular reservas.
5. **Guardado parcial y completitud derivada.** Solo nombre y teléfono son obligatorios (el mínimo para que el equipo contacte); el runner completa el resto cuando lo tiene. "Completo" se calcula al leer con `getMissingProfileSections` (Requisito 5), no se guarda: un documento que vence después de guardarlo pasa solo a "incompleto". La lista del CRM muestra solo "Con perfil"/"Sin perfil" para no repetir la regla en SQL; el detalle, en la ficha.
6. **Grupos coherentes en zod y en la base.** Tipo y número de documento juntos, vencimiento solo con documento, nombre y teléfono de emergencia juntos. Zod pone el error en el campo que falta; los CHECK impiden filas incoherentes aunque alguien escriba por SQL.
7. **Enums para lo que se cuenta y se elige; texto libre para el resto.** `travel_document_type` (Pasaporte, DNI o documento nacional, Carné de extranjería), `shirt_size` (XS–XXL, talla unisex) y `race_distance` (5K, 10K, 21K, 42K, Ultra) son listas cerradas útiles para el equipo (pedir polos, armar grupos). País, ciudad, mejor marca ("42K en 3:45:10") y club son texto libre: estructurarlos no aporta nada al MVP. El número de documento se normaliza (sin espacios, puntos ni guiones; mayúsculas) y se valida `^[A-Z0-9]{4,20}$`.
8. **Datos sensibles.**
   - La acción no devuelve `values`: `RunnerProfileForm` envía con `onSubmit` + `startTransition` (patrón de `BookingForm`), así React no reinicia los campos y lo escrito se conserva sin que el documento ni los datos médicos viajen en la respuesta.
   - Los mensajes de zod son textos fijos; los de error de la acción también.
   - Un error de Postgres (p. ej. un CHECK) trae en su detalle la fila con los valores: la acción lo captura, registra solo `runner-profile: save failed` y devuelve `save_failed`.
   - La lista del CRM no selecciona columnas sensibles ni de contacto directo (Decisión 12); la ficha las muestra solo en Server Components (no viajan a componentes de cliente del CRM).
   - En `/cuenta/perfil` el propio runner recibe sus datos en las props de `RunnerProfileForm` (necesarias como valores por defecto); la página es dinámica y Next la sirve con `Cache-Control: private, no-store`.
   - Sin cifrado de columnas en la aplicación: Neon cifra en reposo, el acceso está limitado por RBAC y un cifrado propio exigiría otra clave secreta y su rotación. Riesgo aceptado para el MVP.
9. **Consentimiento versionado.** `RUNNER_PROFILE_CONSENT = { version: "runner-profile-2026-10", text: "…" }` vive en `utils/runnerProfileDisplay.ts` (puro): el formulario muestra `text` y el service guarda `version`, así el texto y su versión no se separan. Cambiar el texto obliga a cambiar la versión. Cada guardado vuelve a pedir la casilla y actualiza `consented_at`. Ver Pregunta abierta 1.
10. **Quién aparece en el CRM.** La unión de `runner_profiles` y `bookings.runner_user_id IS NOT NULL`. El vínculo reserva ↔ cuenta sigue siendo exclusivo de `/mis-carreras` (`runner-portal.md` F5): esta spec no vincula por el correo del perfil ni lo replica, para no abrir un segundo camino de vínculo con otras garantías. Consecuencia aceptada: hasta que F5 esté en `main`, la sección "Reservas vinculadas" estará vacía y la lista solo mostrará cuentas con perfil.
11. **Búsqueda simple sin paginación ni exportación.** `strpos(lower(nombre), lower(q)) > 0 OR strpos(lower(correo), lower(q)) > 0`: subcadena literal, sin comodines de `LIKE` que escapar. `q` se recorta y se ignora si está vacío, repetido o pasa de 100 caracteres. Se piden 201 filas para saber si hay más de 200 y avisar (`truncated`): acota la CPU del Worker sin construir paginación. La exportación queda fuera: sacaría datos personales del sistema sin control.
12. **Minimización en la lista.** La lista sirve para encontrar a una persona; se ve a menudo y con muchas filas, en pantallas compartidas. Muestra solo identificación y estado: nombre, correo, ciudad y país, si tiene perfil, reservas activas y la fecha de actualización. El teléfono, la fecha de nacimiento, el documento, el contacto de emergencia y los datos médicos solo están en la ficha, a un clic, que se abre a propósito para una persona concreta.
13. **Reservas en la ficha con `BookingTable` y solo con `bookings.manage`.** Se reutiliza la tabla del CRM de reservas (enlaza a `/crm/reservas/<id>`, que exige `bookings.manage`). La página comprueba `can(access.user.staffRoles, "bookings.manage")` antes de leerlas: hoy siempre es cierto para quien tiene `runners.view`, pero si un rol futuro tuviera solo `runners.view`, no vería importes ni enlaces rotos. El texto vacío propio de la ficha lo pone la página (no se cambia `BookingTable`).
14. **Errores del runner resueltos en el servidor.** A diferencia de las acciones del CRM (que lanzan `"… action failed"`), `saveRunnerProfileAction` devuelve `save_failed`: el runner no tiene el contexto del CRM y debe poder reintentar sin perder lo escrito. `getRunnerProfilePage` convierte el fallo de lectura en un estado `error` (patrón de `getRunnerPortal`, `runner-portal.md` Decisión 11); sin `error.tsx` ni `loading.tsx`.
15. **"Hoy" para validar fechas = día UTC** (`new Date().toISOString().slice(0, 10)`), que la acción pasa a `runnerProfileFormSchema(today)`. Entre las 19:00 y las 24:00 de Lima el día UTC ya es el siguiente; para la fecha de nacimiento y el vencimiento ese desfase no importa y evita mover `limaDate` de `bookings` a `lib/` en esta spec. El schema es una función de `today` para que los tests sean deterministas.
16. **`lib/form-schema.ts`.** `blankToNull` ya está copiado en `trips`, `bookings` y `crm` (el comentario de `bookings.schema.ts` pide subirlo a `lib/` en el tercer uso) y el teléfono E.164 de `leads.schema.ts` tiene aquí su segundo uso. Se crea `lib/form-schema.ts` con `blankToNull` (variante que trata la clave ausente como vacía, la de `trips`/`bookings`), `requiredText` y `e164PhoneSchema(message)`, y lo usa el schema nuevo. Migrar las copias existentes queda fuera: tocaría tres módulos con specs propias mientras otra spec trabaja en paralelo; es un refactor de seguimiento en modo build (≤ 3 archivos, cubierto por sus tests).
17. **Componentes de shadcn.** Se instala `alert` (estados sin verificar, error y guardado); si `runner-portal.md` F5 lo instala antes, no se vuelve a instalar. La casilla de consentimiento es un `<input type="checkbox">` nativo (como `ContactForm` y el `ItineraryItemForm` previsto); las fechas, `<input type="date">`. Descartados: `field` (ningún formulario del proyecto lo usa; `accounts-roles-permissions.md` lo dejó fuera), `checkbox` (Base UI, de cliente, sin ventaja sobre el nativo en un formulario que ya es de cliente) y `select` (se usa `native-select`, instalado).
18. **Rectificación y supresión.** El runner rectifica sus datos editando el perfil. La supresión a petición (por WhatsApp o correo) la hace el usuario a mano con `DELETE FROM runner_profiles WHERE user_id = …` (README); no hay botón de borrado (YAGNI, Alcance).
19. **Patrocinador fuera, denegado por defecto.** `runners.view` se concede solo a `commercial` (y a `admin` por la regla general). Si la otra spec añade un rol al enum `staff_role`, no obtiene `runners.view` salvo que esa spec lo diga.
20. **Sin API HTTP nueva.** Lecturas con funciones `server-only` desde Server Components; escritura con una Server Action.

### Modelo de datos: `lib/db-schema.ts` (F1)
Todo en `public`, snake_case, sin FK. `updated_at` y `consented_at` los fija el service con `now()`.

| Objeto | Definición |
|---|---|
| enum `travel_document_type` | `passport`, `national_id`, `foreign_id` |
| enum `shirt_size` | `xs`, `s`, `m`, `l`, `xl`, `xxl` |
| enum `race_distance` | `5k`, `10k`, `21k`, `42k`, `ultra` |
| `runner_profiles.user_id` | `text` PK (id de Neon Auth, sin FK) |
| `runner_profiles.email` | `text not null`; CHECK `= lower(email) AND char_length <= 254`. Solo presentación |
| `runner_profiles.full_name` | `text not null`; CHECK `char_length BETWEEN 2 AND 120` |
| `runner_profiles.phone` | `text not null`; CHECK `~ '^\+[1-9][0-9]{7,14}$'` (E.164, como `leads.phone`) |
| `runner_profiles.country`, `city` | `text` nulos; CHECK `char_length BETWEEN 2 AND 80` |
| `runner_profiles.birth_date` | `date` nulo (modo string); CHECK `>= '1900-01-01'` (el límite "no futura" lo valida zod: un CHECK con `current_date` no es inmutable) |
| `runner_profiles.document_type` | `travel_document_type` nulo — **sensible** |
| `runner_profiles.document_number` | `text` nulo; CHECK `~ '^[A-Z0-9]{4,20}$'` — **sensible** |
| `runner_profiles.document_expires_on` | `date` nulo (modo string) — **sensible** |
| CHECK `runner_profiles_document_chk` | `(document_type IS NULL) = (document_number IS NULL) AND (document_expires_on IS NULL OR document_type IS NOT NULL)` |
| `runner_profiles.shirt_size` | `shirt_size` nulo |
| `runner_profiles.preferred_distance` | `race_distance` nulo |
| `runner_profiles.personal_best` | `text` nulo; CHECK `char_length <= 60` |
| `runner_profiles.club` | `text` nulo; CHECK `char_length <= 80` |
| `runner_profiles.emergency_contact_name` | `text` nulo; CHECK `char_length BETWEEN 2 AND 120` |
| `runner_profiles.emergency_contact_phone` | `text` nulo; CHECK E.164 |
| CHECK `runner_profiles_emergency_chk` | `(emergency_contact_name IS NULL) = (emergency_contact_phone IS NULL)` |
| `runner_profiles.medical_notes` | `text` nulo; CHECK `char_length <= 500` — **sensible** |
| `runner_profiles.consent_version` | `text not null`; CHECK `char_length BETWEEN 1 AND 40` |
| `runner_profiles.consented_at` | `timestamptz not null default now()` |
| `runner_profiles.created_at`, `updated_at` | `timestamptz not null default now()` |

Sin índices adicionales: la búsqueda recorre la tabla (cientos de filas en el MVP) y `bookings_runner_user_idx` ya existe. El developer puede reescribir los CHECK de forma equivalente; el criterio manual de F1 valida el comportamiento. Migración: `npm run db:generate` → `drizzle/000N_<nombre>.sql`, su snapshot y `_journal.json`, con N = siguiente número libre en la rama en ese momento.

### Visibilidad
| Dato | Runner (su propio perfil) | CRM lista (`runners.view`) | CRM ficha (`runners.view`) |
|---|---|---|---|
| Nombre, correo | Sí (correo de la sesión, solo lectura) | Sí | Sí |
| País, ciudad | Sí | Sí | Sí |
| Teléfono, fecha de nacimiento | Sí | No | Sí |
| Documento (tipo, número, vencimiento) | Sí | No | Sí, rótulo "Dato sensible" |
| Talla, distancia, mejor marca, club | Sí | No | Sí |
| Contacto de emergencia | Sí | No | Sí |
| Alergias o condiciones médicas | Sí | No | Sí, rótulo "Dato sensible" |
| Consentimiento (versión, fecha) | No (solo la casilla) | No | Sí |
| Reservas vinculadas | No (las verá en `/mis-carreras`) | Solo el número de activas | Sí (`BookingTable`, si tiene `bookings.manage`) |
| Perfiles de otras cuentas | No | Sí | Sí |

### Permisos: `lib/auth/permissions.ts` (F3)
```ts
export type Permission =
  | "crm.access" | "staff.manage" | "trips.manage" | "leads.manage" | "bookings.manage" | "runners.view";
// PERMISSION_MATRIX: "runners.view": ["commercial"]  — admin pasa siempre; [] (runner) → false
```

### Rutas (`app/`)
| Ruta | Fase | Contenido |
|---|---|---|
| `app/cuenta/perfil/page.tsx` | F2 | `metadata = { title: "Mi perfil" }`. `const state = await getRunnerProfilePage()`; `if (state.status === "unauthenticated") redirect("/cuenta")`; `return <><SiteHeader /><main><RunnerProfilePanel state={state} /></main><SiteFooter /></>`. Sin `try/catch`, sin `loading.tsx`/`error.tsx` |
| `app/crm/(protected)/corredores/page.tsx` | F3 | `getCrmAccess("runners.view")`; `unauthenticated` → `redirect("/crm/acceso")`; `forbidden` → `h1` "Corredores" + texto sin permiso. `q = z.string().trim().min(1).max(100).optional().catch(undefined)` sobre `(await searchParams).q`. `listRunners(q)` → `h1`, `RunnerSearch`, `RunnerTable`. `metadata.title = "Corredores"` |
| `app/crm/(protected)/corredores/[id]/page.tsx` | F3 | Misma guarda (`h1` "Corredor" en `forbidden`). `getRunnerDetail(decodeURIComponent(id))`; `null` → `notFound()`. Si `can(access.user.staffRoles, "bookings.manage")`, `listBookingsByRunner(id)` de `@/modules/bookings`. Compone `h1` (nombre), correo, `RunnerProfileDetails` (o "Esta persona aún no completó su perfil.") y "Reservas vinculadas" (`BookingTable bookings filtered={false}` o "Sin reservas vinculadas a esta cuenta."), más "Volver a corredores". `metadata.title = "Corredor"` |

Las páginas del CRM heredan el layout protegido (`NoCrmAccess`, `CrmShell`, `noindex`). `params` y `searchParams` son promesas (consultar `node_modules/next/dist/docs/` antes de escribirlas). Los enlaces a la ficha usan `encodeURIComponent(userId)`.

### `lib/form-schema.ts` (F1, nuevo; sin `server-only`)
```ts
export const blankToNull: <T extends z.ZodType<unknown, string>>(schema: T) => z.ZodType<z.output<T> | null, string | undefined>;
//   "" / espacios / clave ausente → null; si no, recorta y valida con `schema`.
export const requiredText: (min: number, max: number, message: string) => z.ZodString;
export const e164PhoneSchema: (message: string) => z.ZodType<string, string>;
//   quita espacios, paréntesis, guiones y puntos → /^\+[1-9]\d{7,14}$/.
```

### Módulo `modules/accounts/`
| Archivo | Fase | Tipo | Contenido |
|---|---|---|---|
| `schemas/runnerProfile.schema.ts` | F1 | zod, sin `server-only` | `travelDocumentTypeSchema`, `shirtSizeSchema`, `raceDistanceSchema` (mismos valores que los enums) y `runnerProfileFormSchema(today)` |
| `types/runnerProfile.types.ts` | F1 (amp. F2, F3) | tipos | Ver "Contratos". F2 añade `RunnerProfileActionState`; F3, `RunnerListItem` y `CrmRunnerDetail` |
| `utils/runnerProfileDisplay.ts` | F1 | puro | `DOCUMENT_TYPE_LABELS`, `SHIRT_SIZE_LABELS`, `RACE_DISTANCE_LABELS`, `PROFILE_SECTION_LABELS`, `RUNNER_PROFILE_CONSENT`, `SENSITIVE_DATA_NOTICE`, `getMissingProfileSections`, `formatProfileTimestamp` |
| `services/runnerProfile.service.ts` | F1 | `server-only` | `getRunnerProfile`, `saveRunnerProfile` (solo el propio perfil) |
| `actions/runnerProfile.actions.ts` | F2 | `"use server"` | `saveRunnerProfileAction` |
| `utils/runnerProfilePage.ts` | F2 | `server-only` | `getRunnerProfilePage` (guarda y estados) |
| `components/RunnerProfileForm.tsx` | F2 | `"use client"` | Formulario de edición |
| `components/RunnerProfilePanel.tsx` | F2 | Server | Composición por estado de `/cuenta/perfil` |
| `components/RunnerAccount.tsx` | F2 (mod.) | `"use client"` (existente) | Con sesión añade "Mi perfil" |
| `services/runnerDirectory.service.ts` | F3 | `server-only` | `listRunners`, `getRunnerDetail` (CRM, solo lectura) |
| `components/RunnerSearch.tsx` | F3 | Server | Búsqueda por `<form method="get">` |
| `components/RunnerTable.tsx` | F3 | Server | Lista del CRM |
| `components/RunnerProfileDetails.tsx` | F3 | Server | Secciones del perfil en la ficha |
| `components/CrmShell.tsx` | F3 (mod.) | Server (existente) | Enlace "Corredores" |
| `index.ts` | F2, F3 (amp.) | API pública | F2: `getRunnerProfilePage`, `RunnerProfilePanel`. F3: `listRunners`, `getRunnerDetail`, `RunnerSearch`, `RunnerTable`, `RunnerProfileDetails` |

`modules/bookings/` (F3): `services/bookings.service.ts` añade `listBookingsByRunner` (comparte con `listBookings` las columnas y el `GROUP BY` mediante un helper interno; `listBookings` no cambia de firma ni de resultado) y `index.ts` lo exporta.

### Schema (`schemas/runnerProfile.schema.ts`, mensajes en español; entrada: strings de `Object.fromEntries(formData)`; `z.object` descarta claves desconocidas)
- `fullName`: `requiredText(2, 120, "El nombre debe tener entre 2 y 120 caracteres.")`.
- `phone`: `e164PhoneSchema("Escribe el número con código de país, p. ej. +51 938 127 170.")`.
- `country`, `city`: `blankToNull(z.string().min(2).max(80))` ("El país debe tener entre 2 y 80 caracteres." / "La ciudad …").
- `birthDate`: `blankToNull(z.iso.date())` + refinamiento `>= "1900-01-01" && <= today` ("Indica una fecha de nacimiento válida.").
- `documentType`: `blankToNull(travelDocumentTypeSchema)` ("Elige el tipo de documento.").
- `documentNumber`: `blankToNull(...)` que quita `[\s.-]`, pasa a mayúsculas y exige `^[A-Z0-9]{4,20}$` ("Usa entre 4 y 20 letras o números.").
- `documentExpiresOn`: `blankToNull(z.iso.date())` + `>= today` ("La fecha de vencimiento ya pasó.").
- `shirtSize`, `preferredDistance`: `blankToNull(enum)`.
- `personalBest`: `blankToNull(z.string().max(60))`; `club`: `blankToNull(z.string().max(80))`.
- `emergencyContactName`: `blankToNull(z.string().min(2).max(120))`; `emergencyContactPhone`: `blankToNull(e164PhoneSchema(...))`.
- `medicalNotes`: `blankToNull(z.string().max(500, "Puedes escribir hasta 500 caracteres."))`.
- `consent`: `z.literal("on", { error: "Para guardar tu perfil, acepta el uso de tus datos." })`; no pasa al service.
- `superRefine` de grupos, con el error en el campo que falta: tipo sin número → `documentNumber` "Indica el número del documento."; número o vencimiento sin tipo → `documentType` "Elige el tipo de documento."; nombre de emergencia sin teléfono → `emergencyContactPhone` "Indica el teléfono del contacto de emergencia."; teléfono sin nombre → `emergencyContactName` "Indica el nombre del contacto de emergencia.".

### Server Action (`actions/runnerProfile.actions.ts`, F2)
Orden: `requireVerifiedEmail()` → `runnerProfileFormSchema(today).safeParse(Object.fromEntries(formData))` → `saveRunnerProfile(user.id, user.email, input)` → `revalidatePath("/cuenta/perfil")`.
- `UnauthorizedError` → `unauthorized` "Tu sesión no es válida. Vuelve a iniciar sesión."
- `ForbiddenError` (correo sin verificar o fallo al resolver la cuenta) → `forbidden` "Verifica tu correo para guardar tu perfil."
- zod → `invalid_input` "Revisa los campos marcados." + `fieldErrors` (primer mensaje por campo); **sin `values`**.
- excepción del service → `console.error("runner-profile: save failed")` + `save_failed` "No pudimos guardar tu perfil. Inténtalo de nuevo en unos minutos." (sin causa).
- éxito → `{ status: "success", message: "Perfil guardado." }`.

### Componentes
| Componente | Tipo | Fase | Detalle |
|---|---|---|---|
| `button` (`buttonVariants`), `badge`, `card`, `table`, `input`, `label`, `native-select`, `textarea` | shadcn (instalado) | F2–F3 | Formulario, tablas, estados |
| `alert` | shadcn (instalar: `npx shadcn@latest add alert`, solo si `components/ui/alert.tsx` no existe) | F2 | Sin verificar, error, perfil incompleto/completo |
| `SignOutButton` | existente (`modules/accounts/components/SignOutButton.tsx`, uso interno del módulo) | F2 | `redirectTo="/cuenta"` en el estado sin verificar |
| `SiteHeader`, `SiteFooter` | existentes (`@/modules/landing`) | F2 | Mismo marco que `/cuenta` |
| `formatTripDate` | existente (`@/modules/trips`) | F2–F3 | Fecha de nacimiento y vencimiento ("16 de mayo de 2027") |
| `BookingTable` | existente (`@/modules/bookings`) | F3 | "Reservas vinculadas" en la ficha |
| `RunnerAccount` | existente (`modules/accounts`) | F2 | Con sesión añade `Link href="/cuenta/perfil"` con `buttonVariants({ variant: "outline" })` "Mi perfil", antes de "Cerrar sesión" |
| `CrmShell` | existente (`modules/accounts`) | F3 | "Corredores" → `/crm/corredores` si `can(roles, "runners.view")`, entre "Reservas" y "Usuarios"; la condición del `nav` lo incluye; props sin cambios |
| `RunnerProfileForm` | nuevo, `"use client"` (`modules/accounts/components/`; no existe un formulario de perfil; `useActionState` + `onSubmit`/`startTransition`) | F2 | Props `{ profile: RunnerProfile \| null; today: string }`. Cuatro `fieldset` con `legend` (`font-heading`): "Datos personales" (Nombre completo *, Teléfono o WhatsApp * con ayuda "Con código de país, p. ej. +51 938 127 170.", País, Ciudad, Fecha de nacimiento `type="date" max={today}`), "Documento de viaje" (Tipo `NativeSelect` con "Sin indicar", Número, Vencimiento `type="date" min={today}`, y `SENSITIVE_DATA_NOTICE`), "Datos de carrera" (Talla de polo, Distancia preferida, Mejor marca con ayuda "Ejemplo: 42K en 3:45:10.", Club o equipo) y "Contacto de emergencia" (Nombre, Teléfono, "Alergias o condiciones médicas" `Textarea` opcional y `SENSITIVE_DATA_NOTICE`). Casilla nativa `consent` con `RUNNER_PROFILE_CONSENT.text`, sin marcar por defecto. Errores bajo cada campo (`role="alert"`, `aria-invalid`, `aria-describedby`), mensaje general y "Guardar perfil"/"Guardando…". `noValidate` |
| `RunnerProfilePanel` | nuevo, Server | F2 | Props `{ state }` (sin `unauthenticated`). Eyebrow "MI CUENTA", `h1` "Mi perfil" y, según el estado: sin verificar (`Alert` + `SignOutButton`), error (`Alert` destructivo + "Reintentar"), ok ("Correo de tu cuenta: …", `Alert` "Tu perfil está completo." o "Te falta completar: …" con `getMissingProfileSections`, `RunnerProfileForm` y "Volver a mi cuenta"). Mismo ancho y tokens que `AccountSection`; solo tokens del tema |
| `RunnerSearch` | nuevo, Server (patrón de `BookingFilters`) | F3 | Props `{ q?: string }`. `<form method="get" action="/crm/corredores">` con `Label` "Buscar por nombre o correo", `Input name="q" maxLength={100}`, "Buscar" y "Limpiar" |
| `RunnerTable` | nuevo, Server | F3 | Props `{ runners, truncated, q? }`. Columnas del Requisito 9; Actualizado con `formatProfileTimestamp` o "—"; textos vacío/sin resultados/truncado del criterio de F3 |
| `RunnerProfileDetails` | nuevo, Server | F3 | Props `{ profile, today }`. `Badge` "Perfil completo"/"Perfil incompleto" + "Falta: …", "Actualizado el …", y una `Card` por sección con `<dl>` (patrón de la ficha de reserva cancelada); "Dato sensible" como `Badge variant="outline"` en Documento y en Contacto de emergencia; "—" en vacíos; etiquetas de los enums |

Ninguno de los componentes nuevos existe en el proyecto ni en `@shadcn` (búsquedas: `field`, `checkbox`, `alert`; ver Decisión 17). Son de un solo dominio y viven en `modules/accounts/components/`.

### Contratos (tipos y funciones de servidor; sin API HTTP)
```ts
// modules/accounts/types/runnerProfile.types.ts
export type TravelDocumentType = (typeof travelDocumentTypeEnum.enumValues)[number]; // "passport" | "national_id" | "foreign_id"
export type ShirtSize = (typeof shirtSizeEnum.enumValues)[number];
export type RaceDistance = (typeof raceDistanceEnum.enumValues)[number];
export type RunnerProfileInput = Omit<z.output<ReturnType<typeof runnerProfileFormSchema>>, "consent">;
export type RunnerProfile = {
  email: string; fullName: string; phone: string;
  country: string | null; city: string | null; birthDate: string | null;           // YYYY-MM-DD
  documentType: TravelDocumentType | null; documentNumber: string | null; documentExpiresOn: string | null;
  shirtSize: ShirtSize | null; preferredDistance: RaceDistance | null;
  personalBest: string | null; club: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null; medicalNotes: string | null;
  consentVersion: string; consentedAt: Date; updatedAt: Date;
};
export type ProfileSection = "personal" | "document" | "race" | "emergency";

// F2
export type RunnerProfileActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; code: "unauthorized" | "forbidden" | "invalid_input" | "save_failed";
      message: string; fieldErrors?: Record<string, string[]> };                // nunca `values`

// F3
export type RunnerListItem = {
  userId: string; name: string; email: string; city: string | null; country: string | null;
  hasProfile: boolean; activeBookings: number; updatedAt: Date | null;
};
export type CrmRunnerDetail = { userId: string; name: string; email: string; profile: RunnerProfile | null };

// modules/accounts/services/runnerProfile.service.ts (F1, server-only)
export async function getRunnerProfile(userId: string): Promise<RunnerProfile | null>;
export async function saveRunnerProfile(userId: string, email: string, input: RunnerProfileInput): Promise<void>;
//   INSERT INTO runner_profiles (user_id, email, …, consent_version, consented_at)
//   VALUES ($userId, $email, …, RUNNER_PROFILE_CONSENT.version, now())
//   ON CONFLICT (user_id) DO UPDATE SET email, …, consent_version, consented_at = now(), updated_at = now()

// modules/accounts/utils/runnerProfilePage.ts (F2, server-only)
export type RunnerProfilePageState =
  | { status: "unauthenticated" }
  | { status: "unverified"; email: string }
  | { status: "error" }
  | { status: "ok"; email: string; today: string; profile: RunnerProfile | null };
export async function getRunnerProfilePage(): Promise<RunnerProfilePageState>;
//  1. await connection();
//  2. getCurrentUser(): ForbiddenError → { status: "error" }; otra excepción → se relanza; null → unauthenticated.
//  3. !emailVerified → unverified (no se llama al service).
//  4. today = día UTC; try getRunnerProfile(user.id) → ok; catch → console.error("runner-profile: load failed") + error.

// modules/accounts/actions/runnerProfile.actions.ts (F2)
export async function saveRunnerProfileAction(
  prev: RunnerProfileActionState, formData: FormData,
): Promise<RunnerProfileActionState>;

// modules/accounts/services/runnerDirectory.service.ts (F3, server-only)
export const RUNNER_LIST_LIMIT = 200;
export async function listRunners(q?: string): Promise<{ runners: RunnerListItem[]; truncated: boolean }>;
//   WITH ids AS (SELECT user_id FROM runner_profiles UNION SELECT runner_user_id FROM bookings WHERE runner_user_id IS NOT NULL)
//   + LEFT JOIN runner_profiles + LATERAL (reserva vinculada más reciente: participant_name, participant_email)
//   + LATERAL (count(*) FILTER (WHERE status <> 'cancelled'))
//   name = coalesce(full_name, participant_name), email = coalesce(p.email, participant_email)
//   [WHERE strpos(lower(name), lower($q)) > 0 OR strpos(lower(email), lower($q)) > 0]
//   ORDER BY lower(name), user_id LIMIT 201. Solo columnas de RunnerListItem.
export async function getRunnerDetail(userId: string): Promise<CrmRunnerDetail | null>;
//   userId vacío o > 255 → null sin consultar. Un batch: perfil completo + reserva vinculada más reciente.

// modules/bookings/services/bookings.service.ts (F3, server-only)
export async function listBookingsByRunner(runnerUserId: string): Promise<CrmBookingListItem[]>;

// modules/accounts/utils/runnerProfileDisplay.ts (F1)
export const RUNNER_PROFILE_CONSENT: { version: string; text: string };
export const SENSITIVE_DATA_NOTICE = "Dato sensible: solo lo ve el equipo de Carreras Viajeras para gestionar tu viaje.";
export function getMissingProfileSections(profile: RunnerProfile | null, today: string): ProfileSection[];
export function formatProfileTimestamp(instant: Date): string;  // es-PE, America/Lima, dateStyle "medium"
```

### Wireframes
`/cuenta/perfil`, móvil (perfil incompleto):
```
┌────────────────────────────────────┐
│ SiteHeader                          │
├────────────────────────────────────┤
│ MI CUENTA                           │  eyebrow
│ Mi perfil                     (h1)  │
│ Correo de tu cuenta: ana@correo.com │
│ ┌ Alert ─────────────────────────┐  │
│ │ Te falta completar: Documento  │  │
│ │ de viaje, Contacto de emergencia│ │
│ └────────────────────────────────┘  │
│ DATOS PERSONALES          (legend)  │
│ Nombre completo *  [Ana Pérez    ]  │
│ Teléfono o WhatsApp * [+5193812…]   │
│ País [Perú] · Ciudad [Lima]         │
│ Fecha de nacimiento [1990-04-12]    │
│ DOCUMENTO DE VIAJE        (legend)  │
│ Dato sensible: solo lo ve el equipo…│
│ Tipo [Sin indicar ▾] Número [    ]  │
│ Vencimiento [          ]            │
│ DATOS DE CARRERA          (legend)  │
│ Talla [M ▾] Distancia [42K ▾]       │
│ Mejor marca [42K en 3:45:10]        │
│ Club o equipo [             ]       │
│ CONTACTO DE EMERGENCIA    (legend)  │
│ Nombre [   ] Teléfono [   ]         │
│ Alergias o condiciones médicas      │
│ [                                ]  │
│ Dato sensible: solo lo ve el equipo…│
│ ☐ Acepto que Carreras Viajeras …    │
│ [Guardar perfil]  Volver a mi cuenta│
├────────────────────────────────────┤
│ SiteFooter                          │
└────────────────────────────────────┘
```

CRM, lista y ficha (escritorio, orientativo):
```
│ Corredores                                                                    │
│ Buscar por nombre o correo [ana        ] [Buscar] Limpiar                     │
│ Nombre       Correo            Ciudad y país  Perfil       Reservas  Actualizado│
│ Ana Pérez    ana@correo.com    Lima, Perú     [Con perfil]  1        25 oct 2026│
│ Luis Ramos   luis@correo.com   —              [Sin perfil]  1        —          │

│ Ana Pérez                         [Perfil incompleto] Falta: Contacto de emergencia │
│ ana@correo.com · Actualizado el 25 oct 2026                                    │
│ ┌ Datos personales ─────┐ ┌ Documento de viaje [Dato sensible] ┐              │
│ │ Teléfono +5193812…    │ │ Pasaporte · AB123456 · vence …     │              │
│ └───────────────────────┘ └────────────────────────────────────┘              │
│ ┌ Datos de carrera ─────┐ ┌ Contacto de emergencia [Dato sensible] ┐          │
│ └───────────────────────┘ └────────────────────────────────────────┘          │
│ Consentimiento: runner-profile-2026-10 · 25 oct 2026                           │
│ Reservas vinculadas: BookingTable                                              │
│ Volver a corredores                                                            │
```

### Compatibilidad con `runner-portal.md` (F3–F6 pendientes)
- **Sin bloqueo mutuo.** Esta spec no toca `bookings` (esquema), `runnerPortal.service.ts`, `/mis-carreras`, `AccessPanel` ni `AuthDestination`. F3 de esta spec solo **añade** `listBookingsByRunner` a `bookings.service.ts` y a `modules/bookings/index.ts`; si runner-portal F3–F5 también editan `index.ts`, se integra sin conflicto lógico.
- **`RunnerAccount`/`RunnerAccount.test.tsx`:** F2 de esta spec añade "Mi perfil"; runner-portal F6-T2 añade "Ver mis carreras". El orden es indiferente; quien vaya segundo conserva el enlace del otro (ambos con `buttonVariants`, "Ver mis carreras" primero).
- **`alert`:** lo instala quien llegue primero (esta F2 o runner-portal F5); el otro no lo reinstala.
- **Vínculo de reservas:** sigue siendo de `/mis-carreras` (Decisión 10); "Reservas vinculadas" se llena cuando F5 esté en `main`.
- **`CrmShell`:** runner-portal ya añadió "Reservas"; esta F3 añade "Corredores" después. Si la spec del patrocinador también toca `CrmShell` o `permissions.ts`, se ejecutan en secuencia.
- **Futuro (fuera de alcance):** `PortalHeader` (F5) puede enlazar a "Mi perfil"; prellenar el nombre del participante desde el perfil requeriría su propia spec.

## Reutilización
- `getCurrentUser`, `requireVerifiedEmail`, `UnauthorizedError`/`ForbiddenError`, `can()` (ampliada) de `lib/auth/`; `getCrmAccess`, `CrmShell`, `NoCrmAccess`, `SignOutButton`, `RunnerAccount` de `modules/accounts`.
- `getDb()`/`db.batch`, `lib/db-schema.ts` (`bookings`), `npm run db:generate` y el procedimiento manual del README.
- `BookingTable`, `listBookings` (columnas compartidas) de `modules/bookings`; `formatTripDate` de `@/modules/trips`; `SiteHeader`/`SiteFooter` de `@/modules/landing`.
- Patrones: `BookingForm` (`useActionState` + `onSubmit`/`startTransition`, errores por campo), `BookingFilters` (`<form method="get">`), ficha de reserva (`<dl>`), `getRunnerPortal` (estados de página), `staff.actions.ts`/`bookings.actions.ts` (guarda → zod → service), regex E.164 de `leads`, fake de Neon HTTP de `staff.service.test.ts`.
- shadcn instalados: `button`, `badge`, `card`, `table`, `input`, `label`, `native-select`, `textarea`. A instalar: `alert`.
- Nativo: `<fieldset>`/`<legend>`, `<input type="date|checkbox|tel">`, `Intl.DateTimeFormat`.

## Tests
Los de servidor con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`; sin red ni secretos.
- `lib/form-schema.test.ts` (F1): casos del criterio de F1.
- `modules/accounts/schemas/runnerProfile.schema.test.ts` (F1): casos del criterio de F1, con `today` fijo; enums = `enumValues`; mensajes sin el valor introducido.
- `modules/accounts/utils/runnerProfileDisplay.test.ts` (F1): etiquetas de cada valor de los enums; `getMissingProfileSections` (null, completo, cada sección por separado, documento vencido, opcionales ignorados); `formatProfileTimestamp` con `TZ` distinto; `RUNNER_PROFILE_CONSENT.version` no vacío y ≤ 40.
- `modules/accounts/services/runnerProfile.service.test.ts` (F1; `@/lib/db` con el fake de Neon HTTP): casos del criterio de F1, inspeccionando SQL y parámetros (el `user_id` del parámetro, `ON CONFLICT ("user_id") DO UPDATE`, sin `created_at`/`user_id` en el `SET`).
- `modules/accounts/actions/runnerProfile.actions.test.ts` (F2; guards y service mockeados, `next/cache` mockeado): casos del criterio de F2, incluido un error del service con datos del formulario en su mensaje que no aparece ni en el estado ni en `console.error`.
- `modules/accounts/utils/runnerProfilePage.test.ts` (F2; guards, service y `next/server` mockeados): `connection()` antes de todo; `null` → `unauthenticated`; sin verificar → `unverified` sin llamar al service; `ForbiddenError` → `error`; otra excepción de `getCurrentUser` se relanza; fallo del service → `error` con el log fijo; ok con perfil y con `null`.
- `modules/accounts/components/RunnerAccount.test.tsx` (F2, ampliar): con sesión, enlace "Mi perfil" → `/cuenta/perfil`; el resto no cambia.
- `lib/auth/permissions.test.ts` (F3, ampliar): filas de `runners.view`; bucles de admin y sin roles.
- `modules/accounts/services/runnerDirectory.service.test.ts` (F3): `listRunners` (unión, búsqueda con `strpos`/`lower`, sin columnas sensibles en el SQL, `LIMIT 201` y `truncated`, conteo de activas); `getRunnerDetail` (ids inválidos sin consulta, batch filtrado por id, `null` sin perfil ni reservas, identidad de respaldo de la reserva).
- `modules/bookings/services/bookings.service.test.ts` (F3, ampliar): `listBookingsByRunner` filtra por `runner_user_id` y excluye anulados del pagado; los casos de `listBookings` siguen pasando.
- Sin unit tests (SETUP §3): `lib/db-schema.ts` (migración + prueba manual), tipos, componentes de `modules/accounts/components/` nuevos (de un solo dominio; su lógica está en schema, utils y acción), `CrmShell`, páginas async de `app/` y `components/ui/`.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer) y, en F2 y F3, con la medición del Worker en su última tarea. Nadie aplica migraciones, despliega ni hace commits.

### Fase 1 — Datos, schemas y service del perfil (5 tareas, 14 archivos: 2 generados por drizzle-kit)
Coordinación: si otra spec (p. ej. la del patrocinador) integra antes una migración, T1 se ejecuta sobre lo que haya en `main` y toma el siguiente número.
- [x] T1 — Base compartida: enums y tabla `runner_profiles` en el schema; `npm run db:generate` y revisión del SQL (solo objetos nuevos en `public`; sin `neon_auth`, `DROP`, `REFERENCES` ni cambios en otras tablas) · archivos: `lib/db-schema.ts`, `drizzle/000N_*.sql` (generado), `drizzle/meta/000N_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — Base compartida: `lib/form-schema.ts` (`blankToNull`, `requiredText`, `e164PhoneSchema`) con tests · archivos: `lib/form-schema.ts`, `lib/form-schema.test.ts` · depende de: T1 · secuencial (base, `lib/`)
- [x] T3 — Schema del perfil, tipos y utilidades de presentación, con tests · archivos: `modules/accounts/schemas/runnerProfile.schema.ts`, `modules/accounts/schemas/runnerProfile.schema.test.ts`, `modules/accounts/types/runnerProfile.types.ts`, `modules/accounts/utils/runnerProfileDisplay.ts`, `modules/accounts/utils/runnerProfileDisplay.test.ts` · depende de: T1, T2 · secuencial (con T5 en paralelo)
- [x] T4 — Service del propio perfil (`getRunnerProfile`, `saveRunnerProfile`) con tests · archivos: `modules/accounts/services/runnerProfile.service.ts`, `modules/accounts/services/runnerProfile.service.test.ts` · depende de: T3 · secuencial
- [x] T5 — README, sección "Perfiles de runners": qué guarda y por qué, datos sensibles, revisión y aplicación manual de la migración (orden, `BEGIN;`/`COMMIT;`, sin GRANT, `neon_auth` antes/después), pruebas manuales de F1 y supresión a petición por SQL · archivos: `README.md` · depende de: T1 · paralelo (con T3 y T4)

### Fase 2 — `/cuenta/perfil` (5 tareas, 14 archivos: 1 generado por el CLI de shadcn)
Requisitos previos: F1 cerrada y migración aplicada en la rama de Neon de prueba. Para T5, enmiendas de `accounts-auth-ui.md` y `landing-public-site.md` aprobadas.
- [ ] T1 — Base compartida: `npx shadcn@latest add alert` solo si `components/ui/alert.tsx` no existe (sin sobrescribir otros archivos) · archivos: `components/ui/alert.tsx` · depende de: Fase 1 · secuencial (base, `components/ui/`)
- [ ] T2 — `saveRunnerProfileAction` con tests y tipo `RunnerProfileActionState` · archivos: `modules/accounts/actions/runnerProfile.actions.ts`, `modules/accounts/actions/runnerProfile.actions.test.ts`, `modules/accounts/types/runnerProfile.types.ts` · depende de: T1 · paralelo (con T3)
- [ ] T3 — `getRunnerProfilePage` (guarda y estados) con tests · archivos: `modules/accounts/utils/runnerProfilePage.ts`, `modules/accounts/utils/runnerProfilePage.test.ts` · depende de: T1 · paralelo (con T2; `RunnerProfilePageState` se declara y exporta en el propio `runnerProfilePage.ts`, como `RunnerPortalState` en `runnerPortal.ts`, así T2 es el único que toca `types/`)
- [ ] T4 — Componentes `RunnerProfileForm` y `RunnerProfilePanel` · archivos: `modules/accounts/components/RunnerProfileForm.tsx`, `modules/accounts/components/RunnerProfilePanel.tsx` · depende de: T2, T3 · secuencial
- [ ] T5 — Exports, ruta `/cuenta/perfil`, enlace "Mi perfil" en `RunnerAccount` con test, texto de `AccountSection` y README (modelo de acceso: el runner tiene perfil propio en `/cuenta/perfil`); comprobar `ƒ /cuenta/perfil` y `○ /cuenta`; medir el Worker · archivos: `modules/accounts/index.ts`, `app/cuenta/perfil/page.tsx`, `modules/accounts/components/RunnerAccount.tsx`, `modules/accounts/components/RunnerAccount.test.tsx`, `modules/landing/components/AccountSection.tsx`, `README.md` · depende de: T4 · secuencial

### Fase 3 — CRM: corredores (5 tareas, 16 archivos)
Requisito previo: F2 cerrada. Si la spec del patrocinador modifica `lib/auth/permissions.ts` o `CrmShell`, T1 y T5 se ejecutan después de integrarla.
- [ ] T1 — Base compartida: permiso `runners.view` (commercial; admin implícito) con tests · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: Fase 2 · secuencial (base, `lib/`)
- [ ] T2 — `listBookingsByRunner` en `bookings` con tests y export · archivos: `modules/bookings/services/bookings.service.ts`, `modules/bookings/services/bookings.service.test.ts`, `modules/bookings/index.ts` · depende de: T1 · paralelo (con T3; único que toca `modules/bookings/index.ts`)
- [ ] T3 — Service del CRM (`listRunners`, `getRunnerDetail`) con tests y tipos `RunnerListItem`/`CrmRunnerDetail` · archivos: `modules/accounts/services/runnerDirectory.service.ts`, `modules/accounts/services/runnerDirectory.service.test.ts`, `modules/accounts/types/runnerProfile.types.ts` · depende de: T1 · paralelo (con T2)
- [ ] T4 — Componentes `RunnerSearch`, `RunnerTable`, `RunnerProfileDetails` · archivos: `modules/accounts/components/RunnerSearch.tsx`, `modules/accounts/components/RunnerTable.tsx`, `modules/accounts/components/RunnerProfileDetails.tsx` · depende de: T3 · secuencial
- [ ] T5 — Enlace "Corredores" en `CrmShell`, exports, páginas del CRM y README (sección "Perfiles de runners": CRM de solo lectura, `runners.view`, minimización de la lista, checklist manual); medir el Worker · archivos: `modules/accounts/components/CrmShell.tsx`, `modules/accounts/index.ts`, `app/crm/(protected)/corredores/page.tsx`, `app/crm/(protected)/corredores/[id]/page.tsx`, `README.md` · depende de: T2, T4 · secuencial

## Cambios que requiere en otras specs (no editados aquí; cada uno vuelve a `borrador` y necesita tu aprobación)
1. **`accounts-auth-ui.md` — bloqueante para F2-T5.**
   - Alcance, "No incluye": "perfil de usuario" y "Siguen fuera el perfil de runner, sus datos en la base de datos…" → el perfil del runner lo cubre `accounts-runner-profiles.md`; siguen fuera el cambio de correo/contraseña con sesión y la comunidad.
   - Requisito 12, `RunnerAccount` con sesión: añade el enlace "Mi perfil" → `/cuenta/perfil` (junto a "Ver mis carreras" cuando `runner-portal.md` F6 lo añada). `/cuenta` sigue estática y sin redirección.
   - "Seguridad → Redirecciones": sin cambios (los destinos tras el login no cambian; `/cuenta/perfil` solo redirige a `/cuenta` sin sesión).
   - El aviso del alta "Todavía no crea un perfil viajero independiente ni te inscribe en un evento." sigue siendo cierto (registrarse no crea el perfil) y no cambia.
2. **`landing-public-site.md` — bloqueante para F2-T5.**
   - Criterio F3: la nota de `/cuenta` pasa a "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay descuentos activos.".
   - "Base para el trabajo futuro → Runner": el perfil existe en `runner_profiles` (`accounts-runner-profiles.md`); la guarda de runner de `/cuenta/perfil` es `getRunnerProfilePage`.
3. **`runner-portal.md` — no bloqueante (recomendado).**
   - "No incluye → Otras páginas de gestión del runner (perfil…)": el perfil lo cubre `accounts-runner-profiles.md`.
   - F6-T2: `RunnerAccount` conserva "Mi perfil" al añadir "Ver mis carreras" (y su test).
   - F5-T1: instalar `alert` solo si no existe.
   - Opcional: `PortalHeader` (F5) con enlace "Mi perfil".
4. **`accounts-roles-permissions.md` — no bloqueante (recomendado).**
   - Matriz: nueva fila `runners.view` concedida a `commercial` (y a `admin` por la regla general); `[]` → false.
   - "Los runners son visitantes anónimos… no tienen cuenta ni perfil" sigue desactualizado: tienen cuenta y perfil propio en `runner_profiles`, que no es `profiles` y no concede roles.
5. **Spec del rol patrocinador (en redacción) — coordinación.** No concede `runners.view` salvo decisión explícita; se coordina el orden de `lib/auth/permissions.ts`, `CrmShell` y la numeración de migraciones.
6. **`trips-catalog.md`, `crm-leads-pipeline.md`, `platform-neon-foundation.md`:** sin cambios. Seguimiento en modo build (sin spec): que `trips.schema.ts`, `bookings.schema.ts` y `leads.schema.ts` importen `blankToNull`/`requiredText`/`e164PhoneSchema` de `lib/form-schema.ts` (en `leads`, revisar que tratar la clave ausente como vacía no cambie sus tests).

## Preguntas abiertas
1. **(No bloqueante) Texto legal del consentimiento.** Se propone el texto del Requisito 6 con la versión `runner-profile-2026-10`, una casilla obligatoria en cada guardado y supresión manual a petición. Los datos médicos son datos sensibles según la Ley 29733 de Perú: ¿quieres revisar el texto con quien lleve el tema legal, enlazar una política de privacidad (hoy no existe una página) o fijar un plazo de conservación? Si no respondes, se implementa el texto propuesto, sin enlace ni plazo.
