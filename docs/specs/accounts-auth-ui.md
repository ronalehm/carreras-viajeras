# Acceso del equipo al CRM (UI de autenticación)

- Módulo: accounts
- Estado: aprobado
- Depende de: accounts-roles-permissions.md (Fase 1 aprobada y desplegada en `main` eb75dd6), platform-neon-foundation.md (Fase 1 aprobada)

## Objetivo
Permitir que el equipo entre al CRM. `accounts-roles-permissions.md` deja esta interfaz para esta spec.
- **Admin y comerciales con cuenta:** inician sesión con correo y contraseña de Neon Auth.
- **Personas invitadas:** crean su cuenta y verifican el correo con un **código** (OTP).
- **Quien olvidó su contraseña:** la recupera con un código.

Después de iniciar sesión, la persona llega a `/crm`. Ahí un layout mínimo muestra su correo y sus roles si tiene acceso, o un aviso de "sin acceso" si no lo tiene. Toda la autorización sigue en el servidor (`requireCrmUser()`): la UI no decide permisos.

## Alcance
- Incluye:
  - `/crm/acceso`: iniciar sesión, crear cuenta (invitados), verificar el correo con código y recuperar la contraseña con código. Textos en español y estados de carga y error.
  - Layout protegido de `/crm` con su shell mínimo (correo, roles y "Cerrar sesión") y la pantalla "sin acceso".
  - `/crm`: página de bienvenida provisional.
  - Cliente de auth del navegador: `createAuthClient()` de `@neondatabase/auth/next`.
  - Componentes de shadcn necesarios, schemas zod de los formularios, mapeo de errores a mensajes en español y sus tests.
  - Registrar en `docs/SETUP.md` la excepción de rutas en español.
  - (F3) README: requisitos previos manuales de Neon Auth y checklist manual en producción.
- No incluye:
  - `@neondatabase/auth-ui` (`AuthView`) (ver Decisiones). No se importa.
  - Login social, magic link, MFA o passkeys.
  - Cambio de correo o de contraseña con sesión iniciada, y perfil de usuario.
  - Página de administración de usuarios: es la Fase 3 de `accounts-roles-permissions.md`.
  - Pantallas reales del CRM (leads, viajes).
  - Parámetro `?next=` o cualquier destino configurable tras el login. El destino siempre es `/crm`.
  - Envío automático del correo de invitación. El admin comparte el enlace `/crm/acceso` a mano, como decide `accounts-roles-permissions.md`.
  - `proxy.ts`/middleware: la protección va en el layout, en cada página y en cada acción.
  - Cuentas de runners: son visitantes anónimos.
  - Nuevas variables `NEXT_PUBLIC_*` o secretos en el cliente.
  - Cambios en `lib/auth/{server,guards,errors,permissions,access.service}.ts`, `lib/db*` y la API `/api/crm/me`.

## Requisitos
1. **Cliente de auth:** se crea con `createAuthClient()` de `@neondatabase/auth/next`, sin argumentos. Habla con el proxy same-origin `/api/auth/[...path]`, que ya existe. Métodos exactos (comprobados en `node_modules/@neondatabase/auth` y en better-auth 1.7.6 con el plugin `email-otp`):
   - iniciar sesión: `signIn.email({ email, password })`;
   - crear cuenta: `signUp.email({ name, email, password })`;
   - cerrar sesión: `signOut()`;
   - leer la sesión: `getSession()`;
   - enviar el código de verificación: `emailOtp.sendVerificationOtp({ email, type: "email-verification" })`;
   - verificar el correo: `emailOtp.verifyEmail({ email, otp })`;
   - pedir el código de recuperación: `emailOtp.requestPasswordReset({ email })`;
   - restablecer la contraseña: `emailOtp.resetPassword({ email, otp, password })`.

   Todos devuelven `{ data, error }`; los errores se leen de `error.status` y `error.code`.
2. **Formularios:** `"use client"` solo en los formularios de acceso y en el botón de cerrar sesión. Las páginas y el layout son Server Components.
3. **Acceso por permisos del servidor:** el layout protegido llama a la guarda de servidor y, además, **cada página** bajo él vuelve a comprobar el acceso (los layouts no se vuelven a renderizar en la navegación de cliente). Resultados:
   - sin sesión → `redirect("/crm/acceso")`;
   - sin permiso (incluido un error de la base de datos, que la guarda trata como 403) → pantalla "Tu cuenta no tiene acceso al CRM. Pide una invitación a un administrador." con "Cerrar sesión";
   - con permiso → shell con correo y roles.
