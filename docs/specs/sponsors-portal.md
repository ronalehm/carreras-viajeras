# Patrocinadores: rol `sponsor`, portal de eventos con revisión del equipo y promoción pública

- Módulo: sponsors (con cambios en `accounts`, `trips` y `landing`)
- Estado: borrador
- Depende de:
  - `accounts-roles-permissions.md` (aprobada, implementada): enum `staff_role`, `profiles`, `staff_assignments`, `staff_invitations`, aceptación atómica en `getCurrentUser`, matriz `can()`, `/crm/admin/usuarios`. Esa spec ya prevé roles nuevos "como valores nuevos del enum `staff_role` (`ALTER TYPE … ADD VALUE`) y entradas nuevas en la matriz".
  - `accounts-auth-ui.md` (aprobada, F1–F4 implementadas): `AccessPanel`, `SignInForm`/`VerifyEmailForm` con destinos cerrados, `SignOutButton`, `getCrmAccess`, `NoCrmAccess`, layout `app/crm/(protected)/`.
  - `trips-catalog.md` (aprobada, F1–F2 implementadas): tabla `trips`, `trip_status`, `TripForm`, `TripTable`, `trips.actions.ts`, `listPublishedTrips`/`getPublishedTripBySlug`, `ConfirmActionButton` en `components/shared/`.
  - `landing-public-site.md` (aprobada, F1–F4 en `main`): `/`, `/viajes/[slug]` con `getCatalogTrip`, `TripDetail`, `SiteHeader`/`SiteFooter`, `buildWhatsAppUrl`.
- Relacionadas y en curso: `runner-portal.md` (F5/F6 pendientes: exportan `SignOutButton` y cambian `AuthDestination`) y `accounts-runner-profiles.md` (otra spec en paralelo: también modifica `lib/db-schema.ts` y genera migración). Ver "Coordinación".

## Objetivo
Carreras Viajeras quiere que **marcas patrocinadoras** publiquen y promocionen sus eventos y carreras dentro del mismo catálogo de viajes, siempre con control del equipo:
- El **admin** da de alta cada marca (nombre, identificador, logo, sitio web y descripción) e invita por correo a las personas de esa marca, igual que invita al staff.
- La **persona patrocinadora** entra en un panel propio (`/patrocinador`), crea eventos como borradores con el mismo formulario que usa el equipo y los envía a revisión. Solo ve y edita los eventos de su marca, nunca leads, reservas, otros viajes, staff ni runners.
- El **equipo** (`commercial` y `admin`) revisa los eventos en `/crm/viajes`: los publica o los devuelve con un motivo, y decide cuáles se destacan en la portada.
- El **visitante** ve en `/viajes/<slug>` quién presenta el evento ("Presentado por …"), los eventos destacados en `/` y una página por marca, `/patrocinadores/<slug>`.

## Alcance
- Incluye:
  - (F1) Datos: tabla `sponsors`, valor `sponsor` en el enum `staff_role`, columna `sponsor_id` en `staff_invitations` y `staff_assignments`, y en `trips` las columnas `sponsor_id`, `featured`, `review_status` (enum nuevo `trip_review_status`) y `review_note`, con sus CHECK. La migración la genera `npm run db:generate`, se revisa y **la aplica a mano el usuario** (README).
  - (F1) Permisos `sponsors.manage` (solo admin) y `sponsor.portal` (rol `sponsor`); guarda `requireSponsor()` y lectura `loadSponsorId()`; la aceptación atómica de invitaciones copia `sponsor_id`.
  - (F2) CRM: gestión de marcas en `/crm/admin/patrocinadores` (lista, alta y edición), enlace "Patrocinadores" en `CrmShell`.
  - (F3) CRM: personas de cada marca en `/crm/admin/patrocinadores/<id>`: invitar, ver invitaciones pendientes y revocar el acceso, reutilizando `InviteStaffForm`, `InvitationsTable` y `StaffTable`. `/crm/admin/usuarios` pasa a listar solo al equipo. Audiencia `sponsor` en `AccessPanel`.
  - (F4) Portal: `/patrocinador/acceso` (ingreso y alta por invitación), layout protegido y "Mis eventos" (lista de solo lectura de la marca).
  - (F5) Portal: crear, editar y enviar a revisión con `TripForm` (prop `audience`); el equipo ya puede aprobar publicando; "Despublicar" devuelve el evento a revisión.
  - (F6) CRM: revisión y destacados en `/crm/viajes` (marca, estado de revisión, cola de pendientes arriba, "Devolver al patrocinador" con motivo, "Destacar"); `PublicTrip` añade la marca.
  - (F7) Promoción pública: "Presentado por …" en `/viajes/<slug>`, plantilla genérica para eventos sin contenido fijo, sección "Eventos destacados" en `/` y `/patrocinadores/<slug>`.
- No incluye:
  - Perfiles de runners (otra spec, `accounts-runner-profiles.md`).
  - Que el patrocinador publique, despublique, archive o destaque. Tampoco que edite un evento en revisión, publicado o archivado (Decisión 8).
  - Que el patrocinador vea leads, reservas, pagos, itinerarios, avisos, otros viajes, staff, runners ni estadísticas (visitas, consultas).
  - Notificaciones por correo o WhatsApp al enviar, devolver o publicar: el equipo ve la cola en `/crm/viajes` y el patrocinador ve el estado en su panel.
  - Subida de archivos: logo e imagen del evento solo por URL `https://` externa (no hay R2 ni binding de Images).
  - Borrar o archivar marcas, cambiar el identificador de una marca después de crearla, o asignar a una marca un viaje ya existente del equipo.
  - Varias marcas por cuenta (Decisión 5) o roles distintos dentro de una marca.
  - Historial de revisiones (solo se guarda el último motivo de devolución).
  - API HTTP nueva: todo son Server Components y Server Actions, como en `trips-catalog.md`.
  - Pagos o patrocinios pagados, contratos, niveles de patrocinio o métricas.
  - Caché de las lecturas públicas (ISR, KV): son por petición, como en el resto del catálogo.

## Requisitos
1. **Rol `sponsor`.** Es un valor nuevo de `staff_role`, asignado únicamente por invitación del admin (`staff_invitations` con `role = 'sponsor'` y `sponsor_id`) y aceptado de forma atómica en `getCurrentUser`, como el staff. Registrarse sin invitación no concede nada. Una asignación `sponsor` siempre lleva `sponsor_id` y una de staff nunca la lleva (CHECK).
2. **Sin herencia del CRM.** `sponsor` no tiene `crm.access` ni ningún permiso existente. `/crm/**` le muestra `NoCrmAccess`, `GET /api/crm/me` responde 403 y las Server Actions del CRM devuelven `forbidden`. Solo tiene `sponsor.portal`.
3. **Admin conserva todo.** `can(["admin"], p)` sigue siendo `true` para todo permiso, incluidos los nuevos. El portal exige además una asignación `sponsor` activa con marca (`requireSponsor`), así que un admin sin marca no entra en `/patrocinador`. `commercial` no gana ni pierde permisos.
4. **Pertenencia por marca.** Los eventos pertenecen a la marca (`trips.sponsor_id`), no a la persona: todas las personas activas de una marca ven y editan los mismos eventos. El `sponsor_id` sale siempre de la sesión (`requireSponsor`), nunca del formulario, y va siempre en el `WHERE`. Un id de otra marca se comporta igual que uno inexistente (404 o `not_found`, sin revelar que existe).
5. **Flujo de revisión** (estados y transiciones en "Flujo de revisión"): el patrocinador crea borradores, los edita y los envía a revisión. El equipo (`trips.manage`) publica (aprobación), devuelve con motivo, despublica o archiva. El equipo no puede publicar un borrador de patrocinador que no se haya enviado a revisión. `trip_status` mantiene sus tres valores y las lecturas públicas siguen filtrando `status = 'published'`.
6. **Destacados.** Solo el equipo marca o desmarca "destacado", y solo en viajes publicados. Cualquier cambio de estado lo quita.
7. **Marca pública.** Nombre, identificador (`slug`), logo (`https://`, opcional), sitio web (`https://`, opcional) y descripción (opcional). Se muestra:
   - en `/viajes/<slug>` como "Presentado por …", con enlace a `/patrocinadores/<slug>`;
   - en las tarjetas de destacados;
   - en `/patrocinadores/<slug>`, que solo existe si la marca tiene al menos un evento publicado.
8. **Validación.** zod con mensajes en español en toda entrada; CHECK equivalentes en la base. Los campos desconocidos (`sponsorId`, `status`, `featured`, `reviewStatus`, `createdBy`…) se ignoran.
9. **Escrituras atómicas.** Cada transición es un único `UPDATE … WHERE <estado de origen> AND <pertenencia> RETURNING` o un `db.batch` (una transacción, un round-trip). Nunca hay una lectura previa en otra petición.
10. **Errores y datos personales.** Ningún mensaje de la base llega a respuestas, UI ni logs. Los logs nuevos son textos fijos, sin correos, ids ni URLs.
11. **Build sin secretos.** Las páginas nuevas con datos llaman a `connection()` (directamente o vía guardas) y se renderizan por petición.

## Criterios de aceptación

### Fase 1 — Datos, permisos y guardas (sin UI)
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera **una** migración nueva con el siguiente número libre (hoy `0004`, salvo que `accounts-runner-profiles.md` haya generado antes la suya). Contiene:
  - `ALTER TYPE "public"."staff_role" ADD VALUE 'sponsor'` y `CREATE TYPE "public"."trip_review_status"` (`in_review`, `changes_requested`);
  - la tabla `sponsors` con `sponsors_slug_uq` y sus CHECK;
  - `sponsor_id` con FK `ON DELETE restrict` y CHECK en `staff_invitations` y `staff_assignments`;
  - en `trips`, las columnas `sponsor_id` (FK e índice `trips_sponsor_idx`), `featured`, `review_status` y `review_note`, con sus CHECK.

  No contiene `neon_auth`, `DROP`, `CREATE SCHEMA` ni cambios en otras columnas existentes, y `drizzle.config.ts` no cambia.
- [ ] (F1) Dados los CHECK que comparan el rol, entonces usan `role::text = 'sponsor'` (no el literal del enum), para que toda la migración pueda ejecutarse en una sola transacción (Decisión 3).
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon, `BEGIN; … ROLLBACK;`) Con la migración aplicada, la base rechaza:
  - una invitación o asignación `sponsor` sin `sponsor_id`, y una `commercial` con `sponsor_id`;
  - un `sponsors.slug` con mayúsculas o duplicado, `sponsors.logo_url` o `website_url` con `http://`, y un `name` de 1 carácter;
  - un viaje con `review_status` y `sponsor_id` nulo, `review_status` con `status = 'published'`, `changes_requested` sin `review_note`, `review_note` sin `changes_requested` y `featured = true` con `status = 'draft'`.

  Las filas existentes de `staff_*` y `trips` siguen siendo válidas.
- [ ] (F1) Dado `can()`, entonces (unit test):
  - `["sponsor"]` solo tiene `sponsor.portal`; no tiene `crm.access`, `staff.manage`, `trips.manage`, `leads.manage`, `bookings.manage` ni `sponsors.manage`;
  - `["commercial"]` no tiene `sponsors.manage` ni `sponsor.portal` y conserva sus cuatro permisos;
  - `["admin"]` tiene todos, incluidos los dos nuevos;
  - `[]` no tiene ninguno.
