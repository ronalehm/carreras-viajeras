# Carreras Viajeras — reserva, contrato y Stripe Checkout

- Módulos: booking-checkout (nuevo), contracts (nuevo), bookings, landing y trips (lecturas existentes).
- Estado: aprobado
- Alcance: Carreras Viajeras; desarrollo y pruebas exclusivamente sandbox.
- Worktree: C:/Users/ronal/carreras-viajeras-stripe
- Rama de trabajo actual: feat/stripe-checkout-sandbox
- Base funcional necesaria: ce8fa4f (merge de ofertas/captación/automatización), inspeccionada a través de 783cbcd. La rama actual parte de 907a722; no tiene todavía ofertas ni lib/currency.ts.
- Pedido explícito del usuario: «implementar con stripe todo el checkou, las ofertas y demas de acuerdo a la arquitectura».
- Plan: [2026-10-29-carreras-booking-stripe-checkout.md](../superpowers/plans/2026-10-29-carreras-booking-stripe-checkout.md).
- Sustituye, para este pedido, el borrador mentec.dev stripe-checkout-sandbox.md. No modifica el registro de aprobaciones.

## Objetivo

Que un corredor seleccione una oferta de carrera y pago total o anticipo permitido, se identifique, acepte un contrato versionado y pague mediante Stripe Checkout alojado. El servidor mantiene la oferta y el principal USD aceptados, fija el importe PEN por intento y confirma cada cobro una sola vez mediante webhook válido.

El recorrido es: enlace/campaña → oferta → identidad verificada → reserva → contrato → resumen del cobro → Stripe → estado de confirmación. La vuelta de Stripe no registra un pago.

## Revisión de lo existente

| Pieza | Evidencia inspeccionada | Consecuencia |
| --- | --- | --- |
| Ofertas aprobadas, activación e historial | modules/trips/services/offers.service.ts y trips-commercial-offers.md | Reutilizar getActiveOffer; no duplicar CRUD ni inventar precios. |
| Cambio USD→PEN exacto | lib/currency.ts y exchangeRates.service.ts | Reutilizar parseUsdPenRate/usdToPenCents; congelar id y valor de la tasa por intento. |
| Registro público | app/viajes/[slug]/registro/page.tsx | Actualmente capta leads y muestra oferta; todavía no crea una compra. |
| Reservas | lib/db-schema.ts y bookings.service.ts | Son manuales; falta offer_version_id, aceptación y checkout. |
| Pagos | booking_payments | Pagos manuales en USD enteros, sin proveedor/external_id/moneda cobrada. No guardar allí una respuesta Stripe ni céntimos PEN. |
| Identidad y portal | lib/auth/guards.ts y runnerPortal.service.ts | Reutilizar identidad verificada; autorización por runner_user_id. Un id/email del request no otorga acceso. |
| Pasarela comercial | trips-commercial-offers.md, líneas iniciales y contrato futuro | Mercado Pago está previsto en la arquitectura; no se encontró implementación de su checkout en la base inspeccionada. |
| Webhook de la rama Stripe | modules/stripe-demo, Node/SQLite local | Es un experimento técnico con firma y deduplicación. No constituye la contabilidad de reservas ni sirve como almacenamiento del Worker. |
| Documentación docs/stripe | C:/Users/ronal/codigo-vibecoding-g1/ecommerce/docs/stripe/README.md | Es de otra tienda. Aplican los principios generales; sus tablas orders/payments/stock y price_data no son código de Carreras. |

Las futuras specs bookings-runner-self-service, bookings-contract-acceptance y bookings-mercadopago se mencionan en la arquitectura aprobada, pero no existen como archivos en la base inspeccionada.

## Enmiendas declaradas a la arquitectura aprobada

Este borrador propone, conforme al pedido del usuario, las siguientes modificaciones; su aprobación SDD es previa a implementarlas:

