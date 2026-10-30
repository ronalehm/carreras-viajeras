# Enmienda: Stripe Checkout de reservas en producción

- Estado: aprobado
- Specs base: [bookings-stripe-checkout.md](bookings-stripe-checkout.md) y [bookings-stripe-checkout-card-only-amendment.md](bookings-stripe-checkout-card-only-amendment.md).
- Módulos: booking-checkout, contracts, bookings, trips, landing, accounts (enlace CRM).
- Rama: `claude/blissful-davinci-pfjo58`, creada desde `feat/stripe-checkout` y rebasada sobre `main`.
- Pedido del usuario: «debemos integrar a main de carreras viajeras, debes revisar todo y pasarlo a producción. nada pasa si no lo apruebo así: Sí, apruebo».
- Handoff de origen: [stripe-checkout-main-handoff.md](../stripe-checkout-main-handoff.md). Sus puertas de producción y criterios de aceptación siguen vigentes; esta enmienda las concreta en pantallas, lógica, base de datos y orden de operaciones.

## Objetivo

Convertir el Checkout de reservas, hoy limitado por diseño a sandbox, en un flujo que funcione en modo test (desarrollo) y en modo live (producción) con la misma lógica, sin componentes de demo. Debe quedar apagado en producción hasta que el usuario autorice cada operación productiva.

## Estado verificado de la rama

| Comprobación | Resultado |
| --- | --- |
| `npm ci` | Fallaba: el lockfile generado en Windows omitía `@emnapi/core` y `@emnapi/runtime`. Corregido regenerándolo desde `main` más `stripe`, `pg` y `@types/pg`. |
| `npm run lint` | Pasa. |
| `next typegen`, `tsc --noEmit` | Pasan. |
| Vitest | 3.433 pasan, 6 omitidos, 2 fallan en `modules/content` (enlaces de noticias con `#noticias`). No son de Stripe: vienen de `main`. |
| Migraciones 0000–0020 | Se aplican completas sobre PostgreSQL 16 local desechable. `drizzle-kit generate` no detecta diferencias entre schema y snapshot. |
| `build:worker` | Pasa en Linux con Node 24. El módulo de entorno empaquetado no contiene secretos. El bundle de `app/api/webhooks/stripe/route.js` incluye `node:sqlite` (demo): compila, pero no funciona en Workers. Compilar no acredita el webhook en ejecución. |

### Bloqueantes encontrados en la revisión

1. **No existe camino live.** Producción está bloqueada en el código, no por configuración:
   - `NODE_ENV !== "production"` en `bookingCheckout.service.ts`, `contracts.service.ts` y `app/viajes/[slug]/checkout/page.tsx`.
   - Solo se aceptan claves `sk_test_`.
   - `STRIPE_CHECKOUT_ORIGIN` solo admite `localhost:3001`.
   - Se exige `livemode === false` en el webhook y en las sesiones.
2. **El webhook productivo usa la demo.** `app/api/webhooks/stripe/route.ts` importa `modules/stripe-demo`:
   - Usa un ledger `node:sqlite` en `.stripe-sandbox/`, que no existe en Workers.
   - Responde 503 en producción.
   - Suscribe eventos de Billing/Radar ajenos a reservas.
   - La propia spec base dice que ese módulo «no sirve como almacenamiento del Worker».
3. **Un pago puntual puede quedar en `needs_review`.** La liquidación compara `reservation_expires_at > now()` en el momento de procesar el evento, no en el momento del pago. Cualquier reintento tardío de Stripe deja un pago válido sin aplicar.
4. **Intentos atascados.** Si `sessions.create` falla o la sesión vence sin webhook, el intento activo bloquea cualquier intento nuevo del mismo tipo. En el saldo el bloqueo es permanente. Además, un reintento tardío envía un `expires_at` inferior al mínimo de 30 minutos de Stripe.
5. **Saldos inconsistentes.** El portal del corredor suma liquidaciones Stripe, pero el CRM de reservas (`bookings.service.ts`) solo suma `booking_payments`: una reserva pagada con Stripe aparece sin pagar en el CRM.
6. **Orden de despliegue.** Cada merge en `main` despliega con Workers Builds. El portal, el CRM y el directorio de usuarios leerán las columnas nuevas de `bookings` y la tabla `booking_stripe_settlements`. Si se mergea sin la 0020 en Neon `production`, esas pantallas fallan.
7. **Aprobaciones sin registro.** `docs/specs/approvals.jsonl` no tiene entradas para las specs de Stripe. La spec base figura como aprobada, pero esa aprobación no se puede comprobar en esta máquina, y la enmienda card-only sigue en borrador aunque ya está implementada.

