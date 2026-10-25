# Leads: alta manual, embudo, ficha, responsable y seguimiento (R3 · CRM comercial)

- Módulo: crm
- Estado: aprobado
- Depende de:
  - `platform-neon-foundation.md` (Fase 1 aprobada): Neon + Drizzle `neon-http` (`getDb()` en `lib/db.ts`, `db.batch` atómico, sin transacciones interactivas), schema en `lib/db-schema.ts`, migraciones generadas con `npm run db:generate` y aplicadas a mano.
  - `accounts-roles-permissions.md` y `accounts-auth-ui.md` (implementadas): `can()`, `requirePermission`, `getCrmAccess(permission)`, layout `app/crm/(protected)/`, `CrmShell`, `NoCrmAccess`, `profiles` y `staff_assignments`.
  - `trips-catalog.md` (aprobada; F1 implementada, F2 pendiente): tabla `trips` (`id` UUID inmutable, `slug`, `status`), migración `drizzle/0001_young_korvac.sql` (pendiente de aplicar). Coordinación con su F2 en "Relación con otras specs".
- Sustituye por completo a la versión anterior de esta spec (D1, Cloudflare Access, `crm-auth.md`, `platform-cloudflare-deploy.md`). Esa versión obsoleta llegó a quedar marcada como aprobada en disco; esta reescritura es un borrador nuevo y necesita su propia aprobación.

## Objetivo
Un comercial de Carreras Viajeras recibe consultas por WhatsApp (el canal sigue siendo manual en el MVP). Hoy no hay dónde registrarlas ni seguirlas. Esta spec le da un CRM mínimo para:
- registrar a mano la consulta como **lead**;
- moverlo por el **embudo** (nuevo → contactado → cotizado → reservado → pagado / perdido);
- consultar y editar su **ficha**;
- asignarle un **responsable** del equipo;
- llevar el **seguimiento** (notas, llamadas y mensajes, más la próxima acción con fecha) hasta el cierre.

Usuarios: staff con rol `commercial` o `admin`. Las cuentas de runner (registro público de la landing) nunca acceden.

## Alcance
- Incluye:
  - (F1) Tablas `leads` y `lead_activities` con sus enums en `lib/db-schema.ts`, en una sola migración `drizzle/0002_*.sql` que el usuario aplica a mano. Permiso `leads.manage`. Schemas, tipos y service de alta y lista. Documentación de la migración en el README.
  - (F2) `/crm/leads` (lista paginada con resumen del embudo y filtros por etapa, responsable y "mis leads") y `/crm/leads/nuevo` (alta manual), con el enlace "Leads" en la cabecera.
  - (F3) Ficha `/crm/leads/<id>` (datos, cambio de etapa con motivo de pérdida y reasignación del responsable) y `/crm/leads/<id>/editar` (edición de los datos de contacto).
  - (F4) Historial en la ficha: alta, cambios de etapa y de responsable como actividades, más el registro manual de notas, llamadas y mensajes. `lib/dates.ts` compartido.
  - (F5) Próxima acción (fecha y nota) en la ficha y en la lista, filtros "Vencidos" y "Pendientes" y el enlace "Mis pendientes".
  - (F6) Archivar un lead (sin borrado) y filtro "Archivados".
  - Medición del tamaño del Worker al cerrar cada fase, con umbral de consulta de 2 MiB.
- No incluye:
  - **Captura automática** del formulario de la landing: envío y guardado del lead, Turnstile, outbox, API privada claim/ack ni n8n. Irá en una spec futura según `platform-neon-foundation.md`; aquí solo se deja preparado el modelo (ver "Preparación para la captura automática").
  - Cambios en la landing (`modules/landing/**`, `/contacto`), aunque se documenta la discrepancia de identificadores de destino.
  - Integración con WhatsApp: enviar mensajes, leer conversaciones, enlaces `wa.me` desde el CRM.
  - Importes, cotizaciones, reservas o pagos reales: "Reservado" y "Pagado" son etapas que el comercial marca a mano. No hay cupos ni disponibilidad calculados.
  - Borrado físico de leads o actividades, restauración de leads archivados, editar o borrar actividades.
  - Búsqueda por texto (nombre, teléfono, email): evita poner datos personales en la URL. Tampoco hay ordenación configurable, exportación ni importación.
  - Detección o fusión de duplicados.
  - Notificaciones, recordatorios por email o calendario, asignación automática o por turnos.
  - Kanban o arrastrar y soltar: el embudo es un resumen por etapa con enlaces a la lista filtrada, y el cambio de etapa se hace en la ficha.
  - Historial de cambios en los datos de contacto o en la próxima acción: solo se registran el alta, la etapa, el responsable, el archivo y el seguimiento manual.
  - Paneles o métricas de conversión. La página de inicio `/crm` no cambia.
  - Seeds o datos de ejemplo, y GRANT de base de datos (`DATABASE_URL` usa el rol owner).
  - Cambios en `lib/auth/guards.ts`, `getCrmAccess`, `NoCrmAccess` y el layout protegido.

## Requisitos
1. **Etapas** (valor → etiqueta): `new` Nuevo, `contacted` Contactado, `quoted` Cotizado, `reserved` Reservado, `paid` Pagado y `lost` Perdido.
   - Todo lead nace en `new`.
   - `paid` y `lost` son etapas **cerradas** y el resto **abiertas**.
   - Se puede pasar de cualquier etapa a cualquier otra distinta, incluido reabrir un lead cerrado para corregir un error. Cada cambio queda en el historial.
2. **Motivo de pérdida:** pasar a `lost` exige un motivo en texto libre (3–200 caracteres). Salir de `lost` lo borra.
3. **Datos del lead:**
   - **Nombre:** obligatorio, 2–120 caracteres.
   - **WhatsApp o teléfono:** obligatorio, con código de país. Se guarda normalizado en formato E.164 (`+` y de 8 a 15 dígitos, sin espacios).
   - **Email:** opcional, en minúsculas.
   - **Ciudad o país:** opcional, ≤ 80 caracteres.
   - **Viaje del catálogo:** opcional; solo viajes no archivados al elegirlo.
   - **Destino en texto libre:** opcional, ≤ 120 caracteres.
   - **Origen:** `whatsapp`, `web_form` u `other`; el alta manual solo ofrece WhatsApp y Otro.
   - **Responsable.**
   - **Consentimiento:** obligatorio, con su versión y fecha.
   - **Nota inicial:** opcional, ≤ 2000 caracteres; se guarda en la actividad de alta.
4. **Consentimiento:** el alta manual exige marcar "El contacto aceptó que guardemos sus datos para atender su consulta." Se guarda `consent_version = "crm-manual-v1"` y `consented_at = now()`. Sin la casilla no se crea nada.
5. **Responsable:** un usuario con asignación de staff activa (`staff_assignments.revoked_at IS NULL`) en un rol que tenga `leads.manage`, identificado por `user_id` y mostrado con el email de `profiles`.
   - En el alta, por defecto es quien registra el lead.
   - Si el responsable pierde el rol, el lead se conserva y su email aparece con "(sin acceso)" hasta que se reasigne.
6. **Quién puede hacer qué:** cualquier usuario con `leads.manage` ve todos los leads y puede crear, editar, cambiar etapa, reasignar, registrar seguimiento, fijar la próxima acción y archivar (Pregunta abierta 1). El autor de cada acción es siempre el usuario de la sesión, nunca un campo del formulario.
7. **Historial:** se registran como actividades, con autor y fecha:
   - el alta (con la nota inicial, si la hay);
   - cada cambio de etapa (origen → destino, más el motivo si pasa a perdido);
   - cada cambio de responsable (anterior → nuevo);
   - el archivo;
   - las notas, llamadas y mensajes manuales.

   El historial se lista del más reciente al más antiguo y no se edita ni se borra.
8. **Próxima acción:** fecha de calendario (`YYYY-MM-DD`, sin hora) y nota opcional (≤ 200 caracteres); una nota exige fecha.
   - Solo existe en leads abiertos y no archivados. Al pasar a `paid` o `lost` se borra.
   - Respecto al "hoy" de `America/Lima`, una fecha anterior está **vencida** y una igual es **para hoy**.
   - **Pendientes** = leads abiertos y no archivados con próxima acción hoy o vencida.
9. **Lista:**
   - 25 leads por página, con "Anterior" y "Siguiente" y sin total.
   - Orden por fecha de alta descendente. Con los filtros "Vencidos" o "Pendientes", el orden es por próxima acción ascendente.
   - Filtros por etapa, responsable ("Mis leads" o un miembro concreto) y seguimiento (F5).
   - Los archivados no aparecen, salvo con el filtro "Archivados" (F6).
   - Los filtros viajan en la URL (`etapa`, `responsable`, `seguimiento`, `pagina`), sin datos personales.
