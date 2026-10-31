# Analítica: Microsoft Clarity con consentimiento

- Estado: aprobado
- Módulos: shared (componente de analítica), landing (pie, máscaras del formulario), accounts (máscaras del menú) y layout raíz.
- Origen: encargo «Clarity-encargo-Claude-Code.txt» del propietario (2026-10-31). Esta spec fija sus decisiones. No aprueba ningún despliegue.
- Referencias: instalación, `identify`, `consentv2` y `data-clarity-mask` en learn.microsoft.com/clarity; `next/script` en `node_modules/next/dist/docs/01-app/02-guides/scripts.md`.

## Verificado en el repo (main 002b56d)
- `app/layout.tsx` conserva `ClerkProvider` (esMX) y `Providers` (QueryClient); el layout raíz es un Server Component.
- No hay ninguna instalación de Clarity ni un gestor de consentimiento de analítica. `lib/registrationConsent.ts` trata el texto legal del registro y es otra cosa.
- `AccountMenu` (modules/accounts) existe; su menú se monta con un portal de Base UI.
- Las fichas de viaje se sirven por `rewrites` desde `/viajes/ficha_viaje` y `/viajes/ficha_viaje/registro`. En el navegador, `usePathname()` devuelve la URL visible: `/viajes/<slug>` y `/viajes/<slug>/registro`.
- Desde este entorno no se pudo descargar `https://www.clarity.ms/tag/z63dn24o7t` (el proxy lo bloquea). Por eso no se ha comprobado cómo se comportan en el tag alojado `stop`, `start` ni el reinicio de identidad. El diseño no depende de ellos: usa límites de documento.

## Diferencias con el encargo y su efecto
1. **`/contacto` ya no tiene formulario** (PR 59): solo lista maratones y WhatsApp. El único formulario de datos está ahora en `/viajes/<slug>/registro`, que el encargo excluye. Efecto: con esta spec no se mide la página de conversión. Si se quiere medir, hará falta otra enmienda que la incluya con máscaras.
2. **Rutas públicas reales:** `/viajes/ficha_viaje` es la ficha interna. La regla se aplica a `/viajes/<slug>`, que es lo que ve el navegador, y excluye `/viajes/<slug>/registro`, `/viajes/<slug>/checkout` y `/viajes/ficha_viaje*`.
3. **`/contacto` redirige en el cliente** (`router.replace`) los enlaces antiguos `?destino=` a `/viajes/<slug>/registro`, una ruta excluida. Esa redirección pasa a ser una navegación de documento completa (`window.location.replace`).

## Diseño

### A. Configuración
- Variable opcional y pública `NEXT_PUBLIC_CLARITY_PROJECT_ID`, leída de forma literal (`process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID`). Valor de producción: `z63dn24o7t`. Va en el entorno de **build** de Workers Builds/CI, porque ponerla solo en `wrangler.jsonc` no cambia un bundle ya construido.
- `getClarityProjectId(raw)` devuelve el ID si cumple `/^[a-z0-9]+$/i`, o `null` si falta, está vacío o es inválido. Con `null` no hay banner ni script. Nunca llama a `getEnv()`.
- Solo se activa en `NODE_ENV === "production"` y con `location.hostname === "carreras-viajeras.mentec.dev"` exacto.

### B. Consentimiento
- La preferencia se guarda en `localStorage["cv:analytics-consent:v1"]` como `{ version: 1, analytics: "granted" | "denied", updatedAt: ISO }`.
- `readAnalyticsConsent(raw, now)` valida el valor como `unknown`. Si es corrupto, desconocido o tiene más de 180 días, devuelve `null` (pendiente). Revisar la preferencia no renueva su fecha. Si `localStorage` falla, la preferencia queda pendiente y no se carga nada.
- El banner es pequeño, no modal y no tapa la barra móvil fija. Tiene los botones reales «Aceptar analítica» y «Rechazar», con el texto del encargo. Solo aparece si la integración está activa, la ruta está permitida y la preferencia está pendiente.
- El pie (`SiteFooter`) tiene el botón «Preferencias de analítica», que vuelve a abrir el banner.
- Al aceptar, antes de insertar el tag, se pone en la cola `clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" })`.
- Al rechazar o retirar el consentimiento:
  - se envía `consentv2` con los dos valores en `"denied"`;
  - se borran solo las cookies `_clck` y `_clsk`, con los dominios y rutas que use Clarity;
  - se hace una **recarga completa** del documento, que es la única forma demostrable de descargar el JavaScript que ya se ejecutó;
  - no se toca ninguna otra cookie (Clerk, sesión ni esenciales).

