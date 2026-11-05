# Costos de Google Cloud para landing + CRM pequeño (Perú), vigentes al 2026-11-05

> Método y advertencias generales (léase antes de usar las cifras)
>
> - Todas las cifras en USD, precios de lista "Default"/on-demand, sin impuestos (IGV u otros no incluidos). Los precios mensuales de Compute Engine que publica Google usan 730 horas/mes (verificado: $0.011978292/h × 730 = $8.74415316).
> - Las páginas de precios `cloud.google.com/*/pricing` se descargaron directamente el **2026-11-05** y se leyeron las tablas por región incrustadas en el HTML (no el texto renderizado por un resumidor). **Ninguna de esas páginas muestra una fecha "Last updated"** en el HTML descargado (son páginas de marketing dinámicas; solo incrustan la fecha de renderizado del servidor `[2026,11,5]`, que no es una fecha editorial). Por eso cada cifra lleva "consultado 2026-11-05; sin fecha 'Last updated' visible".
> - Las páginas de documentación que sí muestran "Last updated" (`docs.cloud.google.com/free/docs/free-cloud-features`, `firebase.google.com/pricing`, `firebase.google.com/docs/app-hosting/costs`) y la API del BCRP **estaban bloqueadas por el proxy de red de esta sesión** (403 / ENOTFOUND). Lo que se cita de ellas proviene de fragmentos de búsqueda de esos dominios oficiales y se marca como **"no verificado directamente"**. Para verificarlo hay que permitir `docs.cloud.google.com`, `firebase.google.com` y `estadisticas.bcrp.gob.pe` en la red de la sesión.
> - "Hecho oficial" = cifra leída en la página oficial. "Estimación" = cálculo propio a partir de esas cifras (sección *Inferences*).
> - Contexto del repo: la app actual (Carreras Viajeras) está diseñada para Cloudflare Workers + Neon PostgreSQL + Clerk (según `CLAUDE.md`/`AGENTS.md`). Estas notas solo cubren costos de Google Cloud como alternativa comparativa.

## 1. Compute Engine: precio de VMs pequeñas (e2-micro, e2-small, e2-medium y otras formas pequeñas) en Santiago, São Paulo y Iowa

### Takeaway
Santiago (southamerica-west1), la región GCP más cercana a Perú, cobra ~43 % más que us-central1 y ~10 % menos que São Paulo: e2-micro $8.74/mes, e2-small $17.49/mes, e2-medium $34.98/mes on-demand. Las formas "nuevas" de 1 vCPU (c4a, t2d, n4a) cuestan $28–47/mes, por lo que E2 de núcleo compartido sigue siendo la opción más barata para un VPS pequeño.