10. **Embudo:** sobre la lista, un resumen por etapa (en el orden del Requisito 1) con el número de leads no archivados. Respeta el filtro de responsable y no el de etapa; cada etapa enlaza a la lista filtrada por ella.
11. **No se borran leads.** Archivar (F6) los oculta de la lista y deja la ficha en solo lectura. Es final en el MVP.
12. **Acceso denegado por defecto:**
    - cada página de leads comprueba `getCrmAccess("leads.manage")`;
    - cada Server Action, `requirePermission("leads.manage")`;
    - `leads.manage` se concede solo a `commercial` y a `admin` (que tiene todos los permisos);
    - una cuenta sin rol de staff (runner) ve `NoCrmAccess` y las acciones le devuelven `forbidden`.
13. **Privacidad:**
    - Ningún dato personal (nombre, teléfono, email, notas) ni mensaje original de la base llega a logs, a `Error.message` ni a respuestas de error.
    - Las acciones que fallan lanzan un error de texto fijo, sin causa.
    - Los mensajes de validación no repiten lo escrito.
    - Lo escrito solo vuelve al mismo usuario en `values`, para restaurar su formulario.
    - Las páginas son dinámicas, protegidas y `noindex` (heredado del layout).
14. **Concurrencia:** cada escritura es atómica (una sentencia con CTE o un `db.batch`) y decide con la condición de su `WHERE` (lead existente, no archivado, valor distinto), no con una lectura previa de otra petición. Dos ediciones simultáneas de los datos de contacto: gana la última.

## Criterios de aceptación

Fase 1 (datos, permiso y service):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera solo `drizzle/0002_*.sql` (más su snapshot y el journal) con:
  - los enums `lead_stage`, `lead_source` y `lead_activity_type`;
  - las tablas `leads` y `lead_activities`, sus FK, CHECK e índice.

  El SQL no contiene `neon_auth`, `DROP`, `CREATE SCHEMA` ni cambios en `profiles`, `staff_assignments`, `staff_invitations` o `trips`. `drizzle.config.ts` no cambia.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dadas `0001` y `0002` aplicadas a mano, cuando inserto filas de prueba, entonces la base rechaza:
  - teléfono sin `+` o con letras, y email con mayúsculas;
  - `stage = 'lost'` sin `lost_reason`, o `lost_reason` en otra etapa;
  - `next_action_note` sin fecha, y próxima acción en `paid` o `lost`;
  - `archived_at` sin `archived_by`;
  - `trip_id` o `owner_user_id` inexistentes;
  - una actividad `note` sin `body` y una `stage_changed` sin etapas.
- [ ] (F1) Dado `can()`, entonces `commercial` y `admin` tienen `leads.manage`, una lista vacía (runner) no, y los permisos existentes no cambian (unit test).
- [ ] (F1) Dado `createLeadSchema` con los strings de un `FormData` válido, entonces:
  - normaliza el teléfono (`"+51 938-127 170"` → `"+51938127170"`);
  - pasa el email a minúsculas;
  - convierte los opcionales vacíos en `null`;
  - descarta claves extra (`stage`, `createdBy`, `consentVersion`).

  Rechaza, con error en su campo: teléfono sin código de país, nombre de 1 carácter, `tripId` no UUID, origen `web_form` y la falta de consentimiento (unit test).
- [ ] (F1) Dado `parseLeadListQuery` con `etapa=foo`, `pagina=-3` o valores repetidos, entonces devuelve los valores por defecto sin lanzar. `leadListHref` omite los valores por defecto y conserva los filtros al cambiar de página (unit test).
- [ ] (F1) Dado `createLead` con la base simulada, entonces:
  - inserta el lead y su actividad `created` (con la nota inicial) de forma atómica, con `stage` por defecto y `consent_version` `crm-manual-v1`;
  - devuelve `{ id }`;
  - devuelve `"invalid_owner"` si el responsable no tiene un rol de staff activo con `leads.manage`;
  - devuelve `"invalid_trip"` si el viaje no existe o está archivado (unit test).
- [ ] (F1) Dado `getLeadList` con la base simulada, entonces en un solo `db.batch`:
  - excluye los archivados;
  - aplica etapa y responsable (`mine` → id de la sesión);
  - ordena por `created_at` desc;
  - pide 26 filas para calcular `hasNextPage` y devuelve 25;
  - cuenta por etapa con ceros para las etapas vacías, sin aplicar el filtro de etapa;
  - devuelve las opciones de responsable activas (unit test).
- [ ] (F1) Dado el README, entonces documenta cómo revisar y aplicar a mano `0002`: después de `0001`, entre `BEGIN;` y `COMMIT;`, sin GRANT y sin reaplicar `0000`.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. Tamaño del Worker medido y registrado (ver Diseño, "Tamaño del Worker").

Fase 2 (alta manual y lista):
- [ ] (F2) Dado un `commercial` verificado, entonces la cabecera muestra "Leads" (enlace a `/crm/leads`). Al abrirla, ve:
  - el título "Leads" y el enlace "Nuevo lead";
  - el resumen del embudo con las 6 etapas y sus contadores;
  - los filtros "Etapa" y "Responsable";
  - una tabla con Nombre, WhatsApp, Interés, Etapa (`Badge`), Responsable y Origen.
- [ ] (F2) Dado `/crm/leads/nuevo` con nombre, WhatsApp `+51 938 127 170`, consentimiento marcado y el resto vacío, cuando pulso "Registrar lead", entonces vuelvo a `/crm/leads` y el lead aparece primero, en "Nuevo", con origen "WhatsApp" y yo como responsable.
- [ ] (F2) Dado el formulario de alta sin consentimiento o con un teléfono sin código de país, cuando lo envío, entonces veo el error bajo el campo, no se crea nada y lo escrito se conserva.
- [ ] (F2) Dado el formulario de alta, entonces "Viaje del catálogo" lista los viajes no archivados (los borradores con "(borrador)") más la opción "Sin viaje del catálogo". "Responsable" lista el staff activo, con el usuario actual preseleccionado.
- [ ] (F2) Dados 30 leads, cuando abro `/crm/leads`, entonces veo 25 y "Siguiente". En `?pagina=2` veo 5 y "Anterior", y los filtros activos se conservan al paginar.
- [ ] (F2) Dados los filtros, cuando elijo "Mis leads" y "Cotizado" y pulso "Filtrar", entonces la URL es `/crm/leads?etapa=quoted&responsable=mios` y solo veo mis leads cotizados. El embudo cuenta solo mis leads. "Limpiar" vuelve a `/crm/leads`.
- [ ] (F2) Dada una lista vacía, entonces veo "Aún no hay leads. Registra el primero con «Nuevo lead»."; con filtros sin resultados, "Ningún lead coincide con los filtros."
- [ ] (F2) Dada una cuenta verificada sin rol de staff (runner), cuando abre `/crm/leads` o `/crm/leads/nuevo`, entonces ve `NoCrmAccess`. `createLeadAction` llamada con esa sesión devuelve `forbidden` y no llama al service; sin sesión devuelve `unauthorized` (unit test).
- [ ] (F2) Dado `createLeadAction`:
  - con datos inválidos, devuelve `invalid_input` con `fieldErrors` y `values`;
  - con `"invalid_owner"` o `"invalid_trip"`, devuelve su error con el mensaje en su campo;
  - si el service lanza, lanza `"lead action failed"` sin el mensaje original y sin escribir en consola (unit test).
- [ ] (F2) Lint, tests y build sin errores. Worker medido.

Fase 3 (ficha, edición, etapa y responsable):
- [ ] (F3) Dado un lead, cuando pulso su nombre en la lista, entonces abro `/crm/leads/<id>`. La ficha muestra:
  - el nombre y la etapa;
  - WhatsApp (`tel:`), email (`mailto:`), ciudad o país e interés (viaje y destino);
  - origen, responsable, consentimiento (versión) y quién lo registró;
  - el enlace "Editar datos".
- [ ] (F3) Dado `/crm/leads/<uuid inexistente>` o `/crm/leads/abc`, entonces veo la página 404 (también en `/editar`).
- [ ] (F3) Dado `/crm/leads/<id>/editar`, cuando cambio el teléfono y guardo, entonces vuelvo a la ficha con el dato nuevo. Con un email inválido veo el error y se conserva lo escrito. Si el viaje vinculado se archivó después, aparece como opción "(archivado)" y se puede guardar sin cambiarlo.
- [ ] (F3) Dada la ficha, cuando elijo "Cotizado" y pulso "Cambiar etapa", entonces la ficha y la lista muestran "Cotizado".
- [ ] (F3) Dado "Perdido" sin motivo, cuando lo envío, entonces veo "Indica el motivo de la pérdida." Con motivo, el lead queda "Perdido" y el motivo se ve en la ficha.
- [ ] (F3) Dada la ficha, cuando elijo otro miembro del staff y pulso "Reasignar", entonces la ficha y la lista muestran el nuevo responsable. Elegir el mismo responsable o la misma etapa devuelve "No hay cambios."
- [ ] (F3) Dado `changeLeadStage`, entonces en una sola sentencia atómica:
  - actualiza la etapa y `updated_at`;
  - fija o borra `lost_reason`;
  - borra la próxima acción si la etapa es cerrada;
  - inserta la actividad `stage_changed` con origen, destino y motivo.

  Devuelve `"no_change"` si la etapa es la misma y `"not_found"` si el lead no existe o está archivado (unit test). `changeLeadOwner` hace lo mismo con `owner_changed` y además devuelve `"invalid_owner"` si el nuevo responsable no está activo (unit test).
