# Entrada al registro desde la ficha de la carrera y visitas por campaña

- Módulo: landing (también `crm`)
- Estado: borrador
- Base: rama `claude/peaceful-lovelace-tvyqt8` sobre `main` (`4b4650f`). Migraciones hasta `drizzle/0012_reward_operations.sql`.
- Enmienda a specs aprobadas, que **no se editan**: `landing-omnichannel-capture.md` (Requisito 8, sus tres preguntas abiertas y dos criterios de F4) y `landing-race-pages.md` (Requisito 9: el CTA de `/viajes/[slug]` ya no es solo WhatsApp). Si esta spec se aprueba, sus reglas prevalecen sobre esas partes.
- Decisiones del usuario (2026-10-29), respuestas a las preguntas abiertas de `landing-omnichannel-capture.md`:
  1. **Base de tratamiento:** "basta con la confirmación por el usuario". Se mantiene la casilla obligatoria de aceptación tal como está implementada (`consent: "on"`). No hay cambio de código; el texto definitivo sigue pendiente de la puerta P-L.
  2. **Entradas al registro:** "sí, añadir" un botón «Registrarme» en la ficha de la carrera.
  3. **Visitas por campaña:** "sumar visitas". Se miden en la app.
- Depende de: `landing-omnichannel-capture.md` (aprobada, F1–F4 implementadas: `campaigns`, `/viajes/[slug]/registro`, `/crm/campanas`), `landing-race-pages.md` (aprobada: `TripDetail`), `platform-neon-foundation.md` (aprobada: Drizzle `neon-http`, una sentencia por escritura, migraciones manuales).

## Objetivo

Hoy la ficha pública de una carrera (`/viajes/<slug>`) solo ofrece WhatsApp, y el registro solo se alcanza con un QR o un enlace de campaña. Además, en `/crm/campanas` el equipo ve cuántos registros trajo cada campaña, pero no cuántas personas la abrieron, así que no puede comparar un stand con una publicación ni saber si un QR funciona pero el formulario no convierte.

Esta spec añade el botón «Registrarme» en la ficha y un contador de visitas por campaña, con la tasa de conversión (registros / visitas), para el equipo comercial.

## Alcance

- Incluye:
  - Botón «Registrarme» en `/viajes/<slug>` hacia `/viajes/<slug>/registro`, conservando los parámetros de atribución.
  - Tabla de visitas diarias por campaña, su migración y su sección en el README.
  - Registro de una visita al abrir `/viajes/<slug>/registro?c=<código>` en un navegador, fuera del modo stand.
  - Columnas "Visitas" y "Conversión" en `/crm/campanas` y los mismos datos en `/crm/campanas/<id>`.
  - Actualización de la regla WAF documentada y de la guía de campañas del README.
- No incluye:
  - Cambiar los CTA de la portada (`MobileCta`, `HeroCarousel`, cabecera): ya llevan a `/contacto`, que tiene el mismo formulario. Queda para `public-official-site-content`.
  - Visitantes únicos, cookies, identificadores del navegador, IP o cualquier dato de la persona que visita.
  - Visitas sin campaña, visitas a `/contacto` o a `/viajes/<slug>?c=…`, visitas por UTM y analítica externa (Cloudflare Web Analytics, Analytics Engine, Google Analytics).
  - Desglose diario en el CRM (se guarda por día para poder hacerlo después; ver Preguntas abiertas).
  - Cambios en el texto legal, en `createWebLead`, en el outbox o en la API de n8n.

## Requisitos

