> ALCANCE SUSTITUIDO (2026-10-29): este documento corresponde a una demo mentec.dev. El usuario aclaró que el checkout es para Carreras Viajeras y pidió Stripe. No ejecutar este plan; consultar docs/specs/bookings-stripe-checkout.md y su plan Carreras. Este aviso no aprueba ninguna spec.

# Stripe Checkout sandbox — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una demo local de Checkout alojado para mentec.dev que registre una operación durable y confirme un único pago mediante Stripe, sin intervenir en Carreras Viajeras.

**Architecture:** Extender `modules/stripe-demo`, su webhook y SQLite local. Los Route Handlers delegan al módulo; el servidor controla el Price y la idempotencia. La UI consulta el estado local por TanStack Query y nunca acredita pagos desde el retorno.

**Tech Stack:** Next.js 16.4.2 App Router, React 19, TypeScript, Stripe SDK 23.0.1 / API `2026-09-30.endive`, Zod 4, TanStack Query 5, Vitest y `node:sqlite` de Node 24.

**Spec:** [stripe-checkout-sandbox.md](../../specs/stripe-checkout-sandbox.md), actualmente `Estado: borrador`. Este plan detalla su ejecución; no constituye una aprobación ni una implementación.

**Destino:** `C:/Users/ronal/carreras-viajeras-stripe`, rama `feat/stripe-checkout-sandbox`, puerto `3001`. Fecha: 2026-10-29.

## Global Constraints

- «Mantener la demo limitada a Node local, host loopback y puerto 3001».
- «Rechazar ejecución productiva, claves live y recursos livemode=true».
- «No crear un segundo webhook ni tocar lib/db-schema.ts».
- «No modificar APP_ORIGIN».
- «No persistir raw payloads, client_secret, datos de tarjeta ni credenciales».
- «La operación es el agregado financiero único: no sumar como dos pagos los snapshots Session y PI».
- «No cambiar cuentas o claves automáticamente».
- Ningún cambio en el checkout principal, puerto 3000, Mercado Pago, reservas, Neon, migraciones remotas o producción.
- Sin dependencias nuevas: Checkout alojado no necesita Stripe.js ni React Stripe. Sin Connect, suscripciones ni Invoicing en este trabajo.
- Una fase por sesión, máximo cinco tareas y aproximadamente quince archivos por fase. Trabajo secuencial sobre ledger y exports; commits, push y merge solo por decisión del usuario.
- No ejecutar builds sobre el árbol del dev server activo: usar una copia temporal aislada, sin archivos privados de entorno.

## Review Focus

1. Configuración cambiada entre reintentos: conservar los parámetros de la operación original; probarlo en F1.T3.
2. Stripe creó la Session pero SQLite falló al vincularla: recuperar con la misma clave, sin segundo recurso; probarlo en F1.T2/T3.
3. PI temprano, null o con evento ya ignorado: la Session canónica propia todavía puede confirmar el pago; probarlo en F2.T1.
4. Eventos distintos o del mismo segundo sobre un pago: una sola operación pagada, nunca regresión; probarlo en F2.T1.
5. Retorno sin token o cambio de acceso: no consultar ni mostrar caché anterior hasta autenticar otra vez; probarlo en F2.T3/T4.

## Estado de partida y decisiones

Existe `POST /api/webhooks/stripe` con firma sobre cuerpo original, rechazo de live, recibos persistentes, snapshots y asociaciones recurso→operación. No existe aún creación de Checkout, tabla de operaciones Checkout, API de estado ni UI de esta demo.

El código actual ignora de forma segura los eventos completed/PI.succeeded que no tienen asociación local. Esa protección se conserva. Otros eventos de Billing/Invoicing mantienen sus contratos y no participan en la contabilidad de Checkout.

Se usará **una spec de Checkout en dos fases**, porque creación, webhook y estado son un único recorrido. Billing e Invoicing tendrán specs propias posteriores.

Se proponen token local privado y un único Price de pago puntual. Son decisiones del borrador que deben quedar cerradas en F0. No se reutilizarán guards de Neon: pueden aceptar invitaciones y provocar escrituras.