- [ ] (F1) Dada la matriz, entonces `LEAD_OWNER_ROLES` de `leads.service.ts` (derivado de `can`) sigue siendo `commercial` y `admin`: un `sponsor` nunca aparece como responsable de un lead (los tests existentes de leads pasan sin cambios).
- [ ] (F1) Dado `acceptInvitationAndLoadStaffRoles`, entonces la sentencia CTE sigue siendo una sola, su `RETURNING` incluye `sponsor_id` y el `INSERT INTO staff_assignments` lo copia de la invitación aceptada (unit test). La firma y el tipo de retorno no cambian.
- [ ] (F1) Dado `loadSponsorId(userId)`, entonces consulta `staff_assignments` con `user_id = $1 AND role = 'sponsor' AND revoked_at IS NULL LIMIT 1`, y devuelve el `sponsor_id`, o `null` si no hay filas (unit test).
- [ ] (F1) Dado `requireSponsor()`, entonces (unit test):
  - sin sesión → `UnauthorizedError`;
  - correo sin verificar → `ForbiddenError`;
  - `commercial` → `ForbiddenError` sin llamar a `loadSponsorId`;
  - `admin` o `sponsor` sin asignación de marca (`loadSponsorId` → `null`) → `ForbiddenError`;
  - `sponsor` con marca → `{ ...user, sponsorId }`;
  - si `loadSponsorId` lanza → `ForbiddenError` sin la causa original.

  `CurrentUser` y `getCurrentUser` no cambian: los tests existentes de guardas, `/api/crm/me` y acciones pasan sin tocarlos.
- [ ] (F1) Dado `assignmentRoleSchema`, entonces sus opciones coinciden con `staffRoleEnum.enumValues`. `staffRoleSchema` sigue siendo `["commercial", "admin"]` y es un subconjunto del enum. `STAFF_ROLE_LABELS.sponsor` es "Patrocinador" (unit test).
- [ ] (F1) Dado el README, entonces documenta la migración: prerrequisitos, aplicación manual en una transacción, alternativa si Neon responde `unsafe use of new value`, que el valor del enum no se puede eliminar, verificación con `SELECT enum_range(NULL::staff_role);` y que **se aplica antes de desplegar el código de F1** (las consultas `select()` de `trips` ya leen las columnas nuevas).
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 2 — CRM: marcas de patrocinadores
- [ ] (F2) Dado un admin verificado, entonces `CrmShell` muestra "Patrocinadores" (→ `/crm/admin/patrocinadores`) antes de "Usuarios". Un `commercial` no ve el enlace, y al abrir la ruta ve el `h1` "Patrocinadores" y "No tienes permiso para gestionar patrocinadores. Si lo necesitas, pídeselo a un administrador.". Sin sesión, se le redirige a `/crm/acceso`.
- [ ] (F2) Dado `/crm/admin/patrocinadores` sin marcas, entonces veo "Aún no hay patrocinadores. Crea el primero con «Nuevo patrocinador»."; con marcas, veo una tabla ordenada por nombre con: Patrocinador (nombre y slug), Sitio web (enlace o "—") y "Editar".
- [ ] (F2) Dado `/crm/admin/patrocinadores/nuevo` con datos válidos, cuando pulso "Crear patrocinador", entonces voy a `/crm/admin/patrocinadores/<id>` de la marca nueva.
- [ ] (F2) Dado el formulario con nombre de 1 carácter, slug con mayúsculas o espacios, logo `http://…` o descripción de 501 caracteres, cuando lo envío, entonces veo el error bajo el campo y se conserva lo escrito. Con un slug ya usado veo "Ese identificador ya está en uso.".
- [ ] (F2) Dado `/crm/admin/patrocinadores/<id>`, entonces el identificador es de solo lectura ("El identificador no se puede cambiar."). Cuando cambio nombre, logo, sitio o descripción y pulso "Guardar cambios", veo "Patrocinador actualizado." y la tabla refleja el cambio. `/crm/admin/patrocinadores/abc` y un UUID inexistente dan 404.
- [ ] (F2) Dadas `createSponsorAction`/`updateSponsorAction` llamadas directamente sin sesión o sin `sponsors.manage` (incluidos `commercial` y `sponsor`), entonces devuelven `unauthorized`/`forbidden` sin llamar al service. Un `slug` enviado a la edición o campos extra como `createdBy` se ignoran (unit test).
- [ ] (F2) `getPublicSponsorBySlug` (para F7): llama a `connection()`; un slug no canónico devuelve `null` sin consultar; solo selecciona `slug`, `name`, `logo_url`, `website_url` y `description` (unit test).
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 3 — CRM: personas de cada marca y audiencia de acceso
- [ ] (F3) Dado un admin en `/crm/admin/patrocinadores/<id>`, entonces debajo del formulario ve la sección "Personas con acceso" con:
  - "Invitar a una persona de la marca" (solo correo, sin selector de rol);
  - la tabla de personas activas de esa marca, con "Revocar Patrocinador" y sin botones "Asignar …";
  - "Invitaciones pendientes" de esa marca.

  La sección solo se muestra con `staff.manage`.
- [ ] (F3) Dada una invitación válida, cuando pulso "Invitar", entonces veo "Invitación creada para <correo>. Comparte el enlace de acceso." y el enlace `<APP_ORIGIN>/patrocinador/acceso` con "Copiar enlace". La invitación aparece como "Patrocinador" en la marca y **no** en `/crm/admin/usuarios`.
- [ ] (F3) Dado `/crm/admin/usuarios`, entonces "Equipo activo" e "Invitaciones pendientes" excluyen el rol `sponsor` (unit test de `listStaffOverview()`). `listStaffOverview({ sponsorId })` devuelve solo personas e invitaciones `sponsor` de esa marca (unit test).
- [ ] (F3) Dada `createInvitation`, entonces inserta `sponsor_id` (`null` para invitaciones de staff), y mantiene el batch de dos sentencias y el resultado `pending_invitation_exists` (unit test).
- [ ] (F3) Dada `inviteSponsorMemberAction`, entonces (unit test):
  - exige `staff.manage`;
  - valida `email` y `sponsorId` (UUID);
  - llama a `createInvitation({ email, role: "sponsor", sponsorId })`;
  - un `role` enviado en el formulario se ignora;
  - el éxito revalida `/crm/admin` (layout).

  Dadas `grantStaffRoleAction` con `role=sponsor`, entonces devuelve `invalid_input`; dada `revokeStaffRoleAction` con `role=sponsor`, entonces revoca la asignación (unit test).
- [ ] (F3) Dado `AccessPanel audience="sponsor"`, entonces el alta muestra "¿Te invitaron? Crea tu cuenta" y "Solo para marcas invitadas por Carreras Viajeras. Usa el correo de la invitación.", y tras ingresar o verificar navega a `/patrocinador` (unit test). Las audiencias `staff` y `runner` no cambian.
- [ ] (F3) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 4 — Portal: acceso y "Mis eventos"
- [ ] (F4) Dado un visitante sin sesión, cuando abre `/patrocinador` (y, desde F5, `/patrocinador/eventos/<id>`), entonces se le redirige a `/patrocinador/acceso`, que muestra `AccessPanel audience="sponsor"`. Con sesión, `/patrocinador/acceso` redirige a `/patrocinador`.
- [ ] (F4) Dada una cuenta verificada sin rol `sponsor` (runner, `commercial` o admin sin marca), cuando abre `/patrocinador`, entonces ve "Tu cuenta no tiene acceso al panel de patrocinadores. Si te invitaron, entra con el correo de la invitación." y "Cerrar sesión" (→ `/patrocinador/acceso`), sin bucles de redirección.
- [ ] (F4) Dada una persona invitada, cuando crea su cuenta en `/patrocinador/acceso` con el correo invitado y verifica el código, entonces llega a `/patrocinador` y ve la cabecera con el nombre de su marca, su correo, "Mis eventos" y "Cerrar sesión" (manual + test de `getSponsorAccess`).
- [ ] (F4) Dado un `sponsor` en `/patrocinador`, entonces ve el `h1` "Mis eventos" y una tabla **solo con los eventos de su marca**, con: Evento (título y slug), Carrera (`formatTripDate`) y Estado (`Badge`: "Borrador", "En revisión", "Cambios solicitados", "Publicado" o "Archivado"). Sin eventos, ve "Aún no tienes eventos.". Los viajes del equipo y de otras marcas nunca aparecen (unit test: `sponsor_id = $1` en el `WHERE`).
- [ ] (F4) Dado `getSponsorAccess()`, entonces llama a `connection()` antes de la guarda y devuelve `unauthenticated`, `forbidden` u `ok` con `user` y `sponsor` (`id`, `slug`, `name`) (unit test). Un sponsor revocado pasa a `forbidden` en su siguiente petición.
- [ ] (F4) Dado `/patrocinador` y `/patrocinador/acceso`, entonces tienen `robots: { index: false }`.
- [ ] (F4) Dado un `sponsor`, cuando abre `/crm`, `/crm/viajes` o `/crm/reservas`, entonces ve `NoCrmAccess` (sin cambios en el layout del CRM).
- [ ] (F4) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores, y `/patrocinador` y `/patrocinador/acceso` aparecen como dinámicas (`ƒ`). Dado `npm run build:worker` + `npx wrangler deploy --dry-run --outdir <scratch>` (Linux/WSL, sin desplegar), entonces el gzip del Worker se registra en el resumen de la fase frente a la última medición y es menor de 2 MiB; si lo supera, se detiene y se consulta al usuario.
- [ ] (F4) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 5 — Portal: crear, editar y enviar a revisión
- [ ] (F5) Dado `/patrocinador`, entonces veo el enlace "Nuevo evento" (→ `/patrocinador/eventos/nuevo`). Con datos válidos, cuando pulso "Crear borrador", entonces vuelvo a `/patrocinador` y el evento aparece como "Borrador". En `/crm/viajes` aparece como "Borrador" sin botón "Publicar" (tras F6).
- [ ] (F5) Dado `TripForm audience="sponsor"`, entonces tiene los mismos campos, validaciones y conservación de lo escrito que el del equipo, botones "Crear borrador"/"Guardar borrador" y enlace "Volver a mis eventos" (→ `/patrocinador`) (unit test). Con `audience` omitido se comporta exactamente como hoy (tests existentes).
- [ ] (F5) Dado un evento en "Borrador" o "Cambios solicitados", cuando pulso "Editar", cambio título y slug y guardo, entonces vuelvo a `/patrocinador` con los cambios. En "Cambios solicitados" la página de edición muestra arriba un `Alert` "El equipo pidió cambios" con el motivo.
- [ ] (F5) Dado un evento en "Borrador" o "Cambios solicitados", cuando pulso "Enviar a revisión" y confirmo, entonces queda "En revisión" y el motivo anterior se borra. Si otra persona de la marca ya lo envió, veo "El evento ya no está en ese estado. Recarga la página.".
- [ ] (F5) Dado un evento "En revisión", "Publicado" o "Archivado", cuando abro `/patrocinador/eventos/<id>`, entonces veo un aviso sin formulario:
  - En revisión: "El equipo lo está revisando. Podrás editarlo si te pide cambios.";
  - Publicado: "Ya está publicado. Para cambiarlo, escribe al equipo de Carreras Viajeras." con "Ver en la web" (→ `/viajes/<slug>`);
  - Archivado: "Este evento está archivado.".

  `updateSponsorTripAction` sobre esos estados devuelve `locked` ("Este evento está en revisión o publicado y no se puede editar.").
- [ ] (F5) Dado `/patrocinador/eventos/<id>` con el id de un viaje del equipo, de otra marca, inexistente o no UUID, entonces responde 404. Las acciones con ese id devuelven `not_found`/`invalid_transition` sin modificar nada (unit test: `sponsor_id = $sponsorId` en cada `WHERE`).
- [ ] (F5) Dadas las acciones del portal con `sponsorId`, `status`, `featured` o `reviewStatus` en el `FormData`, entonces se ignoran: el `sponsor_id` sale de `requireSponsor()` y el alta nace `draft` sin revisión (unit test).
- [ ] (F5) Dadas las acciones del portal sin sesión, o con una cuenta sin `sponsor.portal` o sin marca, entonces devuelven `unauthorized`/`forbidden` ("No tienes acceso al panel de patrocinadores.") sin llamar al service. Dadas las acciones del equipo (`createTripAction`, `updateTripAction`, `changeTripStatusAction`) con una sesión `["sponsor"]`, entonces devuelven `forbidden` (unit test).
- [ ] (F5) Dado `setTripStatus`, entonces (unit test):
  - publicar exige `sponsor_id IS NULL OR review_status = 'in_review'`, así que un borrador de patrocinador no enviado devuelve `invalid_transition`;
  - todo cambio pone `featured = false`;
  - publicar y archivar ponen `review_status` y `review_note` a `NULL`;
  - despublicar un evento de patrocinador lo deja `in_review`, y uno del equipo, sin revisión.
