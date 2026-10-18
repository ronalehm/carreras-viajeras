# Landing pública de Carreras Viajeras

- Módulo: landing
- Estado: borrador
- Orden en el roadmap: 4 de 5 (`crm-auth` → `trips-catalog` → `crm-leads-pipeline` → `landing-public-site` → `platform-cloudflare-deploy`)
- Depende de: `trips-catalog.md` Fases 1–3 (`listPublishedTrips`, `formatPrice`, `lib/dates.ts`, `lib/formState.ts`, shadcn `badge`, `field`, `input`, `textarea`, `native-select`), `crm-leads-pipeline.md` Fase 1 (`createLead`, `createLeadSchema`, shadcn `card`) — solo para la Fase 2 de esta spec — y `crm-auth.md` (`lib/env.ts`, ampliado en Fase 3).

## Objetivo
Página pública en `carreras-viajeras.mentec.dev` para corredores que quieren viajar a correr maratones y carreras en otras ciudades o países: presenta la propuesta (running + turismo), muestra el catálogo de viajes publicado desde el CRM y capta interesados con un formulario que crea un lead en el CRM, con protección básica contra spam.

## Alcance
- Incluye:
  - Layout público (cabecera con anclas y pie) y `lang="es"` + metadata en el layout raíz.
  - Secciones: hero, catálogo de viajes publicados (tarjetas), beneficios y contacto.
  - Formulario de contacto → `createLead()` del CRM, con validación zod y honeypot (F2).
  - Cloudflare Turnstile (gratuito) en el formulario (F3).
  - FAQ y testimonios (F4), **bloqueada hasta tener contenido real** del usuario.
  - Ejemplo de catálogo: "Maratón de Santiago 2027" (viene del seed de `trips-catalog`).
- No incluye:
  - Página de detalle por viaje, reservas o pagos en línea.
  - Blog, multi-idioma, modo oscuro conmutable, analítica, cookies de marketing.
  - Preseleccionar el viaje en el formulario desde la tarjeta (la tarjeta solo lleva a `#contacto`).
  - Casilla de consentimiento / política de privacidad (pendiente de textos legales; ver Preguntas abiertas).
  - Email de confirmación al interesado o aviso al equipo.
  - Rate limiting propio (se puede añadir una regla de Cloudflare WAF al desplegar).
  - Inventar testimonios, cifras o beneficios no confirmados por el usuario.

## Requisitos
1. La landing es una sola página (`/`) con anclas: `#catalogo`, `#beneficios`, `#contacto` (y `#preguntas` en F4).
2. El catálogo muestra solo viajes publicados, ordenados por fecha de carrera; cada tarjeta: imagen (o marcador visual si no hay), título, ciudad y país, fecha, distancias, descripción resumida, precio ("Precio a consultar" si no hay) y botón "Quiero información" (F2, a `#contacto`).
3. Sin viajes publicados se muestra "Pronto anunciaremos nuevos viajes."
4. La página se renderiza por petición (`await connection()`), así un viaje publicado en el CRM aparece al recargar.
5. Formulario (F2): Nombre*, Email*, Teléfono / WhatsApp, Viaje de interés (lista de publicados + "Aún no lo sé"), Mensaje. Validación con `createLeadSchema` en el servidor (+ `required`/`type="email"` en el HTML). Errores bajo cada campo y valores conservados.
6. Honeypot (F2): campo oculto `website`; si llega con valor, se responde éxito sin guardar nada.
7. Éxito: "¡Gracias! Te contactaremos pronto." y el formulario queda vacío. Error de servidor: "No pudimos enviar tu mensaje. Inténtalo de nuevo en unos minutos."
8. Turnstile (F3): el envío exige un token válido verificado en el servidor (`siteverify`); si falta la clave secreta en el servidor, el envío falla de forma controlada y se registra el error. Tras cada envío el widget se reinicia (el token es de un solo uso).
9. Textos visibles en español. Textos de marketing provisionales (ver Diseño técnico) hasta que el usuario entregue los definitivos.

