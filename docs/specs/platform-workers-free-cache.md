# Páginas públicas servidas desde caché estática en Workers Free

- Módulo: platform, content, landing
- Estado: borrador
- Origen: Error 1102 ("Worker exceeded resource limits") en `https://carreras-viajeras.mentec.dev/`
  el 29 de octubre de 2026; el usuario pide corregirlo sin pasar a Workers Paid.
- Referencias: `AGENTS.md`, `docs/SETUP.md`, `landing-news-updates.md`, `landing-public-site.md`,
  `landing-race-pages.md`, `trips-catalog.md` y `trips-commercial-offers.md`.

## Objetivo

Que el sitio público funcione dentro del límite de **10 ms de CPU por petición** de Workers Free.
Las páginas públicas se generan una vez al compilar y Cloudflare las sirve como archivos
estáticos. Los datos que cambian (noticias; en fases posteriores, catálogo y ofertas) se piden
desde el navegador a endpoints públicos pequeños.

## Diagnóstico (evidencia)

1. `open-next.config.ts` no configura caché incremental (`defineCloudflareConfig({})`), así que
   OpenNext usa la caché `dummy`. Cada petición renderiza la página, incluso las marcadas como
   estáticas (`○`).
2. Desde `d8d9275` (noticias en la portada), `/` llama a `connection()` y el build la marca `ƒ`
   (dinámica). Su HTML pesa unos 258 KB.
3. Mediciones locales en caliente, sin base de datos (la consulta falla al instante, así que el
   tiempo es casi todo CPU) con `next start`: `/` 33–48 ms; `/contacto`, `/noticias` y
   `/viajes/[slug]` 17–30 ms. Todas superan los 10 ms de Workers Free.
4. Prototipo local (no confirmado) con `wrangler dev` y caché de assets estáticos con intercepción:
   - `/cuenta` (`○`) se sirve con `x-opennext-cache: HIT` en ~24 ms de tiempo real en un isolate
     frío y ~10 ms en caliente, sin cargar el servidor Next.
   - La primera petición dinámica de un isolate tarda entre 330 ms y 4,4 s, porque carga el
     servidor Next.
   - Las páginas en caché evitan el render y también ese arranque.

Un 1102 también puede deberse a la memoria. Antes de implementar, el usuario confirma en
Workers Logs que el `outcome` de las peticiones fallidas es `exceededCpu`. Si fuera
`exceededMemory`, esta spec no lo resuelve.

## Precedencia

Esta spec, cuando sea aprobada, sustituye solo los puntos siguientes:

- `landing-news-updates.md`, requisito 1: `/` deja de renderizar las novedades en el servidor
  por petición y vuelve a ser estática. Las novedades se piden desde el navegador.
- `landing-news-updates.md`, requisito 6 (no hay ISR ni caché entre usuarios): sigue vigente
  para los datos. El HTML estático de la portada no contiene noticias, y el endpoint de
  novedades responde `no-store`, así que publicar o despublicar se refleja en la siguiente
  carga de la portada.
- `landing-race-pages.md`, requisito 7, y el estado real de `/contacto` en `landing-public-site.md`
  (Fase 2): `/contacto` deja de leer `searchParams` y `listPublishedTrips()` en el servidor y
  vuelve a ser estática (`○`); `destino`, la atribución y los viajes se resuelven en el navegador
  con las mismas reglas (`resolveDestination`, `attributionParams`).
- `landing-race-pages.md`, requisito 7, y la ruta `/viajes/[slug]` (Fase 3): las páginas de viaje y
  de registro dejan de ser dinámicas y de usar `generateMetadata`; un slug inexistente muestra
  "Viaje no encontrado" con HTTP 200 (404 suave) y no hay título ni imagen Open Graph por viaje en
  el HTML. El contenido (`TripDetail`, `RaceRegistrationSection`, oferta decidida por el servidor
  con slug + `?c=`, modo stand) no cambia.

Las demás reglas de lectura pública (solo `published`, sin datos internos, error distinto de
vacío, aviso fijo) se mantienen y se aplican al endpoint.

## Alcance

- Incluye (Fase 1):
  - caché incremental de assets estáticos con intercepción en OpenNext;
  - copia de la caché a los assets dentro de `npm run build:worker`;
  - portada estática;
  - endpoint público de novedades y su carga en el navegador.
