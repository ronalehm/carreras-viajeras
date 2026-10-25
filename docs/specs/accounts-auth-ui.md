# Acceso del equipo al CRM (UI de autenticación)

- Módulo: accounts
- Estado: borrador
- Enmienda (2026-10-25): destinos cerrados ampliados (runner → `/mis-carreras`; audiencia `sponsor` → `/patrocinador`, salida a `/patrocinador/acceso`), enlaces "Ver mis carreras" y "Mi perfil" en `RunnerAccount`, export de `SignOutButton` y página `/patrocinador/acceso`, porque lo exigen `runner-portal.md`, `accounts-runner-profiles.md` y `sponsors-portal.md` (aprobadas). Esta spec no gana tareas: cada cambio lo implementan esas specs en la fase indicada en "Enmienda: qué implementa cada spec".
- Depende de: accounts-roles-permissions.md (Fase 1 aprobada y desplegada en `main` eb75dd6), platform-neon-foundation.md (Fase 1 aprobada)
- Fases 1–4 implementadas en `main`. La Fase 4 (audiencia runner) la consume `landing-public-site.md` F3 (`/cuenta`).
- La amplían (enmienda 2026-10-25): `runner-portal.md` (F5-T1, F6-T1, F6-T2), `accounts-runner-profiles.md` (F2-T5) y `sponsors-portal.md` (F3-T4, F4-T1, F4-T4).

## Objetivo
Permitir que el equipo entre al CRM. `accounts-roles-permissions.md` deja esta interfaz para esta spec.
- **Admin y comerciales con cuenta:** inician sesión con correo y contraseña de Neon Auth.
- **Personas invitadas:** crean su cuenta y verifican el correo con un **código** (OTP).
- **Quien olvidó su contraseña:** la recupera con un código.
- **(F4) Runners:** se registran, inician sesión y la cierran desde la landing (`/cuenta`) con los mismos componentes, sin obtener acceso al CRM. Desde `runner-portal.md` F6, tras ingresar o verificar llegan a `/mis-carreras`.
- **(Enmienda; `sponsors-portal.md` F3–F4) Personas patrocinadoras invitadas:** crean su cuenta e ingresan en `/patrocinador/acceso` con los mismos componentes (audiencia `sponsor`) y llegan a `/patrocinador`, sin obtener acceso al CRM.

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
  - (F4) Audiencia runner: `AccessPanel` con `audience: "staff" | "runner"`, destino fijo por audiencia, `SignOutButton` con destino de salida cerrado y el componente `RunnerAccount`, que muestra el estado de sesión en la cuenta pública. La ruta `/cuenta` y su diseño son de `landing-public-site.md` F3.
  - (Enmienda 2026-10-25; sin tareas en esta spec, ver "Enmienda: qué implementa cada spec"):
    - destino del runner tras ingresar o verificar: `/mis-carreras` (`runner-portal.md` F6-T1);
    - `RunnerAccount` con sesión: enlaces "Ver mis carreras" (`runner-portal.md` F6-T2) y "Mi perfil" (`accounts-runner-profiles.md` F2-T5);
    - audiencia `sponsor` con destino `/patrocinador` y salida a `/patrocinador/acceso` (`sponsors-portal.md` F3-T4), y la página `/patrocinador/acceso` (`sponsors-portal.md` F4-T4);
    - `SignOutButton` exportado desde `@/modules/accounts` (`runner-portal.md` F5-T1 o `sponsors-portal.md` F4-T1, quien llegue primero).
