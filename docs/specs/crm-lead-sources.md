# Orígenes del lead: canales de la estrategia comercial, detalle y filtro por origen

- Módulo: crm
- Estado: aprobado
- Enmienda (2026-10-25): el cambio de origen acepta `web_form` en el schema y el service decide con `"source_locked"` (opción A elegida por el usuario), para que un lead del formulario web pueda editar su detalle desde la ficha. Cambian el Requisito 4, los criterios de `leadSourceChangeSchema`, `changeLeadSource` y del formulario de la ficha, y el Diseño técnico.
- Depende de:
  - `crm-leads-pipeline.md` (aprobada): tablas `leads` y `lead_activities`, alta manual, ficha, edición, historial, lista con embudo y filtros, permiso `leads.manage`. Sus F2–F6 están en ronalehm/carreras-viajeras#12 (rama `claude/determined-cannon-bxoqo1`, `977f916`), **aún sin integrar en `main`** (`0b5f723`).
  - `crm-leads-capture.md` (aprobada; F1–F2 en el mismo PR #12): origen `web_form`, migración `drizzle/0004_fluffy_prodigy.sql`, evento `lead.created` con payload `{ "source": <origen> }` y lectura del lead para n8n.
  - `docs/strategy/commercial-strategy.md` (§3 canales, §4 ficha y reglas de traspaso, §8 medición y §11 brecha 1): de ahí salen los canales y la regla "origen desconocido se pregunta o se marca desconocido".
- **Requisito previo:** PR #12 integrado en `main`. Esta spec no se implementa sobre `main` actual: depende de pantallas y de la migración `0004` que solo existen en ese PR.

## Objetivo
La estrategia comercial mide conversaciones, reservas y pagos **por canal**, pero el CRM solo distingue tres orígenes (`whatsapp`, `web_form`, `other`). Hoy un contacto de una feria, de un club o de Instagram queda como "Otro" y no se puede contar.

Esta spec permite al comercial (`commercial` o `admin`):
- registrar el **canal real** por el que llegó cada lead, o marcarlo como **desconocido** cuando no se sabe;
- añadir un **detalle del origen** (nombre del evento, del aliado o de la campaña);
- **corregir el origen** después del alta (por ejemplo, de "Desconocido" a "Feria") dejando constancia en el historial, de modo que el origen inicial no se pierde;
- **filtrar la lista y el embudo por origen**, para ver cuántos leads de cada canal hay en cada etapa.

## Alcance
- Incluye:
  - (F1) Nuevos valores del enum `lead_source`, columna `leads.source_detail`, nuevo tipo de actividad `source_changed` con columnas `source_from`/`source_to`, en una migración `drizzle/0005_*.sql` aplicada a mano en dos bloques. Schemas, etiquetas, service (alta, cambio de origen y filtro) y parámetro `origen` de la URL, con tests. README.
  - (F2) Pantallas: el alta manual ofrece todos los orígenes manuales y el detalle; la ficha muestra el detalle y permite cambiar el origen; el historial muestra el cambio; la lista tiene el filtro "Origen" y el embudo lo respeta.
- No incluye:
  - Cambios en la landing o en el formulario web (por ejemplo, "¿Cómo nos conociste?" o parámetros UTM): irán en una spec de la landing. Los leads web siguen naciendo con `web_form`.
  - **Puntos de contacto posteriores** (varios canales por lead) ni atribución multicanal: se registran como notas del historial. Un lead tiene un solo origen.
  - Distinguir pauta pagada de contenido orgánico con un campo propio: se anota en el detalle (Pregunta abierta 2).
  - Paneles, métricas, conversiones por cohorte, costos o exportación.
  - Vínculo lead ↔ reserva (Decisión 19 de `runner-portal.md`).
  - Cambios en el contrato de la API para n8n más allá de admitir los nuevos valores de `source` (el detalle no se expone).
  - Detección de duplicados, cambios en etapas, responsable, próxima acción o archivo.

## Requisitos
1. **Orígenes** (valor → etiqueta), en este orden en formularios, filtros y listas:

   | Valor | Etiqueta | Canal de la estrategia (§3) |
   |---|---|---|
   | `event` | Feria, carrera o activación | Ferias, carreras y activaciones |
   | `partner` | Club, gimnasio o aliado | Clubes y gimnasios |
   | `referral` | Referido | Referidos |
   | `whatsapp` | WhatsApp (mensaje directo) | WhatsApp comercial (valor existente; cambia solo la etiqueta) |
   | `whatsapp_status` | Estado de WhatsApp | Estados y videos de WhatsApp |
   | `instagram` | Instagram | Instagram |
   | `facebook` | Facebook | Facebook |
   | `tiktok` | TikTok | TikTok |
   | `youtube` | YouTube | YouTube |
   | `google_ads` | Google Ads | Google Ads |
   | `luma` | Luma | Luma |
   | `web_form` | Formulario web | Web (solo captura automática) |
   | `other` | Otro | Cualquier otro canal identificado |
   | `unknown` | Desconocido | Origen no identificado (§4) |

   - `web_form` lo asigna solo la captura automática: el alta manual nunca lo ofrece ni lo acepta, y el cambio de origen nunca lo ofrece como destino (Requisito 4).
   - Los leads existentes conservan su valor; no hay migración de datos.
2. **Alta manual:** el origen es obligatorio y **no tiene valor por defecto** (el selector arranca en "Elige el origen"), para no registrar WhatsApp por inercia. Si el comercial no lo sabe, elige "Desconocido".
3. **Detalle del origen** (`source_detail`): opcional, 2–120 caracteres tras recortar; vacío = `null`. Sirve para el nombre del evento, del aliado, de la campaña o de la pieza. Se puede indicar en el alta y al cambiar el origen. El formulario muestra la ayuda: "Nombre del evento, aliado o campaña. No escribas datos personales de otras personas."
4. **Cambio de origen** (ficha, lead no archivado):
   - Lead con origen manual: se puede elegir cualquier origen manual (Requisito 1) y editar el detalle.
   - Lead `web_form`: el origen no cambia; solo se puede editar el detalle (por ejemplo, "Dijo que nos vio en Instagram"). El formulario envía siempre el origen: en un lead `web_form`, `web_form` como valor fijo.
   - El schema del cambio acepta los 14 orígenes; la regla la aplica el service: pasar un lead manual a `web_form`, o un lead `web_form` a otro origen, devuelve `"source_locked"` sin escribir nada.
   - Si el origen cambia, se registra en la misma escritura atómica una actividad `source_changed` con `source_from`, `source_to` y el autor de la sesión. Si solo cambia el detalle, no se registra actividad (igual que los datos de contacto en `crm-leads-pipeline.md`).
   - Enviar el mismo origen y el mismo detalle no escribe nada y no es un error.
   - Un lead archivado no se modifica (`"archived"`).
5. **Historial:** `source_changed` se muestra como "Cambió el origen: Desconocido → Feria, carrera o activación". No lleva texto. El origen inicial se deduce del primer cambio o, si no hay ninguno, es el actual.
6. **Ficha:** "Origen" muestra la etiqueta y, si existe, el detalle ("Feria, carrera o activación · Maratón de Lima 2026").
7. **Lista y embudo:** nuevo filtro "Origen" (todos o uno de los 14 valores) en la URL como `origen=<valor>`. Un valor inválido o repetido se ignora (sin filtro). Se combina con etapa, responsable y seguimiento. Los contadores del embudo respetan el filtro de origen, igual que el de responsable. La columna "Origen" de la tabla muestra la etiqueta, sin el detalle.
8. **Permisos:** todo exige `leads.manage` (`getCrmAccess` en páginas, `requirePermission` en acciones). El autor es siempre el usuario de la sesión, nunca un campo del formulario.
9. **Privacidad:** el detalle no llega a logs, a `Error.message` ni a respuestas de error; no se expone a n8n ni a Gemini. Los mensajes de validación no repiten lo escrito.
10. **n8n:** el payload de `lead.created` (`{ "source": <origen> }`, `payload_version` 1) y `GET /api/integrations/n8n/leads/<id>` (`source`) admiten los nuevos valores. Es un cambio aditivo: el aviso por correo sigue reservado a `web_form` y el resto de valores se tratan como alta manual.

## Criterios de aceptación

Fase 1 (datos, service y URL):
- [ ] (F1) Dado el schema nuevo, cuando ejecuto `npm run db:generate` sin credenciales, entonces se genera solo `drizzle/0005_*.sql` (más snapshot y journal) con: los 11 valores nuevos de `lead_source` (`event`, `partner`, `referral`, `whatsapp_status`, `instagram`, `facebook`, `tiktok`, `youtube`, `google_ads`, `luma`, `unknown`), el valor `source_changed` de `lead_activity_type`, la columna `leads.source_detail` con su CHECK, las columnas `lead_activities.source_from`/`source_to` y el CHECK `lead_activities_source_chk`. El SQL no contiene `neon_auth`, `DROP TABLE`, `CREATE SCHEMA` ni cambios en otras tablas.
- [ ] (F1, manual del usuario, en una rama de desarrollo de Neon) Dada `0005` aplicada en dos bloques después de `0004`, cuando inserto filas de prueba, entonces la base rechaza: `source_detail` de 1 o de 121 caracteres; una actividad `source_changed` sin `source_from` o `source_to`, o con ambos iguales; `source_from`/`source_to` en una actividad de otro tipo; una `source_changed` con texto o sin autor.
- [ ] (F1) Dado `leadSourceSchema`, entonces tiene los 14 valores en el orden del Requisito 1 y coincide con `leadSourceEnum.enumValues` (como conjunto); `manualLeadSourceSchema` son los mismos sin `web_form`; `LEAD_SOURCE_LABELS` tiene una etiqueta por valor (unit test).
- [ ] (F1) Dado `createLeadSchema`, entonces exige `source` (sin él → "Elige el origen del lead."), rechaza `web_form`, acepta `unknown` y normaliza `sourceDetail` (recorta; vacío → `null`; 1 o 121 caracteres → error en su campo) (unit test).
- [ ] (F1) Dado `leadSourceChangeSchema` con `{ leadId, source, sourceDetail }`, entonces acepta los 14 orígenes (incluido `web_form`; la regla la aplica el service), valida `sourceDetail` como el alta, exige `source` ("Elige el origen del lead.") y descarta claves extra (`actorUserId`, `stage`) (unit test).
- [ ] (F1) Dado `createLead` con la base simulada, entonces inserta `source_detail` y el payload del evento `lead.created` sigue siendo solo `{ source }` (unit test).
- [ ] (F1) Dado `changeLeadSource` con la base simulada, entonces en **una sola sentencia** (CTE):
  - lead manual, origen distinto → actualiza origen y detalle, inserta `source_changed` con `source_from`/`source_to` y autor, y devuelve `"updated"`;
  - solo cambia el detalle → actualiza el detalle sin actividad y devuelve `"updated"`;
  - mismo origen y detalle → no escribe y devuelve `"unchanged"`;
  - lead `web_form` con otro origen → `"source_locked"`; con el mismo origen y otro detalle → `"updated"` sin actividad;
  - lead manual con destino `web_form` → `"source_locked"`;
  - lead archivado → `"archived"`; id inexistente → `"not_found"` (unit test).
- [ ] (F1) Dado `getLeadList` con `source`, entonces filtra la lista y los contadores del embudo por origen, combinado con los demás filtros, sin cambiar el número de consultas (un solo `db.batch`) (unit test).
- [ ] (F1) Dado `parseLeadListQuery`, entonces `origen=instagram` → `source: "instagram"`; `origen=foo` u `origen` repetido → sin filtro; `leadListHref` emite `origen` y lo conserva al cambiar de página o de otro filtro (unit test).
- [ ] (F1) Dado el README, entonces documenta aplicar `0005` después de `0004` en **dos bloques**: (1) solo los `ALTER TYPE … ADD VALUE`, confirmados; (2) el resto entre `BEGIN;` y `COMMIT;`, sin GRANT ni reaplicar migraciones; y la lista de orígenes con su significado.
- [ ] (F1) `npm run lint`, `npx vitest run` y `npm run build` sin errores. Tamaño del Worker medido y registrado.

Fase 2 (pantallas):
- [ ] (F2) Dado un `commercial` en `/crm/leads/nuevo`, entonces "Origen *" arranca en "Elige el origen", lista los 13 orígenes manuales en el orden del Requisito 1 y debajo está "Detalle del origen" con su ayuda. Sin elegir origen, ve "Elige el origen del lead." y lo escrito se conserva.
- [ ] (F2) Dado un lead con origen y detalle, cuando abro su ficha, entonces "Origen" muestra "Etiqueta · detalle" (o solo la etiqueta sin detalle).
- [ ] (F2) Dado un lead manual no archivado, cuando cambio el origen en la ficha, entonces la ficha muestra el nuevo origen y el historial "Cambió el origen: <anterior> → <nuevo>" con mi email y la fecha. Si solo cambio el detalle, el historial no cambia.
- [ ] (F2) Dado un lead `web_form`, entonces el formulario de cambio muestra el origen como texto fijo (y lo envía como `web_form` en un campo oculto) y solo permite editar el detalle; al guardar un detalle nuevo, la ficha lo muestra y el historial no cambia.
- [ ] (F2) Dado un lead manual, entonces el selector del formulario de cambio ofrece solo los 13 orígenes manuales.
- [ ] (F2) Dado un lead archivado, entonces la ficha no muestra el formulario de cambio de origen.
- [ ] (F2) Dado `/crm/leads?origen=event`, entonces el filtro "Origen" muestra "Feria, carrera o activación", la lista y los contadores del embudo solo cuentan esos leads, y al cambiar de etapa o de página se conserva `origen`.
- [ ] (F2) Dada la acción de cambio de origen llamada sin sesión o sin `leads.manage`, entonces devuelve `unauthorized` o `forbidden` y no llama al service (unit test).
- [ ] (F2) `npm run lint`, `npx vitest run` y `npm run build` sin errores. Tamaño del Worker medido y registrado.

## Diseño técnico
- **Rutas (app/):** sin rutas nuevas. `/crm/leads` lee `origen`; `/crm/leads/nuevo` y `/crm/leads/<id>` usan los componentes ampliados.
- **Datos (`lib/db-schema.ts`):**
  - `leadSourceEnum`: los 14 valores. En PostgreSQL los valores nuevos se añaden con `ADD VALUE`; el orden de la interfaz no depende del orden del enum en la base, sino de `leadSourceSchema`.
  - `leads.source_detail text NULL`, CHECK `leads_source_detail_chk`: `source_detail IS NULL OR char_length(source_detail) BETWEEN 2 AND 120`.
  - `leadActivityTypeEnum` + `source_changed`.
  - `lead_activities.source_from` y `source_to` (`lead_source`, nulos), CHECK `lead_activities_source_chk`: `CASE WHEN type = 'source_changed' THEN source_from IS NOT NULL AND source_to IS NOT NULL AND source_from <> source_to ELSE source_from IS NULL AND source_to IS NULL END`. El CHECK de texto existente ya prohíbe `body` en este tipo (rama `ELSE`) y `lead_activities_actor_chk` ya exige autor.
- **Migración `0005` en dos bloques:** PostgreSQL no permite usar en la misma transacción un valor de enum recién añadido, y el CHECK nuevo menciona `'source_changed'`. Bloque 1: los `ALTER TYPE … ADD VALUE` solos. Bloque 2: columnas y CHECK entre `BEGIN;` y `COMMIT;`. Orden global: `0001` → `0002` → `0003` → `0004` → `0005`.
- **Schemas (`modules/crm/schemas/leads.schema.ts`):** `leadSourceSchema` (14), `manualLeadSourceSchema` (derivado sin `web_form`), `sourceDetailSchema` compartido, `createLeadSchema` + `sourceDetail`, `leadSourceChangeSchema` (con `leadSourceSchema` completo: la regla de `web_form` vive en el service), `leadListQuerySchema` + `origen` con `.catch(undefined)`.
- **Tipos:** `LeadSource` sigue derivado del schema; `LeadListFilters.source?: LeadSource`; la fila de lista y la ficha incluyen `sourceDetail`; la actividad incluye `sourceFrom`/`sourceTo`.
- **Service (`modules/crm/services/leads.service.ts`):** `createLead` inserta `source_detail`. Nuevo `changeLeadSource({ leadId, source, sourceDetail, actorUserId })` → `"updated" | "unchanged" | "source_locked" | "archived" | "not_found"`, una sola sentencia CTE que decide por su `WHERE` (lead existente, no archivado, valores distintos; `web_form` ↔ origen manual nunca se permite en ningún sentido), como `changeLeadStage`. `getLeadList` añade `source` a la condición común de lista y embudo. La lectura del historial (`modules/crm/services/activities.service.ts`) devuelve `sourceFrom`/`sourceTo`.
- **Actions (`modules/crm/actions/leads.actions.ts`):** `changeLeadSourceAction` con `requirePermission("leads.manage")`, `leadSourceChangeSchema`, `revalidatePath` de la ficha y la lista, y error de texto fijo.
- **Componentes:**
  - `LeadForm`: selector sin valor por defecto con `manualLeadSourceSchema.options` y campo "Detalle del origen" (solo en el alta).
  - Nuevo `LeadSourceForm` (cliente, en la ficha, junto a `LeadOwnerForm` y con su mismo patrón): `NativeSelect` + `Input` + botón "Guardar origen"; en leads `web_form`, origen como texto fijo más un `<input type="hidden" name="source" value="web_form">`; en leads manuales, el selector ofrece `manualLeadSourceSchema.options`.
  - `LeadDetails`: "Etiqueta · detalle".
  - `LeadTimeline`: texto de `source_changed`.
  - `LeadFilters`: `NativeSelect` "Origen" con "Todos" + 14 valores.
- **Utils:** `leadDisplay.ts` (etiquetas y `leadSourceLabel(source, detail)`), `leadListQuery.ts` (`QUERY_KEYS.source = "origen"`).
- **Contrato con n8n:** sin cambios de forma. `LeadSource` en `modules/integrations/types` ya deriva de `leadSourceEnum`, así que admite los valores nuevos sin tocar código. `sourceDetail` no se expone.

## Reutilización
- Patrones de `crm-leads-pipeline.md`: CTE atómica que decide por `WHERE` (`changeLeadStage`, `changeLeadOwner`), actividad tipada por columnas, `LeadOwnerForm` como modelo de formulario en la ficha, `QUERY_KEYS` y `leadListHref` para la URL.
- shadcn ya instalados: `NativeSelect`, `Input`, `Label`, `Button`, `Badge`. No se añade ningún componente.
- `requirePermission`, `getCrmAccess` y `revalidatePath` existentes.

## Tests
- `leads.schema.test.ts`: orígenes y su coincidencia con el enum de la base, `manualLeadSourceSchema`, `sourceDetail`, `leadSourceChangeSchema`, `origen` en la query.
- `leadDisplay.test.ts`: etiquetas de los 14 valores y `leadSourceLabel` con y sin detalle.
- `leads.service.test.ts`: `createLead` con detalle y payload sin cambios; los cinco resultados de `changeLeadSource`; `getLeadList` con `source` en lista y embudo.
- `activities.service.test.ts`: una actividad `source_changed` se devuelve con `sourceFrom`/`sourceTo`.
- `leadListQuery.test.ts`: `origen` válido, inválido, repetido y conservado en `leadListHref`.
- `leads.actions.test.ts`: `changeLeadSourceAction` sin sesión, sin permiso y con claves extra.

## Plan de tareas
### Fase 1
- [x] T1 — Schema de la base y migración `0005` generada con `npm run db:generate` · archivos: `lib/db-schema.ts`, `drizzle/0005_*.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json` · depende de: PR #12 en `main` · secuencial (base)
- [x] T2 — Schemas zod, tipos y etiquetas · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts`, `modules/crm/types/leads.types.ts`, `modules/crm/utils/leadDisplay.ts`, `modules/crm/utils/leadDisplay.test.ts` · depende de: T1 · secuencial
- [x] T3 — Service: `createLead` con detalle, `changeLeadSource`, filtro en `getLeadList` y `source_changed` en la lectura del historial · archivos: `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts`, `modules/crm/services/activities.service.ts`, `modules/crm/services/activities.service.test.ts` · depende de: T2 · paralelo (con T4 y T5)
- [x] T4 — Parámetro `origen` en la URL · archivos: `modules/crm/utils/leadListQuery.ts`, `modules/crm/utils/leadListQuery.test.ts` · depende de: T2 · paralelo (con T3 y T5)
- [x] T5 — README: migración `0005` en dos bloques y lista de orígenes · archivos: `README.md` · depende de: T1 · paralelo (con T3 y T4)
- [x] T6 — (enmienda) `leadSourceChangeSchema` acepta los 14 orígenes y sus tests · archivos: `modules/crm/schemas/leads.schema.ts`, `modules/crm/schemas/leads.schema.test.ts` · depende de: T2 · paralelo (con T3, T4 y T5)

### Fase 2
- [ ] T1 — Acción `changeLeadSourceAction` y alta con detalle · archivos: `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts`, `modules/crm/index.ts` · depende de: Fase 1 · secuencial (base)
- [ ] T2 — Alta manual: selector sin valor por defecto y detalle · archivos: `modules/crm/components/LeadForm.tsx` · depende de: T1 · paralelo (con T3 y T4)
- [ ] T3 — Ficha: `LeadSourceForm`, detalle en `LeadDetails` e historial · archivos: `modules/crm/components/LeadSourceForm.tsx`, `modules/crm/components/LeadDetails.tsx`, `modules/crm/components/LeadTimeline.tsx`, `app/crm/(protected)/leads/[id]/page.tsx` · depende de: T1 · paralelo (con T2 y T4)
- [ ] T4 — Lista: filtro "Origen" · archivos: `modules/crm/components/LeadFilters.tsx`, `app/crm/(protected)/leads/page.tsx` · depende de: T1 · paralelo (con T2 y T3)

## Cambios que requiere en otras specs
- `crm-leads-capture.md`: el tipo del payload `lead.created` y de `source` en la lectura para n8n pasa de `"web_form" | "whatsapp" | "other"` a los 14 valores del Requisito 1, sin cambiar `payload_version`. Hay que enmendarla (y volver a aprobarla) antes de implementar la F1 de esta spec, o aceptar esta spec como enmienda explícita. El flujo de n8n debe tratar cualquier origen distinto de `web_form` como alta manual.

## Preguntas abiertas
1. **Lista de canales:** ¿se quedan los 14 valores del Requisito 1? En particular: ¿"Comunidad" necesita valor propio o basta "Otro" con detalle? ¿Clubes y gimnasios separados de otros aliados?
2. **Pauta pagada:** ¿basta anotar "pauta" en el detalle, o se necesita un campo propio (pagado/orgánico) para calcular el costo por cliente del §8 de la estrategia?
3. **Cambio de origen sin restricciones:** ¿cualquier comercial puede cambiar el origen de cualquier lead (como la etapa y el responsable), o solo el responsable del lead o un `admin`?
