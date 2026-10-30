# Enmienda: Stripe Checkout solo con tarjeta

- Estado: borrador
- Spec base: [bookings-stripe-checkout.md](bookings-stripe-checkout.md)
- Alcance: modificar únicamente el método de pago del Checkout aprobado de Carreras Viajeras.

## Decisión

Stripe Checkout acepta únicamente pagos con tarjeta. La sesión debe declarar payment_method_types: ["card"]; no habilitar métodos dinámicos ni otros métodos de pago. Mantener Checkout alojado, mode: "payment", el precio fijado por el servidor y todas las verificaciones de firma, importe, moneda, modo de prueba e idempotencia de la spec base.

Connect queda fuera del flujo. No crear cuentas conectadas, transferencias, cargos para terceros ni configuración de pagos a organizadores. El pago con tarjeta se procesa en la cuenta Stripe de Carreras Viajeras.

## Aceptación

- Una sesión sandbox de reserva usa solo card.
- El navegador no puede cambiar importe, moneda ni métodos de pago.
- El webhook conserva la semántica de confirmación y deduplicación aprobada.
- Una prueba verifica que la solicitud a Stripe incluye payment_method_types: ["card"].
- No se ejecutan cobros reales, pagos en producción ni operaciones Connect.

Esta enmienda no cambia el modelo de ofertas, reservas, contratos, montos ni migraciones.