- Incluye (Fase 2): `/contacto` estática con la lista de viajes desde `GET /api/viajes`.
- Incluye (Fase 3): `/viajes/[slug]` y `/viajes/[slug]/registro` servidas como una ficha estática
  común y cargadas en el navegador desde `GET /api/viajes/[slug]` (decisión 1).
- No incluye:
  - pasar a Workers Paid;
  - R2, KV, D1 o Durable Objects;
  - ISR o revalidación;
  - consultas a Neon durante la importación o el build;
  - cambios en el CRM, `/cuenta/perfil`, `/mis-carreras` o `/noticias`.

  Esas páginas siguen renderizándose por petición y **pueden seguir dando 1102 en Workers Free**,
  sobre todo en isolates fríos. Esta spec no promete corregirlas (pregunta abierta 2).

## Requisitos

1. `open-next.config.ts` usa `staticAssetsIncrementalCache` y `enableCacheInterception: true`.
   La caché es de solo lectura: ninguna ruta depende de escribir en ella ni de revalidar.
2. `npm run build:worker` ejecuta `opennextjs-cloudflare populateCache local` después de
   `opennextjs-cloudflare build` y antes de `strip-env-secrets` y `check-clerk-key`. Así,
   `.open-next/assets/cdn-cgi/_next_cache/` existe aunque el despliegue sea un `wrangler deploy`
   simple (Workers Builds). Esa ruta de assets solo es accesible desde el Worker.
   `check-clerk-key` también la recorre.
3. `/` no llama a `connection()`, `cookies()`, `headers()` ni a lecturas de Neon, y el build la
   marca `○`. El resto de secciones de la portada no cambia.
4. `GET /api/noticias/portada` es público y sin sesión, y no se añade al matcher del middleware.
   - Devuelve las tres publicaciones publicadas más recientes, reutilizando
     `listPublishedPosts({ limit: 3 })`: `{ "posts": PublicPost[] }`, con `publishedAt` en ISO
     8601.
   - Responde `Cache-Control: no-store`.
   - Un error de lectura responde `503` con `{ "error": "news_unavailable" }`, sin detalles
     internos, y registra el mensaje fijo existente.
   - No acepta parámetros: cualquier query se ignora.
5. En el navegador, la sección Noticias pide el endpoint con el cliente compartido (`lib/api.ts`)
   y TanStack Query, y valida la respuesta con Zod.
   - Estados: `loading` (esqueleto o texto breve sin tarjetas inventadas), `ok`, `empty` y
     `error`, con los mismos textos que ahora para vacío y error.
   - No reintenta en bucle: como máximo un reintento.
   - No guarda los datos entre sesiones.
6. Ninguna página estática incrusta secretos ni datos de Neon. `strip-env-secrets` y
   `check-clerk-key` siguen pasando.

## Criterios de aceptación

- [ ] Dado `npm run build`, entonces la tabla de rutas muestra `○ /`.
- [ ] Dado `npm run build:worker`, entonces existen
      en `.open-next/assets/cdn-cgi/_next_cache/<buildId>/` las entradas de caché de `/`
      (`…/$/index.cache`) y de `/cuenta` (la ruta intermedia la decide OpenNext).
- [ ] Dado `npm run preview`, cuando se pide `/`, entonces responde `200` con
      `x-opennext-cache: HIT`, también como primera petición de un isolate nuevo.
- [ ] Dado que hay publicaciones publicadas, cuando el navegador carga `/`, entonces la sección
      muestra hasta tres tarjetas obtenidas de `GET /api/noticias/portada`.
- [ ] Dado un fallo de Neon, entonces el endpoint responde `503 news_unavailable` y la portada
      muestra el aviso fijo sin romper las demás secciones.
- [ ] Dado que se despublica una noticia, cuando se recarga `/`, entonces deja de aparecer, sin
      redesplegar.
- [ ] Tras desplegar con autorización, el usuario comprueba en Workers Logs que las peticiones a
      `/` ya no terminan en `exceededCpu`.

## Diseño técnico