1. En el plan maestro y contrato futuro de trips-commercial-offers, Stripe Checkout alojado sustituye al proveedor previsto Mercado Pago para este recorrido. No construir una capa multiproveedor, ejecutar Mercado Pago en paralelo ni trasladar modelos del ecommerce.
2. Esta spec entrega juntas las capacidades pendientes de autoservicio, aceptación contractual e integración de pasarela. Las ofertas siguen siendo el origen comercial y no cambian sus reglas de aprobación, vigencia, campaña ni inmutabilidad.
3. El bloque público puede añadir «Continuar con la reserva» cuando hay oferta válida; deja de aplicar su restricción previa de no tener botón de reserva. Sin oferta válida conserva el comportamiento sin importes vendibles.
4. Las reservas nuevas de autoservicio guardan la versión de oferta, total/anticipo y condiciones aceptadas. Las reservas manuales existentes conservan su contrato; no se convierten automáticamente.
5. El portal incorpora pagos Stripe confirmados como una fuente identificable adicional al registro manual, conservando ambos historiales y sin crear una copia manual del pago Stripe.
6. El desarrollo continúa en sandbox. No autoriza habilitar producción, cambiar entidad/cuenta, aplicar migraciones remotas, desplegar, hacer push/merge o modificar el checkout de Claude.

No editar las specs aprobadas ni approvals.jsonl para simular esta enmienda. Esta spec nueva es la propuesta revisable.

## Alcance

Incluye reutilizar ofertas existentes, reservas con cupos, contratos versionados y su administración mínima, elección de pago total/anticipo/saldo, cobro en PEN, idempotencia, webhook, consulta protegida, pantalla del corredor, reflejo financiero en portal/CRM y pruebas.

No incluye crear un nuevo catálogo Stripe, suscripciones/Billing, Invoicing, Connect, Tax automático, tarjetas guardadas, checkout embebido, reembolsos iniciados automáticamente, sincronización multiproveedor o datos/pagos reales. El país no bloquea sandbox.

Los textos legales reales los aporta el negocio. No inventar un contrato legal: si no hay versión aprobada correspondiente a terms_version, el pago se bloquea y el admin puede crearla en el módulo de contratos.

## Requisitos

### Ofertas, identidad y reservas

1. Resolver la oferta en servidor con getActiveOffer(tripId, campaignId confiable/resuelta). Debe estar aprobada, activa y vigente para el viaje publicado. Ningún importe, descuento, tipo de cambio, usuario o estado del cliente es autoritativo.
2. Reutilizar las reglas de campaña aprobadas: oferta de campaña aplicable primero, general después. Guardar la campaña/oferta elegidas en la reserva. No ampliar atribución o privilegios por un id enviado sin validar.
3. Exigir sesión y correo verificado. Todas las acciones de una reserva usan booking.runner_user_id = usuario verificado; una reserva ajena o inexistente no revela datos.
4. La selección inicial es pago total o una de deposit_options_usd. El principal total queda fijado por final_price_usd; no aceptar cantidades arbitrarias. Un pago posterior de saldo usa la deuda USD de esa reserva, sin reconstruirla desde el tipo de cambio actual.
5. Crear la reserva durable antes del cobro; guardar offer_version_id, versión/condiciones, USD total, anticipo elegido, fecha de saldo y snapshots necesarios del viaje. No modificar reservas manuales antiguas sin un proceso explícito del equipo.
6. Cupos: una reserva/retención ocupa una sola plaza, nunca dos por existir un intento Stripe. La capacidad de la oferta se decide atómicamente con la asignación. Sin capacidad_limit no inventar un límite. Concurrencia al último cupo permite un solo ganador.
7. Usar un registro de asignación/capacidad separado de las condiciones inmutables de la oferta. Todos los caminos de liberar/cancelar convierten la asignación una sola vez, también la cancelación desde CRM. No usar leer count en JavaScript y después insertar.
8. Reservas pendientes tienen vencimiento explícito, compatible con el mínimo de expiración de Checkout (30 minutos). Liberar solo tras demostrar que no hay un cobro confirmado ni un intento en procesamiento/resultado incierto que aún necesite conciliación. No hacer cron ni cerrar una compra por visitar cancel_url.

### Contratos

