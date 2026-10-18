# Landing pública de Carreras Viajeras (port del diseño HTML/CSS/JS)

- Módulo: landing
- Estado: aprobado
- Base: `platform-neon-foundation.md` (aprobada). F1 y F2 no usan base de datos, auth, D1, Hyperdrive, Access ni Turnstile. F3 usa Neon Auth solo a través de la API pública de `modules/accounts` y **no cambia** el control de acceso del CRM (`accounts-roles-permissions.md`, aprobada).
- Depende de: F3 requiere `accounts-auth-ui.md` **Fase 4 (audiencia runner) aprobada e implementada**: `RunnerAccount` exportado desde `@/modules/accounts`. F3 no modifica archivos de `modules/accounts`.
- Fuente de diseño (solo local, excluida en `.git/info/exclude`; no se importa ni se versiona): `docs/Rediseño de Landing/Carreras-Viajeras-Web-HTML-CSS-JS/`: `index.html` (landing), `contacto.html` (formulario), `cuenta.html` (acceso), CSS/JS asociados, `LEEME.txt` y capturas en `docs/Rediseño de Landing/*.png`. El developer copia de ahí los **textos literales** de cada sección; esta spec solo enumera las adaptaciones y omisiones.

## Objetivo
Publicar la landing diseñada por el usuario para runners peruanos interesados en la Maratón de Santiago 42K 2027 (y destinos en exploración). Incluye:
- una página por viaje, empezando por `/viajes/maraton-santiago-2027`;
- `/contacto`, que **prepara** una consulta para copiarla o abrirla en WhatsApp, sin enviar ni guardar datos;
- `/cuenta`, donde un runner se registra, inicia sesión y la cierra con la cuenta de Neon Auth existente, sin obtener acceso al CRM.

Sustituye el template "Hello world".

## Alcance
- Incluye:
  - Port a Next 16 (Server Components, Tailwind v4, shadcn/ui base-nova) de las secciones de `index.html` listadas en "Inventario de secciones", en el mismo orden y con sus textos.
  - `/contacto` (port de `contacto.html`): consulta preparada, copia al portapapeles y enlace a WhatsApp `+51 938 127 170`.
  - `/viajes/[slug]`: ruta dinámica con contenido estático. El único viaje es `maraton-santiago-2027`, con los datos del paquete Santiago del diseño.
  - `/cuenta` (inspirada en `cuenta.html`): ingresar, registrarse con verificación por código y cerrar sesión con Neon Auth, reutilizando `modules/accounts`. Enlaces "Ingresar / Registrarse" en cabecera, comunidad y pie.
  - Redes oficiales en el pie: Facebook e Instagram.
  - Tokens de marca (azul `#0144ae`, verde `#7ac734`, blanco) en `app/globals.css`; también se aplican al CRM.
  - Fuentes DM Sans y Barlow Condensed con `next/font/google`: autoalojadas, sin peticiones a Google en runtime.
  - Imágenes en `public/images/`; `<html lang="es">`, metadata, `theme-color`, accesibilidad básica y responsive desde 360 px.
- No incluye:
  - Envío o almacenamiento de leads, Turnstile, APIs nuevas, tablas o migraciones, analítica (se descarta el `track()` de `app.js`).
  - Perfil de runner, experiencias o fotos persistentes, estrellas, recompensas, inscripción a eventos.
  - La demo de comunidad de `index.html`: formulario de experiencias, vista previa local de fotos, filtro de historias e invitación copiable.
  - Páginas `pasion-por-correr`, `terminos`, `privacidad`, `cookies`, `reclamaciones` e `informacion-comercial` (trabajo futuro).
  - Diálogo de preferencias de cookies: la app no usa cookies opcionales; las de sesión de Neon Auth son técnicas.
  - TikTok: no hay URL oficial.
  - Afiches `paquete-santiago-referencia.png` y `preventa-santiago-referencia.png`: no se publican.
  - `experience-tabs.*`, `journey.js`, `simplified.js` y `blog-links.js`.
  - Afirmar la condición de partner de Santiago 2027, testimonios, cifras o datos legales ausentes del diseño.
  - Lectura de viajes desde Neon (trabajo futuro, `trips-catalog`).
  - Cambios en `lib/auth/*`, `lib/db*`, `app/crm/*`, `app/api/*`, en las tablas `profiles`/`staff_*` o en la matriz de permisos.
  - Modo oscuro, multi-idioma y nuevas dependencias npm.

## Requisitos
1. **Fidelidad:** textos literales del diseño; aspecto aproximado con la escala de Tailwind (no pixel-perfect).
   - Tamaño mínimo de texto: `text-xs` (12 px), aunque el diseño use 8–11 px.
   - La flecha "↗" de CTAs y marca se renderiza con `ArrowUpRight` de `lucide-react` (`aria-hidden`).
2. **Sin enlaces rotos al cierre de cada fase:** ningún `href` apunta a `*.html`, a páginas no portadas ni a anclas o rutas que aún no existan en esa fase. Los enlaces que dependen de secciones de fases posteriores se añaden en esa fase (ver Inventario). Destinos finales:

   | Enlace del diseño | En el port |
   |---|---|
   | "Contacto", "Quiero correr", "Hablemos de tu próxima carrera" | `/contacto` |
   | Hero 1 "Quiero vivir esta carrera", CTA móvil | `/contacto?destino=santiago-2027` |
   | Paquete "Quiero correr Santiago" y "Ver más: paquete completo"; tarjeta de destino Santiago | `/viajes/maraton-santiago-2027` |
   | Tarjetas de destino Panamá / Medellín | `/contacto?destino=panama` / `?destino=medellin` |
   | Cabecera `#paquete`, `#comunidad`, `#blog` | `/#paquete`, `/#comunidad`, `/#blog` (la cabecera se usa en todas las páginas) |
   | `pasion-por-correr.html` ("Descubre el viaje") | `/viajes/maraton-santiago-2027` |
   | `cuenta.html`, `cuenta.html#registro` ("Ingresar / Registrarse") | `/cuenta` |
   | `terminos.html`, `privacidad.html`, `cookies.html`, `reclamaciones.html`, `informacion-comercial.html`, "Ver afiche de inclusiones", "Ver privacidad" | se omite el enlace; el Libro de Reclamaciones se muestra como texto con "Pendiente de habilitación" |
   | Externos (maratondesantiago.cl, NHS, B.A.A., Facebook, Instagram, WhatsApp) | `target="_blank" rel="noopener noreferrer"` |
