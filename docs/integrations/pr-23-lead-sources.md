# PR #23: conciliación de orígenes de leads

Fecha: 29 de octubre de 2026. La inspección inicial fue de solo lectura. La conciliación posterior conserva el árbol funcional de main y añade este informe; su validación se registra al final.

## Veredicto

El objetivo de negocio del PR #23 ya está implementado en main mediante el modelo posterior `source` + `channel`. No se identificó ninguna brecha funcional vigente que requiera traer el código del PR. Su spec fue sustituida explícitamente por decisión del usuario en la spec aprobada `crm-journey-automation.md`.

Referencias verificadas:

- `origin/pr-23`: `7c0951e31ee0943485e41abfbcc226904d3827c5`.
- `origin/main` al terminar la inspección: `4863229c87cd56eb44fd36075893e18c35c922cc`.
- El checkout inspeccionado inicialmente era `833ff80`; el avance de main solo modifica `wrangler.jsonc` y no cambia la conclusión sobre leads.

## Precedencia explícita

`docs/specs/crm-journey-automation.md:494` declara sobre `crm-lead-sources.md`:

> No pueden convivir. [...] Sustituida por esta spec (decisión del usuario, 2026-10-25): no se implementa ni se integra en main.

La decisión se repite en `:546` y `:600`. La Decisión 6 (`:225`) adopta expresamente los catorce canales, orden, etiquetas, selector sin valor por defecto, detalle de 2–120, historial y filtro que respeta el embudo. El mecanismo `web_form` deja de ser canal y se mantiene como vía de entrada; su canal equivalente es `web`.

## Cobertura actual

| Requisito del PR #23 | Implementación vigente | Evidencia de tests existentes |
| --- | --- | --- |
| Catálogo de canales y enum/schema sincronizados | `lib/db-schema.ts:193`; `modules/crm/schemas/leads.schema.ts:9` y `:12` | `modules/crm/schemas/leads.schema.test.ts:82`, catálogo ordenado de 14 orígenes y sincronía con enums. |
| Alta sin origen por defecto; desconocido explícito | `modules/crm/components/LeadForm.tsx:154`, placeholder `Elige el origen`; `createLeadSchema` requiere `channel` | `modules/crm/actions/leads.actions.test.ts:160`, sin origen conserva valores y devuelve el error esperado. |
| Detalle opcional recortado, vacío null, longitud 2–120 | `modules/crm/schemas/leads.schema.ts:72` y `:80`; CHECK `lib/db-schema.ts:522`; formulario `LeadForm.tsx:164` | `modules/crm/schemas/leads.schema.test.ts:310`, normalización y casos de longitud en el mismo bloque. |
| Autor procedente de sesión, permiso leads.manage y descarte de claves extra | `modules/crm/actions/leads.actions.ts:91` y `:144`; schema de edición omite source, actor, owner, stage y UTM | `modules/crm/actions/leads.actions.test.ts:310` y `:373`; `modules/crm/schemas/leads.schema.test.ts:555`. |
| Cambio atómico y trazabilidad | `modules/crm/services/leads.service.ts:292`, CTE con bloqueo de fila; actividad `channel_changed` únicamente si cambia el canal | `modules/crm/services/leads.service.test.ts:690`, `:714`, `:727`. |
| Fuente/vía original inmutable | Edición solo actualiza channel y datos permitidos | `modules/crm/services/leads.service.test.ts:749` comprueba que source, stage, owner y UTM nunca se escriben. |
| Historial con canal anterior, nuevo y autor | `modules/crm/services/activities.service.ts`; `modules/crm/components/LeadTimeline.tsx:30` | `modules/crm/services/activities.service.test.ts:144`; etiquetas en `modules/crm/utils/leadDisplay.test.ts:63`. |
| Detalle en la ficha | `modules/crm/components/LeadDetails.tsx:109` muestra vía y `:110` muestra canal con detalle | `modules/crm/utils/leadDisplay.test.ts:81`, con detalle y sin detalle. |
| Filtro de origen, lista y embudo | `modules/crm/components/LeadFilters.tsx:73`; `modules/crm/services/leads.service.ts:109` aplica byChannel a lista y counts | `modules/crm/services/leads.service.test.ts:148` y `:165`. |
| URL válida, inválida/repetida y persistencia de filtro al paginar o cambiar etapa | `modules/crm/utils/leadListQuery.ts:17`, `:64`, `:77`; `leads.schema.ts:225` | `modules/crm/utils/leadListQuery.test.ts:74` y `:153`; `leads.schema.test.ts:453`. |
| Archivado de solo lectura | Ruta `app/crm/(protected)/leads/[id]/editar/page.tsx` no muestra formulario; service usa archived_at IS NULL | `modules/crm/services/leads.service.test.ts:1048`; el resultado vigente es not_found. |
| Payload mínimo de alta | CTE de createLead mantiene `jsonb_build_object('source', source)` | `modules/crm/services/leads.service.test.ts:440`. |