4. **`/crm/acceso` con sesión:** si la persona ya tiene una sesión válida (con acceso o sin él), se redirige a `/crm`, que muestra el shell o la pantalla sin acceso.
5. **Destino tras iniciar sesión o verificar:** siempre `/crm`, con `router.replace("/crm")` y `router.refresh()`. No se lee ningún parámetro de destino, así que no hay redirección abierta.
6. **Mensajes sin enumeración de cuentas.** Login y recuperación no revelan si un correo existe:
   - credenciales inválidas → "Correo o contraseña incorrectos.";
   - la solicitud de recuperación responde siempre "Si existe una cuenta con ese correo, te enviamos un código.", salvo límite de intentos o error de red;
   - correo ya registrado al crear cuenta → mensaje genérico, sin confirmar que existe.
7. **Registro sin invitación:** crea la cuenta en Neon Auth pero no da acceso. Lo garantiza la Fase 1 de `accounts-roles-permissions.md`. El formulario de alta avisa: "Solo para personas invitadas por un administrador".
8. **Verificación por código:** se usa porque el SMTP compartido de Neon envía códigos, mientras que los enlaces requieren SMTP propio. El campo admite 6 dígitos, la longitud por defecto en Better Auth; se confirma en la prueba manual.
9. **Contraseña:** 8–128 caracteres, el valor por defecto en Better Auth (`minPasswordLength` 8). Al crear cuenta y al restablecer se pide confirmación.
10. **Sin textos de error de terceros:** no se muestra el `error.message` de Neon o Better Auth (está en inglés y puede filtrar detalles); solo mensajes propios.
11. **Tamaño del Worker:** el Worker comprimido debe seguir por debajo del límite de 3 MiB de Workers Free. Se mide en cada fase sin desplegar.