9. Versiones de contrato con clave única compatible con trip_offers.terms_version, texto, hash, autor y aprobación. El admin con offers.manage puede crear/editar borrador y aprobar; una versión aprobada es inmutable. No renombrar/reutilizar una clave aprobada.
10. El contrato presentado incluye el texto aprobado, oferta/version, condiciones de pago y copia de includes/excludes del viaje, con campos personales limitados a lo necesario. Guardar el documento/hash/version y la aceptación del usuario con hora de servidor. Sin raw requests, token, tarjeta ni datos innecesarios.
11. El checkbox explícito y el hash del documento deben corresponder al documento que el servidor fijó para esa reserva. Cambio o discrepancia → 409 y nueva revisión; no crear Session hasta aceptar. No interpretar payment_status como aceptación contractual.

### Cotización e intentos

12. Cada intento guarda requestId/idempotencyKey únicos, bookingId, clase initial/balance, principal USD, exchange_rate_id, usd_pen en precisión exacta, amount_pen_cents, currency=pen, vencimiento, parámetros inmutables, Session/PI y estado.
13. Leer la tasa vigente con su id; el contrato público getCurrentExchangeRate actual solo devuelve valor/fecha. Añadir lectura interna para Checkout con id, sin romper el contrato público ni devolverlo a visitantes.
14. Calcular con usdToPenCents. Mostrar el importe y la regla al corredor antes de crear la Session. La misma clave conserva su cotización aunque después cambien tasas/configuración. Un intento explícito nuevo puede tomar otra tasa, con nueva confirmación visible.
15. Solo un intento no resuelto de la misma obligación puede iniciarse a la vez. Cambiar requestId, doble clic, otra pestaña o reiniciar no habilita dos cobros concurrentes. No cobrar saldo inexistente ni aplicar nuevamente un anticipo ya satisfecho.
16. Persistir antes del POST Stripe y usar RequestOptions.idempotencyKey. No mantener transacción de PostgreSQL abierta durante la red. Las escrituras usan una sentencia SQL/CTE o db.batch compatible con neon-http.
17. Timeout o fallo después de crear Session: conservar clave/parámetros; recuperar el mismo recurso. Antes de 23 h se permite recuperar un resultado incierto con la misma clave; a partir de ese margen, o frente a resultado no recuperable, exigir conciliación, no rotar clave. Si hay Session conocida, consultar su estado canónico, no crear otra.
18. Usar Stripe SDK oficial, mode=payment, Checkout alojado y line_items.price_data construido desde el snapshot PEN del servidor, cantidad 1 y descripción de la obligación. Sin STRIPE_PRICE_ID global ni importes del navegador. Deshabilitar Adaptive Pricing para no variar el importe PEN aceptado; conservar métodos de pago dinámicos.
19. URLs construidas desde origen autorizado, operación opaca en client_reference_id y etiqueta integration_identifier estable por intento. Sin PII en metadata, claves idempotentes o URLs. PI puede ser null inicialmente. Persistir el vínculo Session antes de entregar la URL HTTPS de Stripe.

### Webhooks y finanzas

20. Conservar POST /api/webhooks/stripe; firma SDK sobre bytes/cuerpo original antes de parsear JSON o escribir. Rechazar firma inválida/live/Connect no configurado con 400; limitar cuerpo. La autenticación del corredor no se aplica al webhook.
21. Correlacionar Session/PI con un intento local; metadata/client_reference_id no autorizan crear reservas o pagos. Fixture ajeno → 200 ignorado sin saldo/pago. Un fallo de consulta o persistencia de intento conocido → 500 sin consumir recibo, para reintentar.
22. Recuperar la Session canónica y exigir test, modo, importe y moneda esperados y payment_status=paid para confirmar. Completed unpaid permanece pendiente. PI.succeeded solo ayuda a correlacionar; no suma otro pago ni acredita por sí solo la reserva.
23. Soportar checkout.session.completed, async_payment_succeeded, async_payment_failed y expired; soportar PI temprano/null y orden inverso. Los eventos distintos del mismo pago y timestamp no degradan un estado liquidado. Los eventos fuera del alcance responden ignorado sin alterar reservas.
24. Guardar recibo de evento, transición de intento, liquidación única, asignación/cupo, efecto en reserva y auditoría/outbox requeridos por la arquitectura en la misma unidad atómica. Un rollback no deja recibo ni un pago parcial.
25. Crear un registro financiero único por intento/Session, con principal USD e importe PEN/tasa de ese cobro. No insertar automáticamente una fila en booking_payments ni convertir de vuelta PEN a USD. Los manuales siguen intactos; consultas de saldo agregan fuentes identificadas y cuentan cada pago una sola vez.
26. Un anticipo pagado confirma la obligación inicial y conserva saldo pendiente; no significa viaje totalmente pagado. Una reserva sigue usando pending/confirmed/cancelled; no inventar booking.status=paid. Solo la liquidación del principal total permite tratar la deuda como saldada en CRM/portal.
27. Un cobro válido que llega tras cancelación/liberación de cupo, o cuyo importe no corresponde, queda como incidencia financiera explícita needs_reconciliation sin conceder plaza ni prometer reserva. Acusar 200 solo tras persistir esa incidencia; fallo de persistencia → 500. No ejecutar reembolso automático.

