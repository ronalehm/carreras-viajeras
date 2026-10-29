# Ofertas comerciales versionadas por carrera, tipo de cambio y bloque financiero público

- Módulo: trips (también `landing`; la matriz de permisos en `lib/auth/`)
- Estado: aprobado
- Plan maestro (aprobado por el usuario): QR o enlace → `/viajes/[slug]/registro` → **oferta** → identidad → contrato → pago con Mercado Pago Checkout Pro. **Esta spec es la segunda de la Fase 1 y solo cubre las ofertas comerciales versionadas por carrera**, el tipo de cambio que fija el equipo y el bloque financiero público.
- Base revisada: rama `claude/trips-commercial-offers`, apilada sobre el PR #29 (`384ee0a`), que contiene el #26, el rediseño del #27 y `landing-omnichannel-capture` implementada. Migraciones hasta `drizzle/0007_awesome_dust.sql`. En Neon `production` faltan `0005`, `0006` y `0007`. Worker: 1602.73 KiB gzip.
- Depende de:
  - `platform-neon-foundation.md` (aprobada): Workers Free con OpenNext, Neon con Drizzle `neon-http` (cada escritura es una sentencia o un `db.batch`, sin transacciones interactivas) y migraciones generadas en local y aplicadas a mano.
  - `trips-catalog.md` y `landing-race-pages.md` (aprobadas e implementadas): `trips`, `PublicTrip`, `getPublishedTripBySlug`, `formatTripPrice`, `formatTripDate`, `formatTripDateRange`, `TripForm`, `TripTable`, `getCatalogTrip`, `TripLanding` y `TripDetail`.
  - `landing-omnichannel-capture.md` (aprobada e implementada): `campaigns` (código, viaje, estado), `/viajes/[slug]/registro`, `RaceRegistrationSection`, `attributionParams` y `firstParam`.
  - `accounts-roles-permissions.md` (aprobada): `can()`, `requirePermission`, `getCrmAccess(permission)` y `CrmShell`.
  - `landing-home-redesign.md` (aprobada): tokens y componentes del PR #27.

## Objetivo
El negocio quiere pasar de captar interesados a cobrar reservas. Hoy el precio de cada carrera son cinco campos sueltos de `trips` (`price_usd`, `deposit_usd`, `installments_price_usd`, `companion_price_usd`, `payment_terms`). Cualquiera con `trips.manage` los edita sin aprobación ni historial, y `/viajes/[slug]` los publica tal cual, incluido «Reserva con US$ …». Los materiales comerciales actuales tienen importes contradictorios. Además, nada permite saber qué condiciones vio o aceptó un corredor, ni cuánto pagaría en soles.

Esta spec hace que:
- el precio de una carrera sea una **oferta versionada**: un borrador que el admin carga y aprueba, y que después activa y cierra. Una versión aprobada no cambia nunca: editarla crea otra versión.
- haya como máximo **una oferta activa por carrera** (la general) y **una por campaña**, con una regla de resolución única que decide el servidor;
- el equipo fije un **tipo de cambio USD→PEN** con historial, y la web muestre el importe exacto en soles con su regla;
- `/viajes/[slug]` y `/viajes/[slug]/registro` muestren un **bloque financiero** solo cuando hay una oferta activa y vigente, y no muestren nada que parezca vendible cuando no la hay;
- las specs siguientes (`bookings-runner-self-service`, `bookings-contract-acceptance` y `bookings-mercadopago`) tengan un contrato de lectura (`getActiveOffer`) y un cálculo USD→PEN exacto sobre los que construir.

Usuarios: el admin (carga, aprueba, activa y cierra ofertas, y fija el tipo de cambio), el equipo comercial (consulta ofertas e historial para responder a los corredores) y los corredores (anónimos, ven el precio en la web).

## Alcance
- Incluye:
  - (F1) Migración nueva (`0008` provisional): enum `trip_offer_status`, tablas `trip_offers` y `exchange_rates` con sus CHECK, índices únicos parciales y claves foráneas, y la restricción única `campaigns_id_trip_uq` (aditiva). Permisos `offers.manage` (solo admin) y `offers.view` (`commercial`). Cálculo puro USD→PEN en `lib/currency.ts`. Schemas, tipos y services de ofertas y tipo de cambio, con `getActiveOffer` y `getPublicOffer`. README de la migración.
  - (F2) CRM: `/crm/ofertas` (lista de versiones, tipo de cambio vigente e historial), `/crm/ofertas/nueva` y `/crm/ofertas/[id]` (ficha, edición del borrador, aprobar, activar, cerrar o descartar, crear una versión nueva e historial de la oferta). Enlace "Ofertas" en `CrmShell`. Solo lectura para `commercial`.
  - (F3) Bloque financiero público en `/viajes/[slug]` y en `/viajes/[slug]/registro` (no en el modo stand). Si no hay oferta, `/viajes/[slug]` muestra un aviso sin importes. Los campos de precio antiguos de `trips` dejan de mostrarse en la web.
  - (F4) Limpieza del catálogo: los cinco campos de precio salen del formulario y de la lista del CRM de viajes, de `PublicTrip` y de las escrituras de `trips`. Las columnas siguen en la base, sin `DROP`.
  - Medición del Worker al cerrar F2, F3 y F4 (umbral de consulta: 2 MiB gzip).
- No incluye:
  - Crear la reserva, elegir el anticipo, reservar cupos durante el checkout, datos e identidad del corredor → `bookings-runner-self-service`.
  - Versiones del contrato, su texto y su aceptación; enlazar `terms_version` con una tabla de contratos → `bookings-contract-acceptance`.
  - Checkout de Mercado Pago, intentos de cobro (con el tipo de cambio guardado en cada uno), webhook y reembolsos → `bookings-mercadopago`.
  - Portada (`/`), `/carreras`, noticias y páginas legales, incluidos los importes fijos de la portada (`TRIPS`: «US$1,499», «US$1,799», «Reserva con US$300») → `public-official-site-content` (ver "Conflictos" y la Pregunta abierta 6).
  - Cargar precios, anticipos, bonos o cupos: los carga el admin desde el CRM. Esta spec no inventa importes ni migra los valores antiguos a ofertas.
  - Calendario de cuotas (un solo vencimiento del saldo), precio de acompañante y precio total en cuotas como parte de la oferta (Pregunta abierta 5).
  - Mostrar cupos restantes en la web (no se pueden contar hasta que existan reservas con `offer_version_id`; ver Decisión 9).
  - Acumular beneficios u ofertas: nunca se suman dos ofertas.
  - Programar activaciones futuras, cerrar ofertas vencidas automáticamente (sin cron), borrar ofertas o tipos de cambio, editar o anular un tipo de cambio.
  - Guardar en el lead la oferta vista o el anticipo elegido (Decisión 12; Pregunta abierta 4).
  - Cambios en `createWebLead`, `submitWebLeadAction`, el formulario de registro, la portada, `/contacto`, las reservas manuales del CRM (`bookings.total_usd` lo sigue escribiendo el equipo) o la API de n8n.
  - `DROP COLUMN` de los campos antiguos de `trips`, triggers, despliegues, migraciones remotas, DNS o Secrets.

## Requisitos
1. **Oferta versionada (F1).** Cada fila de `trip_offers` es una **versión**. El **ámbito** de la versión es el viaje más la campaña opcional (sin campaña = oferta general). La versión es un número correlativo dentro de su ámbito (v1, v2…). Una versión tiene:
   - nombre interno, solo visible en el CRM;
   - precio total y descuento, en USD enteros; el precio final es el total menos el descuento y lo calcula la base;
   - de 0 a 3 anticipos permitidos, en USD enteros, cada uno mayor que 0 y menor que el precio final;
   - fecha límite del saldo: obligatoria si hay anticipos y vacía si no los hay;
   - bono opcional, que es un texto sin importes;
   - vigencia `valid_from` y `valid_until` (opcional), en fechas de calendario inclusivas evaluadas en la zona de `CRM_TIME_ZONE` (`America/Lima`);
   - cupos de la oferta (opcional);
   - versión de las condiciones (`terms_version`, un identificador) y su texto de condiciones de pago y cancelación;
   - estado y auditoría.
2. **Estados (F1, F2).** Flujo `draft → approved → active → closed`. Quién hace cada transición y cuándo queda registrado:
   - **Aprobar** (`draft → approved`): fija `approved_by` y `approved_at`. Exige que `valid_until` no haya pasado. Desde ese momento la versión es **inmutable**.
   - **Activar** (`approved → active`): fija `activated_by` y `activated_at`. Exige que la vigencia haya empezado (`valid_from ≤ hoy`) y no haya terminado, que el viaje no esté archivado y, si es de campaña, que la campaña esté activa. Si en el mismo ámbito hay otra versión `active`, se cierra en la misma operación con `superseded_by` = la nueva.
   - **Cerrar o descartar** (`draft | approved | active → closed`): fija `closed_by` y `closed_at`. `closed` es final.
   - Una versión `active` cuya vigencia terminó sigue `active` en la base, pero ya no se aplica (Requisito 4). El CRM la marca como "Vencida" y el admin la cierra.
   - **La base impide** que una versión esté `approved` o `active` sin `approved_at`/`approved_by`, o `active` sin `activated_at`/`activated_by` (CHECK). En ningún entorno puede quedar activa una oferta sin aprobar.
3. **Inmutabilidad y versión nueva (F1, F2).** Solo una versión `draft` se edita. "Crear nueva versión" desde una versión `approved`, `active` o `closed` copia sus condiciones en un borrador nuevo del mismo ámbito, con versión = máximo + 1. La versión original no cambia y conserva su estado hasta que se active la nueva. En cada ámbito hay como máximo **una versión pendiente** (`draft` o `approved`); si ya existe, no se crea otra: «Ya hay una versión pendiente (vN) de esta oferta. Ábrela o descártala.».
4. **Oferta aplicable (F1).** Una versión **está vigente** si cumple todo esto:
   - `status = 'active'`;
   - `valid_from ≤ hoy ≤ valid_until` (o sin `valid_until`), con hoy calculado en `America/Lima`;
   - el viaje está `published`;
   - si es de campaña, la campaña está `active` y es del mismo viaje.

   Resolución para un viaje y una campaña opcional: si se indica una campaña y su oferta está vigente, se aplica esa; si no, la general vigente; si tampoco hay, **ninguna**. Nunca se suman dos ofertas ni se combinan sus descuentos o bonos.