## Criterios de aceptación
Fase 1 (iniciar sesión y shell):
- [ ] (F1) Dado un visitante sin sesión, cuando abre `/crm`, entonces se le redirige a `/crm/acceso`.
- [ ] (F1) Dado `/crm/acceso` sin sesión, entonces se ve un formulario "Iniciar sesión" con correo, contraseña y botón. `/crm/acceso` no está dentro del layout protegido.
- [ ] (F1) Dado el formulario con correo inválido o contraseña vacía, cuando lo envío, entonces se muestran errores por campo y no se llama a Neon Auth.
- [ ] (F1) Dadas credenciales incorrectas o una cuenta inexistente, cuando inicio sesión, entonces veo "Correo o contraseña incorrectos." (el mismo texto en ambos casos). Mientras espera, el botón queda deshabilitado y muestra "Entrando…".
- [ ] (F1) Dado un admin con correo verificado, cuando inicia sesión, entonces llega a `/crm`. El shell muestra su correo, "Admin" y "Cerrar sesión", y la página muestra la bienvenida provisional.
- [ ] (F1) Dada una cuenta verificada sin roles, cuando inicia sesión o abre `/crm`, entonces ve "Tu cuenta no tiene acceso al CRM. Pide una invitación a un administrador." y "Cerrar sesión". No se ve la bienvenida.
- [ ] (F1) Dada una sesión iniciada, con acceso o sin él, cuando abre `/crm/acceso`, entonces se le redirige a `/crm`.
- [ ] (F1) Dada una sesión, cuando pulsa "Cerrar sesión", entonces se llama a `signOut()` y se le lleva a `/crm/acceso`. Al volver a `/crm` se le redirige otra vez a `/crm/acceso`.
- [ ] (F1) Dado `/crm/acceso?next=https://example.com`, cuando inicia sesión, entonces llega a `/crm`.
- [ ] (F1) Dado el árbol de componentes, entonces `"use client"` solo aparece en `SignInForm` y `SignOutButton`. No hay imports de `@neondatabase/auth-ui` ni variables `NEXT_PUBLIC_*` nuevas.
- [ ] (F1) Dado `docs/SETUP.md`, entonces documenta la excepción: los segmentos de URL visibles van en español y todo lo demás en inglés.
- [ ] (F1) Dado `npm run build:worker` seguido de `npx wrangler deploy --dry-run --outdir <scratch>` (sin desplegar), entonces el tamaño gzip del Worker se registra en el resumen de la fase, comparado con los ~1071 KiB de referencia, y es < 3 MiB. Si supera 2 MiB, se detiene y se consulta al usuario.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` pasan.

Fase 2 (crear cuenta y verificar con código):
- [ ] (F2) Dado `/crm/acceso`, cuando pulso "¿Te invitaron? Crea tu cuenta", entonces veo un formulario con nombre, correo, contraseña y confirmación, y el aviso "Solo para personas invitadas por un administrador".
- [ ] (F2) Dadas contraseñas distintas o de menos de 8 caracteres, cuando envío, entonces se muestran errores por campo sin llamar a Neon Auth.
- [ ] (F2) Dado un alta válida, cuando la envío, entonces se llama a `signUp.email({ name, email, password })` y paso al paso "Verifica tu correo", con el correo visible y los botones "Verificar" y "Reenviar código".
- [ ] (F2) Dado que el correo ya existe, cuando creo la cuenta, entonces veo "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña.".
- [ ] (F2) Dado un código incorrecto, caducado o con demasiados intentos, cuando verifico, entonces veo "Código incorrecto o caducado. Pide uno nuevo.".
- [ ] (F2) Dado "Reenviar código", cuando lo pulso, entonces se llama a `emailOtp.sendVerificationOtp({ email, type: "email-verification" })` y el botón queda deshabilitado 30 s.
- [ ] (F2) Dado un código correcto, cuando verifico, entonces se llama a `emailOtp.verifyEmail({ email, otp })` y luego a `getSession()`. Con sesión → `/crm`. Sin sesión → paso "Iniciar sesión" con el correo ya puesto y el aviso "Correo verificado. Inicia sesión.".
- [ ] (F2) Dada una cuenta sin verificar, cuando inicia sesión con la contraseña correcta y Neon responde `EMAIL_NOT_VERIFIED`, entonces se envía un código nuevo y pasa al paso "Verifica tu correo".
- [ ] (F2) Dado un límite de intentos (HTTP 429) en cualquier paso, entonces veo "Demasiados intentos. Espera un momento y vuelve a intentarlo.". Ante un error de red o 5xx: "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo.".
- [ ] (F2) Medición del Worker como en F1, y lint, vitest y build pasan.

Fase 3 (recuperar contraseña y documentación):
- [ ] (F3) Dado "¿Olvidaste tu contraseña?", cuando envío un correo válido, entonces se llama a `emailOtp.requestPasswordReset({ email })` y veo siempre "Si existe una cuenta con ese correo, te enviamos un código.", también si la respuesta es un error distinto de 429 o de red.
- [ ] (F3) Dado el paso "Nueva contraseña" con código, contraseña y confirmación válidos, cuando lo envío, entonces se llama a `emailOtp.resetPassword({ email, otp, password })` y paso a "Iniciar sesión" con el aviso "Contraseña actualizada. Inicia sesión.". Con un código inválido o caducado: "Código incorrecto o caducado. Pide uno nuevo.".
- [ ] (F3) Dado `README.md`, entonces documenta como requisitos previos manuales en la consola de Neon Auth:
  - dominio de confianza `https://carreras-viajeras.mentec.dev` (localhost viene preaprobado);
  - "Sign-up with Email" ON;
  - verificación de correo al registrarse ON con código;
  - recuperación de contraseña por código.

  Incluye también el checklist manual en producción de esta spec.
- [ ] (F3) Medición del Worker como en F1, y lint, vitest y build pasan.

Manual en producción (el usuario, con su autorización; agentes sin acceso a Neon desde este entorno):
- [ ] Login de admin (ronalehm@gmail.com, tras el bootstrap) → `/crm` muestra "Admin".
- [ ] Una cuenta sin rol ve la pantalla sin acceso.
- [ ] "Cerrar sesión" lleva a `/crm/acceso`.
- [ ] El admin invita a un correo (o se crea la invitación por SQL hasta que exista la Fase 2 de `accounts-roles-permissions.md`) → la persona crea su cuenta → recibe el código → verifica → `/crm` muestra "Comercial".
- [ ] Recuperar la contraseña con código y volver a iniciar sesión.
- [ ] Comprobar que llega el código de 6 dígitos y que la sesión persiste al recargar.

