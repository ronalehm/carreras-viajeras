# Embudo visual y correos automáticos por contacto

- Módulos: crm e integrations; datos compartidos en lib.
- Estado: borrador
- Solicitud: ver el paso real de cada contacto por las etapas y sus avisos; el usuario confirmó envíos automáticos al cliente por **correo electrónico**.
- Referencias: `crm-leads-pipeline.md`, `crm-journey-automation.md`, `crm-leads-capture.md`, `crm-admin-panel.md`, `docs/SETUP.md` y la habilidad instalada `apple-design`.

## Objetivo

Dar al equipo una vista operativa del embudo: dónde está cada contacto, qué ocurrió realmente, qué requiere atención y qué correos se han preparado o enviado. Mantener las funciones y permisos actuales, e incorporar el correo automático como un canal adicional. La integración actual de borradores de WhatsApp y avisos al equipo conserva su funcionamiento.

## Decisiones confirmadas y requisitos externos

1. Los mensajes automáticos se envían al **correo del cliente**, no únicamente al responsable comercial. No se añade envío automático por WhatsApp.
2. El usuario confirmó que ya dispone de **n8n con una cuenta de correo/SMTP**. Se reutiliza esa conexión mediante un flujo independiente; no se incorpora otro proveedor ni un SDK de correo a la aplicación.
3. El entorno no tiene bindings de mensajería presentes. La activación requiere una credencial SMTP guardada en n8n, un remitente autorizado y el token privado de la integración, suministrados mediante configuración segura. Nunca se piden sus valores en el chat ni se guardan en el repositorio.
4. El envío parte **desactivado** y requiere una fecha explícita de inicio. No se procesa automáticamente la cola histórica anterior a esa fecha ni las importaciones marcadas `bulk`.
5. La maquetación interactiva usa datos y estados de entrega simulados. No constituye una integración operativa ni ha enviado correos reales.

## Alcance

Incluye tres fases revisables: embudo y alertas reales; procesamiento de correos e historial duradero; conexión de los estados reales al panel y reintento controlado. No hay cambios de permisos, campañas masivas, promociones, automatización por WhatsApp, envíos de IA sin revisar, seguimiento de aperturas/clics ni migraciones o despliegues remotos automáticos.

El registro de un lead o el cambio de etapa desencadena como máximo un mensaje lógico de esa etapa, sujeto a elegibilidad y deduplicación. Los avisos de seguimiento vencido son internos; no se inventa una cadencia nueva de correos repetidos por inactividad.

## Requisitos

### 1. Embudo operativo

- `/crm/leads` incorpora vistas **Embudo** y **Lista**. Embudo es la vista inicial; `vista=lista` conserva la tabla y paginación actuales. Las URLs existentes siguen siendo válidas y los filtros se mantienen al cambiar de vista.
- El recorrido principal es **Nuevo → Contactado → Cotizado → Reservado → Pagado**. **Perdido** es una salida posible desde cualquier etapa y se presenta aparte; no se dibuja como un paso posterior a Pagado.
- Cada columna muestra el total real de la etapa y una muestra limitada de contactos. La lectura obtiene hasta 10 contactos por etapa, además de los totales completos y opciones de responsable, en consultas acotadas; no agrupa solamente la página global de 25 leads.
- Si hay más contactos, mostrar «Mostrando 10 de N» y un acceso a la lista completa de esa etapa. Una columna vacía explica su estado. Los conteos no se presentan como conversiones ni como volumen que ya recorrió las etapas anteriores.
- Conservar filtros de responsable, seguimiento y origen. La selección de etapa enfoca la columna correspondiente; los totales conservan la semántica de los filtros comunes. Archivados se muestran en lista y siguen siendo de solo lectura.
- Cada tarjeta muestra nombre, viaje/interés, responsable, próxima acción y avisos pertinentes. Abre la ficha del contacto para consultar o actualizar su seguimiento. La maqueta usa un panel lateral para explorar este contenido; la primera fase integra la ficha existente ampliada.

### 2. Recorrido real de cada contacto