5. **El servidor decide el precio (F1, F3).** La única entrada del navegador que influye en la oferta mostrada es `?c=`, el código de una campaña. Con él solo se puede **seleccionar** una oferta de campaña aprobada, activa y vigente de la misma carrera. Cualquier otro parámetro se ignora: `price`, `discount`, `deposit`, `offer`, `offerId`, un `c` de una campaña cerrada, inexistente o de otra carrera, o `modo`. Ningún importe sale de la URL, de un campo oculto ni del cliente.
6. **Tipo de cambio (F1, F2).** El admin fija el tipo de cambio USD→PEN (`numeric(10,4)`, mayor que 0 y menor que 100). Cada alta es una fila nueva, que rige desde que se guarda. El **vigente** es la fila más reciente. Las filas no se editan ni se borran, y quedan como historial con quién lo fijó y cuándo. Sin ningún tipo de cambio, la web muestra solo los importes en USD y el texto «El importe en soles se mostrará antes de pagar.».
7. **Cálculo USD→PEN (F1).** `céntimos_PEN = redondeo_half_up(USD × tipo × 100)`, con aritmética entera exacta: el tipo se maneja en diezmilésimas, sin coma flotante. Cada importe (precio final, anticipo, saldo) se convierte por separado. Por eso la suma de dos importes convertidos puede diferir en 1 céntimo de la conversión de su suma; esto queda documentado y probado.
8. **Bloque financiero público (F3).** En `/viajes/[slug]` y en `/viajes/[slug]/registro` (salvo con `?modo=stand`), con una oferta aplicable:
   - precio total; descuento (solo si es mayor que 0) y precio final, cada uno con su importe en soles;
   - anticipos permitidos, cada uno con su saldo y la fecha límite del saldo, en USD y soles, y el texto «El anticipo se descuenta del precio final.». Sin anticipos: «Pago único del precio final.»;
   - bono, si existe: «Beneficio incluido: <texto>. No es un descuento ni se canjea por dinero.»;
   - vigencia: «Precio válido: <rango> (hora de Lima).» o «Precio vigente desde el <fecha>.»;
   - condiciones de pago y cancelación (un párrafo por línea) y «Versión de las condiciones: <terms_version>»;
   - la regla del tipo de cambio con el tipo vigente y su fecha (Diseño técnico, "Textos");
   - **sin** botón de pago ni de reserva, **sin** cupos y sin el nombre interno ni la campaña.

   **Sin oferta aplicable:** `/viajes/[slug]` muestra en la sección de precio solo «Todavía no publicamos el precio de este viaje.», y el registro no muestra ningún bloque. En ninguna de las dos páginas aparecen importes, «Desde», «Reserva con», anticipos ni bonos. Los campos de precio de `trips` no se muestran en ningún caso (Requisito 10).
9. **CRM (F2).** Las páginas comprueban `offers.view` (`/crm/ofertas` y `/crm/ofertas/[id]`) u `offers.manage` (`/crm/ofertas/nueva`). Las acciones comprueban `offers.manage`. Formularios y botones solo se pintan con `offers.manage`. Un `commercial` ve la lista, las fichas, el historial y el tipo de cambio en solo lectura. Las páginas usan el mismo texto sin permiso que las demás. Cada acción usa el `user.id` de la sesión como actor y decide con el `WHERE` de su sentencia.
10. **Una sola fuente de verdad del precio (F3, F4).** El precio, los anticipos y las condiciones de pago viven solo en las ofertas. `trips` queda como catálogo descriptivo (Diseño técnico, "Relación con `trips`"). F3 deja de mostrar en la web `price_usd`, `deposit_usd`, `installments_price_usd`, `companion_price_usd` y `payment_terms`. F4 los quita del CRM y del contrato público. Las columnas quedan en la base, sin escribirse.
11. **Privacidad y errores.** Los mensajes de la base no llegan a la UI, a las respuestas ni a los logs. Las acciones fallan con el error fijo `"offer action failed"` o `"exchange rate action failed"`, sin causa ni `console.*`. Las lecturas públicas no exponen ids, nombre interno, campaña, cupos ni auditoría.

## Criterios de aceptación

Fase 1 (datos, permisos y contrato de servidor):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera **una** migración nueva, más su snapshot y el journal:
  - nombre: `drizzle/0008_*.sql`, número **provisional**; el definitivo se fija solo en el turno de merge, renumerando si `main` ya tiene otra `0008`;
  - contenido: `CREATE TYPE "trip_offer_status"`, las tablas `trip_offers` y `exchange_rates` con sus CHECK, FK e índices (Diseño técnico) y `ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_id_trip_uq" UNIQUE ("id", "trip_id")`;
  - no contiene `ADD VALUE`, `neon_auth`, `CREATE SCHEMA` ni ningún `DROP`, ni cambios en `trips`, `leads`, `bookings`, `profiles`, `staff_*` u `outbox_events`.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon con `0005`–`0007` aplicadas) Dada la migración aplicada en **un solo bloque** entre `BEGIN;` y `COMMIT;`, entonces la base acepta una oferta general válida y una de campaña del mismo viaje, y rechaza:
  - una versión `active` o `approved` sin `approved_at`, y una `active` sin `activated_at`;
  - un descuento ≥ total; un total de 0; un anticipo de 0, ≥ precio final o nulo; 4 anticipos; anticipos sin fecha de saldo y fecha de saldo sin anticipos;
  - `valid_until < valid_from`; un `terms_version` con mayúsculas;
  - una oferta con una campaña de otro viaje (FK compuesta);
  - dos versiones `active` generales del mismo viaje; dos `active` de la misma campaña; dos pendientes en el mismo ámbito; dos v1 en el mismo ámbito;
  - `superseded_by` en una versión no cerrada;
  - un tipo de cambio de `0` o de `100`.
- [ ] (F1) Dado `can()`, entonces `offers.manage` es solo de `admin` (`commercial` no), `offers.view` es de `commercial` y de `admin`, `[]` no tiene ninguno y los permisos existentes no cambian (unit test).
- [ ] (F1) Dado `lib/currency.ts`, entonces (unit test):
  - `parseUsdPenRate`: `"3.75"` → `37500`, `"3.7512"` → `37512` y `"10"` → `100000`; `"3.75001"`, `"0"`, `"0.0000"`, `"100"`, `"-1"`, `"abc"` y `""` → `null`;
  - `usdToPenCents`: `(1799, 37512)` → `674841`; `(1, 37550)` → `376` (borde half-up); `(1, 37549)` → `375`; `(3, 33333)` → `1000`; `(0, 37500)` → `0`; con USD negativo, decimal o > 1 000 000, o con tipo no entero o ≤ 0, lanza `RangeError`;
  - `formatPenCents`: `674841` → `"S/ 6,748.41"`, `5` → `"S/ 0.05"`, `0` → `"S/ 0.00"`, `100000000` → `"S/ 1,000,000.00"`;
  - `formatUsdPenRate(37500)` → `"3.7500"`;
  - `usdToPenCents(100, r) + usdToPenCents(1699, r)` puede diferir en 1 de `usdToPenCents(1799, r)` y nunca en más.
- [ ] (F1) Dado `offerFormSchema` con los strings de un `FormData`, entonces (unit test):
  - `depositOptionsUsd: "200, 100, ,100"` → `[100, 200]`; `discountUsd: ""` → `0`; vacíos opcionales → `null`; `termsVersion: " Santiago-2027-V1 "` → `"santiago-2027-v1"`;
  - rechaza, con el error en su campo: total 0, decimal o > 1 000 000; descuento ≥ total; 4 anticipos; un anticipo ≥ precio final; anticipos sin `balanceDueOn` y `balanceDueOn` sin anticipos; `validUntil < validFrom`; cupos 0; condiciones de 9 caracteres; un bono con importes («US$ 50 de descuento», «S/ 100», «50 dólares»);
  - descarta `status`, `version`, `finalPriceUsd`, `approvedBy`, `tripId` (en la edición) y `price`;
  - `exchangeRateFormSchema` normaliza `"3.75"` → `"3.7500"` y rechaza `"3,75"`, `"0"` y `"3.12345"`;
  - `offerStatusSchema.options` coincide con `tripOfferStatusEnum.enumValues`.
- [ ] (F1) Dado `offers.service.ts` con la base simulada, entonces (unit test):
  - `createOfferDraft` es una sola sentencia que inserta con versión = máximo del ámbito + 1, `created_by` del actor y sin estado ni auditoría del input. Devuelve `{ id }`, `"invalid_trip"` (viaje archivado o inexistente), `"invalid_campaign"` (campaña cerrada, inexistente o de otro viaje) o `"pending_exists"`;
  - `createOfferVersionFrom` copia solo las condiciones de una versión no `draft` y devuelve `{ id }`, `"not_found"` o `"pending_exists"`;
  - `updateOfferDraft` solo actualiza con `status = 'draft'` (fija `updated_at`) y devuelve `"updated"`, `"not_found"` o `"not_draft"`;
  - `approveOffer` solo pasa de `draft` (fija `approved_by` y `approved_at`) y devuelve `"approved"`, `"invalid_transition"` o `"expired"`;
  - `activateOffer` es **un** `db.batch`: cierra la activa del ámbito con `superseded_by`, activa y explica. Devuelve `"activated"`, `"invalid_transition"`, `"not_started"`, `"expired"`, `"trip_archived"` o `"campaign_closed"`, y no cierra nada si la activación no procede;
  - `closeOffer` pasa a `closed` desde `draft`, `approved` o `active` y devuelve `"closed"` o `"invalid_transition"`;
  - `getActiveOffer` y `getPublicOffer` hacen una sola consulta con las condiciones del Requisito 4 (incluida la fecha de hoy en `America/Lima`) y dan prioridad a la de campaña. `getPublicOffer` valida el slug canónico y el código (si no es válido, se trata como sin campaña) y devuelve también el tipo de cambio vigente (o `null`). Ninguna devuelve una oferta `draft`, `approved`, `closed`, vencida, futura o de un viaje no publicado;
  - `listOffers` y `getOfferById` (con el historial del ámbito) devuelven `null` o una lista vacía sin consultar si el id no es UUID.
- [ ] (F1) Dado `exchangeRates.service.ts` con la base simulada, entonces `getCurrentExchangeRate` lee la fila más reciente (`created_at DESC, id DESC`), `listExchangeRates` devuelve las 20 últimas con el correo de quien las fijó y `setExchangeRate` inserta con el actor y nunca actualiza (unit test).
- [ ] (F1) Dado el README, entonces la sección "Migración de ofertas comerciales (`0008`)" explica:
  - el número provisional;
  - revisar el SQL (`grep -inE 'neon_auth|create schema|drop |add value'` sin resultados);
  - aplicarla **después de `0007`** (en `production`, después de `0005`, `0006` y `0007`, que siguen pendientes), en un solo bloque, sin GRANT;
  - las pruebas manuales del criterio anterior;
  - que debe estar aplicada **antes** de desplegar el código de F2.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. F1 no añade rutas.