Ajustes de secuencia respecto al borrador inicial: mover el getter lazy del ledger compartido en F1, sin alterar procesamiento; agrupar los nuevos casos de conciliación en el test existente del webhook; ampliar el script de replay en F2 para distinguir fixtures ajenos de operaciones propias. F1 toca 12 archivos de producto/tests; F2, 15. La documentación de este plan no cuenta como código de una fase.

## Fase 0 — Dependencias y preparación, sin código de producto

- [ ] Localizar la documentación solicitada `docs/stripe`. No existe en las copias inspeccionadas; incorporar sus referencias o recibir la indicación explícita de continuar tomando la spec y las fuentes actuales como base. No inventar su contenido.
- [ ] Cerrar acceso por token y catálogo de un Price. Obtener aprobación formal de `docs/specs/stripe-checkout-sandbox.md` según el flujo SDD del repositorio; no modificar el registro de aprobaciones.
- [ ] Mantener las variables actuales. Completar manualmente las que falten en `.env.local` del worktree, sin copiar otros entornos.
- [ ] Antes de pruebas conectadas, validar que CLI, clave de aplicación y Price pertenecen al mismo sandbox. La última auditoría detectó cuentas sandbox distintas. No cambiar credenciales o listener automáticamente.
- [ ] Registrar un baseline de pruebas del módulo y confirmar identidad del proceso de 3001 antes de verificar HTTP. No detener procesos ajenos.

| Variable | Uso / condición |
| --- | --- |
| `STRIPE_SECRET_KEY` | Servidor; exclusivamente clave test con permisos para leer Price/Session y crear Session. |
| `STRIPE_WEBHOOK_SECRET` | Firma del listener local que reenvía a 3001. |
| `STRIPE_PRICE_ID` | Price activo, test, one_time, de importe fijo positivo en el sandbox de la aplicación. |
| `STRIPE_CHECKOUT_ORIGIN` | Completar manualmente con `http://localhost:3001` o `http://127.0.0.1:3001`; se usa exactamente el origen seleccionado. |
| `STRIPE_CHECKOUT_DEMO_TOKEN` | Privado, al menos 32 caracteres; introducirlo manualmente en la demo. |

Conservar la clave publicable existente; este flujo no la necesita. No imprimir valores ni emitir errores con objetos de configuración.

**Salida F0:** base documental y spec aprobadas. Las pruebas unitarias posteriores funcionan con datos sintéticos y no necesitan credenciales; el E2E sí requiere resolver el sandbox común.

## Contratos que comparten las tareas

Tipos y schemas compartidos en `modules/stripe-demo/schemas/checkout.schema.ts`, derivados con Zod:

- `CheckoutState`: `creating | open | pending_payment | paid | failed | expired | needs_reconciliation`.
- `CreateCheckoutInput`: exactamente `{ requestId: UUID }`; rechazar campos extra.
- `CheckoutCreation`: `{ operationId: UUID, state: CheckoutState, checkoutUrl: string | null }`. URL presente solo cuando puede abrirse la Session.
- `CheckoutStatus`: `{ operationId: UUID, state: CheckoutState, amountMinor: number, currency: string }`.
- `CheckoutConfig`: `{ origin: string, priceId: string, demoToken: string, webhookSecret: string }`; privado, validado desde entorno solo en servidor.
- `CheckoutDependencies`: `{ stripe: Stripe, ledger: () => WebhookLedger, config: () => CheckoutConfig, now: () => number }`; now devuelve epoch en milisegundos.
- `CheckoutOperation`: registro interno con id, requestId, state, priceId, amountMinor, currency, sessionId/checkoutUrl nullables, createParams, idempotencyKey, createdAt y lastErrorCode seguro.
- `NewCheckoutOperation`: campos necesarios para insertar la operación original; no contiene credenciales.

HTTP: POST nuevo 201; replay 200; estado GET 200; entrada inválida 400; token inválido 401; origen ajeno 403; operación ausente 404; conflicto o conciliación necesaria 409; dependencia/configuración no disponible 503. Todas las respuestas usan `Cache-Control: no-store`, incluidos errores.

El webhook conserva 400 para firma inválida/live, 200 para recibo confirmado, duplicado o evento ajeno ignorado, y 500 para fallos reales de procesamiento. Ningún catch devuelve éxito para ocultar un fallo.

## Fase 1 — API de creación, operación e idempotencia

### F1.T1 — Configuración y acceso aislado

