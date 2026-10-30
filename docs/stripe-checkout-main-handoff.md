# Handoff: integrar Stripe Checkout a `main`

Fecha: 2026-10-30  
Rama de trabajo: `feat/stripe-checkout-mainline`  
Checkout: `C:\Users\ronal\carreras-viajeras-stripe`  
Repositorio principal: `C:\Users\ronal\carreras-viajeras`

## Estado actual

- `HEAD` está en `a8d47f1` y coincide con `origin/main`: la rama tiene **0 commits adelante y 0 atrás**. Todo el trabajo de Stripe está sin commit.
- El árbol está mixto: hay archivos staged, unstaged y untracked. No usar `git add -A`, `git reset`, `git restore` ni `git stash` sin revisar el contenido que se conservaría.
- El flujo de Checkout sandbox se probó con Clerk de desarrollo, Stripe test y Neon `dev-stripe`. Se guardó un contrato de prueba como `draft`; una reserva de prueba quedó confirmada por webhook. Ninguna de esas filas de desarrollo debe copiarse a producción.
- El rol `super_admin` asignado es solo de `dev-stripe`; no replicarlo en producción.
- `main` y producción no fueron modificados. No se ha hecho commit, push, PR, merge, despliegue ni migración productiva.

## Archivos del Checkout

### Rutas y experiencia

- `app/api/bookings/checkout/prepare/route.ts` y su test.
- `app/api/bookings/[bookingId]/checkout/route.ts` y su test.
- `app/api/bookings/[bookingId]/checkout/[attemptId]/route.ts` y su test.
- `app/api/bookings/[bookingId]/contract-acceptance/route.ts` y su test.
- `app/api/webhooks/stripe/route.ts`.
- `app/viajes/[slug]/checkout/page.tsx`.
- `app/viajes/ficha_viaje/registro/page.tsx`.
- `modules/booking-checkout/**`.
- `modules/contracts/**` y `app/crm/(protected)/contratos/page.tsx`.
- `modules/stripe-demo/**` (dispatcher y ledger del webhook Stripe).

### Integración con los dominios existentes

- `lib/db-schema.ts`, `lib/env.ts`, `middleware.ts`.
- `modules/accounts/components/CrmShell.tsx`, `CrmSidebar.tsx` y tests: enlace CRM de contratos.
- `modules/bookings/services/runnerPortal.service.ts` y test: visualización de liquidaciones Stripe en el portal del runner.
- `modules/trips/index.ts`, `modules/trips/services/trips.service.ts` y test: resolución server-side del ID de viaje publicado.
- `modules/landing/components/RacePageContent.tsx`, `RaceRegistrationSection.tsx`, tests e `index.ts`: enlace de la oferta al Checkout.
- `package.json`, `package-lock.json`, `.env.example`.

Revisar estos cambios junto con los módulos principales. No quitar los cambios del runner/landing/trips sin comprobar sus callers: conectan la ficha, el registro, el checkout y el portal de reservas.

## Migración y snapshots

- `drizzle/0020_stripe_booking_checkout.sql`
- `drizzle/meta/0020_snapshot.json`
- `drizzle/meta/_journal.json`

La 0020 agrega el esquema Stripe separado para intentos, aceptaciones contractuales, recibos de webhooks, liquidaciones y capacidad de oferta; conserva `booking_payments` para pagos manuales. Verificar el diff completo y los objetos previos antes de aplicar en cualquier base.

En la auditoría anterior, producción no tenía `drizzle.__drizzle_migrations` ni los objetos Stripe de checkout. **No ejecutar `drizzle-kit migrate` a ciegas desde 0000** ni recrear un historial ficticio. Primero comparar una copia reciente de producción con las precondiciones de 0020 y probar la migración allí. Aplicar una migración remota requiere autorización explícita separada.

## Documentación y archivos que necesitan clasificación

