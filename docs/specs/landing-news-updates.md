# Noticias y novedades públicas de Carreras Viajeras

- Módulo: content, landing
- Estado: borrador
- Origen: ampliación solicitada por el usuario el 29 de octubre de 2026.
- Referencias: `AGENTS.md`, `docs/SETUP.md`, `landing-public-site.md`,
  `landing-home-redesign.md` y `accounts-clerk-rbac.md`.

## Objetivo

Mostrar noticias, actualizaciones y artículos reales en la landing, con un listado
consultable y una página por publicación. El equipo administra el contenido en
el CRM; el público solo ve lo publicado expresamente.

## Alcance y reutilización

Incluye la sección **Noticias y novedades** de la portada con las tres publicaciones
más recientes, `/noticias`, `/noticias/[slug]` y gestión en `/crm/contenidos`.
Categorías iniciales: `news` (Noticia), `update` (Actualización) y `article` (Artículo).

Se reutilizan los tokens, tipografía, espaciado y patrones de tarjetas de la landing,
SiteHeader/SiteFooter y componentes Base UI/shadcn existentes. `BlogSection` conserva
sus consejos y referentes: las noticias lo complementan, no los borran ni los
convierten automáticamente en publicaciones editables.

No incluye comentarios, newsletter, contenido de usuarios, programación de fechas,
subida de archivos ni extracción automática de fuentes externas. Los avisos privados
`trip_updates` son otro dominio: no se publican, copian ni consultan desde noticias.

## Precedencia y lectura pública

1. Esta spec, cuando sea aprobada, sustituye únicamente la condición de portada
   estática de las specs anteriores: `/` pasa a renderizar las novedades por
   petición con `connection()`, igual que el catálogo dinámico actual. No se
   modifican las specs históricas ni se conecta Neon durante build/importación.
2. Las lecturas públicas solo seleccionan publicaciones `published` y su versión
   publicada. Nunca devuelven borradores, versiones en edición, autores internos,
   correos, ids de staff, datos de runners o parámetros de auditoría.
3. El listado ordena por primera publicación descendente y un desempate estable
   por slug. La portada limita a tres filas; `/noticias` pagina de forma acotada.
   Solo la categoría y un número de página válidos se aceptan como filtros.
4. El slug canónico es minúsculo y válido; un slug no canónico, inexistente,
   despublicado o archivado devuelve 404 sin revelar su estado interno.
5. Un error de base no se confunde con cero resultados ni con 404. La portada
   muestra un aviso fijo dentro de Noticias y mantiene el resto de secciones.
   Listado/artículo presentan su estado de error seguro, sin mensajes SQL ni datos
   enviados por el visitante. Los estados vacíos no muestran tarjetas inventadas.
6. La caché inicial es solo de la petición; no se añade ISR ni caché entre usuarios.
   Publicar/despublicar debe reflejarse en la siguiente petición pública. Si se
   introduce otra caché en implementación, su invalidación necesita diseño y
   prueba explícitos antes de afirmar que cumple este criterio.

## Edición, permisos y publicación

7. Cada página y Server Action del CRM exige `content.manage` en el servidor.
   Lo obtienen admin y super admin; commercial, organizer y sponsor no lo obtienen
   por este cambio. La UI oculta acciones no permitidas, sin sustituir la guarda.
8. El actor y las fechas de auditoría proceden del servidor. Zod valida los campos
   y descarta `createdBy`, `publishedBy`, `status`, fechas y atributos extra enviados
   desde formularios; las acciones de transición deciden el estado permitido.
9. Datos editoriales: título, slug, categoría, resumen, cuerpo de texto, imagen
   HTTPS opcional y texto alternativo obligatorio si hay imagen. Se establecen
   límites de longitud y se muestran errores por campo conservando lo escrito.
   No se descargan imágenes externas en servidor para validar su URL.
10. El cuerpo se almacena/renderiza como párrafos de texto seguro. No se interpreta
    como HTML, scripts, embeds o Markdown con HTML habilitado, y no se usa
    `dangerouslySetInnerHTML`. Título, resumen, alt y metadatos también se escapan.
