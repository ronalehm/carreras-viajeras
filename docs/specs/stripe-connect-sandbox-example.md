# Ejemplo aislado de Stripe Connect en sandbox

- Estado: borrador
- Proyecto: Carreras Viajeras
- Rama: `feat/stripe-checkout-mainline`
- Relación con `bookings-stripe-checkout.md`: complemento independiente; no modifica ni habilita Connect en el checkout de reservas.

## Objetivo

Proveer un script local que demuestre la creación de una cuenta conectada de prueba con Stripe Accounts v2. El ejemplo sirve para validar que una cuenta Stripe sandbox puede crear una cuenta recipient y solicitar `stripe_transfers`; no representa una decisión comercial ni una configuración productiva para Carreras Viajeras.

## Alcance

- Crear `scripts/stripe-connect-sandbox-example.mjs` y pruebas automatizadas para sus guardas y salida.
- Leer `STRIPE_SECRET_KEY` desde `.env.local`; aceptar únicamente una clave de test.
- Requerir `--create-test-account` explícitamente antes de cualquier llamada de creación.
- Recibir el país de prueba como argumento requerido, sin asumir la jurisdicción de una entidad real.
- Usar Stripe Accounts v2 sin configuración `merchant`: `configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested = true`, `dashboard = express`, `defaults.responsibilities.fees_collector = application` y `defaults.responsibilities.losses_collector = application`. El país indicado se asigna a `identity.country`.
- Mostrar únicamente modo test, ID de la cuenta conectada, capacidad solicitada y estado devuelto. Nunca imprimir la clave ni el objeto completo.
- No guardar el ID ni otros datos en Neon, SQLite, archivos de entorno o el checkout. La salida queda en la terminal.

## Fuera de alcance

- No modificar rutas, componentes, servicios, esquemas, migraciones, webhooks ni documentos aprobados de Checkout.
- No generar enlaces de onboarding, aceptar datos KYC, crear cargos, transferencias, reembolsos o payouts.
- No crear cuentas conectadas fuera del modo test, ni activar Connect en producción.
- No instalar dependencias, desplegar, hacer push o cambiar autenticación de Stripe CLI.

## Seguridad y límites

- Sin `--create-test-account`, el script termina antes de llamar a Stripe.
- Rechaza claves `sk_live_`/`rk_live_` y configuraciones ausentes; errores al API se resumen sin imprimir valores, requests ni payloads sensibles.
- Cada ejecución confirmada puede crear una cuenta conectada sandbox nueva. El usuario revisa el ID en el Dashboard test; no se promete idempotencia entre ejecuciones.
- El país pasado al script es solo dato de prueba. La cuenta no se habilita para cobrar ni transferir fondos.
- El checkout existente continúa sin Connect. Para enrutar fondos a organizadores se requiere otra enmienda con el flujo de fondos, responsabilidades, reversos y webhooks.

## Aceptación

1. Las pruebas muestran que una invocación sin confirmación no llama a Stripe.
2. Una clave live o ausente se rechaza antes de la API.
3. Una clave test y confirmación explícita crean una cuenta mediante Accounts v2, con país validado y configuración recipient acordada arriba.
4. La salida contiene solo resumen permitido; una excepción Stripe no filtra clave ni detalles de la solicitud.
5. La ejecución sandbox real, si se autoriza después de aprobar esta spec, crea como máximo una cuenta por invocación y no genera ningún pago o transferencia.
6. `booking-checkout`, `booking_payments`, `bookings`, la migración 0013 y el handler de Checkout no cambian.

## Referencias

- [Stripe Accounts v2: crear una cuenta](https://docs.stripe.com/api/v2/core/accounts/create)
- [Stripe: configuración de cuentas conectadas](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- [Stripe: pruebas automatizadas](https://docs.stripe.com/automated-testing)