**Archivos**
- Crear `modules/stripe-demo/schemas/checkout.schema.ts` y `checkout.schema.test.ts`.
- Crear `modules/stripe-demo/utils/checkoutAccess.ts` y `checkoutAccess.test.ts`.
- Crear `modules/stripe-demo/services/stripeClient.ts`.
- Modificar `modules/stripe-demo/index.ts` únicamente con exports utilizados.

**Interfaces**
- `getStripeSandboxClient(): Stripe`: lazy y server-only; valida únicamente requisitos de la clave/SDK, sin exigir token de demo al webhook.
- `getCheckoutConfig(): CheckoutConfig`: lectura lazy y validación de las variables propias de Checkout.
- `checkCheckoutAccess(request: Request, config: CheckoutConfig): "unauthorized" | "forbidden_origin" | null`.

- [ ] Escribir tests: live/ausente/productivo se rechazan sin llamada Stripe ni valores en mensajes; origen admite solo HTTP loopback en 3001 sin paths, credenciales, query o fragmento; token exige longitud mínima.
- [ ] Probar acceso: token ausente/incorrecto → 401; Host/origen ajeno → 403; POST exige Origin exacto; GET admite Origin ausente, habitual en fetch same-origin, pero rechaza uno ajeno. Ambos exigen Host/origen de URL local y token válido; ignorar encabezados forwarded como autorización.
- [ ] Ejecutar los dos archivos nuevos con Vitest verbose y comprobar fallo por funcionalidades ausentes.
- [ ] Implementar schemas estrictos y comparación con `timingSafeEqual` tras comprobar longitudes. No importar guards de Neon ni inicializar SDK/configuración al cargar el módulo.
- [ ] Repetir tests hasta PASS. El schema de respuestas puede usarse en cliente; ningún import cliente debe ejecutar lectura de secretos.

### F1.T2 — Persistencia durable y recuperación

**Archivos**
- Modificar `modules/stripe-demo/services/webhookLedger.ts`.
- Modificar `modules/stripe-demo/services/webhooks.service.ts` solo para reutilizar el getter del ledger; conservar el comportamiento del handler.
- Crear `modules/stripe-demo/services/checkoutLedger.test.ts`.

**Interfaces de WebhookLedger**
- `reserveCheckout(input: NewCheckoutOperation): { operation: CheckoutOperation; created: boolean }`.
- `findCheckoutByRequestId(requestId: string): CheckoutOperation | null`.
- `findCheckout(operationId: string): CheckoutOperation | null`.
- `attachCheckoutSession(operationId: string, session: { sessionId: string; checkoutUrl: string | null; paymentIntentId: string | null }): CheckoutOperation`.
- `recordCheckoutError(operationId: string, code: string, needsReconciliation: boolean): void`, aceptando únicamente códigos internos enumerados.
- Exportar `getWebhookLedger(): WebhookLedger` lazy desde el archivo del ledger; webhook y Checkout comparten ruta/instancia local.

- [ ] Escribir tests con SQLite temporal real: evolución de una DB con tablas existentes, unicidad requestId/Session/clave, asociaciones no reasignables, persistencia tras cerrar/reabrir y rollback completo si falla el vínculo.
- [ ] Ejecutarlos y observar RED; usar entorno Vitest node y mock de server-only como en el test existente. Mantener la limpieza de temporales acotada al prefijo/directorio verificado.
- [ ] Añadir `checkout_operations` sin borrar datos ni tocar Neon. Amount en unidad mínima, entero positivo seguro; restricciones de estados e IDs únicos. Persistir solo parámetros permitidos, URL validada y códigos seguros.
- [ ] Reservar con transacción corta y constraint único. Guardar la operación antes de la red; vincular Session, PI si existe y operación de forma atómica antes de devolver la URL. No mantener transacciones abiertas durante llamadas Stripe.
- [ ] Ejecutar tests nuevos y los del webhook existente hasta PASS. Mantener las tres tablas y los recibos anteriores intactos.

### F1.T3 — Creación de Session y Route Handler

**Archivos**
- Crear `modules/stripe-demo/services/checkout.service.ts` y `checkout.service.test.ts`.
- Crear `app/api/stripe/checkout/route.ts`.
- Actualizar los exports del `index.ts` de F1.T1.