### UI, entorno y seguridad

28. Recorrido integrado desde /viajes/[slug]/registro hacia checkout de esa carrera; preservar campaña válida. La UI usa autenticación del corredor, no STRIPE_CHECKOUT_DEMO_TOKEN. Retorno/refresh consultan estado protegido y jamás escriben paid.
29. Estados visibles: identificación, oferta/anticipo, contrato, resumen PEN, abriendo Checkout, pendiente, anticipo confirmado/saldo pendiente, liquidado, expirado e incidencia. Cancelar permite continuar el mismo intento abierto; reintento nuevo es explícito y seguro.
30. Runtime compatible con el objetivo Workers/OpenNext y Neon; no usar node:sqlite para contabilidad comercial. Revisar SDK/adaptador crypto/fetch y ejecutar build Worker antes de considerar despliegue. Esta tarea no despliega.
31. Sandbox desactivado por defecto. STRIPE_CHECKOUT_ENABLED debe habilitarse explícitamente; exigir sk_test_/rk_test_ y recursos livemode=false. Sin variables y sin habilitación, no leer/escribir reservas ni iniciar auth/Stripe. La bandera no autoriza usar una DB productiva.
32. Antes de ejecutar escrituras conectadas se necesita una DB y Auth de desarrollo verificadas, no las de producción. No copiar .env enteros ni sobrescribir secretos. .env.local/.env.example solo añaden variables ausentes; mantener las existentes.
33. Las variables necesarias para el cobro son STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CHECKOUT_ORIGIN y STRIPE_CHECKOUT_ENABLED. También aplican DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET y APP_ORIGIN del entorno de desarrollo. El esquema de origen admite 3001 solo en desarrollo; producción no se habilita.
34. STRIPE_PRICE_ID y STRIPE_CHECKOUT_DEMO_TOKEN del experimento anterior no son requisitos del nuevo flujo; preservar sus valores sin usarlos. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY no se necesita para redirect alojado.
35. Errores públicos fijos, sin mensajes SDK/SQL ni objetos de request/configuración. Cache-Control:no-store en respuestas privadas y errores. Validación Zod en límites; dinero con enteros; autorización, CSRF/origen y rate limits apropiados a creación de intentos.
36. Mantener Claude/puerto 3000 intactos. Actualizar solo nuestra rama con una base funcional aprobada, preservando cambios locales con un respaldo acotado que excluya secretos. No ejecutar merge/rebase/stash o restauraciones destructivas de forma implícita; describir y revisar el cambio de base antes.
37. Solo sandbox; sin cobros reales, migraciones remotas, despliegues, push o merge. No modificar otra rama, archivos de entorno externos, cuenta del CLI, listener o claves para resolver discrepancias.

## Persistencia propuesta

Adiciones a PostgreSQL/Drizzle, generadas localmente y revisadas, nunca aplicadas de forma remota en esta tarea:

