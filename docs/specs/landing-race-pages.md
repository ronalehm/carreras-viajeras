# Landing minimalista por carrera

- Módulo: trips (Fase 1) · landing (Fase 2)
- Estado: aprobado
- Base: `trips-catalog.md` (aprobada; catálogo y contrato de lectura pública) y `landing-public-site.md` (aprobada; F4 lee el catálogo en `/viajes/[slug]`). Esta spec **sustituye** en `/viajes/[slug]` la combinación de contenido fijo (`TRIPS`) + catálogo de `landing-public-site.md` F4. Esa spec excluía expresamente "una plantilla genérica para viajes sin contenido fijo", que es justo lo que se pide ahora. No modifica otras specs.
- Decisiones del usuario (2026-10-25): (1) la información de cada carrera sale **del CRM**, ampliando el catálogo con los campos que hoy solo existen como contenido fijo de Santiago, aunque eso exija una migración aplicada a mano en Neon; (2) Santiago usa **la misma plantilla minimalista** que el resto y su contenido fijo de la página del viaje se elimina del código.

## Objetivo
Hoy solo `maraton-santiago-2027` tiene página: `/viajes/[slug]` exige una entrada escrita a mano en `modules/landing/utils/trips.ts`, así que un viaje que el equipo comercial crea y publica en `/crm/viajes` responde 404. Además, la página de Santiago tiene un diseño propio y cargado.

Se busca que **cada carrera publicada en el CRM tenga su propia landing** en `/viajes/<slug>`, con toda su información (fechas, distancias, precios y condiciones, qué incluye y qué no, detalles por confirmar, web oficial y una forma de consultar), en una **plantilla única y minimalista**. Así, publicar una carrera nueva no requiere tocar código ni redesplegar.

## Alcance
- Incluye:
  - (F1) Siete campos nuevos y opcionales en `trips`: web oficial, precio total en cuotas, reserva, precio de acompañante, condiciones de pago, qué no incluye y detalles por confirmar. Incluye la migración `0004` generada en local (revisable, **no** aplicada por Claude), su validación zod, los campos en el formulario del CRM y el contrato `PublicTrip` ampliado.
  - (F2) La plantilla minimalista de `/viajes/[slug]`, alimentada solo por el catálogo publicado, para cualquier viaje publicado (Santiago incluido).
  - (F2) Una consulta por WhatsApp con un mensaje generado a partir del viaje (sirve para cualquier carrera, sin tocar `/contacto`).
- No incluye:
  - Cambios en `/` (portada). Sigue estática con la copia fija de `TRIPS` (`TripFacts`, `PackageSection`, `DestinationsSection`, `MobileCta`, `HeroCarousel`), por los mismos motivos que `landing-public-site.md` F4 (una consulta a Neon por visita a la página más visitada). `TRIPS` queda solo como copia de la portada.
  - Un listado público de carreras (`/viajes`), o enlazar desde la portada carreras distintas de Santiago. Para difundir una carrera nueva se comparte su URL `/viajes/<slug>`.
  - Cambios en `/contacto` o en sus destinos fijos (`DESTINATION_IDS`). La plantilla no enlaza a `/contacto` (ver Requisito 9).
  - Itinerario día a día, hotel, FAQ o testimonios por carrera como campos propios (siguen dentro de `includes`, `paymentTerms` o `notes`).
  - Subida de imágenes: `imageUrl` sigue siendo una URL `https://` externa.
  - Aplicar la migración en Neon, crear o editar viajes en producción, desplegar o cambiar DNS: lo hace el usuario (ver "Precondiciones operativas").
  - `loading.tsx` o `error.tsx` en `app/viajes/`; caché (ISR, KV); dependencias nuevas.

