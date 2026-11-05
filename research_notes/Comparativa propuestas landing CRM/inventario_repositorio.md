# Inventario del repositorio Carreras Viajeras (qué está construido, qué solo está especificado y qué falta)

Ámbito: lectura del checkout `/home/user/carreras-viajeras` (rama local, último commit `0cb419c`, 2026-10-31; 291 commits desde 2026-10-18). Solo se leyeron archivos y `git log`; no se ejecutaron builds, tests, migraciones ni nada remoto. Las "fuentes" son rutas del repositorio (con líneas cuando aplica). "Implementado" significa que el código existe en el repositorio; no implica que esté desplegado ni validado en producción, salvo que se indique.

Leyenda de estado: **implementado** / **parcial** / **solo spec** / **ausente**.

Nota de método sobre las specs: las casillas `- [ ]` / `- [x]` de los criterios de aceptación **no se mantienen de forma fiable** (p. ej. `crm-journey-automation.md` tiene casi todos sus criterios sin marcar aunque su README y otras specs la declaran "F1–F6 implementadas"). Son más fiables las listas de tareas por fase (`T1…T5`) y las líneas "Estado de la implementación" de cada spec, cruzadas con el código y con `git log`.

---

## 1. Landing pública (viajes/carreras, Santiago, formulario de leads, Turnstile, Zod, SEO, móvil)

### Takeaway
La landing está **implementada**: portada, `/contacto`, ficha por carrera `/viajes/<slug>`, página de registro `/viajes/<slug>/registro`, noticias y cuenta del corredor. Solo hay **una carrera con datos completos: Maratón de Santiago 2027** (Río y Roma aparecen solo como destinos "Quiero novedades"). Formulario con Zod + Turnstile + consentimiento versionado, mobile-first. SEO básico (metadata global) pero **sin sitemap, robots ni Open Graph por viaje**.

### Cited Findings
- Rutas públicas existentes: `app/page.tsx`, `app/contacto/page.tsx`, `app/viajes/ficha_viaje/page.tsx`, `app/viajes/ficha_viaje/registro/page.tsx` (servidas por `rewrites` para `/viajes/<slug>` y `/viajes/<slug>/registro`), `app/viajes/[slug]/checkout/page.tsx`, `app/noticias/page.tsx`, `app/noticias/[slug]/page.tsx`, `app/cuenta/page.tsx`, `app/cuenta/perfil/page.tsx`, `app/mis-carreras/page.tsx`, `app/r/[code]/page.tsx` (referidos) — [listado de `app/`](app/)
- Componentes de la landing: `HeroCarousel`, `DestinationsSection`, `PackageSection`, `WhyUsSection`, `CommunitySection`, `FaqSection`, `BlogSection`, `MazBackingSection`, `LeadCaptureForm`, `RaceRegistrationSection`, `TurnstileWidget`, `MobileCta`, `MobileMenu`, `OfferSummary`, `RunnerReservationPanel`, `CampaignVisitBeacon` — [modules/landing/components/](modules/landing/components/)
- Santiago es la única carrera con contenido: `slug: "maraton-santiago-2027"`, 16 mayo 2027, 42K, "100 cupos definidos", precios de diseño US$1,499 contado / US$1,799 en cuotas / US$300 reserva, con aviso "Proveedores y condiciones por confirmar" — [modules/landing/utils/trips.ts:24-50](modules/landing/utils/trips.ts)
- Destinos sin catálogo solo como interés: `INQUIRY_DESTINATION_IDS = ["rio", "roma"]` — [lib/inquiryDestinations.ts:5-11](lib/inquiryDestinations.ts)
- El seed de viajes solo incluye Santiago; "Río, Roma, Medellín, Buenos Aires, España y EE. UU. no entran: el repositorio solo tiene sus imágenes". El seed **no se ha ejecutado en ninguna rama** — [README.md:398-412](README.md)
- Formulario único (spec `landing-single-lead-form.md`, aprobada): pide nombre y apellido, WhatsApp con código de país y correo, aceptación del texto legal y casilla opcional de promociones desmarcada; cada envío válido crea un lead "Nuevo", vía "Formulario web", sin responsable — [README.md:1041](README.md); commit `75b8fb5 feat(landing): un solo formulario de datos, en la página de cada maratón`
- Validación con Zod en fronteras (`modules/crm/schemas/webLeads.schema.ts` y su test) y verificación de Turnstile en servidor (`modules/crm/services/turnstile.service.ts`) — [modules/crm/schemas/](modules/crm/schemas/), [modules/crm/services/](modules/crm/services/)
- Turnstile: control antispam "gratuito de Cloudflare"; sin sus claves "el formulario se ve pero cada envío responde 'no pudimos verificar'" — [README.md:1115-1131](README.md), [README.md:1111](README.md)
- Texto legal aprobado por el usuario el 2026-10-29 (versión `registro-web-v1`); registro abierto en producción. Pendiente: el texto "no menciona a quienes también tratan los datos (n8n, el proveedor de correo y Gemini)" — [README.md:1107-1113](README.md), [lib/registrationConsent.ts](lib/registrationConsent.ts)
- Móvil: "En el móvil todo va en una columna"; en PC (≥1024 px) dos columnas; modo stand con campos grandes — [README.md:1041-1043](README.md)
- SEO: metadata global con plantilla de título en `app/layout.tsx:30-32`; no existen `app/sitemap*` ni `app/robots*` (búsqueda sin resultados); las fichas de viaje son estáticas y "**no hay título ni imagen Open Graph por viaje** al compartir el enlace" — [app/layout.tsx](app/layout.tsx), [README.md:80](README.md)
- Arquitectura estática por límite de CPU de Workers Free (10 ms): `/`, `/contacto`, `/viajes/<slug>` se prerenderizan y piden datos a `GET /api/viajes`, `/api/viajes/[slug]`, `/api/noticias/portada` — [README.md:74-84](README.md)
- Noticias/contenido editorial: `/crm/contenidos` publica en portada y `/noticias` — [README.md:2385-2405](README.md). La spec `landing-news-updates.md` sigue en **borrador** y sin registro en `approvals.jsonl` — [docs/specs/landing-news-updates.md](docs/specs/landing-news-updates.md)
- Analítica: Microsoft Clarity con consentimiento previo (banner, 180 días), solo en rutas públicas — [README.md:2352-2380](README.md). PostHog desactivado — [README.md:20](README.md)

