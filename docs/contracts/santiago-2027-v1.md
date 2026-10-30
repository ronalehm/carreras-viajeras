# BORRADOR DE PRUEBA SANDBOX
## SIN APROBACIÓN LEGAL NI COMERCIAL

**Documento:** Contrato preliminar de reserva — Maratón Santiago 2027

**Versión del contrato:** santiago-2027-v1  
**Viaje:** Maratón Santiago 2027  
**Fecha de elaboración:** 30 de octubre de 2026  
**Uso:** Pruebas del flujo de reserva y Stripe Checkout en desarrollo  
**Estado contractual:** BORRADOR (`draft`)  
**Autorización técnica:** APROBADO PARA PRUEBAS DE DESARROLLO  
**Aprobación legal:** PENDIENTE  
**Aprobación comercial definitiva:** PENDIENTE  
**Entorno autorizado:** Desarrollo / Sandbox (`dev-stripe`)

---

## 1. Oferta a la que corresponde

### 1.1. Identificación de la oferta

| Campo | Información |
|---|---|
| Viaje | Maratón Santiago 2027 |
| Nombre del paquete | PRUEBA-PRIMERA CARRERA |
| Versión de la oferta | 1 |
| Estado de la oferta | Publicada, activa y vigente |
| Identificador del contrato | santiago-2027-v1 |
| Entorno | dev-stripe |

**Vigencia de la oferta:** La consulta confirmó que se encuentra vigente. Las fechas exactas de inicio y finalización están pendientes de transcripción desde la base de datos.

### 1.2. Precio del paquete

Las siguientes condiciones económicas corresponden a la oferta activa, versión 1, denominada **PRUEBA-PRIMERA CARRERA**.

| Concepto | Importe |
|---|---:|
| Precio original | US$12,000.00 |
| Descuento aplicado | US$1,000.00 |
| **Precio final** | **US$11,000.00** |
| Pago inicial | US$300.00 |
| Saldo después del pago inicial | US$10,700.00 |

**Tipo de cambio de referencia registrado:** USD/PEN 3.4500.

### 1.3. Equivalencias en soles

| Concepto | Importe en USD | Equivalente en PEN |
|---|---:|---:|
| Precio final | US$11,000.00 | S/37,950.00 |
| Pago inicial | US$300.00 | S/1,035.00 |
| Saldo restante | US$10,700.00 | S/36,915.00 |

Las equivalencias en soles se calculan aplicando el tipo de cambio 3.4500 registrado para la oferta.

La moneda efectiva del cobro y las reglas aplicables a la conversión deben corresponder a la configuración vigente del sistema.

### 1.4. Modalidades de pago

**Pago inicial confirmado:** US$300.00.

La oferta activa permite seleccionar esta modalidad como pago inicial de la reserva.

**Saldo después del pago inicial:** US$10,700.00.

Otras modalidades, plazos y fechas de vencimiento: PENDIENTE DE VERIFICACIÓN contra las condiciones comerciales registradas.

### 1.5. Descuento

**Descuento registrado:** US$1,000.00 sobre un precio original de US$12,000.00.

**Precio resultante:** US$11,000.00.

Las condiciones de elegibilidad, aplicación y vigencia del descuento deberán incorporarse literalmente desde la oferta, si se encuentran registradas.

---

## 2. Condiciones de la oferta

### 2.1. Condiciones comerciales registradas

**PENDIENTE DE TRANSCRIPCIÓN LITERAL DESDE `dev-stripe`.**

Esta sección debe contener exclusivamente el texto original de las condiciones comerciales asociado a la oferta **PRUEBA-PRIMERA CARRERA, versión 1**.

No se modificarán ni interpretarán las condiciones existentes.

### 2.2. Condiciones de reserva

**Información económica confirmada:**

- Precio final de la oferta: US$11,000.00.
- Pago inicial disponible: US$300.00.
- Saldo restante después del pago inicial: US$10,700.00.

Estas cifras son datos económicos confirmados y no sustituyen las condiciones contractuales de reserva pendientes de transcripción.

### 2.3. Condiciones del saldo pendiente

**PENDIENTE DE DEFINICIÓN O TRANSCRIPCIÓN.**

No se han confirmado todavía las fechas de vencimiento, calendario de pagos ni otras condiciones asociadas al saldo pendiente.

No se establecen obligaciones adicionales mediante este borrador.

---

## 3. Incluye

**PENDIENTE DE TRANSCRIPCIÓN DESDE LA FICHA DEL VIAJE.**

Esta sección debe contener exclusivamente los servicios y beneficios que figuren expresamente como incluidos en la ficha vigente de Maratón Santiago 2027 y que correspondan a la oferta PRUEBA-PRIMERA CARRERA.