## Criterios de aceptación
- [ ] (F1) Dado el seed local, cuando abro `/`, entonces veo hero, la sección "Próximas carreras" con la tarjeta "Maratón de Santiago 2027" (Santiago, Chile, fecha en español, distancias, "Precio a consultar") y la sección de beneficios; el viaje en borrador no aparece.
- [ ] (F1) Dado que despublico todos los viajes en el CRM, cuando recargo `/`, entonces veo "Pronto anunciaremos nuevos viajes."
- [ ] (F1) Dado el HTML de `/`, cuando lo inspecciono, entonces `<html lang="es">` y el `<title>` es "Carreras Viajeras".
- [ ] (F1) Dada la cabecera pública, cuando pulso "Viajes" o "Beneficios", entonces navego a la sección correspondiente; no hay enlaces al CRM.
- [ ] (F1) Dado un viaje con `imageUrl`, cuando se muestra la tarjeta, entonces la imagen se carga con `next/image` (`unoptimized`); sin `imageUrl` se ve un marcador con un icono.
- [ ] (F2) Dado el formulario completo y válido, cuando pulso "Enviar", entonces veo "¡Gracias! Te contactaremos pronto.", el formulario queda vacío y el lead aparece en la columna "Nuevo" de `/crm` con el viaje elegido.
- [ ] (F2) Dado un email inválido, cuando envío, entonces veo el error bajo "Email", el resto de valores se conserva y no se crea lead.
- [ ] (F2) Dado el campo `website` con valor, cuando se ejecuta la action, entonces devuelve éxito y no llama a `createLead` (unit test).
- [ ] (F2) Dado que `createLead` lanza, cuando se ejecuta la action, entonces devuelve el mensaje de error genérico (unit test).
- [ ] (F2) Dada una tarjeta del catálogo, cuando pulso "Quiero información", entonces bajo a `#contacto`.
- [ ] (F3) Dado `next dev` con las claves de prueba de Turnstile en `.dev.vars`, cuando envío el formulario, entonces el widget aparece y el lead se crea.
- [ ] (F3) Dado un token rechazado por `siteverify` (o ausente), cuando se ejecuta la action, entonces devuelve "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo." y no crea lead (unit test).
- [ ] (F3) Dado `verifyTurnstileToken`, cuando `fetch` falla o la respuesta no es `success: true`, entonces devuelve `false` (unit test).
- [ ] (F4) Dado el contenido real entregado por el usuario, cuando abro `/`, entonces veo la sección de preguntas frecuentes (acordeón) y la de testimonios con ese contenido.
- [ ] (todas) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

## Diseño técnico
Sigue el "Patrón de datos" de `trips-catalog.md`.

### Rutas (`app/`)
- `app/layout.tsx` (F1, modificar): `lang="es"`; `metadata = { title: { default: "Carreras Viajeras", template: "%s · Carreras Viajeras" }, description: "Paquetes de viaje para correr maratones y carreras en otras ciudades y países." }`.
- `app/page.tsx` (F1): **eliminar** (lo reemplaza `app/(public)/page.tsx`; ambos resolverían `/`).
- `app/(public)/layout.tsx` (F1, nuevo): `<SiteHeader />`, `<main>{children}</main>`, `<SiteFooter />`.
- `app/(public)/page.tsx` (F1, nuevo): `await connection(); const trips = await listPublishedTrips();` y compone `<HeroSection />`, `<TripCatalog trips={trips} />`, `<BenefitsSection />`; F2 añade `<ContactSection tripOptions={trips.map(({ id, title }) => ({ id, title }))} />`; F4 añade `<TestimonialsSection />` y `<FaqSection />`.

