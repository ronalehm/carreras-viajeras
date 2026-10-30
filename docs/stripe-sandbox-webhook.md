# Webhook Stripe de reservas

> La demo local anterior (`modules/stripe-demo`, ledger `node:sqlite` en `.stripe-sandbox/` y `scripts/test-stripe-webhook-replay.mjs`) se retiró de esta rama según `docs/specs/bookings-stripe-checkout-production.md` (tarea 1.1). Sigue disponible en el historial de Git (commit `f56653a` de esta rama y, sin rebase, commit `8247662` de `origin/feat/stripe-checkout`).

Endpoint: `POST <APP_ORIGIN>/api/webhooks/stripe`, implementado en `modules/booking-checkout/services/stripeWebhook.service.ts`. En el sitio publicado es `https://carreras-viajeras.mentec.dev/api/webhooks/stripe`.

## Configuración

`getStripeCheckoutConfig()` (`lib/env.ts`) lee `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `STRIPE_DEMO_MODE`. El modo sale del prefijo de la clave (`sk_test_`/`rk_test_` es test y `sk_live_`/`rk_live_` es live) y del entorno:

| Entorno | Clave | Modo del webhook | `livemode` exigido |
| --- | --- | --- | --- |
| Desarrollo | test | `test` | `false` |
| Producción, `STRIPE_DEMO_MODE="true"` | test | `demo` ([`bookings-stripe-checkout-demo.md`](specs/bookings-stripe-checkout-demo.md)) | `false` |
| Producción, sin demo | live | `live` (no se configura en la demo) | `true` |
| Producción, `STRIPE_DEMO_MODE="true"` | live | ninguno: 503 | — |
| Producción, sin demo | test | ninguno: 503 | — |

El webhook funciona aunque `STRIPE_CHECKOUT_ENABLED` esté en `"false"`, siempre que el modo de la clave esté admitido. Variables, valores y dónde se configuran: [README, Stripe Checkout (modo demo TEST)](../README.md#stripe-checkout-modo-demo-test).

## Endpoint test en el dominio publicado (demo)

En el Dashboard de Stripe, con el **modo test** activado (paso 5 del procedimiento de la spec demo):

1. Developers → Webhooks (Workbench → Webhooks en el Dashboard nuevo) → Add endpoint: `https://carreras-viajeras.mentec.dev/api/webhooks/stripe`.
2. Eventos:
   - `checkout.session.completed`;
   - `checkout.session.async_payment_succeeded`;
   - `checkout.session.async_payment_failed`;
   - `checkout.session.expired`;
   - `payment_intent.succeeded`;
   - `charge.refunded`;
   - `charge.dispute.created`.
3. Copiar el signing secret (`whsec_…`) a Cloudflare como **Secret** `STRIPE_WEBHOOK_SECRET`, desde el panel o con `npx wrangler secret put STRIPE_WEBHOOK_SECRET`. Es exclusivo de este endpoint: no sirve el de `stripe listen` ni el de otro endpoint. Nunca va en `wrangler.jsonc`, en el repositorio ni en un chat.
4. La clave del Worker es una restringida `rk_test_`, con estos permisos:
   - Checkout Sessions: escritura;
   - PaymentIntents, Charges y Events: lectura.

   Se carga como Secret `STRIPE_SECRET_KEY`.

"Send test event" envía un evento firmado que no corresponde a ningún intento:

- con `STRIPE_DEMO_MODE="true"`, la respuesta esperada es 200 `{ received: true, result: "ignored" }`;
- mientras `STRIPE_DEMO_MODE` siga en `"false"`, la respuesta es 503 `webhook_unavailable`, porque producción no admite una clave test fuera del modo demo. En ese caso, Workers Logs registra `stripe-webhook: not configured` con presencia booleana de cada valor, nunca los valores.

Al terminar la demo, desactivar este endpoint y revocar la clave `rk_test_`.

## Respuestas

- Firma ausente, inválida o cuerpo alterado: 400. Cuerpo mayor de 512 KB: 413.
- Clave o secreto ausentes, o modo no admitido en el entorno: 503 `webhook_unavailable`, sin motivo en la respuesta.
- `livemode` del evento distinto del modo configurado: 400 `mode_mismatch`, sin cambios en datos. En demo, un evento con `livemode=true` siempre termina así.
- Evento procesado: 200 `{ received: true, result }`, con `result` en `applied`, `needs_review`, `expired`, `failed`, `ignored` o `duplicate`.
- Error de base de datos o de Stripe: 500. No se confirma nada y Stripe reintenta.

## Eventos

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` y `payment_intent.succeeded` siguen la lógica de `bookingWebhook.service.ts`:
  - una sola sentencia CTE registra el recibo del evento, la liquidación única por intento, sesión y PaymentIntent, el intento y la reserva;
  - la vigencia del pago inicial compara `reservation_expires_at` con el instante del pago informado por Stripe;
  - solo se liquida si el `stripe_mode` del intento coincide con el `livemode` del evento. En demo, las liquidaciones quedan con `stripe_mode = 'test'` y la reserva con `is_simulated = true`.
- `charge.refunded` y `charge.dispute.created`: marcan `needs_review` la liquidación del PaymentIntent y registran una alerta. No revierten la reserva.
- Cualquier otro evento, o uno sin intento local: 200 `ignored`, sin crear reservas ni pagos.

Cada evento deja una línea de log `stripe-webhook:` con id de evento, tipo, id de intento, id de reserva y resultado, sin PII, importes ni payload. `needs_review` se registra como `warn` con `alert: true`. La operación (alertas, conciliación y reversión) está en el README.

## Prueba local en modo test

```sh
npm run dev -- --port 3001
stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
npx vitest run modules/booking-checkout/services/stripeWebhook.service.test.ts modules/booking-checkout/services/bookingWebhook.service.test.ts
```

El secreto de `stripe listen` debe coincidir con `STRIPE_WEBHOOK_SECRET` de `.env.local`. No copies ni modifiques credenciales automáticamente.