1. **«Registrarme» en la ficha (F2).** `TripDetail` muestra un enlace con aspecto de botón «Registrarme» (`buttonVariants({ size: "lg" })`, ancho completo, mismos tokens que el botón actual) en dos lugares: justo después del bloque de precio y en el bloque final, encima de «Consultar por WhatsApp», que pasa a la variante `outline`.
   - Destino: `/viajes/<slug>/registro`, con los parámetros que devuelve `attributionParams` de la URL actual (`c`, `utm_source`, `utm_medium`, `utm_campaign`, `ref`) codificados con `URLSearchParams`. Sin parámetros, sin `?`.
   - Solo aparece si `isRegistrationOpen()` es `true`. Con el texto legal provisional en producción (puerta P-L) no se muestra y la ficha queda como hoy, con WhatsApp en su variante actual.
   - Es un enlace `<a>` normal, no `next/link`: no se precarga.
2. **Qué es una visita (F1, F2).** Una apertura de `/viajes/<slug>/registro` en un navegador con JavaScript, con `?c=` de una campaña **activa** de **esa misma carrera**, publicada, y **sin** `?modo=stand`. No cuentan: el modo stand (la tableta del equipo), las previsualizaciones de enlaces (WhatsApp, redes) ni los robots sin JavaScript, la precarga, `/contacto`, `/viajes/<slug>?c=…`, las campañas cerradas, inexistentes o de otra carrera. Cada apertura cuenta una vez, aunque sea la misma persona (recargar suma); el número es indicativo.
3. **Registro de la visita (F1, F2).** Al montarse la página (fuera del modo stand y con `c` presente), un componente cliente envía una sola petición `POST /api/campaign-visits` con `{ slug, c }`, `keepalive: true` y sin credenciales personales. No se repite en el mismo montaje (incluido el doble efecto de React en desarrollo). Un fallo de red se ignora sin avisar a la persona ni reintentar.
4. **Endpoint (F1).** `POST /api/campaign-visits`, público, sin sesión y fuera del matcher de Clerk:
   - Rechaza con `403` (cuerpo vacío) si la cabecera `Origin` no es exactamente `APP_ORIGIN`.
   - Rechaza con `413` un cuerpo de más de 1 KiB y con `204` sin escribir nada un JSON inválido, otras claves o valores que no cumplan el schema (`slug` con el formato de `trips_slug_format_chk`, `c` normalizado con `normalizeCampaignCode`).
   - Con datos válidos llama a `recordCampaignVisit` y responde `204` tanto si la campaña aplica como si no: la respuesta no revela si un código existe.
   - Si el service lanza, registra el texto fijo `"campaign visit: record failed"` sin causa ni datos y responde `204`.
   - Siempre con `Cache-Control: no-store`.
5. **Datos (F1).** Tabla `campaign_visit_days`: `campaign_id` (FK a `campaigns`, `ON DELETE restrict`), `day` (`date`, día de Lima) y `visits` (`integer`, `CHECK visits > 0`), con clave primaria `(campaign_id, day)`. Cada visita es **una sola sentencia**: `INSERT … SELECT` de la campaña activa cuyo viaje tiene ese `slug` y está publicado, `ON CONFLICT (campaign_id, day) DO UPDATE SET visits = campaign_visit_days.visits + 1`. Si no hay campaña que cumpla, no escribe nada. No guarda IP, agente de usuario, UTM ni nada de la persona.
6. **CRM (F2).** Con el permiso actual de `/crm/campanas` (`leads.manage`):
   - `listCampaigns` y `getCampaignById` devuelven además `visitCount` (suma de `visits`, 0 sin filas), en la misma consulta única.
   - `/crm/campanas`: columnas "Visitas" y "Conversión" después de "Registros"; el pie de la tabla pasa de "Cuenta registros, no visitas." a "Visitas: aperturas del enlace o del QR en un navegador, sin el modo stand. Conversión: registros ÷ visitas.".
   - `/crm/campanas/<id>`: "Registros (no visitas)" pasa a "Registros", y se añaden "Visitas" y "Conversión".
   - Conversión: `formatConversion(leadCount, visitCount)` → `"—"` con 0 visitas; si no, el porcentaje redondeado a entero con `Intl.NumberFormat("es-PE", { style: "percent" })`. Puede superar el 100 % (registros desde el modo stand o anteriores a esta spec); se muestra tal cual.
   - Las visitas se cuentan desde que se despliega esta spec: no hay histórico anterior.
