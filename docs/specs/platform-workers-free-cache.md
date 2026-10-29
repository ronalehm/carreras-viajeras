# Páginas públicas servidas desde caché estática en Workers Free

- Módulo: platform, content, landing
- Estado: aprobado
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

Las demás reglas de lectura pública (solo `published`, sin datos internos, error distinto de
vacío, aviso fijo) se mantienen y se aplican al endpoint.

## Alcance

- Incluye (Fase 1):
  - caché incremental de assets estáticos con intercepción en OpenNext;
  - copia de la caché a los assets dentro de `npm run build:worker`;
  - portada estática;
  - endpoint público de novedades y su carga en el navegador.
- Incluye (fases posteriores, detalladas antes de implementarse): `/contacto` (Fase 2), y
  `/viajes/[slug]` y `/viajes/[slug]/registro` (Fase 3, con la pregunta abierta 1).
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
      `.open-next/assets/cdn-cgi/_next_cache/<buildId>/index.cache` y la caché de `/cuenta`.
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

### Fase 2 — `/contacto` (por detallar)

Página estática; lista de viajes (`slug`, `title`) desde un endpoint público; `destino` y
parámetros de atribución leídos en el navegador. La Server Action del formulario se mantiene.

### Fase 3 — páginas de viaje (por detallar)

Depende de la pregunta abierta 1.

## Preguntas abiertas

1. `/viajes/[slug]` y `/registro` no pueden prerenderizarse sin conocer los slugs al compilar, y
   el proyecto prohíbe consultar Neon en el build. Si se cargan en el navegador, se pierden el
   título y la imagen de vista previa (Open Graph) al compartir el enlace por WhatsApp. ¿Se
   acepta, o se prefiere una lista fija de slugs publicados en el repositorio, que habría que
   actualizar al publicar un viaje?
2. El CRM, `/cuenta/perfil` y `/mis-carreras` siguen renderizándose por petición. En Workers Free
   pueden seguir dando 1102 (sobre todo en frío). ¿Se acepta ese riesgo, o se reconsidera
   Workers Paid solo si el CRM sigue fallando tras la Fase 1?