- [ ] (F3) Dadas `updateLeadAction`, `changeLeadStageAction` y `changeLeadOwnerAction`:
  - sin sesión o sin permiso devuelven `unauthorized`/`forbidden` y no llaman al service;
  - ignoran los campos extra (`actorUserId`, `stage` en la edición);
  - usan siempre el id de la sesión como autor (unit test).
- [ ] (F3) Dado el alta, cuando registro un lead, entonces vuelvo a su ficha (no a la lista).
- [ ] (F3) Lint, tests y build sin errores. Worker medido.

Fase 4 (historial y actividades):
- [ ] (F4) Dada la ficha, entonces la sección "Seguimiento" muestra el historial del más reciente al más antiguo. Cada entrada tiene su etiqueta, el texto, el email del autor y la fecha y hora en `America/Lima`:
  - "Lead creado" (con la nota inicial);
  - "Etapa: Nuevo → Contactado" (con el motivo si es pérdida);
  - "Responsable: a@… → b@…";
  - "Nota", "Llamada" o "Mensaje".
- [ ] (F4) Dada la ficha, cuando registro una "Llamada" con texto, entonces aparece arriba del historial y el formulario queda vacío. Sin texto veo el error bajo el campo y no se crea nada.
- [ ] (F4) Dado `addLeadActivity`, entonces inserta la actividad solo si el lead existe y no está archivado (si no, `"not_found"`) y nunca acepta tipos de sistema (`created`, `stage_changed`…) desde el formulario (unit test del schema y del service).
- [ ] (F4) Dado `lib/dates.ts`, entonces se cumple lo siguiente con cualquier zona horaria del proceso, y `formatStaffDateTime` de `accounts` sigue dando el mismo resultado (unit test):
  - `formatDateTime(new Date("2026-10-19T03:00:00Z"))` → "18 oct 2026, 22:00";
  - `getTodayDate(new Date("2026-10-19T03:00:00Z"))` → "2026-10-18";
  - `formatCalendarDate("2026-10-25")` → "25 oct 2026";
  - `compareToToday("2026-10-17", "2026-10-18")` → `"past"`.
- [ ] (F4) Lint, tests y build sin errores. Worker medido.

Fase 5 (próxima acción y pendientes):
- [ ] (F5) Dado un lead abierto, cuando guardo en la ficha una próxima acción con fecha y nota, entonces la ficha y la columna "Próxima acción" de la lista muestran la fecha (`formatCalendarDate`) y la nota. Si la fecha es anterior a hoy, aparece la insignia "Vencida"; si es hoy, "Hoy".
- [ ] (F5) Dada una nota sin fecha, cuando guardo, entonces veo "Indica la fecha." bajo la fecha y se conserva la nota. Con ambos campos vacíos, la próxima acción se quita.
- [ ] (F5) Dado un lead "Pagado" o "Perdido", entonces la ficha muestra "Lead cerrado: no tiene próxima acción." en lugar del formulario. `setNextAction` devuelve `"closed"` (unit test).
- [ ] (F5) Dado el filtro "Seguimiento", cuando elijo "Vencidos", entonces solo veo leads abiertos con próxima acción anterior a hoy, ordenados por fecha ascendente. Con "Pendientes" también entran los de hoy.
- [ ] (F5) Dada la cabecera, cuando pulso "Mis pendientes", entonces abro `/crm/leads?responsable=mios&seguimiento=pendientes`.
- [ ] (F5) Lint, tests y build sin errores. Worker medido.

Fase 6 (archivo):
- [ ] (F6) Dada la ficha de un lead no archivado, cuando pulso "Archivar" y confirmo, entonces:
  - el lead desaparece de la lista y del embudo;
  - el historial muestra "Archivado";
  - la ficha muestra "Lead archivado: solo lectura." sin formularios ni "Editar datos";
  - `/editar` muestra el mismo aviso.

  Si cancelo, no cambia nada.
- [ ] (F6) Dado el filtro "Etapa: Archivados", entonces solo veo leads archivados (`?etapa=archivados`).
- [ ] (F6) Dado `archiveLead`, entonces marca `archived_at`/`archived_by`, borra la próxima acción e inserta la actividad `archived` atómicamente. Devuelve `"not_found"` si no existe o ya estaba archivado. Todas las demás escrituras sobre un archivado devuelven `"not_found"` (unit test).
- [ ] (F6) Lint, tests y build sin errores. Worker medido.

## Diseño técnico

### Decisiones
- **Patrón de datos:** el de `accounts` y `trips`:
  - Server Components que llaman al service `server-only`;
  - Server Actions con guarda → zod → service → `revalidatePath`;
  - sin axios, TanStack Query ni API HTTP. No se crea `app/api/leads`, porque el futuro consumidor (n8n) usará la API privada de la spec de captura.
- **Una sola migración (`0002`) con todo el modelo:** también incluye las columnas de próxima acción y archivo, aunque se usan en F5 y F6. Cada migración se aplica a mano en el SQL Editor; una sola evita tres operaciones manuales y `ALTER TABLE` intermedios. Si el usuario descarta el archivo (Pregunta abierta 6), se quitan esas columnas antes de aprobar.
- **El viaje se vincula por `trip_id`** (FK opcional a `trips.id`, `ON DELETE RESTRICT`; los viajes nunca se borran), elegido en un selector de viajes no archivados.
  - **`destination_text`** es texto libre opcional para el interés que aún no está en el catálogo (hoy el catálogo puede estar vacío: la migración `0001` está pendiente y aún no hay gestión de viajes en el CRM).
  - Los dos campos pueden convivir o estar vacíos.
  - El service del CRM lee `trips` directamente desde `@/lib/db-schema` para el selector y para el título (mismo esquema compartido en `lib/`). No importa internals de `modules/trips`, y su contrato público (`PublicTrip`) no sirve porque no incluye el `id` ni los borradores.
- **Etapas libres:** cualquier etapa → cualquier otra distinta, con historial. En un equipo pequeño con WhatsApp manual, corregir un error (p. ej. reabrir un "Perdido" que vuelve a escribir) es más útil que bloquear transiciones (Pregunta abierta 4).
- **Responsables:** `LEAD_OWNER_ROLES = staffRoleEnum.enumValues.filter((role) => can([role], "leads.manage"))`, que hoy son `commercial` y `admin`. Así la matriz de permisos sigue siendo la única fuente. Las sentencias validan el responsable con `EXISTS (SELECT 1 FROM staff_assignments WHERE user_id = $owner AND revoked_at IS NULL AND role = ANY($roles))`.
- **Historial con columnas tipadas**, no JSON: `stage_from`/`stage_to` y `owner_from`/`owner_to`, con CHECK por tipo. La nota inicial del alta y el motivo de pérdida van en `body`, sin columna de notas en `leads` (DRY).
- **Fechas:**
  - `CRM_TIME_ZONE` (provisional `America/Lima`) y el formateo de instantes pasan de `modules/accounts/utils/staffDisplay.ts` a `lib/dates.ts` (segundo uso real; SETUP §1 regla 5), en F4.
  - `staffDisplay.ts` reexporta `formatDateTime` como `formatStaffDateTime` para no tocar `StaffTable` ni `InvitationsTable`, que también modifica `trips-catalog` F2.
  - La próxima acción es una fecha de calendario (`date`, modo string), comparada como string `YYYY-MM-DD` con `getTodayDate()`.
- **"Mis pendientes" es un preset de la lista** (`?responsable=mios&seguimiento=pendientes`), no una ruta nueva (KISS).
- **Filtros por GET:** un `<form method="get">` nativo, sin JavaScript de cliente. La URL lleva nombres de parámetros en español y los valores del enum (`etapa=quoted`). Los valores inválidos se ignoran con `.catch()`.
- **Paginación sin `COUNT`:** se pide una fila de más (`LIMIT 26`) para saber si hay página siguiente. La lista, el embudo y las opciones de responsable van en un solo `db.batch` (un round-trip).
- **Formularios:** se sigue el patrón del proyecto (`Label` + `Input`/`NativeSelect`/`Textarea` + `<p role="alert">`, sin `field` de shadcn). El envío usa `onSubmit` + `startTransition` (como `InviteStaffForm`) para conservar lo escrito tras un error.
- **Tamaño del Worker:** hoy mide ~1411 KiB gzip con `next build --webpack`. F2 añade 2 rutas, F3 añade 2 y F4–F6 solo modifican. La última tarea de cada fase ejecuta, en Linux/WSL y sin desplegar, `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>`. Registra el gzip en el resumen de la fase frente a la referencia de 1411 KiB y el umbral de consulta de 2 MiB (límite Free: 3 MiB). Si lo supera, se detiene y se consulta al usuario.