## Requisitos
1. **Campos nuevos del viaje (F1).** Todos opcionales; un viaje existente sigue siendo válido sin rellenarlos:

   | Campo (TS / columna) | Tipo | Regla | Etiqueta en el CRM |
   |---|---|---|---|
   | `officialUrl` / `official_url` | `text` nulo | URL `https://`, ≤ 2048 | Web oficial de la carrera |
   | `installmentsPriceUsd` / `installments_price_usd` | `integer` nulo | entero 0..1,000,000 | Precio total en cuotas (USD) |
   | `depositUsd` / `deposit_usd` | `integer` nulo | entero 0..1,000,000 | Reserva (USD) |
   | `companionPriceUsd` / `companion_price_usd` | `integer` nulo | entero 0..1,000,000 | Precio de acompañante (USD) |
   | `paymentTerms` / `payment_terms` | `text` nulo | 1..1000 caracteres tras recortar; vacío → `null` | Condiciones de pago |
   | `excludes` / `excludes` | `text[]` no nulo, por defecto `{}` | 0..20 elementos de ≤ 160 caracteres, uno por línea (igual que `includes`) | Qué no incluye |
   | `notes` / `notes` | `text` nulo | 1..1000 caracteres tras recortar; vacío → `null` | Detalles por confirmar |

   Restricciones `CHECK` en la base, igual que las existentes: `official_url` nulo o `LIKE 'https://%'`; los tres precios nulos o `>= 0`; `cardinality(excludes) <= 20`.
2. **Contrato público ampliado (F1).** `PublicTrip` y `publicColumns` añaden los siete campos. Siguen sin salir `id`, `status` ni fechas de auditoría.
3. **CRM (F1).** `/crm/viajes/nuevo` y `/crm/viajes/<id>` muestran y guardan los siete campos con las mismas reglas de error, conservación de valores tras un error y accesibilidad (`aria-invalid`, `aria-describedby`) que los campos actuales. Permisos sin cambios (`trips.manage`).
4. **Una landing por carrera publicada (F2).** `/viajes/<slug>` responde `200` para todo viaje publicado y `404` si el slug no es válido, no existe o el viaje está en borrador o archivado. Ya no depende de `TRIPS`: se elimina `getTrip`, y la página no importa ni lee `TRIPS`.
5. **Plantilla minimalista (F2).** Una sola columna centrada (`max-w-2xl`), mucho espacio en blanco, tipografía y tokens del tema actuales (`text-primary`, `border-primary/…`, `highlight` solo como acento), sin degradados superpuestos, sombras decorativas, carruseles ni animaciones. Orden de bloques:
   1. **Cabecera:** línea superior "Ciudad, País · 42K · 21K" (distancias unidas con " · "), `h1` con `title`, `summary` como entradilla. Si hay `imageUrl`, una imagen `aspect-video` redondeada debajo de la entradilla (`next/image` con `unoptimized`, `alt` = "Imagen de <title>"); si no, no se reserva hueco.
   2. **Datos clave** (`<dl>` en 2 columnas desde `sm`): "Carrera" → fecha de la carrera; "Viaje" → rango de fechas o "Fechas por confirmar"; "Distancias"; "Cupos" → "<n> cupos" o "Cupos por confirmar"; "Web oficial" → enlace "Ver web oficial" (nueva pestaña, `noopener noreferrer`), solo si hay `officialUrl`.
   3. **Precio:** "Desde" y el precio grande (`formatTripPrice`, que ya pinta "Precio a consultar" si es `null`). Debajo, solo las líneas que tengan valor: "En cuotas: US$ 1,799 (total)", "Reserva con US$ 300", "Acompañante: US$ 1,300". Si hay `paymentTerms`, sus párrafos (un párrafo por línea no vacía) en texto pequeño.
   4. **Qué incluye** (lista con icono `Check` de `lucide-react`), solo si `includes` no está vacío.
   5. **No incluye** (lista con icono `X`), solo si `excludes` no está vacío.
   6. **Detalles por confirmar** (`<details>` abierto por defecto), solo si hay `notes`; un párrafo por línea no vacía.
   7. **CTA:** botón "Consultar por WhatsApp" (Requisito 9) y debajo el aviso fijo: "Consulta sin compromiso. Los cupos son informativos y no reflejan disponibilidad en tiempo real. No se reciben pagos en la web."

   Ningún bloque deja títulos huérfanos ni textos de relleno cuando su dato falta. Cada bloque con título usa `<section aria-labelledby>`. Se mantienen `SiteHeader` y `SiteFooter`.