- No incluye:
  - `@neondatabase/auth-ui` (`AuthView`) (ver Decisiones). No se importa.
  - Login social, magic link, MFA o passkeys.
  - Cambio de correo o de contraseña con sesión iniciada. El perfil del runner no es de esta spec: lo cubre `accounts-runner-profiles.md` (`/cuenta/perfil`).
  - Página de administración de usuarios: es la Fase 3 de `accounts-roles-permissions.md`.
  - Pantallas reales del CRM (leads, viajes).
  - Parámetro `?next=` o cualquier destino configurable tras el login. El destino siempre es `/crm` (F1–F3). Desde F4 depende solo de la audiencia fijada en el código, nunca de la URL: `/crm` (staff), `/cuenta` (runner, hasta `runner-portal.md` F6) y, con la enmienda, `/mis-carreras` (runner, desde `runner-portal.md` F6) y `/patrocinador` (sponsor, desde `sponsors-portal.md` F3). La lista cerrada completa está en "Seguridad → Redirecciones".
  - Envío automático del correo de invitación. El admin comparte el enlace `/crm/acceso` a mano, como decide `accounts-roles-permissions.md`.
  - `proxy.ts`/middleware: la protección va en el layout, en cada página y en cada acción.
  - Cuentas de runners en F1–F3: eran visitantes anónimos. Desde F4, un runner tiene una cuenta de Neon Auth sin roles de staff. Siguen fuera de esta spec la comunidad y los recursos protegidos para runners, que tienen su propia spec y su propia guarda en el servidor: el perfil del runner (`runner_profiles`, `/cuenta/perfil`) es de `accounts-runner-profiles.md` y el portal de reservas (`/mis-carreras`) de `runner-portal.md`. Esta spec solo aporta los enlaces de `RunnerAccount` y el destino tras el login.
  - El portal de patrocinadores (`/patrocinador/**`), su guarda `requireSponsor()`/`getSponsorAccess()` y el rol `sponsor`: son de `sponsors-portal.md`. Esta spec solo aporta la audiencia `sponsor` del panel y sus destinos cerrados.
  - Nuevas variables `NEXT_PUBLIC_*` o secretos en el cliente.
  - Cambios en `lib/auth/{server,guards,errors,permissions,access.service}.ts`, `lib/db*` y la API `/api/crm/me` (los que hacen `runner-portal.md`, `accounts-runner-profiles.md` y `sponsors-portal.md` son de esas specs).

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
12. **(F4) Audiencia runner.**
    - **Audiencias y destinos.** `AccessPanel` recibe `audience?: "staff" | "runner"`, con `"staff"` por defecto (la enmienda añade `"sponsor"`, ver abajo). La audiencia es el único lugar del que sale el destino:
      - `staff` → `/crm`, enlace al alta "¿Te invitaron? Crea tu cuenta" y aviso "Solo para personas invitadas por un administrador.". Es exactamente el comportamiento de F1–F3.
      - `runner` → `/cuenta` (F4) y, **desde `runner-portal.md` F6-T1, `/mis-carreras`**. Enlace al alta "Registrarse" y aviso "Este paso identifica tu acceso al sitio. Todavía no crea un perfil viajero independiente ni te inscribe en un evento." (texto de `cuenta.html`; sigue siendo cierto con `accounts-runner-profiles.md`, porque registrarse no crea el perfil). Vale también para una cuenta de staff que ingresa desde `/cuenta`: llega a `/mis-carreras`, no a `/crm`.
      - **(Enmienda; implementado en `sponsors-portal.md` F3-T4)** `sponsor` → `/patrocinador`, enlace al alta "¿Te invitaron? Crea tu cuenta" y aviso "Solo para marcas invitadas por Carreras Viajeras. Usa el correo de la invitación.".
      - Los formularios reciben el destino como unión cerrada `AuthDestination`; no hay ningún `string` libre ni lectura de la URL. Valor en F4: `"/crm" | "/cuenta"`. Valor final tras la enmienda: `"/crm" | "/mis-carreras" | "/patrocinador"` (`runner-portal.md` F6-T1 sustituye `"/cuenta"` por `"/mis-carreras"`; `sponsors-portal.md` F3-T4 añade `"/patrocinador"`; quien vaya segundo conserva lo del otro). `/cuenta` deja de ser destino tras ingresar y queda solo como destino de salida.
    - **`/crm/acceso` no cambia.** Sigue usando `<AccessPanel />` sin prop, sigue redirigiendo a `/crm` si hay sesión, y todos los tests de F1–F3 pasan sin modificarse.
    - **Mismo flujo para todos.** Todas las audiencias (`staff`, `runner` y, con la enmienda, `sponsor`) usan los mismos métodos de Neon Auth, schemas, mensajes sin enumeración de cuentas, verificación por código, `EMAIL_NOT_VERIFIED` y recuperación. Las audiencias no cambian `requireCrmUser()`, `getCrmAccess()`, `lib/auth/*`, la base de datos ni la matriz de permisos (los cambios de `lib/auth/*` que hacen `runner-portal.md` y `sponsors-portal.md` son de esas specs).
    - **Cuenta de runner.**
      - Es una cuenta de Neon Auth sin roles de staff. No crea filas en `profiles` ni `staff_*`; lo garantiza `accounts-roles-permissions.md` F1, cuyo criterio de "registro libre" sigue vigente.
      - Si abre `/crm`, ve la pantalla "sin acceso". Si su correo verificado coincide con una invitación de staff pendiente, la invitación se acepta al abrir `/crm`, como con cualquier invitado; no es una vía nueva.
    - **Alta de staff frente a registro público.**
      - Neon Auth no distingue entre ambos: "Sign-up with Email" ya está ON (confirmado por el usuario), así que cualquier persona puede crear una cuenta, también hoy desde `/crm/acceso`.
      - La invitación nunca controló la creación de cuentas. Controla los **roles**: se aceptan en el servidor por correo verificado y quedan ligados al `user_id` estable. Con la enmienda, lo mismo vale para el rol `sponsor` (`sponsors-portal.md`): el aviso de `/patrocinador/acceso` también es orientativo.
      - Por eso no hay conflicto técnico. El aviso "Solo para personas invitadas" de `/crm/acceso` es orientativo y se mantiene.
    - **`SignOutButton`.** Recibe `redirectTo?: SignOutDestination`, con `"/crm/acceso"` por defecto. Valor en F4: `"/crm/acceso" | "/cuenta"`. **(Enmienda; `sponsors-portal.md` F3-T4)** valor final: `"/crm/acceso" | "/cuenta" | "/patrocinador/acceso"`; `runner-portal.md` no lo cambia. `CrmShell` y `NoCrmAccess` no cambian. **(Enmienda; `runner-portal.md` F5-T1 o `sponsors-portal.md` F4-T1, quien llegue primero)** se exporta desde `@/modules/accounts` para que lo usen `PortalHeader`/`RunnerPortal` (`/mis-carreras`, `redirectTo="/cuenta"`) y `SponsorShell` y el layout del portal (`redirectTo="/patrocinador/acceso"`).
    - **`RunnerAccount` (cliente).** Lee la sesión con `authClient.useSession()`; es solo presentación y no protege nada. Muestra uno de estos estados:
      - cargando → `role="status"` "Cargando…";
      - sin sesión, o si `useSession` devuelve error → `<AccessPanel audience="runner" />`;
      - con sesión → `h1` "Qué bueno verte de nuevo.", el correo y `<SignOutButton redirectTo="/cuenta" />`. Con la enmienda, entre el correo y "Cerrar sesión", en este orden:
        - "Ver mis carreras" → `/mis-carreras` (`Link` + `buttonVariants()`), **implementado en `runner-portal.md` F6-T2**;
        - "Mi perfil" → `/cuenta/perfil` (`Link` + `buttonVariants({ variant: "outline" })`), **implementado en `accounts-runner-profiles.md` F2-T5**.

        El orden de implementación es indiferente: quien vaya segundo conserva el enlace del otro y su caso de test. `/cuenta` con sesión **no redirige** y sigue estática (`○`): no llama a guardas ni a la base.

      Better Auth actualiza `useSession` tras `/sign-in/email`, `/sign-up/email`, `/sign-out` y `/email-otp/verify-email`. Lo comprobé en `@neondatabase/auth/node_modules/better-auth/dist/client/config.mjs` y en `plugins/email-otp/client.mjs`.