3. **Indexación:** `robots: { index: false, follow: false }` en todo el sitio mientras falten datos legales (decisión del usuario).
4. **Imágenes:**
   - `next/image` con `images.unoptimized: true` en `next.config.ts`: no hay binding `IMAGES` en Workers Free y, sin él, cada imagen pasaría por el Worker sin optimizarse. Se sirven como assets estáticos desde `public/images/`.
   - `story-runners.png` (2,6 MB) y `maz-producciones.png` se convierten una vez a WebP con `sharp`, ya presente en `node_modules` como dependencia de `next`: comando puntual, sin script ni dependencia nueva.
   - Los `alt` son los del diseño, con los avisos de imagen ilustrativa o generada con IA.
5. **Accesibilidad básica:**
   - un único `h1` por página;
   - foco visible (outline de 3 px en color `highlight`, como el diseño) en enlaces, botones, `summary` y campos;
   - `<details>/<summary>` nativos para todo lo desplegable;
   - carrusel con los atributos ARIA del diseño y estados con `role="status"`;
   - el verde solo como color de texto sobre azul o foto; sobre blanco, el énfasis `<em>` va en azul con subrayado verde (`decoration-highlight`).
6. **Responsive:** sin desplazamiento horizontal a 360 px. La navegación de cabecera se oculta por debajo de `md`; "Quiero correr" e "Ingresar / Registrarse" siguen visibles. Las rejillas pasan a una columna como en el diseño.
7. **Contacto (sin envío):**
   - El formulario no hace ninguna petición de red.
   - La validación es nativa del navegador (`required`, `type="email"`, `pattern`, `maxlength`), igual que el diseño, más una comprobación de campos no vacíos tras recortar espacios.
   - No se crea un schema zod: los datos nunca salen del navegador y no cruzan ninguna frontera de confianza. El schema llegará con la spec de leads, en el servidor.
   - Al enviar un formulario válido muestra la consulta con el texto exacto de `app.js` (ver Diseño técnico), el botón "Copiar consulta" y el enlace "Abrir WhatsApp ↗" a `https://wa.me/51938127170?text=…`.
8. **Viajes:**
   - `/viajes/[slug]` se genera en build con `generateStaticParams` desde la constante `TRIPS`. Con `dynamicParams = false` y `notFound()`, un slug desconocido devuelve 404.
   - Todo el contenido sale del diseño. Lo que el diseño declara pendiente (aerolínea, horarios, hotel, ocupación, seguro, saldo de la tarjeta de metro, merchandising) se muestra como pendiente con sus textos; no se inventan itinerario, hotel ni condiciones.
9. **Cuenta de runner (F3):** la landing aporta la ruta, el diseño y los enlaces. Toda la lógica de acceso es de `accounts-auth-ui.md` F4 (Requisito 12), consumida solo a través de `RunnerAccount`.
   - **Identidad y acceso al CRM:** un runner es una cuenta de Neon Auth sin roles de staff. El CRM sigue denegado por defecto (`requireCrmUser()`: correo verificado + rol activo por `user_id`). Un runner que abre `/crm` ve "Tu cuenta no tiene acceso al CRM…" y no se crean filas en `profiles` ni `staff_*`.
   - **Navegación:** tras ingresar o verificar en `/cuenta`, la persona se queda en `/cuenta`, también si es staff. Tras cerrar sesión vuelve a `/cuenta`. Los destinos los fija `accounts` como uniones cerradas; la landing no pasa ni lee destinos.
   - **Página estática:** `app/cuenta/page.tsx` no llama a `getCrmAccess()`, a guardas ni a la base de datos. El estado de sesión lo muestra `RunnerAccount` en el cliente, solo como presentación.
   - **Comunidad sin persistencia:** `#comunidad` es contenido estático con un CTA a `/cuenta`. No hay experiencias, fotos, estrellas ni datos de runner.
   - **Sin regresiones:** `/crm/acceso` no cambia. Esta fase no modifica `modules/accounts`, `lib/auth/*`, `app/crm/*`, `app/api/*` ni `drizzle/`.
   - **Tamaño del Worker:** se mide sin desplegar y debe seguir < 3 MiB gzip.

### Inventario de secciones (orden de `index.html`)
| # | id / elemento | Componente | Fase | Interacción | Adaptaciones respecto al diseño |
|---|---|---|---|---|---|
| 1 | `header` (fijo) | `SiteHeader` | F1; F2 añade "Próxima maratón" y "Blog"; F3 añade "Comunidad" e "Ingresar / Registrarse" | CSS `sticky` | Orden final de la nav: "Próxima maratón", "Comunidad", "Blog", "Contacto". CTA "Quiero correr" desde F1 |
| 2 | `#inicio` carrusel | `HeroCarousel` (client) | F1; el CTA de la lámina 2 llega en F2 y el de la lámina 3 en F3 | Láminas, puntos, autoplay 6,5 s, swipe | Las 3 láminas con textos e imágenes. Lámina 2 → `#paquete`, lámina 3 → `#comunidad` |
| 3 | `.trip-strip` | `TripFacts` | F2 | — | Datos de `TRIPS`; se reutiliza en la página del viaje |
| 4 | `#experiencia` | `StorySection` | F2 | — | "Descubre el viaje" → `/viajes/maraton-santiago-2027` |
| 5 | `#paquete` | `PackageSection` | F2 | — | Resumen (portada, pitch, destacados, precios, aviso) con datos de `TRIPS`. El `<details>` "Ver más: paquete completo" pasa a ser un enlace a la página del viaje, donde vive el detalle (sin duplicarlo). Sin enlace al afiche |
| 6 | `#comunidad` | `CommunitySection` | F3 | — | Bloque hero (imagen, título, texto) con CTA "Ingresar / Registrarse" → `/cuenta`, los 3 pasos y la nota "Participar + compartir = sumar." con "SIN DESCUENTOS ACTIVOS TODAVÍA", visibles sin desplegable. Sin demo. Sin eyebrow (el CSS del diseño lo oculta) |
| 7 | `#por-que-viajar` | `WhyUsSection` | F2 | `<details>` "Ver más" y "Ver detalle" | Iconos SVG → `lucide-react`. Sin eyebrow. "Hablemos de tu próxima carrera" → `/contacto` |
| 8 | `#blog` | `BlogSection` + `TipList` (client) | F2 | `<details>` y filtro de tips con `aria-pressed` | Referentes publicados con nombre (Daniela Zarfati, Karla Medina) y los avisos del diseño ("PARTICIPACIÓN POR CONFIRMAR", "FOTO ILUSTRATIVA · NO ES …") |
| 9 | `#destinos` | `DestinationsSection` | F2 | — | Tarjetas como enlaces: Santiago → página del viaje; Panamá y Medellín → `/contacto?destino=<id>` |
| 10 | `#preguntas` | `FaqSection` | F2 | `<details>` | 9 preguntas literales |
| 11 | `aside.maz-support` | dentro de `SiteFooter` | F1 | — | Se integra como franja superior del pie en todas las páginas. Sin "Conoce al operador" |
| 12 | `footer#pie` | `SiteFooter` | F1; F3 añade "Tu comunidad" | — | Marca, "Corre. Viaja. Conecta.", Facebook e Instagram, "Información del proveedor" (dl literal, con "Pendientes de completar"), "Atención al consumidor" (Libro de Reclamaciones como texto con "Pendiente de habilitación") y pie inferior literal. F3: "Tu comunidad" → "Ingresar / Registrarse" → `/cuenta`. Sin enlaces legales ni botón de cookies |
| 13 | `.mobile-cta` | `MobileCta` | F1 | CSS `fixed` < `sm` | → `/contacto?destino=santiago-2027` |
| — | `/contacto` | `ContactSection` + `ContactForm` (client) | F1 | Preparar, copiar, WhatsApp | Sin "Ver privacidad"; queda "La consulta no se envía desde esta demostración." |
| — | `/viajes/maraton-santiago-2027` | `TripDetail` (+ `TripFacts`) | F2 | — | Nueva página (no existe en el diseño) compuesta solo con contenido del diseño |
| — | `/cuenta` | `AccountSection` (server, landing) + `RunnerAccount` (client, `modules/accounts` F4) | F3 | Ingresar, registrarse, verificar, recuperar contraseña, cerrar sesión | Columna de `cuenta.html` con sus textos; sin los avisos "Acceso próximamente" / "Servicio de cuentas pendiente" (ya está conectado); sin pestañas: el cambio entre ingreso y alta lo hace el panel de `accounts` |