7. **Privacidad y seguridad.** El endpoint no lee cookies ni sesión, no usa `auth()` y no escribe en logs nada de la petición. El modo stand sigue sin `localStorage`, `sessionStorage` ni cookies propias, y esta spec tampoco los usa fuera de él. El contador puede inflarse con peticiones manuales: se acepta como dato indicativo, con el control de `Origin` y la regla WAF del README como mitigación.

## Criterios de aceptación

### Fase 1: datos y endpoint
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera solo una migración nueva (hoy `drizzle/0013_*.sql`; el número definitivo se fija en el turno de merge), con su snapshot y el journal, que solo crea `campaign_visit_days` con su PK, FK y CHECK. El SQL no contiene `neon_auth`, `CREATE SCHEMA`, `DROP` ni `ALTER` de otras tablas.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dada la migración aplicada en un solo bloque después de la `0012`, entonces la base acepta una fila con `visits = 1` y rechaza `visits = 0`, una segunda fila con la misma campaña y día, y una campaña inexistente.
- [ ] (F1) Dado `recordCampaignVisit` con la base simulada, entonces ejecuta una sola sentencia, que solo inserta para una campaña `active` de un viaje `published` con ese `slug`, usa el día de `America/Lima` e incrementa con `ON CONFLICT` (unit test).
- [ ] (F1) Dado `campaignVisitSchema`, entonces acepta `{ slug: "maraton-santiago-2027", c: " MML26 " }` → `c: "mml26"`; rechaza un slug con mayúsculas, de 2 u 81 caracteres o con `--`, un `c` inválido o ausente y cualquier clave extra (unit test).
- [ ] (F1) Dado el Route Handler llamado directamente (unit test, service simulado): sin `Origin` o con otro origen → `403` sin llamar al service; cuerpo > 1 KiB → `413`; JSON inválido o schema inválido → `204` sin llamar al service; datos válidos → `204` y una llamada con `{ slug, c }` normalizados; service que lanza → `204` y un único `console.error("campaign visit: record failed")`; todas las respuestas con `Cache-Control: no-store`.
- [ ] (F1) Dado el README, entonces la sección "Migración de visitas por campaña" explica revisar el SQL, aplicarlo en un solo bloque después de la `0012`, sin GRANT, y las pruebas manuales del criterio anterior.
- [ ] (F1) `npm run lint`, `npm test -- --run --maxWorkers=3`, `next typegen` + `tsc --noEmit` y `npm run build:worker` sin errores. Worker medido.