11. Estados: `draft`, `published`, `archived`. Crear/guardar un borrador no publica.
    **Publicar** es una acción explícita que valida contenido completo y fija
    `published_at`/`published_by` con el reloj/actor del servidor en la primera vez.
12. Desde la primera publicación el slug queda fijo, incluso al despublicar. Editar prepara una
    revisión borrador; la versión pública no cambia hasta **Publicar cambios**.
    La UI distingue «Publicado» de «Publicado con cambios pendientes».
13. **Despublicar** vuelve a draft y retira inmediatamente el artículo de todas
    las lecturas públicas por estado. **Archivar** lo oculta y conserva la historia;
    no hay borrado físico ni restauración de archivados en este MVP.
14. Las revisiones y sus actores quedan auditados. Una revisión nueva no sobrescribe
    la que está publicada; publicación y selección de la nueva versión son
    atómicas. Los reintentos no crean publicaciones o transiciones duplicadas.
    Un guardado o publicación con una revisión base obsoleta devuelve conflicto,
    sin pisar al otro editor ni publicar silenciosamente un borrador anterior.

## Modelo y arquitectura propuestos

Nuevo módulo `modules/content`, con tipos, schemas, services, acciones, componentes
y API pública en `index.ts`. `app/` compone esas APIs; landing no importa internals
del módulo. Las funciones de acceso a Neon son server-only y validan perezosamente.

`content_posts` guarda identidad/slug, categoría, estado, referencias de revisión
en edición y publicada, primera publicación y auditoría. `content_revisions`
conserva título, resumen, párrafos, imagen/alt, fecha y actor de cada versión.
FK, unicidad del slug y CHECK protegen coherencia de estados/versiones. Los ids
de staff son internos y no forman parte de los DTO públicos.
Las revisiones en edición y publicadas pertenecen a la misma publicación; enviar
el id de una revisión ajena no permite cambiar esa relación ni publicarla por error.

Se genera una migración incremental desde el último snapshot, con revisión SQL y
prueba local. No se presupone un número disponible, no se reescriben migraciones
aplicadas ni se ejecuta SQL al instalar, arrancar, compilar o desplegar.

Contratos propuestos: `listPublishedPosts({ limit, page, category })`,
`getPublishedPostBySlug(slug)`, `getHomeNews()` con estados ok/empty/error,
`listManagedPosts()`, `saveDraft()`, `publishRevision()`, `unpublishPost()` y
`archivePost()`. El tamaño de página y las listas son acotados por el servidor.

## Criterios de aceptación y pruebas

- [ ] Portada muestra hasta tres publicaciones reales y «Ver todas» a `/noticias`,
  con categoría, título, resumen, fecha y enlace; conserva consejos y referentes.
- [ ] El listado pagina de forma estable; el artículo muestra la versión publicada,
  título/description de metadata y una imagen con alt cuando exista.
- [ ] Invitados pueden leer sin iniciar sesión ni tener un rol. Borradores/archivados no aparecen ni
  en metadata; su slug devuelve 404, y los errores de lectura no simulan un 404.
- [ ] Despublicar/archivar retira el contenido de portada, listado y detalle en
  la siguiente petición. Guardar una revisión no altera el contenido publicado.
- [ ] Sin sesión o sin permiso, las acciones devuelven denegación antes de escribir.
  Actor, fechas, estados y slugs protegidos no se pueden suplantar desde el cliente.
- [ ] Un texto con etiquetas/script se muestra como texto, nunca se ejecuta; URLs
  no HTTPS y una imagen sin alt se rechazan. Errores no exponen SQL o datos privados.
- [ ] Se prueban estados vacío/error, canonicalización, orden/límite, permisos,
  publicación atómica y transiciones, además de formularios con conducta.
- [ ] Pasan lint, tipos y suite relevante; se ejecutan Next/Workers y pruebas
  funcionales del ciclo CRM→público. Google Fonts y credenciales faltantes siguen
  siendo bloqueos operativos hasta comprobarlos; no se cuentan como éxitos.

