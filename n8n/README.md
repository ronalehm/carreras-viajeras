# n8n: outbox de automatización y aviso por correo

Workflow de n8n Community que procesa la outbox `automation_events` por la API privada de la app (`claim` → correo al equipo → `ack`/`fail`). El secreto de la API, las migraciones y los permisos de la base se documentan en el [README raíz](../README.md); aquí solo está lo que se hace en n8n y la prueba con datos ficticios.

- Workflow: [`workflows/automation-outbox-poller.json`](workflows/automation-outbox-poller.json)
- Contrato de la API y requisitos: [`docs/specs/automation-outbox.md`](../docs/specs/automation-outbox.md)

## Requisitos

- n8n Community reciente (1.x o posterior), local (npm o Docker). **No se expone a Internet**: solo hace peticiones salientes a la app.
- La app con la migración del outbox (`drizzle/0004_classy_tenebrous.sql`) aplicada en su rama de Neon y `AUTOMATION_API_TOKEN` configurado (Cloudflare Secret en producción, `.env.local` con `npm run dev`). Ver el README raíz.
- Una cuenta SMTP para enviar los avisos (Gmail, Zoho, Brevo u otra).
- n8n nunca recibe `DATABASE_URL` ni `DATABASE_MIGRATION_URL`: solo habla con la API.

## 1. Importar el workflow

En n8n: **Workflows → Create Workflow → menú `⋯` → Import from File…** y elige `n8n/workflows/automation-outbox-poller.json`. Se importa **inactivo** y sin credenciales asignadas. Guárdalo.

El JSON no contiene secretos, tokens, direcciones reales ni IDs de credenciales: la URL base y los destinatarios son placeholders del nodo **Config** y las credenciales se eligen tras importar.

## 2. Crear las credenciales

En **Credentials → Add credential** (o desde cada nodo con *Create new credential*).

### Header Auth (API privada)

| Campo | Valor |
|---|---|
| Tipo | **Header Auth** |
| Name | `Authorization` |
| Value | `Bearer <token>` |

- `<token>` es exactamente el mismo valor que el Cloudflare Secret `AUTOMATION_API_TOKEN` (en producción) o que `AUTOMATION_API_TOKEN` de `.env.local` (prueba local con `npm run dev`). Si son distintos, crea dos credenciales (p. ej. `Carreras Viajeras API (dev)` y `Carreras Viajeras API (prod)`).
- La cabecera es sensible a mayúsculas: `Bearer` con B mayúscula, un espacio y el token, sin comillas ni espacios al final. Cualquier otra forma responde `401`.
- Asígnala en los tres nodos HTTP: **Reclamar eventos**, **Confirmar (ack)** e **Informar fallo (fail)**. Al importar, ningún nodo trae credencial. **Confirmar (ack)** e **Informar fallo (fail)** no detienen el flujo si fallan, así que si les falta la credencial no aparece nada en rojo: llegan los correos, pero los eventos se quedan en `processing` y su salida muestra `Credentials not found`.
- Con n8n en Docker, `APP_BASE_URL` en **Config** debe ser `http://host.docker.internal:3000` para la prueba local: dentro del contenedor, `localhost` es el propio n8n (`ECONNREFUSED ::1:3000`).

### SMTP (correo)

Crea una credencial **SMTP** y asígnala en el nodo **Enviar correo**. Ejemplos habituales (comprueba los datos actuales en la documentación del proveedor):

| Proveedor | Host | Puerto | SSL/TLS | Usuario | Contraseña |
|---|---|---|---|---|---|
| Gmail / Google Workspace | `smtp.gmail.com` | 465 | activado | la dirección completa | **contraseña de aplicación** (requiere verificación en dos pasos; la contraseña normal no funciona) |
| Zoho Mail | `smtp.zoho.com` (`smtp.zoho.eu` según región; `smtppro.zoho.com` para dominios propios) | 465 | activado | la dirección completa | contraseña de la cuenta o de aplicación si tiene 2FA |
| Brevo | `smtp-relay.brevo.com` | 587 | desactivado (usa STARTTLS) | el login SMTP del panel de Brevo | la clave SMTP del panel de Brevo |

`FROM_EMAIL` (en Config) debe ser la cuenta autenticada o un remitente verificado en el proveedor; si no, el envío falla o acaba en spam.

## 3. Rellenar Config

Abre el nodo **Config** (Edit Fields) y sustituye los placeholders. Son variables del workflow en ese nodo porque las Variables de n8n (`$vars`) no están disponibles en Community.

