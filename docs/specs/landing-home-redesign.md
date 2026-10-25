# Rediseño visual de la portada

- Módulo: landing
- Estado: borrador
- Base: `landing-public-site.md` (aprobada; estructura, secciones y textos de `/`) y `landing-race-pages.md` (aprobada; `TRIPS` solo alimenta `/`). Esta spec **solo cambia la presentación** de `/`: no cambia rutas, datos, enlaces, comportamiento ni textos, salvo lo indicado en el Requisito 6.
- Decisiones del usuario (2026-10-25): se rediseña **la portada (`/`)**; se **mantiene la marca** (azul `#0244a9`, verde `#63ae27`, logo y textos) y se replantean tipografía, jerarquía, layout y ritmo de las secciones.
- Maqueta de referencia (no es código del repo): hero con el dorsal y sección del paquete, en escritorio y móvil, compartida en la conversación del 2026-10-25.

## Objetivo
La portada se ve plana: todo es azul sobre blanco, con la misma jerarquía en cada sección, muchas etiquetas pequeñas en mayúsculas espaciadas y tarjetas repetidas. Los runners que llegan desde Instagram, en el móvil, no distinguen de un vistazo qué carrera es, cuándo es ni cuánto cuesta.

El rediseño le da a la portada una identidad propia del mundo del running, sin perder la marca: una tipografía condensada de dorsal para los titulares y un único elemento memorable, **el dorsal**, que concentra los datos del viaje (distancia, fecha, salida, precio y cupos). El resto de la página queda sobrio y ordenado alrededor de él.

## Alcance
- Incluye:
  - Tokens visuales nuevos en `app/globals.css` y una familia display (Archivo, eje de anchura) cargada con `next/font`.
  - Rediseño de las secciones de `/`: cabecera, hero, datos del viaje (dorsal), historia, paquete, comunidad, por qué viajar, blog, destinos, FAQ, pie, CTA móvil y menú móvil.
  - Un único momento de animación: el dorsal "se prende" al cargar, desactivado con `prefers-reduced-motion`.
- No incluye:
  - Cambios en `/contacto`, `/cuenta`, `/viajes/[slug]` ni el CRM, salvo los que hereden de `SiteHeader`/`SiteFooter`, que se comparten. Esas páginas deben seguir viéndose correctas.
  - Cambios de textos (salvo el Requisito 6), de enlaces, de datos de `TRIPS` o de comportamiento (carrusel, filtros del blog, FAQ, menú móvil, formulario).
  - Imágenes nuevas, logo nuevo o versión en blanco del logo. Se usan las de `public/images/`.
  - Leer el catálogo en `/`: la portada sigue estática (`○`).
  - Dependencias nuevas (`next/font/google` ya está en uso).

## Requisitos
1. **Tokens (F1).** En `app/globals.css`, en `:root` y expuestos en `@theme inline`:

   | Token | Valor | Uso |
   |---|---|---|
   | `--primary` | `#0244a9` (sin cambio) | Tinta: titulares, texto principal, botones primarios |
   | `--highlight` | `#63ae27` (sin cambio) | Acento de acción: CTA principal, viñetas, franja del chip del dorsal. Nunca para resaltar palabras sueltas |
   | `--night` (nuevo) | `#012a6b` | Fondo del hero y de franjas oscuras |
   | `--sky` (nuevo) | `#eef3fb` | Fondo alterno de secciones |
   | `--asphalt` (nuevo) | `#4a5568` | Texto secundario sobre fondo claro (contraste ≥ 4.5:1 sobre blanco y `--sky`) |
   | `--font-display` (nuevo) | Archivo | Solo titulares y cifras de la portada |

   `--font-sans` (Plus Jakarta Sans) sigue como fuente de texto de todo el sitio, y `--font-heading` no cambia, así que el CRM no se ve afectado.