### Base de datos: `lib/db-schema.ts` (modificar, F1)
Todo en `public`, en snake_case. `updated_at` lo fija el service con `now()` en cada `UPDATE` (sin trigger).

| Objeto | Definición |
|---|---|
| enum `lead_stage` | `new`, `contacted`, `quoted`, `reserved`, `paid`, `lost` |
| enum `lead_source` | `whatsapp`, `web_form`, `other` |
| enum `lead_activity_type` | `created`, `stage_changed`, `owner_changed`, `archived`, `note`, `call`, `message` |
| `leads.id` | `uuid` PK `defaultRandom()` |
| `leads.full_name` | `text not null`; CHECK `char_length(full_name) BETWEEN 2 AND 120` |
| `leads.phone` | `text not null`; CHECK `phone ~ '^\+[1-9][0-9]{7,14}$'` |
| `leads.email` | `text`; CHECK `email IS NULL OR (email = lower(email) AND char_length(email) <= 254)` |
| `leads.location` | `text`; CHECK `char_length(location) <= 80` |
| `leads.trip_id` | `uuid` → `trips.id` `ON DELETE RESTRICT` |
| `leads.destination_text` | `text`; CHECK `char_length(destination_text) <= 120` |
| `leads.source` | `lead_source not null` (sin default: el origen siempre es explícito) |
| `leads.stage` | `lead_stage not null default 'new'` |
| `leads.lost_reason` | `text`; CHECK `leads_lost_reason_chk`: `(stage = 'lost') = (lost_reason IS NOT NULL) AND char_length(lost_reason) <= 200` |
| `leads.owner_user_id` | `text not null` → `profiles.user_id` `ON DELETE RESTRICT` |
| `leads.next_action_date` | `date` (modo string) |
| `leads.next_action_note` | `text`; CHECK `leads_next_action_chk`: `(next_action_note IS NULL OR next_action_date IS NOT NULL) AND char_length(next_action_note) <= 200 AND (next_action_date IS NULL OR (stage NOT IN ('paid','lost') AND archived_at IS NULL))` |
| `leads.consent_version` | `text not null`; CHECK `char_length(consent_version) BETWEEN 1 AND 40` |
| `leads.consented_at` | `timestamptz not null default now()` |
| `leads.created_by` | `text not null` → `profiles.user_id` `RESTRICT` |
| `leads.created_at`, `updated_at` | `timestamptz not null default now()` |
| `leads.archived_at` / `archived_by` | `timestamptz` / `text` → `profiles.user_id` `RESTRICT`; CHECK `(archived_at IS NULL) = (archived_by IS NULL)` |
| `lead_activities.id` | `uuid` PK `defaultRandom()` |
| `lead_activities.lead_id` | `uuid not null` → `leads.id` `ON DELETE RESTRICT` |
| `lead_activities.type` | `lead_activity_type not null` |
| `lead_activities.body` | `text`; CHECK `lead_activities_body_chk`: `(body IS NULL OR char_length(body) BETWEEN 1 AND 2000) AND CASE WHEN type IN ('note','call','message') THEN body IS NOT NULL WHEN type IN ('created','stage_changed') THEN true ELSE body IS NULL END` (obligatorio en el seguimiento manual, opcional en el alta y en el cambio de etapa, prohibido en el resto) |
| `lead_activities.stage_from`, `stage_to` | `lead_stage`; CHECK `lead_activities_stage_chk`: `CASE WHEN type = 'stage_changed' THEN stage_from IS NOT NULL AND stage_to IS NOT NULL AND stage_from <> stage_to ELSE stage_from IS NULL AND stage_to IS NULL END` |
| `lead_activities.owner_from`, `owner_to` | `text` → `profiles.user_id` `RESTRICT`; CHECK `lead_activities_owner_chk` análogo con `owner_changed` |
| `lead_activities.actor_user_id` | `text not null` → `profiles.user_id` `RESTRICT` |
| `lead_activities.created_at` | `timestamptz not null default now()` |
| índice `lead_activities_lead_created_idx` | `(lead_id, created_at)` |

Los CHECK con `char_length(x) <= n` pasan con `NULL`, por la semántica de CHECK en PostgreSQL. El developer puede reescribir las expresiones si son equivalentes; el criterio manual de F1 valida el comportamiento. Los actores y responsables siempre tienen fila en `profiles` (se crea al aceptar la invitación de staff).

Migración: `npm run db:generate` → `drizzle/0002_<nombre>.sql`, `drizzle/meta/0002_snapshot.json` y `drizzle/meta/_journal.json`. **Orden de aplicación:** `0001` (trips, pendiente) antes que `0002`, por la FK `leads.trip_id`. En `production` no se reaplica `0000`.

### Permisos: `lib/auth/permissions.ts` (modificar, F1)
```ts
export type Permission = "crm.access" | "staff.manage" | "trips.manage" | "leads.manage";
// PERMISSION_MATRIX: "leads.manage": ["commercial"]  — admin pasa siempre; [] (runner) → false
```

### Schemas, tipos y utilidades (`modules/crm/`)
- `schemas/leads.schema.ts` (sin `server-only`; mensajes en español):
  - (F1) `leadStageSchema`, `leadSourceSchema` y `leadActivityTypeSchema`: mismos valores que los enums de la base; el test lo comprueba.
  - (F1) `manualLeadSourceSchema = z.enum(["whatsapp", "other"])`.
  - (F1) `createLeadSchema` (entrada: strings de `Object.fromEntries(formData)`; `z.object` descarta claves desconocidas):

    | Campo | Regla y mensaje |
    |---|---|
    | `fullName` | trim, 2–120 |
    | `phone` | quita espacios, `()`, `-` y `.`, luego `/^\+[1-9]\d{7,14}$/`. Mensaje: "Escribe el número con código de país, p. ej. +51 938 127 170." |
    | `email` | `""` → `null`; si no, trim, minúsculas, `z.email()` y ≤ 254 |
    | `location` | `""` → `null`; si no, trim y ≤ 80 |
    | `tripId` | `""` → `null`; si no, `z.uuid()` |
    | `destinationText` | `""` → `null`; si no, trim y ≤ 120 |
    | `source` | `manualLeadSourceSchema` |
    | `ownerUserId` | 1–255 |
    | `note` | `""` → `null`; si no, trim y ≤ 2000 |
    | `consent` | `z.literal("on")`, con el mensaje "Confirma que el contacto aceptó que guardemos sus datos." |

    Ayudantes como `blankToNull` se definen en el módulo igual que en `trips.schema.ts`. Si un tercer módulo los necesita, se suben a `lib/`.
  - (F1) `leadListQuerySchema`: claves de URL `etapa`, `responsable` (`"mios"` o un id de 1–255) y `pagina` (entero 1–1000, por defecto 1), cada una con `.catch()`. En F5 se añade `seguimiento` (`vencidos` | `pendientes`) y en F6, `etapa = archivados`.
  - (F3) `updateLeadSchema`: los campos de contacto de `createLeadSchema` (`fullName`, `phone`, `email`, `location`, `tripId`, `destinationText`) más `leadId: z.uuid()`.
  - (F3) `leadStageChangeSchema`: `{ leadId, stage, lostReason }`. `lostReason` pasa de `""` a `null`; si no, trim 3–200. Con `stage = "lost"` es obligatorio ("Indica el motivo de la pérdida."); en otra etapa se fuerza a `null`.
  - (F3) `leadOwnerChangeSchema`: `{ leadId: z.uuid(), ownerUserId: 1–255 }`. (F6) `leadIdSchema`: `{ leadId: z.uuid() }`.
  - (F4) `leadActivityFormSchema`: `{ leadId: z.uuid(), type: z.enum(["note", "call", "message"]), body: trim 1–2000 }`.
  - (F5) `nextActionSchema`: `{ leadId, nextActionDate: "" → null | z.iso.date(), nextActionNote: "" → null | trim ≤ 200 }`. Una nota sin fecha da error en `nextActionDate`: "Indica la fecha.".