### Componentes
| Componente | Tipo | Detalle |
|---|---|---|
| `card`, `badge`, `button` | shadcn (instalados por specs anteriores) | Tarjetas, distancias, CTAs (`buttonVariants` en enlaces) |
| `field`, `input`, `textarea`, `native-select` | shadcn (instalados en `trips-catalog` F3) | Formulario de contacto |
| `accordion` | shadcn (instalar en F4: `npx shadcn@latest add accordion`) | FAQ |
| `TripCard` | nuevo, `modules/trips/components/TripCard.tsx` (dominio viajes) | Server Component. Props: `title`, `city`, `country`, `raceDate`, `distances`, `description`, `price`, `currency`, `imageUrl` (solo los campos que usa). `Card`; `next/image` con `fill`, `sizes` y `unoptimized` (no hay binding de Images en Fase 0); sin imagen → bloque `bg-muted` con icono de `lucide-react`. Descripción con `line-clamp-3`. F2: botón "Quiero información" → `#contacto` |
| `TripCatalog` | nuevo, `modules/trips/components/TripCatalog.tsx` | Server Component. Props `trips: Trip[]`. `<section id="catalogo">`, título "Próximas carreras", rejilla responsive de `TripCard`; vacío "Pronto anunciaremos nuevos viajes." |
| `SiteHeader` | nuevo, `modules/landing/components/SiteHeader.tsx` | Marca "Carreras Viajeras" + anclas Viajes, Beneficios (F2: Contacto; F4: Preguntas) |
| `SiteFooter` | nuevo, `modules/landing/components/SiteFooter.tsx` | "© {año} Carreras Viajeras" |
| `HeroSection` | nuevo, `modules/landing/components/HeroSection.tsx` | Título provisional "Corre maratones en otras ciudades y países", subtítulo provisional "Paquetes de viaje para corredores: la carrera y el turismo en un solo viaje.", CTA "Ver viajes" → `#catalogo` (F2: + "Quiero viajar" → `#contacto`). Fondo con tokens del tema (sin foto hasta tener imágenes reales) |
| `BenefitsSection` | nuevo, `modules/landing/components/BenefitsSection.tsx` | `<section id="beneficios">` con 3 beneficios provisionales e icono `lucide-react`: "Carrera y turismo en un solo viaje", "Nos ocupamos de la logística", "Atención personalizada" (cada uno con una frase corta). Contenido en un array local del componente |
| `ContactSection` | nuevo (F2), `modules/landing/components/ContactSection.tsx` | Server Component. `<section id="contacto">`, título "¿Quieres correr con nosotros?". Props `tripOptions: { id: string; title: string }[]`. Renderiza `<ContactForm action={submitContactAction} tripOptions={tripOptions} />`. F3: lee `getServerEnv().TURNSTILE_SITE_KEY` y lo pasa como `turnstileSiteKey` |
| `ContactForm` | nuevo (F2), `modules/landing/components/ContactForm.tsx` | `"use client"`. `useActionState(action, INITIAL_FORM_STATE)`. Campos `name`, `email`, `phone`, `tripId` (`NativeSelect`, opción vacía "Aún no lo sé"), `message`, honeypot `website` (envuelto en un contenedor fuera de pantalla con `aria-hidden="true"`, `tabIndex={-1}`, `autoComplete="off"`). Mensaje de estado con `role="status"`. Botón deshabilitado con `pending`. F3: incluye `<TurnstileWidget siteKey={turnstileSiteKey} resetSignal={state} />` |
| `TurnstileWidget` | nuevo (F3), `modules/landing/components/TurnstileWidget.tsx` | `"use client"`. Carga `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` con `next/script` y renderiza el widget en un `div` (`turnstile.render(el, { sitekey })`), que añade al formulario el campo oculto `cf-turnstile-response`. Llama `turnstile.reset()` cuando cambia `resetSignal`. Tipado mínimo local de `window.turnstile`, sin dependencias |
| `FaqSection` | nuevo (F4), `modules/landing/components/FaqSection.tsx` | `<section id="preguntas">` con `Accordion`; preguntas en array local. Contenido: pendiente del usuario |
| `TestimonialsSection` | nuevo (F4), `modules/landing/components/TestimonialsSection.tsx` | Tarjetas con cita, nombre y carrera. Contenido: pendiente del usuario |

No existen componentes de landing en el proyecto ni bloques de shadcn equivalentes (los bloques de shadcn son de login, sidebar, dashboard).

### Actions, `lib/`
- `modules/landing/actions/contact.actions.ts` (F2, `"use server"`, pública, sin `requireCrmUser`):
  ```ts
  export function submitContactAction(prev: FormState, formData: FormData): Promise<FormState>;
  ```
  1. Si `formData.get("website")` tiene valor → `{ status: "success", message: "¡Gracias! Te contactaremos pronto." }` sin guardar.
  2. (F3) Verificar Turnstile: `secret = getServerEnv().TURNSTILE_SECRET_KEY`; si falta → `console.error` + error genérico; `verifyTurnstileToken({ token: formData.get("cf-turnstile-response"), secret, remoteIp: (await headers()).get("cf-connecting-ip") })`; si `false` → `{ status: "error", message: "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo." }`.
  3. `createLeadSchema.safeParse(...)` (de `@/modules/crm`) con los campos `name`, `email`, `phone`, `tripId`, `message` → error `{ status: "error", message: "Revisa los campos marcados.", fieldErrors, values }`.
  4. `createLead(input)` en `try/catch` → error genérico del requisito 7.
  5. `revalidatePath("/crm")` → éxito.