### Fase 2: ficha, contador y CRM
- [ ] (F2) Dado `/viajes/maraton-santiago-2027?c=mml26&utm_source=instagram` con el registro abierto, entonces veo dos «Registrarme» que llevan a `/viajes/maraton-santiago-2027/registro?c=mml26&utm_source=instagram`; sin parámetros, a `/viajes/maraton-santiago-2027/registro`, sin `?`. «Consultar por WhatsApp» sigue presente, en variante `outline`.
- [ ] (F2) Dado `npm run build` + producción local con el marcador P-L, entonces `/viajes/<slug>` no muestra «Registrarme» y su botón de WhatsApp es el de hoy.
- [ ] (F2) Dado `registrationHref("maraton-santiago-2027", { c: "mml26", ref: "club lima" })`, entonces devuelve `/viajes/maraton-santiago-2027/registro?c=mml26&ref=club+lima`; con `{}`, sin `?` (unit test).
- [ ] (F2) Dada una campaña activa `mml26` de Santiago, cuando abro su enlace público en el navegador, entonces la pestaña Red muestra un único `POST /api/campaign-visits` con respuesta `204`, y en `/crm/campanas` la campaña pasa a 1 visita. Con `&modo=stand`, ninguna petición y ningún cambio.
- [ ] (F2) Dado `CampaignVisitBeacon` montado en desarrollo (Strict Mode), entonces llama a `fetch` una sola vez con `POST`, `keepalive: true`, `Content-Type: application/json` y el cuerpo `{ slug, c }`; un `fetch` rechazado no lanza ni muestra nada (unit test).
- [ ] (F2) Dados un `?c=` de una campaña cerrada, uno inexistente y uno de otra carrera, entonces la página hace la petición, responde `204` y no cambia ningún contador.
- [ ] (F2) Dado `formatConversion`, entonces `(0, 0)` → `"—"`, `(3, 0)` → `"—"`, `(1, 3)` → `"33 %"` (con el separador de `es-PE`), `(5, 4)` → `"125 %"` (unit test).
- [ ] (F2) Dado `/crm/campanas` y `/crm/campanas/<id>`, entonces veo "Registros", "Visitas" y "Conversión" con los valores de la base y el nuevo pie de tabla; `listCampaigns` y `getCampaignById` siguen siendo una sola consulta y devuelven `visitCount` (unit test).
- [ ] (F2) Dado el README, entonces la guía de campañas explica qué cuenta como visita, que es indicativa y que empieza a contar con el despliegue; menciona «Registrarme» en la ficha y su dependencia de P-L; y la regla WAF documenta también `POST /api/campaign-visits` con su umbral.
- [ ] (F2) Lint, tests, typegen + `tsc` y `build:worker` sin errores. Worker medido.

## Diseño técnico

### Decisiones
1. **Contador en Neon, no analítica externa.** Es lo único que se puede cruzar con los registros por campaña sin otra cuenta, otro script de terceros ni otro aviso de privacidad. Una fila por campaña y día mantiene la tabla pequeña y permite un desglose diario futuro.
2. **Visita contada desde el cliente, no al renderizar.** Contar en el Server Component sumaría las previsualizaciones de WhatsApp y redes (que descargan la URL al compartir un enlace de campaña), los robots y las precargas. Un `fetch` tras el montaje solo ocurre en un navegador real.
3. **Route Handler propio, no Server Action.** Un Server Action haría `POST` a `/viajes/*/registro` y gastaría el límite de la regla WAF de los formularios (10 por 10 s por IP), que en una feria con muchos móviles tras la misma IP podría bloquear también los envíos. Una ruta aparte tiene su propia regla. Al no ser Server Action, el control de origen es explícito (`Origin === APP_ORIGIN`).
4. **Respuesta `204` uniforme.** El endpoint no distingue "contado" de "ignorado", para no servir como oráculo de códigos de campaña.
5. **Sin visitantes únicos.** Exigiría una cookie o un identificador del navegador, que esta spec evita (datos personales y aviso legal). El número se presenta como aperturas.
6. **«Registrarme» oculto con P-L.** Mientras el registro está cerrado en producción, un botón que lleva a "El registro en línea abrirá pronto" solo añadiría un paso antes de WhatsApp.
7. **Módulos.** El contador es atribución de campañas: service, schema y tipos en `modules/crm`; el Route Handler en `app/api/` compone. El componente cliente vive en `landing` y solo conoce la URL del endpoint: `landing` no importa `crm`.

### Base de datos: `lib/db-schema.ts` → `drizzle/0013_*.sql`

```ts
export const campaignVisitDays = pgTable(
  "campaign_visit_days",
  {
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "restrict" }),
    day: date("day").notNull(),
    visits: integer("visits").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.day] }),
    check("campaign_visit_days_visits_chk", sql`${table.visits} > 0`),
  ],
);
```

Sin `ADD VALUE`: un solo bloque. No hace falta índice extra: la PK empieza por `campaign_id`, que es por lo que se agrupa.

### `modules/crm/` (F1, F2)

