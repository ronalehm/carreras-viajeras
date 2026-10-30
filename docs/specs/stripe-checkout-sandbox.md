> ALCANCE SUSTITUIDO (2026-10-29): este documento corresponde a una demo mentec.dev. El usuario aclaró que el checkout es para Carreras Viajeras y pidió Stripe. No ejecutar este plan; consultar docs/specs/bookings-stripe-checkout.md y su plan Carreras. Este aviso no aprueba ninguna spec.

# Stripe Checkout sandbox

- Módulo: stripe-demo
- Estado: borrador
- Worktree: `C:/Users/ronal/carreras-viajeras-stripe`
- Rama: `feat/stripe-checkout-sandbox`
- Plan de implementación: [2026-10-29-stripe-checkout-sandbox.md](../superpowers/plans/2026-10-29-stripe-checkout-sandbox.md)
- Entorno: demo local Node, puerto 3001, exclusivamente sandbox
- Fuente solicitada pendiente: `docs/stripe` no aparece en los checkouts inspeccionados ni en el historial disponible de esa ruta. Este borrador es provisional hasta incorporar dicha documentación.

## Objetivo

Permitir a un operador de la demo abrir Stripe Checkout para un producto de prueba, regresar a la aplicación y consultar una operación que solo se considere pagada tras confirmación válida de Stripe. Una operación se cuenta una sola vez aunque lleguen eventos Session y PaymentIntent, duplicados o fuera de orden.

## Decisión de alcance: una spec o varias

Una spec para Checkout, dividida en dos fases: núcleo transaccional y recorrido visible con conciliación. Creación de Session, operación local y webhook son partes de una misma capacidad y deben compartir criterios de aceptación.

Billing (suscripciones, renovaciones y portal) e Invoicing (facturas y vencimientos) serán specs posteriores si se solicitan. Connect, Tax automático y producción no pertenecen a este alcance. Separar ahora el webhook en otra spec dejaría la creación de Session sin garantía de confirmación; el webhook ya existe y se amplía solo donde Checkout lo necesita.

Alternativas consideradas:
- Una spec monolítica para Payments, Billing e Invoicing: descartada para este pedido; mezcla contratos y ciclos de vida distintos.
- Una spec para Checkout con fases: propuesta recomendada; entrega el recorrido completo sin cambiar reservas ni Mercado Pago.
- Specs independientes para frontend y webhook: descartadas; no ofrecen por separado una operación pagada verificable.

## Alcance

Incluye:
- Checkout alojado, `mode: "payment"`, una unidad de un Price de prueba configurado en servidor.
- Operación local persistente antes de llamar Stripe; idempotencia saliente y entrante.
- Registro de la Session antes de entregar su URL al navegador.
- Retorno y consulta de estado que no acreditan un pago por sí mismos.
- Éxito inmediato, pago asíncrono, fallo y expiración; cancelación visual sin inventar un estado financiero.
- Demo cerrada mediante token propio del entorno local, propuesto para no usar Neon ni aceptar invitaciones de staff incidentalmente.
- Variables privadas en `.env.local`, sin imprimirlas ni sobrescribir valores existentes.
- Pruebas unitarias, SQLite real temporal y recorrido sandbox.

No incluye:
- Cobrar reservas, reutilizar ofertas, registrar pagos en `booking_payments`, cambiar Mercado Pago o añadir otro proveedor al flujo productivo.
- Escrituras/lecturas automáticas en Neon, migraciones remotas, roles de staff, datos reales de compradores ni cuentas existentes de Carreras Viajeras.
- Checkout embebido, formulario de tarjetas propio, carrito, cantidades editables, cupones, pagos recurrentes, cuotas, Connect, Tax automático, reembolsos iniciados desde la UI.
- Deploy, push, merge, cobros reales o cambios en el puerto 3000.

## Requisitos