- [ ] (F5) Dado un evento "En revisión", cuando un `commercial` pulsa "Publicar" en `/crm/viajes` y confirma, entonces queda "Publicado" en el CRM y en el portal.
- [ ] (F5) Dado el README, entonces documenta el alta de una marca de principio a fin (crear marca → invitar → la persona entra por `/patrocinador/acceso` → crea y envía → el equipo publica).
- [ ] (F5) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 6 — CRM: revisión y destacados
- [ ] (F6) Dado `/crm/viajes`, entonces:
  - los eventos "En revisión" aparecen primero y los archivados al final;
  - la celda del viaje muestra "Patrocinador: <marca>" en los eventos de una marca;
  - el estado usa las mismas etiquetas que el portal, más un `Badge` "Destacado" si `featured`.
- [ ] (F6) Dado un borrador de patrocinador no enviado ("Borrador" o "Cambios solicitados"), entonces no hay botón "Publicar", pero sí "Editar" y "Archivar". Dado uno "En revisión", entonces hay "Publicar", "Revisar" (→ `/crm/viajes/<id>`) y "Archivar". Despublicar un evento de patrocinador avisa "Dejará de aparecer en la web y volverá a «En revisión».".
- [ ] (F6) Dado `/crm/viajes/<id>` de un evento "En revisión", entonces sobre el formulario veo "Revisión del patrocinador" con un `Textarea` "Motivo" y "Devolver al patrocinador". Con un motivo de 3–500 caracteres, vuelvo a `/crm/viajes` y el evento queda "Cambios solicitados". El patrocinador ve el motivo en su edición. Con un motivo vacío o de 501 caracteres veo el error bajo el campo y se conserva lo escrito. Si el evento ya no está en revisión, veo "El viaje ya no está en ese estado. Recarga la página.".
- [ ] (F6) Dado `/crm/viajes/<id>` de un evento "Cambios solicitados", entonces veo un `Alert` "Devuelto al patrocinador" con el motivo.
- [ ] (F6) Dado un viaje publicado (de una marca o del equipo), cuando pulso "Destacar" y confirmo, entonces muestra "Destacado". "Quitar de destacados" lo revierte. Al despublicarlo o archivarlo deja de estar destacado. En un viaje no publicado no hay botón y la acción devuelve `invalid_transition` (unit test).
- [ ] (F6) Dadas `requestTripChangesAction` y `setTripFeaturedAction` sin sesión o sin `trips.manage` (incluido `sponsor`), entonces devuelven `unauthorized`/`forbidden` sin llamar al service (unit test).
- [ ] (F6) Dado `listPublishedTrips()` y `getPublishedTripBySlug()`, entonces cada `PublicTrip` incluye `sponsor: { slug, name, logoUrl, websiteUrl }` o `null` (`LEFT JOIN sponsors`), y nunca `id`, `sponsor_id`, `featured`, `review_*` ni datos de las personas. `listPublishedTrips({ featuredOnly: true })` filtra `featured`; `listPublishedTrips({ sponsorSlug })` filtra por la marca; ambas siguen filtrando `status = 'published'` (unit test).
- [ ] (F6) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Fase 7 — Promoción pública
- [ ] (F7) Dado un evento de patrocinador publicado sin contenido fijo en `TRIPS`, cuando abro `/viajes/<slug>`, entonces veo `CatalogTripDetail` con:
  - imagen, título, "Ciudad, País", fecha de la carrera y fechas del viaje si existen;
  - distancias, resumen, "Qué incluye" si no está vacío, "Precio desde" (`formatTripPrice`) y cupos si existen;
  - "Presentado por" con logo (si hay) y nombre, enlazado a `/patrocinadores/<slug>`;
  - el botón "Quiero información", que abre WhatsApp del equipo con el título y la fecha en el mensaje.

  `generateMetadata` usa el título y el resumen.
- [ ] (F7) Dado `/viajes/maraton-santiago-2027` (contenido fijo, viaje del equipo), entonces se ve igual que hoy y sin "Presentado por". Si en el catálogo tuviera marca, `TripDetail` muestra "Presentado por" bajo el título.
- [ ] (F7) Dado `/viajes/<slug>` con un slug inexistente, en borrador, en revisión o archivado, entonces responde 404 (`getCatalogTrip` → `null`, unit test).
- [ ] (F7) Dado al menos un viaje destacado, cuando abro `/`, entonces veo la sección "Eventos destacados" antes de "Más ciudades", con hasta 6 tarjetas (`TripCard`: imagen, título, destino, fecha, precio y "Presentado por <marca>" si tiene), cada una enlazada a `/viajes/<slug>`. Sin destacados, la sección no aparece.
- [ ] (F7) Dado un error de la base al leer los destacados, entonces `/` se muestra completa sin la sección y se registra solo "landing: featured trips unavailable" (unit test de `FeaturedTripsSection` con el service simulado). El resto de la portada no cambia.
- [ ] (F7) Dado `/patrocinadores/<slug>` de una marca con eventos publicados, entonces veo:
  - logo, nombre (`h1`) y descripción;
  - "Visitar sitio web" (externo, `target="_blank"`, `rel="sponsored noopener noreferrer"`) si hay sitio;
  - la cuadrícula de sus eventos publicados con `TripCard`.

  Dada una marca sin eventos publicados, inexistente o con slug no canónico, entonces responde 404 (unit test de `getSponsorShowcase`).
- [ ] (F7) Dado `npm run build` sin `DATABASE_URL`, entonces termina sin errores, `/` y `/patrocinadores/[slug]` aparecen como dinámicas (`ƒ`) y `/contacto` y `/cuenta` siguen estáticas (`○`). Medición del Worker como en F4.
- [ ] (F7) `npm run lint`, `npx vitest run` y `npm run build` sin errores.

### Manual en producción (el usuario, con su autorización; los agentes no acceden a Neon)
- [ ] Migración aplicada; `SELECT enum_range(NULL::staff_role);` devuelve `{commercial,admin,sponsor}`.
- [ ] Admin crea la marca → invita a un correo → la persona se registra en `/patrocinador/acceso`, verifica y llega a `/patrocinador` → crea un evento → lo envía.
- [ ] Un `commercial` lo devuelve con motivo → el patrocinador corrige y reenvía → el `commercial` lo publica → aparece en `/viajes/<slug>` con "Presentado por" → lo destaca → aparece en `/` → `/patrocinadores/<slug>` lo lista.
- [ ] La persona patrocinadora abre `/crm` y ve `NoCrmAccess`; `GET /api/crm/me` responde 403.
- [ ] Admin revoca a la persona → en su siguiente petición `/patrocinador` muestra el aviso sin acceso.

## Diseño técnico

### Decisiones
1. **`sponsor` va en el enum `staff_role`, no en tablas propias.** Motivos:
   - el usuario pidió el alta "igual que el staff", y `accounts-roles-permissions.md` ya prevé así los roles nuevos;
   - se reutilizan sin duplicar `staff_invitations` (índice de pendiente único, caducidad, revocación), la aceptación atómica en `getCurrentUser`, `profiles`, `staff_assignments` (auditoría `granted_by`/`revoked_by`), `revokeStaffRole`, `InviteStaffForm`, `InvitationsTable` y `StaffTable`;
   - tablas propias (`sponsor_invitations`, `sponsor_members`) obligarían a una segunda aceptación en cada petición y a duplicar service, acciones y UI.

   Riesgos y cómo se evitan:
   - **Herencia del CRM.** Hoy `crm.access` abre todo el CRM, pero en la matriz solo lo tiene `commercial` (y admin implícito), así que `can(["sponsor"], "crm.access")` es `false` y el layout del CRM muestra `NoCrmAccess` sin cambios. El portal vive en su propia ruta con su propia guarda.
   - **Responsable de leads.** `LEAD_OWNER_ROLES` se deriva de `can(…, "leads.manage")`, así que excluye a `sponsor`.
   - **"Asignar" sin marca.** Asignar `sponsor` desde `StaffTable` no tiene sentido sin marca: `grantStaffRole` solo acepta `staffRoleSchema` (`commercial | admin`) y el CHECK de la base lo rechaza igualmente.
   - **Mezcla en la lista del equipo.** `/crm/admin/usuarios` filtra `role <> 'sponsor'`.
   - **Comentario de `profiles`.** `profiles` pasa a describirse como "cuentas con rol asignado (staff o patrocinador)"; los patrocinadores también tienen fila allí, necesaria para las FK de `staff_*`.
2. **Marca en `sponsor_id` de la invitación y de la asignación**, con CHECK `(role::text = 'sponsor') = (sponsor_id IS NOT NULL)` en ambas tablas. La aceptación copia el `sponsor_id` en la misma sentencia CTE. Sin tablas puente.
3. **Migración en una transacción.** PostgreSQL ≥ 12 permite `ALTER TYPE … ADD VALUE` dentro de una transacción, pero el valor nuevo no se puede *usar* hasta el `COMMIT` (error `unsafe use of new value`). Por eso:
   - los CHECK comparan `role::text = 'sponsor'` (texto, sin convertir el literal al enum) y la migración no inserta filas `sponsor`;
   - `trip_review_status` es un tipo nuevo creado en la misma transacción, así que sus literales sí se pueden usar.

   Si Neon aun así respondiera `unsafe use of new value`: `ROLLBACK`, ejecutar sola la línea `ALTER TYPE "public"."staff_role" ADD VALUE 'sponsor';` y después el resto del archivo entre `BEGIN;`/`COMMIT;`. Un valor de enum no se puede eliminar (no existe `DROP VALUE`); si la migración se abandona, el valor queda sin uso y es inofensivo.
4. **Guarda propia sin tocar `CurrentUser`.** `requireSponsor()` = `requirePermission("sponsor.portal")` + `loadSponsorId(user.id)` (una consulta extra, solo en el portal). Así `getCurrentUser`, `CurrentUser` y los seis tests que simulan `access.service` no cambian. Un admin pasa `can()` (tiene todos los permisos) pero sin asignación de marca recibe `ForbiddenError`: el portal exige siempre una marca.
5. **Una marca por cuenta.** El índice existente `staff_assignments_active_uq (user_id, role)` admite una sola asignación `sponsor` activa por cuenta. Si se invita a una cuenta que ya es patrocinadora de otra marca, la invitación se consume y la cuenta conserva su marca actual (`ON CONFLICT DO NOTHING`). Para cambiarla, el admin revoca primero. Una marca puede tener varias personas.
6. **Revisión en columnas aparte, sin tocar `trip_status`.** `review_status` (`in_review | changes_requested`, nulo fuera de revisión) y `review_note` solo existen en borradores de patrocinador (CHECK). Ventajas:
   - las lecturas públicas (`status = 'published'`), `STATUS_SOURCES`, `tripStatusSchema` y los consumidores de `trip_status` (reservas, leads) no cambian;
   - no hace falta otro `ALTER TYPE` sobre un enum existente.