## Criterios de aceptación
### Fase 1 — Base, cabecera, carrusel, pie, CTA móvil y `/contacto`
- [ ] (F1) Dado `npm run dev`, cuando abro `/`, entonces veo la cabecera (marca, "Contacto", "Quiero correr"), el carrusel, el CTA móvil y el pie con el bloque MAZ, con los textos del diseño, y ya no aparece "Hello world!". Ningún enlace apunta a anclas o rutas inexistentes.
- [ ] (F1) Dada la página `/` en escritorio, cuando hago scroll, entonces la cabecera permanece visible arriba.
- [ ] (F1) Dado el carrusel:
  - sin interacción, cambia de lámina cada ~6,5 s;
  - al pulsar un punto muestra esa lámina, el punto tiene `aria-current="true"` y `role="status"` anuncia "Lámina N de 3: <título>";
  - con el foco dentro de una lámina o la pestaña oculta, no avanza;
  - con `prefers-reduced-motion: reduce`, no avanza solo;
  - "Detener cambio automático de láminas" solo es visible con foco de teclado y alterna con "Reanudar…";
  - en móvil, un deslizamiento horizontal de más de 60 px cambia de lámina;
  - la lámina 1 enlaza a `/contacto?destino=santiago-2027`; las láminas 2 y 3 aún no tienen CTA.
- [ ] (F1) Dado el HTML de `/`, cuando lo inspecciono, entonces encuentro:
  - un único `h1`: "Tu próxima meta es la maratón de Santiago.";
  - `<html lang="es">`;
  - `<title>` "Tu próxima meta es la maratón de Santiago. | Carreras Viajeras";
  - la `meta description` del diseño;
  - `<meta name="theme-color" content="#0144ae">`;
  - `robots` `noindex, nofollow`.
- [ ] (F1) Dado el pie, cuando pulso Facebook o Instagram, entonces se abre en otra pestaña la URL exacta `https://www.facebook.com/p/Carreas-Viajeras-by-MAZ-Producciones-61594941239310/` o `https://www.instagram.com/carrerasviajeras/`. No hay TikTok, enlaces legales ni botón de cookies.
- [ ] (F1) Dado `/contacto?destino=panama`, cuando cargo la página, entonces el selector muestra "Panamá · Quiero novedades". Con `?destino=xyz` o sin parámetro, muestra la opción de Santiago 2027.
- [ ] (F1) Dado el formulario de `/contacto` con campos vacíos o solo espacios, email inválido, teléfono fuera de `[+0-9 ()-]{8,24}` o sin consentimiento, cuando pulso "Preparar mi consulta", entonces no se prepara la consulta.
- [ ] (F1) Dado el formulario válido con destino Santiago, cuando pulso "Preparar mi consulta", entonces:
  - veo "Tu consulta está preparada. Aún no se ha enviado." y el texto de la plantilla de `app.js` (cubierto por un unit test);
  - "Copiar consulta" copia el texto y cambia a "Consulta copiada ✓";
  - "Abrir WhatsApp ↗" apunta a `https://wa.me/51938127170?text=<consulta codificada>` en otra pestaña, con "WhatsApp abrirá tu consulta. Tú decides si enviarla.";
  - la pestaña Red no registra ninguna petición al enviar.
- [ ] (F1) Dada una consulta preparada, cuando edito cualquier campo, entonces el resultado se oculta y el botón vuelve a "Copiar consulta".
- [ ] (F1) Dada la carga de `/` o `/contacto`, cuando reviso la pestaña Red, entonces:
  - no hay peticiones a `fonts.googleapis.com` ni a `fonts.gstatic.com`;
  - las fuentes se sirven desde `/_next/static/media`;
  - los títulos usan Barlow Condensed y el texto DM Sans.
- [ ] (F1) Dado el repositorio:
  - en `modules/landing` y `app` no hay `href` a `*.html`, a `/crm` ni a los afiches;
  - `public/images/` no contiene los afiches;
  - `package.json` no cambia.
