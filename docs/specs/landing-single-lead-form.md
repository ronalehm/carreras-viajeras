# Landing: un solo formulario de datos

- Estado: aprobado
- Módulos: landing (`/contacto` y `/viajes/[slug]/registro`).
- Pedido del usuario (2026-10-31): «la página contacto o regístrate es lo mismo y están en varios lados duplicados, solicitando la misma información, corregir para que menos es más y sea entendible». El usuario eligió la opción «Un solo formulario».

## Problema
- `/contacto` y «Regístrate» de cada maratón piden los mismos datos: nombre, WhatsApp y correo.
- «Registrarse» de la cabecera significa crear una cuenta, que es otra cosa.

## Cambios
1. **Página de la maratón** (`RaceRegistrationSection`): es el único formulario de datos.
   - Conserva la atribución de campañas (`?c=`, UTM), el modo stand y el outbox.
   - El título «Regístrate» pasa a «Pide información», para que «Registrarse» solo signifique crear una cuenta.
   - Con sesión se sigue mostrando «Reserva tu lugar», ya implementado.
2. **`/contacto`** deja de tener formulario. Muestra:
   - el titular actual;
   - las maratones publicadas (el catálogo que ya usa la página), cada una con un enlace a su `/viajes/<slug>/registro`, que conserva la atribución de la URL;
   - «¿Otra carrera o una duda? Escríbenos por WhatsApp», con el enlace de WhatsApp actual.
3. **Enlaces antiguos:** `/contacto?destino=<valor>` que corresponde a una maratón publicada (directamente o por su alias) redirige en el navegador a `/viajes/<slug>/registro` con la misma atribución. Así no se rompen enlaces ni campañas.

Sin cambios:
- el servidor de captura de leads y su validación;
- el outbox y el contrato con n8n;
- los valores de `source` en BD (los leads antiguos con origen de contacto siguen siendo válidos), el CRM y `/cuenta`.

## Plan
- [x] F.1 `/contacto` sin formulario (lista de maratones y WhatsApp) con redirección de `?destino=`; el título de la maratón pasa a «Pide información»; tests.

## Aceptación
- `/contacto` no muestra ningún formulario: muestra las maratones publicadas, con sus enlaces de registro, y WhatsApp.
- `/contacto?destino=santiago-2027&c=abc` lleva a `/viajes/maraton-santiago-2027/registro?c=abc`.
- La página de la maratón muestra «Pide información» y su formulario sigue enviando leads con atribución.
- lint, tests, typegen, `tsc` y `build:worker` pasan.
