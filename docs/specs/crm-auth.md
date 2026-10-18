# Autenticación y armazón del CRM

- Módulo: crm
- Estado: borrador
- Orden en el roadmap: 1 de 5 (`crm-auth` → `trips-catalog` → `crm-leads-pipeline` → `landing-public-site` → `platform-cloudflare-deploy`)
- Depende de: Fase 0 de stack (hecha por el coordinador en modo build: next/eslint-config-next 16.4.2, `@opennextjs/cloudflare` + `wrangler`, `wrangler.jsonc` con binding D1 `DB`, `open-next.config.ts` sin R2, `initOpenNextCloudflareForDev()` en `next.config.ts`, scripts `preview`/`deploy`/`cf-typegen`, `cloudflare-env.d.ts`).

## Objetivo
Carreras Viajeras necesita un área privada `/crm` donde solo el equipo pueda ver leads y gestionar el catálogo. Esta spec crea la protección de acceso y el armazón visual (layout + navegación) sobre el que se montan `trips-catalog` y `crm-leads-pipeline`.

## Decisión de autenticación (recomendación, pendiente de confirmar por el usuario)

| Criterio | A. Cloudflare Access (Zero Trust) — **recomendada** | B. Login propio simple |
|---|---|---|
| Coste | Gratis hasta 50 usuarios (plan Zero Trust Free) | Gratis |
| Código propio | Mínimo: verificar el JWT que Access añade a cada petición | Tabla `users`, hash de contraseñas, sesión en cookie firmada, página de login, logout, alta de usuarios |
| Seguridad | MFA / código por email gestionados por Cloudflare; no guardamos contraseñas | Somos responsables de hash, fuerza bruta, recuperación de contraseña (no incluida) |
| Encaje con Workers Free | Bueno (verificar un JWT es barato) | El hash de contraseñas (PBKDF2 con WebCrypto) puede acercarse al límite de 10 ms de CPU por petición del plan gratuito |
| Desarrollo local | Sin Access delante: se usa un usuario de desarrollo (solo `next dev`) | Funciona igual en local |
| Dependencia de la cuenta | Requiere activar Zero Trust (nombre de equipo) en la cuenta Cloudflare | Ninguna |

Esta spec se redacta para la **opción A**. Si el usuario elige B, se reescribe esta spec antes de aprobarla (ver Preguntas abiertas); el resto de specs no cambia porque todas usan solo `getCrmUser()` / `requireCrmUser()` de `lib/auth.ts`.

## Alcance
- Incluye:
  - `lib/env.ts`: lectura y validación con zod de las variables de entorno del servidor (desde `getCloudflareContext().env`).
  - `lib/auth.ts`: `getCrmUser()` y `requireCrmUser()` que verifican el JWT de Cloudflare Access (cabecera `cf-access-jwt-assertion`) contra las claves públicas del equipo, el emisor y la audiencia (AUD).
  - Usuario de desarrollo para `next dev` (variable `CRM_DEV_USER_EMAIL`), nunca activo fuera de `NODE_ENV === "development"`.
  - Layout `/crm` que devuelve 404 si no hay usuario válido, con `robots: noindex`.
  - Componente `CrmShell` (cabecera con marca, navegación, email del usuario y enlace "Cerrar sesión").
  - Página `/crm` provisional ("Panel CRM"), que `crm-leads-pipeline` reemplazará por el embudo.
- No incluye:
  - Configurar la aplicación de Access en el panel de Cloudflare (va en `platform-cloudflare-deploy`).
  - Roles o permisos distintos por usuario: todo usuario que pase Access tiene acceso completo.
  - `proxy.ts` (antes `middleware.ts`): en Next 16 corre en runtime Node y su soporte en OpenNext Cloudflare es experimental; la verificación se hace en el layout y en cada Server Action (patrón DAL de la guía de autenticación de Next).
  - Login propio, alta de usuarios, recuperación de contraseña.
  - `forbidden()` / `unauthorized()` de Next (requieren el flag experimental `authInterrupts`).