- `types/leads.types.ts`:
  - (F1) `LeadStage`, `LeadSource`, `CreateLeadInput` (`z.output`), `LeadListFilters = { stage?: LeadStage; owner?: "mine" | string; page: number }`, `LeadOwnerOption = { userId: string; email: string }`, `LeadTripOption = { id: string; title: string; status: "draft" | "published" | "archived" }`.
  - (F1) `LeadListItem = { id; fullName; phone; stage; source; trip: { id; title } | null; destinationText; owner: { userId; email; active: boolean } }`.
  - (F1) `LeadList = { leads: LeadListItem[]; hasNextPage: boolean; stageCounts: Record<LeadStage, number>; ownerOptions: LeadOwnerOption[] }`.
  - (F2) `LeadActionState`:
    ```ts
    export type LeadActionState =
      | { status: "idle" }
      | { status: "success"; message: string }
      | {
          status: "error";
          code: "unauthorized" | "forbidden" | "invalid_input" | "invalid_owner" | "invalid_trip"
              | "not_found" | "no_change" | "closed"; // not_found/no_change desde F3, closed desde F5
          message: string;
          fieldErrors?: Record<string, string[]>;
          values?: Record<string, string>;
        };
    ```
  - (F3) `UpdateLeadInput`, `LeadStageChangeInput`, `LeadDetail` (`LeadListItem` + `email`, `location`, `lostReason`, `trip.status`, `consentVersion`, `consentedAt`, `createdBy: { email }`, `createdAt`, `nextActionDate`, `nextActionNote`, `archivedAt`, `archivedBy: { email } | null`).
  - (F4) `LeadActivityInput`, `LeadActivity = { id; type; body; stageFrom; stageTo; ownerFrom: { email } | null; ownerTo: { email } | null; actor: { email }; createdAt: Date }`.
  - (F5) `NextActionInput`. `LeadListItem` añade `nextActionDate` y `nextActionNote`. `LeadListFilters` añade `followUp?: "overdue" | "pending"`. (F6) `stage` admite `"archived"`.
- `utils/leadDisplay.ts` (sin `server-only`; constantes sin lógica, sin test):
  - (F1) `LEAD_STAGE_LABELS` y `LEAD_SOURCE_LABELS` (WhatsApp, Formulario web, Otro);
  - (F1) `LEAD_STAGE_BADGE_VARIANTS`: `secondary` para las etapas abiertas, `default` para Pagado y `outline` para Perdido;
  - (F1) `CLOSED_LEAD_STAGES = ["paid", "lost"]`;
  - (F4) `LEAD_ACTIVITY_LABELS`.
- `utils/leadListQuery.ts` (F1, puro):
  - `parseLeadListQuery(searchParams: Record<string, string | string[] | undefined>): LeadListFilters`, mediante `leadListQuerySchema`; un valor repetido (array) cuenta como inválido;
  - `leadListHref(filters: LeadListFilters, page: number): string` → `/crm/leads?…`, que omite los valores por defecto. Usa un único mapa `clave → parámetro` (`stage → etapa`, `owner → responsable`, `page → pagina`; `mine ↔ mios`); F5 añade `followUp → seguimiento` y F6, `archived ↔ archivados`.
- `lib/dates.ts` (F4, nuevo, sin `server-only`):
  ```ts
  export const CRM_TIME_ZONE = "America/Lima"; // provisional (Pregunta abierta 9)
  export function formatDateTime(date: Date): string;              // "18 oct 2026, 22:00" en CRM_TIME_ZONE
  export function getTodayDate(now: Date = new Date()): string;    // YYYY-MM-DD en CRM_TIME_ZONE (Intl "en-CA")
  export function formatCalendarDate(date: string): string;        // "25 oct 2026" (timeZone "UTC"; fecha sin hora)
  export function compareToToday(date: string, today: string): "past" | "today" | "future";
  ```
  `modules/accounts/utils/staffDisplay.ts` elimina su constante y su formateador y reexporta: `export { CRM_TIME_ZONE, formatDateTime as formatStaffDateTime } from "@/lib/dates";`.

### Service: `modules/crm/services/leads.service.ts` (`server-only`, `getDb()`)
Sigue el patrón de `staff.service.ts`. Las sentencias compuestas van en `db.execute(sql\`…\`)` con CTE, o en un `db.batch` con el id generado en la app (`crypto.randomUUID()`). Nunca son dos llamadas HTTP independientes para una misma escritura.
```ts
// F1
export async function getLeadList(filters: LeadListFilters, currentUserId: string): Promise<LeadList>;
//   db.batch: (1) leads JOIN profiles (owner) LEFT JOIN trips, owner activo (EXISTS asignación en LEAD_OWNER_ROLES),
//   WHERE archived_at IS NULL [AND stage] [AND owner_user_id = (mine → currentUserId)],
//   ORDER BY created_at DESC, id DESC LIMIT 26 OFFSET (page-1)*25;
//   (2) COUNT(*) GROUP BY stage con los mismos filtros salvo la etapa; (3) opciones de responsable.
export async function getLeadFormOptions(): Promise<{ ownerOptions: LeadOwnerOption[]; tripOptions: LeadTripOption[] }>;
//   db.batch: staff activo con rol en LEAD_OWNER_ROLES (DISTINCT user_id, ORDER BY email);
//   trips con status <> 'archived' ORDER BY race_date, title.
export async function createLead(input: CreateLeadInput, actorUserId: string):
  Promise<{ id: string } | "invalid_owner" | "invalid_trip">;
//   Atómico: INSERT lead (source del input, consent_version 'crm-manual-v1', created_by = actor)
//   solo si el owner es válido y el viaje (si hay) no está archivado; INSERT actividad 'created' con body = note.
// F3
export async function getLeadById(id: string): Promise<LeadDetail | null>;   // id no UUID → null sin consultar
export async function updateLead(input: UpdateLeadInput): Promise<"updated" | "not_found" | "invalid_trip">;
//   WHERE id AND archived_at IS NULL; viaje válido si es null, si es el mismo trip_id actual o si no está archivado.
export async function changeLeadStage(input: LeadStageChangeInput, actorUserId: string):
  Promise<"changed" | "not_found" | "no_change">;
export async function changeLeadOwner(input: LeadOwnerChangeInput, actorUserId: string):
  Promise<"changed" | "not_found" | "no_change" | "invalid_owner">;
// F5
export async function setNextAction(input: NextActionInput): Promise<"saved" | "not_found" | "closed">;
//   getLeadList además: filtro followUp (stage abierta AND next_action_date < today | <= today), orden next_action_date ASC;
//   recibe `today` como parámetro: getLeadList(filters, currentUserId, today).
// F6
export async function archiveLead(leadId: string, actorUserId: string): Promise<"archived" | "not_found">;
//   archived_at = now(), archived_by, next_action_* = NULL + actividad 'archived'; filtro stage 'archived' en getLeadList.
```
Desde F1, todas las escrituras sobre un lead llevan `archived_at IS NULL`.

`modules/crm/services/activities.service.ts` (F4, `server-only`):
```ts
export async function listLeadActivities(leadId: string): Promise<LeadActivity[]>;
//   JOIN profiles (actor) y LEFT JOIN profiles con alias (owner_from/owner_to); ORDER BY created_at DESC, id DESC.
export async function addLeadActivity(input: LeadActivityInput, actorUserId: string): Promise<"added" | "not_found">;
//   INSERT … SELECT … WHERE EXISTS (lead con id y archived_at IS NULL).
```

### Server Actions: `modules/crm/actions/leads.actions.ts` (`"use server"`)
Mismo patrón que `staff.actions.ts`. Firma compatible con `useActionState`: `(prev: LeadActionState, formData: FormData) => Promise<LeadActionState>`.
- `authorize()`: `requirePermission("leads.manage")`. `UnauthorizedError` → `unauthorized` ("Tu sesión no es válida. Vuelve a iniciar sesión."); `ForbiddenError` → `forbidden` ("No tienes permiso para gestionar leads.").
- `invalid_input`: "Revisa los campos marcados.", con `fieldErrors` (mensajes del schema) y `values` (solo los campos conocidos del formulario, como strings).
- Si el service lanza → `throw new Error("lead action failed")`, sin causa y sin `console.*`.
- (F2) `createLeadAction`:
  - `invalid_owner` → `fieldErrors.ownerUserId = ["Ese responsable ya no tiene acceso. Elige otro."]`;
  - `invalid_trip` → `fieldErrors.tripId = ["Ese viaje ya no está disponible."]`;
  - con éxito → `revalidatePath("/crm/leads")` y `redirect("/crm/leads")`, fuera de `try/catch`. Desde F3, `redirect(\`/crm/leads/${id}\`)`.
- (F3) `updateLeadAction`: éxito → revalidar la lista y la ficha, y `redirect` a la ficha.
- (F3) `changeLeadStageAction`: "Etapa actualizada.".
- (F3) `changeLeadOwnerAction`: "Responsable actualizado.".
- (F3) Mensajes comunes: `not_found` → "El lead ya no existe o está archivado. Recarga la página."; `no_change` → "No hay cambios.". Las acciones revalidan la ficha y `/crm/leads`.
- (F4) `addLeadActivityAction`: éxito → "Seguimiento registrado." y revalida la ficha.
- (F5) `setNextActionAction`: éxito → "Próxima acción guardada." o "Próxima acción quitada."; `closed` → "El lead está cerrado o archivado."
- (F6) `archiveLeadAction` (`leadIdSchema`): éxito → "Lead archivado.". Su `LeadActionState` encaja en `ConfirmActionState` de `components/shared/ConfirmActionButton`.

### Rutas (`app/crm/(protected)/leads/`)
Todas heredan el layout protegido (`NoCrmAccess` sin rol de staff, `CrmShell`, `noindex`) y siguen el patrón de `/crm/admin/usuarios`:
- `getCrmAccess("leads.manage")`;
- `unauthenticated` → `redirect("/crm/acceso")`;
- `forbidden` → `h1` más "No tienes permiso para gestionar leads. Si lo necesitas, pídeselo a un administrador.".