7. **Aprobar = "Publicar".** No hay acción de aprobación aparte: el botón "Publicar" de `TripTable` (`changeTripStatusAction`, `trips.manage`) es la aprobación, y `setTripStatus` exige `review_status = 'in_review'` para eventos de marca. No hace falta un permiso nuevo para revisar: quien gestiona el catálogo (`commercial`, `admin`) revisa.
8. **El patrocinador solo edita "Borrador" y "Cambios solicitados".** Si un evento publicado necesita cambios, el equipo lo edita directamente, o lo despublica (vuelve a "En revisión") y lo devuelve con motivo. **Despublicar un evento de marca lo deja "En revisión"**, no en "Borrador", para que el equipo pueda volver a publicarlo sin esperar un reenvío. El equipo puede editar eventos de marca en cualquier estado no archivado (`updateTrip` sin cambios).
9. **`sponsors.manage` aparte de `staff.manage`.** El contenido de la marca (CRUD) y el acceso de personas son responsabilidades distintas. Las páginas de marcas exigen `sponsors.manage`. Invitar y revocar personas sigue siendo `staff.manage`, porque son filas `staff_*` y es quien concede acceso. Hoy ambos son solo de admin (`[]` en la matriz).
10. **Gestión en una sección nueva, `/crm/admin/patrocinadores`, y no dentro de `/crm/admin/usuarios`.** La marca es una entidad con su propio formulario (5 campos) y sus propias personas. La página de usuarios sigue siendo del equipo y no crece con otra tabla y otro formulario. Queda bajo `/crm/admin/` para heredar la semántica de administración y la revalidación conjunta.
11. **Identificador de la marca inmutable.** Se fija al crearla y forma parte de la URL pública `/patrocinadores/<slug>`. Así no hay enlaces rotos ni regla de bloqueo.
12. **`/patrocinadores/<slug>` solo existe con al menos un evento publicado.** La visibilidad pública de una marca la decide el equipo al publicar, no el alta en el CRM.
13. **UI pública en `landing`.** `landing` es dueña de las páginas públicas: `SponsorCredit`, `CatalogTripDetail`, `TripCard`, `FeaturedTripsSection` y `SponsorShowcase` viven en `modules/landing/components/`. `TripCard` lo usan dos componentes del mismo módulo, así que no va a `components/shared/`. `sponsors` aporta los datos (`getPublicSponsorBySlug`) y `trips` el catálogo (`PublicTrip.sponsor`).
14. **Dependencias entre módulos, siempre por `index.ts` y sin ciclos:** `landing → trips, sponsors`; `sponsors → accounts` (`SignOutButton`); `trips` no importa ningún módulo (la guarda está en `lib/auth`, la tabla `sponsors` en `lib/db-schema.ts`). Las páginas de `app/` componen varios módulos.
15. **Plantilla genérica en `/viajes/<slug>`.** Hoy un slug sin contenido fijo en `TRIPS` da 404 sin consultar Neon. Los eventos de marca no tienen contenido fijo, así que `getCatalogTrip` pasa a consultar siempre el catálogo (el formato del slug se valida antes en `getPublishedTripBySlug`):
    - con contenido fijo → vista `designed` (`TripDetail`, igual que hoy);
    - sin contenido fijo → vista `catalog` (`CatalogTripDetail`).
16. **Consultas de eventos de marca al WhatsApp del equipo** (`buildWhatsAppUrl(WHATSAPP_NUMBER, …)`), con el título y la fecha en el texto. Los leads son del equipo y el patrocinador nunca los ve. Su sitio web aparece en `/patrocinadores/<slug>` (ver Pregunta abierta 2).
17. **Portada dinámica por los destacados.** `FeaturedTripsSection` lee Neon, así que `/` pasa de `○` a `ƒ`. Para limitar el impacto:
    - va envuelta en `<Suspense fallback={null}>` en `app/page.tsx`, de modo que el resto de la portada se envía en streaming sin esperar a Neon;
    - si la consulta falla, la sección no se muestra y se registra un texto fijo, así que `/` nunca cae por la base;
    - es una sola consulta pequeña, limitada a 6 en el componente.

    Ver Pregunta abierta 1 (coste en Neon Free).
18. **Imágenes externas.** Logo e imagen del evento son URL `https://` (zod + CHECK) que el equipo revisa antes de publicar. Se pintan con `next/image` (`images.unoptimized: true` ya global): `width`/`height` fijos para el logo y `fill` para la portada. El host externo ve la IP del visitante, igual que hoy con `trips.image_url`. Los enlaces externos llevan `rel="sponsored noopener noreferrer"`.
19. **Acciones del portal en `trips.actions.ts`.** `runTripAction` se generaliza con un parámetro `authorize`: para el equipo, `requirePermission("trips.manage")`; para el portal, `requireSponsor()`, que devuelve el `sponsorId`. Así se reutilizan `failure`, `formValues` y `fieldErrors` sin un segundo archivo de helpers ni duplicación. El mensaje de `forbidden` y las rutas a revalidar dependen de la audiencia.
20. **`TripForm` con `audience: "team" | "sponsor"`** (por defecto `"team"`), igual que `AccessPanel`. Una configuración interna elige las acciones, los textos de los botones y el enlace de vuelta. Los campos, las validaciones y la conservación de lo escrito son los mismos.

### Flujo de revisión
| Estado visible | `trips.status` | `review_status` | Patrocinador | Equipo (`trips.manage`) |
|---|---|---|---|---|
| Borrador | `draft` | `NULL` | editar, enviar a revisión | editar, archivar (no publicar) |
| Cambios solicitados | `draft` | `changes_requested` (+ `review_note`) | ver motivo, editar, reenviar | editar, archivar (no publicar) |
| En revisión | `draft` | `in_review` | solo ver | publicar, devolver con motivo, editar, archivar |
| Publicado | `published` | `NULL` | solo ver ("Ver en la web") | despublicar (→ En revisión), destacar/quitar, editar, archivar |
| Archivado | `archived` | `NULL` | solo ver | — (final) |

Los viajes del equipo (`sponsor_id IS NULL`) siguen el flujo actual (Borrador ↔ Publicado → Archivado) y nunca tienen `review_status`.

| Transición | Quién | `UPDATE … WHERE` | `SET` |
|---|---|---|---|
| Crear | sponsor | `INSERT … ON CONFLICT (slug) DO NOTHING` | `sponsor_id` de la sesión; `status` por defecto `draft` |
| Editar | sponsor | `id`, `sponsor_id = $s`, `status = 'draft'`, `review_status IS DISTINCT FROM 'in_review'`, slug libre | campos editables, `updated_at` (mantiene revisión y motivo) |
| Enviar a revisión | sponsor | `id`, `sponsor_id = $s`, `status = 'draft'`, `review_status IS DISTINCT FROM 'in_review'` | `review_status = 'in_review'`, `review_note = NULL` |
| Publicar | equipo | `id`, `status = 'draft'`, `(sponsor_id IS NULL OR review_status = 'in_review')` | `status = 'published'`, `review_* = NULL`, `featured = false` |
| Devolver | equipo | `id`, `status = 'draft'`, `review_status = 'in_review'` | `review_status = 'changes_requested'`, `review_note = $motivo` |
| Despublicar | equipo | `id`, `status = 'published'` | `status = 'draft'`, `review_status = CASE WHEN sponsor_id IS NULL THEN NULL ELSE 'in_review' END`, `featured = false` |
| Archivar | equipo | `id`, `status IN ('draft','published')` | `status = 'archived'`, `review_* = NULL`, `featured = false` |
| Destacar / quitar | equipo | `id`, `status = 'published'`, `featured = NOT $f` | `featured = $f` |

Todas fijan `updated_at = now()` y devuelven `RETURNING id`; sin fila → `invalid_transition` (o `not_found`/`locked`, según "Contratos").

### Modelo de datos: `lib/db-schema.ts` (F1)
Todo en `public`, sin FK a `neon_auth`:

| Objeto | Definición |
|---|---|
| enum `staff_role` | añade `sponsor` (al final): `commercial`, `admin`, `sponsor` |
| enum `trip_review_status` (nuevo) | `in_review`, `changes_requested` |
| `sponsors.id` | `uuid` PK `defaultRandom()` |
| `sponsors.slug` | `text not null`; índice único `sponsors_slug_uq`; CHECK `sponsors_slug_format_chk`: mismo formato que `trips` (`^[a-z0-9]+(-[a-z0-9]+)*$`, 3–80) |
| `sponsors.name` | `text not null`; CHECK `sponsors_name_chk`: `char_length BETWEEN 2 AND 80` |
| `sponsors.logo_url`, `website_url` | `text` nulos; CHECK `sponsors_logo_url_chk` / `sponsors_website_url_chk`: `IS NULL OR (LIKE 'https://%' AND char_length <= 2048)` |
| `sponsors.description` | `text` nulo; CHECK `sponsors_description_chk`: `IS NULL OR char_length BETWEEN 10 AND 500` |
| `sponsors.created_by` | `text not null` → `profiles.user_id` `ON DELETE restrict` |
| `sponsors.created_at`, `updated_at` | `timestamptz not null default now()`; `updated_at` lo fija el service |
| `staff_invitations.sponsor_id` | `uuid` nulo → `sponsors.id` `restrict`; CHECK `staff_invitations_sponsor_chk`: `(role::text = 'sponsor') = (sponsor_id IS NOT NULL)` |
| `staff_assignments.sponsor_id` | `uuid` nulo → `sponsors.id` `restrict`; CHECK `staff_assignments_sponsor_chk`: igual |
| `trips.sponsor_id` | `uuid` nulo → `sponsors.id` `restrict`; índice `trips_sponsor_idx`; lo fija solo `createSponsorTrip` (nunca se actualiza) |
| `trips.featured` | `boolean not null default false`; CHECK `trips_featured_chk`: `NOT featured OR status = 'published'` |
| `trips.review_status` | `trip_review_status` nulo; CHECK `trips_review_chk`: `review_status IS NULL OR (sponsor_id IS NOT NULL AND status = 'draft')` |
| `trips.review_note` | `text` nulo; CHECK `trips_review_note_chk`: `(review_status IS NOT DISTINCT FROM 'changes_requested') = (review_note IS NOT NULL) AND (review_note IS NULL OR char_length(review_note) BETWEEN 3 AND 500)` (`IS NOT DISTINCT FROM` para que un `review_status` nulo no deje pasar el CHECK) |

`sponsors` se declara antes de `staff_invitations` (FK). Comentarios en el schema: "Brands. Never deleted; slug fixed at creation." y, en `trips`, "sponsor_id NULL = team trip; review_* only on sponsor drafts".

**Migración** (F1-T1): `npm run db:generate` → `drizzle/<NNNN>_<nombre>.sql`, `drizzle/meta/<NNNN>_snapshot.json` y `_journal.json`. No asumas el número: si `accounts-runner-profiles.md` (u otra rama) integra antes la suya en `main`, se regenera sobre ella. Una migración ya aplicada nunca se edita. El usuario la aplica a mano en el SQL Editor de Neon, entre `BEGIN;` y `COMMIT;` (o con `psql "$DATABASE_MIGRATION_URL" -1 -v ON_ERROR_STOP=1 -f …`), después de `0000`–`0003` y **antes de desplegar el código de F1**. Comprobación previa: `SELECT to_regclass('public.trips'), to_regclass('public.staff_invitations');`. Sin GRANT: `DATABASE_URL` usa el rol owner.

### Permisos: `lib/auth/permissions.ts` (F1)
```ts
export type Permission =
  | "crm.access" | "staff.manage" | "trips.manage" | "leads.manage" | "bookings.manage"
  | "sponsors.manage" | "sponsor.portal";
const PERMISSION_MATRIX = {
  "crm.access": ["commercial"],
  "staff.manage": [],
  "trips.manage": ["commercial"],
  "leads.manage": ["commercial"],
  "bookings.manage": ["commercial"],
  "sponsors.manage": [],          // marcas: solo admin (implícito)
  "sponsor.portal": ["sponsor"],  // admin pasa can(), pero requireSponsor exige además una marca
};
```
`can()` no cambia.

### Guardas: `lib/auth/` (F1)
```ts
// access.service.ts
// acceptInvitationStatement: RETURNING id, email, role, invited_by, sponsor_id;
//   INSERT INTO staff_assignments (user_id, role, reason, granted_by, sponsor_id) SELECT …, accepted.sponsor_id
export async function loadSponsorId(userId: string): Promise<string | null>;

// guards.ts
export type SponsorUser = CurrentUser & { sponsorId: string };
export async function requireSponsor(): Promise<SponsorUser>;
// requirePermission("sponsor.portal") → loadSponsorId (try/catch → ForbiddenError, como loadRoles) → null → ForbiddenError
```