### Inferences
- Para un proveedor externo, la "landing" ya existe y está bastante pulida; el trabajo pendiente es de contenido (más carreras con datos reales) y SEO técnico (sitemap, robots, OG por viaje), no de construcción desde cero.
- La ausencia de OG por viaje es una consecuencia del diseño estático para Workers Free; resolverlo puede requerir plan pagado de Workers o generar HTML por slug en build (inferencia).

### Gaps
- No se verificó visualmente la landing ni su rendimiento (no se ejecutó nada).
- No se encontró `sitemap.xml`/`robots.txt` en `public/` ni en `app/` (ausencia confirmada por búsqueda, no por petición HTTP).

---

## 2. Captura con QR en eventos (rutas, `source`/`channel`, UTM, atribución)

### Takeaway
**Implementado**: campañas con código, QR descargable en SVG desde el CRM, modo stand para tableta, contador de visitas por campaña y atribución del lead a canal/campaña/evento con UTM y referente guardados aparte. Requiere Turnstile configurado y migraciones aplicadas (la `0014` ya consta aplicada en production).

### Cited Findings
- Campaña = "un QR o un enlace con su carrera y su canal"; se crea en CRM → Campañas (`commercial` y `admin`); código 3–32 caracteres; la ficha muestra el enlace público `…/viajes/<slug>/registro?c=<código>`, el enlace modo stand y el QR — [README.md:1047-1061](README.md)
- Rutas/archivos: `app/crm/(protected)/campanas/page.tsx`, `campanas/[id]/page.tsx`, `modules/crm/components/CampaignQr.tsx`, `CampaignForm.tsx`, `CampaignTable.tsx`, `modules/crm/services/campaigns.service.ts`; dependencia `react-qr-code 2.2.0` — [package.json](package.json)
- Atribución: lead de una campaña activa de la misma carrera queda con el canal de la campaña, la campaña y el evento como detalle; sin campaña válida, canal "Web". UTM (`utm_source/medium/campaign`) y `ref` se guardan pero "**no cambian el canal**" — [README.md:1063-1068](README.md)
- Modelo de datos: `leads.source` (vía de entrada inmutable) enum `whatsapp, web_form, other, google_form, import, runner_account`; `leads.channel` (origen comercial editable) enum `event, partner, referral, whatsapp, whatsapp_status, instagram, facebook, tiktok, youtube, google_ads, luma, web, other, unknown`; columnas `campaign_id`, `utm_source`, `utm_medium`, `utm_campaign`, `referred_by`, `origin_detail` — [lib/db-schema.ts:307-340, 581-620](lib/db-schema.ts)
- Visitas: `POST /api/campaign-visits` incrementa un contador diario por campaña sin datos personales (ni IP, ni cookies); no cuenta modo stand ni previsualizaciones; "Conversión = registros ÷ visitas" — [README.md:1070-1083](README.md), [app/api/campaign-visits/route.ts](app/api/campaign-visits/route.ts), tabla `campaign_visit_days` — [lib/db-schema.ts:408](lib/db-schema.ts)
- Modo stand (`&modo=stand`): solo nombre de carrera y formulario, "Registrar a otra persona", autocompletado desactivado, Turnstile en cada registro — [README.md:1095-1105](README.md)
- Imprimir QR: "Descargar QR (SVG)" desde el CRM de producción; recomendación ≥3×3 cm — [README.md:1085-1093](README.md)
- Informe origen × etapa por cohorte en `/crm` (dashboard) — commit `a3c1352 feat(crm): filtro origen, informe origen × etapa por cohorte`; [modules/crm/services/leadReport.service.ts](modules/crm/services/leadReport.service.ts)
- Spec `landing-omnichannel-capture.md` aprobada (registro 2026-10-29 en `approvals.jsonl`) — [docs/specs/approvals.jsonl](docs/specs/approvals.jsonl)

### Inferences
- La captura QR en ferias (incluido el flujo de tableta) es una de las capacidades más maduras del repositorio y cubre lo que normalmente ofrecería una propuesta de "landing + QR".

### Gaps
- No consta en el README que se hayan creado campañas reales ni impreso QR de producción.
- La lista de slugs `?origen=` de la F7 de `crm-journey-automation.md` está pendiente de decisión del usuario (pregunta abierta 6) — [docs/specs/crm-journey-automation.md:~612](docs/specs/crm-journey-automation.md)

---

## 3. Leads/CRM: modelo, embudo, asignación, notas, tareas, automatización del recorrido, dashboards, importación, deduplicación

### Takeaway
CRM comercial **implementado** a medida en `/crm`: embudo de 6 etapas (kanban + lista), responsable, historial de actividades (notas, llamadas, mensajes), "próxima acción" con fecha y nota (no un sistema de tareas), filtros, dashboard por cohorte. La importación masiva existe solo como **workflow de n8n fila a fila diseñado para 180 registros**; no hay importador CSV en la app ni nada dimensionado para ~22.000 contactos. Deduplicación **parcial** (por correo+carrera en la web, por teléfono en la API de n8n, ninguna en el alta manual).