| Campo | Placeholder | Valor |
|---|---|---|
| `APP_BASE_URL` | `http://localhost:3000` | Producción: `https://carreras-viajeras.mentec.dev`. Prueba local: `http://localhost:3000` (si n8n corre en Docker, `http://host.docker.internal:3000`). **Sin barra final.** |
| `TEAM_EMAILS` | `equipo-pruebas@example.com` | Destinatarios separados por comas. **Con datos ficticios, solo una dirección de prueba, nunca la del equipo real.** |
| `FROM_EMAIL` | `Carreras Viajeras <avisos@example.com>` | Remitente; admite `Nombre <correo>`. |

## 4. Activar

Guarda y activa el workflow (interruptor **Active**). Desde entonces el Schedule Trigger se ejecuta cada minuto; las ejecuciones aparecen en **Executions**.

Ejecutarlo a mano (**Execute workflow**) sirve para depurar, pero **la deduplicación no se guarda en ejecuciones manuales** (ver abajo): para las pruebas de la checklist, usa el workflow activo.

## Cómo funciona

```
Cada minuto → Config → Reclamar eventos (claim, limit 25)
                         ├─ Separar eventos → ¿lead.created v1?
                         │     ├─ sí → Deduplicar → ¿Ya enviado?
                         │     │         ├─ sí → Confirmar (ack)
                         │     │         └─ no → Preparar correo → Enviar correo
                         │     │                   ├─ ok    → Registrar envío → Confirmar (ack)
                         │     │                   └─ error → Marcar fallo de correo → Informar fallo (email_send_failed)
                         │     └─ no → Marcar no soportado → Informar fallo (unsupported_event)
                         └─ ¿Lote lleno? (25 eventos) → sí: vuelve a Reclamar eventos
```

1. **Claim.** `POST {APP_BASE_URL}/api/automation/events/claim` con `{"limit": 25}`. La API devuelve hasta 25 eventos, cada uno con un `leaseToken` válido 5 minutos. Si el claim falla (`401` credencial mal configurada, `503` secreto ausente en la app o base caída, red), la ejecución termina en error y se reintenta al minuto siguiente; no se pierde nada.
2. **Validación.** Solo `type = "lead.created"` con `payloadVersion = 1` sigue. Cualquier otro se marca `fail` con `unsupported_event` (y, como todo fallo, se reintenta hasta acabar `dead`).
3. **Correo.** Uno por evento a `TEAM_EMAILS`. Asunto `Nuevo lead para <tripSlug>` o `Nuevo lead sin viaje`; cuerpo en texto con el viaje, la fecha del evento (`occurredAt`, UTC) y el enlace `{APP_BASE_URL}/crm/leads/<leadId>`, indicando que los datos de contacto solo se ven en el CRM. El correo no lleva nombre, correo ni WhatsApp del interesado (el evento tampoco los contiene). El enlace abrirá la ficha cuando exista la vista de leads del CRM.
4. **Ack / fail.** Si el envío tiene éxito: `POST …/events/<eventId>/ack` con `{leaseToken}` → `succeeded`. Si falla: `POST …/events/<eventId>/fail` con `{leaseToken, errorCode: "email_send_failed"}`; el texto del error del proveedor nunca se envía a la API. Un `409 lease_conflict` (lease vencida o reclamada por otra ejecución) no detiene el resto del lote: el evento se reclamará otra vez y la deduplicación evita el segundo correo.
5. **Bucle.** Si el claim devolvió 25 eventos (lote lleno), al terminar el lote se reclama otro en la misma ejecución; con menos de 25 (o 0) la ejecución termina. El orden depende de `executionOrder: v1` y de la posición de los nodos (la rama de **Separar eventos** está por encima de **¿Lote lleno?**): no muevas **¿Lote lleno?** por encima.

### Reintentos y `dead`

La app decide los reintentos, no n8n. Tras cada `fail`, el evento vuelve a `pending` con espera creciente y jitter: 15–30 s tras el intento 1, 30–60 s, 1–2 min, 2–4 min, 4–8 min, 8–16 min y 16–32 min tras el intento 7. El **intento 8** fallido lo deja en `dead` (unos 32–64 minutos después del primer fallo si el error persiste). Un evento reclamado cuya lease vence sin `ack` ni `fail` cuenta como intento y también acaba en `dead` (`lease_expired`) al llegar a 8.

Para reenviar un evento `dead`, una vez corregida la causa, se usa el script auditado `scripts/sql/redrive-automation-event.sql` (uso completo en su cabecera):

```sh
psql "$DATABASE_MIGRATION_URL" \
  -v event_id='<eventId del evento dead>' \
  -v performed_by='<user_id de un staff activo>' \
  -v reason='<operador>: <motivo>' \
  -f scripts/sql/redrive-automation-event.sql
```

Deja una fila en `automation_event_redrives` y devuelve el evento a `pending` con `attempts = 0`. Para localizar los eventos `dead`:

```sql
SELECT id, type, attempts, last_error_code, created_at
FROM automation_events WHERE status = 'dead' ORDER BY created_at;
```

### Deduplicación por `eventId`

La entrega es al menos una vez: un evento puede llegar dos veces (p. ej. si el `ack` falla después de enviar el correo). El nodo **Registrar envío** guarda cada `eventId` enviado en la *static data* del workflow (`sentEventIds`, con la fecha del envío, podada a 30 días) y **Deduplicar** consulta ese mapa: si el evento ya se envió, salta el correo y va directo al `ack`. Se registra solo tras un envío correcto, así que un evento cuyo correo falló sí se reenvía en el reintento.

Límites a tener en cuenta:

- **La static data solo persiste en ejecuciones de producción** (workflow activo, disparado por el Schedule Trigger). En las ejecuciones manuales de prueba se lee pero no se guarda.
- Se guarda **al terminar cada ejecución**: si n8n se cae a mitad de una ejecución, después de enviar y antes de terminar, ese evento puede recibir un segundo correo al reprocesarse.
- Si una ejecución dura más de un minuto, puede solaparse con la siguiente. La API nunca entrega el mismo evento a dos ejecuciones con lease vigente, pero la última en terminar sobrescribe la static data de la otra; en el peor caso, un correo duplicado.
- Si se borra la base de n8n o se reimporta el workflow, se pierde el historial (como mucho, duplicados de eventos en curso).

Al reexportar el workflow para el repositorio, elimina del JSON `credentials`, `staticData`, `id`, `versionId` y `meta`, y deja los placeholders en Config.

## Si n8n se apaga o se reinicia

Los eventos viven en Neon, no en n8n. Con n8n apagado, los nuevos eventos se quedan `pending` y se procesan al volver. Un evento reclamado y no confirmado (n8n se detuvo entre el claim y el `ack`) queda `processing` hasta que vence su lease (5 minutos); después se reclama de nuevo, con un intento más. Nada se pierde; en el peor caso se repite un correo (ver los límites de la deduplicación).

## Prueba con datos ficticios (rama Neon de desarrollo)

Nunca en `production`: los agentes no tienen acceso a Neon y la prueba la ejecuta el usuario, con su permiso.

1. **Rama de desarrollo.** En la consola de Neon, crea o elige una rama de desarrollo y aplica en ella las migraciones pendientes hasta `drizzle/0004_classy_tenebrous.sql`, como indica el README raíz. Copia su cadena administrativa (`DATABASE_MIGRATION_URL` de esa rama) y comprueba que no es la de `production`.
2. **App local.** En `.env.local`: `DATABASE_URL` de la rama de desarrollo, `APP_ORIGIN=http://localhost:3000` y un `AUTOMATION_API_TOKEN` aleatorio de al menos 32 caracteres. Arranca con `npm run dev`.
3. **n8n.** Credencial Header Auth con `Bearer <el mismo token de .env.local>`; en Config, `APP_BASE_URL=http://localhost:3000` (o `http://host.docker.internal:3000` desde Docker) y `TEAM_EMAILS` con una **dirección de prueba**.
4. **Seed.** Carga cuatro eventos `lead.created` ficticios (tres con viaje, entre ellos `maraton-demo-2027`, y uno sin viaje):

   ```sh
   psql "$DATABASE_MIGRATION_URL" -f scripts/sql/seed-automation-demo.sql
   ```

5. **Activa el workflow.** En uno o dos minutos llegan cuatro correos a la dirección de prueba. Estado de los eventos:

   ```sql
   SELECT id, status, attempts, last_error_code, available_at, lease_until, processed_at
   FROM automation_events ORDER BY created_at;
   ```

6. **Limpieza** al terminar (borra solo los eventos ficticios y sus reenvíos):

   ```sh
   psql "$DATABASE_MIGRATION_URL" -v cleanup=on -f scripts/sql/seed-automation-demo.sql
   ```

7. Antes de usarlo en producción, cambia Config (`APP_BASE_URL` de producción y `TEAM_EMAILS` del equipo) y la credencial Header Auth a la de producción.

Para las llamadas manuales a la API, carga el token en la terminal sin dejarlo en el historial ni en archivos:

```sh
read -rs AUTOMATION_API_TOKEN && export AUTOMATION_API_TOKEN
BASE=http://localhost:3000/api/automation/events
api() { curl -sS -X POST "$BASE/$1" -H "Authorization: Bearer $AUTOMATION_API_TOKEN" -H 'Content-Type: application/json' -d "$2"; echo; }
api claim '{"limit":1}'
```

## Checklist de la Fase 3

Copiada de la spec (`docs/specs/automation-outbox.md`, criterios de la Fase 3):