### Rutas (`app/`)
| Ruta | Fase | Contenido |
|---|---|---|
| `app/crm/(protected)/admin/patrocinadores/page.tsx` | F2 | `getCrmAccess("sponsors.manage")` (patrón de `/crm/admin/usuarios`). `h1` "Patrocinadores", enlace "Nuevo patrocinador" (`buttonVariants`) y `<SponsorTable sponsors={await listSponsors()} />`. `metadata.title = "Patrocinadores"` |
| `app/crm/(protected)/admin/patrocinadores/nuevo/page.tsx` | F2 | Misma guarda. `h1` "Nuevo patrocinador" + `<SponsorForm />` |
| `app/crm/(protected)/admin/patrocinadores/[id]/page.tsx` | F2 (mod. F3) | Misma guarda. `getSponsorById(id)` (`null` → `notFound()`); `h1` con el nombre + `<SponsorForm sponsor />`. F3: si `can(user.staffRoles, "staff.manage")`, `listStaffOverview({ sponsorId })` → sección "Personas con acceso" con `<InviteStaffForm sponsorId />`, `<StaffTable staff assignableRoles={[]} />` y `<InvitationsTable />` |
| `app/patrocinador/acceso/page.tsx` | F4 | `getSponsorAccess()`; si no es `unauthenticated` → `redirect("/patrocinador")`; si no, `<main>` centrado con `<AccessPanel audience="sponsor" />`. `metadata = { title: "Acceso de patrocinadores", robots: { index: false } }` |
| `app/patrocinador/(protected)/layout.tsx` | F4 | `metadata.robots = { index: false }`. `getSponsorAccess()`: `unauthenticated` → `redirect("/patrocinador/acceso")`; `forbidden` → `<main>` con `Card` y el texto sin acceso + `<SignOutButton redirectTo="/patrocinador/acceso" />` (texto estático, como las ramas `forbidden` del CRM); `ok` → `<SponsorShell email sponsorName>{children}</SponsorShell>` |
| `app/patrocinador/(protected)/page.tsx` | F4 (mod. F5) | Vuelve a llamar a `getSponsorAccess()` (el layout no se re-renderiza al navegar; si no es `ok`, `return null`). `h1` "Mis eventos" + `<SponsorTripTable trips={await listSponsorTrips(sponsor.id)} />`. F5 añade el enlace "Nuevo evento". `metadata.title = "Mis eventos"` |
| `app/patrocinador/(protected)/eventos/nuevo/page.tsx` | F5 | Misma comprobación. `h1` "Nuevo evento" + `<TripForm audience="sponsor" />` |
| `app/patrocinador/(protected)/eventos/[id]/page.tsx` | F5 | Misma comprobación. `getSponsorTrip(id, sponsor.id)` (`null` → `notFound()`). Según estado: Borrador → `h1` "Editar evento" + `TripForm`; Cambios solicitados → `Alert` con el motivo + `TripForm`; En revisión / Publicado / Archivado → `h1` + aviso del criterio F5. `metadata.title = "Evento"` |
| `app/crm/(protected)/viajes/[id]/page.tsx` | F6 (mod.) | Si `trip.reviewStatus === "in_review"`: sección "Revisión del patrocinador" con texto "Publícalo desde la lista o devuélvelo con un motivo." + `<TripReviewForm tripId />`; si `changes_requested`: `Alert` "Devuelto al patrocinador" con el motivo. Después, el `TripForm` de siempre |
| `app/viajes/[slug]/page.tsx` | F7 (mod.) | `getCatalogTrip(slug)` (`null` → `notFound()`); metadata con `view.title`/`view.description`; `view.kind === "designed" ? <TripDetail trip={view.trip} /> : <CatalogTripDetail trip={view.trip} />` |
| `app/page.tsx` | F7 (mod.) | Inserta `<Suspense fallback={null}><FeaturedTripsSection /></Suspense>` antes de `<DestinationsSection />` |
| `app/patrocinadores/[slug]/page.tsx` | F7 | `getSponsorShowcase(slug)` (`null` → `notFound()`); `generateMetadata` con el nombre y la descripción. `<SiteHeader /><main><SponsorShowcase sponsor trips /></main><SiteFooter />`. Indexable. Sin `generateStaticParams` |

### Módulo `modules/sponsors/` (nuevo)
| Archivo | Fase | Contenido |
|---|---|---|
| `schemas/sponsors.schema.ts` | F2 | `sponsorSlugSchema` (trim, minúsculas, 3–80, regex; "Usa minúsculas, números y guiones (p. ej. marca-deportiva)."). `sponsorFormSchema`: `name` trim 2–80 ("El nombre debe tener entre 2 y 80 caracteres."), `slug`, `logoUrl`/`websiteUrl` (`""` → `null`; si no, URL `https:` ≤ 2048: "Indica una URL que empiece por https://."), `description` (`""` → `null`; si no, trim 10–500: "La descripción debe tener entre 10 y 500 caracteres."). `updateSponsorSchema = sponsorFormSchema.omit({ slug: true }).extend({ id: z.uuid() })`. Mismo formato que la base; la duplicación del regex de slug con `trips` es intencionada (mensajes distintos, CHECK propios) |
| `types/sponsors.types.ts` | F2 | `Sponsor = InferSelectModel<typeof sponsors>`, `SponsorInput`, `SponsorUpdateInput`, `PublicSponsor`, `SponsorBrand = Pick<Sponsor, "id" \| "slug" \| "name">`, `SponsorActionState` (códigos `unauthorized \| forbidden \| invalid_input \| slug_taken \| not_found`, con `fieldErrors` y `values` como `TripActionState`) |
| `services/sponsors.service.ts` | F2 | `server-only`; ver "Contratos" |
| `actions/sponsors.actions.ts` | F2 | `"use server"`; patrón de `trips.actions.ts`: guarda `sponsors.manage` → zod → service → `revalidatePath("/crm/admin/patrocinadores")` (la lista); error genérico sin causa |
| `components/SponsorForm.tsx` | F2 | `"use client"`, props `{ sponsor?: Sponsor }`; ver Componentes |
| `components/SponsorTable.tsx` | F2 | Server, props `{ sponsors: Sponsor[] }` |
| `utils/sponsorAccess.ts` | F4 | `server-only`; `getSponsorAccess = cache(async () => …)` |
| `components/SponsorShell.tsx` | F4 | Server; ver Componentes |
| `index.ts` | F2 (mod. F4) | F2: `listSponsors`, `getSponsorById`, `getPublicSponsorBySlug`, `SponsorForm`, `SponsorTable`, `type Sponsor`, `type PublicSponsor`. F4: `getSponsorAccess`, `SponsorShell` |

### Cambios en `modules/accounts/`
| Archivo | Fase | Cambio |
|---|---|---|
| `utils/staffDisplay.ts` | F1 | `STAFF_ROLE_LABELS.sponsor = "Patrocinador"` |
| `schemas/staff.schema.ts` | F1 (mod. F3) | F1: `assignmentRoleSchema = z.enum(["commercial", "admin", "sponsor"])` (sincronizado con el enum por test); `staffRoleSchema` (equipo) no cambia. F3: `inviteSponsorMemberSchema = z.object({ email: emailSchema, sponsorId: z.uuid() })`; `revokeStaffRoleSchema` (= `staffRoleChangeSchema` con `role: assignmentRoleSchema`). `staffRoleChangeSchema` (asignar) sigue con `staffRoleSchema` |
| `types/staff.types.ts` | F3 | `CreateInvitationInput = { email: string; role: StaffRole; sponsorId: string \| null }`, `InviteSponsorMemberInput`, `RevokeStaffRoleInput`; `StaffOverviewScope = { sponsorId?: string }` |
| `services/staff.service.ts` | F3 | `createInvitation(input: CreateInvitationInput, actor)` inserta `sponsorId`. `listStaffOverview(scope = {})`: sin `sponsorId` → `role <> 'sponsor'` en asignaciones e invitaciones; con `sponsorId` → `role = 'sponsor' AND sponsor_id = $id`. `revokeStaffRole` acepta `RevokeStaffRoleInput` (SQL sin cambios) |
| `actions/staff.actions.ts` | F3 | `inviteStaffAction` pasa `sponsorId: null`. Nueva `inviteSponsorMemberAction` (`staff.manage`; `acceptUrl = new URL("/patrocinador/acceso", APP_ORIGIN)`). `revokeStaffRoleAction` valida con `revokeStaffRoleSchema`. La revalidación pasa a `revalidatePath("/crm/admin", "layout")` (usuarios y marcas). `FIELD_MESSAGES.sponsorId = "El patrocinador no es válido."`. Un `sponsorId` inexistente (manipulado) choca con la FK y termina en el error genérico "staff action failed" |
| `components/InviteStaffForm.tsx` | F3 | Prop opcional `sponsorId?: string`: con ella usa `inviteSponsorMemberAction`, envía `sponsorId` oculto, no muestra el selector de rol, titula "Invitar a una persona de la marca" y explica que la persona debe entrar por el enlace de acceso de patrocinadores. Sin ella, igual que hoy |
| `components/StaffTable.tsx` | F3 | Prop opcional `assignableRoles?: readonly StaffRole[]` (por defecto `staffRoleSchema.options`). Los botones "Asignar …" salen de ella; "Revocar …" no cambia |
| `types/auth.types.ts` | F3 | `AccessAudience = "staff" \| "runner" \| "sponsor"`; `AuthDestination` añade `"/patrocinador"`; `SignOutDestination` añade `"/patrocinador/acceso"` |
| `components/AccessPanel.tsx` | F3 | `AUDIENCE_CONFIG.sponsor = { destination: "/patrocinador", signUpLabel: "¿Te invitaron? Crea tu cuenta", signUpNotice: "Solo para marcas invitadas por Carreras Viajeras. Usa el correo de la invitación." }` |
| `index.ts` | F4 | Exporta `SignOutButton` (si `runner-portal.md` F5 ya lo hizo, no hay cambio) |

### Cambios en `modules/trips/`
| Archivo | Fase | Cambio |
|---|---|---|
| `types/trips.types.ts` | F5, F6 | F5: código `"locked"` en `TripActionState`; `TripReviewStatus`. F6: `TripListItem = Trip & { sponsorName: string \| null }`; `PublicTripSponsor = { slug; name; logoUrl: string \| null; websiteUrl: string \| null }`; `PublicTrip` añade `sponsor: PublicTripSponsor \| null`; `PublishedTripFilter = { featuredOnly?: boolean; sponsorSlug?: string }` |
| `schemas/trips.schema.ts` | F6 | `tripReviewSchema = z.object({ id: z.uuid(), note: trim 3–500 })` ("Explica qué debe cambiar, entre 3 y 500 caracteres."); `tripFeaturedChangeSchema = z.object({ id: z.uuid(), featured: z.enum(["true", "false"]).transform((v) => v === "true") })` |
| `services/trips.service.ts` | F4, F5, F6 | Ver "Contratos" |
| `actions/trips.actions.ts` | F5, F6 | `runTripAction` con `authorize` (Decisión 19). F5: `createSponsorTripAction`, `updateSponsorTripAction` (redirigen a `/patrocinador`), `submitSponsorTripAction` (valida `tripStatusChangeSchema.pick({ id: true })`); revalidan `/patrocinador` y `/crm/viajes`. F6: `requestTripChangesAction` (redirige a `/crm/viajes`), `setTripFeaturedAction` ("Viaje destacado en la portada." / "Viaje quitado de destacados."). Mensajes: `forbidden` del portal "No tienes acceso al panel de patrocinadores."; `locked` "Este evento está en revisión o publicado y no se puede editar."; `not_found` "El evento ya no existe. Recarga la página."; envío "Evento enviado a revisión." |
| `utils/tripDisplay.ts` | F4 | `getTripStatusBadge(status, reviewStatus): { label: string; variant: "default" \| "secondary" \| "outline" }`: published → "Publicado" `default`; draft + `null` → "Borrador" `secondary`; draft + `in_review` → "En revisión" `default`; draft + `changes_requested` → "Cambios solicitados" `secondary`; archived → "Archivado" `outline`. Sin `server-only` |
| `components/TripForm.tsx` | F5 | Prop `audience?: "team" \| "sponsor"` con configuración interna: `team` → `createTripAction`/`updateTripAction`, "Crear viaje"/"Guardar cambios", "Volver a viajes" (`/crm/viajes`); `sponsor` → acciones del portal, "Crear borrador"/"Guardar borrador", "Volver a mis eventos" (`/patrocinador`) |
| `components/SponsorTripTable.tsx` | F4 (mod. F5) | Nuevo, Server; ver Componentes |
| `components/TripTable.tsx` | F6 | Props `{ trips: TripListItem[] }`; ver Componentes |
| `components/TripReviewForm.tsx` | F6 | Nuevo, `"use client"`; ver Componentes |
| `index.ts` | F4, F5, F6 | F4: `listSponsorTrips`, `getTripStatusBadge`, `SponsorTripTable`. F5: `getSponsorTrip`. F6: `TripReviewForm`, `type PublicTripSponsor`, `type TripListItem` |