### C. Rutas y límite público → privado
- `isClarityPathAllowed(pathname)` clasifica por segmentos completos, sin la query.
- **Rutas permitidas:**
  - `/`;
  - `/noticias` y `/noticias/<slug>`;
  - `/viajes/<slug>`, si el slug no es `ficha_viaje`;
  - `/contacto`.
- **Todo lo demás queda denegado.** Entre otras:
  - `/crm/**`, `/api/**`, `/cuenta/**`, `/mis-carreras/**`, `/r/**`;
  - `/viajes/<slug>/registro`, `/viajes/<slug>/checkout` y cualquier otra subruta de `/viajes`.
- **El tag solo se carga en un documento cuya ruta actual esté permitida.** Una vez cargado, el documento queda «marcado», y salir hacia una ruta denegada siempre abre un documento nuevo:
  1. **Clics:** mientras el tag está cargado o cargándose, un listener de `click` en fase de captura sobre `document` detecta los enlaces del mismo origen cuyo destino está denegado. En ese caso cancela la navegación del cliente (`preventDefault`) y navega con `window.location.assign(href)`. Así cubre `<Link>`, el menú de cuenta en el portal y los botones de Clerk que son enlaces. No se parchea `history`.
  2. **Navegaciones por código** en páginas públicas hacia rutas denegadas: hoy solo existe la de `/contacto` (diferencia 3), que pasa a ser una navegación completa.
  3. **Red de seguridad:** si aun así el `pathname` cambia a una ruta denegada en un documento marcado (atrás/adelante dentro del mismo documento, o el cierre de sesión de Clerk que redirige a `/cuenta`), se recarga el documento al momento con `location.reload()`, sin insertar ni identificar nada. Ese instante entre el cambio y la recarga es un riesgo residual: se documenta y se reduce con 1 y 2.
- Atrás o adelante hacia una página que se cargó en otro documento abre ese documento. Si su ruta es denegada, no carga el tag.
- Nunca se envían como etiquetas la query, los formularios ni los tokens.

### D. Máscaras
- `data-clarity-mask="true"` se aplica a:
  - el formulario `LeadCaptureForm`, con sus campos, mensajes de confirmación y errores;
  - el contenido personal de `AccountMenu`: avatar, nombre y correo, también dentro del portal del menú.
- No se desactivan globalmente las máscaras ni se añade `data-clarity-unmask`.

### E. Identidad (Clerk)
- `ClarityAnalytics` vive dentro de `ClerkProvider` y usa `useUser()`. No llama a otras API ni consulta Neon.
- Llama a `clarity("identify", user.id)` solo cuando Clerk ha cargado, hay consentimiento, la ruta está permitida y el tag está cargado. Se envía solo el id opaco de Clerk: ni correo, ni nombre, ni friendly-name, ni roles. Un visitante sin sesión no se identifica.
- Se vuelve a identificar cuando cambia la ruta o el usuario, sin bucles de render.
- **Cierre de sesión o cambio de cuenta:** el componente está en todas las rutas, también en las denegadas, aunque en ellas no carga nada. Si en un mismo documento el usuario pasa de A a nadie o de A a B, se borran `_clck`/`_clsk` y, si el tag estaba cargado, se recarga el documento. Así los clics siguientes no heredan el custom-id de A.
- Límite documentado: si la sesión se cierra en otro documento o pestaña donde no se observó el cambio, la continuidad depende de la caducidad de la sesión de Clarity.