Fase 2 (CRM de ofertas y tipo de cambio):
- [ ] (F2) Dado un admin en `/crm/ofertas/nueva`, cuando creo la oferta general de Santiago con los valores que decida el negocio, entonces voy a `/crm/ofertas/<id>` y veo "Borrador · v1", el precio final calculado, el importe en soles con el tipo vigente, "Creada por <correo> el <fecha>" y el formulario de edición. El menú del CRM muestra "Ofertas".
- [ ] (F2) Dado ese borrador, cuando pulso «Aprobar» y confirmo, entonces queda "Aprobada" con quién y cuándo, y el formulario desaparece. Cuando pulso «Activar» y confirmo, queda "Activa" con quién y cuándo, y `getPublicOffer("maraton-santiago-2027", null)` la devuelve.
- [ ] (F2) Dada la versión v1 activa, cuando pulso «Crear nueva versión», cambio el descuento, apruebo y activo la v2, entonces la v1 queda "Cerrada · sustituida por v2" con **sus valores originales intactos**, la v2 es la activa y el historial de la ficha muestra v2 y v1 con estado, precio final, vigencia y auditoría.
- [ ] (F2) Dada una versión aprobada o activa, entonces su ficha no tiene formulario de edición. `updateOfferAction` llamada directamente con su id devuelve `not_draft` («Esta versión ya está aprobada y no se puede editar. Crea una versión nueva.») y la fila no cambia (unit test).
- [ ] (F2) Dado un borrador pendiente en un ámbito, cuando intento crear otra versión u otra oferta en ese ámbito, entonces veo «Ya hay una versión pendiente (vN) de esta oferta. Ábrela o descártala.».
- [ ] (F2) Dada una versión aprobada con `valid_from` futuro, cuando pulso «Activar», entonces veo «La vigencia aún no ha empezado. Actívala a partir del <fecha>.». Con `valid_until` pasado, «La vigencia ya terminó. Crea una versión nueva.». Con la campaña cerrada, «La campaña está cerrada.».
- [ ] (F2) Dada una activa con `valid_until` pasado, entonces la lista y la ficha la marcan "Activa · vencida" y la web no la muestra.
- [ ] (F2) Dado un `commercial` verificado, entonces ve `/crm/ofertas` y `/crm/ofertas/<id>` sin formularios ni botones, y `/crm/ofertas/nueva` muestra «No tienes permiso para gestionar ofertas. Si lo necesitas, pídeselo a un administrador.». Las acciones llamadas directamente con su sesión devuelven `forbidden` sin llamar al service; sin sesión, `unauthorized`. Una cuenta sin rol de staff ve `NoCrmAccess` (unit test de acciones).
- [ ] (F2) Dado un admin en `/crm/ofertas`, cuando fijo el tipo de cambio `3.7512`, entonces la tarjeta "Tipo de cambio vigente" muestra «S/ 3.7512 por US$ 1», con quién y cuándo, y el historial lo lista primero. Con `3,75` veo «Indica el tipo con punto decimal y hasta 4 decimales (p. ej. 3.7500).». Un `commercial` ve el vigente y el historial sin formulario.
- [ ] (F2) Dadas las acciones llamadas directamente (unit test):
  - con datos inválidos → `invalid_input`, con `fieldErrors` y lo escrito;
  - ignoran campos extra (`status`, `approvedBy`, `version`) y usan el id de la sesión;
  - cada resultado del service se traduce en su código y mensaje;
  - si el service lanza → `"offer action failed"` o `"exchange rate action failed"`, sin causa.
- [ ] (F2) Dado `offerDisplay.ts`, entonces (unit test):
  - `OFFER_STATUS_LABELS` = Borrador, Aprobada, Activa, Cerrada;
  - `offerTiming` → `"scheduled"`, `"in_force"` o `"expired"` en los bordes (hoy = `valid_from`, hoy = `valid_until`, sin `valid_until`);
  - `offerValidityText` → «Precio válido: 1–30 de noviembre de 2026 (hora de Lima).» y «Precio vigente desde el 1 de noviembre de 2026.»;
  - `offerScopeLabel` → «General» o «Campaña <nombre> (<código>)».
- [ ] (F2) Lint, tests y build sin errores. Worker medido frente a 1602.73 KiB y al umbral de 2 MiB.

Fase 3 (bloque financiero público). Requisito previo: F2 cerrada y la migración aplicada en la rama de Neon de pruebas:
- [ ] (F3) Dado Santiago publicado con una oferta general activa y vigente (total 2000, descuento 200, anticipos 100 y 200, saldo hasta el 15 de marzo de 2027, bono «Polo oficial», condiciones y `terms_version` cargados por el admin; valores de prueba) y el tipo `3.7500`, cuando abro `/viajes/maraton-santiago-2027`, entonces veo:
  - precio total «US$ 2,000 (S/ 7,500.00)», descuento «US$ 200 (S/ 750.00)» y precio final «US$ 1,800 (S/ 6,750.00)»;
  - los dos anticipos con su saldo («US$ 1,700» y «US$ 1,600», con sus soles) y la fecha límite;
  - el beneficio con «No es un descuento…», la vigencia, las condiciones con su versión y la regla del tipo de cambio;
  - además, «Qué incluye» y «No incluye» del catálogo.
- [ ] (F3) Dado el mismo viaje en `/viajes/maraton-santiago-2027/registro`, entonces el bloque aparece entre el encabezado y el formulario con los mismos importes. Con `?modo=stand` no aparece.
- [ ] (F3) Dado un tipo de cambio `3.7512` y un precio final de 1799, entonces el bloque muestra exactamente «S/ 6,748.41» (unit test de `toOfferView`).
- [ ] (F3) Dada una oferta de campaña activa y vigente para `mml26` de Santiago (precio final 1700), cuando abro el registro con `?c=mml26`, entonces veo el precio de la campaña y no el general. «Ver el paquete completo» lleva a `/viajes/maraton-santiago-2027?c=mml26` y muestra la misma oferta. En estos casos veo la oferta general: la campaña cerrada; la oferta de campaña con `valid_until` = ayer, en `approved` o cerrada; o `?c=` con un código de otra carrera o inexistente.
- [ ] (F3) Dado `?price=1&discount=1799&deposit=1&offer=<uuid de otra oferta>&offerId=<uuid>&modo=x` en cualquiera de las dos páginas, entonces los importes son idénticos a los de la página sin parámetros. Unit test de `getCatalogOffer`: solo pasa el slug y `c` a `getPublicOffer`.
- [ ] (F3) Dado un viaje publicado sin oferta aplicable (sin ofertas, solo borradores o aprobadas, todas cerradas o la activa vencida), entonces:
  - `/viajes/<slug>` muestra en la sección de precio solo «Todavía no publicamos el precio de este viaje.»;
  - el registro no muestra bloque;
  - el HTML de ambas páginas no contiene «US$», «S/», «Desde», «Reserva con», «anticipo» ni «Beneficio», aunque `trips.price_usd`, `deposit_usd`, `installments_price_usd`, `companion_price_usd` y `payment_terms` tengan valor.
- [ ] (F3) Dada una oferta activa sin ningún tipo de cambio en la base, entonces el bloque muestra solo los importes en USD y «El importe en soles se mostrará antes de pagar.».
- [ ] (F3) Dado `toOfferView`, entonces (unit test):
  - con y sin descuento, con 0 y con 3 anticipos (saldo = final − anticipo), con y sin bono, con y sin `valid_until`;
  - con tipo de cambio (cada importe en soles con `usdToPenCents`) y sin él (soles `null`);
  - condiciones divididas en párrafos sin líneas vacías.

  `getCatalogTrip` ya no devuelve `price`, `installmentsPrice`, `deposit`, `companionPrice` ni `paymentTerms`.
- [ ] (F3) Dada cualquiera de las dos páginas a 360 px, entonces no hay scroll horizontal. El bloque usa los tokens del PR #27 y los del tema (`text-primary`, `border-primary/15`, `text-night`, `bg-sky`, `display-title`), sin colores arbitrarios.
- [ ] (F3) Dado el README, entonces "Qué usa hoy la landing" describe el bloque financiero, la regla de resolución, el aviso sin oferta y que los campos de precio de `trips` ya no se publican.
- [ ] (F3) Lint, tests y build sin errores; `/viajes/[slug]` y su registro siguen dinámicos (`ƒ`). Worker medido.

Fase 4 (limpieza del catálogo):
- [ ] (F4) Dado `/crm/viajes/nuevo` y `/crm/viajes/<id>`, entonces el formulario ya no tiene "Precio desde", "Precio total en cuotas", "Reserva", "Precio de acompañante" ni "Condiciones de pago", y `/crm/viajes` ya no tiene la columna "Precio". Al guardar un viaje, esas columnas conservan su valor en la base (unit test del service: `editableColumns` no las incluye).
- [ ] (F4) Dado `PublicTrip`, entonces ya no tiene `priceUsd`, `installmentsPriceUsd`, `depositUsd`, `companionPriceUsd` ni `paymentTerms`, y `listPublishedTrips`/`getPublishedTripBySlug` no los seleccionan (unit test). `tripFormSchema` descarta esas claves si llegan (unit test).
- [ ] (F4) Dado el README, entonces la sección de viajes explica que el precio vive en las ofertas y que las cinco columnas antiguas siguen en la base sin uso, solo como referencia. Indica cómo consultarlas en el SQL Editor (`SELECT slug, price_usd, deposit_usd, installments_price_usd, companion_price_usd, payment_terms FROM trips;`) y que su borrado será una operación aparte.
- [ ] (F4) Lint, tests y build sin errores. Worker medido.

## Diseño técnico