### Cited Findings
- Etapas: `new, contacted, quoted, reserved, paid, lost` — [lib/db-schema.ts:307-314](lib/db-schema.ts). Vista embudo "Nuevo → Contactado → Cotizado → Reservado → Pagado", "Perdido" como salida; hasta 10 contactos por columna; vista Lista con filtros y paginación (`?vista=lista`) — [README.md:2010-2014](README.md)
- Páginas CRM: `/crm` (dashboard), `/crm/leads`, `/crm/leads/nuevo`, `/crm/leads/[id]`, `/crm/leads/[id]/editar`, `/crm/campanas`, `/crm/viajes`, `/crm/ofertas`, `/crm/reservas`, `/crm/contratos`, `/crm/recompensas`, `/crm/contenidos`, `/crm/admin/usuarios`, `/crm/admin/patrocinadores`, `/crm/configuraciones` — [app/crm/(protected)/](app/crm/)
- Asignación: `leads.owner_user_id` (NULL = sin asignar; "el CRM asigna el primer responsable a mano"); evento `lead.owner_assigned` y correo de alerta al responsable — [lib/db-schema.ts:620-622, 699-707](lib/db-schema.ts), [docs/specs/crm-lifecycle-emails.md:20-30](docs/specs/crm-lifecycle-emails.md). No hay reparto automático (round-robin): los importados entran "Sin asignar" y la asignación automática es pregunta abierta 7 — [docs/specs/crm-journey-automation.md:~614](docs/specs/crm-journey-automation.md)
- Actividades/notas: enum `lead_activity_type` = `created, stage_changed, owner_changed, archived, note, call, message, automation, channel_changed, opted_out, re_registered, responded` — [lib/db-schema.ts:342-357](lib/db-schema.ts); componentes `ActivityForm`, `LeadTimeline`, `LeadJourney`, `LeadMessages` — [modules/crm/components/](modules/crm/components/)
- "Tareas": solo un campo `next_action_date` + `next_action_note` (≤200 caracteres) por lead, `NextActionForm`/`NextActionBadge`, filtro "Seguimiento" y vista "Mis pendientes" — [lib/db-schema.ts:623-624](lib/db-schema.ts), [modules/crm/components/LeadFilters.tsx:29-77](modules/crm/components/LeadFilters.tsx), [docs/specs/crm-admin-panel.md:22-23](docs/specs/crm-admin-panel.md). No existe tabla de tareas (búsqueda `lead_tasks` sin resultados en código).
- Filtros de la lista de leads: Etapa, Responsable, Seguimiento, Origen — [modules/crm/components/LeadFilters.tsx](modules/crm/components/LeadFilters.tsx). No se encontró búsqueda de texto en `leads.service.ts` (sin `ilike`/`search`); la spec reconoce "el CRM no tiene búsqueda" (pregunta abierta 9) — [docs/specs/crm-journey-automation.md:~616](docs/specs/crm-journey-automation.md). (La búsqueda sí existe en la lista de **usuarios**, commit `ba959df`.)
- Dashboard `/crm`: tarjetas "Total de leads", "Nuevos", "Reservados", "Sin responsable", resumen por etapa e informe origen × etapa por cohorte mensual, con opción "solo importados / sin importados" — [modules/crm/components/CrmDashboard.tsx:33-144](modules/crm/components/CrmDashboard.tsx), [docs/specs/crm-journey-automation.md](docs/specs/crm-journey-automation.md) (decisión P6)
- Recorrido (`crm-journey-automation.md`, aprobada; declarada "F1–F6 implementadas" por `landing-omnichannel-capture.md:10`): origen/canal, alta por Google Forms, seguimiento con baja, vínculo reserva ↔ lead, medición — [docs/specs/crm-journey-automation.md](docs/specs/crm-journey-automation.md), [docs/specs/landing-omnichannel-capture.md:10](docs/specs/landing-omnichannel-capture.md)
- Importación: endpoint `POST /api/integrations/n8n/leads` con `source: "import"`, `externalId`, `consentVersion` (`import-mml-v1`), `consentedAt` obligatorios; workflow n8n "Importación única" para "**los 180 registros del módulo de la Media Maratón de Lima**", con *Batch Size* 1 y *Wait* de 1 s por fila; "Un registro sin un consentimiento que cubra el contacto **no se importa**"; los importados no reciben bienvenida (`bulk: true`) — [README.md:1186-1198, 1458-1513](README.md)
- No se encontró ninguna referencia a 22.000 contactos ni importador masivo en la app (búsqueda `22 000|22.000|22 mil` sin resultados) — búsqueda en el repositorio.
- Consentimiento en el lead: `consent_version` (obligatorio), `consented_at`, `marketing_opt_in_at` (casilla de promociones), `contact_opt_out_at` (baja), `referral_permission` — [lib/db-schema.ts:600-630](lib/db-schema.ts)
- Deduplicación: (a) web: mismo correo + misma carrera → no crea lead, añade actividad "Volvió a registrarse"; "Dos personas con el mismo teléfono y correos distintos son dos leads" — [README.md:1068](README.md); (b) API n8n (Google Forms/importación): `existing` si ya hay lead con ese teléfono, `duplicate` por `externalId`; advertencia de que peticiones simultáneas con el mismo teléfono "pueden crear dos leads" — [README.md:1196, 1513](README.md); (c) alta manual: sin aviso de duplicados (pregunta abierta 9, fuera por decisión 8 de `crm-leads-pipeline.md`) — [docs/specs/crm-journey-automation.md:~616](docs/specs/crm-journey-automation.md); idempotencia del formulario por `idempotency_key` + `submission_hash` — [lib/db-schema.ts:636-640](lib/db-schema.ts)
- Google Forms → CRM: workflow n8n "Alta desde Google Forms" documentado; activar "solo cuando el texto legal de `google-form-v1` esté confirmado" — [README.md:1410-1456](README.md)
- Spec `crm-admin-panel.md` (barra lateral, dashboard, usuarios/configuraciones) sigue en **borrador** aunque sus tareas T2–T5 están marcadas `[x]` y no figura en `approvals.jsonl` — [docs/specs/crm-admin-panel.md:4, 75-78](docs/specs/crm-admin-panel.md)

