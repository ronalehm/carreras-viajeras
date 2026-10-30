# Carreras Viajeras con Stripe — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task by task with TDD. Track steps with checkboxes.

**Goal:** Implementar el recorrido de reserva y cobro Stripe de Carreras Viajeras sobre ofertas versionadas.
**Architecture:** Ofertas existentes → reserva y cupo → contrato aceptado → intento USD/PEN inmutable → Session alojada → webhook y liquidación única → portal/CRM.
**Tech Stack:** Next16, React19, Zod, TanStack Query, Drizzle/Neon HTTP y SDK oficial Stripe; compatibilidad Workers/OpenNext.
**Spec:** [bookings-stripe-checkout.md](../../specs/bookings-stripe-checkout.md), Estado: borrador.
**Destino:** worktree Stripe, rama propia; Claude y 3000 intactos. Solo sandbox.
**Sustituye:** el plan anterior de demo mentec.dev para este pedido. No es autorización para ejecutar la spec pendiente de aprobación.

## Decisiones

1. Carreras Viajeras es el negocio objetivo. No integrar los modelos del ecommerce encontrado ni continuar el ejemplo de Price fijo.
2. El usuario pidió explícitamente Stripe para todo el checkout; la spec declara la enmienda al proveedor Mercado Pago previsto en el plan maestro.
3. Reutilizar ofertas y matemática USD→PEN ya implementadas. La compra completa necesita datos de reserva y contratos que aún no existen.
4. Una spec de recorrido en cinco fases de implementación, además de F0. Contratos, reserva y pago dependen entre sí; cada fase tiene máximo cinco tareas y aproximadamente quince archivos.
5. Ni las versiones de oferta ni las de contrato cambian después de aprobarse. La tasa se fija por intento; el saldo comercial es en USD.
6. Un pago Stripe no se copia a booking_payments manual. Se añade un registro financiero separado y una agregación identificable.
7. El ledger SQLite del experimento no se usa como almacenamiento comercial del Worker.
8. No ejecutar ninguna escritura real a DB/Auth antes de verificar que se trata del entorno de desarrollo.
9. No requiere STRIPE_PRICE_ID, token de demo ni Stripe.js. Las variables antiguas se preservan sin usarlas.
10. Dynamic Payment Methods se conserva; Adaptive Pricing se deshabilita porque el importe PEN mostrado y aceptado debe ser exacto.

## Global Constraints

Solo test; sin claves live, pagos reales, producción, despliegues, migraciones remotas, push/merge o cambios en ramas/archivos de Claude. No imprimir secretos ni copiar entornos. Todas las autorizaciones usan identidad del corredor o permiso administrativo del servidor. Cuerpo original y firma para webhook. Estado financiero nunca desde success_url.

## Review Focus

- Último cupo concurrente: un solo ganador; comprobar en F2 con PostgreSQL de prueba, no un mock que siempre acepta.
- Intento creado en Stripe y fallo local: misma clave/parámetros al recuperar; F3.
- PI temprano/null y Session duplicada/invertida: una liquidación única por obligación; F4.
- Pago después de liberar/cancelar: incidencia financiera visible, sin sobreventa automática; F4.
- Pago parcial, manual previo y saldo posterior: sumar principal USD exactamente una vez; F2/F4/F5.

## Orden de ejecución

| Fase | Entrega verificable | Dependencia |
| --- | --- | --- |
| F0 | Base con ofertas y configuración de desarrollo identificadas; spec aprobada | Acción previa al código |
| F1 | Admin crea/aprueba versiones de contrato y servidor las resuelve | F0 |
| F2 | Reserva/cupo/snapshots/aceptación y cotización USD→PEN persistentes | F1 |
| F3 | API crea o recupera una Session Stripe única desde la obligación | F2 |
| F4 | Webhook firma/canonicaliza/liquida una vez y API informa estado | F3 |
| F5 | Flujo visible, portal, CLI y E2E sandbox completos | F4 |

Los archivos exactos y el reparto de tareas están en «Plan por fases» de la spec. No ejecutar tareas de una fase cuyo contrato anterior no esté probado.

### F0 — Base y entorno

- [x] Localizar docs/stripe: encontrado en codigo-vibecoding-g1/ecommerce; documentado como otra aplicación.
- [x] Revisar la arquitectura real de Carreras y declarar cambio de proveedor en nueva spec.
- [x] Baseline experimental: 17/17 webhook tests, POST sin firma HTTP400, listener y proceso3001 correctos.
- [ ] Obtener aprobación formal de bookings-stripe-checkout.md, sin modificar ledger de aprobación.
- [ ] Preparar integración de nuestra rama con el commit estable ce8fa4f (inspección desde783cbcd), conservando cambios pendientes y sin tocar la rama de Claude. La referencia main local sigue en907a722; no usarla como base actualizada.
- [ ] Verificar y configurar manualmente DB/Auth de desarrollo, origen3001 y sandbox Stripe común antes de pruebas conectadas. No usar las credenciales productivas existentes por defecto.