La migración vigente que contiene estas capacidades es `drizzle/0006_flashy_bastion.sql`, no `0005_married_greymalkin.sql` del PR. Los CHECK de `origin_detail`, `channel_from`/`channel_to`, autor y cuerpo existen en el schema actual. No se justifican nuevas columnas `source_detail`, `source_from`/`source_to`, un nuevo evento `source_changed` ni otro `LeadSourceForm`.

## Diferencias deliberadas, no brechas

1. La vía `source` no cambia. El canal `channel` sí puede corregirse incluso para leads de formulario web. La spec vigente lo exige en `crm-journey-automation.md:54` y `:82`; `landing-omnichannel-capture.md:62` y `:157` reafirman que el equipo corrige el canal del lead web.
2. La edición se hace mediante `Editar datos`, junto con el contacto y otros datos de origen. No existe un formulario independiente de source en la ficha porque su contrato fue sustituido.
3. Editar únicamente el detalle no genera actividad; enviar los mismos datos puede actualizar updated_at. El antiguo retorno `unchanged` y su exigencia de cero escritura no forman parte del contrato posterior de updateLead y no deben recuperarse de manera aislada.
4. `originDetail` sí se expone a n8n en el contrato posterior: `crm-journey-automation.md:162` lo autoriza expresamente. `modules/integrations/services/integrationLeads.service.ts:36` lo selecciona. No se envía a Gemini; esa minimización sigue vigente. Aplicar el antiguo veto de #23 rompería el contrato aprobado posterior.
5. El aviso de alta también distingue Google Forms e importaciones conforme al modelo de automatización actual. El PR #23 no debe reducir el enum de source ni recuperar su contrato de tres/catorce fuentes.

## Estrategia de actualización de la rama

Es técnicamente razonable partir de main y realizar un merge con estrategia `ours` del head original de #23, conservando ambos ancestros y el árbol funcional actual. Esta recomendación se refiere al comando de estrategia `git merge -s ours`, no a `git merge -X ours`: este último también introduciría archivos sin conflicto como la migración antigua y LeadSourceForm.

Condiciones para hacerlo:

- Verificar de nuevo los heads remotos antes de actuar y determinar el nombre real de la rama del PR mediante Git si la API continúa bloqueada.
- Registrar en un documento de conciliación que el PR fue sustituido y listar la cobertura anterior. No afirmar que se incorporó una funcionalidad nueva ni que todas las verificaciones ya pasaron.
- Conservar la historia del PR y la decisión aprobada; no editar specs aprobadas, fabricar aprobaciones, copiar el ledger de una rama sobre otro ni introducir el SQL antiguo para aparentar actividad.
- Revisar el diff final respecto de main: debe contener solo la documentación de conciliación deliberada, sin regresiones en source/channel, schema, capture, Turnstile o n8n.
- Ejecutar las verificaciones relevantes de main sobre el resultado, y después la validación conjunta que corresponda a #22/configuración.
- Actualizar exclusivamente la rama de trabajo del PR mediante fast-forward si procede. El merge local no demuestra que GitHub haya fusionado o cerrado el PR; esos resultados deben verificarse por separado.

No se encontró motivo funcional para rechazar `merge -s ours` bajo esas condiciones: la propia spec vigente exige conservar su modelo y no integrar la alternativa histórica de #23. La limitación es operativa: el estado, base, checks, revisiones y eventual cierre del PR no se pueden dar por confirmados mientras la API de GitHub siga denegada.

Una alternativa es cerrar #23 como sustituido aportando esta evidencia. El plan del usuario tiene como salida PR actualizados y revisables; actualizar su rama con la conciliación conserva esa salida sin anticipar una fusión remota ni un cierre.

## Validación de la conciliación

Se ejecutó `npm test -- --run --maxWorkers=3 modules/crm modules/integrations modules/landing/hooks modules/landing/utils/inquiry.test.ts`: 25 archivos y 805 pruebas pasaron. La compilación de producción sigue pendiente de habilitar Google Fonts; no se utilizaron fuentes simuladas.