### Cited Findings
- **Santiago (southamerica-west1), on-demand**: e2-micro (2 vCPU, 1 GiB) $0.011978292/h = **$8.74415316/mes**; e2-small (2 vCPU, 2 GiB) $0.023956583/h = **$17.48830559/mes**; e2-medium (2 vCPU, 4 GiB) $0.047913166/h = **$34.97661118/mes** (consultado 2026-11-05; sin fecha "Last updated" visible) — [VM pricing, General-purpose, E2](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types)
- **São Paulo (southamerica-east1), on-demand**: e2-micro $0.0132963/h = **$9.706299/mes**; e2-small $0.0265926/h = **$19.412598/mes**; e2-medium $0.0531852/h = **$38.825196/mes** — [VM pricing, General-purpose](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types)
- **Iowa (us-central1), on-demand**: e2-micro $0.008376428/h = **$6.11479244/mes**; e2-small $0.016752855/h = **$12.22958415/mes**; e2-medium $0.03350571/h = **$24.4591683/mes** — [VM pricing, General-purpose](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types)
- **Compromisos (CUD) en Santiago, por mes**: e2-small: Compute Flexible CUD 1 año $12.59, 3 años $9.44; Resource CUD 1 año $11.02, 3 años $7.87. e2-medium: Flexible 1 año $25.18, 3 años $18.89; Resource 1 año $22.04, 3 años $15.74. e2-micro: Flexible 1 año $6.30, 3 años $4.72; Resource 1 año $5.51, 3 años $3.93 — [VM pricing, General-purpose](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types)
- **Compromisos en Iowa, por mes**: e2-small Resource CUD 1 año $7.70, 3 años $5.50; e2-medium Resource CUD 1 año $15.41, 3 años $11.01 — [VM pricing, General-purpose](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types)
- **Otras formas pequeñas (on-demand, por mes)**. Santiago: t2d-standard-1 (1 vCPU, 4 GiB) $44.10; c4a-standard-1 (1 vCPU, 4 GiB, Arm Axion) $46.87; n1-standard-1 (1 vCPU, 3.75 GiB) $49.58; e2-highcpu-2 (2 vCPU, 2 GiB) $51.64; e2-standard-2 (2 vCPU, 8 GiB) $69.95; n4d-standard-2 $88.40; n4-standard-2 $94.68. Iowa: n4a-standard-1 y t2a-standard-1 (1 vCPU, 4 GiB, Arm) $28.105; t2d-standard-1 $30.84; c4a-standard-1 $32.78; e2-standard-2 $48.92; n4-standard-2 $66.21 (n4a y t2a no aparecieron en la tabla de Santiago) — [VM pricing, General-purpose](https://cloud.google.com/products/compute/pricing/general-purpose)
- La página general lista E2 como "Efficient: Lowest cost per core" y menciona "Google Cloud free VM program for e2-micro VM instance" — [Compute Engine pricing](https://cloud.google.com/products/compute/pricing) (la URL sugerida `cloud.google.com/compute/vm-instance-pricing` y `/compute/all-pricing` redirigen aquí)

### Inferences
- Santiago/Iowa ≈ 1.43× para E2 (8.744/6.115). São Paulo/Santiago ≈ 1.11×.
- Para una landing + CRM Next.js con Postgres en la misma VM, e2-micro (1 GiB) es muy justo; e2-small (2 GiB) es el mínimo razonable y e2-medium (4 GiB) el cómodo. Esto es criterio técnico propio, no dato de Google.
- Las formas de 1 vCPU dedicado (t2d/c4a/n4a) no compiten en precio con E2 de núcleo compartido para cargas pequeñas.

### Gaps
- No se obtuvo la fecha "Last updated" de la página de VM pricing (no existe en el HTML de `cloud.google.com/products/compute/pricing`). La doc técnica de tipos de máquina (fracción de vCPU de e2-micro/small/medium) está en `docs.cloud.google.com`, bloqueado en esta sesión.
- Precios Spot no revisados (cambian hasta diariamente según la propia página y no son adecuados para un CRM).

## 2. Free tier de e2-micro: regiones, disco de 30 GB, egress y condiciones

### Takeaway
El "Always Free" de Compute Engine es 1 e2-micro al mes solo en regiones de EE. UU. (us-west1, us-central1, us-east1) con 30 GB-mes de disco **estándar**; no aplica en Santiago ni São Paulo. La IPv4 externa en uso **no** está cubierta (solo 1 hora/mes gratis), así que una e2-micro "gratis" con IP pública cuesta ~$3.65/mes.

### Cited Findings
- La página del programa gratuito lista "Compute Engine: 1 e2-micro instance per month", "Cloud Storage: 5 GB-months Standard Storage", "Cloud Run: 2 million requests per month", "Firestore: 1 GB storage", "Cloud Build: 120 build-minutes per day", "Secret Manager: 6 secret versions per month", "Artifact Registry: 0.5 GB of storage per month"; "The free usage limit does not expire, but is subject to change. Available for eligible customers." y los límites "not charged against your $300 free credit" (consultado 2026-11-05; sin "Last updated" visible) — [Google Cloud Free Program](https://cloud.google.com/free)
- Tabla oficial de discos en Iowa (us-central1): "Standard provisioned space: 0 gibibyte month to 30 gibibyte month — $0.00 (Free) … per 1 month / account; 30 gibibyte month and above $0.04 / 1 gibibyte month". En Santiago y São Paulo no hay tramo gratuito en esa tabla — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- IP externa: "Static and ephemeral IP addresses in use on standard VM instances: $0.005 / 1 hour"; "Both static and ephemeral IP addresses assigned to standard VM instances are offered with a free tier. This free usage is limited to one hour per month per account." — [Network pricing, External IP address pricing](https://cloud.google.com/vpc/network-pricing)
- Egress Premium desde regiones de Norteamérica: primer 1 GiB/mes gratis hacia Norteamérica, Europa y Asia (excl. Corea/Indonesia), pero **hacia "Australia, Indonesia, Korea, South America, Saudi Arabia" la tabla empieza en $0.19/GiB desde 0 GiB** (sin tramo gratuito) — [Network pricing, Premium Tier](https://cloud.google.com/vpc/network-pricing)
- **No verificado directamente** (fragmento de búsqueda de la doc oficial): el free tier de Compute Engine cubre "Oregon: us-west1, Iowa: us-central1, and South Carolina: us-east1", "30 GB-months standard persistent disk" y "1 GB of data transfer from North America to all region destinations (excluding China and Australia) per month"; solo cuenta disco "Standard" (no Balanced ni SSD); se menciona además 5 GB-mes de almacenamiento de snapshots en algunas regiones — [Free cloud features (docs)](https://docs.cloud.google.com/free/docs/free-cloud-features); un post de foro en español que afirma que us-east4 es elegible contradice la doc oficial — [Google Developer forums](https://discuss.google.dev/t/instancia-f1-micro-e2-micro-no-aparece-como-gratuita-en-region-free-tier/191657)

### Inferences
- Costo mínimo realista de una e2-micro "gratis" en us-central1 con IPv4 pública: $0.005 × 730 h ≈ **$3.65/mes**, más egress hacia Sudamérica a $0.19/GiB en Premium (o gratis hasta 200 GiB/mes si se usa Standard Tier; ver sección 4).
- Hay contradicción aparente sobre el GB gratuito "from North America to all region destinations": la tabla de precios de red no muestra tramo gratuito hacia Sudamérica. Para Perú, conviene presupuestar el egress como pagado.
- Alojar en EE. UU. añade latencia desde Lima frente a Santiago (no medido; inferencia geográfica).

### Gaps
- No se pudo leer la página de free tier en `docs.cloud.google.com` (bloqueada), por lo que no se registra su "Last updated" ni la redacción exacta actual de las condiciones de e2-micro, snapshots y egress.

## 3. Disco de arranque, IPv4 estática e instantáneas (snapshots)

### Takeaway
En Santiago: pd-standard $0.0572/GB-mes, pd-balanced $0.143/GB-mes, snapshot estándar $0.071/GB-mes; IPv4 en uso $0.005/h (~$3.65/mes) y IPv4 reservada sin usar $0.015/h ($10.95/mes).

### Cited Findings
- **Santiago (southamerica-west1)**: Standard provisioned space **$0.0572/GiB-mes**; Balanced **$0.143/GiB-mes**; SSD $0.2431/GiB-mes; Hyperdisk Balanced $0.114/GiB-mes (más IOPS/throughput aprovisionados) — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- **São Paulo**: Standard **$0.06**; Balanced **$0.15**; SSD $0.255 (GiB-mes) — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- **Iowa**: Standard 0–30 GiB-mes gratis, luego **$0.04**; Balanced **$0.10**; SSD $0.17 (GiB-mes) — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- **Snapshots estándar**: Santiago **$0.071/GiB-mes** (archive $0.0272); São Paulo **$0.08** (archive $0.0302); Iowa **$0.05** (archive $0.019). Snapshot a otra región genera cargo de red — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- **IP externa en uso** (VM estándar): $0.005/h; en Spot/preemptible $0.0025/h; asignada a forwarding rules: sin cargo; IPv6 externa en VMs: sin cargo — [Network pricing](https://cloud.google.com/vpc/network-pricing)
- **IP estática reservada sin usar**: Iowa $0.01/h; **Santiago y São Paulo $0.015/h = $10.95/mes**. Una IP estática cuenta como "en uso" si está asociada a una VM aunque la VM esté detenida; una efímera solo mientras la VM corre — [Network pricing](https://cloud.google.com/vpc/network-pricing)
- Las imágenes Linux premium (RHEL, SLES, Ubuntu Pro, Windows) se cobran aparte del tipo de máquina — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)

### Inferences
- Disco de 20 GB en Santiago: pd-standard ≈ $1.14/mes; pd-balanced ≈ $2.86/mes. 30 GB balanced ≈ $4.29/mes.
- IPv4 en uso: 730 h × $0.005 ≈ $3.65/mes (en el HTML no se encontró una variante regional de esta tarifa para Sudamérica, a diferencia de la IP sin usar).
- Snapshots de 10 GB en Santiago ≈ $0.71/mes (el cobro real depende de los cambios incrementales).
- Usar una imagen gratuita (Debian/Ubuntu estándar) evita cargos de licencia.

### Gaps
- No se confirmó en la página fetch si existe tramo gratuito de snapshots en regiones de EE. UU. (solo en fragmento de búsqueda; ver sección 2).

## 4. Transferencia de datos a Internet (egress): Premium vs Standard, asignaciones gratis y Cloud CDN

### Takeaway
Desde Santiago o São Paulo, el egress Premium a cualquier destino (incluida Sudamérica) cuesta $0.19/GiB en el primer TiB; Standard Tier cuesta $0.12/GiB pero con los primeros 200 GiB/mes gratis por cuenta. Para un sitio pequeño, Standard Tier deja el egress en ~$0. Cloud CDN requiere un balanceador con un cargo fijo (~$27.74/mes en la tabla de Santiago), lo que no compensa a esta escala.

### Cited Findings
- **Premium Tier desde Santiago y desde São Paulo** (idéntico): hacia Norteamérica, Europa, Asia, "Australia, Indonesia, Korea, South America, Saudi Arabia" y Medio Oriente/África: 0–1,024 GiB **$0.19/GiB**; 1–10 TiB $0.18; >10 TiB $0.15. China: $0.23/$0.22/$0.20. Ingreso gratis — [Network pricing, Premium Tier](https://cloud.google.com/vpc/network-pricing)
- **Premium Tier desde us-central1**: hacia Norteamérica/Europa/Asia 0–1 GiB gratis, 1 GiB–1 TiB $0.12, 1–10 TiB $0.11; **hacia Sudamérica $0.19 desde 0 GiB**, $0.18, $0.15 — [Network pricing](https://cloud.google.com/vpc/network-pricing)
- La página mantiene el aviso: "Starting February 1, 2024, we'll increase the price for some SKUs for Premium Tier internet data transfer out." Premium Tier es el predeterminado; Standard debe especificarse explícitamente — [Network pricing](https://cloud.google.com/vpc/network-pricing)
- **Standard Tier**: Santiago y São Paulo: 200 GiB–10 TiB **$0.12/GiB**; 10–150 TiB $0.085; >150 TiB $0.08. us-central1: $0.085 / $0.065 / $0.045. "Free Tier: First 200 GiB per month free (per account, across all regions)". "Always Free usage limits do not apply to Standard Tier." — [Network pricing, Standard Tier](https://cloud.google.com/vpc/network-pricing)
- **Cloud Run** usa Premium Tier para egress a Internet, con "a free tier of 1GiB free data transfer within North America per month" — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- **Cloud CDN**: cache data transfer out a Sudamérica 0–10 TiB **$0.09/GiB** (10–150 TiB $0.06); cache lookup HTTP/HTTPS **$0.0075 por 10,000**; se suman cache fill y cargos del balanceador — [Cloud CDN pricing](https://cloud.google.com/cdn/pricing)
- **Balanceador/forwarding rules (tabla "Load balancing and forwarding rules" para Santiago)**: primeras 5 forwarding rules **$0.038/h = $27.74/mes**; adicional $0.015/h; datos procesados entrada/salida $0.012/GiB — [Network pricing](https://cloud.google.com/vpc/network-pricing)

### Inferences
- Escenario de 20 GiB/mes de tráfico desde Santiago: Premium ≈ $3.80/mes; Standard ≈ $0 (dentro de 200 GiB). 100 GiB/mes: Premium ≈ $19; Standard $0.
- Para un landing + CRM con decenas de GB/mes, el egress es menor que el costo de la VM si se usa Standard Tier. Cloud CDN + balanceador añade ≥ ~$28/mes fijos y no conviene salvo tráfico alto; un CDN externo (p. ej., Cloudflare, que ya usa el repo) sería más barato. Esto es inferencia, no dato de Google.

### Gaps
- No se verificó con certeza a qué tipo de balanceador corresponde la tabla de forwarding rules de Santiago (global externo vs regional); tómese como orden de magnitud.
- No se verificó si Standard Tier está disponible para todos los servicios usados (p. ej., Cloud Run sale por Premium según su página).

## 5. Cloud Storage: almacenamiento Standard, operaciones A/B, egress y free tier

### Takeaway
Standard storage cuesta $0.03/GB-mes en Santiago, $0.035 en São Paulo y $0.02 en Iowa; operaciones Class A $0.005 y Class B $0.0004 por 1,000 (bucket regional). El Always Free (5 GB-mes, 5,000 A, 50,000 B, 100 GB de egress) solo aplica en us-west1/us-central1/us-east1.

### Cited Findings
- **Standard storage (regional)**: Santiago **$0.03/GiB-mes**; São Paulo **$0.035**; Iowa **$0.02** (Nearline: $0.018 / $0.02 / $0.01) — [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- **Operaciones, bucket de una región, Standard**: Class A **$0.005 por 1,000** (namespace jerárquico $0.0065); Class B **$0.0004 por 1,000** ($0.0005 jerárquico). Dual/multi-región: Class A $0.01 — [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- **Always Free**: Standard storage 5 GB-meses; Class A 5,000; Class B 50,000; "Data transfer: 100 GB from North America to each Google Cloud Data transfer destination (Australia and China excluded)"; "Cloud Storage Always Free quotas apply to usage in US-WEST1, US-CENTRAL1, and US-EAST1 regions … Always Free is subject to change" — [Cloud Storage pricing, Always Free](https://cloud.google.com/storage/pricing)
- **Egress general a Internet** (tabla "General network usage" mostrada por defecto): "Data transfer to Worldwide Destinations (excluding Asia & Australia)" 0–10 TiB **$0.12/GiB**, 10–150 TiB $0.11, >150 TiB $0.08; China $0.23. Con Cloud CDN se exime el egress de Cloud Storage, pero aplica cache fill — [Cloud Storage pricing](https://cloud.google.com/storage/pricing)

### Inferences
- Para fotos y documentos de un CRM pequeño (p. ej., 10 GB en Santiago): ≈ $0.30/mes de almacenamiento; las operaciones serían céntimos. El egress es el componente variable.

### Gaps
- No se pudo confirmar si la tabla de egress general de $0.12/GiB es la misma cuando el bucket está en Santiago/São Paulo (la tabla regional no se pudo aislar en el HTML). La red de Compute Engine cobra $0.19/GiB Premium desde Sudamérica; podría haber diferencia.

## 6. Alternativas serverless: Cloud Run, Firebase Hosting y Firebase App Hosting

### Takeaway
Cloud Run con facturación por solicitud tiene un free tier mensual de 180,000 vCPU-s, 360,000 GiB-s y 2 millones de solicitudes, aplicado como descuento sobre precios Tier 1. En Santiago el precio activo es $0.0000336/vCPU-s y $0.0000035/GiB-s, con $0.40 por millón de solicitudes, así que un CRM de bajo tráfico sin instancias mínimas puede costar ~$0 en cómputo. Mantener 1 instancia mínima caliente cuesta ~$14/mes en Santiago. Firebase App Hosting exige el plan Blaze y cobra el egress más allá de 10 GiB/mes.

### Cited Findings
- **Free tier, facturación por solicitud**: "CPU - First 180,000 vCPU-seconds free per month; RAM - First 360,000 GiB-seconds free per month; Requests - 2 million requests free per month" (basado en precios activos de us-central1). "The free tier usage is aggregated across projects by billing account and resets every month … The free tier is applied as a spending based discount using Tier 1 pricing." (consultado 2026-11-05; sin "Last updated" visible) — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- **Free tier, facturación por instancia**: 240,000 vCPU-s y 450,000 GiB-s al mes — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- **Facturación por solicitud, us-central1**: CPU activo **$0.000024/vCPU-s**, CPU inactivo (instancia mínima) $0.0000025; memoria activa e inactiva **$0.0000025/GiB-s**; solicitudes **$0.40 por millón**; CUD Cloud Run 1 o 3 años: $0.00001992 CPU, $0.332 por millón de solicitudes — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- **Facturación por solicitud, Santiago y São Paulo (iguales)**: CPU activo **$0.0000336/vCPU-s**; CPU inactivo (min instance) **$0.0000035**; memoria activa e inactiva **$0.0000035/GiB-s**; solicitudes **$0.40 por millón** — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- **Facturación por instancia, Santiago y São Paulo**: CPU **$0.0000216/vCPU-s**, memoria **$0.0000024/GiB-s** (us-central1: $0.000018 y $0.000002) — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- "Idle instances that are not minimum instances are not charged." "Requests are only billed when they reach the container after successfully being authenticated." La facturación se redondea a los 100 ms más cercanos — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- Ejemplo oficial: servicio por solicitud en europe-west1, 10 millones de solicitudes/mes, 400 ms, 1 vCPU, 512 MiB, concurrencia 20 → **$13.69/mes** ($18.91 sin free tier) — [Cloud Run pricing](https://cloud.google.com/run/pricing)
- Desplegar desde código usa Cloud Build y Artifact Registry, con free tier propio; si se excede el free tier de Artifact Registry "you will incur charges … even when your use of Cloud Run falls within the free tier". Artifact Registry: 0.5 GB/mes gratis; Cloud Build: 120 build-min/día gratis — [Cloud Run pricing](https://cloud.google.com/run/pricing); [Google Cloud Free Program](https://cloud.google.com/free)
- **Firebase Hosting (no verificado directamente; fragmentos de búsqueda de firebase.google.com)**: almacenamiento sin costo hasta 10 GB, luego **$0.026/GB**; transferencia sin costo hasta **360 MB/día**, luego **$0.15/GB**. Una página de cuotas más antigua habla de 10 GB/mes. Blaze conserva las asignaciones gratuitas de Spark — [Firebase Pricing](https://firebase.google.com/pricing); [Hosting usage, quotas, and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- **Firebase App Hosting (no verificado directamente)**: requiere el plan **Blaze**; egress sin costo hasta **10 GiB/mes**, luego **$0.15/GiB en caché y $0.20/GiB sin caché**; cobra desde el 1 de agosto de 2025 lo que exceda las asignaciones; además se facturan Cloud Run, Cloud Build, Artifact Registry y otros productos usados — [Understand App Hosting costs](https://firebase.google.com/docs/app-hosting/costs)
- Firestore Always Free: 1 GB de almacenamiento — [Google Cloud Free Program](https://cloud.google.com/free)

### Inferences
- Valor monetario del free tier por solicitud: 180,000 × $0.000024 + 360,000 × $0.0000025 = **$5.22/mes** de descuento. En Santiago equivale a ~128,600 vCPU-s y ~257,100 GiB-s de uso activo.
- Ejemplo de CRM pequeño en Santiago, sin instancias mínimas: 200,000 solicitudes/mes, ~40,000 s de instancia facturable, 1 vCPU, 0.5 GiB → CPU $1.34 + memoria $0.07 = $1.41, cubierto por el free tier → **≈ $0 en cómputo**. El egress de 10 GiB a $0.19 suma ≈ $1.90.
- Con 1 instancia mínima caliente para evitar arranques en frío (1 vCPU, 0.5 GiB, 2,628,000 s/mes en Santiago): CPU inactivo $9.20 + memoria $4.60 = **≈ $13.80/mes**, antes del descuento del free tier (como máximo -$5.22). El costo real depende de la parte del tiempo en estado activo.
- Escenario serverless sin base de datos gestionada en GCP (usando Neon externo, como el repo actual): **≈ $2–5/mes**, o ≈ $10–15/mes con instancia mínima. Con Cloud SQL db-f1-micro en Santiago se suman ≈ $13/mes (sección 7).
- Next.js en App Hosting corre sobre Cloud Run, así que los costos de cómputo se comportan igual que arriba y añaden el egress de App Hosting.

### Gaps
- No se pudieron leer `firebase.google.com/pricing` ni `/docs/app-hosting/costs` (bloqueados): no hay fecha "Last updated" y hay discrepancia de 360 MB/día frente a 10 GB/mes para Hosting.
- No se obtuvieron los precios de Artifact Registry por GB por encima de 0.5 GB ni los de Cloud Build por minuto.

## 7. Cloud SQL: instancia más pequeña y por qué una base gestionada encarece

### Takeaway
La instancia más barata de Cloud SQL es db-f1-micro de núcleo compartido (0.6 GiB, sin SLA): $10.73/mes en Santiago y $0.0105/h (~$7.67/mes) en Iowa, más almacenamiento. Una instancia dedicada de 1 vCPU supera los $60/mes en Santiago, frente al plan gratuito o de bajo costo de Neon que ya usa el proyecto.

### Cited Findings
- **Núcleo compartido, Santiago (mensual)**: db-f1-micro (0.6 GiB) **$10.731**; db-g1-small (1.7 GiB) **$35.77**; HA db-f1-micro $21.462; HA db-g1-small $71.54 — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- **Núcleo compartido, Iowa (por hora)**: db-f1-micro **$0.0105**; db-g1-small **$0.035**; HA $0.021 / $0.07 — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- "Shared CPU machine types (db-f1-micro and db-g1-small) are not covered by the Cloud SQL SLA." — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- **Almacenamiento, Santiago**: SSD **$0.238/GiB-mes**; HDD $0.126; backups usados $0.112. Iowa: SSD $0.17, HDD $0.09, backups $0.08 — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- **Enterprise dedicado, Santiago**: vCPU **$0.0578/h**; memoria **$0.0098/GiB-h** (HA: $0.1156 / $0.0196) — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- **Extended support** para versiones de motor fuera de soporte: db-f1-micro $18.396/mes en años 1–2 en Santiago (adicional) — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- Free trial de Cloud SQL de 30 días con una instancia Enterprise Plus de 8 vCPU, 64 GB y 100 GB, aparte de los $300 de crédito — [Google Cloud Free Program](https://cloud.google.com/free); "New customers also get $300 in free credits to spend on Cloud SQL" — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)

### Inferences
- db-f1-micro con 10 GB SSD en Santiago ≈ $10.73 + $2.38 = **≈ $13.1/mes**, sin SLA y con 0.6 GiB de RAM.
- 1 vCPU y 3.75 GiB dedicados en Santiago ≈ 730 × (0.0578 + 3.75 × 0.0098) ≈ $42.19 + $26.83 = **≈ $69/mes** más almacenamiento; con HA, el doble.
- Alternativas: Postgres dentro de la propia VM (costo incluido en la sección 1, pero la operación y los backups quedan a cargo del equipo), Firestore (1 GB gratis) o Neon externo (arquitectura vigente del repo; precios fuera del alcance de estas notas).

### Gaps
- La tabla de vCPU y memoria dedicados de us-central1 no se pudo aislar con fiabilidad en el HTML (el fragmento mezclaba otra región), por lo que no se reporta. El precio de Santiago se leyó limpio, pero conviene validarlo en la calculadora.

## 8. Facturación: descuentos por uso sostenido y comprometido, alertas de presupuesto y crédito de prueba

### Takeaway
Los nuevos clientes reciben $300 de crédito y no se les cobra hasta activar la cuenta de pago. Según la documentación, el crédito dura 90 días y luego la cuenta se cierra si no se actualiza. Los CUD llegan hasta 55 % (1 o 3 años) y los SUD hasta 30 %, pero los descuentos no se combinan.

### Cited Findings
- "New customers get $300 in free credit to try Google Cloud products … You won't be charged until you activate your full paid account." Los límites del free tier "not charged against your $300 free credit" — [Google Cloud Free Program](https://cloud.google.com/free)
- **No verificado directamente** (fragmento de búsqueda de docs.cloud.google.com): al actualizar a cuenta de pago termina el Free Trial, pero se conserva el crédito no usado hasta 90 días desde el alta. Si no se actualiza antes de 90 días o al agotar los $300, "your Free Trial billing account will be closed and all of its associated projects and resources will be stopped"; se menciona un período de gracia de 30 días. Hay páginas que dicen 90 y otras 91 días — [Free Google Cloud features and trial offer](https://docs.cloud.google.com/free)
- Precios de red "are applied both during and after the Google Cloud Free Trial period. During the Free Trial period, these prices are charged against the Free Trial credit amount." — [Network pricing](https://cloud.google.com/vpc/network-pricing)
- **Descuentos de Compute Engine**: Spot hasta 91 %; CUD hasta 70 % (memory-optimized) y hasta 55 % en otros tipos; SUD automáticos de hasta 30 % para recursos usados más del 25 % del mes que no reciben otro descuento. "Discount types cannot be combined." — [Compute Engine pricing](https://cloud.google.com/products/compute/pricing)
- **Resource-based CUD**: hasta 37 % a 1 año; 55 % a 3 años (70 % memory-optimized). Se paga la cuota mensual aunque no se use. **Compute flexible CUD**: 28 % a 1 año y 46 % a 3 años sobre el gasto horario comprometido; cubre Compute Engine, GKE y Cloud Run, e incluye la serie **E2** — [Compute Engine pricing](https://cloud.google.com/products/compute/pricing)

### Inferences
- Para un negocio pequeño sin certeza de demanda, comprometerse a 1 o 3 años solo tiene sentido si la VM es fija. En Santiago, la e2-small baja de $17.49 a $11.02 (resource CUD 1 año).
- El crédito de $300 cubriría con holgura los primeros 90 días de cualquiera de los escenarios, pero no reduce el costo recurrente.

### Gaps
- **Elegibilidad de E2 para SUD**: la página no lo dice. Por conocimiento previo, E2 no recibe SUD; no verificado en esta sesión.
- **Alertas de presupuesto (Budgets)**: no se pudo verificar en documentación oficial (en docs.cloud.google.com, bloqueado). Por conocimiento previo, los presupuestos y alertas son gratis y no detienen el gasto automáticamente; no verificado.
- Requisitos de alta en Perú (tarjeta, verificación, facturación local o IGV) no verificados.

## 9. Cambios de precios anunciados para 2026 (IPv4, egress, free tier)

### Takeaway
En las páginas oficiales consultadas el 2026-11-05 no apareció ningún cambio de precios anunciado para 2026 que afecte a IPv4, al egress de Internet o al free tier. El último aviso visible es el aumento de egress Premium del 1 de febrero de 2024. Blogs de terceros reportan una subida de tarifas de peering en mayo de 2026, que no afecta a un sitio pequeño; no se verificó oficialmente.

### Cited Findings
- La página de precios de red solo muestra el aviso "Starting February 1, 2024, we'll increase the price for some SKUs for Premium Tier internet data transfer out." — [Network pricing](https://cloud.google.com/vpc/network-pricing)
- La página oficial de actualizaciones de servicios de red trata los cambios con efecto desde el 1 de febrero de 2024 (contratos de precio fijo, ajuste de precios en moneda local) — [Networking services update](https://cloud.google.com/products/networking/services-update)
- Firebase App Hosting empezó a cobrar los excedentes de Blaze desde el 1 de agosto de 2025 (no verificado directamente) — [Understand App Hosting costs](https://firebase.google.com/docs/app-hosting/costs)
- **Solo terceros, sin verificar** (se citan para señalar el tema, no como fuente de cifras): se reporta que desde mayo de 2026 se duplicaron en Norteamérica las tarifas de CDN Interconnect, Direct Peering y Carrier Peering ($0.04 → $0.08/GB), sin cambios en el egress de Internet Standard — [Bit Refinery blog](https://bitrefinery.com/blog/gcp-doubled-egress-rates-free-private-peering-hybrid-architecture); [Spendark](https://spendark.com/blog/gcp-pricing-changes-2026/)

### Inferences
- Para este caso de uso (egress a Internet, IPv4 en VM, free tier), las tarifas leídas hoy son las vigentes. El cambio de peering de 2026, si es real, no aplica.

### Gaps
- No se pudo consultar el feed oficial de notas de versión ni los avisos de facturación en docs.cloud.google.com (bloqueado).

## 10. Tipo de cambio PEN/USD (SBS o BCRP) a inicios de noviembre de 2026

### Takeaway
**No verificado.** No se obtuvo el tipo de cambio SBS de inicios de noviembre de 2026. El dato oficial más reciente visible es de principios de octubre de 2026: alrededor de S/ 3.42–3.46 por USD, en fragmentos de la serie BCRP del tipo de cambio bancario.

### Cited Findings
- Serie BCRP PD04639PD/PD04640PD (tipo de cambio interbancario/bancario, compra y venta; no verificado directamente: fragmento de búsqueda, API bloqueada en esta sesión): 5 de octubre de 2026 compra **3.423**, venta **3.435**; 9 de octubre de 2026 venta **3.457** — [BCRP Estadísticas (API)](https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04639PD-PD04640PD/json/2026-09-28/2026-10-07)
- Fuente oficial del tipo de cambio contable SBS — [SBS, Tipo de cambio contable](https://www.sbs.gob.pe/app/pp/SISTIP_PORTAL/Paginas/Publicacion/TipoCambioContable.aspx)

### Inferences
- Para convertir, puede usarse provisionalmente **~S/ 3.45 por USD** (estimación basada en octubre de 2026), indicándolo como aproximado. Debe confirmarse con la SBS o el BCRP en la fecha del informe.

### Gaps
- Falta el tipo de cambio SBS del 3 al 5 de noviembre de 2026: `estadisticas.bcrp.gob.pe` está bloqueado en la red de la sesión y la búsqueda no devolvió datos de noviembre.

## 11. Estimación mensual de escenarios (a) VPS pequeño y (b) casi serverless

### Takeaway
(a) Un VPS e2-small en Santiago, con 20 GB de disco balanced, IPv4, snapshots y poco tráfico, cuesta **~$25–29/mes** (e2-medium ~$42–46; e2-micro "gratis" en Iowa ~$4–8). (b) Cloud Run en Santiago con base de datos externa cuesta **~$2–5/mes**, o ~$10–17 con una instancia mínima caliente. Con Cloud SQL db-f1-micro se suman ~$13/mes. Todo son estimaciones propias a partir de los precios oficiales anteriores, sin impuestos.

### Cited Findings
- Precios usados: VM E2 por región — [VM pricing, General-purpose](https://cloud.google.com/products/compute/pricing/general-purpose#e2-machine-types); discos y snapshots — [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing); IPv4 y egress — [Network pricing](https://cloud.google.com/vpc/network-pricing); Cloud Run — [Cloud Run pricing](https://cloud.google.com/run/pricing); Cloud SQL — [Cloud SQL pricing](https://cloud.google.com/sql/pricing)

### Inferences
Estimaciones propias, en USD por mes y con 730 h/mes:

| Componente | (a1) e2-small Santiago | (a2) e2-medium Santiago | (a3) e2-micro Iowa (free tier) | (b) Cloud Run Santiago |
|---|---|---|---|---|
| Cómputo | 17.49 | 34.98 | 0.00 (free tier) | ≈ 0 sin instancia mínima (free tier ≈ $5.22); ≈ 8.6–13.8 con 1 instancia mínima |
| Disco | 2.86 (20 GB balanced) | 2.86 | 0.00 (≤ 30 GB standard) | — |
| IPv4 en uso | 3.65 | 3.65 | 3.65 | — (sin IP de VM) |
| Snapshots ~10 GB | 0.71 | 0.71 | ≈ 0.50 | — |
| Egress 20 GiB | 3.80 Premium / 0 Standard | 3.80 / 0 | 3.80 Premium a Sudamérica / 0 Standard | 3.80 (Premium; 10 GiB ≈ 1.90) |
| **Total aprox.** | **≈ 24.7–28.5** | **≈ 42.2–46.0** | **≈ 4.2–8.0** | **≈ 2–5** sin instancia mínima; **≈ 10–17** con ella |
| + Cloud SQL db-f1-micro + 10 GB SSD | +13.1 | +13.1 | +≈ 9.4 (Iowa: 7.67 + 1.70) | +13.1 |

- Con compromiso de 1 año (resource CUD), el cómputo de a1 baja a $11.02 y el de a2 a $22.04.
- En São Paulo, los escenarios a1/a2 suben ~$2–4/mes por la VM y los discos.
- Para comparar con cotizaciones de proveedores: un VPS gestionado en GCP para este caso no debería superar ~$30–50/mes en infraestructura. Una cotización mayor incluye mano de obra, administración, backups o márgenes, no costo de nube. Esta comparación es una inferencia.
- No incluidos: dominio y DNS (Cloud DNS no consultado), correo transaccional, Clerk, Neon, n8n, monitoreo y logging más allá del free tier, IGV o retenciones en Perú.

### Gaps
- No se usó la Pricing Calculator (interactiva, no accesible por fetch). Validar los totales en https://cloud.google.com/products/calculator antes de presentarlos como cotización.
- No se consultaron los precios de Cloud DNS, Cloud Logging y Monitoring (más allá de "monthly allotments" del free tier), Secret Manager ni Artifact Registry por GB.