### Inferences
- Importar 22.000 contactos con el workflow actual (1 petición + 1 s de espera por fila) llevaría del orden de 6+ horas de ejecución en el n8n local y depende de que cada fila tenga consentimiento demostrable (`consentVersion` hoy solo admite `import-mml-v1` para `import`; otra versión da `400`). Habría que ampliar la spec (nueva versión de consentimiento) y probablemente un importador por lotes (inferencia a partir de README.md:1186-1198 y 1460-1513).
- La deduplicación por teléfono/correo es suficiente para formularios, pero una importación grande necesitaría reglas explícitas de fusión, que no existen.
- "Tareas" y "notas" están cubiertas a un nivel mínimo (una próxima acción por lead + historial); un CRM comercial de proveedor normalmente ofrecería tareas múltiples, recordatorios por usuario y búsqueda.

### Gaps
- No se pudo comprobar cuántos leads reales hay en production (no se consultó la base).
- No se encontró documentación de exportación de leads (CSV) desde el CRM.

---

## 4. Reservas, pagos, cuentas de corredor (Clerk) y roles

### Takeaway
Reservas **implementadas** en el CRM (una por participante, pagos registrados a mano, itinerario, avisos) y portal del corredor `/mis-carreras` **implementado**. Pago en línea: **Stripe Checkout implementado pero solo en modo DEMO/TEST** (no hay pagos reales; el go-live tiene puertas abiertas). Mercado Pago estaba planeado y **no se implementó**. Cuentas con Clerk y matriz de 5 roles **implementadas**; el despliegue/validación de Clerk de producción tiene checklist manual sin marcar.

### Cited Findings
- Reservas: "Una reserva por participante", importes en USD enteros, sin borrado físico, vínculo por correo verificado y autorización por `user_id`; permiso `bookings.manage` para `admin` y `commercial` — [README.md:1587-1598](README.md); tablas `bookings`, `booking_payments`, `itinerary_items`, `trip_updates` — [lib/db-schema.ts:903-1125](lib/db-schema.ts)
- "Confirmar una reserva solo tras recibir el pago y la aceptación de las condiciones… **El CRM todavía no lo comprueba**"; condiciones de la reserva (monto, plazo, reembolso) siguen pendientes (pregunta abierta 2) — [README.md:1596](README.md)
- Stripe: checkout desde `/viajes/<slug>/checkout`, pago total o anticipo, en PEN a tasa vigente, webhook `POST /api/webhooks/stripe` — [README.md:1660](README.md); "La demostración académica usa el sitio publicado con Stripe **solo en modo TEST**: nunca una clave `sk_live_`… ni pagos reales" — [README.md:1662](README.md)
- `wrangler.jsonc` tiene `STRIPE_CHECKOUT_ENABLED: "true"`, `STRIPE_DEMO_MODE: "true"`, `STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: "true"` — [wrangler.jsonc](wrangler.jsonc)
- Pendiente en Stripe: prueba funcional en modo test con Clerk y Neon de desarrollo, fallo de Workers Builds en ramas, pasos del procedimiento; "No consta que haya secretos de Stripe cargados en Cloudflare ni un endpoint registrado en Stripe"; puertas del go-live live (elegibilidad de la cuenta Stripe, contrato aprobado por legal y comercial, obligaciones fiscales) "siguen abiertas" — [README.md:1664-1680](README.md)
- Mercado Pago: el plan maestro preveía "pago con Mercado Pago Checkout Pro" — [docs/specs/trips-commercial-offers.md:5](docs/specs/trips-commercial-offers.md); "no se encontró implementación de su checkout" — [docs/specs/bookings-stripe-checkout.md:29](docs/specs/bookings-stripe-checkout.md). No hay Culqi/Niubiz/Izipay/PayPal en el código (búsqueda).
- Ofertas comerciales versionadas y tipo de cambio USD→PEN (`trip_offers`, `exchange_rates`) en `/crm/ofertas` — [lib/db-schema.ts:423-580](lib/db-schema.ts); contratos versionados y aceptación (`contract_versions`, `booking_contract_acceptances`) — [lib/db-schema.ts:1227-1270](lib/db-schema.ts); borradores de contrato en [docs/contracts/](docs/contracts/)
- Clerk único proveedor; `userId` estable; roles en Neon con denegación por defecto — [CLAUDE.md](CLAUDE.md), [README.md:5](README.md). Enum `staff_role`: `commercial, admin, super_admin, organizer, sponsor` — [lib/db-schema.ts:28-34](lib/db-schema.ts)
- Matriz de permisos (base, sin herencia): `crm.access` [commercial, organizer]; `leads.manage` [commercial]; `bookings.manage` [commercial]; `offers.view` [commercial]; `rewards.apply` [commercial]; `sponsor.portal` [sponsor]; herencia: `super_admin` ⊇ commercial, organizer, sponsor, admin; `admin` ⊇ commercial, organizer, sponsor — [lib/auth/permissions.ts:6-51](lib/auth/permissions.ts)
- Portal de patrocinador: la spec `sponsors-portal.md` (aprobada) define `/patrocinador` con "Mis eventos" — [docs/specs/sponsors-portal.md:131](docs/specs/sponsors-portal.md); en `app/` no existe ruta `/patrocinador` (el permiso `sponsor.portal` solo aparece en `lib/auth/`); sí existe `/crm/admin/patrocinadores` (gestión de marcas) — [app/crm/(protected)/admin/patrocinadores/](app/crm/)
- Clerk producción: runbook en 12 pasos ejecutado por el usuario; el "Checklist manual en producción" tiene **todas las casillas sin marcar** — [README.md:137-196](README.md). `wrangler.jsonc` ya declara una clave publicable `pk_live_…` (pública por diseño) — [wrangler.jsonc](wrangler.jsonc)
- Cuentas de corredor: `/cuenta` (registro/acceso), `/cuenta/perfil` (perfil, carreras, beneficios, referidos, estrellas), perfiles de corredor `runner_profiles` (documento de viaje, talla, distancia) — [README.md:2385-2392](README.md), [lib/db-schema.ts:1125-1137](lib/db-schema.ts)