- `schemas/campaigns.schema.ts`: `campaignVisitSchema = z.strictObject({ slug, c })`, con `slug` = el regex y longitud de `trips_slug_format_chk` y `c` = `campaignCodeSchema` (el que ya usa `normalizeCampaignCode`).
- `services/campaigns.service.ts`:
  - `recordCampaignVisit({ slug, c }): Promise<void>`, una sentencia:
    ```sql
    INSERT INTO campaign_visit_days (campaign_id, day, visits)
    SELECT c.id, (now() AT TIME ZONE 'America/Lima')::date, 1
    FROM campaigns c JOIN trips t ON t.id = c.trip_id
    WHERE c.code = $c AND c.status = 'active' AND t.slug = $slug AND t.status = 'published'
    ON CONFLICT (campaign_id, day) DO UPDATE SET visits = campaign_visit_days.visits + 1
    ```
  - `visitCountsSubquery` (como `leadCountsSubquery`: `sum(visits)` por campaña) unido con `LEFT JOIN` en `listColumns`; `visitCount: coalesce(…, 0)`.
- `types/campaigns.types.ts`: `visitCount: number` en `CampaignListItem` (y por tanto en `CampaignDetail`); `CampaignVisitInput`.
- `utils/campaignDisplay.ts`: `formatConversion(leadCount, visitCount): string`.
- `components/CampaignTable.tsx`: columnas y pie (Requisito 6).
- `index.ts`: exporta `recordCampaignVisit` y `campaignVisitSchema`.

### Route Handler: `app/api/campaign-visits/route.ts` (F1, nuevo)

```ts
// POST { slug: string; c: string } → 204 | 403 | 413, sin cuerpo, Cache-Control: no-store
export async function POST(request: Request): Promise<Response>
```

Orden: `Origin` → tamaño (`content-length` y longitud real del texto leído, ≤ 1024) → `JSON.parse` → `campaignVisitSchema.safeParse` → `recordCampaignVisit`. Sin `auth()`: no se añade al matcher de `middleware.ts`.

### `modules/landing/` y `app/` (F2)

- `utils/inquiry.ts`: `registrationHref(slug, params: LeadAttributionParams): string`.
- `components/CampaignVisitBeacon.tsx` (nuevo, `"use client"`): props `{ slug, code }`; `useEffect` con un `useRef` de guarda; `fetch("/api/campaign-visits", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body })` y `.catch(() => {})`. No renderiza nada.
- `components/RaceRegistrationSection.tsx`: monta `<CampaignVisitBeacon slug={trip.slug} code={attribution.c} />` solo si `!standMode && attribution.c`.
- `components/TripDetail.tsx`: prop nueva `registrationHref: string | null` (null → sin botón); los dos «Registrarme» y WhatsApp en `outline` cuando hay botón.
- `app/viajes/[slug]/page.tsx`: calcula `isRegistrationOpen() ? registrationHref(slug, attributionParams(query)) : null` y lo pasa a `TripDetail`.
- `index.ts`: exporta `registrationHref`.
- `app/crm/(protected)/campanas/[id]/page.tsx`: filas "Registros", "Visitas" y "Conversión".

## Reutilización

- `attributionParams`, `firstParam` (`modules/landing/utils/inquiry.ts`), `isRegistrationOpen` (`lib/registrationConsent.ts`), `buttonVariants` (`components/ui/button`).
- `campaignCodeSchema`/`normalizeCampaignCode` (`modules/crm/utils/leadAttribution.ts`), el patrón `leadCountsSubquery` de `campaigns.service.ts`, la tabla shadcn (instalada) de `CampaignTable`.
- `getEnv().APP_ORIGIN` (`lib/env.ts`). Ningún paquete nuevo ni componente shadcn nuevo.

## Tests