No se incorporarán servicios que no estén documentados en la oferta o en la ficha del viaje.

---

## 4. No incluye

**PENDIENTE DE TRANSCRIPCIÓN DESDE LA FICHA DEL VIAJE.**

Esta sección debe contener exclusivamente los servicios y conceptos expresamente excluidos en la ficha vigente del viaje y en la oferta correspondiente.

No se agregarán exclusiones por interpretación o suposición.

---

## 5. Contenido pendiente

Antes de aprobar comercial o legalmente este contrato deberán revisarse y completarse los siguientes elementos:

### 5.1. Información comercial

- Identificación legal del prestador del servicio.
- Nombre e identificación del cliente o participante.
- Fechas exactas de vigencia de la oferta.
- Fechas del viaje y programa aplicable.
- Identificador de la oferta en la base de datos.
- Condiciones comerciales originales.
- Servicios incluidos y excluidos.
- Condiciones de aplicación del descuento.
- Cronograma de pago del saldo restante.

### 5.2. Información contractual

Pendiente de definición y revisión legal/comercial:

- Condiciones para la confirmación de la reserva.
- Políticas de modificación y cancelación.
- Condiciones de devolución o reembolso.
- Responsabilidades y obligaciones de las partes.
- Tratamiento de datos personales.
- Legislación aplicable y demás disposiciones contractuales necesarias.

Estos apartados identifican temas pendientes de revisión. **No constituyen cláusulas acordadas ni condiciones incorporadas al contrato.**

---

## 6. Uso exclusivo para pruebas de desarrollo

### 6.1. Finalidad técnica

Este documento preliminar está autorizado exclusivamente para realizar pruebas del flujo de reserva y Checkout en un entorno de desarrollo controlado.

Las pruebas técnicas contempladas son:

1. Preparación de la reserva.
2. Asociación de la reserva con la oferta vigente.
3. Presentación del borrador contractual.
4. Simulación de aceptación del documento para el flujo de desarrollo.
5. Creación de la sesión Stripe Checkout.
6. Procesamiento de un pago simulado.
7. Recepción y validación de webhooks.
8. Registro de la operación en PostgreSQL.
9. Actualización del estado de la reserva.
10. Verificación del pago inicial y saldo pendiente.

### 6.2. Limitaciones

La autorización técnica para pruebas de desarrollo:

- No equivale a aprobación legal.
- No constituye aprobación comercial definitiva.
- No permite utilizar este documento como contrato de producción.
- No autoriza cobros reales.
- No elimina los requisitos contractuales establecidos para producción.
- No debe presentarse como contrato definitivo a clientes.

La habilitación del borrador para Checkout deberá estar restringida al entorno sandbox mediante los controles técnicos correspondientes.

---

## 7. Control documental y trazabilidad

| Campo | Valor |
|---|---|
| Documento | Contrato preliminar Maratón Santiago 2027 |
| Identificador | santiago-2027-v1 |
| Versión documental | 0.1 |
| Oferta vinculada | PRUEBA-PRIMERA CARRERA |
| Versión de oferta | 1 |
| Entorno | dev-stripe |
| Estado contractual | draft |
| Autorización técnica | APROBADO PARA PRUEBAS DE DESARROLLO |
| Aprobación legal | PENDIENTE |
| Aprobación comercial | PENDIENTE |
| Revisión de condiciones literales | PENDIENTE |
| Revisión de incluidos y excluidos | PENDIENTE |

### 7.1. Registro de aprobación

**Autorización de uso técnico:** Aprobado exclusivamente para pruebas de desarrollo.

**Aprobación contractual:** No otorgada.

**Aprobación legal:** No otorgada.

**Aprobación comercial definitiva:** No otorgada.

El registro en `contract_versions` debe conservar el estado `draft` y la trazabilidad del usuario autenticado que realice la operación.

---

## 8. Observación final

Este documento corresponde a un borrador contractual preparado exclusivamente para validar el proceso técnico de reserva del viaje Maratón Santiago 2027.

Los precios, el descuento, el pago inicial, el saldo y el tipo de cambio corresponden a los datos confirmados de la oferta activa PRUEBA-PRIMERA CARRERA, versión 1.

Las condiciones comerciales textuales, los servicios incluidos y excluidos y los elementos legales pendientes deben completarse antes de considerar este documento un contrato comercial definitivo.

**ESTADO: BORRADOR — APROBADO EXCLUSIVAMENTE PARA PRUEBAS DE DESARROLLO.**

**FIN DEL DOCUMENTO.**