- [ ] Dado un evento ficticio `lead.created` con `tripSlug = 'maraton-demo-2027'`, cuando n8n lo procesa, entonces llega un correo a la dirección de prueba con asunto `Nuevo lead para maraton-demo-2027` y el enlace al CRM, sin datos personales, y el evento queda `succeeded`.
- [ ] Dada una credencial SMTP inválida, cuando n8n procesa un evento, entonces llama a `fail` con `email_send_failed` y el evento vuelve a `pending` con backoff.
- [ ] Checklist manual en una rama Neon de desarrollo (la ejecuta el usuario, con permiso; los agentes no tienen acceso a Neon): con la migración y el seed aplicados y `npm run dev` apuntando a esa rama,
  - [ ] n8n procesa los eventos ficticios, envía un correo por evento a una dirección de prueba (nunca la del equipo real) y quedan `succeeded`;
  - [ ] con n8n apagado los eventos siguen `pending`; al encenderlo se procesan;
  - [ ] si n8n se detiene tras el claim y antes del ack, el evento se reclama de nuevo al vencer el lease (≤ 5 min) y se procesa una sola vez gracias a la deduplicación;
  - [ ] dos ejecuciones de claim simultáneas no reciben el mismo evento;
  - [ ] un ack con token antiguo responde `409`;
  - [ ] un evento forzado a fallar acaba `dead` tras 8 intentos y `redrive-automation-event.sql` lo devuelve a `pending` dejando su fila de auditoría;
  - [ ] la limpieza del seed deja las tablas vacías.

### Cómo comprobar cada punto

Parte de un estado limpio (limpieza + seed) antes de cada prueba que lo necesite.

- **Correo y `succeeded`.** Pasos 4–5 de la prueba: cuatro correos (`Nuevo lead para maraton-demo-2027`, `…media-maraton-demo`, `…trail-demo-2027` y `Nuevo lead sin viaje`), cada uno con su enlace `/crm/leads/<leadId>` y sin datos personales; los cuatro eventos `succeeded` con `processed_at`.
- **SMTP inválida.** Cambia la contraseña de la credencial SMTP por una incorrecta y deja el workflow activo: el evento queda `pending`, `last_error_code = 'email_send_failed'` y `available_at` en el futuro; `attempts` sube en cada reintento.
- **n8n apagado.** Desactiva el workflow (o detén n8n), carga el seed y espera más de un minuto: los eventos siguen `pending` con `attempts = 0`. Actívalo: se procesan.
- **Parada entre claim y ack.** Dos variantes:
  - *Lease abandonada:* con el workflow inactivo, reclama un evento a mano (`api claim '{"limit":1}'`) y no lo confirmes, como si n8n se hubiera detenido. Activa el workflow: ese evento no se procesa hasta que vence su lease (≤ 5 min); después llega un solo correo y queda `succeeded` con `attempts = 2`.
  - *Deduplicación:* desactiva el nodo **Confirmar (ack)** (selecciónalo y pulsa `D`), guarda y deja el workflow activo: llega el correo, pero el evento queda `processing`. Reactiva el nodo y guarda: al vencer la lease el evento se reclama, **¿Ya enviado?** lo manda directo al ack sin segundo correo y queda `succeeded` con `attempts = 2`.
- **Claims simultáneos.** Con el workflow inactivo y el seed cargado: `api claim '{"limit":2}' & api claim '{"limit":2}' & wait`. Los `eventId` de las dos respuestas no se repiten.
- **Ack con token antiguo.** Con el workflow inactivo: `api claim '{"limit":1}'`, anota `eventId` y `leaseToken`; `api <eventId>/fail '{"leaseToken":"<leaseToken>","errorCode":"manual_test"}'` (el evento vuelve a `pending`) y después `api <eventId>/ack '{"leaseToken":"<leaseToken>"}'` → `409 {"error":"lease_conflict"}`.
- **`dead` y reenvío.** Con la SMTP inválida y el workflow activo, el evento llega a `dead` tras el intento 8 (unos 32–64 min). Para acelerarlo, **solo en la rama de desarrollo**, entre intentos: `UPDATE automation_events SET available_at = now() WHERE id = '<eventId>' AND status = 'pending';`. Comprueba `status = 'dead'`, `attempts = 8` y `last_error_code = 'email_send_failed'`. Restaura la SMTP y ejecuta `redrive-automation-event.sql` con tu `user_id` de staff (si la rama no tiene staff, créalo antes con `scripts/sql/bootstrap-admin.sql` en esa rama): el evento vuelve a `pending` con `attempts = 0`, aparece su fila en `automation_event_redrives` y n8n lo procesa.
- **Limpieza.** Tras `-v cleanup=on`, `SELECT count(*) FROM automation_events;` y `SELECT count(*) FROM automation_event_redrives;` devuelven 0 (si la rama no tenía otros eventos).