- La ficha incluye una lectura visual de la etapa actual y de los cambios registrados, con origen, destino, fecha y autor.
- Marcar como «Visitada» una etapa solamente si aparece en las actividades reales; las etapas sin evidencia se muestran como «Sin registro». Estar en Reservado no acredita haber pasado por Contactado o Cotizado.
- Conservar saltos, correcciones y reaperturas: el modelo actual permite cualquier etapa → otra distinta. La vista refleja esos movimientos sin imponer una secuencia nueva.
- Reutilizar las acciones existentes de cambio de etapa, responsables, próximas acciones y seguimiento. Perdido continúa exigiendo un motivo; Pagado/Perdido eliminan la próxima acción, como ahora. Cambiar una etapa nunca quita la marca «Pidió no seguir».
- Los formularios y avisos deben anunciar éxito/error y mantener el foco; no desplazar una tarjeta de forma definitiva antes de confirmar el servidor.

### 3. Avisos y orientación

- Prioridad de lectura: **No contactar / archivado**, problemas del correo, seguimiento vencido, responsable ausente o sin acceso, acción para hoy, próxima acción no definida y correo no registrado.
- Los datos ausentes se distinguen de los errores. No sugerir retomar contacto si existe baja de contacto o el registro está archivado.
- Las alertas de fecha usan la fecha del CRM en `America/Lima`, sin inventar plazos de atención ni umbrales de inactividad.
- Las etapas abiertas sin próxima acción proponen programarla. Las etapas cerradas muestran su estado y contexto, sin un recordatorio comercial ficticio.
- «Qué sigue» es orientación por etapa, no una afirmación de que se haya enviado una propuesta, recibido un pago o confirmado una reserva. Los enlaces conducen a las funciones reales disponibles.

### 4. Correo automático

- La aplicación reutiliza como fuente los eventos duraderos `lead.created` y `lead.stage_changed`. El nuevo proceso los lee sin reclamarlos ni cambiar su estado: no roba eventos al consumidor existente de n8n.
- Un flujo de n8n, inactivo al importar, reclama mensajes mediante `POST /api/integrations/n8n/email/claim`. Usa la autenticación privada existente y un límite de lote acotado. La aplicación prepara los mensajes; n8n recibe únicamente los datos necesarios para enviar cada uno mediante su nodo SMTP.
- Inmediatamente antes del nodo SMTP, n8n solicita autorización de ese intento mediante `POST /api/integrations/n8n/email/[id]/authorize`. Comprobar configuración activa, fecha de corte, lease vigente, evento vigente, etapa actual, correo válido, registro no archivado y ausencia de baja de contacto. Los eventos sustituidos por un cambio posterior se omiten, incluso si el contacto vuelve a una etapa anterior. La autorización no puede retirar un mensaje que SMTP ya haya aceptado; se documenta ese límite.
- Los mensajes y destinatarios se resuelven en el servidor. La petición del procesador no acepta destinatarios, etapas, remitentes o cuerpos arbitrarios.
- Mantener un registro duradero por mensaje, asociado al evento y al contacto, con etapa, versión de plantilla, destinatario y contenido enviados, estado, identificador SMTP cuando exista, ejecución de n8n y fechas. Conservar el contexto histórico aunque el contacto cambie después.
- Utilizar un registro único por evento, leases y tokens de intento. Las reclamaciones concurrentes y los callbacks duplicados no deben iniciar un segundo mensaje lógico del mismo evento. Una reclamación que expire antes de autorizar el envío puede volver a pendiente; si ya fue autorizada y no hay resultado concluyente, pasa a «Por confirmar».
- El nodo SMTP no tiene reintentos automáticos. SMTP no garantiza idempotencia: ni un identificador de mensaje estable ni repetir una ejecución aseguran evitar duplicados. Una interrupción o respuesta ambigua requiere revisar la ejecución de n8n antes de resolver el resultado; no se reenvía a ciegas. Los callbacks HTTP sí pueden reintentarse con el mismo token, sin volver a ejecutar SMTP.
- Los fallos confirmados antes de enviar pueden reintentarse de forma acotada y con nueva comprobación de elegibilidad. Los fallos SMTP ambiguos, destinatarios ausentes y bloqueos generan avisos comprensibles; no bucles de envío. El callback de fallo distingue un fallo previo al nodo de un resultado SMTP incierto, y aplica la clasificación conservadora por defecto.

### 5. Estados reales y reintento

