# CRM: menú lateral, "Carreras" y menú de cuenta

- Estado: borrador
- Módulos: accounts (barra lateral del CRM) y trips (vistas del CRM de viajes).
- Pedido del usuario (2026-10-30):
  - «en el sidebar: eliminar Mis pendientes»;
  - «cambiar Viajes por carreras (en la vista dentro de este modulo tambien)»;
  - «Eliminar configuraciones y en la foto de mi perfil si se presiona un botón con ver perfil o cerrar sesión en una ventana».

## Cambios

### 1. Barra lateral (`modules/accounts/components/CrmShell.tsx`, `CrmSidebar.tsx`)
- Se quita el enlace **"Mis pendientes"**. La vista sigue disponible en Leads con sus filtros (`?responsable=mios&seguimiento=pendientes`).
- El enlace **"Viajes"** pasa a llamarse **"Carreras"**. La URL `/crm/viajes` no cambia, así no se rompen enlaces ni marcadores.
- Se quita **"Configuraciones"** de la barra lateral. La página `/crm/configuraciones` y sus permisos no cambian: sigue accesible por URL y desde el menú de cuenta (punto 3).

### 2. Vistas del módulo (`app/crm/(protected)/viajes/**`, `modules/trips/components/TripForm.tsx` y `TripTable.tsx`)
- Los textos visibles «Viaje/Viajes» pasan a «Carrera/Carreras», con su concordancia: títulos, botones («Nueva carrera»), encabezados de tabla, mensajes vacíos y de error y `metadata.title`.
- No cambian los identificadores de código, las rutas, la base de datos ni los textos públicos de la landing.

### 3. Menú de cuenta
- El bloque inferior de la barra lateral (avatar con la inicial, correo y roles, y botón de cerrar sesión siempre visible) pasa a ser **un botón con el avatar**. Al pulsarlo se abre un menú desplegable (`components/ui/dropdown-menu`, sobre Base UI) con:
  - correo y roles, como cabecera no interactiva;
  - **Ver perfil** → `/cuenta/perfil`;
  - **Configuraciones** → `/crm/configuraciones`, solo si el usuario tiene ese permiso, el mismo que hoy muestra el enlace;
  - **Cerrar sesión**, con el `SignOutButton` existente o su misma acción de Clerk.
- Funciona igual en escritorio y en el menú móvil. Es accesible por teclado y se cierra con Escape.

## Plan
- [ ] S.1 `CrmShell`/`CrmSidebar`: quitar los enlaces "Mis pendientes" y "Configuraciones", renombrar "Viajes" a "Carreras" y crear el menú de cuenta. Tests de `CrmSidebar` actualizados.
- [ ] S.2 Textos de las vistas `/crm/viajes`, `TripForm` y `TripTable`, con sus tests.

## Aceptación
- La barra lateral no muestra "Mis pendientes" ni "Configuraciones" y muestra "Carreras" en lugar de "Viajes". `/crm/viajes` sigue funcionando.
- Las pantallas de `/crm/viajes` (lista, nueva y detalle) dicen «Carrera(s)».
- Pulsar el avatar abre el menú con Ver perfil y Cerrar sesión, y Configuraciones solo con permiso. Ambas acciones funcionan.
- lint, tests, typegen y `tsc` pasan.