`params` y `searchParams` son promesas (`PageProps<"/crm/leads/[id]">`). Hay que consultar `node_modules/next/dist/docs/` antes de escribirlas.
- (F2) `leads/page.tsx`: `metadata.title = "Leads"`.
  - `parseLeadListQuery(await searchParams)` y `getLeadList(filters, access.user.id)` (en F5, con `getTodayDate()`).
  - Compone, en este orden: `h1` "Leads", el enlace "Nuevo lead" (`Link` + `buttonVariants()`), `LeadStageSummary`, `LeadFilters`, `LeadTable` y `LeadPagination`.
- (F2) `leads/nuevo/page.tsx`: `metadata.title = "Nuevo lead"`. Llama a `getLeadFormOptions()` y compone `h1` + `<LeadForm ownerOptions tripOptions defaultOwnerId={access.user.id} />`.
- (F3) `leads/[id]/page.tsx`: `metadata.title = "Ficha del lead"`.
  - `getLeadById(id)`; si devuelve `null`, `notFound()`.
  - Compone `h1` (nombre) con el `Badge` de etapa, el enlace "Editar datos" (`Link` + `buttonVariants`), `LeadDetails`, `LeadStageForm`, `LeadOwnerForm` (con las `ownerOptions` de `getLeadFormOptions()`) y "Volver a leads".
  - (F4) Añade la sección "Seguimiento": `ActivityForm` y `LeadTimeline` (`listLeadActivities`).
  - (F5) Añade `NextActionForm` con `today = getTodayDate()`, o el texto de lead cerrado.
  - (F6) Si está archivado: "Lead archivado: solo lectura.", y solo `LeadDetails` + `LeadTimeline`, sin "Editar datos" ni formularios. Si no, `ConfirmActionButton` "Archivar".
- (F3) `leads/[id]/editar/page.tsx`: `metadata.title = "Editar lead"`.
  - `getLeadById` (con `null` → `notFound()`) más `getLeadFormOptions()`.
  - Compone `<LeadForm lead={…} tripOptions />`.
  - (F6) Si está archivado, muestra el aviso en lugar del formulario.

### Componentes
| Componente | Tipo | Detalle |
|---|---|---|
| `table`, `badge`, `button` (`buttonVariants`), `input`, `label`, `native-select`, `card`, `alert-dialog` | shadcn (instalado) | Lista, etapas, formularios y bloques de la ficha |
| `textarea` | shadcn (instalar: `npx shadcn@latest add textarea`; lo instala también `trips-catalog` F2-T1, se omite si ya existe) | Nota inicial y texto del seguimiento |
| `checkbox` | shadcn (instalar: `npx shadcn@latest add checkbox`) | Consentimiento, con `name="consent"`; Base UI envía `"on"` en el `FormData` (el developer lo verifica; si no, se usa `<input type="checkbox">` nativo como en la landing) |
| `pagination` | shadcn (instalar: `npx shadcn@latest add pagination`) | `PaginationPrevious`/`PaginationNext` con `text` "Anterior"/"Siguiente" y `aria-label` en español |
| `ConfirmActionButton` | existente: `components/shared/ConfirmActionButton.tsx`, tras `trips-catalog` F2-T2 (hoy está en `modules/accounts/components/`) | "Archivar" (F6), `variant="destructive"`, con el título "¿Archivar a «{nombre}»?" y la descripción "Dejará de aparecer en la lista y no se podrá editar." |
| `CrmShell` | existente (`modules/accounts/components/CrmShell.tsx`) | (F2) Enlace "Leads" a `/crm/leads` si `can(roles, "leads.manage")`. (F5) Enlace "Mis pendientes" a `/crm/leads?responsable=mios&seguimiento=pendientes`. Mismo estilo y props sin cambios; el `<nav>` se muestra si hay algún enlace |
| `LeadStageSummary` | nuevo, `modules/crm/components/` (Server; no existe ningún resumen de embudo) | Props `{ stageCounts, filters }`. Una fila de enlaces (`Link`), uno por etapa con su etiqueta y contador, a `leadListHref({ ...filters, stage, page: 1 }, 1)`. La etapa activa se marca con `aria-current` |
| `LeadFilters` | nuevo, `modules/crm/components/` (Server, `<form method="get" action="/crm/leads">`) | Props `{ filters, ownerOptions }`. `NativeSelect` "Etapa" (Todas + 6) y "Responsable" (Todos, Mis leads y cada email), botón "Filtrar" y enlace "Limpiar". (F5) "Seguimiento": Todos, Vencidos, Pendientes (hoy o vencidos). (F6) Opción "Archivados" en Etapa |
| `LeadTable` | nuevo, `modules/crm/components/` (Server) | Props `{ leads, hasFilters }`. Columnas: Nombre, WhatsApp, Interés (título del viaje y/o destino, o "—"), Etapa (`Badge`), Responsable (email + " (sin acceso)" si `!active`) y Origen. Muestra los dos textos vacíos de los criterios de F2. (F3) El nombre enlaza a la ficha. (F5) Columna "Próxima acción" con fecha, nota truncada y `Badge` "Vencida" (`destructive`) o "Hoy" (`secondary`); recibe `today` |
| `LeadPagination` | nuevo, `modules/crm/components/` (Server) | Props `{ filters, hasNextPage }`. No se muestra si es la página 1 y no hay siguiente |
| `LeadForm` | nuevo, `modules/crm/components/` (`"use client"`, `useActionState`) | (F2) Alta: Nombre, WhatsApp o teléfono, Email, Ciudad o país, Viaje del catálogo, Destino (texto libre), Origen (WhatsApp/Otro), Responsable, Nota inicial (`Textarea`) y Consentimiento (`Checkbox`); botón "Registrar lead" o "Registrando…". (F3) Con `lead`, edición: solo los campos de contacto + `leadId` oculto; botón "Guardar cambios". Un viaje archivado ya vinculado se añade como opción "(archivado)". Errores por campo con `aria-invalid`; conserva lo escrito |
| `LeadDetails` | nuevo (F3), `modules/crm/components/` (Server, solo presentación) | Props: los campos de `LeadDetail` que muestra. Bloques `Card`: Contacto (`tel:`, `mailto:`), Interés (viaje con "(borrador)" o "(archivado)" si aplica, y destino), Registro (origen, versión del consentimiento y email de quien lo registró) y motivo de pérdida si lo hay. Sin fechas: la del alta, que es también la del consentimiento manual, aparece en el historial (F4). El enlace "Editar datos" lo pone la página |
| `LeadStageForm` | nuevo (F3), `modules/crm/components/` (`"use client"`) | `NativeSelect` con las 6 etapas (la actual seleccionada) e `Input` "Motivo de la pérdida", visible solo si la etapa elegida es Perdido; botón "Cambiar etapa" |
| `LeadOwnerForm` | nuevo (F3), `modules/crm/components/` (`"use client"`) | `NativeSelect` con las opciones de responsable; botón "Reasignar" |
| `LeadTimeline` | nuevo (F4), `modules/crm/components/` (Server) | Props `{ activities }`. Lista con etiqueta (`LEAD_ACTIVITY_LABELS`; etapas y responsables "A → B"), `body` con `whitespace-pre-line`, email del autor y `formatDateTime`. Vacío: "Sin seguimiento todavía." |
| `ActivityForm` | nuevo (F4), `modules/crm/components/` (`"use client"`) | `NativeSelect` tipo (Nota, Llamada o Mensaje) + `Textarea`; botón "Registrar". Se vacía tras el éxito |
| `NextActionForm` | nuevo (F5), `modules/crm/components/` (`"use client"`) | Props `{ leadId, nextActionDate, nextActionNote, today }`. Muestra la próxima acción actual (`formatCalendarDate`, nota e insignia "Vencida" o "Hoy" según `compareToToday`) y el formulario: `Input type="date"`, `Input` con la nota, ayuda "Deja ambos vacíos para quitarla." y botón "Guardar". La página no lo muestra en leads cerrados y pone en su lugar "Lead cerrado: no tiene próxima acción." |

### API pública: `modules/crm/index.ts`
- (F2) `getLeadList`, `getLeadFormOptions`, `parseLeadListQuery`, `LeadStageSummary`, `LeadFilters`, `LeadTable`, `LeadPagination`, `LeadForm`.
- (F3) además `getLeadById`, `LeadDetails`, `LeadStageForm`, `LeadOwnerForm`.
- (F4) además `listLeadActivities`, `LeadTimeline`, `ActivityForm`.
- (F5) además `NextActionForm`.
- (F6) además `archiveLeadAction`.

Las páginas importan solo desde `@/modules/crm`, `@/modules/accounts` (`getCrmAccess`) y `@/lib/dates`.