## Plan de tareas

Fases secuenciales, hasta cinco tareas y aproximadamente quince archivos por fase.
Los cambios compartidos van primero; no se paralelizan builds.

### F1 — Datos, permisos y services
- [x] T1 — Schema y migración local; `lib/db-schema.ts`, SQL, snapshot y journal nuevos.
- [x] T2 — `content.manage` y sus tests; `lib/auth/permissions.ts` y `.test.ts`.
- [x] T3 — Tipos y schemas editoriales; `modules/content/types/content.types.ts`, `schemas/content.schema.*`.
- [x] T4 — Lecturas/escrituras versionadas y tests; `modules/content/services/content.service.*`.
- [x] T5 — Lectura segura de portada y API pública; `modules/content/utils/homeNews.*`, `index.ts`.

### F2 — Gestión editorial del CRM
- [x] T1 — Acciones guardadas y sus tests; `modules/content/actions/content.actions.*`.
- [x] T2 — Formulario accesible con estados y tests; `modules/content/components/ContentForm.*`.
- [x] T3 — Listado/estado y páginas CRM; `ContentTable.tsx`, `app/crm/(protected)/contenidos/page.tsx`, `nuevo/page.tsx`, `[id]/page.tsx`.
- [x] T4 — Navegación por permiso y pruebas; `modules/accounts/components/CrmShell.tsx`, `CrmSidebar.tsx`, `CrmSidebar.test.tsx`.
- [x] T5 — Exports e instrucciones; `modules/content/index.ts`, `README.md`.

### F3 — Noticias públicas y portada
- [x] T1 — Sección, tarjeta y artículo; `modules/content/components/NewsSection.tsx`, `NewsCard.tsx`, `NewsArticle.tsx`.
- [x] T2 — Composición dinámica y metadata; `app/page.tsx`, `app/noticias/page.tsx`, `app/noticias/[slug]/page.tsx`.
- [x] T3 — Enlaces e integración visual conservando BlogSection; `modules/landing/components/SiteHeader.tsx` (NAV_LINKS también alimenta móvil), `modules/content/index.ts` y tests de `utils/homeNews`.
- [x] T4 — Comprobación funcional de publicar/editar/despublicar/archivar, acceso denegado y texto malicioso; tests de services/acciones existentes y prueba de integración acotada.
- [ ] T5 — README, validación Next/Workers y revisión independiente con evidencia de las limitaciones reales.

No se crean noticias ficticias ni se publican contenidos reales por aprobar esta
spec. La primera publicación requiere una acción editorial humana en el CRM.
El documento se redactó como propuesta pendiente; el registro siguiente describe la autorización posterior de la sesión.


## Registro de ejecución — 29/10/2026

El usuario ordenó «implementar y ejecutar» en esta conversación después de estos
borradores. Se implementó ese alcance; el estado documental permanece borrador
y no se alteró approvals.jsonl ni se fabricaron firmas de Claude. La instrucción
real de la sesión se conserva en el informe de implementación.

Las responsabilidades pequeñas de recompensas se consolidaron en
`modules/rewards/services/rewards.service.ts`, `schemas/rewards.schema.ts`,
`actions/rewards.actions.ts` y sus pruebas, con funciones transaccionales en 0012.
Los esquemas están en `lib/rewards-schema.ts` y `lib/content-schema.ts`,
reexportados desde db-schema. Se reutilizó selectivamente UI del PR #33 y registro
de pagos del PR #19, actualizando Clerk e idempotencia sin fusionar sus ramas.
Las tareas marcadas indican implementación local; no implican despliegue ni
validación autenticada. La tarea final conserva pendientes las comprobaciones
con Clerk/Neon y el Worker, bloqueadas por credenciales/red.

Evidencia y mapa operativo: [auditoría de ampliación](../audits/2026-10-29-runner-news.md)
y [operación](../OPERACION-RUNNER-NOTICIAS.md).
