# Integración de Stripe Checkout con Stripe Connect

Fecha: 30 de octubre de 2026. Documento de análisis y guía de pasos. **No es una spec ni autoriza implementación:** nada de esto está implementado, migrado, configurado en Stripe ni desplegado. La implementación es trabajo SDD (`docs/SETUP.md` §3: nueva funcionalidad, rutas nuevas con datos, varias capas y más de tres archivos) y requiere una spec en `Estado: borrador` aprobada expresamente por el usuario con `apruebo docs/specs/<slug>.md`.

Este documento recoge tres cosas: el estado del proyecto respecto a pagos, la decisión sobre sincronizar los productos con Stripe y la secuencia de pasos para cobrar con Stripe Checkout mediante Stripe Connect.

> **Verificación pendiente.** Durante la redacción, la red de la sesión no permitió abrir `docs.stripe.com`. Los datos de Stripe proceden de fragmentos de su documentación obtenidos por búsqueda y del conocimiento previo de la API. Los puntos marcados **[verificar]** deben contrastarse con la referencia oficial antes de redactar la spec. La disponibilidad por país y las tarifas cambian con frecuencia.

## Índice

1. [Estado actual del proyecto](#1-estado-actual-del-proyecto)
2. [¿Sincronizar los productos de la base de datos con Stripe?](#2-sincronizar-los-productos-de-la-base-de-datos-con-stripe)
3. [Bloqueantes y decisiones previas](#3-bloqueantes-y-decisiones-previas)
4. [Arquitectura propuesta](#4-arquitectura-propuesta)
5. [Cambios de datos propuestos](#5-cambios-de-datos-propuestos)
6. [Pasos a seguir](#6-pasos-a-seguir)
7. [Código de referencia](#7-código-de-referencia)
8. [Seguridad, privacidad y operación](#8-seguridad-privacidad-y-operación)
9. [Uso del plugin de Stripe](#9-uso-del-plugin-de-stripe)
10. [Preguntas abiertas](#10-preguntas-abiertas)
11. [Fuentes](#11-fuentes)

## 1. Estado actual del proyecto

**No existe ninguna integración de pago.** Stripe no aparece en el código ni en las dependencias. Los cobros los registra el equipo a mano en el CRM.

| Área | Estado vigente | Referencia |
| --- | --- | --- |
| Fuente del precio | `trip_offers`: oferta versionada por viaje y campaña opcional, con estados `draft → approved → active → closed`. Una versión aprobada no se edita. | `lib/db-schema.ts:423` |
| Importes | Enteros en **dólares completos**: sin céntimos ni columna de moneda. `final_price_usd` es una columna generada (`total − discount`). | `lib/db-schema.ts:449` |
| Abonos | `deposit_options_usd` (de 0 a 3 opciones) y un único `balance_due_on`. No hay cuotas. | `trip_offers` |
| Moneda local | Soles (PEN) solo para mostrar, con el tipo `exchange_rates.usd_pen` que fija el equipo. `usdToPenCents` redondea de forma exacta. | `lib/currency.ts` |
| Resolución de la oferta | La decide el servidor (`getActiveOffer` / `getPublicOffer`); el navegador solo aporta `?c=`. Ningún importe llega del cliente. | `modules/trips/services/offers.service.ts:412` |
| Reservas | `bookings`: un participante por viaje, estados `pending → confirmed → cancelled`, `total_usd` entero. **Solo se crean desde el CRM.** No hay `offer_version_id`. | `lib/db-schema.ts:903`, `modules/bookings/services/bookings.service.ts:98` |
| Pagos | `booking_payments`: pagos manuales confirmados, idempotentes por `(booking_id, request_key)`. Sin proveedor, método ni moneda. `recorded_by` es obligatorio y apunta a `profiles`. El saldo se calcula al leer. | `lib/db-schema.ts:985`, `modules/bookings/services/payments.service.ts:31` |
| Descuentos | Se aplican en Neon (`cv_apply_booking_reward`, `cv_apply_welcome_code`): rebajan `total_usd` y dejan registro en `booking_benefits`. Exigen una reserva sin pagos. El código de bienvenida aún no se aplica desde la app (Fase 2 abierta). | `drizzle/0012_reward_operations.sql`, `drizzle/0019_welcome_discount.sql` |
| Capacidad | `capacity_limit` se guarda en la oferta, pero ninguna reserva descuenta plazas. | `trip_offers` |
| Portal del runner | `/mis-carreras` vincula reservas por correo primario **verificado** y después autoriza solo por `runner_user_id`. | `modules/bookings/services/runnerPortal.service.ts:42` |
| Outbox | `outbox_events` exige `lead_id NOT NULL` y un tipo de un enum cerrado. No sirve tal cual para eventos de pago. | `lib/db-schema.ts:699` |
| Organizadores | El rol `organizer` gestiona solo sus viajes (`trips.organizer_id`). Es la candidata natural a cuenta conectada. | README, «Rol organizador» |
| Web pública | El bloque de precio no tiene botón de pago y las FAQ dicen «No se reciben pagos en esta web». Quedan precios fijos en la landing. | `modules/landing/components/FaqSection.tsx:55`, `modules/landing/utils/trips.ts:43` |
| Plan aprobado | Las specs aprobadas prevén **Mercado Pago Checkout Pro** en una spec futura, `bookings-mercadopago`, que no está escrita. | `docs/specs/trips-commercial-offers.md:5,36,470` |
| Runtime | Cloudflare Workers con OpenNext, `nodejs_compat` y `global_fetch_strictly_public`. Los secretos se cargan con `wrangler secret put`, y `scripts/strip-env-secrets.mjs` deja en el artefacto solo las claves `NEXT_PUBLIC_*`. | `wrangler.jsonc`, `scripts/strip-env-secrets.mjs` |

**Consecuencia:** el primer paso con Stripe no es «poner un botón de pago». Primero hay que:

- registrar pagos automáticos, no solo manuales;
- saber qué versión de oferta aceptó la reserva;
- decidir a qué cuenta conectada va el dinero.

## 2. ¿Sincronizar los productos de la base de datos con Stripe?

**Recomendación: no sincronizar el catálogo.** Neon sigue siendo la única fuente de verdad de viajes, ofertas, descuentos y saldos. Cada Checkout Session se crea con `line_items[].price_data`, un precio en línea que calcula el servidor en el momento del cobro. Stripe guarda la transacción; nuestra base guarda la referencia a Stripe.

Motivos:

1. **El precio ya está versionado y sujeto a aprobación en Neon.** Una oferta pasa por borrador, aprobación, activación y cierre, se define por viaje y campaña, y no se edita tras aprobarse. Replicarla como `Product` + `Price` crearía una segunda fuente de verdad que habría que mantener alineada con cada versión, cierre y sustitución (`superseded_by`).
2. **El importe a cobrar es por reserva, no por producto.** Se cobra un abono elegido entre `deposit_options_usd`, el saldo restante o el total, ya descontados los beneficios de `booking_benefits`. Ese importe no existe como precio de catálogo: se deriva de la reserva y de sus pagos.
3. **Los descuentos se aplican en SQL con bloqueo de fila.** Usar cupones de Stripe duplicaría la lógica y abriría dos caminos para el mismo descuento. El importe enviado a Stripe ya debe ser el neto.
4. **Los `Price` de Stripe no se pueden editar.** Cada cambio exige un `Price` nuevo y archivar el anterior. Es justo lo que ya resuelve `trip_offers`, sin la sincronización bidireccional ni el riesgo de desfase.
5. **Checkout Sessions con `price_data` es la vía documentada para importes dinámicos.** No requiere objetos de catálogo previos.

Qué sí guardar y enviar:

| Dirección | Qué | Para qué |
| --- | --- | --- |
| Neon → Stripe | `metadata` con identificadores opacos: `booking_id`, `payment_attempt_id`, `offer_version_id`. Nunca datos personales ni notas. | Conciliación y soporte desde el dashboard. |
| Neon → Stripe | `product_data.name` descriptivo (por ejemplo «Maratón de Santiago 2027 · Abono»). | Lo ve el cliente en Checkout y en el recibo. |
| Stripe → Neon | `checkout_session_id`, `payment_intent_id`, id de cuenta conectada, importes cobrados y comisión. | Idempotencia, reembolsos y auditoría. |

Excepción opcional, no necesaria para empezar: si más adelante se quiere ver en Stripe la facturación agregada por viaje, se puede crear **de forma perezosa** un `Product` por viaje y guardar su id en `trips` (por ejemplo `stripe_product_id`). Las sesiones seguirían usando `price_data.product = <id>` con importe en línea. Ni siquiera en ese caso se crean `Price` fijos por oferta.

## 3. Bloqueantes y decisiones previas

Resuélvelas antes de escribir la spec; varias son de negocio o legales, no de código.

### 3.1 País de la cuenta de plataforma (bloqueante)

El negocio opera en Perú (Decisión 6 de la spec de ofertas, zona `America/Lima`). **Perú no figura entre los países donde Stripe abre cuentas de empresa para aceptar pagos** [verificar en la página de disponibilidad global]: en Latinoamérica la lista completa incluye México y Brasil.

La cuenta de **plataforma** debe pertenecer a una entidad legal de un país soportado; la opción habitual es una sociedad en EE. UU. Esta decisión fiscal y contable sale del alcance del código: hay que validarla con contabilidad y asesoría legal antes de seguir. Si la plataforma no puede abrirse en un país soportado, Stripe deja de ser viable y conviene retomar Mercado Pago (o Culqi o Izipay) como ya preveían las specs.

### 3.2 Cuentas conectadas en Perú

Si las cuentas conectadas (organizadores) están en Perú, solo pueden participar como **receptores de pagos transfronterizos**: Stripe añadió Perú a los destinos de *cross-border payouts* en 2026 [verificar estado vigente y requisitos de la plataforma]. Eso implica:

- configuración `recipient` en Accounts v2 (el acuerdo de servicio de receptor del API v1), con capacidad de **transferencias, no de pagos con tarjeta**;
- la cuenta conectada **no puede ser el comerciante registrado**: no se usa `on_behalf_of` ni cargos directos;
- tipos de cargo válidos: **cargos de destino sin `on_behalf_of`** o **cargos y transferencias separados**;
- la plataforma es el comerciante registrado: su nombre aparece en el extracto, asume disputas y fraude, y paga las comisiones de Stripe.

Si los organizadores tuvieran una entidad en un país soportado, se podría añadir la configuración `merchant` y usar `on_behalf_of`. Ese escenario no es el base de este documento.

### 3.3 Las specs aprobadas prevén Mercado Pago

`trips-commercial-offers.md` (aprobada) nombra Mercado Pago Checkout Pro como paso de pago y reserva el nombre `bookings-mercadopago`. **No se modifica esa spec.** Se escribe una spec nueva en borrador, por ejemplo `docs/specs/bookings-stripe-checkout.md`, que declare de forma explícita que sustituye la parte de pasarela prevista para `bookings-mercadopago`. Así se ha hecho antes con `accounts-clerk-rbac.md` y con `crm-journey-automation.md`.

El contrato de las líneas 470–473 de esa spec sigue vigente y la nueva spec debe respetarlo:

- `bookings.offer_version_id`;
- `total_usd = final_price_usd`;
- un abono elegido dentro de `deposit_options_usd`;
- cada intento de pago guarda una instantánea del tipo de cambio.

### 3.4 Moneda de cobro

Cobrar en **USD**, que es la moneda en la que se almacenan los importes. Para pasar a la unidad mínima de Stripe basta multiplicar por 100 (dólar entero → céntimos) sin redondeos. Los soles siguen siendo informativos y se muestran antes de pagar con `usdToPenCents`.

Cobrar en PEN exigiría:

- añadir céntimos y moneda al modelo;
- comprobar si PEN es moneda de presentación para el país de la plataforma [verificar];
- asumir la conversión al liquidar.

Esto queda fuera de la primera entrega.

### 3.5 Condiciones comerciales pendientes

El README y la spec del portal dejan sin definir las condiciones de la reserva (importe, plazo, reembolso). Un cobro en línea las necesita escritas y aceptadas: la spec `bookings-contract-acceptance` prevista, o como mínimo un `terms_version` mostrado en Checkout mediante `consent_collection` / `custom_text` [verificar parámetros]. También hay que decidir la **comisión de la plataforma** por organizador o por viaje (sección 10).

## 4. Arquitectura propuesta

### 4.1 Elección del tipo de cargo

| Tipo de cargo | Comerciante registrado | Compatible con receptores en Perú | Encaje |
| --- | --- | --- | --- |
| Directo (cobro en la cuenta del organizador) | Organizador | No | Descartado. |
| **De destino** (`transfer_data.destination` + `application_fee_amount`) | **Plataforma** | **Sí, sin `on_behalf_of`** | **Recomendado**: una reserva tiene un único organizador y Checkout lo admite de forma nativa. |
| Cargos y transferencias separados (`transfer_group` + `transfers.create`) | Plataforma | Sí | Para más adelante, si un pago se reparte entre varios receptores o la transferencia se aplaza (por ejemplo, hasta la fecha del viaje). |

Con el cargo de destino, Stripe cobra en la cuenta de la plataforma y transfiere de inmediato el importe menos `application_fee_amount` al saldo pendiente de la cuenta conectada. Las comisiones de Stripe se descuentan del saldo de la plataforma, así que la comisión de la plataforma debe cubrirlas.

> **Retener los fondos hasta el viaje.** Una agencia que cobra meses antes del viaje puede preferir no transferir al organizador hasta cerca de la fecha. Con cargos de destino la transferencia es inmediata, aunque se puede retrasar el *payout* de la cuenta conectada con su calendario de payouts [verificar]. Si el negocio exige retener el dinero en la plataforma, conviene usar cargos y transferencias separados desde el principio. Es una decisión de la sección 10.

### 4.2 Cuentas conectadas: Accounts v2

Stripe recomienda **Accounts v2** para las plataformas nuevas: una sola cuenta con configuraciones `merchant`, `customer` y/o `recipient`, y las responsabilidades (quién cobra las comisiones y quién asume las pérdidas) declaradas en la cuenta. La configuración propuesta es esta [verificar nombres exactos de campos en la referencia de `/v2/core/accounts`]:

- `configuration.recipient` con la capacidad de transferencias al saldo de Stripe;
- `defaults.responsibilities.fees_collector = application` y `losses_collector = application`: la plataforma cobra las comisiones y asume las pérdidas;
- `dashboard = express`, para que el organizador vea sus transferencias y payouts sin gestionar pagos;
- **onboarding alojado por Stripe** mediante Account Links v2 (`use_case: account_onboarding`). Stripe recoge los datos KYC: no se guardan documentos ni cuentas bancarias en Neon.

Si alguna pieza necesaria no estuviera disponible aún en v2 para receptores transfronterizos, se usa v1 con propiedades de controlador (`controller.fees.payer = application`, `controller.losses.payments = application`, `controller.stripe_dashboard.type = express`, `tos_acceptance.service_agreement = recipient`) [verificar]. En ese caso se elige una sola versión de la API de cuentas para toda la integración.

### 4.3 Flujo de la primera entrega (MVP)

Para no depender de la autoreserva (`bookings-runner-self-service`), que aún no existe, el MVP cobra **reservas ya creadas en el CRM** desde el portal del runner:

```mermaid
sequenceDiagram
    participant C as Comercial (CRM)
    participant R as Runner (/mis-carreras)
    participant W as Worker (Next)
    participant N as Neon
    participant S as Stripe
    participant O as Organizador (cuenta conectada)

    C->>N: crea la reserva pending con offer_version_id
    R->>W: "Pagar abono" o "Pagar saldo" (Server Action, sesión Clerk)
    W->>N: valida la propiedad y calcula el importe; crea payment_attempt
    W->>S: checkout.sessions.create (price_data, transfer_data.destination, application_fee_amount, idempotencyKey)
    S-->>W: url de la sesión
    W-->>R: redirect 303 a Stripe Checkout
    R->>S: paga
    S->>W: webhook checkout.session.completed (firmado)
    W->>N: registra el pago y el evento en una sola operación, reconcilia recompensas
    S->>O: transferencia automática (importe − comisión)
    R->>W: vuelve a success_url y ve el estado leído de Neon
```

Principios:

- **El webhook es la única fuente de verdad del pago.** La página de éxito solo muestra el estado leído de Neon; nunca registra pagos.
- **El importe lo calcula el servidor** a partir de la reserva, la oferta aceptada y los pagos no anulados. El formulario solo envía el id de la reserva y el tipo de pago (abono, opción N o saldo), validados con Zod.
- El actor y la propiedad se obtienen de la sesión (`runner_user_id`), como en el resto del portal.
- Confirmar la reserva sigue siendo una acción del equipo hasta que exista la aceptación del contrato. El pase automático a `paid` del lead es una mejora posterior (`crm-journey-automation.md:43`).

## 5. Cambios de datos propuestos

Propuesta para la spec. Las migraciones se generan con `npm run db:generate`, se revisan y se aplican a mano: primero en una rama de desarrollo de Neon y después en `production` con autorización.

| Cambio | Detalle |
| --- | --- |
| `bookings.offer_version_id` | FK a `trip_offers(id)`, previsto por la spec de ofertas. Nulo en reservas antiguas; obligatorio para cobrar en línea. |
| Tabla `organizer_payout_accounts` (nombre por decidir) | `user_id` (FK a `profiles`, único), `stripe_account_id` (único), `status` (`pending`, `active`, `restricted`, `disabled`), `transfers_active bool`, `requirements_due bool`, marcas de tiempo. Sin datos bancarios ni KYC. |
| Comisión de plataforma | `application_fee_bps` (puntos básicos) o un importe fijo por viaje u organizador. Definirlo en la spec (sección 10). |
| Tabla `payment_attempts` | `booking_id`, `kind` (`deposit`, `balance`, `full`), `amount_usd int`, `currency 'usd'`, `application_fee_cents`, `destination_account_id`, `offer_version_id`, `exchange_rate_id`, `usd_pen`, `pen_cents` (instantánea exigida por la spec de ofertas), `stripe_checkout_session_id` único, `stripe_payment_intent_id` único y nulo, `status` (`open`, `paid`, `expired`, `failed`, `refunded`, `partially_refunded`), `expires_at`, `created_by` (runner). Un intento abierto por reserva (índice único parcial). |
| `booking_payments` | Añadir `provider` (`manual` \| `stripe`, por defecto `manual`) y `payment_attempt_id` único y nulo. Hoy `recorded_by` es `NOT NULL` contra `profiles`: un pago del webhook no tiene actor humano. Hay que decidir si pasa a nulo cuando `provider = 'stripe'` (con un CHECK) o si se usa un perfil técnico. Se prefiere lo primero; un perfil ficticio confunde la auditoría. |
| Tabla `stripe_events` | `event_id` único, `type`, `account` (si llega de una cuenta conectada), `received_at`, `processed_at`, `error`. Garantiza que cada evento se procese una sola vez aunque Stripe lo reenvíe. Sin el payload completo, solo identificadores. |
| Outbox | `outbox_events` exige `lead_id`. Si n8n debe enterarse de un pago (correo `booking_confirmed`, alerta al equipo), se añade más adelante un tipo `booking.payment_received` (con `ALTER TYPE … ADD VALUE` en su propia transacción, según el procedimiento del README) o un `lead_id` nulo con su CHECK. No es necesario para el MVP. |

Se mantiene el modelo de **dólares enteros**: `amount_usd * 100 = unit_amount` en Stripe. Si Stripe devolviera un importe que no sea múltiplo de 100 (no debería ocurrir con `price_data` en USD enteros), el webhook lo registra como error y no inserta el pago.

## 6. Pasos a seguir

Las fases siguen el límite de `docs/SETUP.md`: hasta cinco tareas y unos quince archivos por fase. Los pasos de cuenta y de panel de Stripe los hace el usuario; los de código, la implementación aprobada.

### Fase 0: cuenta, legal y decisiones (usuario)

1. Resolver la sección 3.1: entidad legal y país de la cuenta de plataforma.
2. Crear la cuenta de Stripe de la plataforma y trabajar primero en un **sandbox**; activar el modo live solo al final.
3. En el dashboard, activar **Connect**:
   - completar el perfil de plataforma (modelo marketplace, la plataforma como comerciante registrado);
   - habilitar los pagos transfronterizos a Perú si los organizadores están allí [verificar requisitos y aprobación];
   - configurar la marca (nombre, logo, colores e icono) que verán Checkout y el onboarding.
4. Decidir las preguntas de la sección 10: comisión, retención de fondos, política de reembolso y quién es cuenta conectada.
5. Escribir la spec `docs/specs/bookings-stripe-checkout.md` en `Estado: borrador`, con la plantilla de `docs/SETUP.md` y declarando que sustituye la pasarela prevista en `bookings-mercadopago`. **La implementación empieza solo después de `apruebo docs/specs/bookings-stripe-checkout.md`.**

#### Diagnóstico de acceso a Connect y Accounts v2

Caso observado el 2026-10-30 en el sandbox: `GET /v2/core/accounts/acct_…` devolvió `403 forbidden` con el mensaje *«API Key does not have permission to access account acct_… In some cases, you may also need to supply an Account ID in the Stripe-Context header»*. En la misma prueba, la lectura v1 de la cuenta (`GET /v1/account`) funcionó. El registro de la petición muestra una clave secreta estándar `sk_test_` (no restringida) y la versión de API `2026-09-30.endive`, así que se descarta que la causa sean los permisos de una clave restringida.

Ese mensaje se refiere al **recurso consultado**, no al endpoint: dice que la clave no puede acceder a *esa cuenta*. Si la cuenta consultada es la propia plataforma (el id que devuelve `/v1/account`), no sirve como prueba de acceso a Connect. Accounts v2 gestiona las cuentas conectadas a la plataforma, y la plataforma no es una cuenta conectada de sí misma [verificar]. Para diagnosticar, todo en modo test, con lecturas y sin mostrar la clave:

1. **Que la clave pertenece al sandbox correcto.** Compara los últimos cuatro caracteres de la clave de `.env.local` con los de *Desarrolladores → Claves de API* del sandbox «Entorno de prueba de carreras…». Si el sandbox del Stripe CLI es otro, `stripe listen` y la clave no verán los mismos objetos.
2. **Tipo de clave.** Si empieza por `rk_test_`, revisa en sus permisos los recursos de Connect y Accounts (lectura y escritura) o usa una `sk_test_` del mismo sandbox para el ejemplo.
3. **Lectura que sí prueba el acceso:** listar las cuentas conectadas, no recuperar la propia. Con stripe-node: `stripe.v2.core.accounts.list({ limit: 1 })`.
   - `200` con una lista vacía: Connect y Accounts v2 están accesibles, el `403` anterior se debía al id consultado y se puede crear la cuenta de prueba.
   - Un error que menciona Connect, la plataforma o Accounts v2: completa *Connect → Comenzar* y el perfil de plataforma en ese mismo sandbox y repite.
   - `403` en el listado con una `sk_test_` del sandbox correcto: es un problema de habilitación de la cuenta, y se consulta con el soporte de Stripe citando el *request id* del registro.
4. **`Stripe-Context`** solo hace falta para actuar *dentro* de una cuenta conectada (por ejemplo, leer sus objetos). No se envía para listar ni para crear cuentas conectadas desde la plataforma.
5. **Resultado del caso observado.** El listado del paso 3 devolvió `400 non_connect_platform_accounts_v2_access_blocked`: *«Accounts v2 is not enabled for your sandbox merchant»*. La causa era que **la cuenta del sandbox no estaba registrada como plataforma Connect**; el `403` de la lectura individual solo lo ocultaba. Solución:
   - completar *Configuración → Connect → Configuración de plataforma* (`dashboard.stripe.com/<acct>/settings/connect/platform-setup`) en ese mismo sandbox, con el modelo de la sección 4: marketplace, la plataforma como comerciante registrado y responsable de comisiones y pérdidas, dashboard Express y onboarding alojado por Stripe;
   - alternativa equivalente: la herramienta `EnableConnect` del MCP de Stripe (búsqueda con `stripe_api_search`) o `stripe tools search enable_connect` en el CLI;
   - no usar la vía *«Use Accounts as customers»* que también sugiere el error: habilita Accounts v2 solo para la configuración `customer` y no convierte la cuenta en plataforma Connect.
6. **Comprobación final.** No crees cuentas conectadas hasta que el paso 3 dé `200`. El país de la cuenta de prueba se elige de forma explícita: `US` sirve para la demo, mientras que el caso real con organizadores en Perú es `PE` con la configuración `recipient` (sección 3.2).

### Fase 1: base técnica

1. Instalar `stripe` (stripe-node) con versión exacta en `package.json` y `npm ci`. La SDK fija su propia versión de API: no se pasa `apiVersion` salvo motivo documentado, y se actualiza deliberadamente.
2. Crear `lib/stripe.ts` (`import "server-only"`), que construye el cliente con `Stripe.createFetchHttpClient()` (sección 7.1).
3. Añadir a `lib/env.ts` un getter opcional y perezoso, `getStripeEnv()`, con el mismo patrón que `getIntegrationEnv()`:
   - `STRIPE_SECRET_KEY`: `^(sk|rk)_(test|live)_\S+$`. Se prefiere una **clave restringida** (`rk_`) con permisos mínimos.
   - `STRIPE_WEBHOOK_SECRET`: `^whsec_\S+$`.
   - `STRIPE_CONNECT_WEBHOOK_SECRET`, si los eventos de cuentas conectadas van a un endpoint aparte.
   - Sin claves, las acciones de pago responden «pagos no disponibles» y el resto del sitio funciona.
   - Hosted Checkout redirige desde el servidor: **no hace falta `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** en esta entrega.
4. Secretos:
   - locales en `.env.local` (Next) y `.dev.vars` (Wrangler), sin sobrescribir los existentes;
   - en el Worker, con `wrangler secret put` (por el usuario);
   - nunca en `vars` de `wrangler.jsonc`.
   - `scripts/strip-env-secrets.mjs` ya elimina del artefacto cualquier clave que no sea `NEXT_PUBLIC_*`; comprobar con `npm run build:worker` que no aparecen nombres `STRIPE_*` en `next-env.mjs`, sin imprimir el módulo.
5. Migración con las tablas y columnas de la sección 5, generada con `npm run db:generate` para revisión.

### Fase 2: onboarding de organizadores

1. Servicio en `modules/payments/` (o `modules/bookings/`, según la spec) que crea la cuenta v2 con la configuración `recipient` y guarda `stripe_account_id`. Es idempotente: si el organizador ya tiene cuenta, se reutiliza.
2. Página de staff, por ejemplo `/crm/cobros`, con un botón «Configurar cobros» que genera un Account Link de onboarding y redirige.
   - La guarda permite solo al propio organizador (o a un admin para soporte).
   - `refresh_url` y `return_url` usan `APP_ORIGIN`.
   - La ruta ya está bajo `/crm/:path*` en el matcher.
3. Estado de la cuenta:
   - se lee de Stripe al volver de `return_url`;
   - se actualiza por webhook (eventos de actualización de cuentas v2 o `account.updated` en v1 [verificar nombres de eventos v2]);
   - **una cuenta sin la capacidad de transferencias activa no puede recibir cobros**, y la acción de pago lo comprueba.
4. Opcional: enlace al dashboard Express del organizador (login link) para ver payouts.

### Fase 3: Checkout Session

1. Server Action en el portal (`/mis-carreras`, ya incluido en el matcher) que:
   - autentica con Clerk y exige correo verificado y `runner_user_id` igual a la sesión;
   - carga la reserva, comprueba que no está cancelada y lee la oferta aceptada (`offer_version_id`), el organizador y su cuenta conectada activa;
   - calcula el importe en el servidor:
     - el abono debe estar en `deposit_options_usd` y solo se ofrece si no hay pagos;
     - el saldo es `total_usd − pagos no anulados`;
     - nunca se cobra más que el saldo;
   - toma la instantánea del tipo de cambio con `getCurrentExchangeRate()` y calcula los soles con `usdToPenCents`;
   - inserta `payment_attempts` en estado `open` (un intento abierto por reserva) y crea la sesión con `idempotencyKey = payment_attempt_id`;
   - guarda `checkout_session_id` y responde con un redirect 303 a `session.url`.
2. Parámetros de la sesión:
   - `mode: "payment"`;
   - `line_items[0].price_data` con `currency: "usd"`, `unit_amount = amount_usd * 100` y `product_data.name`;
   - `payment_intent_data.transfer_data.destination = acct_…`;
   - `payment_intent_data.application_fee_amount`;
   - `metadata` y `payment_intent_data.metadata` con los ids opacos, y `client_reference_id = booking_id`;
   - `customer_email` con el correo verificado (dato del propio titular, no de terceros);
   - `expires_at` entre 30 minutos y 24 horas;
   - `success_url` con `{CHECKOUT_SESSION_ID}` y `cancel_url`.
   - No se fija `payment_method_types`: los métodos se gestionan desde el dashboard.
3. Plazas: mientras no exista la autoreserva, la reserva ya ocupa su plaza. Cuando llegue `bookings-runner-self-service`, los `payment_attempts` abiertos y no vencidos cuentan como retención, como prevé la spec de ofertas.
4. Interfaz: botón «Pagar abono» o «Pagar saldo» con el importe en USD y su equivalente informativo en soles, y aviso de las condiciones. Retirar «No se reciben pagos en esta web» de las FAQ solo cuando el cobro esté en producción.

### Fase 4: webhooks

1. Route Handler `app/api/stripe/webhook/route.ts`:
   - lee el cuerpo **crudo** con `await request.text()` y verifica la firma con `stripe.webhooks.constructEventAsync` y `Stripe.createSubtleCryptoProvider()` (sección 7.3);
   - limita el tamaño del cuerpo;
   - **no** va en el matcher del middleware (no llama a `auth()`): su autenticación es la firma.
2. Idempotencia: insertar `stripe_events.event_id` con `ON CONFLICT DO NOTHING`. Si ya existía y estaba procesado, responder 200 sin repetir efectos.
3. Eventos mínimos:

   | Evento | Acción |
   | --- | --- |
   | `checkout.session.completed` | Si `payment_status = 'paid'`, registrar el pago. Si es `unpaid` (método asíncrono), dejar el intento en espera. |
   | `checkout.session.async_payment_succeeded` | Registrar el pago. |
   | `checkout.session.async_payment_failed` | Marcar el intento como `failed`. |
   | `checkout.session.expired` | Marcar el intento como `expired` y liberar la retención de plaza. |
   | `charge.refunded` o `refund.updated` | Actualizar el estado del intento y anular o ajustar el pago (sección 6, Fase 5). |
   | `charge.dispute.created` / `charge.dispute.closed` | Alertar al equipo; con cargos de destino la disputa se carga a la plataforma. |
   | Actualización de cuenta conectada (v2 o `account.updated`) | Actualizar `organizer_payout_accounts`. |

4. Registrar el pago en **una sola sentencia o `db.batch`**, como `addPayment`. Bloquear la reserva `FOR UPDATE` e insertar en `booking_payments` con `provider = 'stripe'`, `payment_attempt_id` y `paid_on` en fecha de Lima. Después, actualizar el intento a `paid` y llamar a `reconcileBookingAfterCommit`, igual que el pago manual.
5. Comprobar en el webhook que el importe, la moneda, la cuenta de destino y el `booking_id` del evento coinciden con el `payment_attempt` guardado. Ante una discrepancia, no registrar, guardar el error y alertar.
6. Responder 2xx rápido. Ante un error transitorio de base de datos, devolver 5xx para que Stripe reintente: los reintentos son seguros gracias a `stripe_events` y al índice único.
7. Registrar en Stripe el endpoint `https://carreras-viajeras.mentec.dev/api/stripe/webhook` (usuario). Suscribir solo los eventos de la tabla; los de cuentas conectadas llegan como eventos *Connect* o como destino de eventos v2 [verificar configuración de event destinations].

### Fase 5: reembolsos, disputas y conciliación

1. Reembolso desde el CRM (permiso `bookings.manage`):
   - `refunds.create({ payment_intent, reverse_transfer: true, refund_application_fee: true|false })`;
   - con `reverse_transfer`, Stripe recupera el importe de la cuenta conectada; `refund_application_fee` decide si la plataforma devuelve su comisión, según la política acordada.
2. El pago reembolsado se anula o se ajusta en `booking_payments` **desde el webhook**, no desde la acción, para que solo haya una vía de escritura.
3. Disputas: alerta al equipo, aportación de pruebas desde el dashboard y, si se pierde, recuperación del importe al organizador con `transfers.createReversal`, según el contrato.
4. Conciliación: informe mensual de Stripe (balance, transferencias, payouts) frente a `booking_payments` con `provider = 'stripe'`. Los pagos manuales siguen existiendo para transferencias bancarias o Yape.

### Fase 6: pruebas

- **Unit tests (Vitest)** con la base y Stripe simulados:
  - cálculo del importe (abono, saldo, sin sobrecobro);
  - rechazo de una reserva ajena, cancelada o sin cuenta conectada activa;
  - idempotencia del webhook (mismo evento dos veces);
  - firma inválida → 400;
  - discrepancia de importe → sin pago;
  - el schema Zod de la acción descarta importes del cliente.
- **Pruebas funcionales** en el sandbox, con una rama de desarrollo de Neon y una instancia de desarrollo de Clerk:
  - `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Next) o `:8787` (`npm run preview`). El secreto `whsec_` que imprime el CLI va en `.env.local` / `.dev.vars`.
  - Tarjetas de prueba: `4242 4242 4242 4242` (éxito), `4000 0025 0000 3155` (3DS) y `4000 0000 0000 9995` (rechazo) [verificar lista vigente].
  - Escenarios: abono, saldo, abandono y expiración, reembolso total y parcial, disputa de prueba, organizador con onboarding incompleto, reenvío del evento desde el dashboard.
- **Workers:** validar con `npm run build:worker` y `npm run preview`. Un build de Next no acredita la compatibilidad con Workers.

### Fase 7: puesta en producción

1. Pasar las claves live (`sk_live_`/`rk_live_`) con `wrangler secret put`, y registrar el endpoint de webhook live con su propio `whsec_`.
2. Aplicar las migraciones en `production`, con autorización y en el orden del README.
3. Completar la activación de la cuenta de plataforma (datos legales, cuenta bancaria, descriptor de extracto) y el onboarding real de al menos un organizador.
4. Hacer un pago real de importe bajo y reembolsarlo. Verificar la transferencia, la comisión, el registro en Neon y el portal del runner.
5. Actualizar las FAQ, los textos legales y el README («Reservas y portal del runner»).

## 7. Código de referencia

Fragmentos orientativos para la spec. **No están en el repositorio** y deben comprobarse contra la versión de stripe-node que se instale.

### 7.1 Cliente para Workers

```ts
// lib/stripe.ts
import "server-only";
import Stripe from "stripe";
import { getStripeEnv } from "@/lib/env";

// Workers: fetch client instead of Node http. The SDK pins its own API version.
export function getStripe(): Stripe | null {
  const env = getStripeEnv();
  if (!env) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}
```

### 7.2 Creación de la sesión (dentro del servicio, tras validar propiedad e importe)

```ts
const session = await stripe.checkout.sessions.create(
  {
    mode: "payment",
    client_reference_id: booking.id,
    customer_email: verifiedEmail,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: attempt.amountUsd * 100,
        product_data: { name: `${trip.title} · ${kindLabel}` },
      },
    }],
    payment_intent_data: {
      transfer_data: { destination: payoutAccount.stripeAccountId },
      application_fee_amount: attempt.applicationFeeCents,
      metadata: { booking_id: booking.id, payment_attempt_id: attempt.id },
    },
    metadata: { booking_id: booking.id, payment_attempt_id: attempt.id },
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    success_url: `${appOrigin}/mis-carreras?pago={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/mis-carreras?pago=cancelado`,
  },
  { idempotencyKey: attempt.id },
);
```

### 7.3 Webhook

```ts
// app/api/stripe/webhook/route.ts
import Stripe from "stripe";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

export async function POST(request: Request) {
  const stripe = getStripe();
  const env = getStripeEnv();
  if (!stripe || !env) return new Response(null, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch {
    return new Response(null, { status: 400 });
  }
  // handleStripeEvent: idempotent by event.id, single SQL batch, never logs the payload.
  return handleStripeEvent(event);
}
```

### 7.4 Cuenta conectada v2 y onboarding [verificar campos contra la referencia v2]

```ts
const account = await stripe.v2.core.accounts.create({
  display_name: organizerName,
  contact_email: organizerVerifiedEmail,
  identity: { country: "pe" },
  dashboard: "express",
  defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
  configuration: {
    recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
  },
});

const link = await stripe.v2.core.accountLinks.create({
  account: account.id,
  use_case: {
    type: "account_onboarding",
    account_onboarding: {
      configurations: ["recipient"],
      refresh_url: `${appOrigin}/crm/cobros?onboarding=refresh`,
      return_url: `${appOrigin}/crm/cobros?onboarding=return`,
    },
  },
});
```

## 8. Seguridad, privacidad y operación

- **Importes solo del servidor.** Ni el formulario ni la URL deciden el importe, la cuenta de destino ni la comisión.
- **Autorización en el servidor** en cada acción y página. La firma del webhook es su única autenticación; no se aceptan llamadas sin `stripe-signature` válida.
- **Datos mínimos hacia Stripe:** en `metadata` solo van identificadores opacos. Nunca documento, notas médicas, notas internas, teléfono ni datos de otra cuenta.
- **Logs:** no se imprime el evento ni el cuerpo; solo `event.id`, el tipo y el resultado.
- **PCI:** con Checkout alojado, los datos de tarjeta no tocan el Worker (alcance SAQ A [verificar]).
- **Claves:**
  - se prefiere una clave restringida;
  - nunca hay claves en `vars`, en el repositorio ni en instrucciones guardadas;
  - `strip-env-secrets.mjs` se mantiene en el flujo `build:worker`;
  - la rotación sigue el procedimiento de Stripe sin cortar el servicio (claves en paralelo).
- **Red:** `global_fetch_strictly_public` no afecta a `api.stripe.com`. El Worker no necesita nada más para llamar a Stripe.
- **Idempotencia en ambos sentidos:** `idempotencyKey` en las llamadas a Stripe; `stripe_events.event_id` y los índices únicos en Neon.
- **Comisiones:** con cargos de destino, la plataforma paga las comisiones de Stripe, las de pagos transfronterizos y las de Connect (por cuenta activa y por payout) [verificar tarifas vigentes en stripe.com/connect/pricing y stripe.com/pricing para el país de la plataforma]. `application_fee_amount` debe cubrirlas.

## 9. Uso del plugin de Stripe

El plugin de Stripe para Claude Code (servidor MCP de Stripe y skills de buenas prácticas) **no estaba disponible en la sesión cloud donde se redactó este documento**; está instalado en el entorno local del usuario. Usos recomendados en local:

- consultar la documentación y la referencia de la API vigentes para resolver los puntos **[verificar]** de este documento;
- crear y consultar objetos **solo en el sandbox o en modo test**: cuentas conectadas de prueba, Checkout Sessions, reembolsos y eventos;
- revisar logs de peticiones y entregas de webhooks durante la Fase 6.

Reglas:

- conectar el MCP con una clave restringida de test, nunca con la clave live;
- no crear Products ni Prices de catálogo por costumbre (sección 2);
- no modificar la configuración de Connect de producción sin autorización expresa del usuario.

## 10. Preguntas abiertas

1. **Entidad y país de la cuenta de plataforma** (sección 3.1). Bloquea todo lo demás.
2. **Quién es cuenta conectada:** ¿todos los organizadores, o algunos viajes los cobra la propia Carreras Viajeras sin transferencia? Si es lo segundo, la sesión se crea sin `transfer_data`.
3. **Comisión de la plataforma:** ¿porcentaje, importe fijo o mixto? ¿Por organizador, por viaje o por oferta? ¿Se devuelve en un reembolso?
4. **Retención de fondos:** ¿se transfiere al organizador al cobrar (cargo de destino) o cerca del viaje (cargos y transferencias separados)?
5. **Política de reembolso y condiciones de la reserva:** plazos, penalidades y aceptación previa al pago.
6. **Alcance del MVP:** ¿solo el cobro de reservas creadas en el CRM, o también la autoreserva desde la landing? La autoreserva añade la retención de plazas y la creación de la reserva.
7. **Confirmación:** ¿el primer pago confirma la reserva y el lead pasa a `reserved`/`paid` automáticamente, o la confirmación sigue siendo manual?
8. **Moneda:** ¿basta con cobrar en USD mostrando soles de referencia?
9. **Notificaciones:** ¿hace falta un evento de outbox para n8n (correo de pago recibido) en el MVP?

## 11. Fuentes

- Stripe, cargos de destino y Checkout: <https://docs.stripe.com/connect/destination-charges>
- Stripe, aceptar pagos con cargos de destino (marketplace): <https://docs.stripe.com/connect/marketplace/tasks/accept-payment/destination-charges>
- Stripe, cargos y transferencias separados: <https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers>
- Stripe, Accounts v2: <https://docs.stripe.com/connect/accounts-v2> y referencia <https://docs.stripe.com/api/v2/core/accounts>
- Stripe, propiedades de controlador (v1): <https://docs.stripe.com/connect/migrate-to-controller-properties>
- Stripe, tipos de acuerdo de servicio: <https://docs.stripe.com/connect/service-agreement-types>
- Stripe, pagos transfronterizos: <https://docs.stripe.com/connect/cross-border-payouts>
- Stripe, ampliación de destinos transfronterizos (2026-02-25): <https://docs.stripe.com/changelog/clover/2026-02-25/cross-border-payouts-new-countries>
- Stripe, países receptores de Global Payouts: <https://docs.stripe.com/global-payouts/send-money/recipient-countries>
- Stripe, monedas soportadas: <https://docs.stripe.com/currencies>
- Stripe, tarifas de Connect: <https://stripe.com/connect/pricing>
- Cloudflare, soporte de Stripe en Workers: <https://blog.cloudflare.com/announcing-stripe-support-in-workers>
- Specs internas: `docs/specs/trips-commercial-offers.md`, `docs/specs/runner-portal.md`, `docs/specs/crm-welcome-discount.md`, `docs/specs/crm-journey-automation.md`, `docs/SETUP.md`.
