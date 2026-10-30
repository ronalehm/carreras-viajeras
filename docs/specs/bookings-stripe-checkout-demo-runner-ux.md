# Enmienda: el corredor ve la reserva demo como una reserva real

- Estado: borrador
- Spec base: [bookings-stripe-checkout-demo.md](bookings-stripe-checkout-demo.md), aprobada (sección C, «Pantallas»).
- Módulos: booking-checkout (checkout del corredor) y bookings (portal `/mis-carreras`).
- Pedido del usuario (2026-10-30): «para el runner la reserva o pago de la totalidad debe ser como un pago real para mejorar la experiencia y debe mostrarse en "Reservas" del CRM».

## Cambio respecto a la spec base

La sección C pide el distintivo «SIMULADA» en el checkout, en el retorno de Stripe, en `/mis-carreras` y en el CRM de reservas. Esta enmienda lo quita **solo de las pantallas del corredor**:

- En el checkout y en el retorno de Stripe (`RunnerCheckout`) desaparecen el distintivo SIMULADA y la nota «Pago de prueba: no se realiza ningún cargo real». Los textos son los de una reserva real: reserva total o abono, «Pago confirmado. Tu reserva quedó registrada.».
- En `/mis-carreras` (`RaceSelector` y `BookingOverview`) desaparecen el distintivo y la nota de simulación. La reserva, sus pagos y su saldo se muestran como en una reserva real.

Sin cambios:
- **CRM:** `/crm/reservas` muestra la reserva simulada en la lista principal con el distintivo SIMULADA y su filtro, según la enmienda `bookings-stripe-checkout-demo-crm-list.md`. La ficha conserva el distintivo.
- **Datos:** `is_simulated` y `stripe_mode` siguen guardándose. Las reservas simuladas siguen sin consumir cupos, fuera de totales e informes y sin outbox comercial ni recompensas.
- **Acceso:** el modo demo sigue limitado a los participantes autorizados, con Stripe en modo de prueba (sin cargos reales). La página de Stripe muestra su propia marca de modo de prueba, que la aplicación no controla.
- **Servidor:** las respuestas del servidor no cambian; solo se deja de pintar el distintivo en las pantallas del corredor.

## Plan
- [ ] R.1 `RunnerCheckout`, `RaceSelector` y `BookingOverview` sin distintivo ni nota de simulación para el corredor; los componentes del CRM conservan `SimulatedBookingBadge`. Tests actualizados.

## Aceptación
- Un participante demo completa la reserva total y no ve «SIMULADA» ni «Pago de prueba» en el checkout, en el retorno ni en `/mis-carreras`.
- La misma reserva aparece en `/crm/reservas` con el distintivo SIMULADA, y no suma en totales.
- lint, tests, typegen, `tsc` y `build:worker` pasan.