- [ ] (F1) Dado un viewport de 360 px, cuando recorro `/` y `/contacto`, entonces no hay scroll horizontal, la nav está oculta, "Quiero correr" es visible y la barra móvil fija no tapa el final del pie.
- [ ] (F1) Dado `/crm/acceso`, cuando lo abro, entonces sigue funcionando; solo cambian las fuentes y el color primario de marca.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 2 — Resto de la landing y página del viaje
- [ ] (F2) Dado `/`, cuando lo recorro, entonces veo en orden: carrusel, datos del viaje, historia, paquete, por qué viajar, blog, destinos, preguntas y pie, con los textos del diseño. La cabecera añade "Próxima maratón" (`/#paquete`) y "Blog" (`/#blog`), y la lámina 2 del carrusel enlaza a `#paquete`. El título de la sección destino no queda tapado por la cabecera.
- [ ] (F2) Dado `/viajes/maraton-santiago-2027`, cuando lo abro, entonces veo:
  - `h1` "Maratón de Santiago 42K 2027";
  - los datos del viaje (fecha, origen, precio, cupos) y los destacados;
  - precios y condiciones (contado, cuotas, reserva, acompañante, nota de pagos);
  - "Sí está incluido" (9 elementos), "No está incluido" y "Detalles que falta confirmar";
  - "Ver anuncio oficial ↗" y el CTA "Quiero correr Santiago ↗" → `/contacto?destino=santiago-2027`;
  - `<title>` "Maratón de Santiago 42K 2027 | Carreras Viajeras".
- [ ] (F2) Dado `/viajes/otro-slug`, cuando lo abro, entonces responde 404. Dado `npm run build`, entonces la ruta `/viajes/maraton-santiago-2027` aparece como prerenderizada (SSG).
- [ ] (F2) Dada la sección `#paquete`, cuando pulso "Quiero correr Santiago" o "Ver más: paquete completo", entonces navego a `/viajes/maraton-santiago-2027`. La tarjeta de destino Santiago y "Descubre el viaje" llevan a la misma página, y la tarjeta de Panamá a `/contacto?destino=panama`.
- [ ] (F2) Dada la sección `#experiencia`, cuando la veo, entonces la imagen tiene el `alt` "Runners compartiendo después de correr en Santiago, imagen ilustrativa generada con IA".
- [ ] (F2) Dados los referentes, cuando abro "Conocer referentes", entonces veo los nombres Daniela Zarfati y Karla Medina con "PARTICIPACIÓN POR CONFIRMAR", "FOTO ILUSTRATIVA · NO ES …" y la nota de imágenes ilustrativas.
- [ ] (F2) Dados los tips, cuando pulso "Viajar", entonces solo se ve la tarjeta `viajar` y ese botón tiene `aria-pressed="true"` (los demás `false`). "Todas" muestra las 6.
- [ ] (F2) Dada la FAQ, cuando abro una pregunta con teclado, entonces se despliega la respuesta. Hay 9 preguntas.
- [ ] (F2) Todos los enlaces externos abren en otra pestaña con `rel="noopener noreferrer"`. No hay enlaces a anclas inexistentes: `#comunidad` todavía no se enlaza.
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 3 — Cuenta del runner y comunidad
- [ ] (F3) Dado `/`, cuando lo recorro, entonces la sección `#comunidad` aparece entre paquete y por qué viajar. La cabecera añade "Comunidad" (`/#comunidad`) y "Ingresar / Registrarse" (`/cuenta`), la lámina 3 enlaza a `#comunidad` y el pie muestra "Tu comunidad" → `/cuenta`. No hay demo de experiencias ni enlaces a `/crm`.
- [ ] (F3) Dado `/cuenta` sin sesión, cuando lo abro, entonces veo la cabecera y el pie de la landing y la columna de `cuenta.html`. Los textos son "TU PASAPORTE A MÁS HISTORIAS", "El próximo viaje empieza contigo." (texto display, no encabezado), "Participa. Comparte. Conecta.", "★ ESTRELLAS POR CORRER Y COMPARTIR" y la nota "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay perfiles persistentes ni descuentos activos.". Sin "Acceso próximamente". Junto a la columna aparece el panel de runner de `accounts`: "Iniciar sesión" con el enlace "Registrarse". La página tiene un único `h1`, el del panel.
- [ ] (F3) Dado un alta en `/cuenta`, cuando verifico el código, entonces me quedo en `/cuenta` con sesión y veo "Qué bueno verte de nuevo." y mi correo. "Cerrar sesión" me deja en `/cuenta` sin sesión.
- [ ] (F3) Dada una sesión de runner sin roles, cuando abro `/crm`, entonces veo "Tu cuenta no tiene acceso al CRM. Pide una invitación a un administrador.". `GET /api/crm/me` responde 403 y no se crean filas en `profiles` ni `staff_*` (comprobación manual en producción, con autorización del usuario; la misma de `accounts-auth-ui.md` F4).
- [ ] (F3) Dado `/crm/acceso`, cuando lo uso, entonces se comporta igual que antes de esta fase.
- [ ] (F3) Dado el HTML de `/cuenta`, entonces el `<title>` es "Ingresar o registrarse | Carreras Viajeras" (segmento hijo: aplica el template del layout) y `robots` es `noindex, nofollow`.
- [ ] (F3) Dado el diff de la fase, entonces solo toca los archivos del plan de F3. No modifica `modules/accounts/*`, `lib/auth/*`, `lib/db*`, `app/crm/*`, `app/api/*`, `drizzle/`, `package.json`, ni añade variables `NEXT_PUBLIC_*`. La landing importa de `@/modules/accounts` solo `RunnerAccount`.
- [ ] (F3) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar), entonces el tamaño gzip del Worker se registra y es < 3 MiB.
- [ ] (F3) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

## Diseño técnico

### Rutas (`app/`)
- **`app/layout.tsx`** (F1, modificar):
  - `lang="es"`;
  - fuentes `DM_Sans({ subsets: ["latin"], variable: "--font-sans" })` y `Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" })`, en lugar de Geist;
  - `metadata = { title: { default: "Carreras Viajeras", template: "%s | Carreras Viajeras" }, description: <description de index.html>, robots: { index: false, follow: false } }`;
  - `export const viewport: Viewport = { themeColor: "#0144ae" }`.
- **`app/page.tsx`** (F1, reescribir; ampliado en F2 y F3):
  - `metadata.title = { absolute: "Tu próxima meta es la maratón de Santiago. | Carreras Viajeras" }`. En Next 16, el `title.template` del layout no se aplica a un `page.js` del mismo segmento (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, líneas 285–288). `/contacto`, `/viajes/[slug]` y `/cuenta` son segmentos hijos, así que en ellas el template sí aplica;
  - compone `<SiteHeader />`, `<main>` con las secciones de la fase, `<SiteFooter />` y `<MobileCta />`.
- **`app/contacto/page.tsx`** (F1, nuevo):
  - `metadata = { title: "Contacto", description: "Consulta por tu próximo viaje con Carreras Viajeras." }`;
  - `async function ContactPage({ searchParams }: PageProps<"/contacto">)` hace `const { destino } = await searchParams;` y renderiza `<SiteHeader /><main><ContactSection destination={destino} /></main><SiteFooter />`.