2. **Tipografía (F1).**
   - Archivo con `next/font/google`, variable, `axes: ["wdth"]`, `subsets: ["latin"]` y variable CSS `--font-archivo`, añadida al `<html>` en `app/layout.tsx` junto a la actual.
   - Titulares de la portada: `font-display`, anchura condensada (`font-stretch: 62%`), peso 800–900, interlineado ≤ 0.9, `text-wrap: balance`.
   - Escala: h1 del hero `clamp(56px, 10.5vw, 168px)`; h2 de sección `clamp(44px, 6vw, 88px)`; cifras grandes (dorsal, precio) en display.
   - El texto corrido mantiene Plus Jakarta, con líneas de ≤ 70 caracteres (`max-w-[60ch]` o similar).
3. **El dorsal (F1).** `TripFacts` se rediseña como un dorsal de carrera; mantiene su API, `({ trip }: { trip: TripContent })`. Contenido:
   - franja superior azul con "Maratón de Santiago" y "Preventa";
   - número grande "42K" en display;
   - cuatro "talones" separados por líneas discontinuas en un `<dl>`: La carrera → `raceDate` (+ enlace "Ver anuncio oficial"), Salida → `route`, Al contado → `prices.cash`, Primer equipo → `capacity`;
   - franja inferior verde con barras de chip de cronometraje (decorativas, `aria-hidden`);
   - dos agujeros de imperdible en las esquinas superiores.

   Se ubica en el hero, a la derecha en escritorio (≥ 1024 px), girado −3°, y debajo del titular en móvil (máx. 360 px de ancho, sin desbordar). Animación de entrada única, de ≤ 1 s, que se anula con `motion-reduce`. Los textos `routeNote` y `capacityNote` siguen visibles en tamaño pequeño dentro de su talón. La nota "Preventa · al contado" de la franja anterior se elimina: "Preventa" pasa a la franja superior y "al contado" a la etiqueta del talón.
4. **Secciones (F1–F2).** Principios comunes, verificables por el reviewer:
   - Sin etiquetas en MAYÚSCULAS con tracking ancho (`uppercase` + `tracking-[…]`/`tracking-widest`) en los componentes de la portada. Si la etiqueta aporta información, pasa a minúsculas normales (sentence case) en `text-sm`; si solo repite el título, se elimina (Requisito 6).
   - Sin palabras resaltadas en otro color o en cursiva dentro de un titular (se elimina `em` de `HeroCarousel` y el subrayado de `CommunitySection`).
   - Sin tarjetas idénticas con sombra gris como recurso por defecto. Las listas se resuelven con filas y separadores finos, y las tarjetas solo se usan donde el contenido es una tarjeta: destinos (con su foto) y cifras de MAZ.
   - Numeración (`01 / 02 / 03`) solo donde el contenido es una secuencia. "Conecta, Comparte, Suma" lo es y se mantiene; en ningún otro sitio se añade.
   - Fondos alternos `--background` / `--sky` / `--night` para dar ritmo, sin degradados decorativos. El overlay de fotos es un duotono plano (foto en luminosidad sobre `--night`), no un degradado.
   - Radios: 14–18 px en fotos y dorsal, `rounded-full` en botones; nada de un radio único para todo.
   - Botones: CTA principal verde (`bg-highlight`), secundarios azules o como enlace subrayado. Se mantiene el icono `ArrowUpRight` donde ya existe.
5. **Por sección:**
   - **Cabecera (F1):** fondo blanco sólido (el logo es una imagen con fondo blanco). Más aire vertical, nav en `text-sm` con estados hover y foco visibles (sin marcar la página actual: requeriría un `"use client"` nuevo o tocar páginas fuera del plan) y botones con la nueva forma. Se comparte con `/contacto`, `/cuenta` y `/viajes/*`.
   - **Hero (F1):** foto a sangre en duotono sobre `--night`, titular en display blanco, CTA y dorsal (Requisito 3). El carrusel conserva sus 3 diapositivas, sus controles y su accesibilidad; el dorsal no cambia entre diapositivas.
   - **Historia (F1):** foto grande + titular display; sin el pie "CORRE, VIAJA, CONECTA." en mayúsculas espaciadas (pasa a sentence case).
   - **Paquete (F1):** sin marco de tarjeta. Foto vertical a la izquierda; a la derecha, titular, lista de destacados en filas con viñeta verde, precio en display grande, cuotas y reserva en texto secundario, CTA y aviso. "Ver más: paquete completo" se mantiene como enlace.
   - **Comunidad, Por qué viajar, Blog, Destinos, FAQ, cifras de MAZ, pie y CTA móvil (F2):** aplican el Requisito 4, con display en sus titulares y las cifras de MAZ en display. La FAQ se mantiene como acordeón nativo con filas. Las tarjetas de destino conservan foto, bandera, estado, datos y enlace.