### Decisiones
1. **Ofertas en `modules/trips`.** Una oferta es el precio de un viaje del catálogo. Los consumidores (`landing` y, más adelante, `bookings`) la leen por la API pública `@/modules/trips`. Archivos propios (`offers.*`, `exchangeRates.*`) para no mezclarla con `trips.*`.
2. **Una fila por versión, sin tabla "oferta" padre.** El ámbito (viaje y campaña opcional) agrupa las versiones y el número de versión las ordena. Así `offer_version_id` es simplemente `trip_offers.id`, una fila inmutable desde su aprobación, y el historial es "las versiones de este ámbito". Una tabla padre solo añadiría un JOIN sin cubrir ningún caso de esta spec (YAGNI). El ámbito no se edita: cambiar de campaña es otra oferta.
3. **Unicidad en la base con índices únicos parciales**, en pares (general: `campaign_id IS NULL` por `trip_id`; campaña: por `campaign_id`). Garantizan una activa por ámbito, una pendiente por ámbito y números de versión únicos. La FK compuesta `(campaign_id, trip_id) → campaigns(id, trip_id)` garantiza que la campaña es del viaje, igual que `itinerary_items → bookings`. Exige la restricción única aditiva `campaigns_id_trip_uq`, que no cambia ningún comportamiento de las campañas.
4. **Activar es un `db.batch` de dos sentencias**: cerrar la activa del ámbito y activar la nueva, en ese orden y en una transacción. No puede ser una sola CTE: los índices únicos parciales se comprueban por fila y el orden de las sub-sentencias de una CTE no está garantizado. La primera sentencia solo cierra si la segunda va a proceder (mismas condiciones en un `EXISTS`). Una tercera sentencia `SELECT` explica el resultado. Si dos admins activan a la vez, el índice único hace fallar el batch completo, que se revierte, y la acción responde con el error genérico.
5. **Inmutabilidad por el service, sin trigger.** Toda sentencia que escribe condiciones lleva `status = 'draft'` en su `WHERE`, y las transiciones solo escriben estado y auditoría. El proyecto no usa triggers (las migraciones son las que genera drizzle-kit) y el CHECK garantiza el orden de la auditoría. Los tests del service verifican esas condiciones. Coste aceptado: alguien con acceso SQL de owner podría editar una versión aprobada; es el mismo nivel de confianza que el resto del esquema.
6. **Vigencia en fechas de calendario de Lima** (`date`, inclusivas): el CRM ya usa `CRM_TIME_ZONE` y el negocio vende en Perú. "Hoy" se calcula en SQL con `(now() AT TIME ZONE 'America/Lima')::date` (mismo patrón que `leadReport.service.ts`) y en el CRM con `getTodayDate()`. Sin activaciones programadas: activar exige `valid_from ≤ hoy`, para no dejar un hueco sin oferta al cerrar la anterior antes de tiempo.
7. **Oferta de campaña por `?c=` (selección, no importe).** Es la lectura que esta spec hace de "un parámetro nunca cambia el importe": el parámetro solo elige entre ofertas que el negocio aprobó y activó para esa campaña y carrera, y el servidor lo valida (campaña activa, misma carrera, oferta vigente). El código de una campaña es público (va en el QR): cualquiera con el enlace ve su precio. El admin lo sabe al aprobar una oferta de campaña (texto del diálogo). Pregunta abierta 3.
8. **Nunca se acumula.** La resolución devuelve una sola oferta, la de campaña o la general. Si el negocio autoriza combinar beneficios, crea una oferta de campaña con el descuento y el bono combinados y la aprueba como cualquier otra: la autorización expresa es esa aprobación.
9. **Cupos de la oferta (`capacity_limit`) sin mostrarlos todavía.** La versión los guarda (forman parte de lo aprobado) y el CRM los muestra. La web no muestra cupos de la oferta, porque hoy nada los descuenta: las reservas no tienen `offer_version_id`. Mostrar «Quedan N» o «Primeros N» sin contarlos incumpliría "cupos reales". Contrato futuro en "Contrato para las specs siguientes". Los cupos del catálogo (`trips.capacity`, "100 cupos", informativos) no cambian.
10. **Un bono no es un descuento.** No tiene campo monetario. El schema rechaza textos con importes (`US$`, `$`, `S/`, `USD`, `PEN`, «dólares», «soles» junto a un número), y la web añade «No es un descuento ni se canjea por dinero.».
11. **Tipo de cambio en esta spec, no en `bookings-mercadopago`.** El bloque público ya debe mostrar el importe exacto en soles antes del checkout, así que el dato y su historial hacen falta aquí. `bookings-mercadopago` solo leerá el vigente (`getCurrentExchangeRate`) y copiará su valor y su id en cada intento de cobro. Una fila por cambio, que rige desde que se guarda: no hay tipos programados ni vencimiento (Pregunta abierta 2). El cálculo vive en `lib/currency.ts` porque lo usan `landing` y `trips` ahora, y `bookings` después (SETUP §1, regla 5). Es puro y sin `server-only`.
12. **El registro no guarda la oferta vista.** La oferta que aplica legalmente es la de la reserva (`bookings.offer_version_id`, en la spec siguiente), elegida en ese momento con `getActiveOffer`. Guardarla al registrarse podría llevar a respetar un precio ya vencido. Además obligaría a cambiar `createWebLead`, su hash y `submitWebLeadAction`, aprobados e implementados. La oferta que vio un lead se reconstruye con su `campaign_id`, su `created_at` y el historial de versiones (ámbito, `activated_at`, `closed_at`, vigencia). No hay enmienda a `landing-omnichannel-capture.md`. Pregunta abierta 4.
13. **Campos antiguos de `trips`: convivencia sin `DROP` y sin migrar importes.** Los valores actuales son contradictorios y el negocio aún no aprobó las reglas: copiarlos a ofertas sería inventar precios. Se dejan de leer y de escribir (F3 y F4) y se conservan como referencia; borrarlos será una operación aparte, con su propia autorización. `formatTripPrice` se mantiene y pasa a formatear los importes de las ofertas (su rama `null` queda sin uso en la web).
14. **Bloque público en `landing`, datos en `trips`.** `getCatalogOffer` (cacheada con `cache` de React, como `getCatalogTrip`) llama a `getPublicOffer`, una sola consulta que devuelve la oferta y el tipo vigente. La transforma con la función pura `toOfferView`. `OfferSummary` es presentacional. `TripDetail` y `RaceRegistrationSection` reciben la vista por props (SOLID-O). Sin `"use client"`.
15. **Sin componentes shadcn nuevos.** Se usan `card`, `table`, `badge`, `button`, `input`, `label`, `textarea`, `native-select` y `alert-dialog` (vía `ConfirmActionButton`), todos instalados. `alert` (`npx shadcn@latest search @shadcn -q alert`) existe pero se descarta: el aviso sin oferta es una línea de texto con el estilo de `TripDetail`. No hay dependencias nuevas.
16. **Tamaño del Worker:** F1 no añade rutas. F2 añade 3 páginas del CRM. F3 y F4 solo modifican. La última tarea de F2, F3 y F4 ejecuta, en Linux/WSL y sin desplegar, `npm run build:worker` y `npx wrangler deploy --dry-run --outdir <scratch>`, y registra el gzip frente a 1602.73 KiB. Si supera 2 MiB, se detiene y se consulta.

### Relación con `trips` (una sola fuente de verdad)
| Campo de `trips` | Queda en | Tras esta spec |
|---|---|---|
| `slug`, `title`, `city`, `country`, `race_date`, `start_date`, `end_date`, `distances`, `summary`, `image_url`, `official_url`, `notes` | `trips` (catálogo descriptivo) | Sin cambios |
| `includes`, `excludes` | `trips` | Sin cambios. Describen el paquete y se muestran con o sin oferta. `bookings-contract-acceptance` deberá copiarlos al documento aceptado (contrato futuro) |
| `capacity` | `trips` | Cupos totales informativos, con el aviso actual. Distinto de `trip_offers.capacity_limit` |
| `price_usd` | → `trip_offers.total_price_usd` / `final_price_usd` | F3: no se publica. F4: fuera de `PublicTrip`, del formulario y de la lista. Columna conservada |
| `deposit_usd` | → `trip_offers.deposit_options_usd` | Igual que `price_usd` |
| `payment_terms` | → `trip_offers.conditions` | Igual que `price_usd` |
| `installments_price_usd`, `companion_price_usd` | Sin equivalente (Pregunta abierta 5) | Igual que `price_usd`. No se publican hasta que una spec defina sus reglas |

Sin oferta aplicable, la landing muestra el catálogo descriptivo y el aviso «Todavía no publicamos el precio de este viaje.» (Requisito 8).

### Base de datos: `lib/db-schema.ts` (F1) → `drizzle/0008_*.sql` (número provisional; el definitivo se fija solo en el turno de merge)
Todo en `public`, snake_case. `tripOffers` se declara después de `campaigns`.

| Objeto | Definición |
|---|---|
| enum `trip_offer_status` (nuevo) | `draft`, `approved`, `active`, `closed` |
| `trip_offers.id` | `uuid` PK `defaultRandom()` (es el `offer_version_id`) |
| `trip_offers.trip_id` | `uuid not null` → `trips.id` `ON DELETE RESTRICT`; índice `trip_offers_trip_idx` |
| `trip_offers.campaign_id` | `uuid` nulo; FK compuesta `trip_offers_campaign_trip_fk (campaign_id, trip_id) → campaigns (id, trip_id)` `ON DELETE RESTRICT` (MATCH SIMPLE: se omite sin campaña) |
| `trip_offers.version` | `integer not null`; CHECK `trip_offers_version_chk`: `version >= 1` |
| `trip_offers.status` | `trip_offer_status not null default 'draft'` |
| `trip_offers.name` | `text not null`; CHECK `trip_offers_name_chk`: `char_length(name) BETWEEN 2 AND 80` |
| `trip_offers.total_price_usd`, `discount_usd` | `integer not null`, `integer not null default 0`; CHECK `trip_offers_price_chk`: `total_price_usd BETWEEN 1 AND 1000000 AND discount_usd >= 0 AND discount_usd < total_price_usd` |
| `trip_offers.final_price_usd` | `integer GENERATED ALWAYS AS (total_price_usd - discount_usd) STORED` (`generatedAlwaysAs`) |
| `trip_offers.deposit_options_usd` | `integer[] not null default '{}'`; CHECK `trip_offers_deposits_chk`: `cardinality(deposit_options_usd) <= 3 AND array_position(deposit_options_usd, NULL) IS NULL AND 0 < ALL (deposit_options_usd) AND (total_price_usd - discount_usd) > ALL (deposit_options_usd)` |
| `trip_offers.balance_due_on` | `date` (`mode: "string"`) nulo; CHECK `trip_offers_balance_chk`: `(cardinality(deposit_options_usd) = 0) = (balance_due_on IS NULL)` |
| `trip_offers.bonus_description` | `text` nulo; CHECK `IS NULL OR char_length BETWEEN 2 AND 200` |
| `trip_offers.valid_from`, `valid_until` | `date not null`, `date` nulo (`mode: "string"`); CHECK `trip_offers_validity_chk`: `valid_until IS NULL OR valid_until >= valid_from` |
| `trip_offers.capacity_limit` | `integer` nulo; CHECK `IS NULL OR BETWEEN 1 AND 10000` |
| `trip_offers.terms_version` | `text not null`; CHECK `trip_offers_terms_version_chk`: `terms_version ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(terms_version) BETWEEN 3 AND 60` |
| `trip_offers.conditions` | `text not null`; CHECK `char_length(conditions) BETWEEN 10 AND 2000` |
| `trip_offers.created_by`, `created_at`, `updated_at` | `text not null` → `profiles.user_id` `RESTRICT`; `timestamptz not null default now()` ×2 (`updated_at` lo fija el service al editar el borrador) |
| `trip_offers.approved_by`/`approved_at`, `activated_by`/`activated_at`, `closed_by`/`closed_at` | `text` → `profiles.user_id` `RESTRICT` / `timestamptz`, nulos |
| `trip_offers.superseded_by` | `uuid` nulo → `trip_offers.id` `RESTRICT` (autorreferencia) |
| CHECK `trip_offers_approved_chk` | `(approved_at IS NULL) = (approved_by IS NULL) AND (status <> 'draft' OR approved_at IS NULL) AND (status NOT IN ('approved', 'active') OR approved_at IS NOT NULL)` |
| CHECK `trip_offers_activated_chk` | `(activated_at IS NULL) = (activated_by IS NULL) AND (activated_at IS NULL OR approved_at IS NOT NULL) AND (status <> 'active' OR activated_at IS NOT NULL) AND (status NOT IN ('draft', 'approved') OR activated_at IS NULL)` |
| CHECK `trip_offers_closed_chk` | `(status = 'closed') = (closed_at IS NOT NULL) AND (closed_at IS NULL) = (closed_by IS NULL) AND (superseded_by IS NULL OR (status = 'closed' AND activated_at IS NOT NULL))` |
| Índices únicos parciales | `trip_offers_general_version_uq (trip_id, version) WHERE campaign_id IS NULL`; `trip_offers_campaign_version_uq (campaign_id, version) WHERE campaign_id IS NOT NULL`; `trip_offers_general_active_uq (trip_id) WHERE status = 'active' AND campaign_id IS NULL`; `trip_offers_campaign_active_uq (campaign_id) WHERE status = 'active' AND campaign_id IS NOT NULL`; `trip_offers_general_pending_uq (trip_id) WHERE status IN ('draft', 'approved') AND campaign_id IS NULL`; `trip_offers_campaign_pending_uq (campaign_id) WHERE status IN ('draft', 'approved') AND campaign_id IS NOT NULL` |
| `campaigns` | `unique("campaigns_id_trip_uq").on(id, trip_id)` (aditiva, destino de la FK compuesta) |
| `exchange_rates.id` | `uuid` PK `defaultRandom()` |
| `exchange_rates.usd_pen` | `numeric(10,4) not null` (soles por 1 USD; Drizzle lo devuelve como string); CHECK `exchange_rates_usd_pen_chk`: `usd_pen > 0 AND usd_pen < 100` |
| `exchange_rates.created_by`, `created_at` | `text not null` → `profiles.user_id` `RESTRICT`; `timestamptz not null default now()` (momento desde el que rige); índice `exchange_rates_created_idx (created_at)` |