- **`app/viajes/[slug]/page.tsx`** (F2, nuevo), según la API de Next 16 en `node_modules/next/dist/docs/` (`params` es una Promise; `generateStaticParams`, `dynamicParams` y `generateMetadata`):
  ```tsx
  export const dynamicParams = false; // slugs fuera de TRIPS → 404 sin renderizar en el Worker
  export function generateStaticParams() { return TRIPS.map(({ slug }) => ({ slug })); }
  export async function generateMetadata({ params }: PageProps<"/viajes/[slug]">): Promise<Metadata> {
    const trip = getTrip((await params).slug);
    if (!trip) notFound();
    return { title: trip.name, description: trip.description };
  }
  export default async function TripPage({ params }: PageProps<"/viajes/[slug]">) {
    const trip = getTrip((await params).slug);
    if (!trip) notFound();
    return <><SiteHeader /><main><TripDetail trip={trip} /></main><SiteFooter /></>;
  }
  ```
- **`app/cuenta/page.tsx`** (F3, nuevo): Server Component estático. `metadata = { title: "Ingresar o registrarse" }` (segmento hijo, así que el template del layout aplica); renderiza `<SiteHeader /><main><AccountSection /></main><SiteFooter />`. No llama a `getCrmAccess()`, a guardas ni a la base de datos. Sin `MobileCta`, igual que en `/contacto`.
- **Sin route group `(public)`:** cada página compone `SiteHeader` y `SiteFooter` en una línea. El layout compartido se introducirá con las páginas legales (trabajo futuro), si la repetición crece.

### Tema (`app/globals.css`, F1)
- **`:root`:**
  - `--primary: #0144ae; --primary-foreground: #ffffff;`;
  - nuevo `--highlight: #7ac734;`, registrado en `@theme inline` como `--color-highlight: var(--highlight)`;
  - el resto de tokens shadcn no cambia.
  - Efecto aceptado por el usuario: los botones `default` del CRM pasan a azul.
- **`@theme inline`:** `--font-heading: var(--font-display)`. Aceptado: los títulos con `font-heading` del CRM pasan a Barlow Condensed.
- **`@layer base`:**
  - `html { scroll-padding-top: 7rem; scroll-behavior: smooth }`, con `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto } }`;
  - `:where(a, button, summary, input, select, textarea):focus-visible { outline: 3px solid var(--highlight); outline-offset: 4px }`. Los componentes shadcn conservan su `ring` porque sus utilidades `outline-none` prevalecen.
- **Uso en la landing:**
  - texto y bordes: `text-primary`, `border-primary/25`;
  - fondos azules: `bg-primary text-primary-foreground`;
  - degradados sobre foto: `from-primary/60`;
  - acento: `highlight`;
  - sin colores hex en los componentes.

### Componentes de `modules/landing/components/`
| Componente | Tipo | Fase | Detalle |
|---|---|---|---|
| `button` (`buttonVariants`), `input`, `label` | shadcn (instalado) | F1 | CTAs como `<Link className={buttonVariants(...)}>` con clases de marca (`h-auto rounded-sm px-6 py-4 font-bold`; variante con borde inferior `shadow-[inset_0_-4px_0_var(--highlight)]`); campos del formulario |
| `native-select` | shadcn (instalar: `npx shadcn@latest add native-select`; solo depende de `cn`, ya instalado) | F1 | Selector de destino |
| Carrusel shadcn | descartado | — | Requiere `embla-carousel-react` (dependencia nueva), y el diseño es de fundido, no de desplazamiento |
| Accordion shadcn | descartado | — | `<details>` nativo funciona sin JS y en Server Components |
| `SiteHeader` | nuevo | F1 (mod. F2, F3) | Server. `<header className="sticky top-0 z-40 bg-background shadow-sm">`. Marca (`ArrowUpRight` + "CARRERAS / VIAJERAS") → `/`. `<nav aria-label="Principal">` oculto < `md`, con array local de enlaces. CTA "Quiero correr" → `/contacto`; F3 añade "Ingresar / Registrarse" → `/cuenta` (variante outline). Estático: no lee la sesión |
| `SiteFooter` | nuevo | F1 (mod. F3) | Server. Franja MAZ: logo `maz-producciones.webp`, "Una unidad de MAZ PRODUCCIONES.", razón social, RUC, métricas "+15" y "+500" con "Datos de trayectoria 2025 proporcionados por MAZ Producciones.". Después, contenido del inventario. Constante local `SOCIAL_LINKS` con Facebook e Instagram (URLs exactas; glifos del diseño `aria-hidden` + nombre). `max-sm:pb-28` para dejar sitio a la barra móvil |
| `HeroCarousel` | nuevo | F1 (mod. F2, F3) | Detalle en la subsección siguiente |
| `MobileCta` | nuevo | F1 | Server. `<Link className="fixed inset-x-0 bottom-0 z-30 sm:hidden ...">` con `pb-[calc(1rem+env(safe-area-inset-bottom))]`. Texto: "US$1,499 al contado · Quiero información ↗" |
| `ContactSection` | nuevo | F1 | Server. Props `{ destination?: string \| string[] }`. Columna de texto (eyebrow, `h1`, párrafo, nota "VISTA DE DEMOSTRACIÓN") + `<ContactForm defaultDestination={parseDestinationId(destination)} />` |
| `ContactForm` | nuevo | F1 | Detalle en la subsección siguiente |
| `TripFacts` | nuevo | F2 | Server. Props `{ trip: Trip }`. Los 4 datos de `.trip-strip`. Lo usan `/` y `TripDetail` |
| `PackageSection` | nuevo | F2 | Server. `<section id="paquete" aria-labelledby="package-title">`. Resumen con datos de `TRIPS[0]`; CTA principal y "Ver más: paquete completo" → `/viajes/${trip.slug}` |
| `TripDetail` | nuevo | F2 | Server. Props `{ trip: Trip }`. Portada con `h1` `trip.name`, `<TripFacts />`, destacados, "Precios y condiciones", rejilla "Sí está incluido", "No está incluido", "Detalles que falta confirmar" (abierto) y CTA → `/contacto?destino=${trip.destinationId}` |
| `StorySection` | nuevo | F2 | Server. `<figure>` con `story-runners.webp` y `figcaption` "CORRE. VIAJA. CONECTA."; CTA → página del viaje |
| `WhyUsSection` | nuevo | F2 | Server. 3 puntos clave + `<details>` con 6 tarjetas (array local con iconos lucide `Ticket`, `Building2`, `Users`, `Utensils`, `Heart`, `ShieldCheck`) |
| `BlogSection` | nuevo | F2 | Server. Intro + columnas "Referentes" (`<details>` con 2 tarjetas y nota) y "Tips" (`<details>` con `<TipList tips={TIPS} />` y nota "Información general, revisada el 17/10/2026…"). `TIPS`: array local serializable `{ category, image, eyebrow, title, summary, body, source?: { label, href } }`; los saltos de título van con `\n` + `whitespace-pre-line` |
| `TipList` | nuevo | F2 | `"use client"`. Props `{ tips }`. Estado `filter`; 5 botones con `aria-pressed` en un `role="group" aria-label="Filtrar consejos"`; las tarjetas que no coinciden llevan `hidden` |
| `DestinationsSection` | nuevo | F2 | Server. 3 `Link` (array local); Santiago, con estilo activo, → `/viajes/maraton-santiago-2027` |
| `FaqSection` | nuevo | F2 | Server. `<section id="preguntas">`; 9 `<details>` (array local) |
| `CommunitySection` | nuevo | F3 | Server. `<section id="comunidad" aria-labelledby="community-title">`: imagen `running-team.jpg`, título, texto, CTA "Ingresar / Registrarse" → `/cuenta`, 3 pasos y nota de recompensas. Estático, sin persistencia |
| `AccountSection` | nuevo | F3 | Server. Rejilla de dos columnas de `cuenta.html`: (1) imagen `running-team.jpg` (alt "Corredores juntos, imagen ilustrativa") con eyebrow "TU PASAPORTE A MÁS HISTORIAS", "El próximo viaje empieza contigo." como párrafo con estilo display (`font-heading`, no encabezado), "Participa. Comparte. Conecta." y "★ ESTRELLAS POR CORRER Y COMPARTIR"; (2) eyebrow "COMUNIDAD CARRERAS VIAJERAS", `<RunnerAccount />` y la nota de demostración. No pasa props a `RunnerAccount` |