**Interfaces**
- `createCheckoutHandlers(dependencies: CheckoutDependencies): { POST(request: Request): Promise<Response> }`. F2.T2 amplía el retorno con GET; no publicar un stub en F1.
- `handleCreateCheckout(request: Request): Promise<Response>`: wrapper lazy de producción local para el handler.
- Route Handler: `export const runtime = "nodejs"` y `export const POST = handleCreateCheckout`.

- [ ] Escribir casos RED: request extra/importe/Price/URL manipulados o body mayor de 4096 bytes → 400; no autorizado → cero escrituras/llamadas; Price ajeno/inactivo/recurrente/custom/tiered/sin importe positivo → rechazo; Price válido → 201 y vínculo durable antes de responder.
- [ ] Probar explícitamente: `create(params, { idempotencyKey })`, mode payment, quantity 1, Price del servidor, retornos locales con operationId, client_reference_id opaco, integration_identifier persistido con sufijo de ocho letras; sin payment_method_types ni ui_mode. Fijar `adaptive_pricing: { enabled: false }` para mantener la moneda/importe esperados de esta demo; persistir también ese parámetro.
- [ ] Probar replay/concurrencia/reinicio: un requestId recupera una operación y Session; llamadas concurrentes pueden reintentar la misma clave, pero nunca parámetros/clave distintos. Un conflicto interno de asociación/parámetros → 409.
- [ ] Probar timeout y fallo de attach después de respuesta Stripe: la siguiente llamada recupera con la clave original. Cambiar STRIPE_PRICE_ID/origen de configuración no modifica parámetros ya reservados ni crea otro intento.
- [ ] Probar reloj/ventana: permitir reintentos inciertos solo antes de 23 horas desde createdAt; a partir de 23 horas, o timestamp futuro incoherente, devolver 409 needs_reconciliation sin nuevo POST Stripe. Una Session ya vinculada reutiliza su vínculo sin recrearla. Antes de volver a entregar su URL, comprobar la Session canónica: una respuesta de creación cacheada por idempotencia puede estar desactualizada. Si está completa, no reabrir Checkout ni marcar paid desde esa respuesta; esperar confirmación. Si expiró sin conciliación local, exigir conciliación sin crear otro intento automáticamente. Una respuesta 500 de Stripe puede quedar cacheada por idempotencia: conservar clave y exigir conciliación si no es recuperable.
- [ ] Ejecutar el archivo hasta observar los fallos esperados. Implementar: acceso → body estricto acotado → buscar intento → solo para nuevo intento leer Price canónico/validar/reservar → crear con parámetros inmutables → validar Session test/URL HTTPS exacta checkout.stripe.com → attach → responder. PI null es válido.
- [ ] Repetir hasta PASS. No registrar errores completos del SDK, Request, Authorization o JSON recibido. Un fallo de proveedor/persistencia no devuelve 201 ni declara paid.

**Decisiones de idempotencia:** clave estable `mentec-checkout-<operationId>`; ventana conservadora de 23 horas, inferior a las 24 horas mínimas de retención documentadas por Stripe. Nunca rotar automáticamente la clave para resolver un timeout, 409 de Stripe o 500.

### F1.T4 — Puerta de entrega del núcleo

- [ ] Ejecutar suite del módulo, TypeScript y lint con los comandos del cierre. Revisar el diff limitado a los doce archivos de F1.
- [ ] Confirmar con tests de handler: body/origen/token inválidos se rechazan antes de mutar; build/import no requiere secretos; la ruta POST existe y responde sin red en los casos negativos.
- [ ] Con configuración test válida, verificar una creación sandbox y su replay por API sin completar un pago. El token se suministra desde memoria, nunca en argumentos de consola, historial o logs.
- [ ] Documentar evidencia saneada: HTTP, operationId, estado y unicidad; no copiar respuesta completa Stripe ni URL/token privados al informe.

**Salida F1:** API capaz de crear o recuperar la misma Session de forma segura. No declarar todavía el Checkout completo ni un pago propio confirmado; eso exige F2. Parar al cerrar la fase según SDD.

## Fase 2 — Confirmación, consulta y pantalla de demo

### F2.T1 — Confirmación única mediante webhook

**Archivos**
- Modificar `modules/stripe-demo/services/webhooks.service.ts`, `webhooks.service.test.ts` y `webhookLedger.ts`.