- `campaigns.schema.test.ts`: `campaignVisitSchema` (Fase 1).
- `campaigns.service.test.ts`: `recordCampaignVisit` (una sentencia, condiciones, zona horaria, `ON CONFLICT`) y `visitCount` en lista y detalle.
- `app/api/campaign-visits/route.test.ts`: los casos del Route Handler.
- `inquiry.test.ts`: `registrationHref`.
- `CampaignVisitBeacon.test.tsx`: una llamada en Strict Mode, opciones de `fetch`, error silencioso.
- `campaignDisplay.test.ts`: `formatConversion`.
- Funcional (sin unit test de Async Server Components): los dos «Registrarme», su ocultación con P-L, la petición en la pestaña Red, el modo stand y los contadores del CRM en una instancia Clerk y una rama Neon de desarrollo.

## Plan de tareas

### Fase 1: datos y endpoint (4 tareas, 13 archivos: 2 generados por drizzle-kit)
- [ ] T1 — Tabla `campaign_visit_days`; `npm run db:generate` y revisión del SQL · archivos: `lib/db-schema.ts`, `drizzle/0013_*.sql` (generado), `drizzle/meta/0013_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [ ] T2 — `campaignVisitSchema`, `recordCampaignVisit`, `visitCount` y tipos, con tests; export en la API pública · archivos: `modules/crm/schemas/campaigns.schema.ts`, `modules/crm/schemas/campaigns.schema.test.ts`, `modules/crm/services/campaigns.service.ts`, `modules/crm/services/campaigns.service.test.ts`, `modules/crm/types/campaigns.types.ts`, `modules/crm/index.ts` · depende de: T1 · secuencial (`index.ts`)
- [ ] T3 — Route Handler `POST /api/campaign-visits`, con tests · archivos: `app/api/campaign-visits/route.ts`, `app/api/campaign-visits/route.test.ts` · depende de: T2 · paralelo (con T4)
- [ ] T4 — README: "Migración de visitas por campaña" · archivos: `README.md` · depende de: T1 · paralelo (con T3)

### Fase 2: ficha, contador y CRM (5 tareas, 13 archivos)
- [ ] T1 — `registrationHref` y `CampaignVisitBeacon`, con tests; export en la API pública · archivos: `modules/landing/utils/inquiry.ts`, `modules/landing/utils/inquiry.test.ts`, `modules/landing/components/CampaignVisitBeacon.tsx`, `modules/landing/components/CampaignVisitBeacon.test.tsx`, `modules/landing/index.ts` · depende de: Fase 1 · secuencial (`index.ts`)
- [ ] T2 — Contador en el registro y «Registrarme» en la ficha · archivos: `modules/landing/components/RaceRegistrationSection.tsx`, `modules/landing/components/TripDetail.tsx`, `app/viajes/[slug]/page.tsx` · depende de: T1 · paralelo (con T3)
- [ ] T3 — `formatConversion` y columnas/filas del CRM, con tests · archivos: `modules/crm/utils/campaignDisplay.ts`, `modules/crm/utils/campaignDisplay.test.ts`, `modules/crm/components/CampaignTable.tsx`, `app/crm/(protected)/campanas/[id]/page.tsx` · depende de: Fase 1 · paralelo (con T2)
- [ ] T4 — README: guía de campañas (visitas, «Registrarme», P-L) y regla WAF para `POST /api/campaign-visits` · archivos: `README.md` · depende de: T2, T3 · secuencial
- [ ] T5 — Verificación funcional (ficha con y sin P-L, petición en Red, modo stand, contadores del CRM) y medición del Worker · archivos: — · depende de: T4 · secuencial

## Preguntas abiertas
1. **Desglose diario.** Los datos se guardan por día. ¿Quieres ya en `/crm/campanas/<id>` una lista de visitas por día (útil para comparar los días de una feria), o basta el total por ahora?
2. **Umbral WAF de `POST /api/campaign-visits`.** Propuesta: 30 peticiones por 10 segundos por IP, bloqueo de 10 segundos. Un bloqueo solo pierde visitas, nunca registros. ¿Te parece?