Todos son de un único dominio (landing) y van en `modules/landing/components/`. No existe nada equivalente en el proyecto ni en shadcn más allá de lo indicado.

#### `HeroCarousel`
`"use client"`. Array local de 3 láminas `{ image, alt, label, title, cta? }`; en F1 solo la lámina 1 tiene `cta`.

- **Estado:** `index`, `paused` (inicial = `prefers-reduced-motion`, sincronizado con su evento `change`) y `focused`.
- **Autoplay:** `setTimeout` de 6500 ms, reprogramado en cada cambio. No se programa si `paused`, `focused` o `document.hidden` (escucha `visibilitychange`).
- **Láminas:** las no activas llevan `hidden`. La lámina 1 usa `h1` e imagen con `preload`/`fetchPriority="high"`; las 2 y 3, `h2` y `loading="lazy"`.
- **Controles:** puntos `button` con el `aria-label` del diseño y `aria-current`. Botón `sr-only focus-visible:not-sr-only` para pausar o reanudar.
- **Anuncios:** `role="status"` solo en cambios manuales.
- **Swipe:** `onTouchStart`/`onTouchEnd`; cambia si |dx| > 60 y |dx| > 1,5·|dy|.
- **Fundido:** con `motion-safe:`.

#### `ContactForm`
`"use client"`.

- **Campos y atributos de `contacto.html`:**
  - `name`: `autocomplete="given-name"`, `maxlength` 80;
  - `email`: `type="email"`, `maxlength` 150;
  - `phone`: `type="tel"`, `pattern="[+0-9 ()-]{8,24}"`, `maxlength` 24;
  - `destination`: `NativeSelect` con las 3 opciones literales;
  - `consent`: checkbox nativo `required` con `accent-primary`.
- **Validación:** la nativa del navegador. En `onSubmit` se recortan los valores; si alguno queda vacío se muestra `role="alert"` "Revisa los datos del formulario.". Si no, `buildInquiryMessage`.
- **Resultado** (`role="status"`):
  - título y texto en bloque `whitespace-pre-line` (`aria-label="Consulta preparada"`);
  - "Copiar consulta": usa `navigator.clipboard.writeText`. Si falla, selecciona el texto con `window.getSelection().selectAllChildren` y muestra "Seleccionamos tu consulta. Usa la opción Copiar de tu dispositivo.";
  - enlace "Abrir WhatsApp ↗" con `buildWhatsAppUrl(WHATSAPP_NUMBER, message)` y el texto "WhatsApp abrirá tu consulta. Tú decides si enviarla."; si devolviera `null`, el texto de canal pendiente del diseño.
- **Edición:** `onInput` del form oculta el resultado.
- **Red:** sin `fetch`.

### Utils de `modules/landing/utils/`
- **`inquiry.ts`** (F1):
  ```ts
  export const DESTINATION_IDS = ["santiago-2027", "panama", "medellin"] as const;
  export type DestinationId = (typeof DESTINATION_IDS)[number];
  export const WHATSAPP_NUMBER = "51938127170"; // dato público del canal comercial (+51 938 127 170)
  export function parseDestinationId(value: unknown): DestinationId; // ?destino= → id válido o "santiago-2027"
  export function buildInquiryMessage(input: { name: string; email: string; phone: string; destination: DestinationId }): string;
  export function buildWhatsAppUrl(number: string, text: string): string | null;
  ```
  Plantilla literal de `app.js`. Nombres: `santiago-2027` → "Maratón de Santiago 42K 2027", `panama` → "Panamá", `medellin` → "Medellín".
  ```
  Hola, soy {name}. Me interesa {nombre}{cláusula}. Quisiera conocer disponibilidad, inclusiones y condiciones finales.
  Correo: {email}
  WhatsApp: {phone}
  Entiendo que esta consulta no constituye reserva ni pago.
  ```
  - `{cláusula}`: " y la preventa por corredor: US$1,499 al contado o US$1,799 en cuotas, con reserva anunciada de US$300" para Santiago; " cuando haya una propuesta confirmada" para el resto.
  - `buildWhatsAppUrl`: elimina los caracteres que no son dígitos; si el resultado no cumple `^\d{10,15}$`, devuelve `null`; si cumple, `https://wa.me/${digits}?text=${encodeURIComponent(text)}`.