## Diseño técnico

### Decisiones
- **Excepción a la regla 3 de SETUP (decisión del usuario):**
  - los **segmentos de ruta visibles en la URL van en español** (`/crm/acceso`, y otros futuros como `/crm/admin/usuarios`);
  - carpetas de módulos, archivos, componentes, route groups (que no aparecen en la URL, p. ej. `(protected)`), variables y tipos siguen en inglés.
  - Se registra en `docs/SETUP.md` §1 (F1-T1).
- **Route group para separar el acceso del layout protegido.** `app/crm/(protected)/layout.tsx` y `app/crm/(protected)/page.tsx` sirven `/crm`, y `app/crm/acceso/page.tsx` queda fuera del grupo y no hereda el layout protegido.
  - No se crea `app/crm/layout.tsx`.
  - Según la guía de autenticación de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Layouts and auth checks"), un layout no impide que los segmentos hijos se rendericen. Por eso la página también comprueba el acceso; `cache()` de React deduplica `getCurrentUser` en el mismo render.
  - **Nota de coordinación:** la página de administración que planifica `accounts-roles-permissions.md` F3 (`app/crm/admin/usuarios/page.tsx`) debería vivir en `app/crm/(protected)/admin/usuarios/page.tsx` para heredar el shell. La URL no cambia. Mover el archivo exige actualizar esa spec y volver a aprobarla antes de su F3.
- **Formularios propios con shadcn en lugar de `@neondatabase/auth-ui`:**
  - **Textos:** todos los textos en español y controlados por nosotros; `AuthView` trae los textos en inglés y obliga a mapear una `localization` completa.
  - **Estilo:** la plantilla usa Base UI y tokens de Tailwind v4. `auth-ui` trae su propio CSS (`/css` o `/tailwind`) y componentes Radix.
  - **Tamaño del Worker** (~1071 KiB gzip hoy, límite de 3 MiB): no se arrastra `better-auth-ui` ni Radix.
  - **Recuperación:** en `auth-ui`, el flujo "forget password" llama a `authClient.requestPasswordReset` (enlace, `node_modules/@neondatabase/auth-ui/dist/index.mjs`), que requiere SMTP propio; aquí se usa código.
- **Recuperación por código:** riesgo y alternativa.
  - **Evidencias a favor de que el código funciona:**
    - el cliente gestionado incluye el plugin `email-otp` con `/email-otp/request-password-reset` y `/email-otp/reset-password`;
    - el SDK de servidor de Neon declara `emailOtp.resetPassword` (ruta `email-otp/passcode`).
  - **Lo que no se pudo confirmar:** la documentación pública de Neon (bloqueada desde este entorno) no confirma que el servicio gestionado acepte el reset por código.
  - **Comprobación:** el plan pone la recuperación en una fase aparte (F3), con una comprobación manual previa en una rama de desarrollo.
  - **Si Neon solo admite enlace,** F3 se sustituye por esta alternativa:
    - documentar la limitación;
    - mientras tanto, el admin revoca y vuelve a invitar a otro correo, o restablece la contraseña desde la consola de Neon si la consola lo permite;
    - más adelante, recuperación por enlace con SMTP propio: `requestPasswordReset({ email, redirectTo: "/crm/acceso" })` + `resetPassword({ newPassword, token })`.

    Ver Pregunta abierta 1.
- **Verificación tras crear la cuenta:** se asume que Neon envía el primer código al registrarse cuando la verificación al registrarse está activa; el formulario no envía otro código automáticamente para no invalidar el primero. Si en la prueba manual no llega, "Reenviar código" lo cubre y se documenta.
- **Sin auto-login tras verificar:** después de `verifyEmail` se consulta `getSession()`. Si Neon no inicia la sesión automáticamente, se pide iniciar sesión con el correo ya puesto. Así el flujo funciona con cualquiera de los dos comportamientos.
- **`EMAIL_NOT_VERIFIED`:** solo se recibe con la contraseña correcta, así que pasar al paso de verificación no revela qué cuentas existen.
- **Errores de servidor:**
  - `getCrmAccess()` traduce las excepciones de `requireCrmUser()` a estados: `UnauthorizedError` → `"unauthenticated"`, `ForbiddenError` → `"forbidden"`; cualquier otra se relanza.
  - `redirect()` se llama fuera de `try/catch`, como indica la documentación de Next (`redirect.md`).