- Rutas:
  - `app/page.tsx` vuelve a ser síncrona y usa `HomeNewsSection`.
  - Nuevo `app/api/noticias/portada/route.ts`.
- Configuración: `open-next.config.ts` y el script `build:worker` de `package.json`.
- Compartido:
  - `lib/api.ts` (cliente axios único);
  - `app/providers.tsx` (`QueryClientProvider` con un `QueryClient` único, `"use client"`);
  - `app/layout.tsx` envuelve `children` con `Providers` dentro de `ClerkProvider`.

  No existen aún y `docs/SETUP.md` los prescribe. El provider es de cliente y no vuelve dinámica
  ninguna ruta, lo que se comprueba con `○ /cuenta` en el build.
- Módulo `content`:
  - `schemas/content.schema.ts` añade `homeNewsResponseSchema` (posts con
    `publishedAt: z.coerce.date()`);
  - `services/homeNews.api.ts` (axios + Zod, sin React);
  - `hooks/useHomeNews.ts` (TanStack Query; query key en el módulo);
  - `components/HomeNewsSection.tsx` (`"use client"`, conecta el hook con `NewsSection`);
  - `NewsSection` acepta además `{ status: "loading" }`;
  - `utils/homeNews.ts` queda para el endpoint (`getHomeNews`, server-only).
  - `index.ts` exporta `HomeNewsSection`.
- El Route Handler compone `getHomeNews()` y traduce su resultado: `ok`/`empty` dan `200`, y
  `error` da `503`.

## Reutilización

Reutiliza `listPublishedPosts`, `getHomeNews`, `NewsSection`, `NewsCard`, los textos actuales y
la caché `staticAssetsIncrementalCache` de `@opennextjs/cloudflare`. No añade dependencias:
`@tanstack/react-query` y `axios` ya están en `package.json`.

## Tests

- Route Handler: respuestas `200` con posts, `200` con `[]` y `503` ante error; cabecera
  `no-store`; ignora la query.
- `homeNews.api`: valida y convierte `publishedAt`; rechaza una respuesta malformada.
- `HomeNewsSection` / `NewsSection`: estados `loading`, `ok`, `empty` y `error`, con un
  `QueryClient` de test.
- Validación funcional: build (`○ /`), `build:worker` (caché copiada) y `preview`
  (`x-opennext-cache: HIT` en frío). Un build Next aislado no acredita Workers.

## Plan de tareas

### Fase 1 — portada estática

- [x] T1 — Caché de assets estáticos e intercepción; `populateCache local` en `build:worker`
  · archivos: `open-next.config.ts`, `package.json` · depende de: — · secuencial (base)
- [x] T2 — Cliente axios y provider de TanStack Query
  · archivos: `lib/api.ts`, `app/providers.tsx`, `app/layout.tsx` · depende de: T1 · secuencial
- [x] T3 — Endpoint `GET /api/noticias/portada`
  · archivos: `app/api/noticias/portada/route.ts`, `app/api/noticias/portada/route.test.ts`
  · depende de: T2 · paralelo con T4
- [x] T4 — Carga de noticias en el navegador y portada estática
  · archivos: `modules/content/schemas/content.schema.ts`, `modules/content/services/homeNews.api.ts`,
  `modules/content/hooks/useHomeNews.ts`, `modules/content/components/HomeNewsSection.tsx`,
  `modules/content/components/NewsSection.tsx`, `modules/content/components/NewsArticle.test.tsx`,
  `modules/content/index.ts`, `app/page.tsx` y sus tests · depende de: T2 · paralelo con T3
- [x] T5 — README (ejecución en Free, caché estática, límites conocidos) y validación build,
  `build:worker` y preview · archivos: `README.md` · depende de: T3, T4 · secuencial

### Fase 2 — `/contacto` estática

Requisitos de la fase:

F2.1. `/contacto` no lee `searchParams` en el servidor ni consulta Neon; el build la marca `○`.
      `app/contacto/page.tsx` sigue importando `submitWebLeadAction` de `@/modules/crm` y lo pasa
      como prop (no se importa la acción desde un componente cliente).
