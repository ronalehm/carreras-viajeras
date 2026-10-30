# Cuenta: menú del avatar en la cabecera pública

- Estado: aprobado
- Módulos: accounts (cuenta del corredor), landing (cabecera) y bookings (cabecera del portal).
- Pedido del usuario (2026-10-30): al lado del botón Registrarse debe estar la foto de perfil. Al pulsarla aparece:
  - **Mi perfil**, antes «Mi cuenta»;
  - **Mis carreras**, antes «Ver mis carreras»;
  - **Ir a CRM**, antes «Ingresar al CRM», solo si es administrador o personal del CRM;
  - **Cerrar sesión**.

  En la pantalla de ingreso o registro, el cuerpo solo debe decir «COMUNIDAD CARRERAS VIAJERAS» y «Qué bueno verte de nuevo. [Nombre]», con los tamaños actuales.

## Cambios

### 1. Cabecera pública (`modules/landing/components/SiteHeader.tsx`)
- **Sin sesión:** sin cambios. Se ven **Ingresar** (contorno) y **Registrarse** (fondo principal).
- **Con sesión:** en el lugar de esos botones aparece la **foto de perfil** de Clerk (`user.imageUrl`), o la inicial si no hay foto. Es un botón circular de unos 40 px.
- La cabecera sigue siendo estática y cacheable: el estado de sesión lo resuelve un componente cliente nuevo, `modules/accounts/components/AccountMenu.tsx`, con `useUser` de Clerk. Mientras Clerk carga, se reserva el hueco para que la cabecera no salte.

### 2. Menú del avatar (`AccountMenu`)
Al pulsar el avatar se abre un menú desplegable (`components/ui/dropdown-menu`) con:
- cabecera no interactiva con el nombre y el correo;
- **Mi perfil** → `/cuenta/perfil`;
- **Mis carreras** → `/mis-carreras`;
- **Ir a CRM** → `/crm`, solo si `GET /api/crm/me` responde 200. Esa ruta ya existe, ya está en el matcher, lee los roles en Neon y no concede nada: el layout de `/crm` sigue siendo la guarda. Con 401, 403 o error, no se muestra;
- **Cerrar sesión**, con la acción del `SignOutButton` existente; vuelve a `/cuenta`.

Funciona con teclado (Enter/Espacio abre, Escape cierra). El menú móvil de enlaces (`MobileMenu`) no cambia.

### 3. Pantalla de cuenta con sesión (`modules/accounts/components/RunnerAccount.tsx`)
- Cuando hay sesión, el cuerpo solo muestra:
  - «COMUNIDAD CARRERAS VIAJERAS», con el estilo de la etiqueta actual: `text-xs font-bold tracking-[0.2em]`;
  - «Qué bueno verte de nuevo. [Nombre]», con el tamaño actual del título: `text-2xl font-semibold`. [Nombre] es el nombre de Clerk (`firstName`, o `fullName`); si no hay, el correo.
- Se quitan del cuerpo los botones Ingresar al CRM, Ver mis carreras, Mi cuenta y Cerrar sesión, que pasan al menú del avatar.
- Se conserva el registro de la cuenta una vez por usuario (`registerAccountAction`) que ya hace el componente, aunque su resultado deje de usarse para mostrar el enlace al CRM.
- Sin sesión, sigue el panel de Clerk sin cambios.

### 4. Cabecera del portal (`modules/bookings/components/PortalHeader.tsx`)
`/mis-carreras` usa su propia cabecera con «Mi cuenta» y «Cerrar sesión». Pasa a usar el mismo `AccountMenu` para ser coherente.

## Plan
- [ ] H.1 `AccountMenu` (accounts), con avatar, menú, «Ir a CRM» condicionado a `/api/crm/me` y cierre de sesión; tests con Clerk simulado.
- [ ] H.2 `SiteHeader` y `PortalHeader` usan `AccountMenu`; `RunnerAccount` con sesión muestra solo la etiqueta y el saludo; tests.

## Aceptación
- Sin sesión, la cabecera muestra Ingresar y Registrarse.
- Con sesión, muestra el avatar y no los botones. El menú tiene Mi perfil, Mis carreras y Cerrar sesión, e Ir a CRM solo para cuentas con acceso al CRM.
- `/cuenta` con sesión muestra solo «COMUNIDAD CARRERAS VIAJERAS» y «Qué bueno verte de nuevo. [Nombre]».
- `/mis-carreras` usa el mismo menú.
- Las páginas siguen siendo estáticas donde lo eran (`○` en el build). lint, tests, typegen, `tsc` y `build:worker` pasan.