6. **Textos (F1–F2).** No se reescribe ningún texto. Únicos cambios permitidos:
   - etiquetas en mayúsculas que pasan a sentence case (mismo texto);
   - eliminar sobretítulos que solo repiten la sección (p. ej. "INSPIRACIÓN PARA TU PRÓXIMA META" sobre "Blog runner.", "05 / RESUELVE TUS DUDAS" sobre la FAQ);
   - quitar el resaltado de palabras sueltas.

   El hero mantiene sus titulares; no se añade entradilla nueva.
7. **Calidad (F1–F2):**
   - sin scroll horizontal a 360 px;
   - foco visible con teclado en todos los enlaces y botones (se mantiene el `outline` de `globals.css`);
   - contraste AA en texto;
   - `prefers-reduced-motion` respetado;
   - `/` sigue estática (`○`);
   - sin `"use client"` nuevos (solo los existentes: `HeroCarousel`, `MobileMenu`, `TipList`, `ContactForm`).

## Criterios de aceptación
### Fase 1 — Sistema visual y primer pantallazo
- [ ] (F1) Dado `app/globals.css`, entonces existen `--night`, `--sky`, `--asphalt` y `--font-display`, con sus `--color-*`/`--font-*` en `@theme inline`; `--primary`, `--highlight`, `--font-sans` y `--font-heading` no cambian.
- [ ] (F1) Dado `app/layout.tsx`, entonces carga Archivo con `next/font/google` (eje `wdth`) y su variable va en `<html>`; Plus Jakarta sigue igual.
- [ ] (F1) Dado `/` a 1440 px, entonces el hero muestra el titular en display condensado y el dorsal a la derecha con 42K, los cuatro talones, el enlace "Ver anuncio oficial" y la franja de chip. A 390 px, el dorsal va bajo el titular, sin scroll horizontal.
- [ ] (F1) Dado `prefers-reduced-motion: reduce`, cuando cargo `/`, entonces el dorsal aparece sin animación.
- [ ] (F1) Dados `HeroCarousel`, `TripFacts`, `StorySection`, `PackageSection` y `SiteHeader`, entonces no contienen `uppercase` con tracking ancho ni palabras resaltadas en titulares. El carrusel sigue cambiando de diapositiva con sus controles y teclado como antes.
- [ ] (F1) Dados `/contacto`, `/cuenta` y `/viajes/maraton-santiago-2027` (con `npm run dev`), entonces la cabecera nueva se ve correcta y no rompe su layout.
- [ ] (F1) Capturas antes/después de `/` a 1440 px y 390 px, adjuntas al resumen de la fase.

### Fase 2 — Resto de la portada
- [ ] (F2) Dados `CommunitySection`, `WhyUsSection`, `BlogSection`, `TipList`, `DestinationsSection`, `FaqSection`, `SiteFooter` y `MobileCta`, entonces cumplen el Requisito 4: sin etiquetas en mayúsculas espaciadas, sin resaltado de palabras, titulares en display y fondos alternos sin degradados.
- [ ] (F2) Dado `/`, entonces la FAQ sigue abriendo y cerrando cada pregunta, los filtros del blog siguen filtrando y las tarjetas de destino enlazan a las mismas URLs que hoy.
- [ ] (F2) Capturas antes/después de `/` completa a 1440 px y 390 px, adjuntas al resumen.

### Ambas fases
- [ ] Dado el diff, entonces no cambia ningún texto salvo lo permitido en el Requisito 6, ni enlaces, datos de `TRIPS`, rutas o tests de lógica.
- [ ] Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores y `/` es estática (`○`).
- [ ] `npm run lint` y `npx vitest run` sin errores.