### Cambios en `modules/landing/` (F7; F6 solo ajusta el fixture de `catalogTrip.test.ts`)
| Archivo | Cambio |
|---|---|
| `utils/trips.ts` | `Trip = TripContent & { name; description; sponsor: PublicTripSponsor \| null }` |
| `utils/catalogTrip.ts` | Devuelve `CatalogTripView \| null` (Decisión 15). Llama siempre a `getPublishedTripBySlug(slug)` (`null` → `null`); con contenido fijo devuelve `designed` (combinación de hoy + `sponsor`); sin él, `catalog`. Sigue envuelto en `cache` y propaga los errores de la base |
| `utils/sponsorShowcase.ts` | Nuevo: `getSponsorShowcase = cache(async (slug) => …)`: `Promise.all([getPublicSponsorBySlug(slug), listPublishedTrips({ sponsorSlug: slug })])`; sin marca o sin eventos → `null` |
| `components/SponsorCredit.tsx` | Nuevo, Server. Props `{ sponsor: PublicTripSponsor; className? }`. "Presentado por", logo (`next/image` 120×40, `object-contain`, alt `Logo de <name>`) si existe, y nombre, enlazados a `/patrocinadores/<slug>` |
| `components/TripDetail.tsx` | Muestra `<SponsorCredit>` bajo el `h1` si `trip.sponsor` |
| `components/CatalogTripDetail.tsx` | Nuevo, Server. Props `{ trip: PublicTrip }`. Mismo lenguaje visual que `TripDetail` (cabecera con imagen `fill` o `/images/hero-meta.webp` si no hay, tokens de marca), con los datos del criterio F7. CTA "Quiero información" → `buildWhatsAppUrl(WHATSAPP_NUMBER, "Hola, me interesa <title> (<city>, <country>, <fecha>). Quisiera conocer disponibilidad, inclusiones y condiciones.")`, oculto si devuelve `null`; aviso "Consulta sin compromiso; no se reciben pagos en la web." |
| `components/TripCard.tsx` | Nuevo, Server. Props `{ trip: PublicTrip }`. `Link` a `/viajes/<slug>` con el estilo de las tarjetas de `DestinationsSection`: imagen, fecha, título, destino, precio y "Presentado por <name>" (texto) |
| `components/FeaturedTripsSection.tsx` | Nuevo, async Server. `listPublishedTrips({ featuredOnly: true })` en `try/catch` (error → `console.error("landing: featured trips unavailable")` y `null`); vacío → `null`; si no, `<section id="destacados" aria-labelledby>` "Eventos destacados" con hasta 6 `TripCard` (`FEATURED_LIMIT = 6`) |
| `components/SponsorShowcase.tsx` | Nuevo, Server. Props `{ sponsor: PublicSponsor; trips: PublicTrip[] }`; cabecera de la marca y cuadrícula de `TripCard` |
| `index.ts` | Exporta `CatalogTripDetail`, `FeaturedTripsSection`, `SponsorShowcase`, `getSponsorShowcase`, `type CatalogTripView` |

### Contratos (funciones de servidor; sin API HTTP)
```ts
// modules/sponsors/services/sponsors.service.ts (server-only, getDb())
export async function listSponsors(): Promise<Sponsor[]>;                 // ORDER BY name, slug
export async function getSponsorById(id: string): Promise<Sponsor | null>; // no UUID → null sin consultar
export async function createSponsor(input: SponsorInput, actorUserId: string): Promise<{ id: string } | "slug_taken">;
// INSERT … ON CONFLICT (slug) DO NOTHING RETURNING id
export async function updateSponsor(id: string, input: SponsorUpdateInput): Promise<"updated" | "not_found">;
// UPDATE name, logo_url, website_url, description, updated_at = now() WHERE id (nunca slug ni created_by)
export async function getPublicSponsorBySlug(slug: string): Promise<PublicSponsor | null>;
// await connection(); slug no canónico → null sin consultar
export type PublicSponsor = { slug: string; name: string; logoUrl: string | null; websiteUrl: string | null; description: string | null };

// modules/sponsors/utils/sponsorAccess.ts (server-only)
export type SponsorAccess =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok"; user: SponsorUser; sponsor: SponsorBrand };
export const getSponsorAccess: () => Promise<SponsorAccess>;
// connection() → requireSponsor() (Unauthorized/Forbidden → estados) → getSponsorById(user.sponsorId) (null → forbidden)

// modules/trips/services/trips.service.ts (server-only)
export async function listSponsorTrips(sponsorId: string): Promise<Trip[]>;            // F4; WHERE sponsor_id = $1; archivados al final, race_date, slug
export async function getSponsorTrip(id: string, sponsorId: string): Promise<Trip | null>; // F4; no UUID → null; WHERE id AND sponsor_id
export async function createSponsorTrip(input: TripInput, sponsorId: string): Promise<{ id: string } | "slug_taken">; // F5
export async function updateSponsorTrip(id: string, sponsorId: string, input: TripInput):
  Promise<"updated" | "not_found" | "locked" | "slug_taken">;
// F5; db.batch: 1) UPDATE … WHERE (fila "Editar" del flujo) AND NOT EXISTS (otro slug igual) RETURNING id;
//               2) SELECT status, review_status FROM trips WHERE id AND sponsor_id.
// Fila en 1 → updated; sin fila en 2 → not_found; status <> 'draft' o in_review → locked; resto → slug_taken.
export async function submitSponsorTrip(id: string, sponsorId: string): Promise<"submitted" | "invalid_transition">; // F5
export async function setTripStatus(id: string, status: TripStatus): Promise<"changed" | "invalid_transition">;    // F5 (mod.; flujo)
export async function listTrips(): Promise<TripListItem[]>;
// F6; LEFT JOIN sponsors; ORDER BY status = 'archived', review_status IS DISTINCT FROM 'in_review', race_date, slug
export async function requestTripChanges(id: string, note: string): Promise<"returned" | "invalid_transition">;     // F6
export async function setTripFeatured(id: string, featured: boolean): Promise<"changed" | "invalid_transition">;    // F6
export async function listPublishedTrips(filter?: PublishedTripFilter): Promise<PublicTrip[]>;                     // F6 (mod.)
export async function getPublishedTripBySlug(slug: string): Promise<PublicTrip | null>;                            // F6 (mod.: + sponsor)
// Ambas: LEFT JOIN sponsors; sponsor como objeto anidado de Drizzle (null si no hay marca: slug y name son NOT NULL).

// modules/landing/utils/catalogTrip.ts
export type CatalogTripView =
  | { kind: "designed"; title: string; description: string; trip: Trip }       // contenido fijo + catálogo
  | { kind: "catalog"; title: string; description: string; trip: PublicTrip }; // plantilla genérica
export const getCatalogTrip: (slug: string) => Promise<CatalogTripView | null>;
export const getSponsorShowcase: (slug: string) => Promise<{ sponsor: PublicSponsor; trips: PublicTrip[] } | null>;
```
Todas las Server Actions mantienen la firma de `useActionState`, `(prev, formData) => Promise<State>`, y el orden guarda → zod → service → `revalidatePath`. `redirect` va siempre fuera del `try/catch`.

### Componentes
| Componente | Tipo | Detalle |
|---|---|---|
| `table`, `badge`, `button`, `input`, `label`, `textarea`, `card`, `alert-dialog`, `native-select` | shadcn (instalado) | Listas, estados, formularios, avisos y confirmaciones |
| `alert` | shadcn (instalar en F5-T1: `npx shadcn@latest add alert`, sin sobrescribir; si `runner-portal.md` F5 ya lo instaló, se omite) | Motivo de devolución (portal y CRM) y avisos de estado |
| `ConfirmActionButton` | existente (`components/shared/ConfirmActionButton.tsx`) | "Enviar a revisión", "Publicar", "Destacar"/"Quitar de destacados" |
| `AccessPanel`, `SignOutButton`, `InviteStaffForm`, `StaffTable`, `InvitationsTable`, `CrmShell` | existentes (`modules/accounts`) | Ampliados por props (O/C) como se describe arriba; `InvitationsTable` sin cambios. `CrmShell` añade "Patrocinadores" si `can(roles, "sponsors.manage")`, antes de "Usuarios" (y lo incluye en la condición del `<nav>`) |
| `TripForm`, `TripTable` | existentes (`modules/trips`) | `TripForm` con `audience`. `TripTable` (F6): línea "Patrocinador: <marca>", `Badge` de `getTripStatusBadge` + "Destacado", "Publicar" solo si `sponsorId === null \|\| reviewStatus === "in_review"`, "Revisar" en lugar de "Editar" si está en revisión, "Destacar"/"Quitar de destacados" en publicados y textos de despublicar según el tipo |
| `SponsorForm` | nuevo, `modules/sponsors/components/` (`"use client"`; no hay formulario de marcas) | Mismo patrón que `TripForm`: `useActionState` + `onSubmit`/`startTransition`, errores por campo con `role="alert"` y `aria-invalid`, conserva lo escrito. Campos: Nombre, Identificador (solo lectura al editar, con "El identificador no se puede cambiar."), URL del logo, Sitio web, Descripción (`Textarea`). Botones "Crear patrocinador"/"Guardar cambios" y "Volver a patrocinadores"; mensaje de éxito con `role="status"` |
| `SponsorTable` | nuevo, `modules/sponsors/components/` (Server) | Columnas del criterio F2; vacío con su texto |
| `SponsorShell` | nuevo, `modules/sponsors/components/` (Server; `CrmShell` es del CRM, con su navegación por permisos) | Props `{ email: string; sponsorName: string; children }`. Cabecera "Panel de patrocinadores" (→ `/patrocinador`), nombre de la marca, `<nav>` "Mis eventos", correo y `<SignOutButton redirectTo="/patrocinador/acceso" />`; `<main className="flex-1 p-4">` |
| `SponsorTripTable` | nuevo, `modules/trips/components/` (Server; `TripTable` tiene acciones del equipo) | Props `{ trips: Trip[] }`. F4: columnas Evento, Carrera y Estado; vacío "Aún no tienes eventos.". F5 añade "Acciones": en Borrador y Cambios solicitados, "Editar" (→ `/patrocinador/eventos/<id>`) y `ConfirmActionButton` "Enviar a revisión" (título "¿Enviar «<title>» a revisión?", descripción "El equipo de Carreras Viajeras lo revisará antes de publicarlo. Mientras tanto no podrás editarlo."); en En revisión y Archivado, "Ver"; en Publicado, "Ver" y "Ver en la web" |
| `TripReviewForm` | nuevo, `modules/trips/components/` (`"use client"`) | Props `{ tripId: string }`. `Textarea` "Motivo" (`name="note"`, `maxLength=500`), campo oculto `id`, botón "Devolver al patrocinador" ("Devolviendo…" mientras está pendiente), error por campo y mensaje general; conserva lo escrito tras un error |
| `SponsorCredit`, `CatalogTripDetail`, `TripCard`, `FeaturedTripsSection`, `SponsorShowcase` | nuevos, `modules/landing/components/` (Server) | Ver "Cambios en `modules/landing/`" |

### Seguridad (resumen verificable)
- **Ownership:** `sponsor_id` sale de `requireSponsor()` en cada acción y página, y va en el `WHERE` de cada lectura y escritura del portal. Tests: el SQL lleva `sponsor_id = $n` con el valor de la sesión; un `sponsorId` del formulario se ignora.
- **Sin oráculo:** un id ajeno da 404 en la página y `not_found`/`invalid_transition` en las acciones, igual que uno inexistente.
- **Mínimo privilegio:** `sponsor` solo tiene `sponsor.portal`; el CRM, `/api/crm/me` y las acciones de equipo, leads, reservas y staff lo rechazan con las guardas existentes.
- **Lecturas públicas:** solo `status = 'published'`. Se exponen `PublicTrip` + `PublicTripSponsor` y `PublicSponsor`, nunca ids internos, personas, `review_*` ni `created_by`.
- **Errores y logs:** errores genéricos sin causa ("staff action failed", "trip action failed", "sponsor action failed"); el único log nuevo es "landing: featured trips unavailable".