1. Reutilizar el módulo `stripe-demo`, su SDK 23.0.1, API `2026-09-30.endive`, endpoint y ledger local. No crear un segundo webhook ni tocar `lib/db-schema.ts`.
2. Mantener la demo limitada a Node local, host loopback y puerto 3001. Rechazar ejecución productiva, claves live y recursos `livemode=true`.
3. El servidor obtiene el Price de `STRIPE_PRICE_ID`, comprueba que esté activo, sea de pago único, de importe fijo positivo y pertenezca al sandbox de la clave. No admitir importe, moneda, Price, Customer ni URLs de retorno proporcionados por el navegador.
4. Construir los retornos a partir de `STRIPE_CHECKOUT_ORIGIN`, admitiendo solo los orígenes locales acordados de 3001. No modificar `APP_ORIGIN`: su contrato actual pertenece a autenticación/Neon y no admite ese puerto.
5. Propuesta de acceso: `STRIPE_CHECKOUT_DEMO_TOKEN` privado de al menos 32 caracteres; el operador lo introduce en un campo password. Se verifica en servidor con comparación segura, solo se mantiene en memoria del navegador y nunca se envía a Stripe, URLs, logs, HTML de servidor o localStorage. Al volver de Stripe el token en memoria puede haberse perdido: pedirlo de nuevo antes de consultar estado, sin inferir pago de la URL. No reutilizar automáticamente `getCurrentUser`: puede aceptar invitaciones y escribir en Neon.
6. Validar Origin/Host y Authorization en los endpoints propios; sin CORS abierto. La ruta webhook conserva exclusivamente su autenticación por firma Stripe.
7. Crear una operación durable con UUID y parámetros inmutables antes del POST a Stripe. Enviar una clave estable en `RequestOptions.idempotencyKey` (segundo argumento). El mismo intento conserva Price, cantidad, URLs y etiqueta de integración, incluso si cambia la configuración después.
8. Usar `stripe.checkout.sessions.create`, `mode: "payment"`, `line_items: [{price, quantity: 1}]`, `success_url`, `cancel_url` y `client_reference_id` con UUID opaco local. Omitir `ui_mode` para usar la página alojada predeterminada actual. Deshabilitar Adaptive Pricing en esta demo para mantener el importe y la moneda esperados del Price. Si se explicita, el SDK instalado tipa `hosted_page`, no asumir nombres antiguos.
9. Añadir `integration_identifier` conforme a la guía Stripe; persistir su etiqueta con sufijo aleatorio de ocho letras para que los reintentos no cambien parámetros. No usarla como clave de idempotencia ni identificador de operación. Omitir `payment_method_types` para conservar métodos dinámicos.
10. Persistir el vínculo Session→operación antes de responder con la URL. `Session.payment_intent` puede ser null al crear Checkout; no tratarlo como error.
11. Un timeout o fallo local después de crear la Session no permite crear otra Session con una clave nueva. Reintentar con la misma clave dentro de la ventana de Stripe; pasado el margen o con resultado incierto, estado `needs_reconciliation`, sin recreación automática.
12. Confirmación contable por operación local y Session canónica: `payment_status="paid"` con importe/moneda esperados. `status="complete"`, la visita de éxito o un PaymentIntent ajeno no bastan.
13. Resolver el vínculo PI→operación mediante la Session canónica ya asociada cuando esté disponible, sin confiar en metadata como autorización. Un PI recibido antes de poder asociarlo no debe impedir que el posterior evento válido de Session confirme la operación.
14. Conservar la correlación también en `checkout.session.async_payment_succeeded` y `async_payment_failed`. Un snapshot asíncrono no puede borrar `operationId`. La operación es el agregado financiero único: no sumar como dos pagos los snapshots Session y PI.
15. Procesar recibo, vínculo y cambio de estado de la operación de forma transaccional. Repeticiones o eventos distintos sobre la misma operación producen una sola confirmación; un fallo antes de commit sigue siendo reintentable. Una confirmación no regresa a impagada por eventos antiguos o del mismo segundo.
16. Una vuelta por cancelación no significa que Stripe haya cancelado o fallado el pago. Incorporar explícitamente `checkout.session.expired` al webhook con correlación y lectura canónica. Reutilizar una Session abierta; una Session expirada permite un nuevo intento explícito, con nueva operación y clave. La lectura local no debe prometer detectar expiraciones sin ese evento; un evento de expiración antiguo no degrada una operación pagada.
17. No persistir raw payloads, client_secret, datos de tarjeta ni credenciales. Consultas y errores usan `Cache-Control: no-store` y mensajes seguros.
18. Mantener el listener test que ya reenvía a 3001. CLI y clave de aplicación deben pertenecer al mismo sandbox para el E2E de una operación local; hoy se verificó una diferencia entre ambos. No cambiar cuentas o claves automáticamente.

## Criterios de aceptación