- contract_versions: clave, borrador/aprobado, documento, hash y aprobación inmutable.
- bookings: campos aditivos de oferta/selección y snapshot, sin rellenar automáticamente reservas antiguas.
- booking_contract_acceptances: documento/version/hash/usuario/fecha, único para el documento de reserva aceptado.
- offer_capacity_allocations: una asignación por reserva y protocolo de capacidad mutable separado de trip_offers; held/confirmed/released, con vencimiento. Constraint y actualización condicional protegen el último cupo.
- booking_payment_attempts: cotización inmutable, idempotencia, Session/PI, estado, errores seguros y vencimiento; unicidad del intento activo por obligación.
- stripe_booking_event_receipts: id único de evento y resultado mínimo de manejo.
- booking_stripe_settlements: un registro por intento/cobro; principal USD, PEN/tasa, procedencia e incidencia/auditoría.

Estados de intento: creating, open, pending, succeeded, failed, expired, needs_reconciliation. Succeeded no se revierte a unpaid. Una devolución futura sería otra operación explícita, no borrar el pago.

El protocolo de cupos debe cubrir también cancelaciones manuales de reservas nuevas. Las migraciones se numeran sobre la base final; no reservar un número que choque con Claude ni regenerar sus snapshots/journal.

## Rutas y módulos propuestos

- modules/contracts: schemas/services/actions/components y API pública index.ts. Administrador en /crm/contratos; reutilizar offers.manage (admin).
- modules/booking-checkout: schemas, cotización y reserva, aceptación, intentos, SDK Stripe, webhook, cliente/hook y RunnerCheckout.
- POST /api/bookings/checkout/prepare: input { tripId, campaignCode?, paymentChoice, requestId }; sesión verificada; respuesta de reserva/contrato/cotización del servidor. paymentChoice es full o un índice de anticipo permitido, no un importe.
- POST /api/bookings/[bookingId]/contract-acceptance: { documentHash, accepted:true }; propietario y versión correcta.
- POST /api/bookings/[bookingId]/checkout: { requestId, kind:initial|balance, quoteHash }; resumen confirmado y sin otro intento activo.
- GET /api/bookings/[bookingId]/checkout/[attemptId]: estado financiero mínimo del propietario.
- POST /api/webhooks/stripe: ruta existente, delegación al módulo comercial nuevo; no duplicar Pages Router.
- /viajes/[slug]/checkout: página del recorrido; estado/retorno solo consulta la API. Identidad existente, CTA desde el registro público y enlace desde la cuenta/portal.

Contracts del cliente nunca admiten precio/currency/userId/paid. 400 inválido, 401 sin sesión, 403 no verificado/origen incorrecto, 404 ajeno/ausente, 409 oferta/contrato/cupo/cotización/intento en conflicto, 503 sandbox no configurado o proveedor no disponible. Webhook conserva 400/200/500 según requisitos.

## Criterios de aceptación

- [ ] Sin oferta válida o tipo de cambio no se inicia un cobro; se mantienen las reglas aprobadas de campaña, vigencia y USD→PEN.
- [ ] Ofertas aprobadas no cambian al reservar; un Price, importe, usuario o estado manipulado no altera el cobro.
- [ ] Identidad no verificada/otra reserva → rechazo sin pago ni filtración.
- [ ] Un solo ganador con dos reservas compitiendo por el último cupo; cancelación/expiración libera una vez y no duplica plaza.
- [ ] Sin contrato aprobado correspondiente o aceptación de otro hash → ningún POST Stripe.
- [ ] Contrato aprobado inmutable; aceptación guarda documento y oferta reales presentados.
- [ ] RequestId repetido, concurrencia y reinicio recuperan el mismo intento; otra pestaña no duplica una obligación pendiente.
- [ ] Tasa cambiada después no modifica el intento. PEN coincide con la conversión exacta del principal USD fijado.
- [ ] Timeout/500/attach fallido conservan clave; fuera de ventana exige conciliación.
- [ ] Firma inválida/raw alterado/live → 400 sin recibo.
- [ ] Fixtures ajenos → 200 ignorado, sin reservar ni pagar nada.
- [ ] Session unpaid → pendiente; paid canónico válido → una liquidación única; PI y Session no duplican principal.
- [ ] Async, PI null/temprano, eventos invertidos, repetidos o mismo segundo conservan identidad e integridad.
- [ ] Fallo SQL/API conocido → 500 reintentable, sin recibo/pago parcial.
- [ ] Anticipo no salda el total; portal/CRM suman manuales no anulados y Stripe liquidado exactamente una vez.
- [ ] Pago tardío tras liberación → incidencia visible sin sobreventa ni devolución automática.
- [ ] La página de retorno no concede pago por URL; origen/caché/errores no exponen secretos.
- [ ] El sandbox usa DB/Auth de desarrollo y CLI/app compatibles; ningún cambio de cuenta o secreto se realiza automáticamente.
- [ ] La app de Claude y el puerto 3000 quedan intactos; no se despliega ni migra producción.
- [ ] Build Node y Worker se reportan por separado; una prueba no ejecutada queda pendiente con causa exacta.

