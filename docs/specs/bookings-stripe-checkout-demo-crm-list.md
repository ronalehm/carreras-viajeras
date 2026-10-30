# Enmienda: reservas simuladas visibles en la lista del CRM

- Estado: borrador
- Spec base: [bookings-stripe-checkout-demo.md](bookings-stripe-checkout-demo.md), aprobada (sección C, "Pantallas").
- Módulo: bookings (CRM de reservas).
- Pedido del usuario (2026-10-30), tras la primera reserva demo confirmada: «la opción B. debe mostrarse». La opción B consiste en ver las reservas simuladas en la lista principal de `/crm/reservas` con el distintivo SIMULADA, sin que cuenten en totales.

## Cambio respecto a la spec base

La sección C dice que, en el CRM, los pagos simulados «no suman en totales ni informes comerciales del CRM y se listan aparte». Esta enmienda cambia solo la parte «se listan aparte»:

- `/crm/reservas` muestra **por defecto todas las reservas**, reales y simuladas.
- Cada reserva simulada lleva el distintivo **SIMULADA**.
- El filtro **Tipo** tiene tres opciones:
  - **Todas**: por defecto, sin parámetro;
  - **Reales**: `?tipo=reales`;
  - **Simuladas (demo)**: `?tipo=simuladas`.
- Si la lista mostrada incluye alguna simulada, aparece una nota: son de la demostración (Stripe en modo de prueba), sin cargo real, y no cuentan en informes comerciales.

Sin cambios:
- los totales e informes comerciales siguen excluyendo las simuladas;
- el saldo por reserva sigue calculándose con `getBookingBalance`;
- la ficha de una reserva simulada sigue sin pagos manuales ni recompensas;
- no cambian el portal, el checkout, la base de datos ni el outbox.

## Plan

- [ ] L.1 `listBookings`:
  - el filtro admite `simulated` ausente (todas), `false` (reales) o `true` (simuladas);
  - `/crm/reservas` traduce `?tipo` a ese filtro;
  - `BookingFilters` ofrece las tres opciones;
  - nota condicional en la página;
  - tests del servicio y de los componentes afectados.

## Aceptación

- Sin `?tipo`, la lista incluye reales y simuladas, y las simuladas muestran SIMULADA.
- `?tipo=reales` lista solo reales y `?tipo=simuladas` solo simuladas.
- Un valor de `tipo` desconocido equivale a «Todas».
- Ningún total ni informe suma reservas simuladas.