- `lib/turnstile.ts` (F3, nuevo; compartido por si otro formulario lo necesita y porque habla con un servicio externo genérico):
  ```ts
  export function verifyTurnstileToken(params: { token: string | null; secret: string; remoteIp?: string | null }): Promise<boolean>;
  // POST application/x-www-form-urlencoded a https://challenges.cloudflare.com/turnstile/v0/siteverify
  // con secret, response y remoteip; valida la respuesta con zod ({ success: boolean }); token vacío, error de red o respuesta inválida → false
  ```
- `lib/env.ts` (F3, modificar): añadir `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` como `z.string().min(1).optional()` (opcionales en el schema para no romper el CRM si faltan; la action falla cerrado).
- Desarrollo local (`.dev.vars`): claves de prueba oficiales de Turnstile — site key `1x00000000000000000000AA` y secret `1x0000000000000000000000000000000AA` (siempre válidas).

### API pública
- `modules/trips/index.ts` (F1): añade `TripCatalog`.
- `modules/landing/index.ts` (F1, nuevo): `SiteHeader`, `SiteFooter`, `HeroSection`, `BenefitsSection`; F2: `ContactSection`; F4: `FaqSection`, `TestimonialsSection`.

## Reutilización
- `listPublishedTrips`, `type Trip` (`@/modules/trips`), `formatPrice` (utilidad del módulo trips, usada dentro de `TripCard`), `formatDate` (`@/lib/dates`).
- `createLead`, `createLeadSchema` (`@/modules/crm`): la landing no define su propio schema de lead (DRY).
- `FormState`/`INITIAL_FORM_STATE` (`@/lib/formState`), `getServerEnv` (`@/lib/env`).
- shadcn ya instalados: `button`, `badge`, `card`, `field`, `input`, `textarea`, `native-select`. Nuevo en F4: `accordion`.
- `lucide-react` para iconos.

## Tests
- `modules/landing/actions/contact.actions.test.ts` (mock de `@/modules/crm` → `createLead`, de `next/cache`, `next/headers`, `@/lib/env` y `@/lib/turnstile`):
  - (F2) honeypot con valor → éxito y `createLead` no llamado; datos inválidos → `fieldErrors` y `values` sin `website`; válido → `createLead` con `phone`/`tripId`/`message` `null` si vacíos, revalida `/crm`, éxito; `createLead` lanza → error genérico.
  - (F3) sin `TURNSTILE_SECRET_KEY` → error y sin `createLead`; `verifyTurnstileToken` → `false` → mensaje de verificación y sin `createLead`; `true` → sigue el flujo; se pasa `cf-connecting-ip` como `remoteIp`.
- `lib/turnstile.test.ts` (F3, `fetch` mockeado): `success: true` → `true`; `success: false` → `false`; token vacío → `false` sin llamar a `fetch`; `fetch` lanza → `false`; respuesta sin `success` → `false`; el body incluye `secret`, `response` y `remoteip`.
- Sin test: secciones y tarjetas (presentacionales), `ContactForm` y `TurnstileWidget` (componentes del módulo, no de `components/shared`), layouts y páginas.

## Plan de tareas
### Fase 1 — Sitio público con catálogo
- [ ] T1 — Layout raíz en español con metadata y eliminar `app/page.tsx` · archivos: `app/layout.tsx`, `app/page.tsx` (eliminar) · depende de: — · secuencial (base)
- [ ] T2 — `TripCard` y `TripCatalog` · archivos: `modules/trips/components/TripCard.tsx`, `modules/trips/components/TripCatalog.tsx` · depende de: — · paralelo con T3
- [ ] T3 — Componentes de la landing y API pública del módulo · archivos: `modules/landing/components/SiteHeader.tsx`, `modules/landing/components/SiteFooter.tsx`, `modules/landing/components/HeroSection.tsx`, `modules/landing/components/BenefitsSection.tsx`, `modules/landing/index.ts` · depende de: T1 · paralelo con T2
- [ ] T4 — Rutas públicas y export de `TripCatalog` · archivos: `modules/trips/index.ts`, `app/(public)/layout.tsx`, `app/(public)/page.tsx` · depende de: T2, T3 · secuencial

