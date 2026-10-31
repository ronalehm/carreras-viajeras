# CRM: habilitar el checkout desde la lista de usuarios

- Estado: borrador
- Módulos: accounts (lista de usuarios del CRM) y booking-checkout (participantes de la demo).
- Spec base: [bookings-stripe-checkout-demo.md](bookings-stripe-checkout-demo.md), aprobada. Esta enmienda solo añade otra forma de dar el alta y la baja.
- Pedido del usuario (2026-10-31): «debo habilitar desde los usuarios que son runners quienes pueden tener la opción de pago. de forma rápida y en una lista para saber qué está habilitado… de la lista de usuarios, en el CRM».

## Hoy
Las altas y bajas de la demo se hacen en `/crm/contratos` (bloque «Demo de checkout»), escribiendo el correo. Para ver quién está habilitado hay que ir a esa página.

## Cambios
1. **`/crm/admin/usuarios`**, solo si quien la ve tiene también `offers.manage` (el mismo permiso que ya exige la demo):
   - una línea con el estado del checkout, por ejemplo «Checkout: demo (Stripe TEST)», calculado con `getCheckoutStatus()`;
   - una columna **Checkout** en la tabla:
     - «Habilitado», con el botón **Quitar**, para las cuentas que son participantes activas;
     - el botón **Habilitar** para el resto de cuentas activas con correo;
     - sin acción para las cuentas desactivadas;
   - un filtro **Checkout: Todos / Habilitados** (`?checkout=habilitados`) para ver de un vistazo quién tiene la opción de pago.
2. **Acciones:** se reutilizan `grantDemoParticipantAction` (alta por el correo de la fila) y `revokeDemoParticipantAction` (baja por `userId`), con sus mismas validaciones, mensajes y comprobación de `offers.manage` en el servidor. Además de `/crm/contratos`, también revalidan `/crm/admin/usuarios`.
3. **Módulos:** la página compone los datos. `accounts` no importa `booking-checkout`: la tabla de usuarios recibe por props los ids habilitados y el control de cada fila.

Sin cambios:
- el bloque de `/crm/contratos` sigue funcionando igual;
- la base de datos, porque la tabla `checkout_demo_participants` ya existe;
- el checkout, el modo demo y Stripe TEST;
- quién puede abrir `/crm/admin/usuarios` (`staff.manage`).

## Plan
- [ ] U.1 Servicio: ids de participantes activos, exportado por `booking-checkout`. Las acciones revalidan también `/crm/admin/usuarios`. Tests.
- [ ] U.2 `/crm/admin/usuarios`: línea de estado, columna Checkout con Habilitar/Quitar y filtro Habilitados, solo con `offers.manage`. Tests de la tabla y del filtro.

## Aceptación
- Un administrador con `offers.manage` habilita o quita a un runner desde la lista de usuarios, y el cambio se ve en la fila y en `/crm/contratos`.
- `?checkout=habilitados` lista solo las cuentas habilitadas.
- Sin `offers.manage` no aparecen la columna, el filtro ni la línea de estado, y las acciones siguen rechazando la petición en el servidor.
- lint, tests, typegen, `tsc` y `build:worker` pasan.
