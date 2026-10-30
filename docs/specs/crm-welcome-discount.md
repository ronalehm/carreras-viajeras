# Invitación a crear cuenta con código de descuento de bienvenida

- Módulos: integrations, rewards, bookings y crm; datos compartidos en lib.
- Estado: aprobado
- Solicitud: cuando un potencial cliente deja sus datos en el formulario y **no tiene cuenta de runner**, el sistema lo invita a registrarse. El correo le muestra los beneficios de la plataforma y le da un **código de descuento por ser nuevo cliente**.
- Referencias: `crm-lifecycle-emails.md` (bienvenidas), `crm-sales-cadence.md`, `accounts-runner-hub-rewards.md` (recompensas y `booking_benefits`), `accounts-role-requests.md` (toda cuenta que inicia sesión tiene `profiles`) y `docs/SETUP.md`.

## Objetivo

Convertir a los contactos del formulario en usuarios registrados, dándoles un motivo concreto para crear su cuenta: un descuento en su primera reserva que solo vale si se registran con el mismo correo.

## Decisiones confirmadas por el usuario

| Tema | Decisión |
| --- | --- |
| Destinatarios | Leads nuevos de `web_form` (registro de carrera o `/contacto`) y de `google_form` cuyo correo **no tenga cuenta**. «Tener cuenta» = existe una fila en `profiles` con ese correo y `deleted_at IS NULL`. No incluye altas manuales, importaciones ni `runner_account`. |
| Entrega | **Dentro de la bienvenida** («Recibimos tu registro» o «Recibimos tu consulta»), con un bloque «Crea tu cuenta». No hay correo adicional. |
| Beneficios del bloque | **Mis carreras** (reservas, pagos y saldo en un solo lugar), **Recompensas** (estrellas canjeables por descuentos y beneficios) y **Novedades primero** (nuevas carreras y preventas antes que nadie). |
| Código | **Único por persona**, de un solo uso y con caducidad. |
| Importe | **Monto fijo en US$**, configurable por el admin. |
| Condición | Solo vale si la persona **crea su cuenta con el mismo correo**. El equipo lo aplica desde el CRM en su **primera reserva**. |

## Alcance

- Incluye:
  - configuración versionada del descuento: importe, días de vigencia y activo;
  - emisión del código al preparar la bienvenida;
  - plantillas de bienvenida con el bloque de cuenta;
  - aplicación del código en una reserva, con todas sus validaciones;
  - el código y su estado en la ficha del lead;
  - documentación.
- No incluye:
  - canje del código por el propio runner desde su cuenta;
  - códigos compartibles o campañas masivas;
  - porcentajes;
  - acumular el código con un descuento de recompensas en la misma reserva;
  - cambiar las ofertas comerciales.

## Requisitos

### 1. Configuración (admin)

- En `/crm/recompensas`, con `rewards.manage`, una sección **«Descuento de bienvenida»** con tres campos:
  - **importe en US$** (entero, 1–10 000);
  - **vigencia en días** (1–365);
  - **activo** (sí/no).
- Cada cambio crea una **versión nueva**, inmutable, y desactiva la anterior: solo puede haber una activa. Sigue el patrón de `reward_rule_versions`.
- Si no hay versión activa, no se emiten códigos y la bienvenida sale con su texto normal.

### 2. Emisión

- Al preparar una bienvenida `welcome_registration` o `welcome_contact` para un lead `web_form`/`google_form`, se emite un código si se cumplen todas estas condiciones:
  - hay una versión activa;
  - el lead tiene correo;
  - ese correo no tiene cuenta;
  - no existe ya un código `issued` vigente para el mismo correo.
- Si el correo ya tiene un código vigente, se reutiliza en lugar de emitir otro.
- **Formato:** `CV-` seguido de 6 caracteres del alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sin 0, O, 1 ni I). Se genera con `node:crypto` y se reintenta si choca con el índice único.
- **Datos del código:** id, lead, correo (en minúsculas), código, importe (copiado de la versión), versión, `source_event_id` (el `lead.created`), emitido, caduca (emitido + vigencia) y estado.
  - Estados: `issued`, `applied` o `void`.
  - «Caducado» se calcula: `issued` con `expires_at < now()`.
- **Idempotencia:** como máximo un código por `source_event_id`, con `ON CONFLICT DO NOTHING`. Si dos preparaciones del motor coinciden, ambas releen el código ganador.
- **Privacidad:** el código nunca va en el outbox, en payloads ni en logs. Solo aparece en el cuerpo del correo y en la ficha del lead.

### 3. Correo