F2.2. `GET /api/viajes` público y sin sesión (no se añade al matcher): devuelve
      `{ "trips": [{ "slug", "title" }] }` de `listPublishedTrips()`, solo esos dos campos y en el
      mismo orden; `Cache-Control: no-store`; un error de lectura responde `503`
      `{ "error": "trips_unavailable" }` sin detalles internos y registra un mensaje fijo; la query
      se ignora.
F2.3. En el navegador, `ContactPageContent` (`"use client"`, módulo `landing`) lee `destino` y los
      parámetros de atribución con `useSearchParams()` (dentro de `<Suspense>` en la página) y
      reutiliza `attributionParams`/`resolveDestination` sin cambiar sus reglas. Pide los viajes con
      el cliente compartido, TanStack Query (un reintento como máximo) y Zod.
F2.4. Mientras carga, muestra un estado breve accesible sin formulario (para no remontarlo y perder
      lo escrito al llegar los viajes). Con datos, `ContactSection` recibe los viajes; si el
      endpoint falla, recibe `[]` y el formulario sigue disponible con los destinos sin catálogo.
      `isRegistrationOpen()` y el aviso de registro cerrado se mantienen.
F2.5. El envío del formulario sigue siendo la Server Action actual (por petición). Límite conocido:
      en Workers Free puede dar 1102 en frío; no se modifica en esta fase.

Criterios de aceptación de la fase:

- [ ] `npm run build` muestra `○ /contacto` y `ƒ /api/viajes`.
- [ ] Preview: `/contacto?destino=rio&utm_source=x` responde `x-opennext-cache: HIT` y, en el
      navegador, preselecciona Río y conserva `utm_source` en los campos ocultos.
- [ ] Con el endpoint en `503`, el formulario aparece con los destinos sin catálogo.
- [ ] `GET /api/viajes` no devuelve más campos que `slug` y `title`.

Plan:

- [ ] T6 — Endpoint `GET /api/viajes` · archivos: `app/api/viajes/route.ts`,
  `app/api/viajes/route.test.ts` · depende de: Fase 1 · paralelo con T7
- [ ] T7 — Lectura de viajes en el navegador · archivos:
  `modules/landing/schemas/catalogTrips.schema.ts`, `modules/landing/services/catalogTrips.api.ts`
  (+ test), `modules/landing/hooks/useCatalogTripOptions.ts` · depende de: Fase 1 · paralelo con T6
- [ ] T8 — `ContactPageContent` y página estática · archivos:
  `modules/landing/components/ContactPageContent.tsx` (+ test), `modules/landing/index.ts`,
  `app/contacto/page.tsx` · depende de: T7 · secuencial
- [ ] T9 — README y validación build/`build:worker`/preview · archivos: `README.md` · depende de:
  T6, T8 · secuencial

### Fase 3 — páginas de viaje estáticas

Decisión 1 aplicada: `/viajes/<slug>` y `/viajes/<slug>/registro` dejan de renderizarse en el
servidor. Se sirve un HTML estático común (una "ficha" vacía) y el navegador pide el viaje y la
oferta a un endpoint público. Las URL públicas no cambian (enlaces de campañas `?c=`, QR de
stand `?modo=stand`, enlaces de la portada).

Requisitos de la fase:

F3.1. Spike bloqueante (T10): antes del resto, comprobar en `npm run preview` que una regla
      `rewrites` de `next.config.ts` que lleva `/viajes/:slug` y `/viajes/:slug/registro` a una
      ficha estática (`○`) responde `x-opennext-cache: HIT` sin cargar el servidor Next y
      conserva la URL visible. Si no se cumple, la fase se detiene y se informa al usuario con
      la evidencia; no se buscan alternativas sin una nueva enmienda.
F3.2. La ficha estática es una ruta fija que no colisiona con slugs válidos del catálogo
      (`tripSlugSchema` solo admite minúsculas, dígitos y guiones; la ficha usa un segmento que
      ese formato rechaza). La regla de reescritura no se aplica a la propia ficha, a
      `/api/*` ni a assets.