## Plan por fases

Una spec funcional para este recorrido, dividida en fases pequeñas. Las ofertas ya implementadas se reutilizan. Si el negocio pide además cambios comerciales ajenos a Checkout, tendrán otra spec.

### F0 — Alinear base y completar configuración

- [ ] Verificar el commit estable con ofertas y el estado de nuestra rama; preparar un cambio de base reversible solo del worktree Stripe, conservando cambios y secretos. No tocar la rama de Claude ni usar main antiguo como si incluyera ofertas.
- [ ] Aprobar esta spec con el flujo SDD. El plan anterior de mentec no es la base ejecutable.
- [ ] Verificar DB/Auth de desarrollo, variables manuales y sandbox común CLI/app antes de pruebas conectadas. Se pueden ejecutar tests sintéticos sin esos accesos.

### F1 — Contratos versionados (máximo 15 archivos / 5 tareas)

- [ ] T1 Datos/schema/tests y migración local: modules/contracts/schemas/contracts.schema.ts(.test.ts), lib/db-schema.ts y 3 artefactos Drizzle. Depende F0.
- [ ] T2 Servicio/tests: modules/contracts/services/contracts.service.ts(.test.ts), crear borrador/aprobar/leer versión aprobada. Depende T1.
- [ ] T3 Actions/tests con offers.manage: modules/contracts/actions/contracts.actions.ts(.test.ts). Depende T2.
- [ ] T4 UI mínima y navegación: modules/contracts/components/ContractManager.tsx(.test.tsx), modules/contracts/index.ts, app/crm/(protected)/contratos/page.tsx y modules/accounts/components/CrmShell.tsx. Depende T3.
- [ ] T5 Tests, typecheck, lint, revisión contra criterios y contrato de datos. Sin texto legal inventado ni aplicación remota.

### F2 — Reserva, oferta, contrato y cotización (máximo 15 archivos / 5 tareas)

- [ ] T1 Schema/migración: modules/booking-checkout/schemas/checkout.schema.ts(.test.ts), lib/db-schema.ts y 3 artefactos Drizzle.
- [ ] T2 Cotización: services/quote.service.ts(.test.ts), lectura de tasa con id y cálculos reutilizados; no copiar precio viejo del catálogo.
- [ ] T3 Persistencia: services/bookingCheckout.service.ts(.test.ts) e index.ts; reserva/asignación atómica, snapshots, aceptación y obligaciones; pruebas reales de constraints/concurrencia en PostgreSQL de prueba.
- [ ] T4 Integración existente: modules/bookings/services/bookings.service.ts(.test.ts) y runnerPortal.service.ts(.test.ts), protección de snapshots y cancelación/cálculo financiero compatible. Ningún import circular por barrels.
- [ ] T5 Tests y validación de migración local, sin escribir Neon remoto.

### F3 — Crear intentos y Sessions (máximo 15 archivos / 5 tareas)

- [ ] T1 Extender schema/tests y añadir services/stripeCheckout.service.ts(.test.ts): SDK lazy, price_data en PEN, URL y sandbox.
- [ ] T2 POST delgado app/api/bookings/[bookingId]/checkout/route.ts e index.ts; acceso/contrato/cotización/idempotencia antes de cobrar.
- [ ] T3 Variables: lib/env.ts y sus tests; package.json/package-lock solo dependencia Stripe requerida; .env.example/.env.local solo placeholders ausentes sin sobrescribir.
- [ ] T4 Recuperación y pruebas de timeout/reinicio/concurrencia/vencimiento; ampliar bookingCheckout.service.ts(.test.ts) cuando sea necesario.
- [ ] T5 Tests/typecheck/lint y creación sandbox sin completar pago únicamente si la DB/Auth de desarrollo están verificadas.