- **Pendiente:** mensaje registrado que aún no se envía.
- **En proceso:** intento reclamado y vigente.
- **Enviado:** n8n confirma que SMTP aceptó el mensaje; no significa entrega al destinatario.
- No se muestra **Entregado** con esta integración: SMTP básico no proporciona una confirmación de entrega verificable. Incorporar recibos del proveedor requeriría un contrato adicional, fuera de esta primera versión.
- **Con error:** fallo conocido, con motivo fijo y comprensible.
- **Omitido/cancelado:** no corresponde enviarlo por baja, archivo, evento obsoleto, importación histórica o datos insuficientes.
- **Por confirmar:** el resultado del intento no es concluyente; no se muestra como enviado ni se reenvía a ciegas.
- Las rutas privadas `ack` y `fail` exigen el token de integración y el token vigente del intento. Ignorar callbacks duplicados y rechazar resultados de intentos antiguos; un fallo tardío no hace retroceder un mensaje ya aceptado. Registrar el ID de ejecución de n8n para revisar casos inciertos. No exponer un webhook público de proveedor que esta conexión no ofrece.
- La ficha muestra cada mensaje con su etapa original, destinatario, contenido, fecha y resultado. Una tarjeta del embudo no atribuye a su etapa actual un correo antiguo de otra etapa.
- «Reintentar» exige `leads.manage`, vuelve a comprobar elegibilidad y etapa vigente, y solo admite fallos confirmados anteriores al envío. El servidor obtiene contacto y mensaje desde el ID; no confía en campos ocultos que intenten cambiar destinatario o contenido. Los estados «Enviado» y «Por confirmar» no ofrecen reenvío.

## Textos iniciales para revisión

Las variables son nombre de pila y contexto del viaje; no se inventan precios, pagos, plazos o servicios confirmados. Las versiones de plantilla quedan registradas con el mensaje.

| Etapa | Texto propuesto |
| --- | --- |
| Nuevo | «Hola {nombre}, gracias por tu interés en Carreras Viajeras. ¿Qué te gustaría conocer sobre tu próximo viaje? Puedes responder este correo.» |
| Contactado | «Hola {nombre}, queremos ayudarte a organizar tu próxima carrera. ¿Qué información necesitas para avanzar?» |
| Cotizado | «Hola {nombre}, ¿te gustaría que revisemos juntos la propuesta de tu viaje? Puedes responder este correo con tus dudas.» |
| Reservado | «Hola {nombre}, estamos a tu disposición para coordinar los siguientes pasos de tu viaje.» |
| Pagado | «Hola {nombre}, gracias por tu confianza en Carreras Viajeras. Puedes responder este correo si necesitas ayuda con las coordinaciones de tu viaje.» |
| Perdido | «Hola {nombre}, gracias por tu interés en Carreras Viajeras. Si tienes alguna consulta pendiente, puedes responder este correo.» |

Perdido no habilita un correo cuando existe una baja de contacto. Las plantillas automáticas son fijas y revisadas; la integración actual de borradores con Gemini para revisión humana no se convierte automáticamente en contenido enviado al cliente.

## Diseño técnico

- Conservar `leads.manage` en página, lectura de ficha y acciones. El token de n8n no concede acceso al CRM.
- Reutilizar `getLeadList`, filtros de propietario/seguimiento/origen, etiquetas de etapas, fechas, guardas y acciones. Añadir `getLeadPipeline` al servicio del dominio, con tipos propios para columnas y campos de alertas.
- Vista por GET con `vista=lista`; el valor por defecto se omite. Preservar vista en filtros, enlaces y paginación. Las estadísticas del Dashboard siguen siendo por cohorte; el tablero identifica su población y filtros y no mezcla ambas bases.
- Componentes nuevos: `LeadPipeline` (tablero), `LeadJourney` (recorrido y avisos) y, al conectar el registro de envíos, `LeadMessages`. Preferir presentación en servidor y mantener solo la interacción que lo necesita en cliente.
- Añadir una tabla de mensajes con datos del intento y la ejecución a `lib/db-schema.ts` y generar la siguiente migración disponible con Drizzle; revisarla sin aplicarla automáticamente a ninguna base remota.
- El build y el CRM sin correo configurado no deben exigir credenciales SMTP. Estas permanecen en n8n; la aplicación no abre conexiones SMTP ni añade un SDK de proveedor.
- La configuración de la aplicación utiliza `N8N_API_TOKEN`, `CRM_EMAIL_FROM`, un interruptor `CRM_EMAIL_AUTOMATION_ENABLED` inicialmente apagado y una fecha de inicio `CRM_EMAIL_AUTOMATION_START_AT`. n8n referencia su credencial SMTP y el token privado mediante su almacén de credenciales. Las claves se introducen en configuración segura; las instrucciones guardadas contienen solo sus nombres.
- Usar la habilidad `apple-design`: feedback inmediato, navegación legible, estados sin depender solo del color, reflujo móvil, teclado/foco y preferencias de movimiento/transparencia/contraste. No añadir movimiento decorativo a conteos y datos de uso frecuente.