- **Componentes de shadcn:** `input`, `label` y `card`. No se instala `field` (KISS: errores con `<p role="alert" className="text-sm text-destructive">`), ni `input-otp` (dependencia npm nueva; basta un `Input` con `inputMode="numeric"`, `autoComplete="one-time-code"` y `maxLength={6}`), ni `alert`.

### Rutas (`app/`)
- `app/crm/acceso/page.tsx` (nuevo, F1): Server Component.
  1. `const access = await getCrmAccess();`
  2. Si `access.status !== "unauthenticated"`, `redirect("/crm")`.
  3. Renderiza un `<main>` centrado con `<SignInForm />`; en F2 se sustituye por `<AccessPanel />`.

  `metadata`: `{ title: "Acceso al CRM", robots: { index: false } }`.
- `app/crm/(protected)/layout.tsx` (nuevo, F1): Server Component.
  - `unauthenticated` → `redirect("/crm/acceso")`;
  - `forbidden` → `<NoCrmAccess />` (no renderiza `children`);
  - `ok` → `<CrmShell email={access.user.email} roles={access.user.staffRoles}>{children}</CrmShell>`.

  `metadata.robots: { index: false }`.
- `app/crm/(protected)/page.tsx` (nuevo, F1): `const access = await getCrmAccess(); if (access.status !== "ok") return null;`. Si hay acceso, devuelve la bienvenida: "Bienvenido al CRM de Carreras Viajeras" y "Pronto verás aquí tus leads y viajes.".

### Módulo `modules/accounts/`
| Archivo | Tipo | Fase | Descripción |
|---|---|---|---|
| `utils/crmAccess.ts` | nuevo, server-only | F1 | `getCrmAccess(): Promise<CrmAccess>`; `type CrmAccess = { status: "unauthenticated" } \| { status: "forbidden" } \| { status: "ok"; user: CurrentUser }`. Envuelve `requireCrmUser()` de `@/lib/auth/guards` |
| `schemas/auth.schema.ts` | nuevo | F1, ampliado en F2 y F3 | `email = z.string().trim().toLowerCase().pipe(z.email())`; `password = z.string().min(8).max(128)`; `otp = z.string().trim().regex(/^\d{6}$/)`. Schemas: F1 `signInSchema { email, password: z.string().min(1) }`; F2 `signUpSchema { name: trim 1–100, email, password, confirmPassword }` con `refine` de coincidencia (error en `confirmPassword`) y `verifyEmailSchema { otp }`; F3 `forgotPasswordSchema { email }` y `resetPasswordSchema { otp, password, confirmPassword }` con el mismo `refine` |
| `types/auth.types.ts` | nuevo | F2 | Tipos `z.infer` de los schemas y `AccessStep = "sign-in" \| "sign-up" \| "verify-email" \| "forgot-password" \| "reset-password"` |
| `utils/authErrorMessage.ts` | nuevo | F2 | `authErrorMessage(error: { status?: number; code?: string } \| null, context: "sign-in" \| "sign-up" \| "verify" \| "recovery"): string`. Puro; tabla de mensajes en "Contrato" |
| `components/SignInForm.tsx` | nuevo, `"use client"` | F1, modificado en F2 | Correo y contraseña. `signInSchema.safeParse`, luego `authClient.signIn.email`; si hay éxito, `router.replace("/crm")` + `router.refresh()`. En F1 cualquier error → "Correo o contraseña incorrectos."; en F2 usa `authErrorMessage` y la prop `onUnverified(email)`. Props F2: `defaultEmail?`, `notice?`, `onUnverified`, `onForgotPassword` (F3), `onSignUp` |
| `components/SignOutButton.tsx` | nuevo, `"use client"` | F1 | `Button variant="outline"` "Cerrar sesión" → `authClient.signOut()`, luego `router.replace("/crm/acceso")` + `router.refresh()`. Si falla: "No se pudo cerrar sesión." |
| `components/CrmShell.tsx` | nuevo, Server | F1 | Cabecera con "CRM Carreras Viajeras", correo, roles con etiquetas (`commercial` → "Comercial", `admin` → "Admin") y `SignOutButton`; debajo, `children`. Props `email`, `roles`, `children` |
| `components/NoCrmAccess.tsx` | nuevo, Server | F1 | `Card` con el texto de sin acceso y `SignOutButton` |
| `components/SignUpForm.tsx` | nuevo, `"use client"` | F2 | Nombre, correo, contraseña y confirmación + aviso de invitación; `signUp.email`; si hay éxito, `onRegistered(email)` |
| `components/VerifyEmailForm.tsx` | nuevo, `"use client"` | F2 | Código + "Verificar" + "Reenviar código" (30 s de espera); `emailOtp.verifyEmail`, luego `getSession()`; con sesión, `/crm`; sin ella, `onVerifiedWithoutSession(email)` |
| `components/AccessPanel.tsx` | nuevo, `"use client"` | F2, modificado en F3 | Estado `{ step: AccessStep; email: string; notice?: string }` y renderiza el formulario del paso dentro de un `Card`, con enlaces entre pasos. No guarda contraseñas en su estado |
| `components/ForgotPasswordForm.tsx` | nuevo, `"use client"` | F3 | Correo → `emailOtp.requestPasswordReset`; siempre el mensaje neutro; `onCodeRequested(email)` |
| `components/ResetPasswordForm.tsx` | nuevo, `"use client"` | F3 | Código, contraseña y confirmación → `emailOtp.resetPassword({ email, otp, password })`; si hay éxito, `onPasswordReset(email)` |
| `index.ts` | nuevo | F1, ampliado en F2 | Exporta `getCrmAccess`, `CrmShell`, `NoCrmAccess` y `SignInForm` (F1), y `AccessPanel` (F2, en lugar de `SignInForm`) |