### Inferences
- Hoy no hay forma de cobrar dinero real en la web; el cobro real se hace fuera (inferencia: transferencias/WhatsApp, coherente con "no se reciben pagos en la web" en `modules/landing/utils/trips.ts:47`).
- Que el checklist de Clerk producción esté sin marcar no prueba que no se haya hecho; puede que simplemente no se actualizara el README (inferencia; requiere confirmación del usuario).

### Gaps
- No se pudo verificar si el sitio `carreras-viajeras.mentec.dev` está desplegado ni qué versión sirve.

---

## 5. Automatización: outbox, API privada n8n, correo, WhatsApp, recordatorios, consentimiento y baja

### Takeaway
**Implementado** un outbox persistente en Neon con API privada *pull* para n8n (n8n **local**, en la computadora del usuario, en Docker). Los correos al cliente salen por **SMTP desde n8n** (sin proveedor transaccional tipo Resend/SendGrid) y están **apagados por defecto** con interruptor. **WhatsApp no está automatizado**: n8n prepara borradores (Gemini o plantillas) y una persona los envía desde WhatsApp Business App; la API oficial (Cloud API) es "posterior". Enlace de baja ("unsubscribe") **solo spec** (Fase 2 de la cadencia, pendiente).

### Cited Findings
- Stack: "Outbox persistente en Neon, API privada y n8n Community local"; "Contacto inicial: WhatsApp Business App manual; API oficial posterior" — [README.md:18-21](README.md)
- "n8n corre en tu computadora y no tiene dirección pública, así que **la web nunca llama a n8n**: es n8n quien pregunta cada minuto a una API privada" — [README.md:1147](README.md); n8n en Docker, versión 2.43.7 — [README.md:2031-2034](README.md). La spec original excluye "Exponer n8n a Internet… cron de Cloudflare o Queues" — [docs/specs/automation-outbox.md:28](docs/specs/automation-outbox.md)
- Tabla `outbox_events` (estados `pending, processing, succeeded, dead`, lease de 5 min, hasta 8 intentos, payload ≤1 KiB sin datos personales); tipos `lead.created, lead.stage_changed, lead.follow_up_due, lead.opted_out, lead.owner_assigned, lead.cadence_due` — [lib/db-schema.ts:699-773](lib/db-schema.ts)
- Endpoints n8n: `events/claim`, `events/{id}/ack`, `events/{id}/fail`, `leads/{id}`, `leads/{id}/activities`, `leads` (alta), `follow-ups/enqueue`, `cadence/enqueue`, `email/claim`, `email/{id}/{operation}` — [app/api/integrations/n8n/](app/api/integrations/n8n/), contrato en [README.md:1166-1203](README.md)
- Correo al equipo y borradores: credenciales SMTP, Google Gemini y Google Sheets viven **solo en n8n** — [README.md:1151-1160](README.md); a Gemini solo se envía nombre de pila, etapa y viaje — [README.md:1275-1290](README.md)
- Correos automáticos al cliente: flujo `scripts/n8n/client-stage-email.json`, se importa **inactivo**; `CRM_EMAIL_AUTOMATION_ENABLED=false` por defecto; "**Enviado** significa que el servidor SMTP aceptó al destinatario… no confirma la entrega final"; "Las verificaciones locales… no han enviado correos reales" — [README.md:2010-2054](README.md). Tipos de correo: `stage, welcome_registration, welcome_contact, welcome_account, follow_up, booking_confirmed, team_alert, owner_alert, cadence_proposal, cadence_reminder` — [lib/db-schema.ts:781-795](lib/db-schema.ts)
- "Se reutilizan el outbox, la tabla `client_emails`, la API privada de n8n y el flujo SMTP. **No se añade otro proveedor de correo**" — [docs/specs/crm-lifecycle-emails.md:15](docs/specs/crm-lifecycle-emails.md). Única mención de Resend/SendGrid/etc. está en `automation-outbox.md` (spec antigua) — búsqueda en repo.
- Ciclo de vida (`crm-lifecycle-emails.md`): F1 y F2 implementadas (`[x]`), **F3 pendiente** (ficha por tipo de correo, disparador n8n, guía de activación) — [docs/specs/crm-lifecycle-emails.md:220-254](docs/specs/crm-lifecycle-emails.md)
- Cadencia comercial por correo (días 0, 3, 5, 7 por etapa abierta) (`crm-sales-cadence.md`): **F1 implementada**; **F2 pendiente** (token y página de baja `app/baja/page.tsx`, botón «Respondió», estado en la ficha, línea de baja en plantillas) y **F3 pendiente** (disparador horario n8n, guía, revisión) — [docs/specs/crm-sales-cadence.md:1-40, 171-195](docs/specs/crm-sales-cadence.md). El interruptor `CRM_SALES_CADENCE_ENABLED` "stays off until Phase 2 (unsubscribe link) is deployed" — [lib/env.ts:92-99](lib/env.ts), [modules/integrations/services/cadence.service.ts:42](modules/integrations/services/cadence.service.ts)
- No existe `app/baja/` en el árbol de rutas (listado de `app/`).
- Recordatorios: workflow n8n "Recordatorios diarios" a las 09:00 Lima, máx. 20/día, solo Nuevo/Contactado/Cotizado, uno por episodio de etapa, como **borrador para revisión humana** — [README.md:1515-1540](README.md)
- WhatsApp: "Nada se envía solo al runner: tú (o el comercial) revisas el borrador y lo envías a mano desde WhatsApp Business App" con enlace `wa.me` — [README.md:1147](README.md), [docs/specs/crm-leads-capture.md:103](docs/specs/crm-leads-capture.md); exclusión explícita: "Cualquier envío automático al corredor, por ningún canal… nada de automatizar WhatsApp Web, scraping" — [docs/specs/crm-journey-automation.md:36](docs/specs/crm-journey-automation.md). No hay código de WhatsApp Cloud API ni plantillas aprobadas por Meta (búsqueda `graph.facebook|Cloud API` solo en specs).
- Baja desde el CRM: "Pidió no seguir" (`contact_opt_out_at`, evento `lead.opted_out`, pasa a Perdido) — [lib/db-schema.ts:612-613](lib/db-schema.ts), [docs/specs/crm-journey-automation.md](docs/specs/crm-journey-automation.md) (P4)
- Consentimiento: casilla obligatoria con versión (`registro-web-v1`) y casilla de promociones opcional (`marketing_opt_in_at`); "Sin envíos de promociones en esta spec (YAGNI)" — [docs/specs/landing-omnichannel-capture.md:162](docs/specs/landing-omnichannel-capture.md). Textos legales Ley 29733 de `google-form-v1` e `import-mml-v1` pendientes del usuario (pregunta abierta 3) — [docs/specs/crm-journey-automation.md:~610](docs/specs/crm-journey-automation.md)
- Eventos `dead` se consultan a mano en el SQL Editor de Neon (sin UI) — [README.md:1333-1340](README.md)