- [ ] (F1) Dado entorno incompleto/live/productivo, cuando se intenta crear Checkout, entonces se rechaza antes de llamar Stripe y el error no muestra valores.
- [ ] (F1) Dado token ausente/incorrecto u Origin ajeno, cuando se invoca la API, entonces responde 401/403 sin crear operaciones o recursos.
- [ ] (F1) Dado precio enviado/manipulado por el cliente, cuando se valida el request, entonces se rechaza y solo se utiliza el Price autorizado por servidor.
- [ ] (F1) Dado un Price de prueba activo y el request válido, cuando se crea la Session, entonces su importe está en unidad mínima y su vínculo local existe antes de responder.
- [ ] (F1) Dado el mismo requestId con doble clic, concurrencia, reinicio o timeout, cuando se reintenta, entonces se recupera la misma operación/Session y no se duplica.
- [ ] (F1) Dado requestId ya usado con parámetros distintos, cuando se reintenta, entonces responde 409 sin otra llamada de creación.
- [ ] (F1) Dada Session creada y persistencia local fallida, cuando se recupera, entonces se conserva la clave y no se inventa un segundo cobro.
- [ ] (F1) Dado resultado incierto fuera de la ventana idempotente, cuando se reintenta, entonces exige conciliación.
- [ ] (F2) Dado Checkout completado pero unpaid, cuando llega el webhook, entonces la operación sigue pendiente.
- [ ] (F2) Dado éxito asíncrono posterior, cuando llega el evento válido, entonces conserva operationId y confirma una sola operación.
- [ ] (F2) Dado PI inicialmente null o PI.succeeded antes de Session.completed, cuando llega después la Session propia y paid, entonces se confirma correctamente una sola vez.
- [ ] (F2) Dado el mismo pago visto por Session y PI, con IDs de evento distintos, duplicados, concurrencia o igual timestamp, cuando se procesan, entonces no se duplica importe ni se degrada la confirmación.
- [ ] (F2) Dado fixture ajeno sin operación local, cuando se recibe, entonces no crea pagos; errores reales de operaciones conocidas conservan reintento.
- [ ] (F2) Dada firma inválida/cuerpo alterado/live, cuando se envía al webhook, entonces responde 400 sin consumir el evento.
- [ ] (F2) Dada vuelta a éxito sin webhook confirmado, cuando se muestra la página, entonces indica pendiente y nunca actualiza el estado financiero desde el cliente.
- [ ] (F2) Dada cancelación o expiración, cuando se vuelve a la demo, entonces no se presenta éxito ni se crea un reintento financiero silencioso.
- [ ] (F2) Dada Session propia expirada y `checkout.session.expired` canónico recibido, cuando se confirma su estado local y el operador inicia otro intento explícito, entonces se crea otra operación/requestId y la anterior permanece expirada; paid nunca regresa a expired.
- [ ] (F2) Dado retorno desde Stripe sin token en memoria, cuando se solicita estado, entonces se pide el token de nuevo y la consulta permanece deshabilitada hasta disponer de acceso.
- [ ] (F2) Dada consulta sin autorización o de una operación inexistente, cuando se solicita el estado, entonces no revela datos.
- [ ] (F2) Dada la demo en 3001, cuando termina la verificación, entonces 3000, Mercado Pago, reservas, Neon y credenciales existentes conservan su configuración.

## Diseño técnico

Rutas nuevas propuestas:
- `app/demo/stripe/checkout/page.tsx`: Server Component, presenta solo la demo y componentes; no consulta Neon.
- `app/api/stripe/checkout/route.ts`: POST delgado que valida acceso y delega la creación.
- `app/api/stripe/checkout/[operationId]/route.ts`: GET protegido del estado local.
- Retornos de éxito/cancelación a la misma página de demo, con operationId opaco y resultado visual. El token no viaja en la URL ni se inyecta en las URLs de Stripe.
- Existente `app/api/webhooks/stripe/route.ts`: se mantiene; no crear rutas Pages Router o un segundo endpoint.

Archivos de módulo propuestos:
- `services/stripeClient.ts`: configuración/SDK compartido, lazy y server-only.
- `schemas/checkout.schema.ts`: configuración de demo, UUID de intento y contrato de request.
- `utils/checkoutAccess.ts`: acceso local aislado de Neon, Origin/Host/Authorization.
- `services/checkout.service.ts`: operación, Price, Session e idempotencia de salida.
- `services/webhookLedger.ts`: extender ledger local; no reutilizar el esquema PostgreSQL del proyecto.
- `services/webhooks.service.ts`: correlación y confirmación por operación, incluido async y PI inicialmente null.
- `services/checkout.client.ts`: cliente HTTP de creación/estado; transporta token solo en Authorization y no lo registra.
- `hooks/useStripeCheckout.ts`: TanStack Query para mutación y consulta; sin fetch de servidor directamente en la UI, sin token en query keys o almacenamiento persistente.
- `components/StripeCheckoutDemo.tsx`: Client Component nuevo para token, pagar, estado pendiente, error y enlace a Stripe. Token solo en estado de React. Incluye un QueryClientProvider circunscrito a la demo; no modificar el provider/layout global. Limpiar caché de la demo al cambiar acceso y deshabilitar consulta sin token.
- Retorno: reintroducir token si se perdió al navegar a Stripe; la URL solo selecciona la operación.
- `index.ts`: API pública de módulo; imports externos solo desde aquí.

