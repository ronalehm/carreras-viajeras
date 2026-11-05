# WhatsApp Business Platform (Cloud API): precios y reglas para una empresa peruana que escribe a clientes peruanos (vigencia a 2026-11-05)

## 1. Modelo de precios vigente y tarifas de Perú por categoría (USD, fecha efectiva, moneda local)

### Nota metodológica (leer antes de usar cifras)
- Fecha de corte: 2026-11-05. En esta sesión no se pudo abrir ninguna página directamente (WebFetch bloqueado por red para developers.facebook.com, 360dialog.com, flowcall.co y wappbiz.com). Todo lo que sigue procede de resultados de WebSearch (fragmentos indexados y resumidos) de páginas oficiales de Meta y de terceros. **No se abrió el CSV/PDF oficial del rate card**: las cifras numéricas de Perú en USD que aparecen abajo están confirmadas por varias fuentes de terceros coherentes entre sí y por la mención oficial de Meta de que Perú tuvo un aumento en utilidad/autenticación el 2026-10-01, pero el número exacto no se leyó en el documento de Meta. Antes de publicar, verificar en el rate card descargable de https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.

### Takeaway
Rige el precio por mensaje entregado (desde 2025-07-01), con una actualización importante efectiva el **2026-10-01**: Perú pasó de USD 0,0200 a **USD 0,0300** en utilidad y autenticación (dato de terceros, coherente con la lista oficial de mercados afectados), marketing se mantiene en **USD 0,0703** (dato de terceros, no leído en el rate card oficial), y desde esa fecha los mensajes de servicio y las plantillas de utilidad dentro de la ventana de 24 h **dejaron de ser gratis**. Existe facturación en soles (PEN) desde 2026-04-01.