### F1 — Contratos

Tests RED: borrador no cobrable, aprobada inmutable, otra versión/hash rechazada, permiso insuficiente. Implementar tablas/schemas, servicios, actions y UI administrativa indicados en spec. GREEN: todos los tests más typecheck/lint. Ningún texto legal inventado.

### F2 — Reserva y cotización

Tests RED: oferta inválida/vencida/campaña ajena, anticipo no permitido, identidad ajena, último cupo concurrente, cancelación doble, tasa ausente y cálculos half-up, aceptación de otro documento. Implementar snapshots y capacidad/contrato sin mutar ofertas aprobadas ni reservas manuales antiguas.

Invariantes: principal en USD entero, cobro en céntimos PEN, tasa con id/valor, un solo cupo por reserva y una sola obligación pendiente. Las pruebas de transacción/concurrencia usan PostgreSQL de prueba; si no está disponible, informar exactamente esa limitación y no atribuirla a pruebas mockeadas.

### F3 — Session

Tests RED: configuración deshabilitada/live, falta contrato/propiedad, precio manipulado, request repetido, dos claves para la misma obligación, timeout/500, persistencia posterior fallida y recuperación fuera de23h. Implementar price_data desde cotización persistida, URL autorizada y SDK lazy.

No aceptar precios o URLs del navegador, no crear Product/Price como catálogo paralelo. Antes de devolver un link, guardar Session y comprobar su validez canónica cuando sea recuperación. No declarar un pago por crear la Session.

### F4 — Webhook

Tests RED: raw alterado, firma/live, fixture ajeno, error500 sin recibo, completed unpaid, async, PI null/temprano, duplicados/concurrencia/reinicio/mismo segundo, expirado y cobro tardío. Implementar correlación local y commit atómico de evento/liquidación/cupo/reserva/auditoría.

Una Session pagada canónica acredita una obligación USD/PEN una vez. Un anticipo no salda el viaje. Un fallo conocido no se oculta devolviendo200. Evento ajeno ignorado y evento duplicado son casos explícitos200.

### F5 — UI y verificación

Tests RED: login/propiedad, elegir opción permitida, contrato cambiado, resumen PEN, estados pendientes, retorno falseado, cancelación sin nuevo cobro, saldo correcto y datos privados fuera de caché/URLs. Implementar los handlers prepare/acceptance, cliente/hook/componente, CTA y portal indicados en spec.

Reutilizar TanStack Query y componentes instalados; no instalar Stripe.js. El frontend no crea importes ni pagos. No conectar automáticamente la demo a Neon productivo para que «funcione».

## Comandos de control

Desde el worktree propio, después de alinear la base y crear los archivos:

```powershell
git branch --show-current
npx vitest run modules/contracts modules/booking-checkout modules/bookings --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npx vitest run --reporter=verbose
curl.exe -sS -i -X POST http://localhost:3001/api/webhooks/stripe -H 'Content-Type: application/json' --data '{}'
```

Tests/typecheck/lint deben terminar con exit0; el POST sin firma devuelve400, no404. Build Next en copia aislada sin .env privados ni tocar .next del dev activo; Worker build con el script del repo en Linux/WSL sin deploy. Reportar Node y Worker por separado.

Listener existente: conservarlo. Solo si se comprueba que no existe y se autoriza iniciarlo, comando `stripe listen --forward-to http://localhost:3001/api/webhooks/stripe`, sin --live y sin mostrar su secreto en informes.

Después de configuración correcta: crear una reserva propia y Session mediante la aplicación, pagar exclusivamente con datos de prueba y comprobar liquidación/saldo únicos. `stripe trigger checkout.session.completed` prueba transporte/fixtures, no acredita por sí solo una reserva. Reenvío explícito de eventos propios debe producir200 y una única liquidación; rechazos de firma400.

## Evidencia y cierre

Cada tarea registra test RED→GREEN, archivos modificados y resultados reales. No marcar una fase completada con criterios faltantes, ocultar fallos heredados o llamar E2E a un fixture ignorado.

Pendientes actuales: aprobación SDD, alineación segura de nuestra base, DB/Auth de desarrollo y sandbox común. El Price404 anterior no bloquea el diseño de price_data. Las credenciales, listener y procesos no se modificaron al preparar este documento.