### Discrepancia de destinos con la landing
- `modules/landing/utils/inquiry.ts` usa `DESTINATION_IDS = ["santiago-2027", "rio", "roma"]`, pero el catálogo usa el slug `maraton-santiago-2027` (`trips-catalog.md`, Requisito 3) y no tiene viajes para Río ni Roma ("Quiero novedades").
- **En esta spec** no hay mapeo automático: el comercial elige el viaje en el selector y escribe el destino libre si no está en el catálogo (p. ej. "Río de Janeiro").
- **Propuesta para la captura automática** (spec futura, Pregunta abierta 10):
  1. la landing usa como valor del destino el slug del catálogo (`maraton-santiago-2027`) en lugar de `santiago-2027`;
  2. el servidor resuelve `slug → trips.id`, solo si el viaje está publicado, y lo guarda en `trip_id`;
  3. un destino sin viaje en el catálogo (`rio`, `roma`) se guarda en `destination_text` con su nombre visible.

  Así no hace falta una tabla de equivalencias y el `id` sigue siendo el único vínculo estable.

### Preparación para la captura automática (no se implementa)
- `source = 'web_form'` ya existe en el enum, pero el alta manual no lo ofrece.
- `consent_version`/`consented_at` admiten el consentimiento versionado del formulario web.
- `lead_activities` admite un evento `created` sin nota.
- **Pendiente para esa spec:**
  - `owner_user_id` es `NOT NULL`, así que deberá decidir si los leads web nacen sin responsable (`ALTER … DROP NOT NULL` y filtro "Sin asignar") o con un responsable por defecto;
  - las tablas de outbox, la `idempotency_key` y la API claim/ack según `platform-neon-foundation.md`.

### Relación con otras specs y trabajo en curso
- `trips-catalog` F2 modifica `CrmShell` (enlace "Viajes"), instala `textarea` y mueve `ConfirmActionButton` a `components/shared/`. Coordinación:
  - F2 de esta spec y `trips-catalog` F2 no se ejecutan en paralelo: ambas tocan `CrmShell` y `components/ui/`. La que vaya segunda parte del resultado de la otra;
  - F6 de esta spec requiere `trips-catalog` F2-T2 cerrada (`ConfirmActionButton` compartido).
- La migración `0001` (trips) debe estar aplicada antes que `0002`.
- `landing-public-site.md` no cambia.

## Reutilización
- `getDb()`/`db.batch` (`lib/db.ts`), `lib/db-schema.ts` (`profiles`, `staffAssignments`, `staffRoleEnum`, `trips`), `npm run db:generate` y el procedimiento manual del README.
- `requirePermission`, `UnauthorizedError`/`ForbiddenError` y `can()` (ampliada) de `lib/auth/`; `getCrmAccess`, `CrmShell` y `NoCrmAccess` de `@/modules/accounts`.
- Patrones de `staff.actions.ts` (guarda → zod → service → revalidate; error fijo sin causa), `staff.service.ts` (CTE en `db.execute`, `db.batch`), `InviteStaffForm` (`onSubmit` + `startTransition`), `trips.schema.ts` (`blankToNull`) y la página `/crm/admin/usuarios`.
- `ConfirmActionButton` compartido (F6), `CRM_TIME_ZONE` y el formateo de `staffDisplay` (movidos a `lib/dates.ts` en F4).
- Fake del cliente Neon HTTP de `staff.service.test.ts` para los tests de services (tercer uso, tras `accounts` y `trips`). Se recomienda subirlo a un helper de test compartido, pero queda fuera de esta spec para no tocar los otros dos módulos; se copia el patrón.
- shadcn instalados: `table`, `badge`, `button`, `input`, `label`, `native-select`, `card` y `alert-dialog`. A instalar: `textarea` (si falta), `checkbox` y `pagination`.

## Tests
- `lib/auth/permissions.test.ts` (F1, ampliar): filas de `leads.manage` (`commercial`, `admin` y ambos → true; `[]` → false); los bucles "admin tiene todo" y "sin roles nada" incluyen `leads.manage`.
- `modules/crm/schemas/leads.schema.test.ts`:
  - (F1) Los enums coinciden con `leadStageEnum`/`leadSourceEnum`/`leadActivityTypeEnum.enumValues`.
  - (F1) Alta válida: el teléfono se normaliza, el email pasa a minúsculas, los vacíos a `null` y las claves extra desaparecen.
  - (F1) Errores de alta: teléfono sin `+`, con letras, de 7 o de 16 dígitos; nombre de 1 carácter; email inválido; `tripId` no UUID; `source: "web_form"`; sin `consent`.
  - (F1) `leadListQuerySchema`: valores inválidos o arrays → valores por defecto; `pagina` "0", "abc" o "1001" → 1.
  - (F3) `leadStageChangeSchema`: `lost` sin motivo → error en `lostReason`; otra etapa con motivo → `lostReason: null`; etapa desconocida → error. `updateLeadSchema` exige un `leadId` UUID.
  - (F4) `leadActivityFormSchema` rechaza `type: "created"` y un `body` vacío o de 2001 caracteres.
  - (F5) `nextActionSchema`: ambos vacíos → `null`/`null`; nota sin fecha → error en `nextActionDate`; fecha inválida → error; nota de 201 → error. `seguimiento` inválido → sin filtro.
  - (F6) `etapa=archivados` → `stage: "archived"`.
- `modules/crm/utils/leadListQuery.test.ts` (F1): `parseLeadListQuery` con filtros vacíos, `mios` → `mine` y arrays; `leadListHref` sin filtros → `/crm/leads`, con etapa, responsable y página 2 → los tres parámetros, y la página 1 se omite.
- `modules/crm/services/leads.service.test.ts` (mocks de `server-only` y `@/lib/db` con el fake de Neon HTTP):
  - (F1) `createLead`: una sola sentencia o un único batch; parámetros con el actor como `created_by`, `crm-manual-v1` y la nota en la actividad; nunca envía `stage`; sin filas → `"invalid_owner"`/`"invalid_trip"` según los indicadores devueltos.
  - (F1) `getLeadList`: un único `transaction`; SQL con `archived_at is null`, `limit 26` y el offset de la página; `mine` → id de la sesión; `hasNextPage` con 26 filas; `stageCounts` con ceros; `owner.active`.
  - (F1) `getLeadFormOptions`: excluye viajes archivados y asignaciones revocadas.
  - (F3) `getLeadById`: id no UUID → `null` sin consulta.
  - (F3) `updateLead`: un viaje archivado se acepta si no cambia.
  - (F3) `changeLeadStage`: los tres resultados; cerrada → borra la próxima acción; `lost_reason` correcto.
  - (F3) `changeLeadOwner`: los cuatro resultados.
  - (F5) `setNextAction`: los tres resultados; `getLeadList` con `overdue` (`<`) y `pending` (`<=`) usa `today` y ordena por `next_action_date`.
  - (F6) `archiveLead`: los dos resultados y la actividad `archived`; `getLeadList` con `archived`.
- `modules/crm/services/activities.service.test.ts` (F4): `listLeadActivities` ordena desc y une `profiles` con alias; `addLeadActivity` usa el actor de la sesión, comprueba `archived_at is null` y devuelve `"not_found"` sin filas.
- `modules/crm/actions/leads.actions.test.ts` (llamada directa con `FormData`; mocks de `server-only`, `@/lib/auth/guards`, services, `next/cache` y `next/navigation`):
  - (F2) Sin sesión o sin permiso (runner: `requirePermission` lanza `ForbiddenError`) → `unauthorized`/`forbidden` sin llamar al service.
  - (F2) Datos inválidos → `invalid_input` con `fieldErrors` y `values`.
  - (F2) Alta válida → `createLead(input, actor.id)`, revalida y redirige; `invalid_owner`/`invalid_trip` → error en su campo.
  - (F2) El service lanza → `"lead action failed"`, y `console.error` no se llama (espía).
  - (F3) Cada acción con cada resultado del service y con campos extra ignorados; el autor es siempre el de la sesión.
  - (F4) `addLeadActivityAction`; (F5) `setNextActionAction` con `closed`; (F6) `archiveLeadAction`.
- `lib/dates.test.ts` (F4): los casos del criterio de F4, más un `TZ` del proceso distinto (p. ej. `Europe/Madrid`) sin cambio en el resultado; `compareToToday` con fecha pasada, de hoy y futura.
- `modules/accounts/utils/staffDisplay.test.ts`: sin cambios; debe seguir pasando.
- Sin unit test (SETUP §3): tipos, `lib/db-schema.ts` (lo cubren la migración y la prueba manual), `leadDisplay.ts` (constantes), componentes del módulo (su lógica está en schemas, utils y acciones), `CrmShell`, páginas async de `app/` y componentes de `components/ui/`.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run`, `npm run build` (lo ejecuta el reviewer) y la medición del Worker de su última tarea.

### Fase 1: datos, permiso y service (4 tareas, 15 archivos: 2 generados por drizzle-kit)
- [ ] T1 — Base compartida:
  - enums y tablas `leads`/`lead_activities` en el schema;
  - `npm run db:generate` y revisión del SQL (solo objetos nuevos en `public`; sin `neon_auth`, `DROP` ni cambios en otras tablas);
  - permiso `leads.manage` y sus tests.

  Archivos: `lib/db-schema.ts`, `drizzle/0002_*.sql` (generado), `drizzle/meta/0002_snapshot.json` (generado), `drizzle/meta/_journal.json`, `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: — · secuencial (base, `lib/`)