## Puertas previas fuera del código

No las resuelve ninguna tarea de esta spec y bloquean el go-live, no el merge con Checkout apagado:

- **Elegibilidad Stripe.** Debe confirmarse la entidad legal y el país de la cuenta que recibe los fondos. Stripe no admite hoy empresas de Perú. Si la entidad es peruana, no hay go-live hasta una alternativa válida verificada con Stripe.
- **Contrato legal.** Hace falta un contrato aprobado por legal y comercial. Los `docs/contracts/santiago-2027-v1*.md` son borradores de sandbox.
- **Obligaciones fiscales.** Definir comprobantes, reembolsos y conciliación. Stripe Tax queda apagado.

## Pantallas

| Pantalla | Usuario | Hoy | Debe quedar |
| --- | --- | --- | --- |
| Ficha de carrera `/viajes/ficha_viaje/registro` (bloque de oferta en `RaceRegistrationSection`) | Público | El botón «Continuar al checkout» depende de `isCheckoutSandboxEnabled()` evaluado al prerenderizar, con textos «sandbox». | El botón se decide por petición según `getStripeCheckoutConfig().enabled` y la existencia de una oferta válida. Textos de producción sin «sandbox». Sin oferta válida, igual que hoy. |
| Checkout `/viajes/[slug]/checkout` (`RunnerCheckout`) | Corredor con correo verificado | Pasos: elegir total o anticipo → identidad Clerk → contrato → resumen USD/PEN/tasa → Stripe → retorno con consulta de estado. `notFound()` en producción. Consulta la base antes de la puerta. | Mismos pasos. Puerta por configuración antes de cualquier consulta. Si ya existe la reserva activa, se retoma en lugar de mostrar `booking_exists`. Un intento vencido permite iniciar uno nuevo en lugar de «Contacta al equipo». Mensajes de error con referencia (`requestId`). Aviso de documento de prueba solo en modo test. |
| Retorno de Stripe (mismo checkout con `return=success` o `cancelled=1`) | Corredor | Solo consulta el estado del servidor (correcto). | Sin cambios de lógica; textos «procesando», «confirmado», «en revisión» y «vencido» con acción posible. |
| Portal `/mis-carreras` | Corredor | Suma las liquidaciones `applied` y ofrece «Pagar saldo». Muestra también reservas `pending` abandonadas y `cancelled`. | Usa el saldo común (ver Lógica E). Oculta las reservas de checkout `cancelled` sin pagos. Indica «Pago en revisión» si hay `needs_review`. |
| CRM `/crm/contratos` (`ContractManager`) | `admin`, `super_admin` (`offers.manage`) | Solo funciona con el flag sandbox. | Funciona en producción con `offers.manage`. En producción solo se usan versiones `approved`. Decisión abierta: separar creación y aprobación entre personas distintas. |
| CRM de reservas (`/crm/reservas` y fichas) | Staff según permisos actuales | El saldo solo incluye pagos manuales. | El saldo y el historial incluyen las liquidaciones Stripe `applied`, con la fuente «Stripe», y marcan las `needs_review` para conciliación. No se crea una copia manual del pago. |

## Lógica

### A. Configuración y modo (`lib/env.ts`)

- Añadir `getStripeCheckoutConfig()`, validado de forma perezosa con Zod como el resto de `getEnv()`. Lee:
  - `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` (Secrets).
  - `STRIPE_CHECKOUT_ENABLED` (var de texto, `"false"` por defecto).
  - Opcionalmente `STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS`.
- El modo se deriva del prefijo de la clave: `sk_test_`/`rk_test_` es test y `sk_live_`/`rk_live_` es live.
- En `NODE_ENV=production`, `enabled` exige:
  - modo live;
  - `APP_ORIGIN` HTTPS de producción;
  - `STRIPE_WEBHOOK_SECRET` presente;
  - bypass de borradores ausente.
- Si falta cualquiera, el resultado es `enabled: false` y se registra el motivo, sin valores.
- En desarrollo se exige modo test.
- Se elimina `STRIPE_CHECKOUT_ORIGIN`: las URLs de retorno usan `APP_ORIGIN`, el mismo valor que valida el Origin de los POST.
- `livemode` de eventos, sesiones y PaymentIntents debe coincidir con el modo; si no coincide, error y sin cambios en datos.

### B. Webhook (`modules/booking-checkout`)