- Comentarios en el schema: una fila de `trip_offers` es una versión, inmutable desde su aprobación, y nunca se borra; la versión vigente se resuelve según el Requisito 4. `exchange_rates` solo admite inserciones.
- **Aplicación manual en un solo bloque** entre `BEGIN;` y `COMMIT;`: no hay `ADD VALUE` (solo se crea un enum nuevo). Orden: `… → 0007 → 0008`. En `production` antes hay que aplicar `0005`, `0006` y `0007`, que siguen pendientes (cada una en sus dos bloques).
- El developer comprueba que drizzle-kit genera la FK compuesta, la autorreferencia, la columna generada y los índices parciales tal como están en la tabla. Si alguna construcción no se genera, se detiene y lo consulta: no edita el SQL a mano.

### Permisos: `lib/auth/permissions.ts` (F1)
```ts
export type Permission = "crm.access" | "staff.manage" | "trips.manage" | "leads.manage" | "bookings.manage"
  | "offers.manage" | "offers.view";
// "offers.manage": [],              // admin only (has every permission)
// "offers.view": ["commercial"],    // read-only CRM pages; admin passes always; [] → false
```

### Cálculo y formato de moneda: `lib/currency.ts` (F1, nuevo, compartido, sin `server-only`)
```ts
// USD amounts are whole dollars; the USD→PEN rate is handled in ten-thousandths (numeric(10,4)).
export const MAX_USD_AMOUNT = 1_000_000;
export function parseUsdPenRate(value: string): number | null; // "3.75" → 37500; /^\d{1,2}(\.\d{1,4})?$/, > 0, < 100; else null
export function usdToPenCents(usd: number, rateE4: number): number;
//   integers only: n = usd * rateE4 (PEN in 1e-4); cents = half-up of n / 100 with exact integer arithmetic
//   (e.g. (n + 50 - ((n + 50) % 100)) / 100). RangeError if usd is not an integer in [0, MAX_USD_AMOUNT]
//   or rateE4 is not an integer in [1, 999999].
export function formatPenCents(cents: number): string;  // "S/ 6,748.41", built from integers (no toFixed on floats)
export function formatUsdPenRate(rateE4: number): string; // "3.7500"
```

### Schemas, tipos y services (`modules/trips/`, F1)
- `schemas/offers.schema.ts` (sin `server-only`). Reutiliza los patrones de `trips.schema.ts` (`blankToNull`, `textList`, `wholeNumber`); si hace falta compartirlos, se exportan desde `trips.schema.ts` sin cambiar su comportamiento.
  ```ts
  export const offerStatusSchema = z.enum(["draft", "approved", "active", "closed"]);
  export const offerIdSchema = z.uuid();
  export const offerFormSchema = z.object({
    name,               // trim 2–80: "Escribe un nombre interno de 2 a 80 caracteres."
    totalPriceUsd,      // whole 1..1,000,000: "Indica el precio total en dólares, sin decimales."
    discountUsd,        // "" → 0; whole ≥ 0
    depositOptionsUsd,  // split ",", trim, drop empty, /^\d+$/ → int > 0, dedupe, sort asc; ≤ 3
    balanceDueOn,       // "" → null; z.iso.date()
    bonusDescription,   // "" → null; trim 2–200; no money amounts (Decision 10)
    validFrom,          // z.iso.date() required
    validUntil,         // "" → null; z.iso.date()
    capacityLimit,      // "" → null; whole 1..10,000
    termsVersion,       // trim, lowercase, 3–60, /^[a-z0-9]+(-[a-z0-9]+)*$/
    conditions,         // trim 10–2000
  }).superRefine(/* discount < total → discountUsd; each deposit < final → depositOptionsUsd;
                    deposits ⇔ balanceDueOn → balanceDueOn; validUntil ≥ validFrom → validUntil */);
  export const createOfferSchema = offerFormSchema.safeExtend({ tripId: z.uuid(), campaignId: /* "" → null | uuid */ });
  export const updateOfferSchema = offerFormSchema.safeExtend({ id: offerIdSchema });
  export const offerTransitionSchema = z.object({ offerId: offerIdSchema });
  export const exchangeRateFormSchema = z.object({ usdPen: /* parseUsdPenRate → normalized "3.7500" */ });
  ```
  Mensajes en español. Los de los refinamientos: «El descuento debe ser menor que el precio total.», «Cada anticipo debe ser menor que el precio final.», «Indica hasta cuándo se paga el saldo.», «Sin anticipos no hay saldo: deja la fecha vacía.», «La fecha final no puede ser anterior a la inicial.», «Un bono no es un descuento: descríbelo sin importes (p. ej. «Polo oficial de la carrera»).» y «Indica el tipo con punto decimal y hasta 4 decimales (p. ej. 3.7500).».
- `types/offers.types.ts`:
  ```ts
  export type OfferStatus = z.infer<typeof offerStatusSchema>;
  export type OfferInput = z.output<typeof offerFormSchema>;
  export type CreateOfferInput = z.output<typeof createOfferSchema>;
  export type OfferListItem = { id: string; version: number; status: OfferStatus; name: string;
    trip: { id: string; slug: string; title: string };
    campaign: { id: string; code: string; name: string; status: "active" | "closed" } | null;
    finalPriceUsd: number; validFrom: string; validUntil: string | null;
    approvedAt: Date | null; activatedAt: Date | null; closedAt: Date | null };
  export type OfferDetail = OfferListItem & OfferInput & { totalPriceUsd: number; discountUsd: number;
    createdAt: Date; createdBy: { email: string }; approvedBy: { email: string } | null;
    activatedBy: { email: string } | null; closedBy: { email: string } | null;
    supersededByVersion: number | null; history: OfferListItem[] };   // history = every version of the scope, version DESC
  export type ActiveOffer = { offerVersionId: string; tripId: string; campaignId: string | null; version: number;
    totalPriceUsd: number; discountUsd: number; finalPriceUsd: number; depositOptionsUsd: number[];
    balanceDueOn: string | null; bonusDescription: string | null; validFrom: string; validUntil: string | null;
    capacityLimit: number | null; termsVersion: string; conditions: string; approvedAt: Date; activatedAt: Date };
  export type PublicOffer = Pick<ActiveOffer, "totalPriceUsd" | "discountUsd" | "finalPriceUsd" | "depositOptionsUsd"
    | "balanceDueOn" | "bonusDescription" | "validFrom" | "validUntil" | "termsVersion" | "conditions">;
  export type ExchangeRate = { usdPen: string; effectiveFrom: Date };       // usdPen "3.7500"
  export type ExchangeRateListItem = ExchangeRate & { id: string; createdBy: { email: string } };
  export type PublicOfferRead = { offer: PublicOffer; exchangeRate: ExchangeRate | null };
  export type OfferActionState = { status: "idle" } | { status: "success"; message: string }
    | { status: "error"; code: "unauthorized" | "forbidden" | "invalid_input" | "invalid_trip" | "invalid_campaign"
        | "pending_exists" | "not_found" | "not_draft" | "invalid_transition" | "expired" | "not_started"
        | "trip_archived" | "campaign_closed"; message: string;
        fieldErrors?: Record<string, string[]>; values?: Record<string, string> };
  export type ExchangeRateActionState = /* same shape; codes "unauthorized" | "forbidden" | "invalid_input" */;
  ```
- `services/offers.service.ts` (`server-only`, `getDb()`):
  ```ts
  export async function listOffers(): Promise<OfferListItem[]>;
  //   one query: trip_offers JOIN trips LEFT JOIN campaigns
  //   ORDER BY trips.race_date, trips.slug, campaign_id NULLS FIRST, campaigns.code, version DESC
  export async function getOfferById(id: string): Promise<OfferDetail | null>;
  //   non-UUID → null without a query; db.batch: detail (+ profiles emails, superseded version) and history of its scope
  export async function createOfferDraft(input: CreateOfferInput, actorUserId: string):
    Promise<{ id: string } | "invalid_trip" | "invalid_campaign" | "pending_exists">;
  //   db.batch: INSERT … SELECT … FROM trips WHERE id = $trip AND status <> 'archived'
  //     AND ($campaign IS NULL OR EXISTS active campaign of that trip), version = coalesce(max in scope, 0) + 1,
  //     ON CONFLICT DO NOTHING RETURNING id; + SELECT trip_ok, campaign_ok to explain an empty insert
  export async function createOfferVersionFrom(sourceId: string, actorUserId: string):
    Promise<{ id: string } | "not_found" | "pending_exists">;
  //   same pattern; copies name, prices, deposits, balance, bonus, validity, capacity, terms and conditions
  //   from a source with status <> 'draft'; never copies status or audit
  export async function updateOfferDraft(id: string, input: OfferInput):
    Promise<"updated" | "not_found" | "not_draft">;  // db.batch: UPDATE … WHERE id AND status = 'draft'; SELECT status
  export async function approveOffer(id: string, actorUserId: string): Promise<"approved" | "invalid_transition" | "expired">;
  export async function activateOffer(id: string, actorUserId: string): Promise<"activated" | "invalid_transition"
    | "not_started" | "expired" | "trip_archived" | "campaign_closed">;   // Decision 4
  export async function closeOffer(id: string, actorUserId: string): Promise<"closed" | "invalid_transition">;
  export async function getActiveOffer(tripId: string, campaignId?: string | null): Promise<ActiveOffer | null>;
  //   Requirement 4, one query, campaign offer first; non-UUID ids → null / treated as no campaign
  export async function getPublicOffer(slug: string, campaignCode: string | null): Promise<PublicOfferRead | null>;
  //   await connection(); canonical slug (tripSlugSchema, like getPublishedTripBySlug) else null without a query;
  //   code trimmed + lowercased, /^[a-z0-9]+(-[a-z0-9]+)*$/ 3–32, else treated as null;
  //   one query: published trip, active campaign of that trip, in-force offer (campaign first, LIMIT 1),
  //   LEFT JOIN LATERAL latest exchange_rates row
  ```
  "Hoy" en SQL: `(now() AT TIME ZONE ${CRM_TIME_ZONE})::date`, con `CRM_TIME_ZONE` de `@/lib/dates`, como `leadReport.service.ts`.