### F4 — Webhook, liquidación y estado (máximo 15 archivos / 5 tareas)

- [ ] T1 services/webhooks.service.ts(.test.ts) y services/settlements.service.ts(.test.ts) del módulo comercial; firma, canonicalización y evento transaccional.
- [ ] T2 Adaptar app/api/webhooks/stripe/route.ts e index.ts; validar PI/Session/async/expired sin sumar duplicados.
- [ ] T3 GET app/api/bookings/[bookingId]/checkout/[attemptId]/route.ts y servicio/tests necesarios.
- [ ] T4 Tests de incidencias tardías, cupos y saldo con manuales; extender bookingCheckout.service.ts(.test.ts) y lecturas de bookings/portal cuando sea necesario, manteniendo <=15 archivos de fase.
- [ ] T5 Suite, typecheck, lint y verificación HTTP real de firma inválida y reintentos.

### F5 — Recorrido visible y verificación (máximo 15 archivos / 5 tareas)

- [ ] T1 services/checkout.client.ts(.test.ts) y hooks/useBookingCheckout.ts(.test.ts): contratos Zod, TanStack Query, estado y errores seguros.
- [ ] T2 components/RunnerCheckout.tsx(.test.tsx), app/viajes/[slug]/checkout/page.tsx e index.ts: identidad, elección, contrato, resumen y retorno.
- [ ] T3 POST prepare y contract-acceptance, con handlers/services probados; CTA en RaceRegistrationSection y enlace de cuenta/portal; respetar el límite de archivos separando el cierre UI si fuera necesario.
- [ ] T4 Adaptar script de replay con modo explícito de operación propia; asserts de recibo/liquidación/saldo únicos. El modo fixture ajeno sigue siendo distinto.
- [ ] T5 Suite completa, typecheck, lint, build aislado y Worker; E2E de Session propia con test card, cancelación/replay. No declarar passed un recorrido que no pudo probarse por configuración.

Toda tarea comienza con test que falla por la funcionalidad ausente, después cambio mínimo y test verde. No commits automáticos.

## Dependencias verificadas / no resueltas

- Fuente localizada y leída: docs/stripe del ecommerce, de otro negocio; no usar sus modelos ni guardar payloads raw como sugiere.
- La base del worktree Stripe está atrasada; ofertas y lib/currency no existen allí. No basta crear la ruta sobre esa base.
- El webhook experimental pasó 17/17 tests; POST real 3001 sin firma respondió HTTP400.
- Proceso 3001 identificado como el worktree Stripe; listener test activo y secreto coincidente. No se cambió ninguno.
- La clave de aplicación es test. CLI y aplicación siguen en sandboxes distintos.
- El STRIPE_PRICE_ID anterior no se recupera con la clave (Stripe404 resource_missing); este diseño no depende de esa variable.
- STRIPE_CHECKOUT_ORIGIN está vacío. No se verificó aún una DB/Auth exclusiva de desarrollo; no ejecutar escrituras conectadas hasta resolverlo.
- Falta aprobación SDD de esta spec nueva; no hay registro para ella. No autogenerar aprobado ni modificar approvals.jsonl.

## Fuentes

- C:/Users/ronal/carreras-viajeras/docs/specs/trips-commercial-offers.md, aprobada, especialmente «Contrato para las specs siguientes».
- Modelos, servicios de ofertas/bookings, portal y lib/currency.ts de la base 783cbcd, leídos sin modificar Claude.
- Documento ecommerce localizado: C:/Users/ronal/codigo-vibecoding-g1/ecommerce/docs/stripe/README.md, solo referencia.
- Planner oficial Stripe: iguide_61VfKY8yskKP9O74841Lf7BunG6Jw, resultado aceptado hosted/web/one-time. Sus parámetros de ejemplo no son el precio de Carreras.
- Guías locales Next de Route Handlers y params/searchParams Promise, y tipos SDK Stripe23.0.1/API2026-09-30.endive.