- Mover el dispatcher a `modules/booking-checkout/services/stripeWebhook.service.ts` y exportarlo por la API pública. `app/api/webhooks/stripe/route.ts` importa de `@/modules/booking-checkout`.
- Eliminar `modules/stripe-demo` y el ledger `node:sqlite`.
- Firma: sobre el cuerpo crudo como `Buffer`, con límite de 512 KB. Firma ausente o inválida → 400. Webhook no configurado → 503 sin revelar el motivo.
- Eventos que procesa:
  - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` y `payment_intent.succeeded`, con la lógica actual: CTE atómica, deduplicación por id de evento y liquidación única por intento, sesión y PaymentIntent.
  - `charge.refunded` y `charge.dispute.created` (decisión abierta 1): por defecto, se marca la liquidación como `needs_review` y se registra una alerta, sin revertir la reserva automáticamente.
- Cualquier otro evento, o uno sin intento local → 200 `ignored`, sin crear reserva ni pago.
- La regla de vigencia compara `reservation_expires_at` con `paid_at` (momento del pago informado por Stripe), no con `now()`.
- Log estructurado por evento: id de evento, tipo, id de intento, id de reserva y resultado (`applied`, `needs_review`, `ignored`, `duplicate`, `error`). Sin PII, importes de tarjeta ni payload.

### C. Creación de la sesión (`checkoutSession.service.ts`)

- Antes de reutilizar un intento activo:
  - un intento `pending` sin sesión pasado su vencimiento se marca `failed`;
  - un intento `created` cuya sesión Stripe ya no está `open` se marca `expired` o `failed`;
  - en ambos casos se libera la capacidad retenida.
- Después se crea un intento nuevo.
- `expires_at` de la sesión se calcula al crearla (mínimo 30 minutos y máximo 24 horas) y se alinea con `reservation_expires_at`.
- Clave de idempotencia estable por intento y solo tarjeta: se conservan como están.
- Validación con Zod de `bookingId` y `attemptId` como UUID → 404 si no lo son. Un índice de pago inexistente → 400 `invalid_payment_choice`.
- `prepare` con una reserva activa del mismo viaje y correo → devuelve esa reserva para retomarla.
- La respuesta de `prepare` se reduce a lo necesario: un solo cuerpo de contrato y sin `rateId`.

### D. Contratos (`modules/contracts`)

- En modo live solo se usan versiones `approved` cuya `terms_version` coincide con la oferta.
- El bypass de borradores solo existe en modo test, con el flag explícito y el prefijo de documento de prueba (como hoy).
- El CRM de contratos deja de depender del flag sandbox; sigue protegido por `offers.manage` en la página y en cada Server Action.

### E. Saldo común (`modules/bookings`)

- Una función `getBookingBalance(bookingIds)` calcula pagado = `booking_payments` + `booking_stripe_settlements` con estado `applied`. El saldo es el total menos lo pagado.
- La usan el portal y el CRM de reservas.
- Las liquidaciones `needs_review` no cuentan como pagado y se listan aparte.

### F. Errores y trazabilidad

- Cada respuesta de error lleva `{ code, requestId }`, y el log registra el mismo `requestId`, sin stack, SQL ni secretos.
- Códigos: `contract_unavailable`, `rate_unavailable`, `offer_unavailable`, `booking_exists`, `attempt_expired`, `invalid_payment_choice`, `stripe_unavailable` e `internal`.

### G. Separación de alcance

- Fuera de este cambio, en otra rama, quedan:
  - el ejemplo Connect: `scripts/stripe-connect-sandbox-example*.mjs`, `docs/specs/stripe-connect-sandbox-example.md` y su plan;
  - `scripts/test-stripe-webhook-replay.mjs`, si depende de la demo.
- `docs/contracts/santiago-2027-v1*.md` queda fuera del flujo productivo. Si se conserva, va como muestra de sandbox documentada.
- `docs/specs/stripe-checkout-sandbox.md` sigue como borrador histórico; no se implementa.

## Base de datos

### 0020 (`drizzle/0020_stripe_booking_checkout.sql`), revisada

| Objeto | Propósito |
| --- | --- |
| Enums `booking_checkout_attempt_kind`, `booking_checkout_attempt_status`, `booking_stripe_settlement_status`, `contract_version_status` y `offer_capacity_allocation_status` | Estados de intentos, liquidaciones, contratos y cupos. |
| `booking_checkout_attempts` | Un intento por cobro (inicial o saldo): importe USD/PEN, tasa, sesión Stripe e idempotencia. Índice único parcial de un intento activo por reserva y tipo. |
| `booking_contract_acceptances` | Aceptación de una versión exacta del contrato por el corredor, con fecha. |
| `booking_stripe_event_receipts` | Id de evento Stripe único (deduplicación). |
| `booking_stripe_settlements` | Liquidación única por intento, sesión y PaymentIntent; esperado frente a recibido; `applied` o `needs_review`. |
| `contract_versions` | Versiones del contrato (`draft`, `approved`). |
| `offer_capacity_counters`, `offer_capacity_allocations` | Cupos de la oferta retenidos, confirmados o liberados. |
| `bookings` con 14 columnas nuevas, todas NULL, y 2 checks | Instantánea de la oferta aceptada, tasa, importe PEN, `request_id`, hash de entrada y vencimiento de la reserva. |

La 0020 es aditiva y compatible con el código actual de `main`:

- Las columnas nuevas admiten NULL y las filas existentes cumplen los checks.
- `booking_payments` no cambia.
- No toca `neon_auth` ni reescribe migraciones previas.

Por eso puede aplicarse en producción **antes** del merge sin afectar al sitio.

Hay un detalle menor: PostgreSQL trunca a 63 caracteres los nombres de las FK de `booking_stripe_event_receipts` y `booking_stripe_settlements` hacia `booking_checkout_attempts`. Funciona, pero el nombre en la base difiere del que espera Drizzle. Se corrige en la 0021.

### 0021 propuesta (`drizzle/0021_stripe_checkout_production.sql`)

- Índice `booking_stripe_settlements (booking_id)`, que usan el portal y el CRM.
- Renombrar las dos FK truncadas a nombres de 63 caracteres o menos, declarados también en `lib/db-schema.ts`.
- Si se aprueba la decisión 1: columnas `refunded_at` y `disputed_at` (NULL) en `booking_stripe_settlements`, en lugar de nuevos valores de enum.
- Eliminar el check trivial `bookings_created_by_or_runner_chk`, que siempre es verdadero porque `created_by` es NOT NULL desde la 0003.
- Se genera con `npm run db:generate`, se revisa y se aplica a mano. Debe ser también aditiva y compatible con `main`.

## Procedimiento de migración y despliegue

El orden es obligatorio. Cada paso marcado con «Sí, apruebo» necesita esa autorización explícita del usuario para ese paso; la aprobación de uno no autoriza los demás.

1. **Rama de ensayo.** Crear en Neon una rama desechable desde `production`.
2. **Comprobar la base.** En esa rama, comparar el esquema con el estado que exige la 0020: tablas de la 0000–0019 presentes y objetos de Stripe ausentes. Aplicar 0020 y 0021, cada una entre `BEGIN; … COMMIT;`, sin `drizzle-kit migrate` ni historial ficticio.
3. **Verificar el ensayo.** Revisar con consultas de solo lectura los objetos, constraints e índices. Arrancar la app contra esa rama y comprobar el portal, el CRM de reservas y el directorio de usuarios.
4. **«Sí, apruebo» (migración).** Aplicar 0020 y 0021 en Neon `production` con `DATABASE_MIGRATION_URL`, que la opera el usuario o un agente con ese alcance autorizado. Verificar con las mismas consultas y registrar el resultado en el README.
5. **Secretos.** En Cloudflare se cargan `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` como **Secret**. `STRIPE_CHECKOUT_ENABLED: "false"` va en `vars` de `wrangler.jsonc`. Ningún valor va al repositorio.
6. **«Sí, apruebo» (merge).** Mergear el PR en `main`. Workers Builds despliega con el Checkout apagado. Verificar `/api/health`, `/mis-carreras` y el CRM de reservas y contratos, y confirmar que el checkout responde 404.
7. **Webhook live.** En Stripe Dashboard (modo live), registrar `<APP_ORIGIN>/api/webhooks/stripe` con los eventos de la sección B y cargar su secreto en Cloudflare. Comprobar con «Send test event» que se responde 200 `ignored`.
8. **Contenido.** En `/crm/contratos`, crear y aprobar el contrato legal real para la `terms_version` de la oferta.
9. **«Sí, apruebo» (activación).** Cambiar `STRIPE_CHECKOUT_ENABLED` a `"true"` (PR con el cambio en `wrangler.jsonc` y su merge). Hacer un pago live controlado de importe mínimo con un corredor interno, verificar la liquidación `applied` y el saldo, y reembolsarlo desde Dashboard.
10. **Reversión.** `STRIPE_CHECKOUT_ENABLED: "false"` y volver a la versión anterior del Worker. No se borran tablas ni datos de pago. La 0020 y la 0021 son compatibles con el código anterior.

## Plan de tareas

Cada fase tiene hasta cinco tareas y unos quince archivos. Paquetes, schema, `lib/` y exports van en secuencia.

### Fase 1: separación y webhook

- [ ] 1.1 Retirar de esta rama el ejemplo Connect, el script de replay de la demo y `modules/stripe-demo`. Cuando corresponda, llevarlos a una rama propia.
- [ ] 1.2 `getStripeCheckoutConfig()` en `lib/env.ts` con sus tests (modos test/live, producción y fallo cerrado).
- [ ] 1.3 `stripeWebhook.service.ts` en booking-checkout: firma, modo, eventos de la sección B, `ignored` y log estructurado. Nueva ruta `app/api/webhooks/stripe/route.ts`.
- [ ] 1.4 Vigencia contra `paid_at` en `bookingWebhook.service.ts` y tests de expired, async_failed, async_succeeded, `payment_intent.succeeded`, mismatch de importe y moneda, y refund/dispute.

### Fase 2: creación de la sesión y contratos

- [ ] 2.1 Sustituir las puertas `NODE_ENV`/sandbox por `getStripeCheckoutConfig()` en booking-checkout, contracts y páginas, con la puerta antes de cualquier consulta. Usar `APP_ORIGIN` en lugar de `STRIPE_CHECKOUT_ORIGIN`.
- [ ] 2.2 Intentos vencidos o sin sesión, `expires_at` recalculado y retomar `booking_exists`.
- [ ] 2.3 Validación de UUID, `invalid_payment_choice`, respuesta de `prepare` reducida y `{ code, requestId }`.

### Fase 3: pantallas y saldos

- [ ] 3.1 `RunnerCheckout` y el bloque de oferta de la landing: textos de producción, estados con acción, referencia de error y enlace evaluado por petición.
- [ ] 3.2 `getBookingBalance` en bookings, usado por el portal y el CRM de reservas, con indicador «Stripe» y «en revisión».
- [ ] 3.3 0021 y `lib/db-schema.ts`. Aplicar 0000–0021 en PostgreSQL desechable y comprobar que no hay diferencias en `db:generate`.

### Fase 4: validación y documentación

- [ ] 4.1 lint, Vitest, typegen, `tsc` y `build:worker`, más la comprobación de que el módulo de entorno empaquetado no contiene `STRIPE_*` secretos.
- [ ] 4.2 Prueba funcional en modo test (Clerk de desarrollo y Neon de desarrollo) de pago total, anticipo, saldo, cancelación, vencimiento y replay de un evento.
- [ ] 4.3 README: variables, procedimiento de migración y despliegue de esta spec, y operación (alertas `needs_review`, conciliación y reversión).

## Aceptación

- No existe ninguna referencia a `modules/stripe-demo`, `node:sqlite` ni `STRIPE_CHECKOUT_ORIGIN` en el código de producción.
- Con `NODE_ENV=production`, el Checkout está apagado si falta una variable, si la clave es test, si el origen no es el HTTPS de producción o si el bypass de borradores está activo. Con clave live y flag activado, funciona.
- Un webhook live firmado de un evento no relacionado responde 200 `ignored`; firmado y relacionado aplica una sola liquidación; con firma inválida responde 400; con un error de base de datos responde 5xx y un reintento lo completa.
- Un pago completado antes de `reservation_expires_at` y procesado después queda `applied`.
- Un intento vencido no impide pagar de nuevo el inicial ni el saldo.
- El CRM de reservas y el portal muestran el mismo saldo para una reserva con pagos manuales y de Stripe.
- La 0020 y la 0021 se aplican sobre una rama de ensayo de `production` y la app funciona contra ella antes de cualquier merge.
- Checks de CI en verde en el PR.

## Decisiones abiertas

1. Refund o disputa: marcar `needs_review` y alertar (propuesto) o revertir automáticamente el estado de la reserva.
2. Contratos: separar quién crea y quién aprueba una versión (propuesto para el contrato legal) o mantener un solo rol.
3. Las dos pruebas de noticias que fallan en `main`: se corrigen en un cambio aparte, no en esta rama.

## Aprobaciones necesarias

- `apruebo docs/specs/bookings-stripe-checkout-production.md` para implementar las fases 1–4. Si se mantienen como base, también `apruebo docs/specs/bookings-stripe-checkout.md` y `apruebo docs/specs/bookings-stripe-checkout-card-only-amendment.md`, para que su aprobación quede registrada en esta máquina.
- «Sí, apruebo» independiente para cada operación productiva: migración (paso 4), merge (paso 6) y activación (paso 9).