- `services/exchangeRates.service.ts` (`server-only`): `getCurrentExchangeRate(): Promise<ExchangeRate | null>`, `listExchangeRates(): Promise<ExchangeRateListItem[]>` (20 últimas, `created_at DESC, id DESC`, JOIN `profiles`) y `setExchangeRate(usdPen: string, actorUserId: string): Promise<{ id: string }>` (solo `INSERT`).

### CRM (F2)
- `utils/offerDisplay.ts` (puro): `OFFER_STATUS_LABELS`; `offerTiming(validFrom, validUntil, today): "scheduled" | "in_force" | "expired"`; `offerValidityText(validFrom, validUntil)` (con `formatTripDate` y `formatTripDateRange`); `offerScopeLabel(campaign)`.
- `actions/offers.actions.ts` (`"use server"`), mismo patrón que `trips.actions.ts` y `campaigns.actions.ts` (guarda → zod → service → `revalidatePath`):
  - `createOfferAction` → redirige a `/crm/ofertas/<id>`;
  - `updateOfferAction` → revalida la ficha, «Borrador guardado.»;
  - `createOfferVersionAction` → redirige al borrador nuevo;
  - `approveOfferAction`, `activateOfferAction` y `closeOfferAction` (`offerId`) → revalidan la lista y la ficha.

  Todas con `requirePermission("offers.manage")`. No revalidan rutas públicas: se leen por petición. Mensajes:

  | Código | Mensaje |
  |---|---|
  | `unauthorized` / `forbidden` | «Tu sesión no es válida. Vuelve a iniciar sesión.» / «No tienes permiso para gestionar ofertas.» |
  | `invalid_input` | «Revisa los campos marcados.» (+ `fieldErrors`, `values`) |
  | `invalid_trip` | «Elige un viaje del catálogo.» (en `tripId`) |
  | `invalid_campaign` | «Elige una campaña activa de ese viaje.» (en `campaignId`) |
  | `pending_exists` | «Ya hay una versión pendiente de esta oferta. Ábrela o descártala.» |
  | `not_found` / `not_draft` | «La oferta ya no existe. Recarga la página.» / «Esta versión ya está aprobada y no se puede editar. Crea una versión nueva.» |
  | `invalid_transition` | «La oferta ya no está en ese estado. Recarga la página.» |
  | `expired` / `not_started` | «La vigencia ya terminó. Crea una versión nueva.» / «La vigencia aún no ha empezado. Actívala a partir del <fecha de inicio>.» |
  | `trip_archived` / `campaign_closed` | «El viaje está archivado.» / «La campaña está cerrada.» |

  Mensajes de éxito: «Versión aprobada. Ya no se puede editar.», «Oferta activa.», «Oferta cerrada.».
- `actions/exchangeRates.actions.ts` (`"use server"`): `setExchangeRateAction` → `requirePermission("offers.manage")` → `exchangeRateFormSchema` → `setExchangeRate` → `revalidatePath("/crm/ofertas")`, «Tipo de cambio guardado.».
- Componentes:

  | Componente | Tipo | Detalle |
  |---|---|---|
  | `card`, `table`, `badge`, `button` (`buttonVariants`), `input`, `label`, `textarea`, `native-select` | shadcn (instalado) | Fichas, listas, estados y formularios |
  | `ConfirmActionButton` | existente (`components/shared/ConfirmActionButton.tsx`) | «Aprobar», «Activar», «Cerrar» o «Descartar» y «Crear nueva versión» |
  | `CrmShell` | existente (`modules/accounts/components/CrmShell.tsx`) | Enlace "Ofertas" a `/crm/ofertas` si `can(roles, "offers.view")`, después de "Viajes"; el `<nav>` también se muestra con ese permiso |
  | `OfferForm` | nuevo, `modules/trips/components/` (`"use client"`; no hay formulario de ofertas; patrón de `TripForm` y `CampaignForm`) | Props `{ offer?: OfferDetail; tripOptions?: { id: string; title: string }[]; campaignOptions?: { id: string; label: string; tripId: string }[] }`. Sin `offer`: viaje y campaña («General (sin campaña)» + campañas activas) con `createOfferAction`. Con `offer`: campo oculto `id` y `updateOfferAction`. Campos del Requisito 1, con pistas: «Hasta 3 importes en USD separados por comas. Vacío = pago único.», «Sin importes: un beneficio no monetario.», «Fechas en hora de Lima.». Conserva lo escrito tras un error (`onSubmit` + `startTransition`, como `TripForm`) |
  | `OfferTable` | nuevo, `modules/trips/components/` (Server, presentacional) | Props `{ offers: OfferListItem[]; today: string }`. Columnas: Viaje, Ámbito (`offerScopeLabel`), Versión, Estado (`Badge` + «· vencida» o «· programada» según `offerTiming` si está activa, y «· campaña cerrada»), Precio final (`formatTripPrice`), Vigencia y Aprobada. Enlace a la ficha. Vacío: «Aún no hay ofertas. El admin crea la primera con «Nueva oferta».». Se reutiliza para el historial de la ficha |
  | `OfferDetails` | nuevo, `modules/trips/components/` (Server, presentacional) | Props `{ offer: OfferDetail; exchangeRate: ExchangeRate \| null; canManage: boolean; today: string }`. `Card` con las condiciones, el precio final y cada anticipo con su saldo, en USD y en soles (`lib/currency`), los cupos, «Creada / Aprobada / Activada / Cerrada por <correo> el <fecha>» (`formatDateTime`) y «Sustituida por vN». Con `canManage`, los botones que admite su estado. Textos de los diálogos en "Textos" |
  | `ExchangeRateForm` | nuevo, `modules/trips/components/` (`"use client"`) | Un campo «Soles por 1 USD» (`inputMode="decimal"`) y «Guardar tipo de cambio», con `setExchangeRateAction` |
  | `ExchangeRateTable` | nuevo, `modules/trips/components/` (Server, presentacional) | Props `{ rates: ExchangeRateListItem[] }`. Columnas: Tipo («S/ 3.7512 por US$ 1»), Desde (`formatDateTime`) y Fijado por. La primera fila lleva el `Badge` «Vigente». Vacío: «Aún no hay tipo de cambio: la web muestra solo dólares.» |

- Rutas (`app/crm/(protected)/`; patrón de `/crm/campanas`; consultar `node_modules/next/dist/docs/` antes de escribirlas):

  | Ruta | Cambio |
  |---|---|
  | `ofertas/page.tsx` | Nueva. `getCrmAccess("offers.view")`. `h1` «Ofertas». Con `offers.manage`, enlace «Nueva oferta». `OfferTable` con `listOffers()`. Sección «Tipo de cambio» con `ExchangeRateTable` (`listExchangeRates()`) y, con `offers.manage`, `ExchangeRateForm` |
  | `ofertas/nueva/page.tsx` | Nueva. `getCrmAccess("offers.manage")`. `OfferForm` con los viajes no archivados (`listTrips()`) y las campañas activas (`listCampaigns()` de `@/modules/crm`, compuestas aquí) |
  | `ofertas/[id]/page.tsx` | Nueva. `getCrmAccess("offers.view")`. `getOfferById` (o `null`) → `notFound()`. `OfferDetails` con `getCurrentExchangeRate()` y `canManage = can(user.staffRoles, "offers.manage")`. Si es `draft` y `canManage`, `OfferForm`. «Historial de esta oferta» con `OfferTable` sobre `history` |

### Bloque público (`modules/landing/`, `app/`, F3)
- `utils/catalogOffer.ts` (nuevo):
  ```ts
  export type OfferView = {
    totalPrice: string; totalPricePen: string | null;           // "US$ 2,000" / "S/ 7,500.00"
    discount: string | null; discountPen: string | null;        // null when discount is 0
    finalPrice: string; finalPricePen: string | null;
    deposits: { deposit: string; depositPen: string | null; balance: string; balancePen: string | null }[];
    balanceDueOn: string | null;                                // formatTripDate
    bonus: string | null;
    validity: string;                                           // offerValidityText
    conditions: string[]; termsVersion: string;
    exchangeRate: { rate: string; since: string } | null;       // "3.7500", formatTripDate of effectiveFrom in Lima
  };
  export function toOfferView(read: PublicOfferRead): OfferView;  // pure; formatTripPrice + lib/currency
  export const getCatalogOffer = cache(async (slug: string, campaignCode: string | null) => OfferView | null);
  ```
- `utils/catalogTrip.ts` (modificar): `TripLanding` pierde `price`, `installmentsPrice`, `deposit`, `companionPrice` y `paymentTerms`; se elimina `optionalPrice` si queda sin uso.
- Componentes:

  | Componente | Tipo | Detalle |
  |---|---|---|
  | `OfferSummary` | nuevo, `modules/landing/components/` (Server, presentacional; no existe ningún bloque de precio reutilizable: `TripFacts` es la copia fija de la portada) | Props `{ offer: OfferView; className?: string }`. `<section aria-labelledby>` con `h2` «Precio y condiciones», `<dl>` de importes (USD con los soles entre paréntesis), lista de anticipos, beneficio, vigencia, `<details open>` «Condiciones de pago y cancelación» con sus párrafos y la versión, y la regla del tipo de cambio en texto pequeño. Tokens del tema y del PR #27 |
  | `TripDetail` | existente (modificar) | Props `{ trip: TripLanding; offer: OfferView \| null }`. La sección de precio pasa a ser `<OfferSummary>` o el aviso sin oferta. El resto, incluido el aviso final, sin cambios |
  | `RaceRegistrationSection` | existente (modificar) | Prop nueva `offer: OfferView \| null`. Si hay oferta y no es modo stand, `<OfferSummary>` en una sección `bg-background` entre el encabezado y `#registro`. «Ver el paquete completo» conserva `?c=<código>` si `attribution.c` existe |

- Rutas:
  - `app/viajes/[slug]/page.tsx`: lee `searchParams` y pasa `getCatalogOffer(slug, firstParam(query.c) ?? null)` a `TripDetail`.
  - `app/viajes/[slug]/registro/page.tsx`: igual, y pasa la oferta a `RaceRegistrationSection`. Ambas siguen dinámicas.

