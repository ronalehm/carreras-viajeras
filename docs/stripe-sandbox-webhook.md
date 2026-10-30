# Webhook Stripe: demo local

Endpoint: POST http://localhost:3001/api/webhooks/stripe

Este módulo está aislado de Mercado Pago, reservas y Neon. No modifica tablas ni aplica migraciones remotas.
Solo admite claves sk_test_/rk_test_, eventos livemode=false y ejecución no productiva.
No se autoriza desplegar esta rama como integración productiva.

Variables del worktree, en .env.local:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

No se necesita clave publicable para recibir webhooks.
El secreto debe coincidir con el listener CLI que reenvía a este endpoint.
No copiar .env completos ni cambiar credenciales existentes automáticamente.

Comandos:
```powershell
npm run dev -- --port 3001
stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
npx vitest run modules/stripe-demo/services/webhooks.service.test.ts
curl.exe -i -X POST http://localhost:3001/api/webhooks/stripe -H "Content-Type: application/json" -d "{}"
```

El último comando debe devolver 400, nunca 404. Un evento firmado válido devuelve 200.
Los errores de conciliación devuelven 500 sin consumir el evento; Stripe puede reintentarlo.

Persistencia: .stripe-sandbox/webhooks.sqlite, excluida de Git. Recibos únicos por event.id
y proyecciones mínimas sin cuerpos crudos, datos de tarjeta, client_secret ni credenciales.
La escritura de recibo y proyección es una transacción. Eventos repetidos devuelven duplicate=true,
incluso después de reiniciar el proceso. Los eventos antiguos no reemplazan proyecciones recientes.

Checkout solo confirma payment_status=paid, tras consultar el recurso Stripe.
Invoices solo confirman status=paid. Una suscripción active no prueba un pago.
Se observan estados de PaymentIntents, facturas, suscripciones, reembolsos, disputas y alertas.
No hay fulfillment de reservas ni automatizaciones industriales: solo proyecciones locales de demo.

Límite: SQLite nativo requiere Node >=22.13 (comprobado con Node 24) y disco persistente.
No es compatible con el despliegue Cloudflare de producción; sustituir el almacenamiento y
aprobar la arquitectura productiva antes de desplegar. No borrar el ledger al reiniciar la demo.

## Correlación de operaciones locales

Los eventos payment_intent.succeeded y checkout.session.completed solo actualizan proyecciones
si el recurso está registrado con WebhookLedger.registerOperation(resourceId, operationId)
por el flujo que creó la operación. El webhook nunca crea esa asociación automáticamente.
Un fixture CLI sin operación local devuelve 200 con ignored=true y reason=no_local_operation,
sin crear un pago. Su recibo se guarda para deduplicación persistente.
Una operación local conocida con un error Stripe sigue devolviendo 500 y permite reintentos.
El diagnóstico registra nombre/código/estado y frames, nunca el mensaje privado de Stripe.
Si CLI y STRIPE_SECRET_KEY pertenecen a sandboxes distintos, sus recursos no serán intercambiables.
No se modifican credenciales automáticamente para resolver esa diferencia.

## Verificación del arreglo (2026-10-29)

Causa reproducida con stripe trigger checkout.session.completed:
- PaymentIntents.retrieve y Checkout.Sessions.retrieve devolvían resource_missing, HTTP404 de Stripe.
- El handler propagaba ese fallo como HTTP500 antes de escribir en el ledger.
- Comparación de cuentas de solo lectura: Stripe CLI y STRIPE_SECRET_KEY apuntan a sandboxes distintos.
- STRIPE_WEBHOOK_SECRET coincide con el listener local; no se cambió ninguna credencial.

Corrección limitada a payment_intent.succeeded y checkout.session.completed:
- Correlacionar el recurso con una operación local registrada antes de consultar Stripe.
- Fixture ajeno: 200 ignored/no_local_operation, recibo persistente, ninguna proyección de pago.
- Operación local conocida con fallo de API: conservar 500 y permitir reintentos.
- Mantener firma sobre cuerpo original, modo test, transacción y deduplicación.
- No permitir que una lectura impagada del mismo segundo borre un Checkout confirmado.

Resultados observados:
- Suite completa: 34 archivos, 641 pruebas aprobadas, cero fallidas.
- Pruebas del webhook: 17 casos, incluyendo firma válida/inválida, cuerpos alterados, modo live,
  duplicados tras reapertura del ledger, concurrencia, operaciones inexistentes y errores reintentables.
- TypeScript --noEmit y ESLint del módulo y scripts: aprobados.
- POST real sin firma: HTTP400.
- Trigger CLI Checkout sandbox: completado; servidor registró HTTP200.
- Replay HTTP firmado de ambos tipos: HTTP200 en ambas entregas, duplicate=true al repetir,
  un recibo por evento y cero proyecciones para los fixtures sin operación local.
- Ningún proceso/listener o credencial se modificó durante este arreglo de los dos HTTP500.

Reproducción desde este worktree:
```powershell
npx vitest run modules/stripe-demo/services/webhooks.service.test.ts --reporter=verbose
npx vitest run --reporter=dot
npx tsc --noEmit --incremental false
node scripts/verify-stripe-env.mjs
stripe trigger checkout.session.completed
node scripts/test-stripe-webhook-replay.mjs
```

Pendiente: al probar una operación de negocio real de la demo, CLI y aplicación deben apuntar
al mismo sandbox y el flujo de creación debe registrar su asociación local. Este arreglo no
cambia credenciales ni simula que un fixture externo sea una venta de la aplicación.