- Para leads con código, las bienvenidas usan `templateVersion = 2`. Al cuerpo actual se le añade, antes de la firma, el bloque de la sección «Textos».
- Para leads sin código (ya tienen cuenta, descuento inactivo o sin correo), la bienvenida no cambia.
- La comprobación de elegibilidad de la bienvenida no cambia.

### 4. Aplicación en la reserva

- En la página de la reserva (`/crm/reservas/[id]`), con `rewards.apply`, un formulario **«Aplicar código de bienvenida»**.
- Una función SQL atómica (`cv_apply_welcome_code(actor, code, booking)`), modelada sobre `cv_apply_booking_reward`, bloquea el código y la reserva y comprueba:
  1. el código existe, está `issued` y no está caducado;
  2. la reserva está `pending`, no tiene pagos no anulados y no tiene ya un descuento;
  3. la reserva está **vinculada a una cuenta** (`runner_user_id` no nulo), lo que prueba una cuenta con el correo verificado, y su `participant_email` es el correo del código;
  4. es la **primera reserva** de ese correo: no existe otra reserva no cancelada con el mismo `participant_email`;
  5. el importe es menor que `total_usd`.
- Si todo se cumple: `total_usd` baja en el importe, se inserta un `booking_benefits` de tipo `discount` con el precio original, el descuento y el precio final, y el código pasa a `applied` con la reserva, la fecha y quién lo aplicó.
- El candado de precio existente (`bookings_reward_price_guard`) impide cambiar después el total.
- Cada fallo devuelve un código fijo con su mensaje claro en el CRM: código inexistente, caducado, ya usado, reserva no vinculada a una cuenta, correo distinto, no es la primera reserva, reserva ya pagada o con descuento, descuento mayor que el total.

### 5. Ficha del lead

- La ficha (con `leads.manage`) muestra, si existe, una tarjeta «Código de bienvenida» con el código, el importe, la caducidad y el estado: Vigente, Caducado, Aplicado en la reserva {enlace} o Anulado.

## Textos para revisión

Bloque añadido a la bienvenida, antes de la firma:

> **Crea tu cuenta y llévate US${importe} de descuento**
> Con tu cuenta de Carreras Viajeras tienes:
> - **Mis carreras:** tus reservas, pagos y saldo en un solo lugar.
> - **Recompensas:** acumula estrellas por tus viajes y referidos, y canjéalas por descuentos y beneficios.
> - **Novedades primero:** entérate antes que nadie de nuevas carreras y preventas.
>
> Tu código de bienvenida es **{código}**: US${importe} de descuento en tu primera reserva. Para usarlo, crea tu cuenta con este mismo correo en {APP_ORIGIN}/cuenta y compártelo con nuestro equipo al reservar. Válido hasta el {fecha}.

Al ser texto plano, la negrita se omite y las viñetas se escriben con «- ».

## Criterios de aceptación

- [ ] Un lead de web o Google Forms con un correo sin cuenta, con el descuento activo, recibe la bienvenida con su código único, el importe y la fecha de caducidad.
- [ ] Un correo con cuenta, un alta manual, una importación o el descuento inactivo reciben la bienvenida normal, sin código.
- [ ] El mismo correo no recibe dos códigos vigentes. Dos preparaciones concurrentes no crean dos códigos para el mismo evento.
- [ ] Solo hay una versión activa de la configuración. Los cambios no alteran los códigos ya emitidos.
- [ ] Aplicar el código descuenta el importe una sola vez, en la primera reserva pendiente sin pagos de una cuenta con el mismo correo. Los demás casos se rechazan con su mensaje.
- [ ] El código no aparece en el outbox, en los payloads ni en los logs.
- [ ] Pasan lint, tests, typegen, TypeScript y `build:worker`.

## Diseño técnico

- **Migración nueva** (siguiente número disponible):
  - tabla `welcome_discount_versions`: id, `amount_usd`, `validity_days`, `active`, `created_by`, `created_at`, con CHECK de rangos e índice único parcial de la versión activa;
  - tabla `welcome_discount_codes`:
    - columnas: id, `lead_id`, `email`, `code`, `amount_usd`, `version_id`, `source_event_id`, `issued_at`, `expires_at`, estado (enum `welcome_code_status`: `issued`, `applied`, `void`), `booking_id`, `applied_at`, `applied_by`;
    - índices únicos en `code` y en `source_event_id`, e índice en `email`;
    - CHECK de formato del código, del correo en minúsculas y de la coherencia de `applied`;
  - `booking_benefits`:
    - columna nullable `welcome_code_id`, con FK e índice único;
    - recrear `booking_benefits_price_chk` para que un `discount` tenga exactamente una fuente: `redemption_id` o `welcome_code_id`;
  - funciones plpgsql `cv_create_welcome_discount_version(actor, amount, days, active)` (con candado advisory; desactiva la versión anterior) y `cv_apply_welcome_code(actor, code, booking)`;
  - índice en `profiles (email)` para la búsqueda de cuenta, sin hacerlo único.