Datos locales:
- Añadir tabla `checkout_operations`: id/requestId único, estado, priceId, importe, moneda, Session nullable única, parámetros inmutables, clave de idempotencia, fecha inicial y resultado/error seguro.
- Estados: `creating`, `open`, `pending_payment`, `paid`, `failed`, `expired`, `needs_reconciliation`.
- Mantener asociaciones `stripe_operations` y recibos existentes. La contabilización se realiza por checkout_operations.id; stripe_objects conserva solo proyecciones por recurso.
- Evolución SQLite explícita y compatible con la base de demo existente. No borrar el ledger ni aplicar migraciones a Neon.

Contratos propuestos:
- POST: `Authorization: Bearer <token local>`, JSON `{ requestId: UUID }`; campos extra rechazados.
- Éxito 201 o replay 200: `{ operationId, state, checkoutUrl }`; URL únicamente de Checkout alojado verificada.
- Estado 200: `{ operationId, state, amountMinor, currency }`; sin secretos, detalles de Customer ni payload Stripe.
- Errores: 400 invalid_input, 401 unauthorized, 403 forbidden_origin, 404 not_found, 409 conflict/needs_reconciliation, 503 sandbox_not_configured/provider_unavailable. No devolver mensajes originales de Stripe/SQLite.

## Reutilización

- SDK Stripe ya instalado: no instalar Stripe.js/React Stripe para un redirect alojado.
- Webhook y SQLite existentes: ampliarlos en lugar de recrearlos.
- Button, Card, Input y Label: shadcn instalados, `components/ui/`. Componentes visuales simples no requieren nuevas dependencias.
- Patrón Zod de acciones existentes: validar antes de mutar, sin reutilizar sus guards Neon.
- No ampliar `lib/env.ts`, no cambiar layout/providers globales ni CrmShell.

## Fuentes verificadas