6. **Metadatos (F2).** `<title>` = `title` (con el template del layout), `description` = `summary`, y `openGraph.images` = `[imageUrl]` solo si existe. `generateMetadata` y la página comparten una consulta por petición (`cache` de React, como hoy).
7. **Renderizado (F2).** La ruta sigue dinámica (`ƒ`) porque el catálogo llama a `connection()`; `/`, `/contacto` y `/cuenta` siguen estáticas (`○`). Sin `generateStaticParams`. Coste aceptado: al no existir ya el filtro previo de `TRIPS`, un slug bien formado pero inexistente sí consulta Neon (un slug mal formado sigue devolviendo `null` sin consultar, en `getPublishedTripBySlug`).
8. **Errores (F2).** Los errores de la base se propagan sin capturar (página de error por defecto de Next, sin el mensaje en producción), como hoy.
9. **Consulta (F2).** El CTA es un enlace a `wa.me` con `buildWhatsAppUrl(WHATSAPP_NUMBER, buildTripInquiryMessage(...))` (utilidades existentes de `modules/landing/utils/inquiry.ts` + una función nueva), en nueva pestaña. Mensaje:
   ```
   Hola, me interesa el viaje <title> (<fecha de la carrera>, <Ciudad, País>). Quisiera conocer disponibilidad, inclusiones y condiciones finales.
   Entiendo que esta consulta no constituye reserva ni pago.
   ```
   No incluye el precio: así el mensaje no queda desfasado si el equipo lo cambia. Si `buildWhatsAppUrl` devolviera `null`, no se pinta el botón (el número es una constante válida; el caso queda cubierto por el test de la util existente).
   Motivo de no enlazar a `/contacto`: sus destinos son fijos (`DESTINATION_IDS`) y un slug desconocido cae en Santiago; hacerlo genérico obligaría a leer el catálogo en `/contacto` y volverla dinámica, fuera de alcance.

## Criterios de aceptación