- Specs aprobadas de Checkout: `docs/specs/bookings-stripe-checkout.md` y `docs/specs/bookings-stripe-checkout-card-only-amendment.md`.
- Guía técnica del webhook: `docs/stripe-sandbox-webhook.md`.
- Planes: `docs/superpowers/plans/2026-10-29-carreras-booking-stripe-checkout.md` y `docs/superpowers/plans/2026-10-29-stripe-checkout-sandbox.md`.
- `docs/contracts/santiago-2027-v1.md` y `docs/contracts/santiago-2027-v1-sandbox.md` son borradores para desarrollo, **no contratos aprobados**. Mantenerlos fuera de cualquier flujo contractual de producción; incluirlos en el PR solo si se decide conservar explícitamente una muestra documental de sandbox.
- `scripts/stripe-connect-sandbox-example.mjs`, su test, `docs/specs/stripe-connect-sandbox-example.md` y `docs/superpowers/plans/2026-10-30-stripe-connect-sandbox-example.md` son una tarea Connect independiente. Separarla del PR de Checkout o dejarla fuera de este alcance; Connect no es requisito del flujo de reserva.
- No incluir `.env.local`, `.dev.vars`, logs locales ni `.stripe-sandbox/`. Este último es un directorio local ignorado por Git con scripts temporales.

## Validación registrada

- Vitest completo: **157 archivos aprobados, 3 omitidos; 3,435 tests aprobados, 6 omitidos**.
- ESLint: pasó con `npm run lint -- --ignore-pattern .stripe-sandbox/**`. El `npm run lint` sin filtro falla por 13 `no-require-imports` en scripts `.cjs` dentro de `.stripe-sandbox/`, carpeta local ignorada por Git; no cambiar esos scripts como parte de Checkout.
- `npx next typegen`: pasó.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: pasó tras completar el fixture `sandboxOnly` en `app/api/bookings/checkout/prepare/route.test.ts`.
- PostgreSQL aislado y webhook: los tests enfocados anteriores pasaron, incluida idempotencia de liquidaciones. E2E sandbox en `dev-stripe`: reserva `confirmed`, intento `completed`, liquidación `applied` por US$300/S/1,035, saldo US$10,700/S/36,915.
- `npm run build:worker`: **no pasó en Windows**. OpenNext falló con `EPERM` al limpiar `.open-next` antes de compilar; no se borró ese directorio manualmente. Reintentar en WSL/Linux después de parar el servidor local del puerto 3001 y usando `npm ci`; no ejecutar dos builds en el mismo directorio.

## Procedimiento para Claude Code

1. Trabajar desde `C:\Users\ronal\carreras-viajeras-stripe`, rama `feat/stripe-checkout-mainline`. Mantener `C:\Users\ronal\carreras-viajeras` (`main`) intacta durante la preparación.
2. Guardar una copia del `git status --short` actual y revisar por separado el índice (`git diff --cached`), cambios de trabajo (`git diff`) y archivos nuevos (`git ls-files --others --exclude-standard`). No descartar ni restagear en bloque.
3. Comparar los cambios con las dos specs aprobadas. Identificar cualquier cambio de cuentas, runner, landing o trips que no sea dependencia del Checkout y separarlo sin revertir trabajo ajeno.
4. Revisar `package-lock.json`: asegurar que conserve las dependencias necesarias (`stripe`, `pg`/types para tests) y minimizar ruido de metadata no relacionado. No copiar dependencias de `node_modules`.
5. Repetir la suite de validación. Ejecutar `npm run build:worker` en WSL/Linux; reportar el fallo si el entorno Linux tampoco está disponible, sin declarar build aprobado.
6. Preparar un diff/commit de feature revisable, excluyendo secretos, registros de reserva/pago de `dev-stripe`, asignaciones de rol de desarrollo y cualquier modificación del proyecto Connect si se deja para otro PR.
7. Presentar el diff, archivos incluidos/excluidos, migración y resultados. No hacer push, PR, merge a `main`, despliegue ni migración remota hasta la aprobación explícita del usuario: **“Sí, apruebo”**. La aprobación del merge no autoriza automáticamente producción.

## Preparación para producción: puertas obligatorias

El flujo probado es una **demo en sandbox**. No se considera listo para producción por haber completado un pago de prueba. Mantener Checkout deshabilitado en producción hasta que se cumplan todas las puertas de esta sección y el usuario autorice por separado las operaciones productivas.

### 1. Elegibilidad de Stripe y alta comercial