Todos los formularios:
- tienen estado `pending` (botón deshabilitado con texto de progreso) y errores por campo de `safeParse(...).error.flatten().fieldErrors`;
- muestran un error general con `role="alert"`;
- usan `Label`, `Input` y `Button`, y `type`/`autoComplete` correctos (`email`, `current-password`, `new-password`, `one-time-code`).

### `lib/`
- `lib/auth/client.ts` (nuevo, F1): `export const authClient = createAuthClient();` (de `@neondatabase/auth/next`). Sin `server-only`, sin secretos y sin argumentos. Es la única instancia del cliente en el navegador (DRY).

### Componentes de shadcn
- `button`: instalado.
- `input`, `label`, `card`: por instalar con `npx shadcn@latest add input label card` (F1-T1). Los tres existen en `@shadcn` (`npx shadcn@latest search`).

### Contrato
Los métodos del cliente aparecen en Requisitos 1. Forma del error: `{ status: number; code?: string; message?: string }`. `message` nunca se muestra.

Mensajes de `authErrorMessage(error, context)`; se evalúan en este orden y el primero que coincide gana:

| Condición | Contexto | Mensaje |
|---|---|---|
| `status === 429` (límite de peticiones) | todos | "Demasiados intentos. Espera un momento y vuelve a intentarlo." |
| `code` empieza por `TOO_MANY_ATTEMPTS` (demasiados intentos sobre un mismo código) | `verify`, `recovery` | "Código incorrecto o caducado. Pide uno nuevo." |
| sin `status` (error de red) o `status >= 500` | todos | "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo." |
| `code === "EMAIL_NOT_VERIFIED"` | `sign-in` | "Tu correo aún no está verificado. Te enviamos un código." |
| `code` empieza por `USER_ALREADY_EXISTS` | `sign-up` | "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña." |
| `INVALID_OTP`, `OTP_EXPIRED` | `verify`, `recovery` | "Código incorrecto o caducado. Pide uno nuevo." |
| cualquier otro 4xx | `sign-in` | "Correo o contraseña incorrectos." |
| cualquier otro 4xx | `sign-up` | "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo." |
| cualquier otro 4xx | `verify`, `recovery` | "Código incorrecto o caducado. Pide uno nuevo." |

Mensaje fijo de la solicitud de recuperación: "Si existe una cuenta con ese correo, te enviamos un código.". Se muestra salvo con 429 o error de red/5xx.