### Fase 1 — Campos nuevos en el catálogo
- [ ] (F1) Dado `npm run db:generate` tras el cambio de `lib/db-schema.ts`, entonces se genera `drizzle/0004_*.sql` con solo `ALTER TABLE "trips" ADD COLUMN …` (siete columnas, `excludes` con `DEFAULT '{}' NOT NULL`) y los cinco `ADD CONSTRAINT … CHECK` del Requisito 1; sin `DROP`, sin cambios en otras tablas. No se ejecuta contra ninguna base.
- [ ] (F1) Dado `tripFormSchema`, cuando recibe los siete campos vacíos o ausentes, entonces devuelve `null` en los opcionales y `[]` en `excludes`; cuando recibe `officialUrl` con `http://`, un precio con decimales o negativo, más de 20 líneas en `excludes`, una línea de más de 160 caracteres o más de 1000 caracteres en `paymentTerms`/`notes`, entonces devuelve el error en español del campo correspondiente (unit test).
- [ ] (F1) Dado `listPublishedTrips` / `getPublishedTripBySlug`, entonces seleccionan exactamente las columnas de `PublicTrip` (los siete campos nuevos incluidos, sin `id`, `status` ni fechas de auditoría), y `createTrip`/`updateTrip` guardan los siete campos (unit test).
- [ ] (F1) Dado un `commercial` en `/crm/viajes/<id>`, cuando rellena los campos nuevos y guarda, entonces vuelve a la lista y al reabrir el viaje ve los valores guardados (precios como números, `excludes` uno por línea). Cuando un campo nuevo es inválido, ve el error junto al campo y conserva lo que escribió (unit test de `TripForm` para un campo nuevo).
- [ ] (F1) Dado el README, entonces documenta cómo revisar y aplicar a mano la migración `0004` y que debe aplicarse **antes** de desplegar el código de F1 (si no, las lecturas de `trips` fallan por columnas inexistentes), y lista los campos nuevos en "Lectura pública para la landing".
- [ ] (F1) Dado el diff, entonces solo toca los archivos del plan de F1; no modifica `modules/landing/**`, `app/viajes/**`, otras tablas ni otras specs.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 2 — Plantilla minimalista
Verificación manual con `npm run dev` contra una rama de Neon con la migración `0004` aplicada.
- [ ] (F2) Dado un viaje nuevo creado y publicado en el CRM (p. ej. `maraton-lima-2027`, con solo los campos obligatorios), cuando abro `/viajes/maraton-lima-2027`, entonces responde `200` con cabecera, datos clave ("Fechas por confirmar", "Cupos por confirmar"), "Desde · Precio a consultar" y el CTA, **sin** imagen, sin "Web oficial", sin las líneas de cuotas/reserva/acompañante y sin los bloques "Qué incluye", "No incluye" ni "Detalles por confirmar".
- [ ] (F2) Dado Santiago con los datos de la precondición F2 completados, cuando abro `/viajes/maraton-santiago-2027`, entonces veo todos los bloques del Requisito 5 con esos datos, incluida la imagen y el enlace a la web oficial.
- [ ] (F2) Dado un cambio de cualquier campo en el CRM, cuando recargo la página del viaje, entonces muestra el valor nuevo sin redesplegar. Dado el viaje despublicado o archivado, cuando pido su URL (`curl -sI`), entonces responde `404`; al publicarlo de nuevo, `200`.
- [ ] (F2) Dado el CTA, cuando lo pulso, entonces abre `https://wa.me/51938127170?text=…` en una pestaña nueva con el mensaje del Requisito 9 (unit test de `buildTripInquiryMessage`).
- [ ] (F2) Dado `getCatalogTrip`, entonces: slug no publicado → `null`; viaje publicado → vista con fechas, precios y cupos formateados, líneas opcionales `null` cuando el dato falta y `paymentTerms`/`notes` divididos en párrafos sin líneas vacías; un error de la base se propaga (unit tests, con `@/modules/trips` simulado).
- [ ] (F2) Dado un ancho de 360 px, entonces la página no tiene scroll horizontal y el CTA ocupa todo el ancho.
- [ ] (F2) Dado `app/viajes/[slug]/page.tsx` y `modules/landing/components/TripDetail.tsx`, entonces no importan `TRIPS`, `TripFacts` ni `getTrip`, y `getTrip` ya no existe. `/` se ve igual que antes.
- [ ] (F2) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores, `/viajes/[slug]` es dinámica (`ƒ`) y `/`, `/contacto` y `/cuenta` siguen estáticas (`○`).
- [ ] (F2) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar, en Linux/WSL), entonces el tamaño gzip del Worker se registra en el resumen de la fase; debe ser < 2 MiB (si lo supera, se detiene y se consulta al usuario; límite Free: 3 MiB).
- [ ] (F2) Dado el README, entonces "Qué usa hoy la landing" describe la plantilla única (todo sale del catálogo; `TRIPS` solo alimenta `/`) y la consulta por WhatsApp.
- [ ] (F2) Dado el diff, entonces solo toca los archivos del plan de F2; no modifica `modules/trips/**`, `lib/**`, `drizzle/`, `app/crm/**`, `app/page.tsx`, `/contacto` ni otras specs, y no añade dependencias.
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

## Diseño técnico