- **`trips.ts`** (F2):
  ```ts
  export type Trip = {
    slug: string; destinationId: DestinationId; name: string; description: string;
    image: string; imageAlt: string; coverLabel: string;            // "SANTIAGO 2027\nMARATÓN · 42K"
    raceDate: string; officialUrl: string; route: string; routeNote: string;
    capacity: string; capacityNote: string;
    highlights: string[];
    prices: { cash: string; installmentsTotal: string; reservation: string; companion: string; companionNote: string; paymentNote: string };
    included: { title: string; text: string }[];
    excluded: string[];
    pendingDetails: string[];                                         // párrafos de "Detalles que falta confirmar"
    disclaimer: string;
  };
  export const TRIPS: readonly Trip[]; // un elemento: maraton-santiago-2027, textos literales de index.html
  export function getTrip(slug: string): Trip | undefined;
  ```
  - Los valores se guardan tal como se muestran (por ejemplo, "US$1,499"), sin función de formato.
  - `description` es la meta description de `index.html`.
  - `TRIPS` es la única fuente de datos del paquete: la usan `TripFacts`, `PackageSection`, `TripDetail` y la ruta.
- Sin hooks, services, stores, schemas zod, TanStack Query, axios ni zustand en el módulo landing.

### Cuenta del runner: qué se usa de `modules/accounts` (F3)
- **Único import:** `RunnerAccount` desde `@/modules/accounts`. Lo crea `accounts-auth-ui.md` F4: `AccessPanel audience="runner"` con alta, verificación por código, `EMAIL_NOT_VERIFIED`, recuperación de contraseña y mensajes sin enumeración, más `SignOutButton redirectTo="/cuenta"` y los estados de sesión con `authClient.useSession()`.
- **La landing no toca** `AccessPanel`, los formularios, `authClient`, `getCrmAccess()`, `CrmShell`, `NoCrmAccess`, `lib/auth/*`, las tablas ni las páginas del CRM.
- **Encabezados:** el único `h1` de `/cuenta` lo aporta `RunnerAccount`: el título del formulario activo ("Iniciar sesión", "Crea tu cuenta"…) o, con sesión, "Qué bueno verte de nuevo.". Por eso `AccountSection` muestra "El próximo viaje empieza contigo." como texto display, no como encabezado.

### Contrato de API
No se añaden APIs.
- F1 y F2 no hacen peticiones.
- F3 usa los endpoints existentes de Neon Auth a través del proxy same-origin, con los métodos de `accounts-auth-ui.md` (Requisitos 1) más `useSession()` del mismo cliente (`ReactAuthClient` de better-auth, exportado por `createAuthClient()` de `@neondatabase/auth/next`).

### Base para el trabajo futuro (sin implementarlo)
- **Viajes:** `TRIPS` y `getTrip(slug)` hacen de contrato de lectura. Cuando exista el catálogo en Neon, `getTrip` y `generateStaticParams` leerán de `trips-catalog` con el mismo `slug` y la misma ruta `/viajes/[slug]`.
- **Runner:** su identidad es el `user.id` de Neon Auth. Un futuro perfil de runner irá en una tabla propia (no en `profiles`, que es solo de staff), referenciada por ese id. Comunidad y experiencias colgarán de esa identidad, y una futura guarda de runner (sesión con correo verificado, sin roles de staff) protegerá sus recursos.
- **Leads:** `buildInquiryMessage` y los campos del formulario son la base del payload de la futura spec de leads.

### API pública de `modules/landing/index.ts`
- F1: `SiteHeader`, `SiteFooter`, `HeroCarousel`, `MobileCta`, `ContactSection`.
- F2: añade `TripFacts`, `PackageSection`, `TripDetail`, `StorySection`, `WhyUsSection`, `BlogSection`, `DestinationsSection`, `FaqSection`, `TRIPS`, `getTrip` y `type Trip`.
- F3: añade `CommunitySection` y `AccountSection`.
- `ContactForm` y `TipList` son internos.

### Assets de `public/images/` (F1)
- Copia directa: `santiago.jpg`, `panama.jpg`, `medellin.jpg`, `running-road.jpg`, `running-team.jpg`, `running-training.jpg`.
- Conversión a WebP: `story-runners.webp` (ancho 1536, calidad 80) y `maz-producciones.webp` (ancho 480, calidad 90).
- Se copian todos en F1 para que F2 y F3 no toquen `public/`.

## Reutilización
- shadcn ya instalados: `Button`/`buttonVariants`, `Input`, `Label`. Nuevo: `native-select`, sin dependencias npm.
- `cn` de `@/lib/utils`, `lucide-react`, `next/image`, `next/link`, `next/font/google`, `notFound` de `next/navigation`.
- `sharp` (transitivo de `next`), solo para la conversión puntual de las dos imágenes.
- F3: `RunnerAccount` de `@/modules/accounts` (`accounts-auth-ui.md` F4), que encapsula `AccessPanel`, sus formularios, `SignOutButton` y `authClient`. No hay un segundo sistema de auth.

## Tests
- **`modules/landing/utils/inquiry.test.ts`** (F1):
  - `buildInquiryMessage`:
    - Santiago devuelve exactamente la plantilla con la cláusula de precios;
    - Panamá y Medellín usan su nombre y " cuando haya una propuesta confirmada", sin precios;
    - siempre incluye las líneas `Correo:` y `WhatsApp:` y el aviso final.
  - `buildWhatsAppUrl`:
    - `WHATSAPP_NUMBER` → `https://wa.me/51938127170?text=…`;
    - `"+51 938 127 170"` → los mismos dígitos;
    - el texto va codificado, con acentos y saltos de línea;
    - `""`, 9 dígitos o 16 dígitos → `null`.
  - `parseDestinationId`: `"panama"` → `"panama"`; `undefined`, `"xyz"` o `["panama"]` → `"santiago-2027"`.
- F3 no añade tests en la landing: la lógica de acceso y sus tests (`AccessPanel.test.tsx`, `RunnerAccount.test.tsx`) son de `accounts-auth-ui.md` F4.
- **Sin unit tests**, según `docs/SETUP.md`:
  - las secciones presentacionales, incluidas `CommunitySection` y `AccountSection`;
  - `HeroCarousel`, `ContactForm` y `TipList`, por ser componentes de módulo y no de `components/shared`;
  - `trips.ts`: `TRIPS` es dato y `getTrip` un `find` trivial;
  - `native-select`, las páginas y el layout.

  Su comportamiento se verifica con los criterios de aceptación.