- Verificar en el Dashboard de Stripe qué entidad legal y país están asociados a la cuenta que recibirá los fondos, que la cuenta puede procesar pagos y que los requisitos de verificación/KYC están completos. Una cuenta de prueba o una cuenta creada con datos de otro país no demuestra elegibilidad productiva.
- La lista oficial actual de países admitidos para empresas no incluye Perú. Si la entidad legal que operará es peruana, detener el go-live y resolverlo con Stripe/asesoría empresarial antes de aceptar pagos live. Cobrar solo tarjetas no elimina esta condición. No usar una entidad, dirección, cuenta bancaria o identidad que no corresponda a la empresa.
- Confirmar que el Dashboard permite activar Payments, Checkout, reembolsos y el mecanismo de liquidación para la entidad real. Guardar evidencia administrativa sin incluir datos personales o financieros en el repositorio.

### 2. Legal, comercial e impuestos

- Obtener aprobación comercial/legal del contrato aplicable, términos de reserva, política de cancelación/reembolso, calendario de pagos y texto que verá el cliente. Los documentos `santiago-2027-v1*.md` presentes en esta rama son muestras de sandbox, no aprobaciones legales; excluirlos del flujo productivo salvo revisión y aprobación propias.
- Confirmar con asesoría contable/fiscal las obligaciones en cada jurisdicción de la empresa y sus clientes. No activar Stripe Tax ni `automatic_tax` hasta confirmar registros fiscales activos, ubicación, códigos fiscales de productos y reglas aplicables.
- Definir quién emite el comprobante fiscal, cómo se concilia el importe cobrado, comisiones, reembolsos, disputas y diferencias de moneda. No asumir que Stripe sustituye las obligaciones locales de facturación.

### 3. Credenciales y configuración aislada

- Configurar los secretos directamente en el gestor seguro del entorno productivo; no copiar `.env.local`, `.dev.vars`, logs ni valores de sandbox. Mantener llaves restringidas al mínimo de permisos cuando el flujo lo permita, rotación documentada y acceso limitado.
- Revisar solamente presencia y clasificación internamente, nunca imprimir valores. `STRIPE_SECRET_KEY` debe pertenecer a la cuenta live aprobada; `STRIPE_WEBHOOK_SECRET` debe ser el secreto del endpoint live registrado; `APP_ORIGIN`/`STRIPE_CHECKOUT_ORIGIN` debe ser el dominio HTTPS canónico de producción y `STRIPE_CHECKOUT_ENABLED` debe quedar apagado hasta completar el checklist.
- `STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS` debe estar ausente o `false` en producción. La aplicación debe fallar de forma cerrada si detecta configuración sandbox, secretos test o falta de configuración requerida.
- Verificar el prefijo/modo de cada clave sin imprimirla ni registrarla. Mantener credenciales de test y live en almacenes y entornos separados; nunca compartir el secreto del webhook de CLI con Stripe Dashboard.

### 4. Base de datos y migración

- Obtener una copia reciente y aislada de producción, comparar esquema y datos relevantes contra la precondición exacta de `drizzle/0020_stripe_booking_checkout.sql`, y ejecutar la migración primero sobre esa copia. Revisar SQL, snapshots, índices únicos, FKs, checks, permisos/RLS si aplican, rendimiento y compatibilidad de despliegue.
- La auditoría previa observó que producción carecía de `drizzle.__drizzle_migrations` y del esquema Stripe. No ejecutar `drizzle-kit migrate` ciegamente ni inventar registros de historial. Preparar un procedimiento de aplicación único, verificable y con respaldo/recuperación; el propietario debe aprobar la migración productiva por separado.
- Después de aplicar con autorización, verificar objetos y restricciones esperados, historial coherente, conectividad de la app y ausencia de registros de sandbox. No copiar reservas, pagos, contrato de prueba, recibos webhook ni rol `super_admin` desde `dev-stripe`.

### 5. Webhooks y seguridad del flujo