### Seguridad
- **Permisos:** la UI no envía ni lee roles; el shell recibe los roles de `requireCrmUser()` en el servidor. La autorización real de las APIs y acciones sigue en `lib/auth/guards.ts`.
- **Cliente:** sin secretos ni `NEXT_PUBLIC_*`. Las cookies de sesión las gestiona el proxy de Neon Auth (`__Secure-neon-auth.*`).
- **Redirecciones:** solo destinos internos fijos (`/crm`, `/crm/acceso`).
- **Requisitos manuales en Neon Auth:** dominio de confianza `https://carreras-viajeras.mentec.dev`, registro por email ON, verificación al registrarse con código y recuperación por código (F3). Se documentan en el README.

## Reutilización
- `requireCrmUser()`, `CurrentUser`, `UnauthorizedError`/`ForbiddenError` y `StaffRole` (de `lib/auth/`); el proxy `app/api/auth/[...path]/route.ts`; `getAuth()` de forma indirecta.
- `createAuthClient` de `@neondatabase/auth/next`, ya instalado, sin dependencias nuevas.
- shadcn: `button` (instalado); `input`, `label` y `card` (por instalar). `cn()` de `@/lib/utils` y tokens del tema.
- `redirect` de `next/navigation`, `useRouter` y zod v4.

## Tests
Vitest. Los de servidor llevan `// @vitest-environment node` y `vi.mock("server-only", () => ({}))`; los de componentes usan jsdom + Testing Library con `@/lib/auth/client` y `next/navigation` mockeados.

- `modules/accounts/utils/crmAccess.test.ts` (F1, `@/lib/auth/guards` mockeado):
  - `UnauthorizedError` → `unauthenticated`;
  - `ForbiddenError` → `forbidden`;
  - usuario → `ok` con el usuario;
  - otro error → se relanza.
- `modules/accounts/schemas/auth.schema.test.ts`:
  - F1: `signInSchema` hace trim y pasa el correo a minúsculas, rechaza correos inválidos y contraseñas vacías;
  - F2: `signUpSchema` exige nombre, contraseña de 8 a 128 caracteres y confirmación igual (error en `confirmPassword`); `verifyEmailSchema` solo acepta 6 dígitos, recortando espacios;
  - F3: `resetPasswordSchema` (código, contraseña y confirmación) y `forgotPasswordSchema`.
- `modules/accounts/utils/authErrorMessage.test.ts` (F2): cada fila de la tabla. Además:
  - el mensaje de credenciales en `sign-in` es idéntico para cualquier 4xx distinto de `EMAIL_NOT_VERIFIED` (sin enumeración);
  - nunca devuelve `error.message`.
- `modules/accounts/components/AccessPanel.test.tsx` (F2, ampliado en F3):
  - **login:**
    - éxito → `router.replace("/crm")`;
    - 401 → "Correo o contraseña incorrectos." y botón deshabilitado mientras espera;
    - `EMAIL_NOT_VERIFIED` → se llama a `sendVerificationOtp` con `type: "email-verification"` y se muestra el paso de verificación;
  - **alta:**
    - contraseñas distintas → no se llama a `signUp.email`;
    - éxito → paso de verificación con el correo;
  - **verificación:**
    - código correcto + sesión → `/crm`;
    - código correcto sin sesión → paso de login con el correo y el aviso;
    - código inválido → mensaje;
    - "Reenviar código" queda deshabilitado tras pulsarlo;
  - **(F3) recuperación:**
    - la solicitud muestra el mensaje neutro tanto con éxito como con 404/400;
    - restablecer con éxito → login con el aviso.
- Sin unit tests (según SETUP):
  - páginas y layout de `app/` (Server Components asíncronos);
  - `CrmShell`, `NoCrmAccess` y `SignOutButton` (presentacionales o con una sola llamada, cubiertos por el checklist manual);
  - `components/ui/`;
  - `lib/auth/client.ts`;
  - tipos.