### Textos (provisionales hasta P-L/P-T; Pregunta abierta 1)
- Regla del tipo de cambio: «Los precios están en dólares (USD). Si pagas en soles, el importe se calcula con el tipo de cambio que fija Carreras Viajeras y que esté vigente el día del pago. Tipo de cambio de hoy: S/ <tipo> por US$ 1 (vigente desde el <fecha>). El saldo se convierte con el tipo vigente el día en que lo pagues.».
- Aviso sin oferta (`/viajes/[slug]`): «Todavía no publicamos el precio de este viaje.».
- Diálogo «Aprobar»: título «¿Aprobar la v<N> de «<nombre>»?»; descripción «Confirma que el negocio aprobó estos importes, anticipos, bono, vigencia, cupos y condiciones. Después no se podrán editar: cualquier cambio será una versión nueva.» Si es de campaña, añade: «El código de la campaña es público: cualquiera con su enlace verá este precio.».
- Diálogo «Activar»: «¿Activar la v<N>?» / «Se mostrará en la web de la carrera si está publicada y dentro de su vigencia. Si hay otra versión activa de esta oferta, se cerrará.».
- Diálogo «Cerrar» o «Descartar»: «¿Cerrar la v<N>?» / «Dejará de aplicarse y no se puede reabrir. Podrás crear una versión nueva a partir de ella.».

### Contrato de API
Lecturas server-only exportadas por `@/modules/trips`:
```ts
getActiveOffer(tripId: string, campaignId?: string | null): Promise<ActiveOffer | null>; // for bookings specs
getPublicOffer(slug: string, campaignCode: string | null): Promise<PublicOfferRead | null>; // for landing
getCurrentExchangeRate(): Promise<ExchangeRate | null>;                                     // for bookings-mercadopago
```
Server Actions del CRM (`offers.manage`; `FormData` solo strings; las claves desconocidas se descartan):
```ts
createOfferAction(prev: OfferActionState, formData: FormData): Promise<OfferActionState>;
//   { tripId, campaignId?, name, totalPriceUsd, discountUsd?, depositOptionsUsd?, balanceDueOn?,
//     bonusDescription?, validFrom, validUntil?, capacityLimit?, termsVersion, conditions }
updateOfferAction(prev, formData);        // same fields without tripId/campaignId, plus id
createOfferVersionAction(prev, formData); // { offerId }
approveOfferAction(prev, formData);       // { offerId }
activateOfferAction(prev, formData);      // { offerId }
closeOfferAction(prev, formData);         // { offerId }
setExchangeRateAction(prev: ExchangeRateActionState, formData: FormData): Promise<ExchangeRateActionState>; // { usdPen }
```
No hay rutas HTTP nuevas. La API de n8n y el outbox no cambian.

### Contrato para las specs siguientes (no se implementa aquí)
- **`bookings-runner-self-service`:** `bookings.offer_version_id uuid REFERENCES trip_offers(id)`, elegido con `getActiveOffer(tripId, lead.campaign_id)` al crear la reserva. `bookings.total_usd = final_price_usd` de esa versión; el anticipo elegido tiene que estar en `deposit_options_usd`. **Cupos ocupados** de una versión con `capacity_limit` = reservas con `status <> 'cancelled'` y ese `offer_version_id`, más las retenciones vigentes del checkout. Cuando estén llenos, la reserva no se crea con esa versión, y la decisión se toma en la misma sentencia que inserta la reserva. Mostrar «quedan N» en la web será una enmienda de esta spec cuando ese conteo exista.
- **`bookings-contract-acceptance`:** enlaza `trip_offers.terms_version` con su tabla de versiones. Las versiones ya aprobadas no cambian, así que su migración debe crear antes las versiones que ya estén en uso. El documento aceptado guarda la versión de la oferta y una copia de `includes`/`excludes` del viaje.
- **`bookings-mercadopago`:** solo cobra con una oferta vigente según el Requisito 4 o con la versión ya aceptada en la reserva (Pregunta abierta 7). Lee `getCurrentExchangeRate()`, guarda en cada intento `exchange_rate_id`, `usd_pen` y los céntimos calculados con `usdToPenCents`, y muestra ese importe antes de pagar.

### Relación con otras specs y conflictos (no se editan)
- **`landing-omnichannel-capture.md`** (aprobada). **Enmienda declarada:**
  - Requisito 1 («Encabezado comercial mínimo… Sin precios, cupos, beneficios»): el encabezado sigue siendo solo del catálogo, pero la página añade el bloque financiero entre el encabezado y el formulario cuando hay oferta (salvo en el modo stand, cuyo Requisito 6 no cambia). «Ver el paquete completo» conserva `?c=`.
  - Su criterio de F4 «Ningún parámetro cambia precios (la página no muestra ninguno)» se sustituye por los criterios de F3 de esta spec.
  - Su Decisión 15 se mantiene: no se usa `TripFacts`.
  - El formulario, `createWebLead` y `submitWebLeadAction` no cambian (Decisión 12).
  - Esa spec ya remitía estos puntos a `trips-commercial-offers`.
- **`landing-race-pages.md`** (aprobada). **Enmienda declarada:**
  - Requisito 5.3 (bloque «Precio»: «Desde», líneas de cuotas, reserva y acompañante, y `paymentTerms`): pasa a ser el bloque de la oferta o el aviso sin oferta.
  - Requisitos 1 y 2: los cinco campos de precio salen del formulario del CRM y de `PublicTrip` en F4; las columnas siguen.
  - Requisitos 6 y 7: la ruta también lee `?c=`, solo para resolver la oferta, y sigue dinámica.
  - Requisito 9 (sin enlace a `/contacto` ni al registro): sin cambios.
  - Su precondición operativa de F2 (cargar 1799, 300 y 1300 en Santiago) queda superada: esos importes ya no se publican.
- **`trips-catalog.md`** (aprobada). **Enmienda declarada:**
  - su "No incluye" («otras monedas, conversión de moneda… varios precios por viaje»): esta spec añade el importe en PEN y las ofertas versionadas;
  - `priceUsd` sale de `PublicTrip` y la columna «Precio» de `TripTable` en F4;
  - `formatTripPrice` se mantiene;
  - `trips.capacity` sigue siendo informativo.
- **`accounts-roles-permissions.md`** (aprobada). **Enmienda declarada** (ampliación de la matriz, como hicieron `trips.manage`, `leads.manage` y `bookings.manage`): `offers.manage` (solo admin) y `offers.view` (`commercial`). Los permisos existentes, las guardas y `getCrmAccess` no cambian.
- **`landing-public-site.md`** (aprobada): su F4 ya estaba superada por `landing-race-pages.md` en `/viajes/[slug]`. Su criterio de cambiar el precio en el CRM y verlo en la página deja de aplicar. Sin más cambios.
- **Conflicto sin resolver aquí: la portada (`/`, `landing-home-redesign.md` y `landing-public-site.md`).** `TRIPS`, `TripFacts` y `PackageSection` muestran importes fijos («US$1,499», «US$1,799», «Reserva con US$300»). Eso contradice el bloqueante comercial y la regla de no mostrar nada vendible sin oferta. Queda fuera del alcance (`public-official-site-content`); ver la Pregunta abierta 6.
- **`runner-portal.md`** (aprobada): las reservas manuales del CRM (`bookings.total_usd`, `package_label`) no cambian ni se enlazan con ofertas.
- **No se ejecutan en paralelo** con otro trabajo sobre: `lib/db-schema.ts`, `drizzle/`, `lib/auth/permissions.ts`, `modules/accounts/components/CrmShell.tsx`, `modules/landing/components/{TripDetail,RaceRegistrationSection}.tsx`, `modules/landing/utils/catalogTrip.ts`, `modules/trips/{schemas,services,components}/trips*`/`Trip*` y `README.md`.

## Reutilización
- `getDb()` y `db.batch` (`lib/db.ts`), `lib/db-schema.ts`, `npm run db:generate` y el procedimiento manual del README.
- `CRM_TIME_ZONE`, `getTodayDate`, `formatDateTime` (`lib/dates.ts`). `can`, `requirePermission`, `UnauthorizedError`/`ForbiddenError` y `getCrmAccess`.
- De `trips`: `tripSlugSchema`, los helpers de `trips.schema.ts` (`blankToNull`, `textList`, `wholeNumber`), `formatTripPrice`, `formatTripDate`, `formatTripDateRange`, `listTrips`, el patrón de `trips.actions.ts`, `TripForm` y `TripTable`, y el patrón `publicColumns` + `connection()` de las lecturas públicas.
- De `crm`: `listCampaigns` (opciones del formulario, compuestas en `app/`).
- De `landing`: `getCatalogTrip`, `TripLanding`, `TripDetail`, `RaceRegistrationSection`, `firstParam`, `attributionParams` y los tokens del PR #27.
- `ConfirmActionButton`, `CrmShell`, `NoCrmAccess` (vía el layout protegido).
- shadcn instalados: `card`, `table`, `badge`, `button`, `input`, `label`, `textarea`, `native-select` y `alert-dialog`. No se instala nada ni se añaden dependencias.
- El fake del cliente Neon HTTP de `modules/crm/services/campaigns.service.test.ts` y `modules/trips/services/trips.service.test.ts` para los tests de los services.

## Tests
Los de servidor con `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`; sin red ni secretos.
- `lib/auth/permissions.test.ts` (F1, ampliar): filas de `offers.manage` y `offers.view`, y los bucles "admin tiene todo" y "sin roles nada" con los permisos nuevos.
- `lib/currency.test.ts` (F1): casos del criterio de F1, con los bordes half-up (`.x50`, `.x49`), cero, máximos, entradas inválidas y la diferencia de 1 céntimo entre sumas.
- `modules/trips/schemas/offers.schema.test.ts` (F1): casos del criterio de F1 (normalización de anticipos, cada refinamiento con su campo, bono con importes, claves descartadas, tipo de cambio y sincronización del enum).
- `modules/trips/services/offers.service.test.ts` (F1): cada función con el SQL y los parámetros esperados:
  - condición `status = 'draft'` en toda escritura de condiciones;
  - actor en la auditoría;
  - número de sentencias (una o un batch);
  - mapeo de cada resultado;
  - `activateOffer`: orden cierre → activación y la condición compartida;
  - `getActiveOffer`/`getPublicOffer`: condiciones del Requisito 4, prioridad de campaña, `connection()`, slug y código inválidos sin consulta o como sin campaña, y tipo de cambio `null`.
- `modules/trips/services/exchangeRates.service.test.ts` (F1): orden, límite, actor y solo `INSERT`.
- `modules/trips/utils/offerDisplay.test.ts` (F2): etiquetas, `offerTiming` en los bordes, textos de vigencia y ámbito.
- `modules/trips/actions/offers.actions.test.ts` y `exchangeRates.actions.test.ts` (F2; mocks de `server-only`, `@/lib/auth/guards`, los services, `next/cache` y `next/navigation`):
  - sin sesión, sin permiso y `commercial` (`ForbiddenError`) sin llamar al service;
  - `invalid_input` con `fieldErrors` y `values`;
  - campos extra ignorados y actor de la sesión;
  - cada resultado del service con su código;
  - redirecciones;
  - error fijo sin causa.
