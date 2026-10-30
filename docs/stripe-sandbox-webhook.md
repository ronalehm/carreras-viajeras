# Webhook Stripe de reservas

> La demo local anterior (`modules/stripe-demo`, ledger `node:sqlite` en `.stripe-sandbox/` y `scripts/test-stripe-webhook-replay.mjs`) se retiró de esta rama según `docs/specs/bookings-stripe-checkout-production.md` (tarea 1.1). Sigue disponible en el historial de Git (commit `f56653a` de esta rama y, sin rebase, commit `8247662` de `origin/feat/stripe-checkout`).

Endpoint: `POST <APP_ORIGIN>/api/webhooks/stripe`, implementado en `modules/booking-checkout/services/stripeWebhook.service.ts`.

## Configuración

`getStripeCheckoutConfig()` (`lib/env.ts`) lee `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`. El modo sale del prefijo de la clave: `sk_test_`/`rk_test_` es test y `sk_live_`/`rk_live_` es live. Producción solo admite live y el resto de entornos solo test. El webhook funciona aunque `STRIPE_CHECKOUT_ENABLED` esté en `"false"`.

## Respuestas

- Firma ausente, inválida o cuerpo alterado: 400. Cuerpo mayor de 512 KB: 413.
- Clave o secreto ausentes, o modo no admitido en el entorno: 503 `webhook_unavailable`, sin motivo en la respuesta.
- `livemode` del evento distinto del modo configurado: 400 `mode_mismatch`, sin cambios en datos.
- Evento procesado: 200 `{ received: true, result }`, con `result` en `applied`, `needs_review`, `expired`, `failed`, `ignored` o `duplicate`.
- Error de base de datos o de Stripe: 500. No se confirma nada y Stripe reintenta.

## Eventos

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` y `payment_intent.succeeded`: lógica de `bookingWebhook.service.ts`. Una sola sentencia CTE registra el recibo del evento, la liquidación única por intento, sesión y PaymentIntent, el intento y la reserva. La vigencia del pago inicial compara `reservation_expires_at` con el instante del pago informado por Stripe.
- `charge.refunded` y `charge.dispute.created`: marcan `needs_review` la liquidación del PaymentIntent y registran una alerta. No revierten la reserva.
- Cualquier otro evento, o uno sin intento local: 200 `ignored`, sin crear reservas ni pagos.

Cada evento deja una línea de log con id de evento, tipo, id de intento, id de reserva y resultado, sin PII, importes ni payload.

## Prueba local en modo test

```sh
npm run dev -- --port 3001
stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
npx vitest run modules/booking-checkout/services/stripeWebhook.service.test.ts modules/booking-checkout/services/bookingWebhook.service.test.ts
```

El secreto de `stripe listen` debe coincidir con `STRIPE_WEBHOOK_SECRET` de `.env.local`. No copies ni modifiques credenciales automáticamente.