### Inferences
- No hay capacidad de email marketing masivo (campañas a toda la base, segmentación, plantillas visuales, métricas de apertura); el diseño evita deliberadamente envíos masivos y WhatsApp automático. Si el cliente quiere mensajería masiva a 22.000 contactos, el repositorio no lo cubre.
- La dependencia de un n8n en la computadora del usuario es un punto único de fallo operativo (si la PC está apagada, los eventos esperan en Neon pero nada se procesa).

### Gaps
- No consta en el README qué servidor SMTP concreto se usa (solo "tu cuenta SMTP").
- No hay evidencia de que los flujos de correo al cliente se hayan activado en producción.

---

## 6. Fidelización: niveles, tarjeta de corredor, puntos, comunidad

### Takeaway
**Parcial**: hay programa de **referidos con "estrellas"** (ledger, canjes, beneficios y descuentos aplicables a reservas) y **código de descuento de bienvenida** (F1), pero **no existen niveles de corredor ni "tarjeta de corredor"**. La spec de recompensas sigue en **borrador** (implementada por orden del usuario sin aprobación formal) y el programa no tiene reglas ni premios configurados.

### Cited Findings
- `/cuenta/perfil` reúne "referidos, estrellas y canjes"; admin configura reglas y premios en `/crm/recompensas`; "Una reserva confirmada y su primer pago positivo no anulado permiten acreditar el referido" — [README.md:2385-2392](README.md)
- Tablas: `referral_codes`, `reward_rule_versions`, `reward_accounts`, `runner_referrals`, `reward_catalog_versions`, `reward_redemptions`, `reward_ledger`, `welcome_discount_versions`, `welcome_discount_codes`, `booking_benefits` — [lib/rewards-schema.ts:5-174](lib/rewards-schema.ts)
- Spec `accounts-runner-hub-rewards.md`: "Estado: borrador"; F1–F8 T4 marcadas `[x]`, F8-T5 (revisión independiente, pruebas autenticadas, build/Worker) pendiente; "el estado documental permanece borrador y no se alteró approvals.jsonl"; condiciones pendientes antes de activar: cantidades, coste de premios, topes, elegibilidad — [docs/specs/accounts-runner-hub-rewards.md:1-12, 270-335](docs/specs/accounts-runner-hub-rewards.md). No figura en `approvals.jsonl` (0 coincidencias).
- "No se sembraron reglas, premios ni noticias reales"; requiere migraciones 0011 y 0012 — [README.md:2397-2400](README.md)
- Descuento de bienvenida (`crm-welcome-discount.md`, aprobada): F1 implementada (configuración, emisión, correo); **F2 pendiente** (aplicación en la reserva, tarjeta en la ficha) — [docs/specs/crm-welcome-discount.md:151-164](docs/specs/crm-welcome-discount.md)
- Búsqueda de "tarjeta de corredor", "runner card", niveles/tier: sin resultados en código — búsqueda en repo.
- Comunidad: sección `CommunitySection` e invitación a referir según sesión (`CommunityReferralInvite`) en la landing; noticias editoriales — [modules/landing/components/](modules/landing/components/), commit `28be719`

### Inferences
- Los "puntos" del cliente equivaldrían a las "estrellas" ya modeladas (ledger idempotente); niveles y tarjeta serían desarrollo nuevo sobre esa base.

### Gaps
- No se encontraron specs de niveles ni de tarjeta de corredor.

---

## 7. Infraestructura (Workers/OpenNext, Neon, Clerk; gratuito vs pago; VPS; dónde corre n8n)