## Diseño técnico
- Rutas: ninguna nueva. `app/page.tsx` solo cambia si hace falta reordenar o envolver secciones para los fondos alternos.
- Fuente: en `app/layout.tsx`, `Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" })`. Verificar la firma en `node_modules/next/dist/docs` (API de `next/font` en Next 16). En `globals.css`, `--font-display: var(--font-archivo)`.
- Utilidad de titulares: una clase de componente en `globals.css` (`@utility display-title` o `@layer components`) con familia, `font-stretch: 62%`, peso, interlineado y `text-wrap: balance`, para no repetirla en cada sección (DRY).
- Componentes: todos existentes en `modules/landing/components/`, modificados. Ningún componente nuevo, salvo que el dorsal pida separar las barras del chip en un subcomponente local dentro de `TripFacts.tsx` (no exportado).
- shadcn: `buttonVariants` existente para los botones; ningún componente nuevo.
- Sin hooks, services, schemas ni stores nuevos.

## Reutilización
`buttonVariants`, `cn`, `next/image`, `lucide-react` (iconos actuales), imágenes de `public/images/`, `TRIPS` y `TripContent` sin cambios. La lógica del carrusel (`HeroCarousel`), del menú (`MobileMenu`) y de los filtros (`TipList`) se mantiene: solo cambian clases y marcado de presentación.

## Tests
Cambio solo de presentación: según `docs/SETUP.md`, los componentes presentacionales no requieren unit tests nuevos. Los tests existentes deben seguir pasando. La verificación visual se hace con capturas (Playwright, preinstalado) a 1440 px y 390 px, más la comprobación de que no hay scroll horizontal (`scrollWidth === clientWidth`) a 360 px.

## Plan de tareas
### Fase 1 — Sistema visual y primer pantallazo
- [ ] T1 — Tokens, fuente display y utilidad de titulares · archivos: `app/globals.css`, `app/layout.tsx` · depende de: — · secuencial (base)
- [ ] T2 — Cabecera y menú móvil · archivos: `modules/landing/components/SiteHeader.tsx`, `modules/landing/components/MobileMenu.tsx` · depende de: T1 · paralelo con T3 y T4
- [ ] T3 — Hero y dorsal · archivos: `modules/landing/components/HeroCarousel.tsx`, `modules/landing/components/TripFacts.tsx`, `app/page.tsx` · depende de: T1 · paralelo con T2 y T4
- [ ] T4 — Historia y paquete · archivos: `modules/landing/components/StorySection.tsx`, `modules/landing/components/PackageSection.tsx` · depende de: T1 · paralelo con T2 y T3
- [ ] T5 — Verificación visual (capturas antes/después, 360 px, `/contacto`, `/cuenta`, `/viajes/*`) · archivos: — · depende de: T2, T3, T4 · secuencial

### Fase 2 — Resto de la portada
- [ ] T1 — Comunidad y por qué viajar · archivos: `modules/landing/components/CommunitySection.tsx`, `modules/landing/components/WhyUsSection.tsx` · depende de: Fase 1 · paralelo
- [ ] T2 — Blog · archivos: `modules/landing/components/BlogSection.tsx`, `modules/landing/components/TipList.tsx` · depende de: Fase 1 · paralelo
- [ ] T3 — Destinos y FAQ (con cifras de MAZ) · archivos: `modules/landing/components/DestinationsSection.tsx`, `modules/landing/components/FaqSection.tsx` · depende de: Fase 1 · paralelo
- [ ] T4 — Pie y CTA móvil · archivos: `modules/landing/components/SiteFooter.tsx`, `modules/landing/components/MobileCta.tsx` · depende de: Fase 1 · paralelo
- [ ] T5 — Verificación visual de la portada completa · archivos: — · depende de: T1–T4 · secuencial

## Preguntas abiertas
1. ¿Hay una versión del logo en blanco o con fondo transparente? Con ella la cabecera podría ir sobre la foto del hero, como en la maqueta. Sin ella, la cabecera sigue blanca (Requisito 5). No bloquea la implementación.
