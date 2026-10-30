# CRM: menú lateral, "Carreras" y menú de cuenta

- Estado: aprobado
- Módulos: accounts (barra lateral del CRM) y trips (vistas del CRM de viajes).
- Pedido del usuario (2026-10-30):
  - «en el sidebar: eliminar Mis pendientes»;
  - «cambiar Viajes por carreras (en la vista dentro de este modulo tambien)»;
  - «Eliminar configuraciones y en la foto de mi perfil si se presiona un botón con ver perfil o cerrar sesión en una ventana»;
  - «mejorar la vista del sidebar, para que se vea más profesional, usar Apple design».

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

### 4. Aspecto profesional de la barra lateral, al estilo Apple
Pedido: «mejorar la vista del sidebar, para que se vea más profesional, usar Apple design». Se toma como referencia la barra lateral de macOS e iPadOS (Finder, Mail, Ajustes), adaptada a los tokens de `app/globals.css`. No se cambian colores de marca ni se instalan dependencias.
- **Fondo y profundidad.** Fondo ligeramente translúcido con desenfoque (`backdrop-blur`) sobre `bg-card`, separador derecho de 1 px muy suave y sin sombras duras. En móvil, el panel lateral usa el mismo material.
- **Tipografía.** La pila del sistema que ya usa el proyecto. Elementos a 13–14 px con peso medio. Títulos de grupo pequeños, en gris secundario y con poco espaciado, sin mayúsculas forzadas con tracking amplio (estilo "Favoritos" de Finder).
- **Elementos del menú.** Alto uniforme de unos 32–36 px, iconos de trazo fino (`lucide`, `strokeWidth` 1.5, 16 px) alineados en una columna fija y radio de unos 8 px. El elemento activo lleva un relleno suave del color primario y un icono en color de acento, sin el chevron. El hover es un gris muy sutil. Transiciones cortas (150 ms).
- **Ritmo.** Espaciado vertical regular entre grupos. Logo más compacto arriba y menú de cuenta fijo abajo, separado por una línea fina.
- **Menú de cuenta.** Avatar circular con la inicial; nombre o correo truncado y rol en gris al lado. Al pulsar se abre el menú del punto 3, con el aspecto de un menú contextual de macOS: esquinas redondeadas, sombra suave y separadores finos.
- **Accesibilidad.** Contraste AA, foco visible (anillo de enfoque), objetivos táctiles de al menos 44 px en móvil y respeto de `prefers-reduced-motion`.

## Plan
- [ ] S.1 `CrmShell`/`CrmSidebar`: quitar los enlaces "Mis pendientes" y "Configuraciones", renombrar "Viajes" a "Carreras" y crear el menú de cuenta. Tests de `CrmSidebar` actualizados.
- [ ] S.2 Textos de las vistas `/crm/viajes`, `TripForm` y `TripTable`, con sus tests.
- [ ] S.3 Estilo de la barra lateral y del menú de cuenta según el punto 4, en escritorio y móvil, con prueba visual (capturas) en escritorio y móvil.

## Aceptación
- La barra lateral no muestra "Mis pendientes" ni "Configuraciones" y muestra "Carreras" en lugar de "Viajes". `/crm/viajes` sigue funcionando.
- Las pantallas de `/crm/viajes` (lista, nueva y detalle) dicen «Carrera(s)».
- Pulsar el avatar abre el menú con Ver perfil y Cerrar sesión, y Configuraciones solo con permiso. Ambas acciones funcionan.
- La barra lateral sigue el punto 4 en escritorio y móvil, con contraste AA y foco visible.
- lint, tests, typegen y `tsc` pasan.