13. **(Enmienda; implementado en `sponsors-portal.md` F4-T4) `/patrocinador/acceso`.** Página de acceso de patrocinadores, análoga a `/crm/acceso`:
    - Server Component que llama a `getSponsorAccess()` (`sponsors-portal.md`); con sesión (cualquier estado distinto de `unauthenticated`) → `redirect("/patrocinador")`; sin sesión → `<main>` centrado con `<AccessPanel audience="sponsor" />`.
    - `metadata = { title: "Acceso de patrocinadores", robots: { index: false } }`.
    - Sin bucles: una cuenta sin rol `sponsor` que llega a `/patrocinador` ve un aviso sin acceso con `<SignOutButton redirectTo="/patrocinador/acceso" />`, sin redirección (diseño de `sponsors-portal.md` F4).
    - Mismo flujo que el resto de audiencias: métodos de Neon Auth, schemas, mensajes sin enumeración de cuentas, verificación por código, `EMAIL_NOT_VERIFIED` y recuperación. `/crm/acceso` y `/cuenta` no cambian.

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

Fase 4 (audiencia runner):
- [ ] (F4) Dado `<AccessPanel />` sin prop, cuando el login o la verificación con sesión tienen éxito, entonces se llama a `router.replace("/crm")`. El alta muestra "¿Te invitaron? Crea tu cuenta" y "Solo para personas invitadas por un administrador.". Los tests existentes de `AccessPanel.test.tsx` pasan sin modificarse (unit test).
- [ ] (F4) Dado `<AccessPanel audience="runner" />`, cuando el login o la verificación con sesión tienen éxito, entonces se llama a `router.replace("/cuenta")` y `router.refresh()` (así se implementó F4); **desde `runner-portal.md` F6-T1, `router.replace("/mis-carreras")`** y `router.refresh()`. El enlace al alta dice "Registrarse", el alta muestra el aviso de runner y no aparece "Solo para personas invitadas…" (unit test).
- [ ] (F4) Dado `<AccessPanel audience="runner" />` y `EMAIL_NOT_VERIFIED` o la recuperación de contraseña, cuando se recorren, entonces el flujo y los mensajes son los mismos que para staff (unit test con un caso de cada).
- [ ] (F4) Dado el código, entonces los destinos están tipados como `"/crm" | "/cuenta"` y `"/crm/acceso" | "/cuenta"` (F4). Tras la enmienda: `AuthDestination = "/crm" | "/mis-carreras" | "/patrocinador"` y `SignOutDestination = "/crm/acceso" | "/cuenta" | "/patrocinador/acceso"` (ver Requisito 12). Ningún componente lee `searchParams`, `location` ni `?next=`.
- [ ] (F4) Dado `RunnerAccount` con `useSession` cargando, sin sesión o con sesión, entonces muestra "Cargando…", el panel de runner o "Qué bueno verte de nuevo." con el correo y "Cerrar sesión", respectivamente. Con sesión, "Cerrar sesión" llama a `signOut()` y luego a `router.replace("/cuenta")` (unit test). Con la enmienda, con sesión muestra además "Ver mis carreras" y "Mi perfil" (ver "Enmienda").
- [ ] (F4) Dado `/crm/acceso`, cuando lo uso con o sin sesión, entonces el comportamiento es idéntico al de F1–F3. `app/crm/*`, `lib/auth/*`, `lib/db*`, `app/api/*` y `drizzle/` no cambian.
- [ ] (F4) Dado `README.md`, entonces el modelo de acceso dice que los runners pueden tener cuenta de Neon Auth sin roles de staff (sustituye "visitantes anónimos, sin cuenta ni perfil") e incluye los pasos manuales de la Fase 4.
- [ ] (F4) Medición del Worker como en F1, y lint, vitest y build pasan.