## Criterios de aceptación

- [ ] F1: un contacto se ve en su etapa real; los totales completos y el límite visible por columna se distinguen, incluso con más de 25 contactos en total.
- [ ] F1: se preservan los filtros y la vista Lista; Archivados sigue siendo de solo lectura.
- [ ] F1: una transición Nuevo → Reservado no marca Contactado/Cotizado como completados sin evidencia; correcciones y reaperturas se ven en el historial.
- [ ] F1: cambiar la etapa mediante la acción existente actualiza ficha y tablero; Perdido exige motivo y no desaparecen las bajas de contacto.
- [ ] F1: las alertas distinguen vencido, hoy, sin responsable, responsable sin acceso, correo ausente y falta de próxima acción. Un contacto con baja no recibe una recomendación de contacto.
- [ ] F2: al entrar en una etapa elegible después de activar el servicio, se registra y procesa un mensaje para el cliente con la plantilla de esa etapa.
- [ ] F2: no hay envíos con el servicio apagado, a importaciones históricas, a contactos archivados o con baja, sin email válido o desde eventos sustituidos. El consumidor actual del outbox conserva sus eventos.
- [ ] F2: concurrencia, reintentos y fallos de red no se traducen en un reenvío a ciegas. Los callbacks duplicados o de intentos antiguos no alteran incorrectamente el estado. Una ejecución SMTP interrumpida queda «Por confirmar».
- [ ] F3: cada cliente muestra contenido, etapa y resultado de sus correos reales; «Enviado» explica aceptación SMTP y no afirma entrega.
- [ ] F3: reintentar un fallo vuelve a comprobar permisos y elegibilidad; no reenvía mensajes aceptados, de etapas obsoletas o pendientes de confirmar.
- [ ] F1–F3: teclado, foco, móvil y movimiento reducido funcionan. Pasan tests pertinentes, lint y tipos; los builds e integraciones no ejecutados o bloqueados se reportan como tales.

## Tests

- Consultas: límites por etapa, conteos completos, aislamiento de filtros y archivados; contactos sin responsable/correo y baja de contacto.
- Guía y recorrido: prioridad de avisos, fecha de Lima, etapas abiertas/cerradas, saltos/reaperturas, historial incompleto y ausencia de transiciones inventadas.
- Componentes: selección de vista/etapa, enlaces a ficha, estados vacíos, errores, foco y actualización confirmada de etapa.
- Correo: configuración apagada o incompleta, corte de activación, eventos antiguos/bulk/obsoletos, idempotencia/concurrencia, fallos permanentes/transitorios/ambiguos y destinatarios derivados del servidor.
- Callbacks privados: autenticación, token vigente del intento, duplicados, orden inverso, lease expirado y resultados antiguos. Workflow: credenciales externas, nodo SMTP sin retry y separación entre reintentar callbacks y reenviar. No se contacta a clientes reales desde los tests.
- Acciones de reintento: autorización, IDs manipulados, baja/archivo, etapa antigua y estado que no admite reenvío.
- Validar en Neon `dev-test` y con destinatarios de prueba autorizados cuando existan los bindings. No describir mocks o la maqueta como pruebas de entrega real.

## Plan de tareas

### Fase 1 — Embudo, recorrido y avisos reales (5 tareas, 15 archivos)