## Requisitos
1. Toda ruta bajo `/crm` exige un usuario válido; sin él responde 404 (no revela que existe el CRM).
2. Un usuario es válido si la cabecera `cf-access-jwt-assertion` contiene un JWT firmado por `${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, con `iss === CF_ACCESS_TEAM_DOMAIN`, `aud` que incluye `CF_ACCESS_AUD` y un claim `email`.
3. Falla cerrado: en producción, si faltan `CF_ACCESS_TEAM_DOMAIN` o `CF_ACCESS_AUD`, no hay usuario válido (y se registra un `console.error`).
4. Solo con `NODE_ENV === "development"` y `CRM_DEV_USER_EMAIL` definido, `getCrmUser()` devuelve `{ email: CRM_DEV_USER_EMAIL }` sin JWT.
5. `requireCrmUser()` lanza `Error("No autorizado")` si no hay usuario. Toda Server Action del CRM (specs siguientes) la llama en su primera línea, porque una Server Action se puede invocar con un POST desde cualquier ruta, no solo desde `/crm`.
6. La UI del CRM está en español.

## Criterios de aceptación
- [ ] (F1) Dado `next dev` con `CRM_DEV_USER_EMAIL=dev@example.com` en `.dev.vars`, cuando abro `/crm`, entonces veo la cabecera del CRM con "dev@example.com" y el texto "Panel CRM".
- [ ] (F1) Dado `next dev` sin `CRM_DEV_USER_EMAIL`, cuando abro `/crm`, entonces recibo la página 404.
- [ ] (F1) Dado el HTML de `/crm`, cuando lo inspecciono, entonces incluye `<meta name="robots" content="noindex, nofollow">` (o equivalente generado por `metadata.robots`).
- [ ] (F1) Dado un JWT válido (firma, `iss`, `aud`, `email`), cuando se llama `getCrmUser()`, entonces devuelve `{ email }` (cubierto por unit test con `jose` mockeado).
- [ ] (F1) Dado un JWT con firma inválida, `aud` distinta o sin cabecera, cuando se llama `getCrmUser()` en producción, entonces devuelve `null` (unit test).
- [ ] (F1) Dado `NODE_ENV=production` y `CRM_DEV_USER_EMAIL` definido pero sin JWT, cuando se llama `getCrmUser()`, entonces devuelve `null` (unit test).
- [ ] (F1) Dado que no hay usuario, cuando se llama `requireCrmUser()`, entonces lanza `Error("No autorizado")` (unit test).
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` terminan sin errores.

## Diseño técnico
- Rutas (`app/`):
  - `app/crm/layout.tsx` — Server Component: `await connection();` (de `next/server`; evita que el build intente prerenderizar `/crm`, donde `getCloudflareContext()` síncrono no está disponible) y después `const user = await getCrmUser(); if (!user) notFound();` y renderiza `<CrmShell userEmail={user.email}>{children}</CrmShell>`. Exporta `metadata = { title: "CRM · Carreras Viajeras", robots: { index: false, follow: false } }`.
  - `app/crm/page.tsx` — provisional: título "Panel CRM" y un párrafo. Sin datos.
- Componentes:
  - `CrmShell` — nuevo en `modules/crm/components/CrmShell.tsx` (no existe nada parecido; es exclusivo del CRM). Server Component. Props: `userEmail: string`, `children: React.ReactNode`. Cabecera con "Carreras Viajeras · CRM", navegación definida en un array local `NAV_ITEMS = [{ href: "/crm", label: "Embudo" }]` (las specs siguientes añaden items), email del usuario y enlace "Cerrar sesión" a `/cdn-cgi/access/logout`. Los enlaces son `next/link` con `className={buttonVariants({ variant: "ghost" })}`; tokens del tema.
  - `buttonVariants` — shadcn (instalado, `components/ui/button.tsx`).
  - Sin `sidebar` de shadcn: con 2-3 enlaces basta una cabecera (KISS; `sidebar` arrastra sheet, tooltip, skeleton y un hook).