Enmienda 2026-10-25 (sin fase propia: cada criterio lo verifica el reviewer de la spec y la fase indicadas):
- [ ] (`runner-portal.md` F6-T1) Dado `<AccessPanel audience="runner" />`, cuando el login o la verificación con sesión tienen éxito, entonces se llama a `router.replace("/mis-carreras")` y `router.refresh()`. Con `<AccessPanel />` (staff) sigue siendo `/crm` y los tests de staff pasan sin cambios.
- [ ] (`runner-portal.md` F6-T2) Dado `RunnerAccount` con sesión, entonces muestra "Qué bueno verte de nuevo.", el correo, el enlace "Ver mis carreras" → `/mis-carreras` y "Cerrar sesión" (unit test). `/cuenta` no redirige, no llama a guardas ni a la base y sigue estática.
- [ ] (`accounts-runner-profiles.md` F2-T5) Dado `RunnerAccount` con sesión, entonces muestra el enlace "Mi perfil" → `/cuenta/perfil` antes de "Cerrar sesión" (unit test). Si `runner-portal.md` F6-T2 ya está integrado, "Ver mis carreras" se conserva y va primero.
- [ ] (`sponsors-portal.md` F3-T4) Dado `<AccessPanel audience="sponsor" />`, entonces el alta muestra "¿Te invitaron? Crea tu cuenta" y "Solo para marcas invitadas por Carreras Viajeras. Usa el correo de la invitación.", y tras ingresar o verificar se llama a `router.replace("/patrocinador")` (unit test). Las audiencias `staff` y `runner` mantienen el destino que tengan en ese momento (`/crm`; `/cuenta` o `/mis-carreras`).
- [ ] (`sponsors-portal.md` F4-T4) Dado `/patrocinador/acceso` sin sesión, entonces muestra `AccessPanel audience="sponsor"`; con sesión redirige a `/patrocinador`; tiene `robots: { index: false }`.
- [ ] (`runner-portal.md` F5-T1 o `sponsors-portal.md` F4-T1) Dado `@/modules/accounts`, entonces exporta `SignOutButton`, una sola vez.
- [ ] (todas, al cerrar la última de las tres) Dado el código, entonces `AuthDestination = "/crm" | "/mis-carreras" | "/patrocinador"` y `SignOutDestination = "/crm/acceso" | "/cuenta" | "/patrocinador/acceso"`, y ningún componente lee `searchParams`, `location` ni `?next=`.

