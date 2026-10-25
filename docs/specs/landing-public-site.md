# Landing pública de Carreras Viajeras (port del diseño HTML/CSS/JS)

- Módulo: landing
- Estado: borrador
- Enmienda (2026-10-25, rehecha tras integrar `landing-race-pages.md`): (1) registra que `landing-race-pages.md` (aprobada, implementada en PR #20) **sustituye** `/viajes/[slug]`: plantilla única minimalista alimentada solo por el catálogo publicado (Santiago incluido), sin contenido fijo de la página del viaje; `TRIPS` queda solo para `/`, que sigue estática; (2) el runner llega a `/mis-carreras` tras ingresar en `/cuenta`, `/cuenta` con sesión enlaza a "Ver mis carreras" y "Mi perfil", cambia la nota de `AccountSection` y se exportan `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER` (`runner-portal.md` y `accounts-runner-profiles.md`, aprobadas); (3) lo que pide `sponsors-portal.md` F7 a la landing ("Presentado por <marca>" dentro de la plantilla minimalista, `/patrocinadores/[slug]` y, solo si se confirma su Pregunta abierta 1, "Eventos destacados" en `/`) queda **pendiente de una enmienda de `sponsors-portal.md` F7**, cuya F7 aprobada describe vistas y componentes que ya no existen (Pregunta abierta 8); (4) corrige "Assets" (`.webp` reales en `public/images/`), los enlaces de Río y Roma (PR #24) y que `/contacto` es dinámica (`ƒ`). Esta spec no gana tareas: cada cambio lo implementa la spec indicada en "Enmienda: qué implementa cada spec".
- Base: `platform-neon-foundation.md` (aprobada). F1 y F2 no usan base de datos, auth, D1, Hyperdrive, Access ni Turnstile. F3 usa Neon Auth solo a través de la API pública de `modules/accounts` y **no cambia** el control de acceso del CRM (`accounts-roles-permissions.md`, aprobada). F4 lee el catálogo publicado de Neon solo a través de la API pública de `modules/trips` (`trips-catalog.md`, aprobada; F1 y F2 en `main`, PR #6 y #11).
- Depende de: F3 requiere `accounts-auth-ui.md` **Fase 4 (audiencia runner) aprobada e implementada**: `RunnerAccount` exportado desde `@/modules/accounts`. F3 no modifica archivos de `modules/accounts`. F4 usa el contrato de lectura pública de `trips-catalog.md` sin modificar `modules/trips` y exige la precondición operativa de F4 antes de mergear.
- F1–F4 implementadas en `main`. **`/viajes/[slug]` lo gobierna desde entonces `landing-race-pages.md` (F1 y F2 implementadas, PR #20)**: donde esta spec describe la página del viaje (F2, F4), es histórico y prevalece aquella. La amplían (enmienda 2026-10-25): `runner-portal.md` (F5-T1, F6), `accounts-runner-profiles.md` (F2-T5) y `sponsors-portal.md` (F6-T2 y, pendiente de enmendar, F7).
- Fuente de diseño (solo local, excluida en `.git/info/exclude`; no se importa ni se versiona): `docs/Rediseño de Landing/Carreras-Viajeras-Web-HTML-CSS-JS/`: `index.html` (landing), `contacto.html` (formulario), `cuenta.html` (acceso), CSS/JS asociados, `LEEME.txt` y capturas en `docs/Rediseño de Landing/*.png`. El developer copia de ahí los **textos literales** de cada sección; esta spec solo enumera las adaptaciones y omisiones.

## Objetivo
Publicar la landing diseñada por el usuario para runners peruanos interesados en la Maratón de Santiago 42K 2027 (y destinos en exploración). Incluye:
- una página por viaje, empezando por `/viajes/maraton-santiago-2027`;
- `/contacto`, que **prepara** una consulta para copiarla o abrirla en WhatsApp, sin enviar ni guardar datos;
- `/cuenta`, donde un runner se registra, inicia sesión y la cierra con la cuenta de Neon Auth existente, sin obtener acceso al CRM.
- (F4) que la página del viaje muestre los datos que el equipo comercial mantiene en `/crm/viajes` (título, fecha de la carrera, precio "desde", cupos y resumen) sin redesplegar, y responda 404 si el viaje no está publicado.
- (Enmienda; hecho en `landing-race-pages.md`) que cada carrera publicada en el CRM tenga su landing en `/viajes/<slug>` con una plantilla única minimalista y toda su información del catálogo.
- (Enmienda; pendiente de la enmienda de `sponsors-portal.md` F7) que la página de un evento de marca muestre "Presentado por <marca>" dentro de esa plantilla y que cada marca con eventos publicados tenga `/patrocinadores/<slug>`. "Eventos destacados" en `/` depende de la Pregunta abierta 1 de `sponsors-portal.md`.

Sustituye el template "Hello world".

## Alcance
- Incluye:
  - Port a Next 16 (Server Components, Tailwind v4, shadcn/ui base-nova) de las secciones de `index.html` listadas en "Inventario de secciones", en el mismo orden y con sus textos.
  - `/contacto` (port de `contacto.html`): consulta preparada, copia al portapapeles y enlace a WhatsApp `+51 938 127 170`.
  - `/viajes/[slug]`: ruta dinámica con contenido estático. El único viaje es `maraton-santiago-2027`, con los datos del paquete Santiago del diseño.
  - `/cuenta` (inspirada en `cuenta.html`): ingresar, registrarse con verificación por código y cerrar sesión con Neon Auth, reutilizando `modules/accounts`. Enlaces "Ingresar / Registrarse" en cabecera, comunidad y pie.
  - (F4) `/viajes/[slug]` lee el viaje publicado con `getPublishedTripBySlug` de `@/modules/trips` y lo combina con el contenido fijo de la landing. La página pasa a renderizarse por petición. (Sustituido por `landing-race-pages.md` F2, ver abajo.)
  - (Enmienda 2026-10-25; sin tareas en esta spec, ver "Enmienda: qué implementa cada spec"):
    - **hecho (`landing-race-pages.md` F2, PR #20):** `/viajes/[slug]` es una plantilla única minimalista (`TripDetail` con `TripLanding`) alimentada solo por el catálogo publicado, para cualquier viaje publicado, Santiago incluido; CTA "Consultar por WhatsApp" con `buildTripInquiryMessage`; `getTrip` y el contenido fijo de la página del viaje se eliminaron, y `TRIPS` solo alimenta `/`;
    - tras ingresar o verificar en `/cuenta`, destino `/mis-carreras`; `/cuenta` con sesión muestra "Ver mis carreras" (`runner-portal.md` F6) y "Mi perfil" (`accounts-runner-profiles.md` F2-T5); los enlaces los pone `RunnerAccount`, no la landing;
    - nota de `AccountSection` sin "no hay perfiles persistentes" (`accounts-runner-profiles.md` F2-T5);
    - exportar `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER` desde `@/modules/landing` para `modules/bookings` (`runner-portal.md` F5-T1); los tres siguen existiendo tras `landing-race-pages.md` (en `SiteHeader.tsx` e `inquiry.ts`), aún sin exportar;
    - **pendiente de la enmienda de `sponsors-portal.md` F7:** "Presentado por <marca>" dentro de la plantilla minimalista de `/viajes/<slug>` cuando el viaje publicado tiene marca (sin segunda vista ni plantilla aparte);
    - **pendiente de la enmienda de `sponsors-portal.md` F7:** ruta pública `/patrocinadores/[slug]`;
    - **pendiente de la Pregunta abierta 1 de `sponsors-portal.md`:** sección "Eventos destacados" en `/`, que la haría dinámica. Mientras no se confirme, `/` sigue estática, como fija `landing-race-pages.md`.
  - Redes oficiales en el pie: Facebook e Instagram.
  - Tokens de marca (azul `#0144ae`, verde `#7ac734`, blanco) en `app/globals.css`; también se aplican al CRM.
  - Fuentes DM Sans y Barlow Condensed con `next/font/google`: autoalojadas, sin peticiones a Google en runtime.
  - Imágenes en `public/images/`; `<html lang="es">`, metadata, `theme-color`, accesibilidad básica y responsive desde 360 px.
- No incluye:
  - Envío o almacenamiento de leads, Turnstile, APIs nuevas, tablas o migraciones, analítica (se descarta el `track()` de `app.js`).
  - Perfil de runner (lo cubre `accounts-runner-profiles.md`, `/cuenta/perfil`), experiencias o fotos persistentes, estrellas, recompensas, inscripción a eventos.
  - La demo de comunidad de `index.html`: formulario de experiencias, vista previa local de fotos, filtro de historias e invitación copiable.
  - Páginas `pasion-por-correr`, `terminos`, `privacidad`, `cookies`, `reclamaciones` e `informacion-comercial` (trabajo futuro).
  - Diálogo de preferencias de cookies: la app no usa cookies opcionales; las de sesión de Neon Auth son técnicas.
  - TikTok: no hay URL oficial.
  - Afiches `paquete-santiago-referencia.png` y `preventa-santiago-referencia.png`: no se publican.
  - `experience-tabs.*`, `journey.js`, `simplified.js` y `blog-links.js`.
  - Afirmar la condición de partner de Santiago 2027, testimonios, cifras o datos legales ausentes del diseño.
  - Lectura del catálogo en `/` (F4 solo cambia la página del viaje): datos del viaje, paquete, tarjeta de Santiago en destinos, CTA móvil y la cláusula de precios de la consulta siguen con contenido fijo y `/` sigue estática. Ver "Fase 4". **Enmienda:** `landing-race-pages.md` mantiene `/` estática con la copia fija de `TRIPS`. La única lectura del catálogo prevista en `/` es "Eventos destacados" (`sponsors-portal.md` F7), pendiente de su Pregunta abierta 1; si se confirma, `/` pasa a dinámica y el resto de la portada sigue con contenido fijo.
  - Mostrar en la página del viaje los campos del catálogo sin hueco en el diseño (`distances`, `includes`, `startDate`/`endDate`, `city`/`country`, `imageUrl`), una plantilla genérica para viajes sin contenido fijo, `loading.tsx` o `error.tsx` en `app/viajes/`. **Enmienda:** las dos primeras exclusiones ya no aplican: `landing-race-pages.md` sustituye la página por su plantilla única, que muestra esos campos y los siete que añade al catálogo. `loading.tsx` y `error.tsx` siguen excluidos.
  - Cambios en `modules/trips/**` o en `README.md` más allá de su sección "Lectura pública para la landing".
  - Cambios en `lib/auth/*`, `lib/db*`, `app/crm/*`, `app/api/*`, en las tablas `profiles`/`staff_*` o en la matriz de permisos (los que hacen las specs que amplían esta son de ellas).
  - Las rutas privadas `/mis-carreras` (`runner-portal.md`), `/cuenta/perfil` (`accounts-runner-profiles.md`) y `/patrocinador/**` (`sponsors-portal.md`) no son de esta spec, aunque las dos primeras reutilizan `SiteBrand`, `SiteHeader` o `SiteFooter`.
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
   | Tarjetas de destino Río / Roma | `/contacto?destino=rio` / `?destino=roma`. **Estado real (PR #24, fuera de esta spec):** `/viajes/maraton-rio-2027` / `/viajes/maraton-roma-2027`, que responden 404 hasta que esos viajes se publiquen en el CRM (Pregunta abierta 9) |
   | Cabecera `#paquete`, `#comunidad`, `#blog` | `/#paquete`, `/#comunidad`, `/#blog` (la cabecera se usa en todas las páginas) |
   | `pasion-por-correr.html` ("Descubre el viaje") | `/viajes/maraton-santiago-2027` |
   | `cuenta.html`, `cuenta.html#registro` ("Ingresar / Registrarse") | `/cuenta` |
   | `terminos.html`, `privacidad.html`, `cookies.html`, `reclamaciones.html`, `informacion-comercial.html`, "Ver afiche de inclusiones", "Ver privacidad" | se omite el enlace; el Libro de Reclamaciones se muestra como texto con "Pendiente de habilitación" |
   | Externos (maratondesantiago.cl, NHS, B.A.A., Facebook, Instagram, WhatsApp) | `target="_blank" rel="noopener noreferrer"` |
   | (Enmienda; `landing-race-pages.md` F2) "Ver web oficial" y "Consultar por WhatsApp" de la plantilla del viaje | externos, `target="_blank" rel="noopener noreferrer"` |
   | (Enmienda; pendiente de la enmienda de `sponsors-portal.md` F7) "Presentado por <marca>" en la plantilla del viaje / tarjetas de la marca (y de "Eventos destacados", si se confirma) | `/patrocinadores/<slug>` / `/viajes/<slug>` (solo viajes publicados; la marca solo tiene página si tiene eventos publicados, así que el enlace nunca queda roto) |
   | (Enmienda; pendiente de la enmienda de `sponsors-portal.md` F7) "Visitar sitio web" de la marca | externo, `target="_blank" rel="sponsored noopener noreferrer"` |
3. **Indexación:** `robots: { index: false, follow: false }` en todo el sitio mientras falten datos legales (decisión del usuario). Con la enmienda también se aplica a `/patrocinadores/[slug]`, que hereda el `robots` del layout aunque `sponsors-portal.md` la describa como "Indexable" (ver Pregunta abierta 6).
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
   - **Desde F4** (sustituye los dos puntos anteriores solo para `/viajes/[slug]`; `/` no cambia):
     - sin `generateStaticParams` ni `dynamicParams`: la página se renderiza por petición (`connection()` dentro del service del catálogo);
     - responde 404 si el slug no tiene contenido fijo en `TRIPS` (sin consultar Neon) o si el catálogo no lo devuelve publicado (inexistente, borrador o archivado);
     - título, resumen (meta description), fecha de la carrera, precio "desde" y cupos salen del catálogo; el resto sigue siendo contenido fijo del diseño (tabla de combinación en "Fase 4").
   - **Desde `landing-race-pages.md` F2** (enmienda; sustituye los puntos de F4 y la combinación con `TRIPS`; detalle en esa spec, Requisitos 4–9):
     - `getCatalogTrip(slug)` consulta siempre el catálogo (`getPublishedTripBySlug` devuelve `null` sin consultar si el slug no es canónico) y devuelve `TripLanding`; 404 solo si el viaje no está publicado (inexistente, borrador, en revisión o archivado);
     - una sola plantilla minimalista (`TripDetail`) para todo viaje publicado: cabecera, datos clave, precio, "Qué incluye", "No incluye", "Detalles por confirmar" y CTA "Consultar por WhatsApp"; los bloques sin dato no se pintan;
     - la página no importa ni lee `TRIPS`; `getTrip` ya no existe;
     - `generateMetadata` usa `title`, `summary` y, si existe, `imageUrl` en `openGraph.images`.
   - **Pendiente de la enmienda de `sponsors-portal.md` F7:** si el viaje publicado tiene marca (`PublicTrip.sponsor`, de `sponsors-portal.md` F6), la misma plantilla muestra "Presentado por <marca>" enlazado a `/patrocinadores/<slug>`; sin marca no muestra nada. No hay segunda vista, y el 404 y el CTA no cambian.
9. **Cuenta de runner (F3):** la landing aporta la ruta, el diseño y los enlaces. Toda la lógica de acceso es de `accounts-auth-ui.md` F4 (Requisito 12), consumida solo a través de `RunnerAccount`.
   - **Identidad y acceso al CRM:** un runner es una cuenta de Neon Auth sin roles de staff. El CRM sigue denegado por defecto (`requireCrmUser()`: correo verificado + rol activo por `user_id`). Un runner que abre `/crm` ve "Tu cuenta no tiene acceso al CRM…" y no se crean filas en `profiles` ni `staff_*`.
   - **Navegación:** tras ingresar o verificar en `/cuenta`, la persona se queda en `/cuenta`, también si es staff (F3). **Desde `runner-portal.md` F6** (enmienda), va a `/mis-carreras`, también si es staff. Tras cerrar sesión vuelve a `/cuenta`. Los destinos los fija `accounts` como uniones cerradas; la landing no pasa ni lee destinos.
   - **`/cuenta` con sesión** (enmienda): `RunnerAccount` muestra "Qué bueno verte de nuevo.", el correo, "Ver mis carreras" → `/mis-carreras` (`runner-portal.md` F6-T2), "Mi perfil" → `/cuenta/perfil` (`accounts-runner-profiles.md` F2-T5) y "Cerrar sesión". `/cuenta` no redirige a quien tiene sesión.
   - **Página estática:** `app/cuenta/page.tsx` no llama a `getCrmAccess()`, a guardas ni a la base de datos, y sigue estática (`○`) con la enmienda. El estado de sesión lo muestra `RunnerAccount` en el cliente, solo como presentación.
   - **Comunidad sin persistencia:** `#comunidad` es contenido estático con un CTA a `/cuenta`. No hay experiencias, fotos ni estrellas. Los datos del runner (perfil y reservas) viven en `/cuenta/perfil` y `/mis-carreras`, fuera de esta spec.
   - **Sin regresiones:** `/crm/acceso` no cambia. Esta fase no modifica `modules/accounts`, `lib/auth/*`, `app/crm/*`, `app/api/*` ni `drizzle/`.
   - **Tamaño del Worker:** se mide sin desplegar y debe seguir < 3 MiB gzip.

### Inventario de secciones (orden de `index.html`)
| # | id / elemento | Componente | Fase | Interacción | Adaptaciones respecto al diseño |
|---|---|---|---|---|---|
| 1 | `header` (fijo) | `SiteHeader` | F1; F2 añade "Próxima maratón" y "Blog"; F3 añade "Comunidad" e "Ingresar / Registrarse" | CSS `sticky` | Orden final de la nav: "Próxima maratón", "Comunidad", "Blog", "Contacto". CTA "Quiero correr" desde F1 |
| 2 | `#inicio` carrusel | `HeroCarousel` (client) | F1; el CTA de la lámina 2 llega en F2 y el de la lámina 3 en F3 | Láminas, puntos, autoplay 6,5 s, swipe | Las 3 láminas con textos e imágenes. Lámina 2 → `#paquete`, lámina 3 → `#comunidad` |
| 3 | `.trip-strip` | `TripFacts` | F2 | — | Datos de `TRIPS`; se reutilizaba en la página del viaje. Desde `landing-race-pages.md` F2, solo en `/` |
| 4 | `#experiencia` | `StorySection` | F2 | — | "Descubre el viaje" → `/viajes/maraton-santiago-2027` |
| 5 | `#paquete` | `PackageSection` | F2 | — | Resumen (portada, pitch, destacados, precios, aviso) con datos de `TRIPS`. El `<details>` "Ver más: paquete completo" pasa a ser un enlace a la página del viaje, donde vive el detalle (sin duplicarlo). Sin enlace al afiche |
| 6 | `#comunidad` | `CommunitySection` | F3 | — | Bloque hero (imagen, título, texto) con CTA "Ingresar / Registrarse" → `/cuenta`, los 3 pasos y la nota "Participar + compartir = sumar." con "SIN DESCUENTOS ACTIVOS TODAVÍA", visibles sin desplegable. Sin demo. Sin eyebrow (el CSS del diseño lo oculta) |
| 7 | `#por-que-viajar` | `WhyUsSection` | F2 | `<details>` "Ver más" y "Ver detalle" | Iconos SVG → `lucide-react`. Sin eyebrow. "Hablemos de tu próxima carrera" → `/contacto` |
| 8 | `#blog` | `BlogSection` + `TipList` (client) | F2 | `<details>` y filtro de tips con `aria-pressed` | Referentes publicados con nombre (Daniela Zarfati, Karla Medina) y los avisos del diseño ("PARTICIPACIÓN POR CONFIRMAR", "FOTO ILUSTRATIVA · NO ES …") |
| 8b | `#destacados` | `FeaturedTripsSection` + `TripCard` | Enmienda; **condicionada** a la Pregunta abierta 1 de `sponsors-portal.md` y a la enmienda de su F7 | — | "Eventos destacados": hasta 6 viajes publicados con `featured`, leídos de Neon dentro de `<Suspense fallback={null}>`. Sin destacados o con error de la base, la sección no aparece. No existe en el diseño. Si no se confirma, no se añade y `/` sigue estática |
| 9 | `#destinos` | `DestinationsSection` | F2 | — | Tarjetas como enlaces: Santiago → página del viaje; Río y Roma → `/contacto?destino=<id>` (desde PR #24: `/viajes/maraton-rio-2027` y `/viajes/maraton-roma-2027`, ver Requisito 2) |
| 10 | `#preguntas` | `FaqSection` | F2 | `<details>` | 9 preguntas literales |
| 11 | `aside.maz-support` | dentro de `SiteFooter` | F1 | — | Se integra como franja superior del pie en todas las páginas. Sin "Conoce al operador" |
| 12 | `footer#pie` | `SiteFooter` | F1; F3 añade "Tu comunidad" | — | Marca, "Corre. Viaja. Conecta.", Facebook e Instagram, "Información del proveedor" (dl literal, con "Pendientes de completar"), "Atención al consumidor" (Libro de Reclamaciones como texto con "Pendiente de habilitación") y pie inferior literal. F3: "Tu comunidad" → "Ingresar / Registrarse" → `/cuenta`. Sin enlaces legales ni botón de cookies |
| 13 | `.mobile-cta` | `MobileCta` | F1 | CSS `fixed` < `sm` | → `/contacto?destino=santiago-2027` |
| — | `/contacto` | `ContactSection` + `ContactForm` (client) | F1 | Preparar, copiar, WhatsApp | Sin "Ver privacidad"; queda "La consulta no se envía desde esta demostración." |
| — | `/viajes/<slug>` (antes solo `/viajes/maraton-santiago-2027`) | `TripDetail` | F2; F4 lee del catálogo; **`landing-race-pages.md` F2 la sustituye** | — | F2/F4 (histórico): página compuesta con contenido del diseño (+ `TripFacts`), y desde F4 título, resumen, fecha, precio y cupos del catálogo. Desde `landing-race-pages.md` F2: plantilla única minimalista para todo viaje publicado, alimentada solo por el catálogo, sin `TripFacts` ni `TRIPS`. Pendiente de la enmienda de `sponsors-portal.md` F7: `SponsorCredit` ("Presentado por <marca>") dentro de esa plantilla si el viaje tiene marca |
| — | `/patrocinadores/<slug>` | `SponsorShowcase` + `TripCard` | Enmienda; pendiente de la enmienda de `sponsors-portal.md` F7 | — | Logo, nombre (`h1`), descripción, "Visitar sitio web" y cuadrícula de eventos publicados de la marca; 404 si no tiene ninguno |
| — | `/cuenta` | `AccountSection` (server, landing) + `RunnerAccount` (client, `modules/accounts` F4) | F3 | Ingresar, registrarse, verificar, recuperar contraseña, cerrar sesión | Columna de `cuenta.html` con sus textos; sin los avisos "Acceso próximamente" / "Servicio de cuentas pendiente" (ya está conectado); sin pestañas: el cambio entre ingreso y alta lo hace el panel de `accounts`. Con la enmienda, con sesión: "Ver mis carreras" y "Mi perfil" (los pone `RunnerAccount`) y nota sin "no hay perfiles persistentes" |

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
- [ ] (F1) Dado `/contacto?destino=rio`, cuando cargo la página, entonces el selector muestra "Río de Janeiro · Quiero novedades". Con `?destino=xyz` o sin parámetro, muestra la opción de Santiago 2027.
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
Los criterios de F2 sobre `/viajes/*` describen lo implementado entonces; F4 y después `landing-race-pages.md` F2 los sustituyen (los vigentes para la página del viaje son los de `landing-race-pages.md`).
- [ ] (F2) Dado `/`, cuando lo recorro, entonces veo en orden: carrusel, datos del viaje, historia, paquete, por qué viajar, blog, destinos, preguntas y pie, con los textos del diseño. La cabecera añade "Próxima maratón" (`/#paquete`) y "Blog" (`/#blog`), y la lámina 2 del carrusel enlaza a `#paquete`. El título de la sección destino no queda tapado por la cabecera.
- [ ] (F2) Dado `/viajes/maraton-santiago-2027`, cuando lo abro, entonces veo:
  - `h1` "Maratón de Santiago 42K 2027";
  - los datos del viaje (fecha, origen, precio, cupos) y los destacados;
  - precios y condiciones (contado, cuotas, reserva, acompañante, nota de pagos);
  - "Sí está incluido" (9 elementos), "No está incluido" y "Detalles que falta confirmar";
  - "Ver anuncio oficial ↗" y el CTA "Quiero correr Santiago ↗" → `/contacto?destino=santiago-2027`;
  - `<title>` "Maratón de Santiago 42K 2027 | Carreras Viajeras".
- [ ] (F2) Dado `/viajes/otro-slug`, cuando lo abro, entonces responde 404. Dado `npm run build`, entonces la ruta `/viajes/maraton-santiago-2027` aparece como prerenderizada (SSG).
- [ ] (F2) Dada la sección `#paquete`, cuando pulso "Quiero correr Santiago" o "Ver más: paquete completo", entonces navego a `/viajes/maraton-santiago-2027`. La tarjeta de destino Santiago y "Descubre el viaje" llevan a la misma página, y la tarjeta de Río a `/contacto?destino=rio`.
- [ ] (F2) Dada la sección `#experiencia`, cuando la veo, entonces la imagen tiene el `alt` "Runners compartiendo después de correr en Santiago, imagen ilustrativa generada con IA".
- [ ] (F2) Dados los referentes, cuando abro "Conocer referentes", entonces veo los nombres Daniela Zarfati y Karla Medina con "PARTICIPACIÓN POR CONFIRMAR", "FOTO ILUSTRATIVA · NO ES …" y la nota de imágenes ilustrativas.
- [ ] (F2) Dados los tips, cuando pulso "Viajar", entonces solo se ve la tarjeta `viajar` y ese botón tiene `aria-pressed="true"` (los demás `false`). "Todas" muestra las 6.
- [ ] (F2) Dada la FAQ, cuando abro una pregunta con teclado, entonces se despliega la respuesta. Hay 9 preguntas.
- [ ] (F2) Todos los enlaces externos abren en otra pestaña con `rel="noopener noreferrer"`. No hay enlaces a anclas inexistentes: `#comunidad` todavía no se enlaza.
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 3 — Cuenta del runner y comunidad
- [ ] (F3) Dado `/`, cuando lo recorro, entonces la sección `#comunidad` aparece entre paquete y por qué viajar. La cabecera añade "Comunidad" (`/#comunidad`) y "Ingresar / Registrarse" (`/cuenta`), la lámina 3 enlaza a `#comunidad` y el pie muestra "Tu comunidad" → `/cuenta`. No hay demo de experiencias ni enlaces a `/crm`.
- [ ] (F3) Dado `/cuenta` sin sesión, cuando lo abro, entonces veo la cabecera y el pie de la landing y la columna de `cuenta.html`. Los textos son "TU PASAPORTE A MÁS HISTORIAS", "El próximo viaje empieza contigo." (texto display, no encabezado), "Participa. Comparte. Conecta.", "★ ESTRELLAS POR CORRER Y COMPARTIR" y la nota "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay perfiles persistentes ni descuentos activos." (desde `accounts-runner-profiles.md` F2-T5: "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay descuentos activos."). Sin "Acceso próximamente". Junto a la columna aparece el panel de runner de `accounts`: "Iniciar sesión" con el enlace "Registrarse". La página tiene un único `h1`, el del panel.
- [ ] (F3) Dado un alta en `/cuenta`, cuando verifico el código, entonces me quedo en `/cuenta` con sesión y veo "Qué bueno verte de nuevo." y mi correo (así se implementó F3). **Desde `runner-portal.md` F6:** llego a `/mis-carreras`; al volver a `/cuenta` veo "Qué bueno verte de nuevo.", mi correo y "Ver mis carreras" (y "Mi perfil" desde `accounts-runner-profiles.md` F2-T5). "Cerrar sesión" me deja en `/cuenta` sin sesión.
- [ ] (F3) Dada una sesión de runner sin roles, cuando abro `/crm`, entonces veo "Tu cuenta no tiene acceso al CRM. Pide una invitación a un administrador.". `GET /api/crm/me` responde 403 y no se crean filas en `profiles` ni `staff_*` (comprobación manual en producción, con autorización del usuario; la misma de `accounts-auth-ui.md` F4).
- [ ] (F3) Dado `/crm/acceso`, cuando lo uso, entonces se comporta igual que antes de esta fase.
- [ ] (F3) Dado el HTML de `/cuenta`, entonces el `<title>` es "Ingresar o registrarse | Carreras Viajeras" (segmento hijo: aplica el template del layout) y `robots` es `noindex, nofollow`.
- [ ] (F3) Dado el diff de la fase, entonces solo toca los archivos del plan de F3. No modifica `modules/accounts/*`, `lib/auth/*`, `lib/db*`, `app/crm/*`, `app/api/*`, `drizzle/`, `package.json`, ni añade variables `NEXT_PUBLIC_*`. La landing importa de `@/modules/accounts` solo `RunnerAccount`.
- [ ] (F3) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar), entonces el tamaño gzip del Worker se registra y es < 3 MiB.
- [ ] (F3) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 4 — La página del viaje lee del catálogo en Neon
Verificación manual sobre una rama de Neon con la precondición de F4 cumplida (migración `0001` aplicada y el viaje creado y publicado con los datos de la precondición), usando `npm run dev` con `.env.local` apuntando a esa rama. Desde F4 deja de aplicar la parte "prerenderizada (SSG)" del criterio F2 sobre `/viajes/otro-slug`. **Enmienda:** estos criterios describen lo implementado en F4 y ya no se reverifican en `/viajes/[slug]`: `landing-race-pages.md` F2 sustituyó la combinación con contenido fijo (portada `santiago.jpg`, "LA CARRERA", "AL CONTADO", "100 cupos definidos", 9 incluidos, CTA a `/contacto`) por su plantilla única, y sus criterios F2 son los vigentes. Siguen vigentes aquí el 404 de un viaje no publicado, la propagación de errores, la ausencia de `error.tsx`/`loading.tsx` y que `/` no lee el catálogo.
- [ ] (F4) Dado el viaje publicado, cuando abro `/viajes/maraton-santiago-2027`, entonces:
  - el `h1` y el `<title>` ("<título> | Carreras Viajeras") usan el `title` del catálogo, y la `meta description` es su `summary`;
  - "LA CARRERA" muestra `formatTripDate(raceDate)` ("16 de mayo de 2027");
  - "EL PAQUETE" y "AL CONTADO" muestran `formatTripPrice(priceUsd)` ("US$ 1,499");
  - "EL PRIMER EQUIPO" muestra "100 cupos definidos";
  - el resto es igual que en F2: portada con `santiago.jpg` y su `alt`, rótulo, ruta, destacados, cuotas, reserva, acompañante, nota de pagos, 9 incluidos, no incluido, pendientes, "Ver anuncio oficial ↗" y el CTA → `/contacto?destino=santiago-2027`.
- [ ] (F4) Dado el viaje publicado, cuando cambio en `/crm/viajes/<id>` el precio (p. ej. 1599) o los cupos (p. ej. 80) y recargo la página del viaje, entonces muestra el valor nuevo sin redesplegar. `/` no cambia: sigue mostrando la copia fija de `TRIPS`.
- [ ] (F4) Dado el viaje despublicado (o archivado) en el CRM, cuando pido `/viajes/maraton-santiago-2027` (`curl -sI`), entonces responde con estado `404` y la página 404. Al publicarlo de nuevo, responde `200`. Dado `/viajes/otro-slug`, entonces responde `404` sin consultar Neon (unit test). **Desde `landing-race-pages.md` F2:** un slug canónico sin contenido fijo sí consulta el catálogo; responde `404` si no está publicado y, si lo está, muestra la plantilla única (un slug no canónico sigue devolviendo `null` sin consultar).
- [ ] (F4) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores, `/viajes/[slug]` aparece como dinámica (`ƒ`) y `/`, `/contacto` y `/cuenta` siguen estáticas (`○`). **Estado real (enmienda):** `/contacto` es dinámica (`ƒ`) en `main` porque lee `searchParams`, como registra `landing-race-pages.md` (Requisito 7); `/` y `/cuenta` siguen estáticas (`○`). `/` solo pasaría a `ƒ` si se confirman los destacados (Pregunta abierta 1 de `sponsors-portal.md`).
- [ ] (F4) Dado un error de la base al leer el catálogo, entonces `getCatalogTrip` lo propaga sin capturarlo (unit test) y la página muestra el error por defecto de Next, sin el mensaje original en producción. No existen `app/viajes/**/error.tsx` ni `app/viajes/**/loading.tsx`.
- [ ] (F4) Dado `README.md`, entonces su sección "Lectura pública para la landing" describe lo implementado en F4 (combinación, 404, `cache`, sin `error.tsx`) y la precondición operativa, sin decir que la landing está en otra rama.
- [ ] (F4) Dado el diff de la fase, entonces solo toca los archivos del plan de F4. No modifica `modules/trips/**`, `lib/auth/*`, `lib/db*`, `app/crm/*`, `app/api/*`, `drizzle/`, `package.json` ni otras specs, y no añade dependencias. La landing importa de `@/modules/trips` solo `getPublishedTripBySlug`, `formatTripDate`, `formatTripPrice` y `type PublicTrip` (desde `landing-race-pages.md` F2 también `formatTripDateRange`; con la enmienda pendiente de `sponsors-portal.md` F7 añadiría `listPublishedTrips` y `type PublicTripSponsor`, y de `@/modules/sponsors` `getPublicSponsorBySlug` y `type PublicSponsor`).
- [ ] (F4) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar, en Linux/WSL), entonces el tamaño gzip del Worker se registra en el resumen de la fase frente a la última referencia registrada (1411 KiB, `crm-leads-pipeline.md`). Debe ser < 2 MiB; si lo supera, se detiene y se consulta al usuario (límite Free: 3 MiB).
- [ ] (F4) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Enmienda 2026-10-25 (sin fase propia: cada criterio lo verifica el reviewer de la spec y la fase indicadas)
- [ ] (`runner-portal.md` F5-T1) Dado `@/modules/landing`, entonces exporta `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER` sin cambiar su comportamiento; `inquiry.test.ts` pasa sin cambios.
- [ ] (`runner-portal.md` F6) Dado un ingreso o una verificación con sesión en `/cuenta`, entonces llego a `/mis-carreras`, también con una cuenta de staff. "Cerrar sesión" en `/cuenta` me deja en `/cuenta` sin sesión, y `/cuenta` sigue estática (`○`).
- [ ] (`runner-portal.md` F6-T2 y `accounts-runner-profiles.md` F2-T5) Dado `/cuenta` con sesión, entonces veo "Qué bueno verte de nuevo.", mi correo, "Ver mis carreras" → `/mis-carreras`, "Mi perfil" → `/cuenta/perfil` y "Cerrar sesión". `/cuenta` no redirige.
- [ ] (`accounts-runner-profiles.md` F2-T5) Dado `/cuenta`, entonces la nota de `AccountSection` dice "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay descuentos activos.".
- [ ] (`landing-race-pages.md` F2; implementado en PR #20) Dado `/viajes/<slug>` de cualquier viaje publicado, un viaje mínimo, Santiago con sus datos completos y un slug no publicado, entonces se cumplen los criterios F2 de `landing-race-pages.md`; `/` se ve igual que antes y sigue estática (`○`).
- [ ] (`sponsors-portal.md` F7, **pendiente de su enmienda**) Dado un viaje publicado con marca, cuando abro `/viajes/<slug>`, entonces veo la plantilla de `landing-race-pages.md` con "Presentado por <marca>" (logo si existe y nombre) enlazado a `/patrocinadores/<slug>`, y el mismo CTA "Consultar por WhatsApp" al número del equipo. Dado un viaje sin marca (p. ej. `maraton-santiago-2027`), entonces se ve igual que en `landing-race-pages.md` F2, sin "Presentado por". Dado `/patrocinadores/<slug>`, entonces se cumplen los criterios F7 de `sponsors-portal.md` (una vez enmendada).
- [ ] (`sponsors-portal.md` F7, **solo si se confirma su Pregunta abierta 1**) Dado al menos un viaje destacado, cuando abro `/`, entonces veo "Eventos destacados" antes de "Más ciudades" y `/` es dinámica (`ƒ`). Si no se confirma, `/` sigue estática y sin esa sección.

## Diseño técnico

### Rutas (`app/`)
- **`app/layout.tsx`** (F1, modificar):
  - `lang="es"`;
  - fuentes `DM_Sans({ subsets: ["latin"], variable: "--font-sans" })` y `Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" })`, en lugar de Geist;
  - `metadata = { title: { default: "Carreras Viajeras", template: "%s | Carreras Viajeras" }, description: <description de index.html>, robots: { index: false, follow: false } }`;
  - `export const viewport: Viewport = { themeColor: "#0144ae" }`.
- **`app/page.tsx`** (F1, reescribir; ampliado en F2 y F3):
  - `metadata.title = { absolute: "Tu próxima meta es la maratón de Santiago. | Carreras Viajeras" }`. En Next 16, el `title.template` del layout no se aplica a un `page.js` del mismo segmento (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, líneas 285–288). `/contacto`, `/viajes/[slug]` y `/cuenta` son segmentos hijos, así que en ellas el template sí aplica;
  - compone `<SiteHeader />`, `<main>` con las secciones de la fase, `<SiteFooter />` y `<MobileCta />`;
  - (enmienda; **solo si se confirma la Pregunta abierta 1 de `sponsors-portal.md`**, implementado en su F7 enmendada) inserta `<Suspense fallback={null}><FeaturedTripsSection /></Suspense>` antes de `<DestinationsSection />`. `/` pasa a renderizarse por petición (`ƒ`); el resto de la portada se envía sin esperar a Neon. Hasta entonces, `app/page.tsx` no cambia y `/` sigue estática (`landing-race-pages.md`, "No incluye").
- **`app/contacto/page.tsx`** (F1, nuevo):
  - `metadata = { title: "Contacto", description: "Consulta por tu próximo viaje con Carreras Viajeras." }`;
  - `async function ContactPage({ searchParams }: PageProps<"/contacto">)` hace `const { destino } = await searchParams;` y renderiza `<SiteHeader /><main><ContactSection destination={destino} /></main><SiteFooter />`.
- **`app/viajes/[slug]/page.tsx`** (F2, nuevo; **F4 lo reescribe**, ver "Fase 4: página del viaje desde el catálogo", y **`landing-race-pages.md` F2 lo reescribe de nuevo**, ver el punto de la enmienda más abajo), según la API de Next 16 en `node_modules/next/dist/docs/` (`params` es una Promise; `generateStaticParams`, `dynamicParams` y `generateMetadata`):
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
- **`app/viajes/[slug]/page.tsx`** (enmienda; **implementado en `landing-race-pages.md` F2-T4**): `getCatalogTrip(slug)` → `TripLanding | null` (`null` → `notFound()`); `generateMetadata` con `title`, `summary` y `openGraph.images` si hay `imageUrl`; `<TripDetail trip={trip} />`. Sigue sin `generateStaticParams`, `loading.tsx` ni `error.tsx`. La enmienda pendiente de `sponsors-portal.md` F7 **no** cambia esta ruta: la marca viaja dentro de `TripLanding`.
- **`app/patrocinadores/[slug]/page.tsx`** (enmienda; nuevo, **pendiente de la enmienda de `sponsors-portal.md` F7**, su F7-T4): `getSponsorShowcase(slug)` (`null` → `notFound()`); `generateMetadata` con el nombre y la descripción de la marca (segmento hijo: aplica el template del layout); `<SiteHeader /><main><SponsorShowcase sponsor trips /></main><SiteFooter />`. Por petición, sin `generateStaticParams`. Hereda `robots` del layout (Requisito 3).
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
| `SiteHeader` | nuevo | F1 (mod. F2, F3) | Server. `<header className="sticky top-0 z-40 bg-background shadow-sm">`. Marca (`ArrowUpRight` + "CARRERAS / VIAJERAS") → `/`. `<nav aria-label="Principal">` oculto < `md`, con array local de enlaces. CTA "Quiero correr" → `/contacto`; F3 añade "Ingresar / Registrarse" → `/cuenta` (variante outline). Estático: no lee la sesión. La marca es `SiteBrand` (existente, exportado por `SiteHeader.tsx` y usado también por `SiteFooter`); la enmienda lo exporta desde `index.ts` (`runner-portal.md` F5-T1) para la cabecera de `/mis-carreras`, sin cambiar su marcado |
| `SiteFooter` | nuevo | F1 (mod. F3) | Server. Franja MAZ: logo `maz-producciones.webp`, "Una unidad de MAZ PRODUCCIONES.", razón social, RUC, métricas "+25 Años", "+70", "+500" y "+15 Maratones internacionales" (4 tarjetas con icono, acentos alternos verde/azul) con "Datos de trayectoria 2025 proporcionados por MAZ Producciones.". Después, contenido del inventario. Constante local `SOCIAL_LINKS` con Facebook e Instagram (URLs exactas; glifos del diseño `aria-hidden` + nombre). `max-sm:pb-28` para dejar sitio a la barra móvil |
| `HeroCarousel` | nuevo | F1 (mod. F2, F3) | Detalle en la subsección siguiente |
| `MobileCta` | nuevo | F1 | Server. `<Link className="fixed inset-x-0 bottom-0 z-30 sm:hidden ...">` con `pb-[calc(1rem+env(safe-area-inset-bottom))]`. Texto: "US$1,499 al contado · Quiero información ↗" |
| `ContactSection` | nuevo | F1 | Server. Props `{ destination?: string \| string[] }`. Columna de texto (eyebrow, `h1`, párrafo, nota "VISTA DE DEMOSTRACIÓN") + `<ContactForm defaultDestination={parseDestinationId(destination)} />` |
| `ContactForm` | nuevo | F1 | Detalle en la subsección siguiente |
| `TripFacts` | nuevo | F2 | Server. Props `{ trip: Trip }` (desde F4, `TripContent`). Los 4 datos de `.trip-strip`. Lo usaban `/` y `TripDetail`; desde `landing-race-pages.md` F2, solo `/` |
| `PackageSection` | nuevo | F2 | Server. `<section id="paquete" aria-labelledby="package-title">`. Resumen con datos de `TRIPS[0]`; CTA principal y "Ver más: paquete completo" → `/viajes/${trip.slug}` |
| `TripDetail` | nuevo | F2 (reescrito en `landing-race-pages.md` F2-T3) | F2/F4 (histórico): props `{ trip: Trip }`, portada con `h1` `trip.name`, `<TripFacts />`, destacados, "Precios y condiciones", incluidos, no incluidos, pendientes y CTA → `/contacto?destino=…`. Desde `landing-race-pages.md` F2: props `{ trip: TripLanding }`, plantilla minimalista de una columna (Requisito 5 de esa spec), sin `TripFacts`, con CTA "Consultar por WhatsApp". Pendiente de la enmienda de `sponsors-portal.md` F7: `<SponsorCredit>` en la cabecera si `trip.sponsor` |
| `StorySection` | nuevo | F2 | Server. `<figure>` con `story-runners.webp` y `figcaption` "CORRE. VIAJA. CONECTA."; CTA → página del viaje |
| `WhyUsSection` | nuevo | F2 | Server. 3 puntos clave + `<details>` con 6 tarjetas (array local con iconos lucide `Ticket`, `Building2`, `Users`, `Utensils`, `Heart`, `ShieldCheck`) |
| `BlogSection` | nuevo | F2 | Server. Intro + columnas "Referentes" (`<details>` con 2 tarjetas y nota) y "Tips" (`<details>` con `<TipList tips={TIPS} />` y nota "Información general, revisada el 17/10/2026…"). `TIPS`: array local serializable `{ category, image, eyebrow, title, summary, body, source?: { label, href } }`; los saltos de título van con `\n` + `whitespace-pre-line` |
| `TipList` | nuevo | F2 | `"use client"`. Props `{ tips }`. Estado `filter`; 5 botones con `aria-pressed` en un `role="group" aria-label="Filtrar consejos"`; las tarjetas que no coinciden llevan `hidden` |
| `DestinationsSection` | nuevo | F2 | Server. 3 `Link` (array local); Santiago, con estilo activo, → `/viajes/maraton-santiago-2027` |
| `FaqSection` | nuevo | F2 | Server. `<section id="preguntas">`; 9 `<details>` (array local) |
| `CommunitySection` | nuevo | F3 | Server. `<section id="comunidad" aria-labelledby="community-title">`: imagen `running-team.webp`, título, texto, CTA "Ingresar / Registrarse" → `/cuenta`, 3 pasos y nota de recompensas. Estático, sin persistencia |
| `AccountSection` | nuevo | F3 | Server. Rejilla de dos columnas de `cuenta.html`: (1) imagen `running-team.webp` (alt "Corredores juntos, imagen ilustrativa") con eyebrow "TU PASAPORTE A MÁS HISTORIAS", "El próximo viaje empieza contigo." como párrafo con estilo display (`font-heading`, no encabezado), "Participa. Comparte. Conecta." y "★ ESTRELLAS POR CORRER Y COMPARTIR"; (2) eyebrow "COMUNIDAD CARRERAS VIAJERAS", `<RunnerAccount />` y la nota de demostración. No pasa props a `RunnerAccount`. Enmienda (`accounts-runner-profiles.md` F2-T5): la nota pasa a "La comunidad, las publicaciones y las recompensas siguen en demostración; no hay descuentos activos." |
| `SponsorCredit` | nuevo (enmienda; pendiente de la enmienda de `sponsors-portal.md` F7) | — | Server. "Presentado por", logo y nombre de la marca → `/patrocinadores/<slug>`. Lo usa `TripDetail` (plantilla de `landing-race-pages.md`) en su cabecera, con sus tokens y sin romper el orden de bloques de esa spec |
| `TripCard` | nuevo (enmienda; pendiente de la enmienda de `sponsors-portal.md` F7) | — | Server. Tarjeta de viaje publicado con el estilo de `DestinationsSection`; la usan `SponsorShowcase` y, si se confirma, `FeaturedTripsSection` (uso interno del módulo) |
| `FeaturedTripsSection` | nuevo (enmienda; **condicionado** a la Pregunta abierta 1 de `sponsors-portal.md`) | — | async Server. "Eventos destacados" (`#destacados`), hasta 6 `TripCard`; sin destacados o con error de la base → `null` |
| `SponsorShowcase` | nuevo (enmienda; pendiente de la enmienda de `sponsors-portal.md` F7) | — | Server. Cabecera de la marca y cuadrícula de `TripCard` de `/patrocinadores/<slug>` |

Todos son de un único dominio (landing) y van en `modules/landing/components/`. No existe nada equivalente en el proyecto ni en shadcn más allá de lo indicado. Los componentes de la enmienda los diseña y prueba `sponsors-portal.md`; esta tabla solo los registra. Ya no existe ni se prevé una plantilla aparte para viajes sin contenido fijo (`CatalogTripDetail`): `TripDetail` es la única plantilla de `/viajes/<slug>` (`landing-race-pages.md`).

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
  export const DESTINATION_IDS = ["santiago-2027", "rio", "roma"] as const;
  export type DestinationId = (typeof DESTINATION_IDS)[number];
  export const WHATSAPP_NUMBER = "51938127170"; // dato público del canal comercial (+51 938 127 170)
  export function parseDestinationId(value: unknown): DestinationId; // ?destino= → id válido o "santiago-2027"
  export function buildInquiryMessage(input: { name: string; email: string; phone: string; destination: DestinationId }): string;
  export function buildWhatsAppUrl(number: string, text: string): string | null;
  ```
  Plantilla literal de `app.js`. Nombres: `santiago-2027` → "Maratón de Santiago 42K 2027", `rio` → "Río de Janeiro", `roma` → "Roma".
  ```
  Hola, soy {name}. Me interesa {nombre}{cláusula}. Quisiera conocer disponibilidad, inclusiones y condiciones finales.
  Correo: {email}
  WhatsApp: {phone}
  Entiendo que esta consulta no constituye reserva ni pago.
  ```
  - `{cláusula}`: " y la preventa por corredor: US$1,499 al contado o US$1,799 en cuotas, con reserva anunciada de US$300" para Santiago; " cuando haya una propuesta confirmada" para el resto.
  - `buildWhatsAppUrl`: elimina los caracteres que no son dígitos; si el resultado no cumple `^\d{10,15}$`, devuelve `null`; si cumple, `https://wa.me/${digits}?text=${encodeURIComponent(text)}`.
  - Enmienda: `landing-race-pages.md` F2-T2 añadió `buildTripInquiryMessage({ title, raceDate, location })`, que `TripDetail` usa con `buildWhatsAppUrl(WHATSAPP_NUMBER, …)` dentro del módulo. `buildWhatsAppUrl` y `WHATSAPP_NUMBER` pasan a la API pública del módulo (`runner-portal.md` F5-T1) para el contacto de `/mis-carreras`. Sin cambios de comportamiento.
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
  - **Estado actual (F4 y `landing-race-pages.md` F2-T1):** `TripContent` es la copia fija de `/` (sin `name`, `description`, `destinationId`, `included`, `excluded`, `pendingDetails` ni `prices.companion*`/`paymentNote`); no existen `Trip` ni `getTrip`. La usan `TripFacts`, `PackageSection` y `DestinationsSection`, nunca la página del viaje.
- Sin hooks, services, stores, schemas zod, TanStack Query, axios ni zustand en el módulo landing.

### Cuenta del runner: qué se usa de `modules/accounts` (F3)
- **Único import:** `RunnerAccount` desde `@/modules/accounts`. Lo crea `accounts-auth-ui.md` F4: `AccessPanel audience="runner"` con alta, verificación por código, `EMAIL_NOT_VERIFIED`, recuperación de contraseña y mensajes sin enumeración, más `SignOutButton redirectTo="/cuenta"` y los estados de sesión con `authClient.useSession()`.
- **La landing no toca** `AccessPanel`, los formularios, `authClient`, `getCrmAccess()`, `CrmShell`, `NoCrmAccess`, `lib/auth/*`, las tablas ni las páginas del CRM.
- **Encabezados:** el único `h1` de `/cuenta` lo aporta `RunnerAccount`: el título del formulario activo ("Iniciar sesión", "Crea tu cuenta"…) o, con sesión, "Qué bueno verte de nuevo.". Por eso `AccountSection` muestra "El próximo viaje empieza contigo." como texto display, no como encabezado.
- **Enmienda:** el import sigue siendo solo `RunnerAccount`. El destino `/mis-carreras` y los enlaces "Ver mis carreras" y "Mi perfil" viven dentro de `RunnerAccount`/`AccessPanel` (`accounts-auth-ui.md`, Requisito 12) y los implementan `runner-portal.md` F6 y `accounts-runner-profiles.md` F2-T5; `AccountSection` no cambia por ellos.

### Contrato de API
No se añaden APIs.
- F1 y F2 no hacen peticiones.
- F3 usa los endpoints existentes de Neon Auth a través del proxy same-origin, con los métodos de `accounts-auth-ui.md` (Requisitos 1) más `useSession()` del mismo cliente (`ReactAuthClient` de better-auth, exportado por `createAuthClient()` de `@neondatabase/auth/next`).
- F4 no añade API HTTP: llama en el servidor a `getPublishedTripBySlug(slug): Promise<PublicTrip | null>` de `@/modules/trips` (contrato de `trips-catalog.md`, sin `GET /api/trips`). Contrato interno nuevo: `getCatalogTrip(slug: string): Promise<Trip | null>` (ver "Fase 4").
- Enmienda (`landing-race-pages.md` F2-T1, sin API HTTP; implementado): `getCatalogTrip(slug): Promise<TripLanding | null>`, envuelta en `cache`; `TripLanding` es la vista formateada de `PublicTrip` (contrato en `landing-race-pages.md`, Diseño técnico F2) y no se exporta.
- Enmienda pendiente (`sponsors-portal.md` F7 enmendada, sin API HTTP):
  ```ts
  // modules/landing/utils/catalogTrip.ts — campo añadido, copiado de PublicTrip.sponsor (sponsors-portal F6)
  export type TripLanding = { /* …campos de landing-race-pages… */ sponsor: PublicTripSponsor | null };
  // modules/landing/utils/sponsorShowcase.ts
  export const getSponsorShowcase: (slug: string) => Promise<{ sponsor: PublicSponsor; trips: PublicTrip[] } | null>;
  ```
  Consumen `listPublishedTrips(filter)` y `type PublicTripSponsor` de `@/modules/trips` y `getPublicSponsorBySlug`/`type PublicSponsor` de `@/modules/sponsors`. No hay `CatalogTripView` ni vistas `designed`/`catalog`.

### Base para el trabajo futuro (sin implementarlo)
- **Viajes:** `TRIPS` y `getTrip(slug)` hacen de contrato de lectura. Cuando exista el catálogo en Neon, `getTrip` y `generateStaticParams` leerán de `trips-catalog` con el mismo `slug` y la misma ruta `/viajes/[slug]`. (Hecho: F4 leyó el catálogo en la página del viaje y `landing-race-pages.md` la convirtió en una plantilla única para cualquier viaje publicado, sin `TRIPS` ni `getTrip`. `/` sigue con contenido fijo; los destacados de `/` dependen de la Pregunta abierta 1 de `sponsors-portal.md`.)
- **Runner:** su identidad es el `user.id` de Neon Auth. Con la enmienda ya existen, cada uno en su spec:
  - el perfil del runner, en la tabla propia `runner_profiles` (no en `profiles`, que es solo de cuentas con rol), con clave `user_id` (`accounts-runner-profiles.md`); su guarda de página es `getRunnerProfilePage` (`/cuenta/perfil`);
  - la guarda de runner de `/mis-carreras` (sesión con correo verificado y lecturas filtradas por `runner_user_id`), `getRunnerPortal` (`runner-portal.md` F5).

  Comunidad y experiencias colgarán de esa misma identidad, con su propia guarda en el servidor.
- **Leads:** `buildInquiryMessage` y los campos del formulario son la base del payload de la futura spec de leads.

### Fase 4: página del viaje desde el catálogo
**Enmienda:** esta sección describe cómo se implementó F4. `landing-race-pages.md` F2 sustituyó la combinación (Decisiones 2 y 3, el filtro de `TRIPS` de la Decisión 4, `TripContent`/`Trip`/`getTrip`, `catalogTrip.ts` y la ruta). Siguen vigentes la Decisión 1 (`/` estática), los puntos de errores de la Decisión 4, la 5 (`cache`) y la 6 (render por petición), que `landing-race-pages.md` conserva.

Contrato consumido (`trips-catalog.md`, "Contrato de lectura pública" e "Integración con la landing"), sin modificar `modules/trips`: `getPublishedTripBySlug(slug): Promise<PublicTrip | null>` (llama a `connection()`; slug inválido, inexistente, en borrador o archivado → `null`; errores de la base se propagan), `formatTripDate`, `formatTripPrice` y `type PublicTrip`, importados solo desde `@/modules/trips` y solo en código de servidor.

#### Decisiones
1. **Alcance: solo `/viajes/[slug]`.** `/` sigue estática con la copia fija de `TRIPS` (`TripFacts`, `PackageSection`, `DestinationsSection`), igual que `MobileCta`, `HeroCarousel` y la cláusula de `buildInquiryMessage`, que ya tienen "US$1,499" como literal.
   - Leer el catálogo en `/` la haría dinámica: una consulta a Neon por cada visita a la portada, la página más visitada, con CPU del Worker Free y sin caché posible (`trips-catalog.md` excluye ISR/KV). Además obligaría a decidir qué muestra la portada si el viaje no está publicado.
   - Coste aceptado: si el equipo cambia precio, fecha o cupos en el CRM, `/` no cambia hasta editar `TRIPS` (Pregunta abierta 4).
   - **Enmienda:** `landing-race-pages.md` mantiene esta decisión. `sponsors-portal.md` (Decisión 17) propone que `/` pase a dinámica solo por "Eventos destacados" (una consulta pequeña, en `<Suspense>`, que no tumba la portada si falla), pero eso sigue abierto en su Pregunta abierta 1. Hasta que el usuario lo confirme, `/` sigue estática. En ambos casos, las secciones con copia fija de `TRIPS` no cambian ni leen el catálogo.
2. **Combinación: el contenido fijo manda en la estructura y el catálogo sustituye solo los campos que tienen hueco en el diseño.** `TRIPS` pasa a tipar `TripContent` (contenido fijo) y `Trip` es la vista combinada que pinta `TripDetail`:

   | Campo de `TRIPS` | Desde F4 | Motivo |
   |---|---|---|
   | `name` | **desaparece** → `title` | Solo lo usaba la página del viaje (`h1`, `<title>`) |
   | `description` | **desaparece** → `summary` | Solo era la meta description de la página del viaje |
   | `raceDate` | se queda (copia para `/`); en la página → `formatTripDate(raceDate)` | `/` es estática |
   | `capacity` | se queda (copia para `/`); en la página → `` `${capacity} cupos definidos` ``, o "Cupos por confirmar" si es `null` | Mismo texto del diseño con el número del catálogo |
   | `prices.cash` | se queda (copia para `/`); en la página → `formatTripPrice(priceUsd)` | Es el precio "desde" del paquete corredor |
   | `slug` | se queda | Clave para unir con el catálogo; mismo slug `maraton-santiago-2027` |
   | `destinationId`, `image`, `imageAlt`, `coverLabel`, `officialUrl`, `route`, `routeNote`, `capacityNote`, `highlights`, `prices.installmentsTotal`/`reservation`/`companion`/`companionNote`/`paymentNote`, `included`, `excluded`, `pendingDetails`, `disclaimer` | se quedan | No están en `PublicTrip` o no tienen equivalente fiel (ver abajo) |

   Campos de `PublicTrip` que **no** se muestran en F4 (Pregunta abierta 5):
   - `imageUrl`: la portada sigue con `/images/santiago.jpg`, porque su `alt` del diseño solo describe esa imagen y el catálogo no tiene texto alternativo. Además, así no se depende de un host externo.
   - `includes`: la lista del diseño tiene título y texto por elemento; `includes` es `string[]`. Mostrar ambas duplicaría la fuente.
   - `distances`, `city`, `country`, `startDate`/`endDate`: el diseño no tiene hueco. Ya los dice el rótulo fijo ("MARATÓN · 42K", "Lima → Santiago"), y las fechas de viaje siguen en "Detalles que falta confirmar".
3. **Precio:** donde la página muestra el precio al contado ("EL PAQUETE" de `TripFacts` y "AL CONTADO" de `TripDetail`), se usa `formatTripPrice(priceUsd)`, el formato elegido por el usuario para el catálogo ("US$ 1,499"; `null` → "Precio a consultar"). Los importes fijos (cuotas, reserva y acompañante) conservan el literal del diseño ("US$1,799"). La regla es: importe del catálogo → `formatTripPrice`; importe fijo → literal. `/` no cambia.
4. **Errores:**
   - `null` → `notFound()` en `generateMetadata` y en la página, antes de renderizar nada. Sin `loading.tsx` ni otro `<Suspense>` por encima, así que la respuesta lleva estado `404` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`: tras empezar el streaming quedaría en `200`).
   - Un slug sin contenido fijo en `TRIPS` → `null` **sin consultar Neon**. Una URL inventada no gasta consultas, igual que hacía `dynamicParams = false`. **Enmienda (`landing-race-pages.md`, Requisitos 4 y 7):** sustituido por "se consulta siempre el catálogo; un slug no canónico devuelve `null` sin consultar (validación de `getPublishedTripBySlug`), y cualquier viaje publicado usa la plantilla única". Una URL inventada con formato válido cuesta una consulta (coste aceptado en esa spec).
   - Un error de la base se propaga sin `try/catch`. Capturarlo podría tragarse también el aviso interno de `connection()`. Basta la página de error por defecto: Next oculta el mensaje en producción. Un `error.tsx` exigiría un componente de cliente para un caso operativo raro (YAGNI).
5. **Una consulta por petición:** `getCatalogTrip` va envuelta en `cache` de React, en el propio módulo landing. `generateMetadata` y la página comparten el resultado dentro del mismo render; es el patrón de `getCurrentUser` en `lib/auth/guards.ts`.
6. **Render por petición:** se eliminan `generateStaticParams` y `dynamicParams`. Sin `generateStaticParams`, el segmento dinámico se renderiza bajo demanda y `connection()` impide prerenderizar con datos de la base. `npm run build` no necesita `DATABASE_URL`.

#### `modules/landing/utils/trips.ts` (modificar)
```ts
/** Fixed design content. raceDate, capacity and prices.cash are the static copy shown on `/`. */
export type TripContent = {
  slug: string; destinationId: DestinationId;
  image: string; imageAlt: string; coverLabel: string;
  raceDate: string; officialUrl: string; route: string; routeNote: string;
  capacity: string; capacityNote: string;
  highlights: string[];
  prices: { cash: string; installmentsTotal: string; reservation: string; companion: string; companionNote: string; paymentNote: string };
  included: { title: string; text: string }[];
  excluded: string[];
  pendingDetails: string[];
  disclaimer: string;
};
/** What the trip page renders: fixed content with the catalog fields applied. */
export type Trip = TripContent & { name: string; description: string };
export const TRIPS: readonly TripContent[]; // sin name ni description; el resto de valores no cambia
export function getTrip(slug: string): TripContent | undefined;
```

#### `modules/landing/utils/catalogTrip.ts` (nuevo)
```ts
import { cache } from "react";
import { formatTripDate, formatTripPrice, getPublishedTripBySlug } from "@/modules/trips";
import { getTrip, type Trip } from "./trips";

// React cache: generateMetadata and the page share one Neon query per request.
export const getCatalogTrip = cache(async (slug: string): Promise<Trip | null> => {
  const content = getTrip(slug);
  if (!content) return null; // no fixed content → 404 without querying Neon
  const published = await getPublishedTripBySlug(slug);
  if (!published) return null;
  return {
    ...content,
    name: published.title,
    description: published.summary,
    raceDate: formatTripDate(published.raceDate),
    capacity: published.capacity === null ? "Cupos por confirmar" : `${published.capacity} cupos definidos`,
    prices: { ...content.prices, cash: formatTripPrice(published.priceUsd) },
  };
});
```
Así se implementó F4. **Enmienda:** `landing-race-pages.md` F2-T1 la reescribió: llama siempre a `getPublishedTripBySlug(slug)` y devuelve `TripLanding | null` sin consultar `TRIPS`; sigue envuelta en `cache` y propagando los errores de la base. Pendiente de la enmienda de `sponsors-portal.md` F7: `TripLanding` añade `sponsor` (copiado de `PublicTrip.sponsor`), sin más cambios de comportamiento.

No es un `service` del módulo: no habla con una API propia y usa React (`cache`); compone el service público de `trips` con el contenido fijo de la landing. Es transitivamente `server-only` (vía `@/modules/trips`); ningún componente de cliente de la landing importa `@/modules/landing` ni `utils/trips.ts`.

#### Componentes
- `TripFacts` (existente, modificar solo el tipo): props `{ trip: TripContent }`, porque no usa `name` ni `description`. En `/` recibe `TRIPS[0]` y en la página del viaje el `Trip` combinado.
- `TripDetail`, `PackageSection` y `DestinationsSection`: sin cambios. `TripDetail` sigue recibiendo `Trip`; los otros dos no usan `name` ni `description`.

#### `app/viajes/[slug]/page.tsx` (reescribir)
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogTrip, SiteFooter, SiteHeader, TripDetail } from "@/modules/landing";

// Rendered per request: the catalog read calls connection(). No generateStaticParams.
export async function generateMetadata({ params }: PageProps<"/viajes/[slug]">): Promise<Metadata> {
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  return { title: trip.name, description: trip.description };
}

export default async function TripPage({ params }: PageProps<"/viajes/[slug]">) {
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  return (<><SiteHeader /><main><TripDetail trip={trip} /></main><SiteFooter /></>);
}
```

#### `README.md`: sección "Lectura pública para la landing" (modificar solo esa sección)
- Sustituir "La landing (otra rama)" y "Los errores de la base se propagan al `error.tsx` de la página" por lo implementado: `/viajes/[slug]` combina el catálogo con el contenido fijo, `null` → 404, `cache` de React, sin `error.tsx`, y `/` sigue con copia fija.
- Añadir la precondición operativa siguiente con sus consultas de comprobación.

#### Precondición operativa (la comprueba el usuario antes de mergear)
Si `main` se despliega con Workers Builds, en cuanto se mergea la página pasa a leer `production`; si el despliegue es manual, la precondición se comprueba antes de `npm run deploy`. Antes de mergear, en la rama `production` de Neon:
1. **Migración `0001` aplicada**, según el README ("Migración de la tabla de viajes"). Comprobación: `SELECT to_regclass('public.trips');` no devuelve `NULL`. Si falta, la página responde **500** (la tabla no existe).
2. **Viaje creado en `/crm/viajes/nuevo` (producción) y publicado**, con:
   - slug `maraton-santiago-2027` (exacto);
   - título "Maratón de Santiago 42K 2027";
   - ciudad "Santiago" y país "Chile";
   - fecha de la carrera 2027-05-16 y distancias "42K";
   - resumen: la `description` actual de `TRIPS` (meta description, < 300 caracteres);
   - precio desde 1499 y cupos 100;
   - sin fechas de viaje ni imagen (no se muestran).

   Comprobación: `SELECT slug, status, title, race_date, price_usd, capacity FROM trips WHERE slug = 'maraton-santiago-2027';` devuelve una fila con `status = 'published'`. Si no está publicado, la página responde **404** y los enlaces de `/` ("Quiero correr Santiago", "Ver más: paquete completo", "Descubre el viaje", tarjeta de Santiago) llevan a un 404.
3. **Consecuencia permanente:** despublicar o archivar el viaje en el CRM deja esos enlaces de `/` en 404 al instante. Es el comportamiento previsto (`null` → 404); el equipo debe saberlo.
4. `DATABASE_URL` ya es un Secret del Worker (lo usa el CRM). F4 no añade variables.
5. **Enmienda:** `landing-race-pages.md` añade sus propias precondiciones (migración `0004` aplicada y Santiago completado en el CRM con web oficial, cuotas, reserva, acompañante, incluidos, no incluidos, condiciones, detalles e imagen). Desde entonces, "sin fechas de viaje ni imagen (no se muestran)" del punto 2 ya no vale: la plantilla única los muestra si existen. El punto 3 sigue vigente.

### API pública de `modules/landing/index.ts`
- F1: `SiteHeader`, `SiteFooter`, `HeroCarousel`, `MobileCta`, `ContactSection`.
- F2: añade `TripFacts`, `PackageSection`, `TripDetail`, `StorySection`, `WhyUsSection`, `BlogSection`, `DestinationsSection`, `FaqSection`, `TRIPS`, `getTrip` y `type Trip`.
- F3: añade `CommunitySection` y `AccountSection`.
- F4: sustituye `getTrip` por `getCatalogTrip` (`getTrip` pasa a uso interno); se mantienen `TRIPS` (lo usa `app/page.tsx`) y `type Trip`.
- Enmienda, `landing-race-pages.md` F2-T1 (hecho): deja de exportar `type Trip` (ya no existe) y `getTrip` desaparece; `getCatalogTrip` devuelve `TripLanding`, que no se exporta. Estado actual: los componentes de F1–F3 (salvo los internos), `TripDetail`, `TripFacts`, `getCatalogTrip` y `TRIPS`.
- Enmienda, `runner-portal.md` F5-T1 (pendiente): añade `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER`, consumidos por `modules/bookings`.
- Enmienda, pendiente de la enmienda de `sponsors-portal.md` F7 (su F7-T4): añade `SponsorShowcase`, `getSponsorShowcase` y, solo si se confirma su Pregunta abierta 1, `FeaturedTripsSection`. No se exportan `CatalogTripDetail` ni `type CatalogTripView` (no existen).
- `ContactForm`, `TipList`, `SponsorCredit` y `TripCard` son internos.

### Assets de `public/images/` (F1)
**Enmienda (corrección):** la lista original citaba `.jpg`/`.png`; el commit `0b5f723` migró a WebP todas las imágenes que usa la landing y eliminó las que no tenían uso (`avatar-cv.png`, `version-sobre-azul-cv.png`, vídeos de experiencia). Estado real:
- Fotografía y piezas en uso, todas `.webp`:
  - `running-road.webp`, `running-team.webp`, `running-training.webp`, `story-runners.webp`, `maz-producciones.webp`;
  - `hero-santiago.webp` (salida de la Maratón de Santiago), `hero-patagonia.webp` (trail), `hero-meta.webp` (meta), `cover-santiago.webp` (trail de montaña, copia fija de `/` en `TRIPS`), `destino-santiago.webp`, `destino-rio.webp`, `destino-roma.webp`, `santiago.webp` (tip del blog);
  - `daniela-zafarti.webp` y `carla-medina.webp` (referentes del blog);
  - `logo-cv.webp` e `isotipo-cv.webp` (marca de `SiteBrand`).
- `brand/logo-horizontal.jpg` (lockup recortado a 600×155) sigue en el repositorio pero ningún componente lo usa: `SiteBrand` usa `logo-cv.webp`.
- `app/icon.svg` (isotipo trazado, verde `#58B11B` / azul `#0045AF`) y `app/apple-icon.png`.
- La página del viaje no usa imágenes locales desde `landing-race-pages.md`: pinta `imageUrl` del catálogo (URL `https://`) o ninguna.
- Los originales del cliente (`WhatsApp Image …jpeg`, `carrera-*.jpeg`, `medellin.jpg`, `panama.jpg`, `patagonia-santiago-2023.jpeg`, `runner-cruzando-meta.jpeg`, `santiago-frontal-carrera.jpeg`) se conservan en `public/images/` sin usar; no borrar hasta confirmar el descarte.

### Enmienda: qué implementa cada spec
Esta spec no añade tareas. Cada cambio lo implementa una sola spec, en la tarea indicada.

| Cambio | Archivos de la landing o de `app/` | Lo implementa | Estado |
|---|---|---|---|
| Fixture de `PublicTrip` con los siete campos nuevos | `modules/landing/utils/catalogTrip.test.ts` | `landing-race-pages.md` F1-T2 | hecho (PR #20) |
| Plantilla única de `/viajes/[slug]` desde el catálogo; `TRIPS` solo para `/`; sin `getTrip` ni `type Trip` | `modules/landing/utils/catalogTrip.ts` (+ test), `modules/landing/utils/trips.ts`, `modules/landing/index.ts` | `landing-race-pages.md` F2-T1 | hecho (PR #20) |
| Mensaje de consulta por viaje (`buildTripInquiryMessage`) | `modules/landing/utils/inquiry.ts` (+ test) | `landing-race-pages.md` F2-T2 | hecho (PR #20) |
| Plantilla minimalista `TripDetail` | `modules/landing/components/TripDetail.tsx` | `landing-race-pages.md` F2-T3 | hecho (PR #20) |
| Ruta y metadatos (`openGraph.images`) | `app/viajes/[slug]/page.tsx` | `landing-race-pages.md` F2-T4 | hecho (PR #20) |
| Exportar `SiteBrand`, `buildWhatsAppUrl` y `WHATSAPP_NUMBER` | `modules/landing/index.ts` | `runner-portal.md` F5-T1 | pendiente |
| Destino `/mis-carreras` tras ingresar en `/cuenta` y "Ver mis carreras" | ninguno (`modules/accounts`, ver `accounts-auth-ui.md`) | `runner-portal.md` F6-T1, F6-T2 | pendiente |
| "Mi perfil" en `/cuenta` y nota de `AccountSection` | `modules/landing/components/AccountSection.tsx` (el enlace está en `modules/accounts`) | `accounts-runner-profiles.md` F2-T5 | pendiente |
| Fixture `sponsor: null` en el `PublicTrip` del test de `getCatalogTrip` | `modules/landing/utils/catalogTrip.test.ts` | `sponsors-portal.md` F6-T2 | pendiente (vigente tal cual) |
| `TripLanding` con `sponsor` | `modules/landing/utils/catalogTrip.ts`, `modules/landing/utils/catalogTrip.test.ts` | `sponsors-portal.md` F7-T1 | **pendiente de enmendar** (hoy su F7-T1 describe `CatalogTripView` y toca `utils/trips.ts`) |
| "Presentado por" en la plantilla | `modules/landing/components/SponsorCredit.tsx`, `modules/landing/components/TripDetail.tsx` | `sponsors-portal.md` F7-T2 | **pendiente de enmendar** (sin `CatalogTripDetail.tsx`) |
| Página de la marca (y destacados, si se confirman) | `TripCard.tsx`, `utils/sponsorShowcase.ts` (+ test), `SponsorShowcase.tsx`; si se confirman: `FeaturedTripsSection.tsx` (+ test) | `sponsors-portal.md` F7-T3 | **pendiente de enmendar** |
| API pública y rutas | `modules/landing/index.ts`, `app/patrocinadores/[slug]/page.tsx`; `app/page.tsx` solo si se confirman los destacados; `app/viajes/[slug]/page.tsx` **no cambia** | `sponsors-portal.md` F7-T4 | **pendiente de enmendar** |

Coordinación: `runner-portal.md` F5-T1 y `sponsors-portal.md` F7-T4 tocan `modules/landing/index.ts`; la segunda conserva los exports de la primera. `sponsors-portal.md` F6-T2 y F7-T1 modifican `catalogTrip.test.ts` sobre la versión que dejó `landing-race-pages.md` (fixture `PublicTrip`, sin `TRIPS`).

## Reutilización
- shadcn ya instalados: `Button`/`buttonVariants`, `Input`, `Label`. Nuevo: `native-select`, sin dependencias npm.
- `cn` de `@/lib/utils`, `lucide-react`, `next/image`, `next/link`, `next/font/google`, `notFound` de `next/navigation`.
- `sharp` (transitivo de `next`), solo para la conversión puntual de las dos imágenes.
- F3: `RunnerAccount` de `@/modules/accounts` (`accounts-auth-ui.md` F4), que encapsula `AccessPanel`, sus formularios, `SignOutButton` y `authClient`. No hay un segundo sistema de auth.
- F4: `getPublishedTripBySlug`, `formatTripDate`, `formatTripPrice` y `type PublicTrip` de `@/modules/trips` (no se reimplementa ningún formato); `cache` de React (mismo patrón que `getCurrentUser` en `lib/auth/guards.ts`); `notFound`; los componentes `TripDetail` y `TripFacts` existentes, sin cambios de marcado.
- Enmienda: `SiteBrand` (existente en `SiteHeader.tsx`), `buildWhatsAppUrl`/`WHATSAPP_NUMBER` (existentes en `inquiry.ts`) y `RunnerAccount` ampliado en `modules/accounts`; la plantilla `TripDetail`, `TripLanding`, `getCatalogTrip` y `buildTripInquiryMessage` de `landing-race-pages.md`, que la F7 enmendada de `sponsors-portal.md` reutiliza en lugar de crear otra plantilla; para esa F7, `listPublishedTrips` y `PublicTripSponsor` de `@/modules/trips` y `getPublicSponsorBySlug` de `@/modules/sponsors`. Sin dependencias npm nuevas.

## Tests
- **`modules/landing/utils/inquiry.test.ts`** (F1):
  - `buildInquiryMessage`:
    - Santiago devuelve exactamente la plantilla con la cláusula de precios;
    - Río y Roma usan su nombre y " cuando haya una propuesta confirmada", sin precios;
    - siempre incluye las líneas `Correo:` y `WhatsApp:` y el aviso final.
  - `buildWhatsAppUrl`:
    - `WHATSAPP_NUMBER` → `https://wa.me/51938127170?text=…`;
    - `"+51 938 127 170"` → los mismos dígitos;
    - el texto va codificado, con acentos y saltos de línea;
    - `""`, 9 dígitos o 16 dígitos → `null`.
  - `parseDestinationId`: `"rio"` → `"rio"`; `undefined`, `"xyz"` o `["rio"]` → `"santiago-2027"`.
- F3 no añade tests en la landing: la lógica de acceso y sus tests (`AccessPanel.test.tsx`, `RunnerAccount.test.tsx`) son de `accounts-auth-ui.md` F4. Con la enmienda, sus casos de `/mis-carreras`, "Ver mis carreras" y "Mi perfil" los añaden `runner-portal.md` F6 y `accounts-runner-profiles.md` F2-T5.
- **`modules/landing/utils/catalogTrip.test.ts`** (F4). Mock de `@/modules/trips`: `getPublishedTripBySlug: vi.fn()` y los formateadores reales, tomados en la factoría de `@/modules/trips/utils/tripDisplay` (archivo puro, sin `server-only`; es la única importación interna, y solo en el test). Fixture `PublicTrip` con los datos de la precondición. Casos:
  - slug sin contenido fijo (`"otro-viaje"`) → `null` y el service no se llama;
  - el service devuelve `null` → `null`, y se llamó una vez con `"maraton-santiago-2027"`;
  - viaje publicado:
    - `name` = `title` y `description` = `summary`;
    - `raceDate` = "16 de mayo de 2027", `prices.cash` = "US$ 1,499" y `capacity` = "100 cupos definidos";
    - los campos fijos no cambian: `prices.installmentsTotal` "US$1,799", 9 `included`, `destinationId` "santiago-2027", `image` "/images/santiago.jpg";
  - `priceUsd: null` → "Precio a consultar"; `capacity: null` → "Cupos por confirmar";
  - el service lanza → `getCatalogTrip` rechaza con el mismo error.

  `cache` no memoiza fuera de un render RSC, así que el test no comprueba la deduplicación (igual que `guards.test.ts`).

  Enmienda: `landing-race-pages.md` F2-T1 reescribió este test para `TripLanding` (no publicado → `null`; publicado completo y mínimo; párrafos; error propagado; ver esa spec), así que los casos de F4 sobre contenido fijo ya no existen. Sobre esa versión, `sponsors-portal.md` F6-T2 añade `sponsor: null` al fixture `PublicTrip`, y su F7 enmendada añade "viaje con marca → `sponsor` copiado tal cual" y "sin marca → `sponsor: null`"; los casos de `landing-race-pages.md` se mantienen.
- **Enmienda, tests de `sponsors-portal.md` F7 (pendiente de enmendar):** `modules/landing/utils/sponsorShowcase.test.ts` y, solo si se confirman los destacados, `modules/landing/components/FeaturedTripsSection.test.tsx`, con los casos que define esa spec.
- **Sin unit test en F4:** `app/viajes/[slug]/page.tsx` solo compone (`getCatalogTrip` → `notFound()` o `TripDetail`); toda su decisión está en `getCatalogTrip`, que se prueba con `@/modules/trips` mockeado. El estado `404` y el render dinámico se verifican con los criterios de F4 (`curl -sI` y la salida de `build`). Tampoco `TripFacts`, por ser solo un cambio de tipo.
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

### Fase 4 — La página del viaje lee del catálogo en Neon
Entregable: `/viajes/[slug]` renderizada por petición, con título, resumen, fecha, precio y cupos del catálogo publicado y el resto del contenido fijo, más 404 si no está publicado. `/` no cambia. Total: 7 archivos (1 nuevo de código y 1 de test). No toca `modules/trips/**`.
Requisito previo para **mergear** (no para implementar): la precondición operativa de F4, comprobada por el usuario en `production`. Para la verificación manual hace falta una rama de Neon con `0001` y el viaje publicado; los unit tests mockean `@/modules/trips`.
- [x] T1 — Contenido fijo y combinación con el catálogo:
  - `TripContent`/`Trip` en `trips.ts`, sin `name` ni `description` en `TRIPS`;
  - `getCatalogTrip` con `cache` y su test;
  - tipo de la prop de `TripFacts`.

  Archivos: `modules/landing/utils/trips.ts`, `modules/landing/utils/catalogTrip.ts` (nuevo), `modules/landing/utils/catalogTrip.test.ts` (nuevo), `modules/landing/components/TripFacts.tsx` · depende de: Fase 3 · paralelo (con T3; archivos disjuntos)
- [x] T2 — API pública y ruta:
  - `getCatalogTrip` en lugar de `getTrip` en `index.ts`;
  - reescribir `app/viajes/[slug]/page.tsx` sin `generateStaticParams` ni `dynamicParams`;
  - `lint`, `vitest`, `build` (comprobar `ƒ /viajes/[slug]` y `○` en `/`, `/contacto` y `/cuenta`);
  - medir el Worker en Linux/WSL sin desplegar.

  Archivos: `modules/landing/index.ts`, `app/viajes/[slug]/page.tsx` · depende de: T1 · secuencial (final)
- [x] T3 — README: sección "Lectura pública para la landing" con lo implementado y la precondición operativa · archivos: `README.md` · depende de: — · paralelo (con T1)

### Enmienda 2026-10-25 (sin tareas en esta spec)
La implementan `landing-race-pages.md` (F1-T2, F2; ya hecho en PR #20), `runner-portal.md` (F5-T1, F6), `accounts-runner-profiles.md` (F2-T5) y `sponsors-portal.md` (F6-T2 y F7-T1 a F7-T4, estas últimas **solo tras enmendar su F7**, ver Pregunta abierta 8), según la tabla "Enmienda: qué implementa cada spec". Ningún developer implementa la enmienda desde esta spec.

### Trabajo futuro (fuera de esta spec, cada uno con su spec)
- **Catálogo de maratones en Neon:** hecho para la página del viaje en F4 y generalizado a cualquier viaje publicado por `landing-race-pages.md`. Queda fuera la portada (`/`): leer el catálogo allí la haría dinámica (ver F4, Decisión 1); se revisará si hay caché disponible o si el equipo cambia los datos a menudo. Si se confirma la Pregunta abierta 1 de `sponsors-portal.md`, su F7 leerá en `/` solo los destacados; el resto de la portada sigue fija.
- **Leads:** formulario protegido (consentimiento versionado, Turnstile Siteverify), lead y evento en una transacción Neon, outbox y API privada claim/ack para n8n local, según `platform-neon-foundation.md`. Sustituirá la consulta preparada de `ContactForm`. `crm-leads-pipeline.md` debe reescribirse.
- **Comunidades y área de runners:** experiencias y fotos persistentes, estrellas y moderación, sobre la identidad de F3 y una guarda de runner. Recupera la demo omitida. (El perfil de runner en tabla propia lo cubre `accounts-runner-profiles.md` y el portal de reservas `runner-portal.md`.)
- **Páginas legales y secundarias:** `/pasion-por-correr`, `/terminos`, `/privacidad`, `/cookies`, `/libro-de-reclamaciones`, `/informacion-comercial`. Al llegar se reactivan los enlaces omitidos del pie, "Conoce al operador", "Ver privacidad" y TikTok, y se revisa `noindex`. Requiere domicilio, correos, textos legales y Libro de Reclamaciones habilitado.

## Preguntas abiertas
1. **(Resuelta)** La audiencia runner se especifica en `accounts-auth-ui.md` F4, no como excepción de esta spec. F3 depende de esa fase.
2. **(No bloqueante) Texto desactualizado en `accounts-roles-permissions.md`.** Sus apartados de objetivo y alcance dicen que los runners son "visitantes anónimos, sin cuenta ni perfil". Su mecánica sigue siendo válida (registro libre → 403, sin perfil). El README se corrige en `accounts-auth-ui.md` F4-T3. ¿Quieres actualizar también esa spec? Volvería a `borrador` y necesitaría tu aprobación.
3. **(Resuelta por `landing-race-pages.md`) Viajes publicados sin contenido fijo.** Si el equipo publicaba en el CRM otro viaje (p. ej. `maraton-lima-2027`), `/viajes/<slug>` respondía 404 porque la landing no tenía su contenido fijo. `landing-race-pages.md` lo resolvió con una plantilla única para cualquier viaje publicado, de una marca o del equipo, y eliminó el contenido fijo de la página del viaje. Ya no se necesita la plantilla genérica `CatalogTripDetail` que proponía `sponsors-portal.md` F7.
4. **(No bloqueante, F4) Portada con copia fija.** Fecha, precio al contado y cupos de `/` (datos del viaje, paquete, tarjeta de Santiago, CTA móvil y la consulta de WhatsApp) siguen en el código. Si cambian en el CRM, hay que editar también `TRIPS` y los literales. ¿Aceptas esta duplicación a cambio de mantener `/` estática? `landing-race-pages.md` la mantiene (`TRIPS` solo alimenta `/`). Si se confirman los destacados (`sponsors-portal.md`, Pregunta abierta 1), `/` deja de ser estática, pero la duplicación sigue igual: los destacados no sustituyen la copia fija.
5. **(Resuelta por `landing-race-pages.md`) Campos del catálogo sin uso y formato.** En F4, `includes`, `distances`, `city`/`country`, fechas de viaje e `imageUrl` no se mostraban y convivían "US$ 1,499" (catálogo) y "US$1,799" (literal). La plantilla única muestra todos los campos del catálogo (y los siete que añade su F1) y todos los importes salen de `formatTripPrice`. Sigue valiendo "Cupos por confirmar" si no hay cupos.
6. **(No bloqueante; enmienda) Indexación de `/patrocinadores/[slug]`.** `sponsors-portal.md` describe la página como "Indexable", pero el Requisito 3 de esta spec (decisión del usuario) pone `noindex, nofollow` en todo el sitio mientras falten los datos legales, y el layout lo aplica a todas las páginas. **Propuesta por defecto:** "Indexable" se lee como "no añade un `robots` propio" (a diferencia de `/patrocinador`, que fija `index: false`); la página hereda el `noindex, nofollow` global y pasará a indexarse cuando se revise el Requisito 3 con las páginas legales. Si quieres indexarla ya, habría que sobrescribir `robots` en esa ruta y enmendar `sponsors-portal.md` F7.
7. **(Resuelta por `landing-race-pages.md`, Requisito 7) `/viajes/<slug>` con formato válido gasta una consulta.** Cualquier slug canónico consulta Neon aunque no exista; esa spec acepta el coste (consulta por índice único, sin caché) y no añade lista blanca de slugs.
8. **(Bloqueante para `sponsors-portal.md` F7) Qué debe cambiar la F7 de `sponsors-portal.md` para alinearse con `landing-race-pages.md`.** Su F7 aprobada se escribió sobre la página de F4 (contenido fijo + catálogo). No se edita aquí; la enmienda de esa spec debe:
   1. **Cabecera "Depende de":** añadir `landing-race-pages.md` (aprobada, implementada en PR #20) y corregir la línea de `landing-public-site.md`: `/viajes/[slug]` es la plantilla única `TripDetail` con `TripLanding`, `getCatalogTrip(slug): Promise<TripLanding | null>`; `Trip`, `getTrip` y el contenido fijo de la página del viaje ya no existen.
   2. **Alcance (F7) y Objetivo:** quitar "plantilla genérica para eventos sin contenido fijo" (ya existe para todo viaje publicado). F7 queda en "Presentado por" dentro de la plantilla, `/patrocinadores/<slug>` y, solo si se confirma su Pregunta abierta 1, "Eventos destacados" en `/`.
   3. **Decisiones:**
      - 13: quitar `CatalogTripDetail` de la lista;
      - 15: eliminarla o reescribirla como "resuelto por `landing-race-pages.md`", sin vistas `designed`/`catalog`;
      - 16: el CTA es el "Consultar por WhatsApp" de `TripDetail` con `buildTripInquiryMessage` (mensaje sin precio, Requisito 9 de `landing-race-pages.md`) al número del equipo, no un "Quiero información" con mensaje propio; su Pregunta abierta 2 sigue abierta;
      - 17: dejar explícito que depende de su Pregunta abierta 1 y que, sin confirmación, `/` sigue estática (como fija `landing-race-pages.md`) y F7 no toca `app/page.tsx` ni crea `FeaturedTripsSection`;
      - 18: la imagen del evento ya la pinta `TripDetail` (`aspect-video`, `unoptimized`, sin hueco si falta); la regla de `next/image` queda solo para el logo de `SponsorCredit` y la imagen de `TripCard`.
   4. **Criterios F7:**
      - el de `CatalogTripDetail` pasa a: "Dado un evento de marca publicado, `/viajes/<slug>` muestra la plantilla de `landing-race-pages.md` con `SponsorCredit` (logo si existe y nombre → `/patrocinadores/<slug>`); CTA y metadatos son los de esa spec";
      - el de Santiago "contenido fijo, se ve igual que hoy" pasa a: "Dado un viaje sin marca (p. ej. Santiago), se ve igual que en `landing-race-pages.md` F2, sin «Presentado por»";
      - el de 404 se mantiene (ya lo cumple `getCatalogTrip`);
      - los de "Eventos destacados" (sección y error de la base) y el paso "lo destaca → aparece en `/`" del manual en producción quedan condicionados a la Pregunta abierta 1;
      - el de build: `/contacto` es `ƒ` en `main` (no `○`); `/cuenta` `○`; `/` `○` salvo que se confirmen los destacados; `/patrocinadores/[slug]` `ƒ`.
   5. **Rutas:** eliminar la fila `app/viajes/[slug]/page.tsx` (F7 no la toca: la marca viaja en `TripLanding`); la fila `app/page.tsx`, condicionada a la Pregunta abierta 1.
   6. **"Cambios en `modules/landing/`":**
      - eliminar la fila `utils/trips.ts` (`Trip = TripContent & {…; sponsor}`): `Trip` no existe y `trips.ts` no se toca;
      - `utils/catalogTrip.ts`: en lugar de `CatalogTripView`, `TripLanding` añade `sponsor: PublicTripSponsor | null`, copiado en `toTripLanding` de `PublicTrip.sponsor`;
      - `components/TripDetail.tsx`: `<SponsorCredit>` en la cabecera (propuesta: justo después del `h1`, antes de la entradilla, en texto pequeño), respetando el Requisito 5 de `landing-race-pages.md` (sin decoración, sin título huérfano);
      - eliminar la fila `components/CatalogTripDetail.tsx`, con su imagen de respaldo `/images/hero-meta.webp`, su CTA "Quiero información" y su aviso propio;
      - `components/TripCard.tsx`: decidir qué pinta sin `imageUrl` (antes la imagen de respaldo era la de `CatalogTripDetail`). Propuesta: como la plantilla, sin imagen y sin hueco;
      - `index.ts`: sin `CatalogTripDetail` ni `type CatalogTripView`; `FeaturedTripsSection` solo si se confirman los destacados.
   7. **Contratos:** sustituir el bloque `CatalogTripView`/`getCatalogTrip` por `getCatalogTrip: (slug: string) => Promise<TripLanding | null>` con `TripLanding.sponsor`; `getSponsorShowcase` no cambia.
   8. **Componentes, Reutilización y Tests:**
      - quitar `CatalogTripDetail` de la tabla de componentes y de "Sin unit test";
      - Reutilización: añadir `TripDetail`, `TripLanding`, `getCatalogTrip` y `buildTripInquiryMessage` de `landing-race-pages.md`;
      - `catalogTrip.test.ts` (F7): en lugar de "sin contenido fijo → `catalog`; con contenido fijo → `designed` con `sponsor`", "viaje con marca → `sponsor` copiado; sin marca → `null`", sobre el fixture `PublicTrip` de `landing-race-pages.md` (F6-T2 sigue añadiendo `sponsor: null`);
      - `FeaturedTripsSection.test.tsx`, solo si se confirman los destacados.
   9. **Plan F7:**
      - T1: `catalogTrip.ts` y `catalogTrip.test.ts` (sin `utils/trips.ts`);
      - T2: `SponsorCredit.tsx` y `TripDetail.tsx` (sin `CatalogTripDetail.tsx`);
      - T3: `FeaturedTripsSection` (+ test) condicionada;
      - T4: `modules/landing/index.ts` y `app/patrocinadores/[slug]/page.tsx`, más `app/page.tsx` solo si se confirman los destacados; **sin** `app/viajes/[slug]/page.tsx`;
      - recontar archivos (bajan de 16).
   10. **"Cambios que requiere en otras specs", punto 4 (`landing-public-site.md`):** sustituirlo por lo que registra esta enmienda: el 404 sin consultar y la plantilla genérica ya los resolvió `landing-race-pages.md`, no hay `CatalogTripView`, `/` sigue estática salvo la Pregunta abierta 1, y se añade `/patrocinadores/[slug]`.
   11. **Nota para F6 (no es F7, pero afecta a la landing):** `PublicTrip.sponsor` y el `LEFT JOIN sponsors` de F6-T2 deben conservar los siete campos que añadió `landing-race-pages.md` F1 y el `satisfies Record<keyof PublicTrip, unknown>` de `publicColumns` (la marca es un objeto anidado, no una columna de `trips`).
9. **(No bloqueante) Enlaces de Río y Roma (PR #24, fuera de SDD).** `DestinationsSection` enlaza a `/viajes/maraton-rio-2027` y `/viajes/maraton-roma-2027`, que responden 404 hasta que esos viajes se publiquen en el CRM. Esto contradice el Requisito 2 ("sin enlaces rotos") y la tabla de destinos (`/contacto?destino=rio|roma`). **Propuesta por defecto:** registrar el estado real (hecho en esta enmienda) y publicar esos viajes en el CRM (aunque sea en estado mínimo) antes de difundir la portada. La alternativa es volver a `/contacto?destino=…` en modo build. ¿Cuál prefieres?