### Fase 1 — `trips`
- **`lib/db-schema.ts`** (modificar): en `trips`, columnas `officialUrl: text("official_url")`, `installmentsPriceUsd: integer("installments_price_usd")`, `depositUsd: integer("deposit_usd")`, `companionPriceUsd: integer("companion_price_usd")`, `paymentTerms: text("payment_terms")`, `excludes: text("excludes").array().notNull().default([])`, `notes: text("notes")`; `check`s `trips_official_url_chk`, `trips_installments_price_usd_chk`, `trips_deposit_usd_chk`, `trips_companion_price_usd_chk`, `trips_excludes_chk`, con la misma forma que los existentes.
- **Migración** (generada con `npm run db:generate`, nunca escrita a mano): `drizzle/0004_<nombre>.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json`. Aditiva: los viajes existentes quedan con `null`/`{}`; bookings y leads (que referencian `trips.id`) no cambian.
- **`modules/trips/schemas/trips.schema.ts`** (modificar): en `tripFormSchema`, reutilizando los helpers existentes:
  - `officialUrl`: `blankToNull` con la misma URL `https` que `imageUrl` (extraer un helper local `httpsUrl(message)` y usarlo en ambos; mensaje "Indica una URL que empiece por https://.").
  - `installmentsPriceUsd`, `depositUsd`, `companionPriceUsd`: `blankToNull(wholeNumber(PRICE_MESSAGE).pipe(z.number().int().max(1_000_000, …)))`, igual que `priceUsd` (extraer `usdAmount()` local para no repetirlo cuatro veces).
  - `paymentTerms`, `notes`: `blankToNull(z.string().max(1000, "Puede tener hasta 1000 caracteres."))`.
  - `excludes`: `textList(/\r?\n/)` con las mismas reglas que `includes` (extraer `lineList()` local).
  - `updateTripSchema` lo hereda con `safeExtend`.
- **`modules/trips/types/trips.types.ts`** (modificar): `PublicTrip` añade `officialUrl: string | null`, `installmentsPriceUsd: number | null`, `depositUsd: number | null`, `companionPriceUsd: number | null`, `paymentTerms: string | null`, `excludes: string[]`, `notes: string | null`. `TripInput` y `Trip` se actualizan solos (inferidos).
- **`modules/trips/services/trips.service.ts`** (modificar): `publicColumns` y `editableColumns` añaden los siete campos (el `satisfies Record<keyof PublicTrip, unknown>` obliga a mantenerlos sincronizados).
- **`modules/trips/components/TripForm.tsx`** (modificar): siete entradas nuevas en `FIELDS`, en este orden tras `priceUsd`: `installmentsPriceUsd`, `depositUsd`, `companionPriceUsd`, `paymentTerms` (textarea, 3 filas, `maxLength` 1000), y tras `includes`: `excludes` (textarea, 4 filas, pista "Un elemento por línea, hasta 20 elementos."), `notes` (textarea, 3 filas, `maxLength` 1000, pista "Lo que aún falta confirmar del viaje."); `officialUrl` (url, `maxLength` 2048) junto a `imageUrl`, a ancho completo. El `join` de arrays usa `"\n"` también para `excludes` (hoy solo para `includes`).
- **`README.md`** (modificar): migración `0004` (cómo revisarla y aplicarla a mano en Neon, antes del despliegue) y campos nuevos en "Lectura pública para la landing".