## Plan de tareas
### Fase 1: iniciar sesión y shell protegido (5 tareas, 16 archivos)
- [x] T1 — Instalar shadcn (`npx shadcn@latest add input label card`) y registrar en `docs/SETUP.md` §1 la excepción de rutas en español · archivos: `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`, `docs/SETUP.md` · depende de: — · secuencial (base)
- [x] T2 — Cliente de auth y schema de login con test · archivos: `lib/auth/client.ts`, `modules/accounts/schemas/auth.schema.ts`, `modules/accounts/schemas/auth.schema.test.ts` · depende de: T1 · secuencial (`lib/`)
- [x] T3 — `getCrmAccess`, shell, pantalla sin acceso y cerrar sesión · archivos: `modules/accounts/utils/crmAccess.ts`, `modules/accounts/utils/crmAccess.test.ts`, `modules/accounts/components/CrmShell.tsx`, `modules/accounts/components/NoCrmAccess.tsx`, `modules/accounts/components/SignOutButton.tsx` · depende de: T2 · paralelo (con T4)
- [x] T4 — Formulario de login · archivos: `modules/accounts/components/SignInForm.tsx` · depende de: T2 · paralelo (con T3)
- [x] T5 — API pública del módulo y rutas (`/crm/acceso`, layout protegido, `/crm`); medir el Worker con `build:worker` + `wrangler deploy --dry-run` sin desplegar · archivos: `modules/accounts/index.ts`, `app/crm/acceso/page.tsx`, `app/crm/(protected)/layout.tsx`, `app/crm/(protected)/page.tsx` · depende de: T3, T4 · secuencial

### Fase 2: crear cuenta (invitados) y verificar con código (3 tareas, 10 archivos)
- [x] T1 — Schemas de alta y código, tipos, mapeo de errores y sus tests · archivos: `modules/accounts/schemas/auth.schema.ts`, `modules/accounts/schemas/auth.schema.test.ts`, `modules/accounts/types/auth.types.ts`, `modules/accounts/utils/authErrorMessage.ts`, `modules/accounts/utils/authErrorMessage.test.ts` · depende de: Fase 1 · secuencial
- [x] T2 — Formularios de alta y verificación, panel por pasos y login con `authErrorMessage` y `onUnverified`, con test · archivos: `modules/accounts/components/SignUpForm.tsx`, `modules/accounts/components/VerifyEmailForm.tsx`, `modules/accounts/components/AccessPanel.tsx`, `modules/accounts/components/SignInForm.tsx`, `modules/accounts/components/AccessPanel.test.tsx` · depende de: F2-T1 · secuencial
- [x] T3 — Usar `AccessPanel` en `/crm/acceso` y exportarlo; medir el Worker · archivos: `modules/accounts/index.ts`, `app/crm/acceso/page.tsx` · depende de: F2-T2 · secuencial

### Fase 3: recuperar contraseña y documentación (3 tareas, 8 archivos)
Requisito previo, manual y sin archivos: el usuario confirma en una rama de desarrollo que Neon Auth acepta `POST /api/auth/email-otp/request-password-reset` y `/api/auth/email-otp/reset-password`. Si no, se aplica la alternativa de "Decisiones" y se actualiza esta spec antes de implementar F3-T1 y F3-T2.
- [x] T1 — Schemas de recuperación y test · archivos: `modules/accounts/schemas/auth.schema.ts`, `modules/accounts/schemas/auth.schema.test.ts` · depende de: Fase 2 y el requisito previo · secuencial
- [x] T2 — Formularios de recuperación y pasos en el panel, con test · archivos: `modules/accounts/components/ForgotPasswordForm.tsx`, `modules/accounts/components/ResetPasswordForm.tsx`, `modules/accounts/components/AccessPanel.tsx`, `modules/accounts/components/SignInForm.tsx`, `modules/accounts/components/AccessPanel.test.tsx` · depende de: F3-T1 · secuencial
- [x] T3 — README: requisitos previos manuales de Neon Auth y checklist manual en producción de esta spec · archivos: `README.md` · depende de: Fase 2 · paralelo (con F3-T1 y F3-T2)

## Preguntas abiertas
1. **Si Neon Auth gestionado no admite la recuperación por código** (la comprobación previa de F3 lo dirá), ¿qué prefieres?
   - (a) Configurar SMTP propio (p. ej., un proveedor transaccional) y recuperar por enlace.
   - (b) Dejar la recuperación fuera del MVP, de modo que el admin la resuelva a mano desde la consola de Neon.