**Interfaces**
- Extender el ledger con `applyCheckoutEvent(event: Receipt, snapshot: StripeSnapshot, transition: { operationId: string; nextState: CheckoutState; paymentIntentId: string | null }): boolean`.
- El retorno false significa recibo duplicado; fallo SQL lanza y permite reintento. Recibo, snapshot, asociación y transición se confirman juntos.

- [ ] Escribir RED con operaciones reales en SQLite temporal: completed unpaid → pending_payment; completed/async succeeded con Session canónica paid, importe, moneda, Price y quantity esperados → paid; fallo async canónico → failed; expired canónico → expired.
- [ ] Probar firmas inválidas, cuerpo alterado y live → 400 sin recibo; fixture ajeno sin operación → 200 ignorado sin pago; lectura canónica o SQL fallidos en operación propia → 500 sin consumir evento.
- [ ] Probar PI null al crear; PI.succeeded temprano ignorado antes del vínculo y Session posterior paid; Session+PI con eventos diferentes; duplicado concurrente; reinicio; evento antiguo y mismo timestamp. Afirmar una sola operación paid y su importe original.
- [ ] Implementar correlación solo desde asociaciones locales. Recuperar Session canónica propia con line_items expandidos y verificar condiciones esperadas antes de acreditar. Con PI conocido, recuperar la Session ya asociada y confirmar su estado; un PI succeeded aislado no acredita.
- [ ] Registrar PI→operación a partir de la Session canónica asociada cuando aparezca; preservar operationId en todos los eventos async. No usar metadata/client_reference_id como autorización para crear un pago.
- [ ] Añadir `checkout.session.expired`. Cancelación visual o payment_intent.payment_failed durante un intento de tarjeta no prueban por sí solos que la Session haya terminado. Paid es terminal; ni fallo/expiry atrasados ni snapshots del mismo segundo lo degradan.
- [ ] Ejecutar tests nuevos y todos los existentes hasta PASS. Mantener los handlers Billing/Invoicing/refund/dispute existentes y su comportamiento; no sumar snapshots como cobros distintos.

### F2.T2 — API protegida de estado

**Archivos**
- Modificar `modules/stripe-demo/services/checkout.service.ts`, `checkout.service.test.ts` e `index.ts`.
- Crear `app/api/stripe/checkout/[operationId]/route.ts`.

**Interfaces**
- Incorporar GET a la factory definida en F1.T3 y exportar `handleGetCheckout(request: Request, operationId: string): Promise<Response>`.
- La ruta await `params: Promise<{ operationId: string }>` y delega; runtime nodejs.
- Respuesta exactamente CheckoutStatus; consulta local sin llamadas de pago o lecturas Neon.

- [ ] RED: token ausente → 401, Origin/Host ajeno → 403, UUID inválido → 400, operación ausente → 404; acceso se verifica antes de revelar existencia.
- [ ] RED: GET autorizado sin Origin explícito funciona; devuelve únicamente los cuatro campos públicos, en unidades mínimas y con no-store. GET no crea Session, no infiere expiración por reloj ni marca paid.
- [ ] Implementar GET y repetir tests hasta PASS. Los exports server-only se consumen desde rutas/Server Components; los componentes cliente usan imports internos del módulo, nunca el barrel que exporta handlers privados.

### F2.T3 — Cliente HTTP y estado de servidor

**Archivos**
- Crear `modules/stripe-demo/services/checkout.client.ts` y `checkout.client.test.ts`.
- Crear `modules/stripe-demo/hooks/useStripeCheckout.ts` y `useStripeCheckout.test.ts`.

**Interfaces**
- `createCheckout(input: CreateCheckoutInput, token: string): Promise<CheckoutCreation>`.
- `getCheckoutStatus(operationId: string, token: string): Promise<CheckoutStatus>`.
- `useStripeCheckout({ token, operationId }): { create, status, clearAccess }`; create es una mutación con requestId, no con token como variable cacheada.