### Fase 2 — `landing`
- **Ruta `app/viajes/[slug]/page.tsx`** (modificar): igual que hoy (`getCatalogTrip`, `notFound()`, `SiteHeader`/`SiteFooter`), más `openGraph.images` en `generateMetadata` cuando hay imagen.
- **`modules/landing/utils/catalogTrip.ts`** (reescribir): `getCatalogTrip = cache(async (slug) => TripLanding | null)`. Llama a `getPublishedTripBySlug` y transforma `PublicTrip` en la vista que pinta la plantilla, sin consultar `TRIPS`:
  ```ts
  export type TripLanding = {
    slug: string;
    title: string;
    summary: string;
    location: string;            // "Santiago, Chile"
    distances: string[];
    imageUrl: string | null;
    raceDate: string;            // formatTripDate
    travelDates: string | null;  // formatTripDateRange o null
    capacity: string;            // "100 cupos" | "Cupos por confirmar"
    officialUrl: string | null;
    price: string;               // formatTripPrice (incluye "Precio a consultar")
    installmentsPrice: string | null; // formatTripPrice o null si no hay dato
    deposit: string | null;
    companionPrice: string | null;
    paymentTerms: string[];      // párrafos: líneas recortadas no vacías
    includes: string[];
    excludes: string[];
    notes: string[];
  };
  ```
  Imports desde `@/modules/trips`: `getPublishedTripBySlug`, `formatTripDate`, `formatTripDateRange`, `formatTripPrice`, `type PublicTrip`.
- **`modules/landing/utils/trips.ts`** (modificar): elimina `getTrip`, el tipo `Trip` y los campos de `TripContent` que dejan de tener consumidor (los que solo usaba `TripDetail`: `included`, `excluded`, `pendingDetails`, `prices.companion`, `prices.companionNote`, `prices.paymentNote` y `destinationId` si nada más lo usa; se verifica con búsqueda). Lo que usan `TripFacts`, `PackageSection` y `DestinationsSection` en `/` no cambia, y los textos de `/` tampoco.
- **`modules/landing/utils/inquiry.ts`** (modificar): `buildTripInquiryMessage({ title, raceDate, location }): string` con el texto del Requisito 9.
- **`modules/landing/components/TripDetail.tsx`** (reescribir): Server Component, `({ trip }: { trip: TripLanding })`, según el Requisito 5. Usa `buttonVariants` (shadcn instalado), `cn`, `next/image` (`unoptimized`, `fill`, `sizes="(min-width: 672px) 672px, 100vw"`) e iconos `Check`, `X`, `ArrowUpRight` de `lucide-react`. No usa `TripFacts`.
- **`modules/landing/index.ts`** (modificar): deja de exportar `type Trip`; exporta `type TripLanding` solo si la ruta lo necesita (no lo necesita: no se exporta).
- Sin API HTTP nueva, sin componentes shadcn nuevos, sin `"use client"` (el `<details>` es nativo).

## Reutilización
- `getPublishedTripBySlug`, `formatTripDate`, `formatTripDateRange`, `formatTripPrice` y `PublicTrip` de `@/modules/trips` (contrato existente).
- `cache` de React en `getCatalogTrip` (patrón actual).
- `buildWhatsAppUrl` y `WHATSAPP_NUMBER` de `modules/landing/utils/inquiry.ts`.
- `buttonVariants` (`components/ui/button.tsx`), `cn`, `SiteHeader`, `SiteFooter`, el patrón `<details>` de la página actual.
- En el CRM: `Input`, `Textarea`, `Label` ya usados por `TripForm`, y los helpers `blankToNull`, `textList`, `wholeNumber` del schema.

## Tests
- **F1** `modules/trips/schemas/trips.schema.test.ts`: campos nuevos vacíos/ausentes → `null`/`[]`; valores válidos; `http://` rechazado; precio decimal o negativo rechazado; `excludes` > 20 elementos o línea > 160 rechazado; `paymentTerms`/`notes` > 1000 rechazado; `updateTripSchema` acepta los campos nuevos.
- **F1** `modules/trips/services/trips.service.test.ts`: columnas seleccionadas en lecturas públicas (incluyen las nuevas, excluyen las internas); `createTrip`/`updateTrip` envían los siete campos.
- **F1** `modules/trips/components/TripForm.test.tsx`: los campos nuevos se pintan con los valores del viaje (`excludes` uno por línea) y un error de campo nuevo se muestra y conserva el valor.
- **F2** `modules/landing/utils/catalogTrip.test.ts` (reescribir): no publicado → `null`; publicado completo → vista formateada; publicado mínimo → opcionales `null`/`[]`, "Fechas por confirmar" no es responsabilidad de la util (`travelDates: null`), "Cupos por confirmar"; párrafos sin líneas vacías; error de la base propagado.
- **F2** `modules/landing/utils/inquiry.test.ts`: `buildTripInquiryMessage` produce el texto exacto del Requisito 9.
- `TripDetail` y la página son presentacionales / async Server Components: sin unit test (verificación manual de los criterios F2).