- [ ] T2 — Schemas, tipos, etiquetas y utilidades de la query de la lista, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadDisplay.ts`, `modules/crm/utils/leadListQuery.ts`, `modules/crm/utils/leadListQuery.test.ts` · depende de: T1 · paralelo (con T4)
- [ ] T3 — Service: `getLeadList`, `getLeadFormOptions` y `createLead`, con tests; medir el Worker · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T2 · secuencial
- [ ] T4 — README, sección "Migración de la tabla de leads":
  - revisar `0002` con `grep -inE 'neon_auth|drop|create schema'`;
  - aplicar primero `0001` si está pendiente y después `0002`, entre `BEGIN;`/`COMMIT;`, sin reaplicar `0000` y sin GRANT;
  - incluir las pruebas manuales del criterio de F1, en una rama de desarrollo.

  Archivos: `README.md` · depende de: T1 · paralelo (con T2)

### Fase 2: alta manual y lista (4 tareas, 15 archivos: hasta 3 generados por el CLI de shadcn)
Requisitos previos: Fase 1 cerrada, migraciones `0001` y `0002` aplicadas, y `trips-catalog` F2 sin ejecutarse en paralelo (comparten `CrmShell` y `components/ui/`).
- [ ] T1 — Base compartida:
  - `npx shadcn@latest add textarea checkbox pagination`, sin sobrescribir archivos existentes (`textarea` se omite si ya está);
  - enlace "Leads" en `CrmShell`.

  Archivos: `components/ui/textarea.tsx`, `components/ui/checkbox.tsx`, `components/ui/pagination.tsx`, `modules/accounts/components/CrmShell.tsx` · depende de: Fase 1 · secuencial (base)
- [ ] T2 — `LeadActionState` y `createLeadAction`, con tests de llamada directa · archivos: `modules/crm/types/leads.types.ts`, `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T1 · paralelo (con T3)
- [ ] T3 — Componentes de la lista · archivos: `modules/crm/components/LeadStageSummary.tsx`, `modules/crm/components/LeadFilters.tsx`, `modules/crm/components/LeadTable.tsx`, `modules/crm/components/LeadPagination.tsx` · depende de: T1 · paralelo (con T2)
- [ ] T4 — `LeadForm`, API pública y páginas; medir el Worker · archivos: `modules/crm/components/LeadForm.tsx`, `modules/crm/index.ts`, `app/crm/(protected)/leads/page.tsx`, `app/crm/(protected)/leads/nuevo/page.tsx` · depende de: T2, T3 · secuencial

### Fase 3: ficha, edición, etapa y responsable (5 tareas, 15 archivos)
- [ ] T1 — Schemas y tipos de edición, etapa y responsable, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts` · depende de: Fase 2 · secuencial
- [ ] T2 — Service: `getLeadById`, `updateLead`, `changeLeadStage` y `changeLeadOwner`, con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Acciones de edición, etapa y responsable, y alta que redirige a la ficha, con tests · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — Componentes de la ficha y modo edición de `LeadForm` · archivos: `modules/crm/components/LeadDetails.tsx`, `modules/crm/components/LeadStageForm.tsx`, `modules/crm/components/LeadOwnerForm.tsx`, `modules/crm/components/LeadForm.tsx` · depende de: T3 · secuencial
- [ ] T5 — Enlace a la ficha en `LeadTable`, API pública y páginas; medir el Worker · archivos: `modules/crm/components/LeadTable.tsx`, `modules/crm/index.ts`, `app/crm/(protected)/leads/[id]/page.tsx`, `app/crm/(protected)/leads/[id]/editar/page.tsx` · depende de: T4 · secuencial

### Fase 4: historial y actividades (5 tareas, 15 archivos)
- [ ] T1 — `lib/dates.ts` con tests y reexportación desde `staffDisplay` (sin tocar `StaffTable` ni `InvitationsTable`) · archivos: `lib/dates.ts`, `lib/dates.test.ts`, `modules/accounts/utils/staffDisplay.ts` · depende de: Fase 3 · secuencial (base, `lib/`)
- [ ] T2 — Schema, tipos y etiquetas de actividades, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadDisplay.ts` · depende de: T1 (la base compartida va primero) · secuencial
- [ ] T3 — Service de actividades con tests · archivos: `modules/crm/services/activities.service.ts`, `modules/crm/services/activities.service.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `addLeadActivityAction` con tests · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T3 · secuencial
- [ ] T5 — UI del seguimiento (`ActivityForm`, `LeadTimeline`), integración en la ficha y exports; medir el Worker · archivos: `modules/crm/components/ActivityForm.tsx`, `modules/crm/components/LeadTimeline.tsx`, `modules/crm/index.ts`, `app/crm/(protected)/leads/[id]/page.tsx` · depende de: T4 · secuencial

### Fase 5: próxima acción y pendientes (5 tareas, 16 archivos)
- [ ] T1 — `nextActionSchema`, filtro `seguimiento` (schema, tipos y mapa `followUp → seguimiento` de la query), con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadListQuery.ts`, `modules/crm/utils/leadListQuery.test.ts` · depende de: Fase 4 · secuencial
- [ ] T2 — Service: `setNextAction`, y filtro y orden de seguimiento en `getLeadList` (con `today`), con tests · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — `setNextActionAction` con tests · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — UI: `NextActionForm`, columna "Próxima acción" en `LeadTable` y filtro "Seguimiento" en `LeadFilters` · archivos: `modules/crm/components/NextActionForm.tsx`, `modules/crm/components/LeadTable.tsx`, `modules/crm/components/LeadFilters.tsx` · depende de: T3 · secuencial
- [ ] T5 — Enlace "Mis pendientes", API pública y páginas con `today`; medir el Worker · archivos: `modules/accounts/components/CrmShell.tsx`, `modules/crm/index.ts`, `app/crm/(protected)/leads/page.tsx`, `app/crm/(protected)/leads/[id]/page.tsx` · depende de: T4 · secuencial

### Fase 6: archivo (4 tareas, 13 archivos)
Requisito previo: `trips-catalog` F2-T2 cerrada (`components/shared/ConfirmActionButton.tsx`).
- [ ] T1 — Filtro `archivados` (schema, tipo y query de la lista) y `archiveLead`, con tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadListQuery.ts`, `modules/crm/utils/leadListQuery.test.ts`, `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de: Fase 5 · secuencial
- [ ] T2 — `archiveLeadAction` con tests · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Opción "Archivados" en `LeadFilters` · archivos: `modules/crm/components/LeadFilters.tsx` · depende de: T2 · paralelo (con T4)
- [ ] T4 — Ficha y edición en solo lectura si está archivado, botón "Archivar" y API pública; medir el Worker al terminar T3 y T4 · archivos: `modules/crm/index.ts`, `app/crm/(protected)/leads/[id]/page.tsx`, `app/crm/(protected)/leads/[id]/editar/page.tsx` · depende de: T2 · paralelo (con T3)

## Preguntas abiertas
Todas resueltas por el usuario ("ok a todo", 2026-10-18), con la recomendación de cada una:
1. **Reasignar y editar:** cualquiera con `leads.manage` (`commercial` y `admin`) edita y reasigna; queda en el historial.
2. **Visibilidad:** los comerciales ven todos los leads; "Mis leads" es un filtro.
3. **Motivo de pérdida:** texto libre en el MVP.
4. **Transiciones:** se puede reabrir un lead "Pagado" o "Perdido"; etapas libres y registradas.
5. **Consentimiento:** texto provisional "El contacto aceptó que guardemos sus datos para atender su consulta.", versión `crm-manual-v1`. El texto legal definitivo y la política de privacidad (Ley 29733) quedan pendientes de revisión del usuario; cambiarlos solo requiere una nueva versión.
6. **Archivo (F6):** sí, sin borrado físico y sin restaurar en el MVP. Borrado o anonimización por derechos ARCO, fuera de alcance.
7. **Teléfono:** obligatorio con código de país (E.164), sin asumir `+51`.
8. **Duplicados:** no se detectan en el MVP.
9. **Zona horaria:** `America/Lima`.
10. **Destinos de la landing:** la futura captura usará el slug del catálogo (`maraton-santiago-2027`); `destination_text` para destinos sin viaje en el catálogo (Río de Janeiro, Roma). Hay que avisar a la rama de la landing, que hoy usa `santiago-2027`.
11. **Orden con `trips-catalog` F2:** se cierra primero `trips-catalog` F2 y después la F2 de esta spec.
12. **Tamaño de página:** 25 leads por página.