### Cited Findings
- Modelo: Meta factura por mensaje entregado desde el 1 de julio de 2025; la página de precios por conversación está marcada como "Deprecated" — [Meta: Conversation-based pricing (Deprecated)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing); [Twilio WhatsApp Pricing](https://www.twilio.com/en-us/whatsapp/pricing) (resumen de búsqueda: "Meta moved to per-message billing on July 1, 2025").
- La página oficial de precios de Meta indica que sus rate cards reflejan las tarifas y tramos de volumen vigentes **efectivos desde el 1 de octubre de 2026**; la página figuraba como actualizada el 30 de septiembre de 2026 — [Meta: Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- La tabla oficial de cambios de octubre de 2026 lista a **Perú con aumento en Utility y Authentication** efectivo el 2026-10-01 (junto con otros mercados) — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). (El indexador mostró metadatos de antigüedad inconsistentes para esta página; la fecha 2026-10-01 es la que aparece en el contenido.)
- Perú, utilidad y autenticación: de **USD 0,0200 a USD 0,0300** por mensaje desde 2026-10-01 (+50 %) — [Voltade: WhatsApp pricing from 1 October 2026, by market](https://voltade.com/learn/whatsapp/whatsapp-api-pricing-changes-october-2026); [360dialog blog: Service Message Charging Starts October 1, 2026](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/); [crmperu.pe: Precio WhatsApp API Perú 2026](https://www.crmperu.pe/precio-whatsapp-api-peru-2026/); [yavendio.com: Precio de WhatsApp API en Perú (2026)](https://yavendio.com/pe/blog/precio-whatsapp-api-peru). Fuentes de terceros, no el rate card oficial.
- Perú, marketing: **USD 0,0703** por mensaje entregado, sin cambio en la actualización de octubre de 2026 según terceros — [kemenystudio.com: WhatsApp Service Message Pricing 2026](https://kemenystudio.com/whatsapp-service-message-pricing); [contactship.ai: Precios de WhatsApp Business API en Perú (2026)](https://contactship.ai/blog/precios-whatsapp-business-api-peru-soles-2026); [crmperu.pe](https://www.crmperu.pe/precio-whatsapp-api-peru-2026/). Discrepancias: HighLevel lista USD 0,0738 (marketing) y USD 0,0210 (utilidad) para Perú con "Rate change 1 Oct 2026" — [HighLevel Support: WhatsApp Pricing, Billing & Rebilling Guide](https://help.gohighlevel.com/support/solutions/articles/155000001428-whatsapp-pricing-billing-and-rebilling-guide); otra página en español da USD 0,0900 para marketing en Perú (cifra que los resúmenes consideran desactualizada) — resultados de búsqueda sobre [evoltis.com](https://evoltis.com/precio-whatsapp-business-api/) / [dialecto.com](https://dialecto.com/blog/cuanto-cuesta-whatsapp-business-api/) (no se pudo atribuir con certeza a cuál de ellas).
- Perú, servicio (desde 2026-10-01): mismo precio que utilidad del mercado, **USD 0,03**, sin tramos de volumen y con 1.000 mensajes gratis al mes por número — [Meta: Upcoming pricing updates for Meta Business Agent, service and utility messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages) (regla general: "service message rates match the utility and authentication rates for each market"); cifra de Perú en [kemenystudio.com](https://kemenystudio.com/whatsapp-service-message-pricing) y [360dialog blog](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/).
- Perú figura como mercado propio en las tablas (no en "Rest of Latin America"): todas las fuentes anteriores lo listan por nombre, incluida la tabla oficial de cambios de octubre de 2026 — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- Authentication-international: Meta mantiene una página específica de tarifas de autenticación internacional — [Meta: Authentication-international rates](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates/). No se obtuvo si Perú tiene tarifa internacional distinta.
- Moneda local: el changelog de Meta registra, con fecha **2026-04-01**, la introducción de 8 nuevas monedas de facturación para mensajería y llamadas: AED, ARS, CLP, COP, MYR, **PEN**, SAR y SGD — [Meta: WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog); también [Meta: Calling API Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing). La página de precios menciona "16 currencies enabled" a 2026-07-01 — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- Cifras en soles reportadas por terceros como tomadas de la tabla PEN de Meta: utilidad **S/ 0,0998** y marketing **S/ 0,2339** por mensaje — resultados de búsqueda de [contactship.ai](https://contactship.ai/blog/precios-whatsapp-business-api-peru-soles-2026) / [yavendio.com](https://yavendio.com/pe/blog/precio-whatsapp-api-peru) (no se pudo leer el CSV PEN oficial). Otra fuente convierte USD a soles con tipo referencial S/ 3,40 (agosto de 2026) y afirma que Meta factura en dólares — [crmperu.pe](https://www.crmperu.pe/precio-whatsapp-api-peru-2026/) (contradice la existencia de facturación PEN; probablemente se refiere a la moneda por defecto).
- Topes de precio: Meta tiene en beta "Set a max price for marketing messages" — [Meta: Set a max price for marketing messages (BETA)](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/pricing/).

### Inferences
- Para cálculos a noviembre de 2026 en Perú: marketing USD 0,0703; utilidad USD 0,0300; autenticación USD 0,0300; servicio USD 0,0300 tras 1.000 gratis/mes/número. Cualquier presupuesto que use USD 0,02 para utilidad o "servicio gratis" está desactualizado (anterior al 2026-10-01).
- HighLevel (0,0738 / 0,0210) parece ser la tarifa anterior de Meta con un recargo de ~5 % (0,0703 × 1,05 ≈ 0,0738; 0,0200 × 1,05 = 0,0210): sería un precio de revendedor con la utilidad previa a octubre, no la tarifa oficial. Es una inferencia aritmética, no confirmada por HighLevel.
- Las cifras PEN implican un tipo de cambio interno ≈ 3,33 S/USD (0,2339/0,0703 ≈ 3,33; 0,0998/0,03 ≈ 3,33), coherente entre sí, lo que da cierta verosimilitud a que provengan de una misma tabla oficial.
- Meta suele publicar cambios de tarifas trimestrales (enero, abril, julio, octubre); el siguiente punto de cambio probable sería 2027-01-01, pero no se encontró anuncio.

### Gaps
- No se leyó el rate card oficial (CSV/PDF) en USD ni en PEN; las cifras numéricas de Perú proceden de terceros. No se encontró anuncio de cambios posteriores a 2026-10-01 (p. ej., para 2027-01-01).
- No se confirmó si Perú tiene tarifa de "authentication-international" distinta.

## 2. Gratuidades: ventana de servicio de 24 h, utilidad dentro de la ventana y punto de entrada gratuito (72 h)

### Takeaway
Desde el 2026-10-01 ya no hay "ventana de servicio gratis": cada número de empresa tiene **1.000 mensajes de servicio gratis al mes** (no acumulables) y el resto se cobra a la tarifa de utilidad del mercado (Perú USD 0,03); las plantillas de utilidad dentro de la ventana también se cobran. Lo que sigue siendo gratis es la ventana de **72 h** del punto de entrada gratuito (anuncios Click-to-WhatsApp o botón CTA de página de Facebook), salvo los mensajes de Meta Business Agent.

### Cited Findings
- Meta "reanuda" el cobro de mensajes de servicio el 2026-10-01 y da a cada número de teléfono empresarial un tramo gratuito de **1.000 mensajes de servicio al mes**; los no usados no se acumulan — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [Meta: Upcoming pricing updates for Meta Business Agent, service and utility messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages).
- Sin método de pago en la cuenta de mensajería, Meta entrega los mensajes de servicio dentro del tramo gratuito pero no después; para integraciones directas y proveedores, Meta deja de entregar mensajes de servicio desde el 2026-10-01 si no había método de pago al 2026-09-30 — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- Servicio: tarifa igual a utilidad/autenticación del mercado y **sin tramos de volumen** — [Meta: non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages).
- Plantillas de utilidad enviadas dentro de la ventana de atención: pasaron de `free_customer_service` a `regular` (cobradas) el 2026-10-01; eran gratis desde julio de 2025 — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [YCloud: WhatsApp API Pricing Update: Effective October 1, 2026](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026).
- Exenciones: servicio gratis más allá del tramo solo para organizaciones gubernamentales y sin fines de lucro elegibles, hasta el 2027-12-31; los cambios de servicio del 2026-10-01 no aplican a "AI Providers" (régimen propio) — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [Meta: New pricing policy for AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md).
- Punto de entrada gratuito: se abre si un usuario de Android/iOS escribe vía anuncio Click-to-WhatsApp o botón CTA de una página de Facebook y la empresa responde en 24 h; durante las 72 h siguientes no se cobra ningún mensaje (marketing, utilidad, autenticación o servicio) — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [WhatsApp Business Platform Pricing](https://business.whatsapp.com/products/platform-pricing?category=Authentication); [Meta: Conversation-based pricing (Deprecated)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing).
- Excepción: los mensajes de **Meta Business Agent** sí se cobran por uso de tokens dentro de esa ventana, desde el 2026-08-01 — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- Mensajes no plantilla solo pueden enviarse con ventana de atención abierta — [Meta: Service messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages).
- Hay rechazo público de desarrolladores al fin de la ventana gratuita — [Meta Developer Community Forum](https://developers.facebook.com/community/threads/1328420532772816/).

### Inferences
- Para el seguimiento conversacional hasta la reserva (caso 2): las primeras 1.000 respuestas de servicio por número y mes son gratis; a partir de ahí cada mensaje saliente de la empresa cuesta USD 0,03 en Perú. Los mensajes entrantes del cliente no aparecen como cobrados por Meta en ninguna fuente (sí pueden cobrarlos BSP como Twilio).
- Los leads que entran por un anuncio Click-to-WhatsApp tienen 72 h sin coste de Meta; los leads capturados por QR en eventos **no** generan punto de entrada gratuito (no es un anuncio CTWA ni CTA de página de Facebook).

### Gaps
- Un resumen de búsqueda detectó en la página nueva una mención a que la ventana gratuita podría durar "hasta 7 días", en conflicto con las 72 h repetidas en el resto; no se pudo verificar. Tratar 72 h como regla vigente salvo confirmación.
- No se confirmó si el tramo de 1.000 servicio/mes cuenta por número o se comparte en el portafolio en casos de varios números (las fuentes dicen "por número de teléfono").

## 3. Tramos de volumen (utilidad y autenticación)

### Takeaway
Hay descuentos por volumen solo para utilidad y autenticación, desde el 2026-10-01 definidos **por mercado**, marginales y contados a nivel de portafolio; marketing y servicio no tienen tramos. Los umbrales exactos de Perú no se pudieron verificar; un tercero dice que empiezan en 100.000 mensajes/mes, muy por encima del volumen de los casos analizados.

### Cited Findings
- El 2026-10-01 los tramos de volumen de utilidad y autenticación pasaron a ser específicos por mercado — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- Sin tramos para marketing ni servicio — [Meta: non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages); [kemenystudio.com](https://kemenystudio.com/whatsapp-service-message-pricing).
- Terceros: tramos calculados por país y categoría, marginales, contados en todo el portafolio; uno afirma que comienzan en 100.000 mensajes/mes; otro describe para Perú la tarifa de lista más cinco tramos, el más bajo 25 % por debajo — resultados de búsqueda de [Voltade](https://voltade.com/blog/whatsapp-replies-stop-being-free-1-october-2026), [ChatMaxima](https://chatmaxima.com/blog/whatsapp-business-api-pricing-2026-complete-guide/), [Wati Support](https://support.wati.io/en/articles/11561662-message-based-pricing-all-you-need-to-know) (atribución exacta de cada afirmación no verificable desde los fragmentos).

### Inferences
- Con cientos o pocos miles de mensajes al mes no se alcanzaría ningún descuento; usar la tarifa de lista.

### Gaps
- Umbrales y tarifas por tramo de Perú no confirmados en el rate card oficial.

## 4. Plantillas: aprobación, categorías, recategorización, límites de marketing por usuario y Marketing Messages API

### Takeaway
Fuera de la ventana de 24 h solo pueden enviarse plantillas aprobadas (revisión automática, hasta 24 h). Una plantilla mixta o ambigua se considera marketing; Meta puede recategorizar de utilidad a marketing (desde abril de 2025, sin aviso de 24 h a cuentas advertidas por abuso). Los mensajes de marketing están sujetos a límites dinámicos por usuario (error 131049): parte de una campaña puede no entregarse.

### Cited Findings
- Revisión automática al crear o editar; decisión en hasta 24 h; se rechazan spam, contenido tipo estafa o que viole políticas; se puede editar, reenviar o apelar (con muestra) — [Meta: Template review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/).
- Categorías: autenticación, marketing, utilidad. Utilidad debe ser no promocional y ligada a una solicitud/cuenta del usuario o esencial; contenido mixto o poco claro se trata como marketing; encuestas genéricas no son utilidad — [Meta: Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization).
- Recategorización: desde abril de 2025 una plantilla de utilidad que WhatsApp considere marketing se aprueba como marketing; a negocios advertidos por abuso ya no se les da el aviso de 24 h; error 131064 por violaciones de clasificación con restricciones temporales — [Meta: Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization); [Meta: WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog). La escalera de sanción por mala categorización es de 7 días o 30 días si se repite — [Meta: policy enforcement](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement).
- Meta puede revisar, aprobar, pausar y rechazar plantillas en cualquier momento; fuera de la ventana de 24 h solo se envían plantillas aprobadas — [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy).
- Límites por usuario de marketing: cada plantilla de marketing entregada cuenta; WhatsApp los ajusta dinámicamente según la tasa de lectura reciente de marketing del usuario y cuántos mensajes tiene en su bandeja; los mensajes de marketing enviados dentro de una ventana de 24 h abierta por respuesta del usuario no cuentan; fallo con código **131049**, esperar al menos 24 h antes de reintentar; reintentos repetidos pueden bloquear entregas a ese usuario hasta 24 h; no activos en EEE, Reino Unido, Japón, Corea del Sur; no se entregan plantillas de marketing a números de EE. UU. — [Meta: Per-user marketing template message limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/); [Meta: error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes). Entrada de changelog del 2026-07-20 añadió sección de límites de reintento a nivel WABA — [Meta: changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog).
- Existe la Marketing Messages API for WhatsApp (antes "MM Lite") con su propio esquema de errores y la beta de precio máximo para marketing — [Meta: Marketing Messages API for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview); [Meta: Set a max price (BETA)](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/pricing/).

### Inferences
- Un recordatorio de evento "solo informativo" sobre un viaje que el lead pidió puede calificar como utilidad si no promociona; si incluye ofertas o llamados a reservar, Meta lo tratará como marketing (USD 0,0703 en lugar de 0,03).
- Como se cobra por mensaje entregado, los mensajes bloqueados por 131049 no deberían generar cargo de Meta, pero reducen el alcance real de una campaña.

### Gaps
- No se verificaron diferencias de precio o funciones entre Cloud API y Marketing Messages API para Perú (Gupshup menciona un recargo propio sobre marketing "no MM Lite", ver sección 7).

## 5. Límites de mensajería, calidad, nombre visible y verificación del negocio

### Takeaway
El límite es por **portafolio de negocio**: usuarios únicos alcanzables fuera de una ventana de atención en 24 h móviles. Se empieza en 250; el primer salto es a 2.000 (verificación del negocio o 2.000 entregas de calidad en 30 días) y luego automático a 10.000, 100.000 e ilimitado. Una campaña a 1.000 personas requiere al menos el nivel 2K o repartirse en varios días.

### Cited Findings
- Definición: número máximo de teléfonos de usuarios únicos a los que la empresa puede entregar mensajes **fuera de una ventana de atención**, en 24 h móviles — [Meta: Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits).
- Niveles: 250 inicial → 2.000 (completando un "scaling path") → 10.000 → 100.000 → ilimitado (escalado automático) — [Meta: Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits).
- Llegar a 2K: verificar el negocio (o que lo verifique un partner) o enviar 2.000 mensajes entregados a números únicos en 30 días con plantillas de alta calidad; Meta revisa calidad antes de aprobar — [Meta: Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits).
- Escalado automático: sube un nivel si los mensajes son de alta calidad y se usó al menos la mitad del límite en los últimos 7 días; efecto en hasta 6 h — [Meta: Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits).
- Cambio reciente: los límites pasaron de nivel número a nivel portafolio y el primer escalón pasó de 1.000 a 2.000; el campo `messaging_limit_tier` se depreca en favor de `whatsapp_business_manager_messaging_limit` (fecha reportada: abril de 2026, según resumen de búsqueda; no verificada en el changelog) — [Meta: Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits); [Meta: changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog).
- Calidad: se asigna por número y por plantilla; se basa en señales recientes (bloqueos, reportes, silenciados) ponderando los últimos 7 días; determina mejoras de throughput. Throughput estándar 80 mps, ampliable a 1.000 mps con límite ilimitado, ≥100K usuarios únicos/24 h y calidad al menos media — [Meta: Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits); [Meta: Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput/); [Meta: Get opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in).

### Inferences
- Una cuenta nueva sin verificar (250/24 h) tardaría ≥4 días en cubrir 1.000 contactos con plantillas; con negocio verificado (2.000/24 h) podría hacerlo en un día. Las respuestas dentro de ventana abierta no consumen el límite.

### Gaps
- No se obtuvieron los requisitos actuales de aprobación del nombre visible (display name) ni detalles del proceso de verificación del negocio en Perú (documentos requeridos).

## 6. Política de opt-in y consecuencias de escribir a contactos fríos (lista de 22.000)

### Takeaway
La política exige opt-in previo que identifique al negocio y deje claro que la persona acepta recibir mensajes; ninguna fuente oficial permite escribir a listas compradas o frías. Escribir a 22.000 contactos sin opt-in viola la política y, además, choca con los límites de mensajería y con la escalera de sanciones por bloqueos y reportes.

### Cited Findings
- Desde la actualización de política de noviembre de 2024 se requiere permiso (opt-in), que puede ser general y no específico de WhatsApp, siempre que cumpla la ley local; debe indicar claramente que la persona acepta recibir comunicaciones y el nombre del negocio; el negocio es el único responsable del método (SMS, web, IVR, firma en papel/presencial) — [Meta: Get opt-in for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in); [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy).
- Se debe obtener opt-in antes de enviar plantillas, aclarando nombre e intención — [Meta: About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform).
- Recomendación: opt-in separado por categoría de mensaje y otro para llamadas, para reducir bloqueos — [Meta: Get opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in).
- Sanciones: advertencia inicial; luego bloqueos de 1 o 3 días de plantillas de marketing/utilidad/autenticación; después bloqueos de 5, 7 o 30 días de todos los mensajes; bloqueo de cuenta apelable; eventual inhabilitación permanente; casos graves (estafas) eliminación inmediata — [Meta: policy and spam enforcement](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement).
- Muchas denuncias o bloqueos por marketing: advertencia y, si continúa, suspensión de marketing por 3 días — [WhatsApp FAQ: Can't send marketing messages](https://faq.whatsapp.com/740266744985664).

### Inferences
- No hay mecanismo oficial que habilite una lista comprada o fría de 22.000 contactos. Incluso con opt-in válido, a 2.000 usuarios únicos/24 h harían falta ≥11 días; con 250, 88 días. La vía conforme es reunir opt-in nuevo (QR en eventos con texto que nombre a Carreras Viajeras), anuncios Click-to-WhatsApp o que el contacto escriba primero.
- La ley peruana de protección de datos (Ley 29733) puede imponer requisitos adicionales de consentimiento; no se investigó aquí.

### Gaps
- No se investigó la regulación peruana; tampoco umbrales numéricos de bloqueos que disparan sanciones (Meta no los publica en las fuentes encontradas).

## 7. BSP / Tech Provider, tarifas de terceros y discrepancias con Meta; separación Meta vs plataforma vs tokens LLM

### Takeaway
No hace falta un BSP: la Cloud API se usa directamente con Meta, que cobra solo por mensaje. Los BSP añaden su propio cargo (por mensaje, por número/mes o por plan) encima de la tarifa de Meta. Muchas tablas de terceros siguen desactualizadas (utilidad a USD 0,02, "servicio gratis" o precios por conversación). Hay que separar cuatro capas de coste: (a) Meta por mensaje, (b) suscripción o créditos del BSP o chatbot, (c) tokens de LLM de terceros, y (d) desde 2026, tokens de Meta Business Agent si se usa el agente de Meta.

### Cited Findings
- Cloud API directa: los requisitos de método de pago de Meta distinguen "directly-integrated businesses" de "Solution Providers", lo que confirma la integración directa sin BSP — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- **Twilio**: cargo propio de **USD 0,005 por mensaje, entrante o saliente**, más las tarifas de Meta trasladadas sin margen; en su página la única entrada específica de Perú encontrada es de llamadas (USD 0,01210/min saliente), no de mensajería — [Twilio: WhatsApp Messaging Pricing](https://www.twilio.com/en-us/whatsapp/pricing) (consultada vía búsqueda 2026-11-05).
- **360dialog**: según comparativas de terceros, cuota por número y mes (Regular €49, Premium €99, Scale €500) sin recargo por mensaje; otras fuentes más antiguas mencionan USD 49 + USD 0,005/mensaje o €39–€199 — [mark360.ai](https://mark360.ai/blog/whatsapp-api-pricing-comparison-providers-2026); [getkanal.com](https://getkanal.com/blog/whatsapp-business-api-providers-compared); [chatmaid.net](https://www.chatmaid.net/blog/whatsapp-api-pricing-comparison-2026). No verificado en la página oficial de 360dialog.
- **Gupshup**: USD 0,001 por mensaje entrante o saliente en autoservicio, más tarifas de WhatsApp al costo, y USD 0,000708 adicional en marketing no enviado por MM Lite; enterprise bajo cotización — mismas comparativas de terceros ([mark360.ai](https://mark360.ai/blog/whatsapp-api-pricing-comparison-providers-2026); [getkanal.com](https://getkanal.com/blog/whatsapp-business-api-providers-compared)). No verificado en la página oficial.
- **Wati**: planes en conflicto entre fuentes (Growth €59 / Pro €119 / Business €279 al mes con facturación anual vs USD 49/99/299); recargo por mensaje no publicado; números adicionales USD 29/mes — [eesel.ai](https://www.eesel.ai/blog/whatsapp-business-api-providers); [chatmaid.net](https://www.chatmaid.net/blog/whatsapp-api-pricing-comparison-2026). No verificado en la página oficial.
- **HighLevel** (revendedor): Perú marketing USD 0,0738, utilidad USD 0,0210, rotulado "Rate change 1 Oct 2026" — [HighLevel Support](https://help.gohighlevel.com/support/solutions/articles/155000001428-whatsapp-pricing-billing-and-rebilling-guide). No coincide con USD 0,0703 / 0,0300 de las demás fuentes.
- Calculadoras en euros: Perú utilidad €0,0249 y marketing €0,0582 — resultado de búsqueda sobre calculadoras ([wha.tools](https://wha.tools/whatsapp-api-pricing) / [whatsetter.com](https://www.whatsetter.com/tools/whatsapp-api-pricing-calculator); atribución exacta no verificable). Página en español con marketing Perú USD 0,0900 considerada desactualizada (ver sección 1).
- Meta Business Agent: cobro por uso de tokens desde 2026-08-01, incluso dentro de la ventana gratuita de 72 h — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [Meta: Upcoming pricing updates for Meta Business Agent…](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages).
- "AI Providers": régimen de precios propio; Meta les cobra mensajes no plantilla en países donde está legalmente obligada a hacerlo; desde 2026-05-13 deja de aplicarse en mercados UE/EEE; Brasil sigue — [Meta: New pricing policy for AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md).

### Inferences
- Lista de discrepancias que delatan una cotización confusa o vieja: (1) utilidad de Perú a USD 0,02 o 0,021 (anterior a 2026-10-01); (2) "las respuestas dentro de 24 h son gratis" (falso desde 2026-10-01 más allá de 1.000/mes/número); (3) precios "por conversación" (modelo deprecado desde 2025-07-01); (4) marketing Perú distinto de USD 0,0703 (0,0738 sugiere recargo del ~5 %; 0,09 parece desactualizado); (5) "créditos" o "tokens" del BSP presentados como tarifa de Meta; (6) cargos de BSP por mensajes entrantes (Twilio, Gupshup) que Meta no cobra.
- Para comparar cotizaciones: separar (a) Meta por mensaje entregado según categoría, (b) cuota fija o recargo del BSP/plataforma de chatbot, (c) tokens de LLM de terceros (OpenAI/Anthropic/Gemini), facturados por el proveedor del modelo según tokens de entrada/salida, y (d) tokens de Meta Business Agent si se usa el agente de Meta. Un "paquete de créditos" del BSP puede mezclar (a)+(b)+(c); pedir desglose.
- Usar un chatbot con LLM para atender reservas de la propia empresa no convierte al negocio en "AI Provider"; esa categoría parece referirse a proveedores de asistentes de IA. No verificado en el texto completo de la política.

### Gaps
- No se verificó ningún precio en la página oficial de cada BSP (solo Twilio vía búsqueda); no se encontró un proveedor local peruano con tarifa publicada verificable. Fechas de publicación de las comparativas de terceros no confirmadas.
- No se obtuvo un precio oficial de LLM con fecha (consultar https://openai.com/api/pricing, https://www.anthropic.com/pricing o https://ai.google.dev/pricing en la fecha de redacción).

## 8. Ejemplo calculado con las tarifas vigentes desde 2026-10-01

### Takeaway
Solo Meta: 1 plantilla de marketing a 1.000 usuarios peruanos con opt-in ≈ **USD 70,30**; 3 recordatorios de utilidad a 500 inscritos (1.500 mensajes) ≈ **USD 45,00** (antes del 2026-10-01 habrían sido USD 30,00). Con Twilio se suman USD 0,005 por mensaje.

### Cited Findings
- Tarifas usadas (Perú, USD por mensaje entregado, efectivas desde 2026-10-01): marketing 0,0703; utilidad 0,0300; servicio 0,0300 tras 1.000 gratis/mes/número — ver sección 1 ([Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) para la fecha y el aumento de Perú; [Voltade](https://voltade.com/learn/whatsapp/whatsapp-api-pricing-changes-october-2026), [kemenystudio.com](https://kemenystudio.com/whatsapp-service-message-pricing), [360dialog blog](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/) para los valores).
- Cargo de Twilio: USD 0,005 por mensaje entrante o saliente — [Twilio](https://www.twilio.com/en-us/whatsapp/pricing).

### Inferences
- **Campaña de marketing**: 1.000 × 0,0703 = **USD 70,30** (Meta). Con Twilio: + 1.000 × 0,005 = USD 5,00 → USD 75,30. Con Gupshup (según terceros): + 1.000 × (0,001 + 0,000708) ≈ USD 1,71 → ≈ USD 72,01. Con PEN (tabla PEN reportada por terceros): 1.000 × S/ 0,2339 = **S/ 233,90**. Se paga solo lo entregado: los bloqueos por límite por usuario (131049) reducen alcance y coste. Requiere el nivel de 2.000 usuarios únicos/24 h o repartir en ≥4 días con el nivel inicial de 250.
- **Recordatorios de utilidad**: 3 × 500 = 1.500 × 0,0300 = **USD 45,00** (PEN: 1.500 × S/ 0,0998 = S/ 149,70). Antes del 2026-10-01 habría costado 1.500 × 0,02 = USD 30,00 y habría sido gratis si se enviaba dentro de una ventana de atención abierta; desde 2026-10-01 ya no. Con Twilio: + USD 7,50 → USD 52,50. Si Meta recategoriza la plantilla a marketing: 1.500 × 0,0703 = USD 105,45.
- **Seguimiento hasta la reserva**: ejemplo ilustrativo de 300 leads × 8 mensajes salientes de la empresa = 2.400 mensajes de servicio; 1.000 gratis → 1.400 × 0,03 = USD 42,00 al mes por número (Meta). Los mensajes entrantes no los cobra Meta; Twilio cobraría USD 0,005 también por cada entrante. Si se usa un LLM, sumar sus tokens aparte.
- Volumen insuficiente para tramos de descuento en todos los casos.

### Gaps
- Los valores numéricos dependen de cifras de terceros no contrastadas con el CSV oficial; verificar antes de presentarlos como oficiales.