Manual en producción (el usuario, con su autorización; agentes sin acceso a Neon desde este entorno):
- [ ] Login de admin (ronalehm@gmail.com, tras el bootstrap) → `/crm` muestra "Admin".
- [ ] Una cuenta sin rol ve la pantalla sin acceso.
- [ ] "Cerrar sesión" lleva a `/crm/acceso`.
- [ ] El admin invita a un correo (o se crea la invitación por SQL hasta que exista la Fase 2 de `accounts-roles-permissions.md`) → la persona crea su cuenta → recibe el código → verifica → `/crm` muestra "Comercial".
- [ ] Recuperar la contraseña con código y volver a iniciar sesión.
- [ ] Comprobar que llega el código de 6 dígitos y que la sesión persiste al recargar.
- [ ] (F4) Un correo nuevo se registra en `/cuenta`, verifica el código y queda en `/cuenta` con sesión (desde `runner-portal.md` F6: llega a `/mis-carreras`; al volver a `/cuenta` ve "Ver mis carreras" y, con `accounts-runner-profiles.md` F2, "Mi perfil"). Al abrir `/crm` ve la pantalla "sin acceso", `GET /api/crm/me` responde 403 y no aparecen filas nuevas en `profiles` ni `staff_assignments`.
- [ ] (F4) "Cerrar sesión" en `/cuenta` vuelve a `/cuenta` sin sesión, y el login de admin en `/crm/acceso` sigue llevando a `/crm`.
- [ ] (Enmienda; checklist de `sponsors-portal.md`) Una persona invitada como patrocinadora se registra en `/patrocinador/acceso`, verifica y llega a `/patrocinador`; "Cerrar sesión" en el portal vuelve a `/patrocinador/acceso`.

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
- `app/patrocinador/acceso/page.tsx` (enmienda; **implementado en `sponsors-portal.md` F4-T4**, que es dueña de la ruta): Requisito 13. Esta spec solo fija su comportamiento de acceso; `getSponsorAccess()` y el resto de `/patrocinador/**` son de `sponsors-portal.md`.
- Las demás rutas que consumen la audiencia o los destinos son de sus specs: `/cuenta` (`landing-public-site.md` F3), `/mis-carreras` (`runner-portal.md` F5), `/cuenta/perfil` (`accounts-runner-profiles.md` F2) y `/patrocinador` (`sponsors-portal.md` F4).

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
| `index.ts` | nuevo | F1, ampliado en F2 y F4 | Exporta `getCrmAccess`, `CrmShell`, `NoCrmAccess` y `SignInForm` (F1), y `AccessPanel` (F2, en lugar de `SignInForm`). F4 añade `RunnerAccount` y `type AccessAudience` |
| `types/auth.types.ts` | modificado | F4 | Añade `AccessAudience = "staff" \| "runner"`, `AuthDestination = "/crm" \| "/cuenta"` y `SignOutDestination = "/crm/acceso" \| "/cuenta"` |
| `components/AccessPanel.tsx` | modificado | F4 | Prop `audience?: AccessAudience` (por defecto `"staff"`). Constante local `AUDIENCE_CONFIG: Record<AccessAudience, { destination: AuthDestination; signUpLabel: string; signUpNotice: string }>`. Pasa `destination` y `signUpLabel` a `SignInForm`, `notice` a `SignUpForm` y `destination` a `VerifyEmailForm`. Los pasos y el estado no cambian |
| `components/SignInForm.tsx` | modificado | F4 | Props obligatorias `destination: AuthDestination` y `signUpLabel: string`; sustituyen al literal `"/crm"` de `router.replace` y al texto fijo del enlace al alta. Solo lo usa `AccessPanel`, que es donde vive el valor por defecto |
| `components/SignUpForm.tsx` | modificado | F4 | Prop obligatoria `notice: string` en lugar del aviso fijo |
| `components/VerifyEmailForm.tsx` | modificado | F4 | Prop obligatoria `destination: AuthDestination` en lugar del literal `"/crm"` |
| `components/SignOutButton.tsx` | modificado | F4 | Prop `redirectTo?: SignOutDestination` (por defecto `"/crm/acceso"`); `CrmShell` y `NoCrmAccess` siguen sin pasarla |
| `components/RunnerAccount.tsx` | nuevo, `"use client"` | F4 | Estados de sesión con `authClient.useSession()` (Requisito 12). Sin props ni maquetación de página: la columna de diseño de `/cuenta` la pone la landing |
| `types/auth.types.ts` | modificado | Enmienda (`runner-portal.md` F6-T1; `sponsors-portal.md` F3-T4) | `AccessAudience = "staff" \| "runner" \| "sponsor"`; `AuthDestination = "/crm" \| "/mis-carreras" \| "/patrocinador"`; `SignOutDestination = "/crm/acceso" \| "/cuenta" \| "/patrocinador/acceso"` |
| `components/AccessPanel.tsx` | modificado | Enmienda (`runner-portal.md` F6-T1; `sponsors-portal.md` F3-T4) | `AUDIENCE_CONFIG.runner.destination = "/mis-carreras"`; nueva entrada `AUDIENCE_CONFIG.sponsor = { destination: "/patrocinador", signUpLabel: "¿Te invitaron? Crea tu cuenta", signUpNotice: "Solo para marcas invitadas por Carreras Viajeras. Usa el correo de la invitación." }`. Pasos, estado y formularios no cambian |
| `components/RunnerAccount.tsx` | modificado | Enmienda (`runner-portal.md` F6-T2; `accounts-runner-profiles.md` F2-T5) | Con sesión: "Ver mis carreras" (→ `/mis-carreras`, `buttonVariants()`) y "Mi perfil" (→ `/cuenta/perfil`, `buttonVariants({ variant: "outline" })`), en ese orden, antes de "Cerrar sesión". Sigue sin props |
| `index.ts` | modificado | Enmienda (`runner-portal.md` F5-T1 o `sponsors-portal.md` F4-T1, quien llegue primero; el otro lo omite) | Añade `SignOutButton`. Las demás exportaciones nuevas de `@/modules/accounts` (perfil, staff de marcas) son de sus specs |

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
- **Redirecciones:** solo destinos internos fijos, tipados como uniones cerradas y elegidos en el código, nunca desde la URL. Lista cerrada completa tras la enmienda:
  - tras ingresar o verificar (`AuthDestination`): `/crm` (staff), `/mis-carreras` (runner, desde `runner-portal.md` F6; en F4 era `/cuenta`) y `/patrocinador` (sponsor, desde `sponsors-portal.md` F3);
  - tras cerrar sesión (`SignOutDestination`): `/crm/acceso`, `/cuenta` (solo salida) y `/patrocinador/acceso` (solo salida, desde `sponsors-portal.md` F3);
  - redirecciones de servidor de las páginas, también fijas en el código: `/crm/acceso` con sesión → `/crm`; `/crm/**` sin sesión → `/crm/acceso`; `/patrocinador/acceso` con sesión → `/patrocinador` y `/patrocinador/**` sin sesión → `/patrocinador/acceso` (`sponsors-portal.md` F4); `/mis-carreras` sin sesión → `/cuenta` (`runner-portal.md` F5); `/cuenta/perfil` sin sesión → `/cuenta` (`accounts-runner-profiles.md` F2). Ninguna página redirige a quien tiene sesión sin permiso: muestra un aviso, así que no hay bucles.