### F. API tipada
`lib/clarity.ts` define estos tipos, sin `any`:
- `type AnalyticsConsent = "granted" | "denied"`;
- `type ClarityCommand`, una unión de tuplas para `["identify", string]` y `["consentv2", { ad_Storage: "granted" | "denied"; analytics_Storage: "granted" | "denied" }]`;
- la declaración global de `window.clarity` con su cola.

Expone:
- `getClarityProjectId`;
- `isClarityPathAllowed`;
- `readAnalyticsConsent`;
- `writeAnalyticsConsent`;
- `clearClarityCookies`.

Un fallo de la analítica nunca impide la acción principal: se protege solo el código de analítica, no el de negocio.

### G. Fuera de alcance
- Eventos de negocio (`ver_carrera`, `clic_reservar`, etc.), tablas de seguimiento, outbox, n8n o un panel propio.
- Cambios en reservas, contratos, Stripe o atribución.
- Las dependencias `@microsoft/clarity`, GTM u otros proveedores.
- Desplegar o configurar el proyecto en el panel de Clarity, que es un paso posterior con autorización.

## Archivos (≈12)
- Nuevos:
  - `lib/clarity.ts` y `lib/clarity.test.ts`;
  - `components/shared/ClarityAnalytics.tsx` y `components/shared/ClarityAnalytics.test.tsx`;
  - `components/shared/AnalyticsPreferencesButton.tsx`.
- Se modifican:
  - `app/layout.tsx`, para montar `<ClarityAnalytics />` dentro de `Providers`;
  - `.env.example` y `README.md`;
  - `modules/landing/components/SiteFooter.tsx` (botón de preferencias), `modules/landing/components/LeadCaptureForm.tsx` (máscara), `modules/landing/components/ContactPageContent.tsx` (navegación completa) y su test;
  - `modules/accounts/components/AccountMenu.tsx` (máscaras).

## Plan (una fase)
- [x] T1. `lib/clarity.ts`: ID, entorno y hostname, clasificación de rutas y preferencia, con sus tests primero.
- [x] T2. `ClarityAnalytics` y el botón de preferencias:
  - banner, aceptar y rechazar;
  - `consentv2` antes del tag;
  - carga única con `next/script` `afterInteractive` e id estable;
  - retirada con borrado de cookies y recarga;
  - `localStorage` bloqueado;
  - SDK simulado en los tests.
- [x] T3. Límite público → privado:
  - listener de clics, navegación completa en `/contacto` y recarga de seguridad;
  - máscaras en el formulario y en `AccountMenu`;
  - tests de carga directa de `/crm` y `/cuenta`, Link de la portada al CRM, atrás/adelante, navegación mientras el tag carga y el menú en el portal.
- [x] T4. Identidad:
  - casos: `isLoaded=false`, anónimo, con y sin consentimiento, cierre de sesión y A → B;
  - solo sale `user.id`;
  - sin identificar en rutas denegadas.
- [x] T5. Checks, todos en este orden: tests focalizados, `npm test -- --run --maxWorkers=3`, `npm run lint`, typegen, `tsc`, `npm run build` y `npm run build:worker`. Después, revisión del diff (alcance, datos que salen y exclusión) y README con la configuración de build, el panel de Clarity (consentimiento requerido) y cómo retirar la integración.

## Aceptación
- Sin ID, con un ID inválido, fuera de producción o en otro hostname no hay banner, script ni peticiones.
- Antes de aceptar no hay script. Al rechazar no se carga. Al aceptar, `consentv2` (analytics granted, ads denied) se pone en la cola antes de un único tag.
- Retirar el consentimiento borra `_clck`/`_clsk`, recarga y no vuelve a cargar el tag.
- Una carga directa de cualquier ruta denegada no inserta el tag. Desde una página pública con el tag, un clic hacia una ruta denegada abre un documento nuevo sin tag, y la recarga de seguridad cubre las navegaciones restantes.
- Solo se envía `user.id`. El cierre de sesión y el cambio de cuenta borran las cookies de sesión de Clarity y recargan si el tag estaba cargado.
- Los checks de T5 pasan. La verificación en producción (panel, peticiones `/collect` y grabaciones) queda pendiente de un despliegue autorizado.