## Reutilización
- `staff_invitations`/`staff_assignments`/`profiles`, la aceptación CTE, `createInvitation`, `revokeStaffRole`, `listStaffOverview`, `InviteStaffForm`, `InvitationsTable`, `StaffTable`, `STAFF_ROLE_LABELS`, `emailSchema`.
- `requirePermission`, `UnauthorizedError`/`ForbiddenError`, `can()`, `getCrmAccess`, `NoCrmAccess` (CRM sin cambios), `AccessPanel`, `SignInForm`/`VerifyEmailForm` (destinos cerrados), `SignOutButton`.
- `TripForm` (con `audience`), `TripTable`, `runTripAction` y sus helpers, `setTripStatus`, `editableColumns`, `publicColumns`, `tripFormSchema`, `tripStatusChangeSchema.pick`, `formatTripDate`/`formatTripDateRange`/`formatTripPrice`, `getPublishedTripBySlug`, `getCatalogTrip`, `TripDetail`, `SiteHeader`/`SiteFooter`, `buildWhatsAppUrl`/`WHATSAPP_NUMBER`.
- `ConfirmActionButton` (`components/shared/`); shadcn instalados y `alert` a instalar.
- Fake del cliente Neon HTTP de `staff.service.test.ts`/`trips.service.test.ts` para los tests de `sponsors.service`.
- `getDb()`, `db.batch`, `npm run db:generate`, el procedimiento manual del README; sin cambios en `lib/db.ts`, `lib/env.ts`, `drizzle.config.ts`, `wrangler.jsonc` ni `next.config.ts`.

## Tests
- `lib/auth/permissions.test.ts` (F1): filas de `sponsors.manage` y `sponsor.portal` para `["sponsor"]`, `["commercial"]`, `["admin"]`, `["commercial","admin"]` y `[]`; `["sponsor"]` contra **cada** permiso existente → `false`; los bucles "admin tiene todo" y "sin roles nada" incluyen los dos nuevos; los casos existentes no cambian.
- `lib/auth/access.service.test.ts` (F1): el CTE de aceptación devuelve y copia `sponsor_id` y sigue siendo una sola sentencia en el batch; `loadSponsorId` con fila → id, sin filas → `null`, SQL con `role = 'sponsor'` y `revoked_at IS NULL`.
- `lib/auth/guards.test.ts` (F1): los casos de `requireSponsor` del criterio F1, con `loadSponsorId` en el mock de `access.service`.
- `modules/accounts/schemas/staff.schema.test.ts` (F1, F3): F1: `assignmentRoleSchema.options` = enum y `staffRoleSchema` ⊂ enum. F3: `inviteSponsorMemberSchema` (correo normalizado, `sponsorId` no UUID → error, `role` extra descartado); `staffRoleChangeSchema` rechaza `sponsor`; `revokeStaffRoleSchema` lo acepta.
- `modules/accounts/services/staff.service.test.ts` (F3): `createInvitation` con y sin `sponsorId`; `listStaffOverview()` con `role <> 'sponsor'` en las dos consultas; con `{ sponsorId }`, `role = 'sponsor' AND sponsor_id = $n` en ambas.
- `modules/accounts/actions/staff.actions.test.ts` (F3): `inviteSponsorMemberAction` (guarda, validación, entrada al service, `acceptUrl` de patrocinadores, revalidación de `/crm/admin` con `"layout"`); `grantStaffRoleAction` con `sponsor` → `invalid_input`; `revokeStaffRoleAction` con `sponsor` → revoca.
- `modules/accounts/components/AccessPanel.test.tsx` (F3): audiencia `sponsor` (textos y destino `/patrocinador` tras ingresar).
- `modules/sponsors/schemas/sponsors.schema.test.ts` (F2): válido completo; vacíos → `null`; slug (mayúsculas a minúsculas, espacios, `--`, guiones en los extremos, < 3) → error; logo/sitio `http://` → error; descripción de 9 y 501 caracteres → error; `updateSponsorSchema` descarta `slug` y exige `id` UUID.
- `modules/sponsors/services/sponsors.service.test.ts` (F2): orden de `listSponsors`; `getSponsorById` con id no UUID sin consulta; `createSponsor` con `ON CONFLICT DO NOTHING` y `created_by`, sin filas → `slug_taken`; `updateSponsor` sin `slug` en el `SET`, con `updated_at`, sin filas → `not_found`; `getPublicSponsorBySlug` (criterio F2).
- `modules/sponsors/actions/sponsors.actions.test.ts` (F2): sin sesión / `commercial` / `sponsor` → `unauthorized`/`forbidden` sin service; `invalid_input` con `fieldErrors` y `values`; alta → `redirect` a la marca; `slug_taken` en el campo; edición → mensaje de éxito y revalidación; el service lanza → "sponsor action failed".
- `modules/sponsors/utils/sponsorAccess.test.ts` (F4): `connection()` primero; `UnauthorizedError` → `unauthenticated`; `ForbiddenError` → `forbidden`; marca inexistente → `forbidden`; `ok` con `sponsor` (`id`, `slug`, `name`).
- `modules/trips/utils/tripDisplay.test.ts` (F4): las cinco combinaciones de `getTripStatusBadge`.
- `modules/accounts/utils/staffDisplay.test.ts` (F1): las claves de `STAFF_ROLE_LABELS` coinciden con `assignmentRoleSchema.options` y las etiquetas son `{ commercial: "Comercial", admin: "Admin", sponsor: "Patrocinador" }`.
- `modules/trips/services/trips.service.test.ts` (F1, F4, F5, F6):
  - F1: las aserciones de SQL de `listTrips` y `createTrip` incluyen las columnas nuevas de `trips` (`sponsor_id`, `featured`, `review_status`, `review_note`) que Drizzle emite en `select()`/`insert()`; sin cambios de comportamiento;
  - F4: `listSponsorTrips` y `getSponsorTrip` (`sponsor_id` en el `WHERE`; id no UUID sin consulta);
  - F5: `createSponsorTrip` (`sponsor_id` de la entrada, sin `status`); `updateSponsorTrip` (un batch de 2 y los cuatro resultados); `submitSponsorTrip` (condiciones y `review_note = NULL`); `setTripStatus` (criterio F5);
  - F6: `listTrips` (join y orden); `requestTripChanges`; `setTripFeatured`; `listPublishedTrips` con cada filtro y `sponsor` anidado (o `null`); `getPublishedTripBySlug` con marca.
- `modules/trips/schemas/trips.schema.test.ts` (F6): `tripReviewSchema` (vacío, 2 y 501 caracteres → error; recorta espacios) y `tripFeaturedChangeSchema` (`"true"`/`"false"` → booleano; otro valor → error).
- `modules/trips/actions/trips.actions.test.ts` (F5, F6):
  - F5: acciones del portal (guarda `requireSponsor` simulada, `sponsorId` de la sesión y nunca del formulario, campos extra ignorados, cada resultado del service con su código y mensaje, revalidación de las dos rutas, `redirect`); acciones del equipo con roles `["sponsor"]` → `forbidden`;
  - F6: `requestTripChangesAction` y `setTripFeaturedAction` (guarda, validación, resultados).
- `modules/trips/components/TripForm.test.tsx` (F1 fixture; F5): F1 añade las columnas nuevas al `Trip` del fixture; F5 añade la audiencia `sponsor` (acción, botones y enlace de vuelta) y que sin `audience` todo sigue igual.
- `modules/landing/utils/catalogTrip.test.ts` (F6 fixture; F7): `sponsor: null` en el fixture (F6); F7: slug sin contenido fijo y publicado → `catalog`; con contenido fijo → `designed` con `sponsor`; no publicado → `null`; los errores se propagan.
- `modules/landing/utils/sponsorShowcase.test.ts` (F7): marca y eventos → resultado; sin marca o sin eventos → `null`.
- `modules/landing/components/FeaturedTripsSection.test.tsx` (F7; async Server Component llamado como función y renderizado su resultado; service simulado): sin destacados → `null`; con 7 → 6 tarjetas; el service lanza → `null` y `console.error` con el texto fijo.
- Sin unit test (SETUP §3): `lib/db-schema.ts` (migración + prueba manual), tipos, páginas y layouts de `app/`, componentes presentacionales (`SponsorTable`, `SponsorShell`, `SponsorTripTable`, `SponsorCredit`, `CatalogTripDetail`, `TripCard`, `SponsorShowcase`), `TripTable`, `SponsorForm` y `TripReviewForm` (su lógica está en schema y acciones), `CrmShell`, `InviteStaffForm`, `StaffTable` y `components/ui/`.

## Plan de tareas
Cada fase se ejecuta en una sesión y termina con `npm run lint`, `npx vitest run` y `npm run build` (los ejecuta el reviewer). Los developers en paralelo solo verifican sus archivos con `vitest`/`eslint`.

### Fase 1 — Datos, permisos y guardas (5 tareas, 17 archivos: 2 generados por drizzle-kit)
- [x] T1 — Schema y migración: tabla `sponsors`, `sponsor` en `staff_role`, `trip_review_status`, columnas y CHECK (con `role::text`); `npm run db:generate` y revisión del SQL (solo objetos de `public`, sin `neon_auth` ni `DROP`) · archivos: `lib/db-schema.ts`, `drizzle/<NNNN>_*.sql` (generado), `drizzle/meta/<NNNN>_snapshot.json` (generado), `drizzle/meta/_journal.json` · depende de: — · secuencial (base, `lib/`)
- [x] T2 — Permisos `sponsors.manage` y `sponsor.portal` con sus tests · archivos: `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts` · depende de: T1 · secuencial (`lib/`)
- [x] T3 — Aceptación con `sponsor_id`, `loadSponsorId` y `requireSponsor` con tests · archivos: `lib/auth/access.service.ts`, `lib/auth/access.service.test.ts`, `lib/auth/guards.ts`, `lib/auth/guards.test.ts` · depende de: T2 · secuencial (`lib/`)
- [ ] T4 — Ajustes que exige el enum ampliado: etiqueta "Patrocinador", `assignmentRoleSchema` con su test de sincronía, test de etiquetas, fixture de `Trip` y aserciones SQL de `trips.service.test.ts` con las columnas nuevas · archivos: `modules/accounts/utils/staffDisplay.ts`, `modules/accounts/utils/staffDisplay.test.ts`, `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/trips/components/TripForm.test.tsx`, `modules/trips/services/trips.service.test.ts` · depende de: T3 · paralelo (con T5)
- [x] T5 — README: migración de patrocinadores (prerrequisitos, una transacción, alternativa ante `unsafe use of new value`, irreversibilidad del valor del enum, verificación y aplicar antes de desplegar) y pruebas manuales de los CHECK · archivos: `README.md` · depende de: T3 · paralelo (con T4)

### Fase 2 — CRM: marcas de patrocinadores (5 tareas, 14 archivos)
Requisito previo: Fase 1 cerrada (y la migración aplicada en la rama de Neon que se use para probar).
- [ ] T1 — Schemas y tipos de marcas con test · archivos: `modules/sponsors/schemas/sponsors.schema.ts`, `modules/sponsors/schemas/sponsors.schema.test.ts`, `modules/sponsors/types/sponsors.types.ts` · depende de: Fase 1 · secuencial
- [ ] T2 — Service de marcas (CRM y lectura pública) con tests · archivos: `modules/sponsors/services/sponsors.service.ts`, `modules/sponsors/services/sponsors.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — Server Actions de marcas con tests · archivos: `modules/sponsors/actions/sponsors.actions.ts`, `modules/sponsors/actions/sponsors.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `SponsorForm` (cliente) y `SponsorTable` (Server) · archivos: `modules/sponsors/components/SponsorForm.tsx`, `modules/sponsors/components/SponsorTable.tsx` · depende de: T3 · secuencial
- [ ] T5 — API pública, navegación y páginas · archivos: `modules/sponsors/index.ts`, `modules/accounts/components/CrmShell.tsx`, `app/crm/(protected)/admin/patrocinadores/page.tsx`, `app/crm/(protected)/admin/patrocinadores/nuevo/page.tsx`, `app/crm/(protected)/admin/patrocinadores/[id]/page.tsx` · depende de: T4 · secuencial