- Registrar en modo live el endpoint HTTPS exacto `<APP_ORIGIN>/api/webhooks/stripe` y habilitar solo los tipos requeridos por el handler actual, incluidos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` y los eventos de PaymentIntent que realmente procese el código. Confirmar que cada evento soportado está cubierto por pruebas.
- Validar la firma Stripe sobre el cuerpo HTTP sin modificar y con el signing secret de ese endpoint. Rechazar firma ausente/inválida; no exponer payloads completos, secretos, datos de tarjeta, SQL ni stack traces al cliente.
- Tratar eventos como entrega al menos una vez: persistir el ID del evento con restricción única y aplicar cambios de negocio de forma transaccional/idempotente. Reintentos o replay deben producir un único settlement para una reserva. La página success/cancel nunca confirma el pago por sí sola.
- Antes de liquidar, cotejar la reserva/intento local con IDs de metadata/session, moneda, importe esperado, estado de pago y cuenta Stripe. Solo un pago confirmado por Stripe puede confirmar la reserva; estados inconsistentes van a error/revisión y generan alerta, no un pago ficticio.
- Comprobar secretos y privacidad de logs, CSRF/origen en endpoints de creación, autorización Clerk y ownership de reserva, rate limiting donde aplique, protección de datos personales y manejo de disputas/reembolsos.

### 6. Observabilidad, operación y reversión

- Emitir logs estructurados con request ID, Stripe event ID, checkout attempt/booking ID interno y resultado; excluir claves, client secrets, payloads con PII y datos de pago. Configurar alertas para webhooks 4xx/5xx repetidos, eventos pendientes, settlement `needs_review`, discrepancias de importe y crecimiento anómalo de sesiones.
- Documentar quién atiende alertas, cómo inspeccionar el evento en Dashboard, cómo reintentar de manera idempotente, cómo conciliar reservas contra Stripe y cómo resolver/refundir una operación. Probar el procedimiento de replay/reconciliación sin duplicar asientos.
- Preparar rollback de aplicación y plan de compatibilidad de base de datos. No borrar tablas ni revertir datos de pagos automáticamente; detener nuevos checkouts con el feature flag y preservar evidencia para conciliación.

## Criterios de aceptación para declarar listo el Checkout

Cada punto debe tener evidencia reproducible (comando, test, captura redactada o consulta de solo lectura). Un punto pendiente bloquea el go-live.

### Integración y datos

- [ ] Diff revisado contra ambas specs aprobadas; Mercado Pago y sus modelos/flujo de producción permanecen intactos; Connect y ejemplos Connect no se mezclan con el Checkout de reservas.
- [ ] Migración 0020 revisada en su totalidad y aplicada con éxito sobre una copia desechable reciente de producción; precondiciones, constraints, índices, tipos, snapshots y estado final verificados. Ninguna migración live hasta aprobación explícita.
- [ ] El entorno arranca con Node 24 y lockfile limpio; lint, suite completa, `next typegen`, `tsc --noEmit` y `build:worker` pasan. `build:worker` debe verificarse en WSL/Linux si Windows reproduce el `EPERM`; no sustituirlo por `next build`.
- [ ] Configuración de desarrollo y producción separada. Producción deshabilita Checkout si falta una variable, si hay clave test, si el origen no es HTTPS/allowlisted o si está activo el bypass de contrato sandbox.

### Pago, webhook e idempotencia

- [ ] Una oferta activa y vigente produce un quote server-side; el cliente no puede cambiar precio, moneda, booking, runner, términos ni estado mediante campos manipulados.
- [ ] Para el caso Santiago usado en la demo, el quote aprobado de prueba conserva USD 11,000 total, depósito USD 300/PEN 1,035 y saldo USD 10,700/PEN 36,915 a tasa 3.4500; la moneda y los importes menores/unidades enviados a Stripe coinciden con la especificación y la base de datos.
- [ ] Una solicitud válida crea/reutiliza únicamente el intento esperado y produce una sesión Checkout con URLs correctas, IDs internos vinculados y clave de idempotencia estable. Repetir la solicitud no crea intentos/sesiones de negocio duplicados.
- [ ] Firma inválida o ausente devuelve 400; evento válido devuelve 2xx solo después de persistir el recibo y el resultado necesario. Fallo de DB/procesamiento devuelve no-2xx para permitir reintento; no hay 200 indiscriminado.
- [ ] `checkout.session.completed` con `payment_status` no pagado no confirma reserva ni registra liquidación. Evento pagado válido confirma una sola liquidación con importe/moneda correctos y deja el saldo pendiente calculado; `async_payment_succeeded` sigue la misma regla si aplica.
- [ ] Reentregar el mismo event ID, entregar eventos concurrentemente y reintentar una solicitud de preparación deja un solo recibo efectivo/liquidación por pago. Un evento sin relación local no crea booking ni pago.
- [ ] Cancelación, expiración, pago fallido, pago asincrónico fallido, firma inválida, mismatch de importe/moneda/IDs, Stripe no disponible y base de datos no disponible tienen estados/mensajes definidos, sin confirmar reservas ni perder la capacidad de reintento.
- [ ] El retorno del navegador (success/cancel) solo consulta estado server-side; nunca acredita pago. El portal del corredor muestra pago recibido y saldo restante desde datos persistidos del servidor.

### Experiencia y acceso

- [ ] Usuario no autenticado recibe 401 claro; usuario autenticado solo puede preparar/ver su reserva propia conforme a las reglas Clerk; autorización se comprueba server-side y no depende del middleware solo.
- [ ] Errores estructurados preservan códigos para `contract_unavailable`, `rate_unavailable`, conflicto, Stripe y error interno; UI en español ofrece mensaje accionable y referencia correlacionable sin filtrar stack trace, SQL, secretos o PII.
- [ ] La aceptación contractual queda asociada a la versión documental exacta y al actor/fecha. Producción solo usa contrato legal/comercialmente aprobado; la ruta sandbox no puede habilitar borradores en live.

### Go-live (aprobación independiente)

- [ ] Stripe confirma elegibilidad de la entidad legal que recibirá los fondos y cuenta habilitada para live; el país de los compradores no se usa como sustituto de la elegibilidad del merchant.
- [ ] Legal/contabilidad aprueba contrato, reembolsos, pagos parciales, comprobantes e impuestos; Stripe Tax está apagado hasta verificar registro fiscal activo y configuración aplicable.
- [ ] Variables live y endpoint webhook live configurados en el gestor secreto del hosting; verificación sin revelar valores, acceso mínimo, rotación y responsable operativo documentados.
- [ ] Dashboard live, dominio HTTPS, alertas, conciliación, reintento idempotente, soporte, rollback y procedimiento de incidentes revisados y ensayados.
- [ ] Revisión final de PR y checks completos en CI; la migración, merge a `main`, push y despliegue siguen siendo operaciones separadas, cada una con autorización expresa. La autorización de una no implica las demás.

## Referencias oficiales para revisión de go-live

- Stripe Go-live checklist: https://docs.stripe.com/get-started/checklist/go-live
- Stripe global availability (países donde empresas pueden abrir cuenta): https://stripe.com/global
- Requisitos para abrir cuenta en otro país: https://support.stripe.com/questions/requirements-to-open-a-stripe-account-in-another-country
- Checkout fulfillment y webhooks: https://docs.stripe.com/checkout/fulfillment
- Firmas de webhooks: https://docs.stripe.com/webhooks/signature
- Reintentos de webhooks: https://docs.stripe.com/webhooks#automatic-retries
- Claves API: https://docs.stripe.com/keys
- Stripe Tax y registros: https://docs.stripe.com/tax/registering

## Mensaje de handoff para Claude Code

> Continúa la integración de Stripe Checkout desde `C:\Users\ronal\carreras-viajeras-stripe`, rama `feat/stripe-checkout-mainline`, usando `docs/stripe-checkout-main-handoff.md` y las dos specs aprobadas. Primero clasifica y revisa staged/unstaged/untracked sin perder cambios. Integra Checkout nativamente con landing, trips, CRM de contratos y runner; conserva Mercado Pago y los pagos manuales. Excluye secretos, datos/roles de `dev-stripe` y Connect sandbox del cambio Checkout. Valida tests, lint, typegen, TypeScript y build:worker (WSL/Linux). Entrega un diff y migración revisables. Usa las puertas y criterios de aceptación de producción de este handoff como checklist; no declares listo para live hasta cumplirlos. No toques `main`, no hagas push/merge/deploy y no migres producción sin autorización explícita “Sí, apruebo”.