- **(F4) Registro público:** no amplía la superficie. El endpoint de alta de Neon Auth ya era público ("Sign-up with Email" ON) y el control de acceso real sigue en `requireCrmUser()` (correo verificado + rol activo por `user_id`, denegado por defecto). `RunnerAccount` solo muestra el estado de sesión; los recursos para runners tienen su propia guarda en el servidor (`getRunnerPortal` en `runner-portal.md`, `getRunnerProfilePage` en `accounts-runner-profiles.md`), y el portal de patrocinadores la suya (`requireSponsor()`/`getSponsorAccess()` en `sponsors-portal.md`). La audiencia `sponsor` no concede nada: el rol llega solo por invitación aceptada en el servidor.
- **Requisitos manuales en Neon Auth:** dominio de confianza `https://carreras-viajeras.mentec.dev`, registro por email ON, verificación al registrarse con código y recuperación por código (F3). Se documentan en el README.

### Enmienda: qué implementa cada spec
Esta spec no añade tareas. Cada cambio lo implementa una sola spec, en la tarea indicada; si otra spec ya lo hizo, se omite.

| Cambio | Archivos de `modules/accounts` | Lo implementa |
|---|---|---|
| Exportar `SignOutButton` | `index.ts` | `runner-portal.md` F5-T1 o `sponsors-portal.md` F4-T1 (quien llegue primero) |
| Destino del runner `/mis-carreras` y `AuthDestination` sin `/cuenta` | `types/auth.types.ts`, `components/AccessPanel.tsx`, `components/AccessPanel.test.tsx` | `runner-portal.md` F6-T1 |
| "Ver mis carreras" en `RunnerAccount` | `components/RunnerAccount.tsx`, `components/RunnerAccount.test.tsx` | `runner-portal.md` F6-T2 |
| "Mi perfil" en `RunnerAccount` | `components/RunnerAccount.tsx`, `components/RunnerAccount.test.tsx` | `accounts-runner-profiles.md` F2-T5 |
| Audiencia `sponsor`, `/patrocinador` en `AuthDestination` y `/patrocinador/acceso` en `SignOutDestination` | `types/auth.types.ts`, `components/AccessPanel.tsx`, `components/AccessPanel.test.tsx` | `sponsors-portal.md` F3-T4 |
| Página `/patrocinador/acceso` | ninguno (`app/patrocinador/acceso/page.tsx`) | `sponsors-portal.md` F4-T4 |
| README: modelo de acceso con el portal del runner, su perfil y los patrocinadores | `README.md` | `runner-portal.md` F6-T3, `accounts-runner-profiles.md` F2-T5 y `sponsors-portal.md` F5-T5, cada una con su parte |