F3.3. `GET /api/viajes/[slug]` es público (no se añade al matcher) y acepta solo `?c=`:
      - `200 { "trip": TripLanding, "offer": OfferView | null }`, construidos en el servidor con
        `getCatalogTrip` y `getCatalogOffer` (mismos campos y formatos que hoy; sin ids,
        nombre interno, campaña, capacidad interna ni auditoría);
      - `404 { "error": "trip_not_found" }` para un slug inexistente, no publicado o no canónico;
      - `503 { "error": "trip_unavailable" }` ante un error de lectura, con mensaje fijo en el log;
      - `Cache-Control: no-store` siempre. El servidor sigue decidiendo la oferta por slug + `?c=`;
        ningún importe sale de la URL.
F3.4. En el navegador, el slug se toma de la URL visible (`usePathname()`), y `c`, `modo` y la
      atribución de `useSearchParams()` (dentro de `<Suspense>`), con las mismas reglas que hoy
      (`firstParam`, `attributionParams`, `modo=stand`). Se pide el endpoint con el cliente
      compartido, TanStack Query (un reintento como máximo) y Zod.
F3.5. Estados: carga (texto breve accesible, sin formulario ni importes), `TripDetail` /
      `RaceRegistrationSection` con los datos (sin cambiar su contenido), "Viaje no encontrado"
      con enlace a la portada para el 404 (respuesta HTTP 200 de la ficha: 404 suave aceptado),
      y aviso fijo con enlace a WhatsApp general para el error.
F3.6. El título del documento se fija en el navegador (`Título del viaje | Carreras Viajeras`,
      y `Registro · …` en registro). El HTML estático lleva un título y una descripción genéricos;
      no hay imagen Open Graph por viaje (decisión 1). `robots` sigue en `noindex`.
F3.7. El envío del registro sigue siendo la Server Action actual, pasada como prop desde el Server
      Component de la ficha. Límite conocido: puede dar 1102 en frío.

Criterios de aceptación de la fase:

- [ ] Spike (T10) documentado con la salida de la preview antes de seguir.
- [ ] `npm run build` no muestra `ƒ /viajes/[slug]` ni `ƒ /viajes/[slug]/registro`; la ficha sale
      `○` y existe `ƒ /api/viajes/[slug]`.
- [ ] Preview: `/viajes/maraton-santiago-2027?c=abc` y `/viajes/maraton-santiago-2027/registro?modo=stand`
      responden `x-opennext-cache: HIT` en frío y conservan la URL.
- [ ] Con el endpoint en `404`, la ficha muestra "Viaje no encontrado"; en `503`, el aviso fijo.
- [ ] `GET /api/viajes/<slug>?c=<código>` solo usa `c`; otro parámetro no cambia la respuesta.
- [ ] El stand (`?modo=stand`) se ve sin cabecera, pie ni bloque de precio, como hoy.

Plan:

- [ ] T10 — Spike de reescritura + caché · archivos: `next.config.ts`, ficha mínima en
  `app/viajes/` · depende de: Fase 2 · secuencial (bloqueante)
- [ ] T11 — Endpoint `GET /api/viajes/[slug]` · archivos: `app/api/viajes/[slug]/route.ts` (+ test)
  · depende de: T10 · paralelo con T12
- [ ] T12 — Lectura del viaje en el navegador · archivos:
  `modules/landing/schemas/catalogTrips.schema.ts`, `modules/landing/services/catalogTrips.api.ts`
  (+ test), `modules/landing/hooks/useCatalogTrip.ts` · depende de: T10 · paralelo con T11
- [ ] T13 — Fichas cliente de viaje y registro · archivos:
  `modules/landing/components/TripPageContent.tsx`, `RacePageContent.tsx` (+ tests),
  `modules/landing/index.ts`, páginas de la ficha en `app/viajes/`, retirada de
  `app/viajes/[slug]/page.tsx` y `app/viajes/[slug]/registro/page.tsx` · depende de: T11, T12
- [ ] T14 — README y validación build/`build:worker`/preview · archivos: `README.md` · depende de:
  T13 · secuencial

## Decisiones (antes preguntas abiertas)

1. Páginas de viaje (29/10/2026): el usuario acepta perder el título y la imagen de vista previa
   (Open Graph) al compartir `/viajes/<slug>` por WhatsApp; se cargarán en el navegador (Fase 3).
2. CRM, `/cuenta/perfil` y `/mis-carreras` (29/10/2026): el usuario acepta el riesgo de 1102 en
   Workers Free; no se cambian en esta spec.