- [ ] T1 — Contratos y API pública · `modules/crm/types/leads.types.ts`, `modules/crm/schemas/leads.schema.ts`, `modules/crm/index.ts` · depende de aprobación · secuencial.
- [ ] T2 — Lectura acotada del tablero · `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts` · depende de T1.
- [ ] T3 — Vista y filtros · `modules/crm/utils/leadListQuery.ts`, `modules/crm/utils/leadListQuery.test.ts`, `modules/crm/components/LeadFilters.tsx`, `modules/crm/components/LeadPipeline.tsx`, `app/crm/(protected)/leads/page.tsx` · depende de T1 y T2.
- [ ] T4 — Recorrido y orientación · `modules/crm/utils/leadGuidance.ts`, `modules/crm/utils/leadGuidance.test.ts`, `modules/crm/components/LeadJourney.tsx`, `app/crm/(protected)/leads/[id]/page.tsx` · depende de T1.
- [ ] T5 — Revisión integrada y componentes · `modules/crm/components/LeadPipeline.test.tsx` · depende de T2–T4 · validar navegador, permisos, filtros, fechas y acciones existentes.

### Fase 2 — Envío automático y registro duradero (5 tareas, ~15 archivos)

- [ ] T1 — Datos y migración revisable · `lib/db-schema.ts`, siguiente SQL de `drizzle/`, snapshot y journal · depende de F1; no aplicar remotamente.
- [ ] T2 — Configuración · `lib/env.ts`, `lib/env.test.ts` · depende de F2 T1 · validación condicional, desactivada por defecto y sin claves SMTP en la aplicación.
- [ ] T3 — Motor y contratos · `modules/integrations/schemas/email.schema.ts`, `modules/integrations/services/clientEmails.service.ts`, `modules/integrations/index.ts` · depende de F2 T1–T2 · registro por evento, elegibilidad, claims, autorización y resultados.
- [ ] T4 — Procesamiento y confirmaciones · `app/api/integrations/n8n/email/claim/route.ts`, `app/api/integrations/n8n/email/[id]/[operation]/route.ts`, `scripts/n8n/client-stage-email.json` · depende de F2 T3 · operaciones authorize/ack/fail con allowlist, flujo inactivo y separado del consumidor actual.
- [ ] T5 — Validación del motor · `modules/integrations/services/clientEmails.service.test.ts`, `modules/integrations/schemas/email.schema.test.ts`, `scripts/n8n/client-stage-email.test.ts` · depende de F2 T3–T4 · comprobar concurrencia, tokens, fallos y ausencia de envíos indebidos.

### Fase 3 — Mensajes y errores reales en el panel (5 tareas, ~15 archivos)

- [ ] T1 — Contratos y lectura · `modules/crm/types/leads.types.ts`, `modules/crm/services/leads.service.ts`, `modules/crm/services/leads.service.test.ts`, `modules/crm/services/leadMessages.service.ts`, `modules/crm/services/leadMessages.service.test.ts` · depende de F2.
- [ ] T2 — Acciones y orientación · `modules/crm/actions/leads.actions.ts`, `modules/crm/actions/leads.actions.test.ts`, `modules/crm/utils/leadGuidance.ts`, `modules/crm/utils/leadGuidance.test.ts` · depende de F3 T1 · reintento protegido y avisos específicos de entrega.
- [ ] T3 — Integración de UI · `modules/crm/index.ts`, `modules/crm/components/LeadMessages.tsx`, `modules/crm/components/LeadPipeline.tsx`, `app/crm/(protected)/leads/[id]/page.tsx` · depende de F3 T1–T2.
- [ ] T4 — Uso y activación · `README.md` · depende de F3 T3 · configuración segura, remitente, credencial SMTP de n8n, callbacks, resolución de resultados inciertos, pruebas y activación explícita.
- [ ] T5 — Revisión final · `modules/crm/components/LeadMessages.test.tsx` · depende de F3 T1–T4 · registrar pruebas pasadas, bloqueadas y pendientes; envío de prueba solo con destinatario autorizado.

## Estado del entorno

La rama actual es `feat/crm-visual-polish`; el panel anterior está publicado hasta `848d42d`. Faltan bindings utilizables de Neon y mensajería en esta máquina para pruebas autenticadas y de entrega. Los builds actuales están bloqueados por descargas de Google Fonts; el acceso a la API de GitHub también fue rechazado, aunque el acceso Git funciona. Estos bloqueos no autorizan a simular una entrega real ni a modificar producción.

La maquetación y esta spec son el resultado preparatorio; la implementación de las fases permanece pendiente de la aprobación requerida por `docs/SETUP.md`.