Coordinación: `runner-portal.md` F6-T1 y `sponsors-portal.md` F3-T4 tocan los mismos tres archivos, igual que `runner-portal.md` F6-T2 y `accounts-runner-profiles.md` F2-T5. Se ejecutan en secuencia, nunca en paralelo, y la segunda conserva lo de la primera (tipos, entradas de `AUDIENCE_CONFIG`, enlaces y casos de test).

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
  - **(F4) audiencia** (casos nuevos en un `describe` aparte; los existentes no se editan):
    - `audience="runner"`: login correcto → `router.replace("/cuenta")`; verificación con sesión → `/cuenta`; el enlace al alta dice "Registrarse"; el alta muestra el aviso de runner y no el de invitación; `EMAIL_NOT_VERIFIED` → paso de verificación como en staff;
    - sin prop: el enlace "¿Te invitaron? Crea tu cuenta" y el aviso de invitación siguen presentes.
  - **(Enmienda)** `runner-portal.md` F6-T1: los casos runner pasan a esperar `/mis-carreras`. `sponsors-portal.md` F3-T4: `describe` nuevo para `audience="sponsor"` (enlace y aviso del alta, destino `/patrocinador` tras ingresar y tras verificar con sesión). Los casos de staff no cambian.
- `modules/accounts/components/RunnerAccount.test.tsx` (F4; `@/lib/auth/client` mockeado con `useSession`, `signOut` y los métodos del panel, más `next/navigation`):
  - `isPending` → "Cargando…";
  - sin sesión o con `error` → se ve el formulario "Iniciar sesión" con el enlace "Registrarse";
  - con sesión → "Qué bueno verte de nuevo." y el correo;
  - "Cerrar sesión" → `signOut()` y luego `router.replace("/cuenta")`;
  - **(Enmienda)** con sesión, enlace "Ver mis carreras" → `/mis-carreras` (`runner-portal.md` F6-T2) y enlace "Mi perfil" → `/cuenta/perfil` (`accounts-runner-profiles.md` F2-T5).
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