### Fase 2 — Formulario de contacto → lead en el CRM
(requiere `crm-leads-pipeline` Fase 1 implementada)
- [ ] T1 — `submitContactAction` con honeypot y tests · archivos: `modules/landing/actions/contact.actions.ts`, `modules/landing/actions/contact.actions.test.ts` · depende de: — · secuencial
- [ ] T2 — `ContactForm` y `ContactSection` · archivos: `modules/landing/components/ContactForm.tsx`, `modules/landing/components/ContactSection.tsx` · depende de: T1 · secuencial
- [ ] T3 — Enlaces a `#contacto` (cabecera, hero, tarjeta), exports y página · archivos: `modules/landing/components/SiteHeader.tsx`, `modules/landing/components/HeroSection.tsx`, `modules/trips/components/TripCard.tsx`, `modules/landing/index.ts`, `app/(public)/page.tsx` · depende de: T2 · secuencial

### Fase 3 — Cloudflare Turnstile
- [ ] T1 — Variables de Turnstile en `lib/env.ts` y `lib/turnstile.ts` con tests · archivos: `lib/env.ts`, `lib/turnstile.ts`, `lib/turnstile.test.ts` · depende de: Fase 2 · secuencial (base)
- [ ] T2 — `TurnstileWidget`, integración en formulario/sección y verificación en la action con tests · archivos: `modules/landing/components/TurnstileWidget.tsx`, `modules/landing/components/ContactForm.tsx`, `modules/landing/components/ContactSection.tsx`, `modules/landing/actions/contact.actions.ts`, `modules/landing/actions/contact.actions.test.ts` · depende de: T1 · secuencial

### Fase 4 — Preguntas frecuentes y testimonios (bloqueada: no se implementa hasta que el usuario entregue el contenido; al recibirlo se añade a esta spec, que vuelve a borrador y requiere nueva aprobación)
- [ ] T1 — Instalar shadcn `accordion` · archivos: `components/ui/accordion.tsx` · depende de: Fase 1 · secuencial (base)
- [ ] T2 — `FaqSection`, `TestimonialsSection`, enlace "Preguntas", exports y página · archivos: `modules/landing/components/FaqSection.tsx`, `modules/landing/components/TestimonialsSection.tsx`, `modules/landing/components/SiteHeader.tsx`, `modules/landing/index.ts`, `app/(public)/page.tsx` · depende de: T1 · secuencial

## Preguntas abiertas
1. **Referencia visual:** el sitio de ejemplo que diste (`carreras-viajeras-santiago-2027.ronaldlora.chatgpt.site`, viaje a la Maratón de Santiago 2027) está bloqueado por la red de este entorno. ¿Puedes compartir capturas y/o los textos (titulares, beneficios, colores, tipografía) para alinear el diseño?
2. **Textos y fotos reales:** titular y subtítulo del hero, beneficios (los actuales son provisionales), logo, fotos del hero y de cada viaje.
3. **FAQ y testimonios:** ¿tienes preguntas frecuentes y testimonios reales (con permiso de los clientes)? Sin ellos la Fase 4 no se implementa.
4. **Turnstile:** recomendado (gratis, sin captcha molesto en la mayoría de casos, de Cloudflare). ¿Lo activamos? Requiere crear un widget en el panel de Cloudflare para `carreras-viajeras.mentec.dev` (lo hace el usuario; ver `platform-cloudflare-deploy`).
5. **Privacidad:** ¿necesitas casilla de consentimiento y página de política de privacidad (según el país, la ley de protección de datos puede exigirlo)? ¿Tienes el texto legal?
6. **Contacto alternativo:** ¿quieres mostrar WhatsApp, email o redes sociales en el pie o el hero? ¿Cuáles?
