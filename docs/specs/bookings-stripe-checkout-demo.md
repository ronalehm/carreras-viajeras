# Enmienda: modo DEMO de Stripe Checkout en el sitio publicado

- Estado: aprobado
- Spec base: [bookings-stripe-checkout-production.md](bookings-stripe-checkout-production.md) (aprobada; Fase 1 hecha, Fase 2 en curso).
- Módulos: booking-checkout, contracts, bookings, accounts (CRM), migraciones.
- Rama: `claude/blissful-davinci-pfjo58` (PR ronalehm/carreras-viajeras#53).
- Pedido del usuario (2026-10-30), en resumen:
  - Stripe Checkout en el sitio publicado, para una demostración académica.
  - Stripe exclusivamente en modo **TEST**: nunca `sk_live_`/`rk_live_` ni pagos reales.
  - Modo DEMO autorizado desde el servidor y limitado a cuentas de demostración.
  - Reservas marcadas como simuladas y separadas de los pagos reales.
  - Contrato `santiago-2027-v1` (borrador autorizado para pruebas).
  - Sin cambiar `NODE_ENV`.
  - Autorización explícita antes de tocar Neon producción, hacer merge, desplegar o activar.

## Qué cambia respecto a la spec base

La spec base solo habilita el Checkout en `NODE_ENV=production` con clave **live**. Esta enmienda añade un tercer estado, **demo**: producción con clave **test**, permitido solo bajo las condiciones de abajo. El camino live sigue en el código, pero no se configura; esta enmienda no lo habilita.

| Entorno | Clave | Modo resultante |
| --- | --- | --- |
| Desarrollo (`NODE_ENV≠production`) | test | `test` (como hoy) |
| Producción, `STRIPE_DEMO_MODE` ausente o `false` | live | `live` (no se usará) |
| Producción, `STRIPE_DEMO_MODE=true` | test | `demo` |
| Producción, `STRIPE_DEMO_MODE=true` | live | **apagado**: demo nunca acepta live |
| Producción, `STRIPE_DEMO_MODE` ausente | test | **apagado** (como en la spec base) |

## Requisitos

### A. Configuración (`lib/env.ts`)

- `getStripeCheckoutConfig()` admite el modo `demo`. Exige todo esto a la vez:
  - `NODE_ENV=production`;
  - `STRIPE_DEMO_MODE="true"`;
  - clave `sk_test_` o `rk_test_`;
  - `STRIPE_WEBHOOK_SECRET` presente;
  - `APP_ORIGIN` igual al HTTPS de producción;
  - `STRIPE_CHECKOUT_ENABLED="true"`.

  Con clave live y `STRIPE_DEMO_MODE=true`, el resultado es `enabled: false`, con el motivo `demo_requires_test_key`.
- `STRIPE_DEMO_MODE` y `STRIPE_CHECKOUT_ENABLED` son vars de texto en `wrangler.jsonc`, con `"false"` por defecto. `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` son **Secrets** de Cloudflare.
- `STRIPE_CHECKOUT_ORIGIN` no se usa: la spec base la elimina y las URLs de retorno salen de `APP_ORIGIN`. No hay que crearla en Cloudflare.
- En modo demo, `livemode` de eventos, sesiones y PaymentIntents debe ser `false`. Un evento con `livemode=true` responde 400 y no toca datos.

### B. Cuentas de demostración autorizadas (servidor)

- Nueva tabla `checkout_demo_participants`:
  - `user_id` (Clerk, PK), `note`, `granted_by`, `granted_at`;
  - `revoked_at` (NULL). El participante está activo mientras `revoked_at` sea NULL.
- En modo demo, `prepare`, `checkout` y `contract-acceptance` exigen que el `userId` de la sesión Clerk esté activo en esa tabla. Si no lo está, responden 404 `checkout_unavailable`, igual que con el checkout apagado. La autorización se lee en Neon en cada petición; metadata, cookies y formularios no la conceden.
- La página `/viajes/[slug]/checkout` y el botón de la ficha solo se muestran a participantes activos. Al resto, el sitio les presenta lo mismo que hoy.
- Altas y bajas:
  - CRM `/crm/contratos` → sección "Demo de checkout", con el permiso `offers.manage` (admin, super_admin). Se identifica a la persona por el correo primario verificado de su cuenta Clerk y se guarda su `userId`.
  - Alternativa (decisión 1): solo SQL manual autorizado, sin UI.

### C. Separación de lo simulado

- Columnas nuevas, todas NOT NULL:
  - `bookings.is_simulated boolean DEFAULT false`;
  - `booking_checkout_attempts.stripe_mode` (`test` | `live`);
  - `booking_stripe_settlements.stripe_mode` (`test` | `live`).
- Una reserva creada en modo demo nace con `is_simulated=true`, y sus intentos y liquidaciones con `stripe_mode='test'`. El webhook solo liquida si el `stripe_mode` del intento coincide con el `livemode` del evento.
- Metadata de la sesión Stripe: `environment=demo` y `simulated=true`, además de los ids internos.
- Descripción del producto en Checkout: "SIMULACIÓN – sin cargo real".
- **Capacidad:** las reservas simuladas no consumen ni retienen cupos de la oferta real. La asignación queda omitida, o en un contador separado, y no altera `offer_capacity_counters`.
- **Unicidad:** `bookings_trip_email_active_uq` excluye las reservas simuladas (índice parcial `AND NOT is_simulated`). Una prueba no bloquea una reserva real futura con el mismo correo.
- **Pantallas:** distintivo "SIMULADA" en el checkout, en el retorno de Stripe, en `/mis-carreras` y en el CRM de reservas. Los pagos simulados no suman en totales ni informes comerciales del CRM y se listan aparte.
- **Automatización:** las reservas simuladas no generan eventos de outbox comerciales hacia n8n (correos, journeys). Si algún evento es inevitable, se envía con `simulated=true` y n8n lo descarta.
- **Limpieza:** un procedimiento documentado, manual y autorizado borra las filas `is_simulated=true` y las suyas dependientes tras la demostración. No se ejecuta automáticamente.

### D. Contratos

- En modo demo se puede usar la versión **borrador** cuya `terms_version` coincide con la oferta (`santiago-2027-v1`), siempre que `allowDraftContracts` (solo test o demo) y el prefijo de documento de prueba se cumplan, como hoy. La aceptación queda registrada con su versión exacta.
- En modo live solo valen versiones `approved`. Ese camino no cambia y no depende de ningún flag de demo.
- El texto del borrador se carga en el CRM de contratos de la base de destino (operación de contenido, no de código). No se copian filas de `dev-stripe`.

### E. Base de datos: 0021

La 0021 de la spec base se amplía. Debe ser aditiva y compatible con el código actual de `main`:

- `CREATE TABLE checkout_demo_participants`.
- `ADD COLUMN bookings.is_simulated boolean NOT NULL DEFAULT false`.
- `ADD COLUMN stripe_mode` en intentos y liquidaciones, con `DEFAULT 'test'` y un enum nuevo `stripe_mode`.

  Las tablas están vacías en producción, así que el default no clasifica pagos reales como de prueba. El código siempre escribe el valor explícito.
- Recrear `bookings_trip_email_active_uq` con `WHERE status <> 'cancelled' AND NOT is_simulated`. Va en la misma transacción: `DROP INDEX` y `CREATE UNIQUE INDEX`.
- Lo ya previsto en la spec base: índice `booking_stripe_settlements(booking_id)`, renombrar las FK truncadas y quitar el check trivial.

## Procedimiento

Cada «Sí, apruebo» es independiente.

1. Fases de código: terminar la Fase 2 de la spec base y las tareas de esta enmienda. Checks, `build:worker` y revisión.
2. Workers Builds: diagnosticar y corregir el fallo actual de las builds de rama (hace falta el log, ver Bloqueos).
3. Ensayo: rama Neon desechable desde `production`.
   1. Aplicar 0020 y 0021 con `BEGIN/COMMIT`.
   2. Consultas de verificación.
   3. Arrancar la app contra ella (`npm run preview`, sin desplegar).
4. **«Sí, apruebo» (migración):** 0020 y 0021 en Neon `production`, más las consultas de verificación.
5. Stripe TEST, en el Dashboard del usuario:
   1. Clave restringida `rk_test_` con estos permisos: Checkout Sessions (escritura), PaymentIntents, Charges y Events (lectura).
   2. Endpoint `https://carreras-viajeras.mentec.dev/api/webhooks/stripe` en **modo test**, con los eventos de la spec base. Su `whsec_` es exclusivo de ese endpoint.
6. Cloudflare:
   1. Cargar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` como **Secret**.
   2. Dejar en `wrangler.jsonc`: `STRIPE_CHECKOUT_ENABLED: "false"` y `STRIPE_DEMO_MODE: "false"`.
7. **«Sí, apruebo» (merge):** Workers Builds despliega con el checkout apagado. Verificar `/api/health`, login de Clerk, `/mis-carreras`, CRM y que el checkout responde 404.
8. Contenido y cuentas:
   1. Cargar el borrador `santiago-2027-v1` en `/crm/contratos`.
   2. Dar de alta las cuentas de demostración.
   3. "Send test event" desde el Dashboard → 200 `ignored` en el log del Worker.
9. **«Sí, apruebo» (activación):** PR con `STRIPE_DEMO_MODE: "true"` y `STRIPE_CHECKOUT_ENABLED: "true"`, y merge.
10. Validación final del flujo:
    1. Sitio publicado.
    2. Login de Clerk con cuenta demo.
    3. Maratón Santiago 2027.
    4. Preparar la reserva.
    5. Checkout TEST.
    6. Anticipo US$300, cobrado en PEN a la tasa vigente (S/1.035 a 3,4500) con la tarjeta `4242 4242 4242 4242`.
    7. Pago visible en el Dashboard en modo test.
    8. Evento entregado (200) en el Dashboard.
    9. En Neon: reserva `confirmed` con `is_simulated=true`, liquidación `applied` con `stripe_mode='test'` y saldo US$10.700.
    10. Evento con `livemode=false` y ningún cargo en el Dashboard live.
11. Desactivación: `STRIPE_CHECKOUT_ENABLED: "false"` y `STRIPE_DEMO_MODE: "false"`. Limpieza de las filas simuladas solo con autorización.

## Plan de tareas: Fase D (tras la Fase 2 de la spec base)

- [ ] D.1 `lib/env.ts`: modo `demo` y sus tests, incluido el rechazo de live con demo.
- [x] D.2 0021 y `lib/db-schema.ts`: tabla de participantes, `is_simulated`, `stripe_mode`, índice parcial y los puntos previstos de la spec base. Aplicar 0000–0021 en PostgreSQL desechable y comprobar que no hay diferencias en `db:generate`.
- [ ] D.3 booking-checkout:
  - autorización de participante en las tres rutas y en la página;
  - `is_simulated` y `stripe_mode` al crear la reserva y el intento;
  - capacidad omitida;
  - metadata y descripción de la sesión;
  - el webhook coteja `stripe_mode` con `livemode`.
- [ ] D.4 Pantallas y CRM:
  - distintivo "SIMULADA" en checkout, retorno, `/mis-carreras` y CRM de reservas;
  - exclusión de totales;
  - sección "Demo de checkout" en `/crm/contratos` (si se aprueba la decisión 1);
  - sin outbox comercial para reservas simuladas.
- [ ] D.5 README: variables, procedimiento de esta spec, consultas de verificación y procedimiento de limpieza.

## Aceptación

- Con `NODE_ENV=production`:
  - clave live y demo → apagado;
  - clave test sin demo → apagado;
  - clave test, demo, whsec, origen de producción y flag → `demo`.
- Un usuario autenticado que no es participante activo recibe 404 en las tres rutas y no ve el botón.
- Un evento con `livemode=true` en demo responde 400 sin tocar datos.
- Las reservas demo tienen `is_simulated=true` y sus intentos y liquidaciones `stripe_mode='test'`. No alteran `offer_capacity_counters`, no bloquean una reserva real con el mismo correo, no suman en totales del CRM y no emiten outbox comercial.
- En modo live, un contrato borrador nunca se acepta (test existente conservado).
- 0020 y 0021 se aplican sobre una rama de ensayo de `production`; los checks de CI pasan, salvo los fallos conocidos de `main`, y `build:worker` pasa.
- El flujo del paso 10 queda documentado con evidencias redactadas: ids de evento y de sesión, estados y saldos. Sin secretos ni datos personales.

## Bloqueos y decisiones

1. Altas de participantes: sección en CRM (propuesto) o solo SQL manual autorizado.
2. Workers Builds: el check falla también en un PR solo de documentación (ronalehm/carreras-viajeras#52) y no publica el log en GitHub. Para corregirlo hace falta una de dos cosas:
   - el texto del error del panel de Cloudflare;
   - un token de API de Cloudflare de solo lectura de Workers Builds en la configuración del entorno de la sesión, como `CLOUDFLARE_API_TOKEN`.
3. Rama Neon de ensayo: su URL en la configuración del entorno como `NEON_REHEARSAL_URL` (sesión nueva), o el usuario ejecuta el ensayo con los comandos que se entregan.
4. Neon `production`: la migración la ejecuta el usuario con `DATABASE_MIGRATION_URL` desde su equipo. La credencial administrativa no se guarda en entornos de agente.