## Plan de tareas
### Fase 1 — Campos nuevos en el catálogo (`trips`)
- [ ] T1 — Columnas y checks en `trips`; generar la migración en local · archivos: `lib/db-schema.ts`, `drizzle/0004_*.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` · depende de: — · secuencial (base)
- [ ] T2 — Schema zod y tipos con tests · archivos: `modules/trips/schemas/trips.schema.ts`, `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/types/trips.types.ts` · depende de: T1 · secuencial
- [ ] T3 — Service: columnas públicas y editables, con tests · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: T2 · paralelo con T4
- [ ] T4 — Formulario del CRM con tests · archivos: `modules/trips/components/TripForm.tsx`, `modules/trips/components/TripForm.test.tsx` · depende de: T2 · paralelo con T3
- [ ] T5 — README (migración `0004` y contrato) · archivos: `README.md` · depende de: T3 · secuencial

### Fase 2 — Plantilla minimalista (`landing`)
Empieza solo con la Fase 1 en `main` y la precondición operativa F1 cumplida.
- [ ] T1 — Vista del viaje desde el catálogo y limpieza de `TRIPS` · archivos: `modules/landing/utils/catalogTrip.ts`, `modules/landing/utils/catalogTrip.test.ts`, `modules/landing/utils/trips.ts`, `modules/landing/index.ts` · depende de: — · secuencial (base)
- [ ] T2 — Mensaje de consulta por viaje · archivos: `modules/landing/utils/inquiry.ts`, `modules/landing/utils/inquiry.test.ts` · depende de: — · paralelo con T1
- [ ] T3 — Plantilla `TripDetail` minimalista · archivos: `modules/landing/components/TripDetail.tsx` · depende de: T1, T2 · secuencial
- [ ] T4 — Ruta y metadatos · archivos: `app/viajes/[slug]/page.tsx` · depende de: T1 · paralelo con T3
- [ ] T5 — README ("Qué usa hoy la landing") y medición del Worker · archivos: `README.md` · depende de: T3, T4 · secuencial

## Precondiciones operativas (las realiza el usuario)
- **F1, antes de desplegar su código:** revisar `drizzle/0004_*.sql` y aplicarlo a mano en Neon `production` (y en la rama de pruebas que se use). Si el código de F1 llega a producción sin la migración, `/viajes/*` y `/crm/viajes` fallan al leer columnas inexistentes.
- **F2, antes de mergear:** completar Santiago en `/crm/viajes/<id>` para no perder información respecto a la página actual: web oficial `https://maratondesantiago.cl/`; precio total en cuotas 1799; reserva 300; acompañante 1300; condiciones de pago, qué no incluye y detalles por confirmar con los textos actuales de `modules/landing/utils/trips.ts`; `includes` con los incluidos actuales; e `imageUrl` con una URL `https://` de la portada (p. ej. `https://carreras-viajeras.mentec.dev/images/cover-santiago.webp`).

## Preguntas abiertas
1. ¿Los textos de "Qué incluye" de Santiago se cargan como "Título: texto" en una sola línea (p. ej. "Vuelos ida y vuelta: Lima → Santiago → Lima") o solo con el título? La plantilla los pinta tal cual; es una decisión de contenido del equipo, no bloquea la implementación.