### Fase 3 — CRM: personas de cada marca y audiencia de acceso (5 tareas, 13 archivos)
- [ ] T1 — Schemas y tipos de invitación y revocación de patrocinadores con tests · archivos: `modules/accounts/schemas/staff.schema.ts`, `modules/accounts/schemas/staff.schema.test.ts`, `modules/accounts/types/staff.types.ts` · depende de: Fase 2 · secuencial
- [ ] T2 — `createInvitation` con `sponsorId` y `listStaffOverview(scope)` con tests · archivos: `modules/accounts/services/staff.service.ts`, `modules/accounts/services/staff.service.test.ts` · depende de: T1 · paralelo (con T4)
- [ ] T3 — `inviteSponsorMemberAction`, revocación con `sponsor` y revalidación de `/crm/admin` con tests · archivos: `modules/accounts/actions/staff.actions.ts`, `modules/accounts/actions/staff.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — Audiencia `sponsor` y destinos cerrados con test · archivos: `modules/accounts/types/auth.types.ts`, `modules/accounts/components/AccessPanel.tsx`, `modules/accounts/components/AccessPanel.test.tsx` · depende de: T1 · paralelo (con T2 y T3)
- [ ] T5 — `InviteStaffForm` con `sponsorId`, `StaffTable` con `assignableRoles` y sección "Personas con acceso" en la marca · archivos: `modules/accounts/components/InviteStaffForm.tsx`, `modules/accounts/components/StaffTable.tsx`, `app/crm/(protected)/admin/patrocinadores/[id]/page.tsx` · depende de: T3, T4 · secuencial

### Fase 4 — Portal: acceso y "Mis eventos" (4 tareas, 14 archivos)
Nota: el enlace de las invitaciones (`/patrocinador/acceso`) funciona desde esta fase. No compartas enlaces con patrocinadores reales hasta cerrar la Fase 5.
- [ ] T1 — Exportar `SignOutButton` desde `@/modules/accounts` (omitir si ya está) · archivos: `modules/accounts/index.ts` · depende de: Fase 3 · secuencial (base, `index.ts`)
- [ ] T2 — `getSponsorAccess` con test y `SponsorShell` · archivos: `modules/sponsors/utils/sponsorAccess.ts`, `modules/sponsors/utils/sponsorAccess.test.ts`, `modules/sponsors/components/SponsorShell.tsx` · depende de: T1 · paralelo (con T3)
- [ ] T3 — Lecturas del portal (`listSponsorTrips`, `getSponsorTrip`), `getTripStatusBadge` y `SponsorTripTable` (sin acciones) con tests · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts`, `modules/trips/utils/tripDisplay.ts`, `modules/trips/utils/tripDisplay.test.ts`, `modules/trips/components/SponsorTripTable.tsx` · depende de: T1 · paralelo (con T2)
- [ ] T4 — API pública y rutas del portal; comprobar `ƒ` en el build y medir el Worker (`build:worker` + `wrangler deploy --dry-run`, sin desplegar, Linux/WSL) · archivos: `modules/sponsors/index.ts`, `modules/trips/index.ts`, `app/patrocinador/acceso/page.tsx`, `app/patrocinador/(protected)/layout.tsx`, `app/patrocinador/(protected)/page.tsx` · depende de: T2, T3 · secuencial

### Fase 5 — Portal: crear, editar y enviar a revisión (5 tareas, 14 archivos: 1 generado por el CLI de shadcn)
- [ ] T1 — `npx shadcn@latest add alert` (sin sobrescribir; omitir si ya existe) · archivos: `components/ui/alert.tsx` · depende de: Fase 4 · secuencial (base, `components/ui/`)
- [ ] T2 — Tipos, escrituras del portal y `setTripStatus` según el flujo, con tests · archivos: `modules/trips/types/trips.types.ts`, `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts` · depende de: T1 · secuencial
- [ ] T3 — `runTripAction` con `authorize` y acciones del portal, con tests (incluido `["sponsor"]` → `forbidden` en las acciones del equipo) · archivos: `modules/trips/actions/trips.actions.ts`, `modules/trips/actions/trips.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `TripForm` con `audience` (con test) y acciones en `SponsorTripTable` · archivos: `modules/trips/components/TripForm.tsx`, `modules/trips/components/TripForm.test.tsx`, `modules/trips/components/SponsorTripTable.tsx` · depende de: T3 · secuencial
- [ ] T5 — API pública, páginas de evento, enlace "Nuevo evento" y README (alta de una marca de principio a fin) · archivos: `modules/trips/index.ts`, `app/patrocinador/(protected)/page.tsx`, `app/patrocinador/(protected)/eventos/nuevo/page.tsx`, `app/patrocinador/(protected)/eventos/[id]/page.tsx`, `README.md` · depende de: T4 · secuencial

### Fase 6 — CRM: revisión y destacados (5 tareas, 12 archivos)
- [ ] T1 — Schemas de devolución y destacado con tests; tipos `TripListItem`, `PublicTripSponsor` y `PublishedTripFilter` · archivos: `modules/trips/schemas/trips.schema.ts`, `modules/trips/schemas/trips.schema.test.ts`, `modules/trips/types/trips.types.ts` · depende de: Fase 5 · secuencial
- [ ] T2 — Service: `listTrips` con marca y cola, `requestTripChanges`, `setTripFeatured`, lecturas públicas con marca y filtros; fixture `sponsor: null` en la landing · archivos: `modules/trips/services/trips.service.ts`, `modules/trips/services/trips.service.test.ts`, `modules/landing/utils/catalogTrip.test.ts` · depende de: T1 · secuencial
- [ ] T3 — `requestTripChangesAction` y `setTripFeaturedAction` con tests · archivos: `modules/trips/actions/trips.actions.ts`, `modules/trips/actions/trips.actions.test.ts` · depende de: T2 · secuencial
- [ ] T4 — `TripTable` (marca, estados, publicar condicionado, destacar) y `TripReviewForm` · archivos: `modules/trips/components/TripTable.tsx`, `modules/trips/components/TripReviewForm.tsx` · depende de: T3 · secuencial
- [ ] T5 — API pública y revisión en la edición del CRM · archivos: `modules/trips/index.ts`, `app/crm/(protected)/viajes/[id]/page.tsx` · depende de: T4 · secuencial

### Fase 7 — Promoción pública (4 tareas, 16 archivos; los 4 de T4 son delgados)
- [ ] T1 — `getCatalogTrip` con vistas `designed`/`catalog` y `Trip` con `sponsor`, con test · archivos: `modules/landing/utils/trips.ts`, `modules/landing/utils/catalogTrip.ts`, `modules/landing/utils/catalogTrip.test.ts` · depende de: Fase 6 · secuencial
- [ ] T2 — "Presentado por" y plantilla genérica del evento · archivos: `modules/landing/components/SponsorCredit.tsx`, `modules/landing/components/TripDetail.tsx`, `modules/landing/components/CatalogTripDetail.tsx` · depende de: T1 · paralelo (con T3)
- [ ] T3 — `TripCard`, destacados (con test), `getSponsorShowcase` (con test) y `SponsorShowcase` · archivos: `modules/landing/components/TripCard.tsx`, `modules/landing/components/FeaturedTripsSection.tsx`, `modules/landing/components/FeaturedTripsSection.test.tsx`, `modules/landing/utils/sponsorShowcase.ts`, `modules/landing/utils/sponsorShowcase.test.ts`, `modules/landing/components/SponsorShowcase.tsx` · depende de: T1 · paralelo (con T2)
- [ ] T4 — API pública y rutas públicas; comprobar `ƒ /`, `ƒ /patrocinadores/[slug]`, `○ /contacto` y `○ /cuenta`; medir el Worker · archivos: `modules/landing/index.ts`, `app/page.tsx`, `app/viajes/[slug]/page.tsx`, `app/patrocinadores/[slug]/page.tsx` · depende de: T2, T3 · secuencial
## Coordinación
- **`accounts-runner-profiles.md` (en paralelo):** ambas modifican `lib/db-schema.ts` y generan migración. La que se integre segunda en `main` regenera la suya con `npm run db:generate` y usa el número siguiente. Si esa spec también toca `lib/auth/guards.ts` o `CurrentUser`, F1-T3 se ejecuta sobre su trabajo ya integrado (esta spec no cambia `CurrentUser`).
- **`runner-portal.md`:** su F5-T1 exporta `SignOutButton` y su F6 cambia `AuthDestination` a `"/crm" | "/mis-carreras"`. Quien vaya segundo conserva lo del otro: `AuthDestination = "/crm" | "/mis-carreras" | "/patrocinador"`. Su F5-T1 instala `alert`; F5-T1 de esta spec se omite si ya existe.

## Cambios que requiere en otras specs (no editados aquí; cada una vuelve a `borrador` y necesita tu aprobación)
1. **`accounts-roles-permissions.md`:**
   - el enum `staff_role` añade `sponsor`;
   - `staff_invitations` y `staff_assignments` añaden `sponsor_id` con CHECK;
   - la aceptación copia `sponsor_id`;
   - `profiles` pasa a incluir cuentas de patrocinador;
   - la matriz añade `sponsors.manage` y `sponsor.portal`;
   - `/crm/admin/usuarios` lista solo al equipo;
   - `revokeStaffRole` acepta `sponsor` y `grantStaffRole` no;
   - las acciones de staff revalidan `/crm/admin` (layout).
2. **`accounts-auth-ui.md`:** audiencia `sponsor`; destinos cerrados ampliados (`/patrocinador` tras ingresar, `/patrocinador/acceso` tras cerrar sesión); nueva página de acceso `/patrocinador/acceso`.
3. **`trips-catalog.md`:**
   - columnas `sponsor_id`, `featured`, `review_status`, `review_note`;
   - flujo de revisión y nuevas condiciones y efectos de `setTripStatus` (publicar exige revisión en eventos de marca, despublicarlos los deja en revisión, todo cambio quita "destacado");
   - `PublicTrip.sponsor` y `listPublishedTrips(filter)`;
   - `listTrips(): TripListItem[]` con la cola de revisión primero;
   - `TripForm` con `audience`, `TripTable` ampliada, código `locked` en `TripActionState`;
   - funciones del portal.
4. **`landing-public-site.md`:**
   - `/viajes/[slug]` deja de dar 404 sin consultar Neon para slugs sin contenido fijo y gana una plantilla genérica (antes en "No incluye");
   - `getCatalogTrip` devuelve `CatalogTripView`;
   - `/` deja de ser estática por "Eventos destacados";
   - ruta pública nueva `/patrocinadores/[slug]`.
5. **`runner-portal.md`:** solo coordinación de `AuthDestination`, la exportación de `SignOutButton` y `alert` (ver "Coordinación"); sin cambios funcionales.
6. **`crm-leads-pipeline.md`:** ninguno (`LEAD_OWNER_ROLES` ya se deriva de la matriz y excluye a `sponsor`).

## Preguntas abiertas
1. **Portada dinámica.** Mostrar destacados en `/` hace que cada visita a la portada consulte Neon. Eso supone algo más de CPU en Workers Free, despertar el cómputo de Neon Free si estaba suspendido y una primera respuesta más lenta (mitigado con streaming). Por defecto se hace así (Decisión 17). La alternativa es mostrar los destacados solo en `/patrocinadores/<slug>` y dejar `/` estática. ¿Confirmas la portada dinámica?
2. **Consultas de eventos de patrocinadores.** Por defecto, "Quiero información" lleva al WhatsApp del equipo, y el equipo gestiona esos leads (Decisión 16). ¿Prefieres que, en los eventos de una marca, el botón lleve también, o en su lugar, al sitio web del patrocinador?