- `lib/`:
  - `lib/env.ts` — nuevo. `serverEnvSchema = z.object({ CF_ACCESS_TEAM_DOMAIN: z.url().optional(), CF_ACCESS_AUD: z.string().min(1).optional(), CRM_DEV_USER_EMAIL: z.email().optional() })` y `getServerEnv()` que hace `serverEnvSchema.parse(getCloudflareContext().env)` (zod ignora el binding `DB` y demás claves). `CF_ACCESS_TEAM_DOMAIN` tiene la forma `https://<equipo>.cloudflareaccess.com`.
  - `lib/auth.ts` — nuevo. `import { createRemoteJWKSet, jwtVerify } from "jose"`. Exporta `type CrmUser = { email: string }`, `getCrmUser(): Promise<CrmUser | null>` (envuelto en `cache` de React para memoizar por petición) y `requireCrmUser(): Promise<CrmUser>`. Lee la cabecera con `(await headers()).get("cf-access-jwt-assertion")`. El JWKS se crea una vez por URL de certificados (variable de módulo). Cualquier excepción de `jwtVerify` → `null`.
- Dependencias: `jose` (verificación de JWT con WebCrypto; funciona en Workers). Única dependencia nueva.
- Variables de entorno (en local, archivo `.dev.vars`, ya ignorado por git):
  - `CRM_DEV_USER_EMAIL` (solo desarrollo).
  - `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (producción; se configuran como secrets en `platform-cloudflare-deploy`).
- Contrato:
  ```ts
  // lib/auth.ts
  export type CrmUser = { email: string };
  export function getCrmUser(): Promise<CrmUser | null>;
  export function requireCrmUser(): Promise<CrmUser>; // throws Error("No autorizado")
  ```
- Patrón de mutaciones para todo el proyecto (lo usan las specs siguientes): Server Actions en `modules/<dominio>/actions/<dominio>.actions.ts` (`"use server"`), que llaman primero a `requireCrmUser()` cuando son del CRM. Ver `trips-catalog.md` › "Patrón de datos".

## Reutilización
- `buttonVariants` de `components/ui/button.tsx` (shadcn, instalado) para dar estilo a los enlaces de navegación.
- `cn()` de `@/lib/utils`.
- `getCloudflareContext()` de `@opennextjs/cloudflare` (Fase 0) para leer variables.
- No existe aún ningún módulo, hook ni util de auth en el proyecto.

## Tests
- `lib/auth.test.ts` (requerido: función con lógica de seguridad). Mockear `next/headers`, `jose` (`jwtVerify`, `createRemoteJWKSet`) y `@/lib/env`. Casos:
  1. Desarrollo + `CRM_DEV_USER_EMAIL` → `{ email }` sin llamar a `jwtVerify`.
  2. Producción sin `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` → `null`.
  3. Producción sin cabecera → `null`.
  4. JWT válido → `{ email }`; se llama a `jwtVerify` con `issuer` = team domain y `audience` = AUD.
  5. `jwtVerify` lanza → `null`.
  6. Payload sin `email` → `null`.
  7. Producción + `CRM_DEV_USER_EMAIL` + sin JWT → `null`.
  8. `requireCrmUser()` lanza `Error("No autorizado")` cuando no hay usuario.
- `lib/env.ts`: sin test (schema trivial).
- `CrmShell`, layout y página: sin test (presentacionales / composición).

## Plan de tareas
### Fase 1
- [ ] T1 — Instalar `jose` y crear `lib/env.ts` · archivos: `package.json`, `package-lock.json`, `lib/env.ts` · depende de: — · secuencial (base)
- [ ] T2 — `lib/auth.ts` con `getCrmUser`/`requireCrmUser` y sus tests · archivos: `lib/auth.ts`, `lib/auth.test.ts` · depende de: T1 · secuencial (lib compartido)
- [ ] T3 — Armazón del CRM: `CrmShell`, API pública del módulo y rutas `/crm` · archivos: `modules/crm/components/CrmShell.tsx`, `modules/crm/index.ts`, `app/crm/layout.tsx`, `app/crm/page.tsx` · depende de: T2 · secuencial

## Preguntas abiertas
1. **Autenticación:** ¿confirmas la opción A (Cloudflare Access, recomendada) o prefieres B (login propio)? Si eliges B, esta spec se reescribe antes de aprobarla.
2. **Zero Trust:** al activar Zero Trust, Cloudflare pide elegir un nombre de equipo (`<equipo>.cloudflareaccess.com`) y puede pedir un medio de pago aunque el plan Free cueste 0 USD. ¿Tienes Zero Trust activado o podemos activarlo? ¿Qué nombre de equipo?
3. **Usuarios del CRM:** ¿qué emails deben tener acceso (para la política de Access)? ¿Método de acceso: código de un solo uso por email (por defecto) o Google?