### Takeaway
Cloudflare Workers **Free** vía OpenNext, Neon PostgreSQL **Free** (región São Paulo), Clerk (instancias dev y prod), Turnstile (gratuito), Stripe (solo TEST), Microsoft Clarity, Gemini (opcional, plan gratuito mencionado) y **n8n Community autoalojado en la computadora del usuario (Docker)**. **No se usa ningún VPS**. Dominio `carreras-viajeras.mentec.dev`.

### Cited Findings
- "Ejecución prevista: Cloudflare Workers Free mediante OpenNext"; "Datos: Neon PostgreSQL Free + Drizzle con driver HTTPS `neon-http`"; "Identidad: Clerk"; "Automatización: … n8n Community local"; "No se utiliza D1 ni Hyperdrive" — [README.md:7-20](README.md)
- Workers Free limita a 10 ms de CPU por petición (error 1102); CRM, perfil, `/mis-carreras` y envíos de formularios "**pueden seguir dando 1102 en Workers Free**, sobre todo en isolates fríos" — [README.md:76, 84](README.md); pendiente comprobar en Workers Logs que no hay `exceededCpu` tras despliegue — [README.md:86-88](README.md)
- `wrangler.jsonc`: worker `carreras-viajeras`, `workers_dev: false`, `preview_urls: false`, bindings `ASSETS` y `WORKER_SELF_REFERENCE`, observabilidad activada, ruta con dominio propio `carreras-viajeras.mentec.dev` — [wrangler.jsonc](wrangler.jsonc)
- Neon: proyecto `carreras-viajeras`, rama `production`, región AWS São Paulo, base `neondb` — [README.md:92](README.md)
- Clerk: instancia de desarrollo (localhost) y de producción para el dominio — [README.md:93](README.md)
- n8n: "corre en tu computadora y no tiene dirección pública" — [README.md:1147](README.md); n8n 2.43.7 en Docker Desktop/Engine — [README.md:2031-2040](README.md). Búsqueda de VPS/Hostinger/DigitalOcean/Railway/n8n Cloud: sin resultados.
- Gemini: "en el plan gratuito de la API de Gemini, Google puede usar lo que le envías para mejorar sus productos" — [README.md:1290](README.md)
- Turnstile: "control antispam gratuito de Cloudflare" — [README.md:1117](README.md)
- Clarity: ID de proyecto público configurado por variable de build — [README.md:2356](README.md)
- Dependencias clave: `next ^16.4.2`, `react 19.2.8`, `@clerk/nextjs ^7.9.22`, `drizzle-orm 0.45.4`, `@neondatabase/serverless 1.2.0`, `stripe 23.0.1`, `zod ^4.6.5`, `@opennextjs/cloudflare ^1.20.12`, `wrangler ^4.151.1` — [package.json](package.json)
- 22 migraciones `0000`–`0021`, aplicadas a mano; según README, en production constan aplicadas `0000`–`0017` (incluidas 0013, 0015) y `0020`–`0021`; el README "no registra el estado de `0018`–`0021`" en un párrafo y en otro registra `0020`/`0021` aplicadas el 2026-10-30 — [README.md:72, 1676](README.md)

### Inferences
- Servicios con nivel gratuito usados hoy: Workers Free, Neon Free, Turnstile, Clarity, plan gratuito de Gemini, n8n Community (software libre, coste = máquina propia), Clerk (tiene plan gratuito; el plan concreto no consta en el repo). Stripe cobra por transacción (sin coste fijo; inferencia general, a confirmar por el investigador de precios).
- Riesgo operativo: el límite de CPU de Workers Free afecta precisamente al CRM y a los envíos de formulario; escalar el CRM probablemente exija Workers Paid (inferencia a partir de README.md:84).
- El estado de `0018`/`0019` (cadencia y descuento de bienvenida) en production no consta: si no están aplicadas, esas funciones no pueden activarse en producción.

### Gaps
- No hay en el repositorio datos de consumo ni de plan contratado de Clerk/Neon/Cloudflare.

---

## 8. Tests y estado de validación documentado

### Takeaway
Hay una suite amplia de tests unitarios (179 archivos `*.test.ts(x)`; una spec cita "1.764 tests") con PGlite para servicios; validaciones locales de build/Worker registradas en fechas concretas. **Pendientes** las validaciones autenticadas en el dominio real, la prueba funcional de Stripe test, el checklist de Clerk producción, Workers Logs sin `exceededCpu` y la activación real de correos.

### Cited Findings
- 179 archivos de test fuera de `node_modules` (conteo con `find`) — repositorio.
- "1.764 tests de la aplicación pasan antes del rediseño" — [docs/specs/crm-admin-panel.md:84](docs/specs/crm-admin-panel.md)
- Tests de correo con "PostgreSQL embebido (PGlite), sin credenciales ni conexión a Neon" — [README.md:2018](README.md)
- Validado en local 2026-10-29: `npm run build`, `npm run build:worker`, preview con `wrangler dev` (respuestas `x-opennext-cache: HIT`, 503 controlados sin base) para `/`, `/contacto`, `/viajes/*` — [README.md:86-88](README.md)
- Pendientes declarados: carga con datos reales de Neon; preselección de `?destino=`/UTM "solo cubiertos por unit tests"; comprobar Workers Logs tras despliegue — [README.md:86-88](README.md); Stripe: prueba funcional 4.2 y fallo de Workers Builds en ramas — [README.md:1670-1673](README.md); Clarity: comprobaciones en el dominio real tras despliegue — [README.md:2372-2378](README.md); recompensas: "pruebas autenticadas y build/Worker" pendientes, "bloqueadas por credenciales/red" — [docs/specs/accounts-runner-hub-rewards.md:292, 331-333](docs/specs/accounts-runner-hub-rewards.md)
- Checklist manual de Clerk en producción sin marcar — [README.md:180-194](README.md)
- Auditoría 2026-10-29: 26 tablas, migraciones 0000–0012 aplicadas sobre PostgreSQL 18.6 desechable; riesgos operativos pendientes (BIZ-01) — [docs/audits/2026-10-29-runner-news.md:47-68](docs/audits/2026-10-29-runner-news.md)