### Fase 4: audiencia runner para la cuenta pública (3 tareas, 11 archivos)
La consume `landing-public-site.md` F3. No toca `app/`: la ruta `/cuenta` es de la landing.
- [x] T1 — Tipos, audiencia en `AccessPanel`, destino y textos por prop en los formularios, `redirectTo` en `SignOutButton` y casos de test de la audiencia · archivos: `modules/accounts/types/auth.types.ts`, `modules/accounts/components/AccessPanel.tsx`, `modules/accounts/components/SignInForm.tsx`, `modules/accounts/components/SignUpForm.tsx`, `modules/accounts/components/VerifyEmailForm.tsx`, `modules/accounts/components/SignOutButton.tsx`, `modules/accounts/components/AccessPanel.test.tsx` · depende de: Fase 3 · secuencial
- [x] T2 — `RunnerAccount` con test y exports; medir el Worker · archivos: `modules/accounts/components/RunnerAccount.tsx`, `modules/accounts/components/RunnerAccount.test.tsx`, `modules/accounts/index.ts` · depende de: F4-T1 · secuencial
- [x] T3 — README: modelo de acceso con cuentas de runner y checklist manual de F4 · archivos: `README.md` · depende de: — · paralelo (con F4-T1 y F4-T2)

### Enmienda 2026-10-25 (sin tareas en esta spec)
La implementan `runner-portal.md` (F5-T1, F6-T1, F6-T2, F6-T3), `accounts-runner-profiles.md` (F2-T5) y `sponsors-portal.md` (F3-T4, F4-T1, F4-T4), según la tabla "Enmienda: qué implementa cada spec". Ningún developer implementa la enmienda desde esta spec.

## Preguntas abiertas
1. **Si Neon Auth gestionado no admite la recuperación por código** (la comprobación previa de F3 lo dirá), ¿qué prefieres?
   - (a) Configurar SMTP propio (p. ej., un proveedor transaccional) y recuperar por enlace.
   - (b) Dejar la recuperación fuera del MVP, de modo que el admin la resuelva a mano desde la consola de Neon.
2. **(No bloqueante; enmienda) Tipos literales en los criterios de `runner-portal.md` F6.** Su criterio dice "`AuthDestination` … es `"/crm" | "/mis-carreras"`; `SignOutDestination` no cambia (`"/crm/acceso" | "/cuenta"`)", pero `sponsors-portal.md` F3-T4 añade `"/patrocinador"` y `"/patrocinador/acceso"`. La propia "Coordinación" de `sponsors-portal.md` resuelve la unión. **Propuesta por defecto:** el reviewer de `runner-portal.md` F6 da por cumplido ese criterio si los tipos son `"/crm" | "/mis-carreras"` más los valores de patrocinador ya integrados (valor final: `"/crm" | "/mis-carreras" | "/patrocinador"` y `"/crm/acceso" | "/cuenta" | "/patrocinador/acceso"`), sin editar `runner-portal.md`. Del mismo modo, "las audiencias `staff` y `runner` no cambian" en `sponsors-portal.md` F3 se lee como "mantienen el destino que tengan en ese momento".