- `docs/SETUP.md`: estructura, SDD, plantilla y máximo cinco tareas/~15 archivos por fase.
- `docs/stripe-sandbox-webhook.md`: contexto del webhook, modo test y diferencia actual de sandbox.
- `modules/stripe-demo/services/webhooks.service.ts`: firma, snapshots, correlación actual y reintentos.
- `modules/stripe-demo/services/webhookLedger.ts`: recibos, asociaciones y transacciones.
- `node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts`: create/retrieve, campos y ui_mode actuales.
- `node_modules/stripe/cjs/lib.d.ts`: RequestOptions.idempotencyKey.
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`: rutas App Router, POST y caching.
- `lib/env.ts` y `lib/auth/access.service.ts`: origen existente y efectos secundarios que esta demo no debe reutilizar.
- Falta incorporar `docs/stripe` proporcionado por el usuario. No se ha sustituido por documentos inventados.

## Tests

Usar Vitest y SQLite temporal real como en el módulo actual. Doblar únicamente el transporte/API Stripe. Ninguna prueba automatizada usa claves live o accede a Neon.

- Configuración y acceso: ausencia de variables, test/live, token, Origin, URLs abiertas y filtración de secretos.
- Creación: Price inválido/ajeno/inactivo/recurrente, importe mínimo, parámetros prohibidos, replay, concurrencia, timeout y ventana idempotente.
- Persistencia: constraints, vínculo antes de retorno, reinicio, rollback y ausencia de duplicados por operación.
- Webhook: todos los criterios de orden/correlación anteriores; las pruebas actuales de firmas, modos y errores siguen pasando.
- Cliente/hook: errores HTTP, consultas deshabilitadas sin token, recuperación tras retorno y caché sin token en las claves ni persistencia.
- UI: submit pendiente/deshabilitado, token no persistido, reentrada al volver, errores accesibles y estado financiero derivado de servidor.
- E2E sandbox: confirmar misma cuenta/sandbox CLI-app, pagar con datos de prueba en Checkout alojado, comprobar operación única y reenvíos. No basta con fixtures desconocidos ignorados.

## Plan de tareas

### Fase 0 — Cerrar documentación y acceso (sin código de producto)

- [ ] T0 — Ubicar e incorporar referencias de docs/stripe; confirmar el alcance demo y el acceso local propuesto; revisar y aprobar esta spec. No editar el registro de aprobaciones.

### Fase 1 — Crear operaciones y Sessions de forma segura

- [ ] T1 — Configuración y acceso aislado · crear: schemas/checkout.schema.ts, schemas/checkout.schema.test.ts, utils/checkoutAccess.ts, utils/checkoutAccess.test.ts, services/stripeClient.ts; modificar index.ts · depende de F0 · secuencial (base).
- [ ] T2 — Operaciones durables e idempotencia · modificar services/webhookLedger.ts y services/webhooks.service.ts (solo getter compartido, sin cambiar procesamiento); crear services/checkoutLedger.test.ts · depende de T1 · secuencial.
- [ ] T3 — Creación Checkout por servidor · crear services/checkout.service.ts, services/checkout.service.test.ts, app/api/stripe/checkout/route.ts · depende de T2 · secuencial.
- [ ] T4 — Verificación integrada F1: pruebas anteriores, TypeScript y lint; inspección de payloads/API del SDK, sin cobros ni deploy · depende de T3 · secuencial.

Las rutas abreviadas de módulo están bajo `modules/stripe-demo/`. Fase 1: máximo 12 archivos distintos; no se ejecutan tareas en paralelo sobre index.ts, configuración o ledger.

### Fase 2 — Recorrido visible y confirmación única

- [ ] T1 — Reconciliación por operación y checkout.session.expired · modificar services/webhooks.service.ts, services/webhooks.service.test.ts y services/webhookLedger.ts; agrupar los nuevos casos de conciliación en services/webhooks.service.test.ts · depende de F1 · secuencial (base).
- [ ] T2 — Lectura de estado y export público · modificar services/checkout.service.ts, services/checkout.service.test.ts e index.ts; crear app/api/stripe/checkout/[operationId]/route.ts · depende de T1 · secuencial (base).
- [ ] T3 — Cliente y hook de estado · crear services/checkout.client.ts, services/checkout.client.test.ts, hooks/useStripeCheckout.ts y hooks/useStripeCheckout.test.ts · depende de T2 · secuencial.
- [ ] T4 — UI, provider local y retornos · crear components/StripeCheckoutDemo.tsx, components/StripeCheckoutDemo.test.tsx y app/demo/stripe/checkout/page.tsx · depende de T3 · secuencial.
- [ ] T5 — Verificación final; ampliar scripts/test-stripe-webhook-replay.mjs con modo explícito para operaciones propias y conservar fixtures ajenos: suite completa, TypeScript, lint y build aislado del dev server; E2E sandbox y reenvíos con evidencias · depende de T4 · secuencial.

Fase 2: máximo 15 archivos distintos y cinco tareas. No construir .next simultáneamente con el servidor dev del mismo worktree. No reiniciar ni modificar 3000. Commits, push, merge y deploy quedan a decisión del usuario.

## Variables de entorno

En `C:/Users/ronal/carreras-viajeras-stripe/.env.local`:
- STRIPE_SECRET_KEY: test, servidor.
- STRIPE_WEBHOOK_SECRET: listener local.
- STRIPE_PRICE_ID: Price único de pago puntual, servidor.
- STRIPE_CHECKOUT_ORIGIN: origen local de 3001, completar manualmente.
- STRIPE_CHECKOUT_DEMO_TOKEN: propuesta de acceso aislado; completar manualmente si se aprueba ese acceso.

No borrar valores actuales para crear el template. Añadir solo asignaciones ausentes y vacías. La clave publicable existente se conserva, pero Checkout alojado no la necesita.

## Preguntas abiertas

1. ¿Dónde está docs/stripe (ruta o rama)? Se buscó sin resultado en el proyecto principal, worktree Stripe y mentec-stripe-demo.
2. ¿Confirma esa documentación una demo aislada con token propio y un Price, o define acceso/catálogo de otra forma? Esta propuesta evita tocar autenticación/Neon y Mercado Pago.
3. Antes del E2E: seleccionar manualmente el mismo sandbox para CLI y aplicación. No resolverlo sustituyendo claves de forma automática.

La aprobación previa del webhook no aprueba esta nueva capacidad Checkout. Mantener el estado borrador hasta la aprobación de esta spec mediante el flujo SDD del repositorio.