### Inferences
- La calidad de ingeniería (tests, specs, revisión) es alta, pero la **validación end-to-end en producción está mayoritariamente pendiente**; un proveedor externo partiría de código probado en unidad, no de un sistema operado en producción.

### Gaps
- No se ejecutaron tests en esta investigación (restricción de solo lectura); no se puede afirmar que la suite pase en el estado actual.

---

## 9. Huecos conocidos, TODOs y fases pendientes (resumen transversal)

### Takeaway
Lo pendiente se concentra en: activación operativa (Clerk prod, Turnstile, correos, n8n), cobro real (Stripe live o Mercado Pago), baja por enlace, búsqueda/duplicados en el CRM, importación masiva con consentimiento, más carreras en el catálogo, SEO técnico, portal del patrocinador y gobernanza de specs en borrador ya implementadas.

### Cited Findings
- Inventario de specs (Estado en cabecera):
  - **Aprobadas** (37): accounts-auth-ui, accounts-clerk-rbac, accounts-header-menu, accounts-role-requests, accounts-roles-permissions, accounts-runner-profiles, accounts-user-management, analytics-clarity, automation-outbox, bookings-stripe-checkout, -demo, -demo-crm-list, -demo-runner-ux, -production, crm-funnel-email-automation, crm-journey-automation, crm-leads-capture, crm-leads-pipeline, crm-lifecycle-emails, crm-sales-cadence, crm-sidebar-carreras, crm-users-checkout-toggle(-detail), crm-welcome-discount, landing-home-redesign, landing-omnichannel-capture, landing-public-site, landing-race-pages, landing-registration-visits, landing-single-lead-form, platform-neon-foundation, platform-workers-free-cache, runner-portal, sponsors-portal, trips-catalog, trips-commercial-offers — cabeceras `- Estado:` de [docs/specs/](docs/specs/)
  - **Borrador** (6): accounts-runner-hub-rewards (implementada), crm-admin-panel (tareas marcadas), landing-news-updates (módulo de contenido existe), platform-pr-integration, bookings-stripe-checkout-card-only-amendment, stripe-checkout-sandbox — [docs/specs/](docs/specs/)
- `approvals.jsonl` registra aprobaciones con `approver` "ronalehm" y muchas con "Claude <noreply@anthropic.com>" (identidad git de la máquina donde corrió el hook) — [docs/specs/approvals.jsonl](docs/specs/approvals.jsonl)
- Fases pendientes concretas:
  - `crm-sales-cadence` F2 (baja por enlace, «Respondió») y F3 (n8n, activación) — [docs/specs/crm-sales-cadence.md:179-195](docs/specs/crm-sales-cadence.md)
  - `crm-lifecycle-emails` F3 — [docs/specs/crm-lifecycle-emails.md:243-254](docs/specs/crm-lifecycle-emails.md)
  - `crm-welcome-discount` F2 — [docs/specs/crm-welcome-discount.md:159-164](docs/specs/crm-welcome-discount.md)
  - `accounts-runner-hub-rewards` F8-T5 y aprobación formal — [docs/specs/accounts-runner-hub-rewards.md:292](docs/specs/accounts-runner-hub-rewards.md)
  - `sponsors-portal` F4 (`/patrocinador`) sin ruta en `app/` — [docs/specs/sponsors-portal.md:131](docs/specs/sponsors-portal.md)
  - `runner-portal` declarado "F1–F2 implementadas, F3–F6 pendientes" en una referencia antigua (2026-10-25) — [docs/specs/crm-journey-automation.md:9](docs/specs/crm-journey-automation.md); posteriormente `/mis-carreras` aparece implementado en el README — [README.md:2387](README.md) (las fuentes no coinciden en fecha; la más reciente es el README)
- Preguntas abiertas del usuario en `crm-journey-automation.md`: condiciones de reserva US$200, textos legales Ley 29733, columnas reales de Google Forms y del CSV, permiso del referente, slugs `?origen=`, responsable por defecto de importados, reactivación tras baja, aviso de duplicados en alta manual — [docs/specs/crm-journey-automation.md:~600-620](docs/specs/crm-journey-automation.md)
- Organizaciones de colaboradores "siguen pendientes de su spec" — [README.md:21](README.md)
- Seed de viajes "no se ha ejecutado en ninguna rama" — [README.md:400](README.md)
- Tablas huérfanas `automation_events`/`automation_event_redrives` en production pendientes de limpieza autorizada — [README.md:72](README.md)
- `CLAUDE.md` debe actualizarse tras Clerk prod (lo hace el usuario) — [README.md:169](README.md)

### Inferences
- Para comparar con propuestas externas, el repositorio ya cubre (en código) la mayor parte de "landing + captura QR + CRM de embudo + reservas + portal del corredor"; las brechas son sobre todo **operativas** (activar y validar en producción) y algunas **funcionales** (cobro real, WhatsApp API, email masivo, importación grande, búsqueda/dedupe, tareas, niveles/tarjeta de fidelidad, SEO técnico).
- Hay una tensión de gobernanza: funciones implementadas con specs en borrador (recompensas, panel CRM, noticias), lo que el propio flujo del proyecto prohíbe; conviene regularizarlo antes de presentarlo como "terminado".

### Gaps
- No se revisó el contenido completo de las 43 specs ni de los 2.405 renglones del README; el inventario prioriza las secciones relevantes para la comparación.
- No se verificó el estado real en Cloudflare, Neon, Clerk ni n8n (fuera de alcance: solo lectura local).
