# Enmienda: el pago en línea se habilita desde la ficha del usuario

- Estado: borrador
- Spec base: [crm-users-checkout-toggle.md](crm-users-checkout-toggle.md), aprobada.
- Pedido del usuario (2026-10-31): «la opción de poder pagar debe estar en la misma opción del módulo de usuario, ahí mismo debemos editar las opciones del usuario y entre ellas que permita pagar para cada usuario… los datos personales solo se pueden visualizar ya que corresponden al usuario. Debe ser más simple para habilitarle la opción de pago».

## Cambio respecto a la spec base

1. **Ficha del usuario** (`/crm/admin/usuarios/[id]`). Con `offers.manage` se añade la tarjeta **«Pago en línea»**:
   - muestra «Habilitado» o «No habilitado», con el modo actual («demo (Stripe TEST)»);
   - un solo botón: **Habilitar pago** o **Quitar pago**, con confirmación, usando las acciones existentes;
   - en una cuenta desactivada o eliminada no hay botón.
2. **Datos del usuario** en la ficha: una tarjeta **«Datos»** de solo lectura con nombre, correo y situación de la cuenta. No es un formulario, porque los datos personales pertenecen al usuario. No se muestran documentos, datos médicos ni notas.
3. **Lista de usuarios:** la columna se llama **«Pago en línea»** y solo muestra «Habilitado» o «—», sin botones. Las acciones viven en la ficha, a un clic del nombre. Se mantienen la línea con el modo del checkout y el filtro **Habilitados**.
4. Las acciones revalidan también la ficha del usuario.

Sin cambios:
- permisos (`staff.manage` para ver, `offers.manage` para habilitar, comprobado en el servidor);
- base de datos, checkout y `/crm/contratos`.

## Plan
- [ ] E.1 Tarjetas «Pago en línea» y «Datos» en la ficha; columna de solo lectura en la lista; revalidación de la ficha; tests.

## Aceptación
- En la ficha, un administrador con `offers.manage` habilita o quita el pago con un botón, y el cambio se ve en la ficha y en la lista.
- La ficha muestra nombre, correo y situación de la cuenta sin campos editables.
- La lista muestra «Habilitado» o «—» y el filtro Habilitados funciona.
- lint, tests, typegen, `tsc` y `build:worker` pasan.