- [ ] RED: validar JSON de respuesta con Zod; traducir errores HTTP a códigos seguros; Authorization solo en header; no token en URL, query keys, datos retornados o excepciones.
- [ ] RED: sin token no hay consulta; cambio/retiro de token limpia consultas y mutación; retorno con operationId sin token permanece deshabilitado; no restaurar acceso desde caché.
- [ ] Implementar servicios con fetch nativo: no existe lib/api.ts en esta copia; no introducir un cliente HTTP global para una demo aislada. UI → hook → servicio.
- [ ] Implementar query key `["stripe-demo", "checkout", operationId]`; consulta cada 2 s mientras creating/open/pending_payment y autenticada, sin polling de fondo, sin retry automático de errores de acceso. Parar en estados terminales/needs_reconciliation. Mutación sin reintentos automáticos.
- [ ] Ejecutar ambos archivos hasta PASS. QueryClientProvider se agrega dentro de la demo en T4; no cambiar layout/providers globales.

### F2.T4 — Pantalla, apertura y retornos

**Archivos**
- Crear `modules/stripe-demo/components/StripeCheckoutDemo.tsx` y `StripeCheckoutDemo.test.tsx`.
- Crear `app/demo/stripe/checkout/page.tsx`.

**Interfaces**
- `StripeCheckoutDemo({ operationId, returnResult })` recibe solo parámetros de retorno públicos/no confiables; retorna UI de demo con provider local.
- Page es composición Server Component; await searchParams según Next instalado. Validar UUID/resultado en el módulo, no añadir lógica financiera en la página.

- [ ] RED: token password solo en memoria React; no HTML de servidor, localStorage, sessionStorage, URL o persistencia TanStack; volver desde Stripe exige reentrada.
- [ ] RED: doble clic no cambia requestId, submit pendiente se deshabilita, timeout permite recuperar el mismo intento; reload conserva solo requestId opaco en sessionStorage de la pestaña. Nunca persistir allí token o URL Checkout.
- [ ] Implementar con Button/Card/Input/Label instalados y mensajes accesibles. Crear requestId antes de la primera petición y conservarlo para reintentos; tras creación mostrar enlace HTTPS validado para abrir Checkout alojado.
- [ ] RED e implementación: result=success con estado local pendiente muestra pendiente, nunca éxito financiero; cancel no marca failed; expired permite «Nuevo intento» explícito con UUID nuevo. No generar un nuevo intento silencioso tras error incierto.
- [ ] Mostrar paid solo desde la API protegida. Cambiar acceso limpia caché; proteger la información durante reentrada. Sin navegación a CRM, guards Neon o enlaces del flujo Mercado Pago.
- [ ] Ejecutar test UI, cliente y hook hasta PASS. No añadir tests a la página que solo compone.

### F2.T5 — Verificación de extremo a extremo y evidencia

**Archivo**
- Modificar `scripts/test-stripe-webhook-replay.mjs`.

- [ ] Conservar modo actual de fixtures ajenos: ambos eventos → 200, duplicate true al repetir, recibo único y cero proyecciones/pagos.
- [ ] Agregar modo explícito `--operation UUID --checkout-event EVT --payment-intent-event EVT`: leer ledger en modo readOnly, obtener los eventos concretos por CLI en memoria, exigir test y vínculo con esa operación antes de firmar/enviar. Nunca seleccionar implícitamente el «último» evento para acreditar una operación.
- [ ] En ese modo, asserts de HTTP 200, segundo envío duplicate=true, recibo único por evento, una operación paid con Session/PI correspondientes y amount/currency originales. Mantener payload y firma solo en memoria. Cualquier fallo sale con código 1 y mensaje saneado.
- [ ] Ejecutar suite completa, TypeScript, lint y build en copia aislada. Obtener evidencia de POST sin firma → 400, no 404; GET de estado con acceso válido → 200.
- [ ] Confirmar mismo sandbox y secreto del listener sin mostrarlo. Reutilizar listener existente de 3001. Completar una Session creada por la aplicación en Checkout con datos oficiales de prueba; comprobar paid una vez.
- [ ] Reenviar los eventos de esa operación en modo explícito; probar además cancelación, evento async y expiración mediante tests automatizados firmados/canónicos mockeados. Si un método async no está habilitado en el sandbox, reportar que ese recorrido no tuvo E2E real.
- [ ] Ejecutar `stripe trigger checkout.session.completed` como prueba adicional de transporte y fixtures ajenos. Un fixture ignorado no sustituye el E2E de una operación propia.
- [ ] Revisión contra los veinte criterios de aceptación de la spec; informar HTTP reales, duplicados, logs saneados, pruebas fallidas y limitaciones. No anunciar éxito por una entrega ignorada o sin evidencia.