- `modules/landing/utils/catalogOffer.test.ts` (F3, `@/modules/trips` simulado con las utilidades puras reales): `toOfferView` (casos del criterio de F3, incluido «S/ 6,748.41»); `getCatalogOffer` solo pasa slug y código, y devuelve `null` sin oferta.
- `modules/landing/utils/catalogTrip.test.ts` (F3, ajustar): sin los campos de precio. En F4, el fixture `PublicTrip` sin ellos.
- `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/services/trips.service.test.ts` y `modules/trips/components/TripForm.test.tsx` (F4, ajustar): sin los cinco campos; se descartan si llegan y no se seleccionan ni se escriben.
- Sin unit test (SETUP §3): `lib/db-schema.ts` (migración y prueba manual), tipos, páginas de `app/` y componentes de módulo presentacionales o con la lógica en schemas, utils, services, acciones o vistas (`OfferForm`, `OfferTable`, `OfferDetails`, `ExchangeRateForm`, `ExchangeRateTable`, `OfferSummary`, `TripDetail`, `RaceRegistrationSection`, `CrmShell`). Los criterios visuales y de 360 px se verifican a mano (o con Playwright, preinstalado) en la última tarea de F3.

## Plan de tareas
Cada fase cierra con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer). Nadie aplica migraciones, despliega ni hace commits. Las fases son entregables por separado: tras F2 el admin puede cargar y aprobar ofertas, pero la web aún no las muestra; tras F3 la web solo muestra ofertas; F4 deja una sola fuente de verdad en el CRM.

### Fase 1: datos, permisos y contrato de servidor (5 tareas, 16 archivos: 2 generados por drizzle-kit)
- [ ] T1 — Base compartida:
  - enum `trip_offer_status`, tablas `trip_offers` y `exchange_rates` y `campaigns_id_trip_uq` en el schema;
  - `npm run db:generate` y revisión del SQL (sin `ADD VALUE`, `DROP` ni `neon_auth`);
  - permisos `offers.manage` y `offers.view` con sus tests;
  - README "Migración de ofertas comerciales (`0008`)".

  Archivos: `lib/db-schema.ts`, `drizzle/0008_*.sql` (generado; número provisional hasta el turno de merge), `drizzle/meta/0008_snapshot.json` (generado), `drizzle/meta/_journal.json`, `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts`, `README.md` · depende de: — · secuencial (base, `lib/`)
- [ ] T2 — Cálculo y formato USD→PEN con tests · archivos: `lib/currency.ts`, `lib/currency.test.ts` · depende de: T1 · secuencial (base, `lib/`)
- [ ] T3 — Schemas y tipos de ofertas y tipo de cambio, con tests · archivos: `modules/trips/schemas/offers.schema.ts`, `modules/trips/schemas/offers.schema.test.ts`, `modules/trips/types/offers.types.ts` · depende de: T2 · secuencial
- [ ] T4 — `offers.service.ts` (CRM, transiciones, `getActiveOffer`, `getPublicOffer`) con tests · archivos: `modules/trips/services/offers.service.ts`, `modules/trips/services/offers.service.test.ts` · depende de: T3 · paralelo (con T5)
- [ ] T5 — `exchangeRates.service.ts` con tests · archivos: `modules/trips/services/exchangeRates.service.ts`, `modules/trips/services/exchangeRates.service.test.ts` · depende de: T3 · paralelo (con T4)

### Fase 2: CRM de ofertas y tipo de cambio (5 tareas, 16 archivos)
Requisito previo: F1 cerrada y la migración aplicada en la rama de Neon de pruebas.
- [ ] T1 — Acciones de ofertas y de tipo de cambio con tests · archivos: `modules/trips/actions/offers.actions.ts`, `modules/trips/actions/offers.actions.test.ts`, `modules/trips/actions/exchangeRates.actions.ts`, `modules/trips/actions/exchangeRates.actions.test.ts` · depende de: Fase 1 · paralelo (con T2)
- [ ] T2 — Utilidades de presentación de ofertas con tests · archivos: `modules/trips/utils/offerDisplay.ts`, `modules/trips/utils/offerDisplay.test.ts` · depende de: Fase 1 · paralelo (con T1)
- [ ] T3 — `OfferForm`, `OfferTable` y `OfferDetails` · archivos: `modules/trips/components/OfferForm.tsx`, `modules/trips/components/OfferTable.tsx`, `modules/trips/components/OfferDetails.tsx` · depende de: T1, T2 · paralelo (con T4)
- [ ] T4 — `ExchangeRateForm` y `ExchangeRateTable` · archivos: `modules/trips/components/ExchangeRateForm.tsx`, `modules/trips/components/ExchangeRateTable.tsx` · depende de: T1 · paralelo (con T3)
- [ ] T5 — API pública, páginas y menú:
  - exports de F1 y F2 en `index.ts`: lecturas, acciones, componentes, `offerDisplay` y tipos del contrato;
  - `/crm/ofertas`, `/crm/ofertas/nueva` y `/crm/ofertas/[id]`;
  - enlace "Ofertas" en `CrmShell`;
  - medir el Worker.

  Archivos: `modules/trips/index.ts`, `app/crm/(protected)/ofertas/page.tsx`, `app/crm/(protected)/ofertas/nueva/page.tsx`, `app/crm/(protected)/ofertas/[id]/page.tsx`, `modules/accounts/components/CrmShell.tsx` · depende de: T3, T4 · secuencial

### Fase 3: bloque financiero público (3 tareas, 11 archivos)
Requisito previo: F2 cerrada. La publicación en producción espera a las puertas P-L y P-T (textos provisionales; Pregunta abierta 1); la implementación no.
- [ ] T1 — Vista de la oferta (`toOfferView`, `getCatalogOffer`) y `TripLanding` sin campos de precio, con tests · archivos: `modules/landing/utils/catalogOffer.ts`, `modules/landing/utils/catalogOffer.test.ts`, `modules/landing/utils/catalogTrip.ts`, `modules/landing/utils/catalogTrip.test.ts` · depende de: Fase 2 · secuencial (base)
- [ ] T2 — `OfferSummary` y su uso en `TripDetail` (con el aviso sin oferta) y en `RaceRegistrationSection` (salvo el modo stand; «Ver el paquete completo» con `?c=`) · archivos: `modules/landing/components/OfferSummary.tsx` (nuevo), `modules/landing/components/TripDetail.tsx`, `modules/landing/components/RaceRegistrationSection.tsx` · depende de: T1 · secuencial
- [ ] T3 — Rutas y README:
  - API pública de `landing` (`getCatalogOffer`);
  - `/viajes/[slug]` y `/viajes/[slug]/registro` con `?c=`;
  - README "Qué usa hoy la landing";
  - verificación a 360 px, del modo stand y de las páginas sin oferta;
  - medir el Worker.

  Archivos: `modules/landing/index.ts`, `app/viajes/[slug]/page.tsx`, `app/viajes/[slug]/registro/page.tsx`, `README.md` · depende de: T2 · secuencial

### Fase 4: limpieza del catálogo (3 tareas, 10 archivos)
Requisito previo: F3 cerrada (la landing ya no lee los campos de precio de `trips`).
- [ ] T1 — `tripFormSchema`, `PublicTrip`, `publicColumns` y `editableColumns` sin los cinco campos de precio, con tests (incluido el fixture de `catalogTrip.test.ts`) · archivos: `modules/trips/schemas/trips.schema.ts`, `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/types/trips.types.ts`, `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts`, `modules/landing/utils/catalogTrip.test.ts` · depende de: Fase 3 · secuencial (base)
- [ ] T2 — `TripForm` y `TripTable` sin los campos ni la columna «Precio», con el test del formulario · archivos: `modules/trips/components/TripForm.tsx`, `modules/trips/components/TripForm.test.tsx`, `modules/trips/components/TripTable.tsx` · depende de: T1 · paralelo (con T3)
- [ ] T3 — README (el precio vive en las ofertas; columnas antiguas como referencia y cómo consultarlas); medir el Worker cuando T2 esté terminada · archivos: `README.md` · depende de: T1 · paralelo (con T2)

## Preguntas abiertas
1. **Textos y puertas P-L/P-T.** ¿Aprobar una versión en el CRM equivale a la aprobación comercial y legal de esa oferta, o hace falta además una revisión legal registrada aparte? Los textos de la regla del tipo de cambio y de los diálogos son provisionales. ¿Quién los aprueba y quién redacta las condiciones de cancelación que el admin cargará en cada oferta? Por defecto: la aprobación en el CRM es la del negocio, y los textos fijos se sustituyen en modo build cuando P-L y P-T los aprueben.
2. **Antigüedad del tipo de cambio.** Hoy el vigente es el último que se fijó, sin caducidad. ¿Quieres que la web deje de mostrar soles (o que el cobro se bloquee en `bookings-mercadopago`) si el tipo tiene más de N días? Por defecto, no caduca.
3. **Alcance de las ofertas de campaña.** Con esta spec, cualquiera que abra el enlace o el QR de una campaña ve y podrá usar su precio (el código es público). ¿Te sirve así, o el precio de campaña debe aplicarse solo a los leads atribuidos a esa campaña (`leads.campaign_id`), lo que se decidiría en `bookings-runner-self-service`?
4. **Intención en el registro.** Esta spec no guarda en el lead la oferta vista ni el anticipo elegido (Decisión 12): se reconstruye con la campaña, la fecha y el historial. ¿Lo confirmas, o quieres `leads.offer_version_id` (y quizá el anticipo preferido)? Eso exigiría enmendar `landing-omnichannel-capture.md`.
5. **Acompañante, cuotas y calendario.** `companion_price_usd` e `installments_price_usd` no pasan a la oferta, y el saldo tiene un solo vencimiento. ¿Se venden plazas de acompañante y pagos en varias cuotas en la Fase 1 del plan? Si es así, harían falta campos o una tabla de cuotas en una enmienda.
6. **Importes fijos de la portada.** `/` sigue mostrando «US$1,499», «US$1,799» y «Reserva con US$300» desde `TRIPS`, lo que choca con el bloqueante comercial. ¿Los retiramos ya con un cambio en modo build (2 o 3 archivos de `modules/landing`) o esperan a `public-official-site-content`?
7. **Cobro del saldo tras cerrar o vencer la oferta.** Esta spec interpreta que "una oferta inactiva o vencida no genera cobro" se refiere a **nuevas** reservas y anticipos. El saldo de una reserva ya hecha se rige por la versión que aceptó, aunque esa versión se haya cerrado después. ¿Es correcto? Lo aplicará `bookings-mercadopago`.
8. **Quién aprueba.** Hoy el mismo admin puede crear y aprobar una versión, y quedan registradas las dos personas. ¿Necesitas que apruebe otra persona distinta de quien la creó (cuatro ojos)?