## Plan de tareas
### Fase 1 — Base, cabecera, carrusel, pie, CTA móvil y `/contacto`
Entregable: `/` con cabecera, carrusel, pie (con MAZ y redes) y CTA móvil, más `/contacto` funcional con WhatsApp. Sin enlaces a contenido de fases posteriores. Total: 15 archivos (1 de test y 1 generado por shadcn) + 8 imágenes.
- [x] T1 — Base compartida: instalar `native-select`, `images.unoptimized`, tokens/foco/scroll, fuentes + `lang` + metadata + viewport e imágenes · archivos: `components/ui/native-select.tsx`, `next.config.ts`, `app/globals.css`, `app/layout.tsx`, `public/images/*` (8) · depende de: — · secuencial (base)
- [x] T2 — Utilidades de la consulta con test · archivos: `modules/landing/utils/inquiry.ts`, `modules/landing/utils/inquiry.test.ts` · depende de: T1 · paralelo con T3
- [x] T3 — Cabecera, pie (MAZ y redes), carrusel y CTA móvil · archivos: `modules/landing/components/SiteHeader.tsx`, `modules/landing/components/SiteFooter.tsx`, `modules/landing/components/HeroCarousel.tsx`, `modules/landing/components/MobileCta.tsx` · depende de: T1 · paralelo con T2 y T4
- [x] T4 — Formulario y sección de contacto · archivos: `modules/landing/components/ContactForm.tsx`, `modules/landing/components/ContactSection.tsx` · depende de: T1, T2 · paralelo con T3
- [x] T5 — API pública y rutas `/` y `/contacto` · archivos: `modules/landing/index.ts`, `app/page.tsx`, `app/contacto/page.tsx` · depende de: T3, T4 · secuencial (final; `index.ts` va aquí porque exporta lo creado en T3/T4 y ninguna tarea paralela lo toca)

### Fase 2 — Resto de la landing y página del viaje
Entregable: `/` con todas las secciones salvo comunidad, y `/viajes/maraton-santiago-2027`. Total: 15 archivos. Requiere F1.
- [x] T1 — Datos del viaje y sus componentes: `TRIPS`, datos, paquete, detalle y destinos · archivos: `modules/landing/utils/trips.ts`, `modules/landing/components/TripFacts.tsx`, `modules/landing/components/PackageSection.tsx`, `modules/landing/components/TripDetail.tsx`, `modules/landing/components/DestinationsSection.tsx` · depende de: Fase 1 · paralelo con T2 y T3
- [x] T2 — Historia, por qué viajar y FAQ · archivos: `modules/landing/components/StorySection.tsx`, `modules/landing/components/WhyUsSection.tsx`, `modules/landing/components/FaqSection.tsx` · depende de: Fase 1 · paralelo con T1 y T3 (StorySection enlaza a la ruta del viaje como literal, sin importar `trips.ts`)
- [x] T3 — Blog (referentes y tips con filtro) · archivos: `modules/landing/components/BlogSection.tsx`, `modules/landing/components/TipList.tsx` · depende de: Fase 1 · paralelo con T1 y T2
- [x] T4 — Ruta del viaje, exports, composición de `/`, nav ("Próxima maratón", "Blog") y CTA de la lámina 2 · archivos: `app/viajes/[slug]/page.tsx`, `modules/landing/index.ts`, `app/page.tsx`, `modules/landing/components/SiteHeader.tsx`, `modules/landing/components/HeroCarousel.tsx` · depende de: T1, T2, T3 · secuencial

### Fase 3 — Cuenta del runner y comunidad
Entregable: `/cuenta` con alta, ingreso, verificación, recuperación y cierre de sesión con Neon Auth, la sección `#comunidad` y los enlaces "Ingresar / Registrarse". Total: 8 archivos, todos de la landing o de `app/`.
Requisito previo: `accounts-auth-ui.md` F4 aprobada; T2 y T3 requieren además su F4-T2 implementada (`RunnerAccount` exportado). Si falta, esas tareas se detienen; T1 no depende de ella.
- [x] T1 — Comunidad estática y enlaces de cuenta: nav "Comunidad" (`/#comunidad`) e "Ingresar / Registrarse" (`/cuenta`, variante outline) en la cabecera, "Tu comunidad" en el pie y CTA de la lámina 3 (`#comunidad`) · archivos: `modules/landing/components/CommunitySection.tsx`, `modules/landing/components/SiteHeader.tsx`, `modules/landing/components/SiteFooter.tsx`, `modules/landing/components/HeroCarousel.tsx` · depende de: Fase 2 · paralelo (con `accounts-auth-ui` F4-T1, F4-T2 y F4-T3; archivos disjuntos)
- [x] T2 — Sección de cuenta con la columna de `cuenta.html` y `RunnerAccount` · archivos: `modules/landing/components/AccountSection.tsx` · depende de: `accounts-auth-ui` F4-T2 · paralelo con T1
- [x] T3 — Exports, `#comunidad` en `/` (entre paquete y por qué viajar) y ruta `/cuenta`; medir el Worker sin desplegar · archivos: `modules/landing/index.ts`, `app/page.tsx`, `app/cuenta/page.tsx` · depende de: T1, T2 · secuencial (final)

### Trabajo futuro (fuera de esta spec, cada uno con su spec)
- **Catálogo de maratones en Neon:** reescribir `trips-catalog.md` sobre Neon. `/viajes/[slug]` pasará a leer del catálogo con el mismo slug y la misma ruta. `TRIPS` se sustituye por el servicio del catálogo, y `generateStaticParams`/`dynamicParams` se revisarán (ISR o render por petición).
- **Leads:** formulario protegido (consentimiento versionado, Turnstile Siteverify), lead y evento en una transacción Neon, outbox y API privada claim/ack para n8n local, según `platform-neon-foundation.md`. Sustituirá la consulta preparada de `ContactForm`. `crm-leads-pipeline.md` debe reescribirse.
- **Comunidades y área de runners:** perfil de runner en tabla propia, experiencias y fotos persistentes, estrellas y moderación, sobre la identidad de F3 y una guarda de runner. Recupera la demo omitida.
- **Páginas legales y secundarias:** `/pasion-por-correr`, `/terminos`, `/privacidad`, `/cookies`, `/libro-de-reclamaciones`, `/informacion-comercial`. Al llegar se reactivan los enlaces omitidos del pie, "Conoce al operador", "Ver privacidad" y TikTok, y se revisa `noindex`. Requiere domicilio, correos, textos legales y Libro de Reclamaciones habilitado.

## Preguntas abiertas
1. **(Resuelta)** La audiencia runner se especifica en `accounts-auth-ui.md` F4, no como excepción de esta spec. F3 depende de esa fase.
2. **(No bloqueante) Texto desactualizado en `accounts-roles-permissions.md`.** Sus apartados de objetivo y alcance dicen que los runners son "visitantes anónimos, sin cuenta ni perfil". Su mecánica sigue siendo válida (registro libre → 403, sin perfil). El README se corrige en `accounts-auth-ui.md` F4-T3. ¿Quieres actualizar también esa spec? Volvería a `borrador` y necesitaría tu aprobación.