**Salida F2:** demo completa y verificada en sandbox. Nada desplegado; producción y otros productos Stripe permanecen fuera del alcance.

## Comandos de verificación para la ejecución posterior

Desde PowerShell, dentro del worktree Stripe:

```powershell
Set-Location -LiteralPath 'C:\Users\ronal\carreras-viajeras-stripe'
git branch --show-current
npx vitest run modules/stripe-demo --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js modules/stripe-demo app/api/stripe app/api/webhooks/stripe app/demo/stripe scripts/test-stripe-webhook-replay.mjs
npx vitest run --reporter=verbose
npm run lint
node scripts/verify-stripe-env.mjs
curl.exe -sS -i -X POST http://localhost:3001/api/webhooks/stripe -H 'Content-Type: application/json' --data '{}'
```

Resultados exigidos: comandos de checks exit 0; el último POST devuelve 400 y error invalid_signature. Los nuevos archivos/rutas de estos comandos deben existir antes de ejecutarlos. No se exige un número fijo de tests heredado de una auditoría anterior.

Solo si no hay listener activo, y tras verificar configuración test, el comando local es:

```powershell
stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
```

No arrancar un segundo listener ni reiniciar el actual. No copiar el secreto que muestra el CLI a informes/logs compartidos. Un proceso nuevo, si se autoriza y hace falta, debe iniciarse oculto con captura privada y validación del secreto sin imprimirlo.

Pruebas CLI una vez alineados los sandboxes:

```powershell
stripe trigger checkout.session.completed
node scripts/test-stripe-webhook-replay.mjs
# Ejecutar el siguiente modo después del pago propio; sustituir los IDs públicos:
node scripts/test-stripe-webhook-replay.mjs --operation 'OPERATION_UUID' --checkout-event 'CHECKOUT_EVENT_ID' --payment-intent-event 'INTENT_EVENT_ID'
```

**Build sin alterar 3001:** preparar copia temporal local de los archivos de código/configuración del worktree, incluyendo cambios pendientes; excluir .git, .env*, .dev.vars*, .next, .wrangler y el ledger. Reutilizar node_modules mediante junction dentro de la copia. Verificar rutas absolutas antes de copiar y ejecutar `npm run build` allí, sin cargar credenciales. No borrar/mover .next del worktree ni cambiar next.config.ts para esta comprobación; no aplicar migraciones ni deploy. Registrar la ruta y resultado; si el build requiere variables, usar solo valores sintéticos no operativos. Un build Node no prueba compatibilidad con Workers.

## Trazabilidad y cierre

| Requisitos de la spec | Tareas |
| --- | --- |
| 1–6: stack, límites, Price, origen y acceso | F1.T1/T3; F2.T2/T4 |
| 7–11: reserva durable, parámetros, idempotencia y recuperación | F1.T2/T3 |
| 12–15: confirmación canónica y operación financiera única | F2.T1 |
| 16: cancelación, expiración y nuevo intento explícito | F2.T1/T4 |
| 17: privacidad y no-store | F1.T1/T3; F2.T2–T5 |
| 18: listener y sandbox común | F0; F2.T5 |

No cambiar estado de la spec, approval ledger o casillas a hecho sin evidencia. Si una prueba no puede ejecutarse, registrar causa exacta y el criterio pendiente; no sustituirla por una afirmación de éxito. Este documento es un plan: aún no se ejecutaron sus tareas ni sus nuevas pruebas.

## Fuentes

- Spec y `docs/SETUP.md` del worktree.
- Código actual de webhook, ledger, verificación de entorno y replay, inspeccionado el 2026-10-29.
- Guías del Next instalado: `15-route-handlers.md`, `route.md`, `page.md` y `building.md`; params/searchParams son Promise y el build debe aislarse del dev activo.
- Tipos locales Stripe: `cjs/resources/Checkout/Sessions.d.ts`, `cjs/lib.d.ts`, `cjs/apiVersion.d.ts`.
- [Fulfill orders](https://docs.stripe.com/checkout/fulfillment?ui=full-page), consultado mediante Stripe MCP: confirmación canónica, duplicados y eventos async.
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), consultado con `stripe docs /api/idempotent_requests`: retención mínima, mismos parámetros y respuestas 500 cacheadas.