- **Emisión:** en `modules/integrations/services/clientEmails.service.ts`, durante `prepareEmails`, con una consulta de cuenta existente (`EXISTS profiles`). El código se crea con su propio `ON CONFLICT (source_event_id) DO NOTHING` y se relee antes de renderizar. El generador va en `modules/integrations/utils/welcomeCode.ts`.
- **Plantillas:** `lifecycleEmailTemplates.ts`, con el campo opcional `welcomeCode` en las bienvenidas y `templateVersion` 2 cuando está presente.
- **Admin y aplicación:** el servicio y las acciones van en `modules/rewards`:
  - `welcomeDiscount.service.ts` y `welcomeDiscount.actions.ts`, con Zod;
  - la configuración, con `rewards.manage`;
  - la aplicación, con `rewards.apply`;
  - componentes en `RewardProgramAdmin` y en la página de reserva, junto a `BookingRewardsPanel`.
- **Ficha:** una lectura acotada del último código del lead y una tarjeta en `app/crm/(protected)/leads/[id]/page.tsx`.

## Tests

- **Generador:** alfabeto, longitud, reintento ante colisión.
- **Emisión (PGlite):**
  - correo sin cuenta y con cuenta, cuenta borrada;
  - descuento inactivo;
  - alta manual e importación;
  - código vigente reutilizado;
  - concurrencia sobre el mismo evento.
- **Plantillas:** bienvenida con y sin código; formato del importe y de la fecha.
- **Configuración:** versión única activa, rangos y permisos.
- **Aplicación (PGlite):** todos los rechazos del requisito 4 y el caso válido, con el `booking_benefits` y el candado de precio.
- **Privacidad:** el código no aparece en `outbox_events`.
- **Ficha:** estados de la tarjeta.

## Plan de tareas

### Fase 1 — Configuración, emisión y correo (5 tareas)

- [x] T1 — Migración y schema · archivos: `lib/db-schema.ts` (o `lib/rewards-schema.ts`), migración nueva, snapshot y journal · depende de: aprobación · secuencial (base)
- [x] T2 — Configuración versionada · archivos: `modules/rewards/services/welcomeDiscount.service.ts` y su test, `modules/rewards/actions/welcomeDiscount.actions.ts` y su test, `modules/rewards/schemas/rewards.schema.ts`, `modules/rewards/index.ts` · depende de: T1
- [x] T3 — Generador y plantillas · archivos: `modules/integrations/utils/welcomeCode.ts` y su test, `modules/integrations/utils/lifecycleEmailTemplates.ts` y su test · depende de: T1 · paralelo con T2
- [x] T4 — Emisión en el motor · archivos: `modules/integrations/services/clientEmails.service.ts` y su test · depende de: T2 y T3
- [x] T5 — Sección de configuración en el admin · archivos: `modules/rewards/components/RewardProgramAdmin.tsx` y su test, `app/crm/(protected)/recompensas/page.tsx` · depende de: T2

### Fase 2 — Aplicación en la reserva y ficha (4 tareas)

- [ ] T1 — Aplicación · archivos: `modules/rewards/services/welcomeDiscount.service.ts` y su test, `modules/rewards/actions/welcomeDiscount.actions.ts` y su test · depende de: F1
- [ ] T2 — Formulario en la reserva · archivos: `modules/rewards/components/WelcomeCodeForm.tsx` y su test, `app/crm/(protected)/reservas/[id]/page.tsx` · depende de: F2 T1
- [ ] T3 — Tarjeta en la ficha del lead · archivos: `modules/rewards/components/WelcomeCodeCard.tsx` y su test, `app/crm/(protected)/leads/[id]/page.tsx` · depende de: F2 T1 · paralelo con T2
- [ ] T4 — Guía y revisión · archivos: `README.md` · depende de: F2 T1–T3

## Operaciones del usuario

1. Aplicar la migración en dev-test y después en production, antes de mergear la F1.
2. Configurar el importe y la vigencia en `/crm/recompensas` y activar el descuento cuando quiera empezar.

## Preguntas abiertas

1. **Importe y vigencia iniciales:** propuesta, US$50 y 60 días. Se configuran en el CRM y pueden cambiarse sin código.
2. **Varios registros del mismo correo:** si alguien sin cuenta se registra a dos carreras, recibe el mismo código vigente en las dos bienvenidas. ¿Te parece bien?
