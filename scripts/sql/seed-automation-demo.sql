-- =============================================================================
-- seed-automation-demo.sql — Leads web ficticios y sus eventos lead.created
--                            para probar n8n y el CRM
-- =============================================================================
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!  SOLO PARA UNA RAMA NEON DE DESARROLLO. NUNCA EN `production`.         !!
-- !!  Comprueba en la consola de Neon que la cadena de conexión apunta a     !!
-- !!  la rama de desarrollo antes de ejecutarlo. Los eventos de este script  !!
-- !!  harían que n8n enviara correos de leads ficticios al equipo.           !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- Uso (desde la raíz del repositorio, con la URL de la rama de DESARROLLO):
--
--   Cargar los leads y eventos ficticios:
--
--     psql "$DATABASE_MIGRATION_URL" \
--       -f scripts/sql/seed-automation-demo.sql
--
--   Limpieza (borra exactamente estos leads, sus actividades, sus eventos y
--   las filas de reenvío de esos eventos):
--
--     psql "$DATABASE_MIGRATION_URL" \
--       -v cleanup=on \
--       -f scripts/sql/seed-automation-demo.sql
--
-- Requisitos previos:
--   - Carga: las migraciones hasta drizzle/0006_*.sql (leads web sin
--     responsable, idempotencia y FK automation_events.lead_id → leads.id)
--     ya están aplicadas en esa rama.
--   - Limpieza: basta con drizzle/0005_*.sql (automation_events y
--     automation_event_redrives). Sirve también para borrar, antes de aplicar
--     0006, los eventos huérfanos que dejaba la versión anterior de este seed.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa) de la rama de
--     desarrollo. Nunca la URL de runtime del Worker ni de n8n.
--
-- Datos ficticios (UUID fijos con prefijo de000000, slugs con "demo"):
--
--   N  event id (…-8000-…)  lead_id (…-8000-…)  actividad (…-8000-…)  idempotency_key (…-8000-…)  tripSlug
--   1  000000002001         000000001001        000000003001          000000004001                maraton-demo-2027
--   2  000000002002         000000001002        000000003002          000000004002                media-maraton-demo
--   3  000000002003         000000001003        000000003003          000000004003                trail-demo-2027
--   4  000000002004         000000001004        000000003004          000000004004                (null: sin viaje)
--
--   Todos los UUID son de000000-0000-4000-8000-<columna>. Cada lead N es:
--   source web_form, stage new, sin responsable (owner_user_id NULL) ni
--   creador (created_by NULL), full_name "Lead demo N", phone +5190000000N,
--   email demoN@example.com, sin trip_id, destination_text "Destino demo",
--   consent_version web-form-v1 y
--   request_hash = encode(sha256(convert_to('demo-N', 'UTF8')), 'hex').
--   Su actividad es `created`, sin autor (actor_user_id NULL) ni body.
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - Carga: inserta, en este orden, los leads, sus actividades `created` y
--     los eventos como lead.created, payload_version = 1, estado pending y
--     disponibles ya, con payload
--     {"leadId": <lead_id>, "tripSlug": <slug | null>, "source": "landing_contact"}.
--     Es idempotente: un lead o una actividad con ese id, o el evento de ese
--     lead (índice único automation_events_type_lead_uq), no se tocan si ya
--     existen, aunque n8n ya haya procesado el evento o el lead se haya
--     editado en el CRM. Devuelve solo las filas insertadas (0 filas al
--     repetirlo).
--   - Limpieza (-v cleanup=on): borra, en este orden (las claves foráneas son
--     restrict), las filas de automation_event_redrives de esos eventos, los
--     eventos, todas las actividades de esos leads (también las añadidas
--     desde el CRM) y los leads, sea cual sea su estado. Devuelve las filas
--     borradas. No toca ningún otro lead ni evento.
-- =============================================================================

\set ON_ERROR_STOP on

-- Sin -v cleanup el script carga los datos. Un valor que no sea booleano
-- (on/off, true/false, yes/no, 1/0) falla aquí, antes de cambiar nada.
\if :{?cleanup}
\else
  \set cleanup off
\endif
SELECT (:'cleanup')::boolean AS cleanup \gset

BEGIN;

-- Lista única de datos ficticios que usan la carga y la limpieza.
CREATE TEMP TABLE demo_automation_events (
  n smallint PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  lead_id uuid NOT NULL UNIQUE,
  activity_id uuid NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  trip_slug text
) ON COMMIT DROP;

INSERT INTO demo_automation_events (n, id, lead_id, activity_id, idempotency_key, trip_slug) VALUES
  (1, 'de000000-0000-4000-8000-000000002001', 'de000000-0000-4000-8000-000000001001', 'de000000-0000-4000-8000-000000003001', 'de000000-0000-4000-8000-000000004001', 'maraton-demo-2027'),
  (2, 'de000000-0000-4000-8000-000000002002', 'de000000-0000-4000-8000-000000001002', 'de000000-0000-4000-8000-000000003002', 'de000000-0000-4000-8000-000000004002', 'media-maraton-demo'),
  (3, 'de000000-0000-4000-8000-000000002003', 'de000000-0000-4000-8000-000000001003', 'de000000-0000-4000-8000-000000003003', 'de000000-0000-4000-8000-000000004003', 'trail-demo-2027'),
  (4, 'de000000-0000-4000-8000-000000002004', 'de000000-0000-4000-8000-000000001004', 'de000000-0000-4000-8000-000000003004', 'de000000-0000-4000-8000-000000004004', NULL);

\if :cleanup

-- Limpieza: los reenvíos primero (FK restrict hacia automation_events).
DELETE FROM automation_event_redrives AS r
USING automation_events AS e, demo_automation_events AS d
WHERE r.event_id = e.id
  AND e.type = 'lead.created'
  AND e.lead_id = d.lead_id
RETURNING r.id, r.event_id, r.performed_by, r.created_at;

-- Después los eventos (FK restrict hacia leads desde 0006).
DELETE FROM automation_events AS e
USING demo_automation_events AS d
WHERE e.type = 'lead.created'
  AND e.lead_id = d.lead_id
RETURNING e.id, e.lead_id, e.status, e.attempts;

-- Después todas las actividades de esos leads (FK restrict hacia leads).
DELETE FROM lead_activities AS a
USING demo_automation_events AS d
WHERE a.lead_id = d.lead_id
RETURNING a.id, a.lead_id, a.type, a.created_at;

-- Por último, los leads.
DELETE FROM leads AS l
USING demo_automation_events AS d
WHERE l.id = d.lead_id
RETURNING l.id, l.source, l.stage, l.owner_user_id;

\else

-- Carga: primero los leads (el evento y la actividad los referencian).
-- ON CONFLICT (id): una idempotency_key repetida en otro lead es un error real
-- y deshace la transacción.
INSERT INTO leads (
  id, full_name, phone, email, destination_text, source,
  consent_version, idempotency_key, request_hash
)
SELECT
  d.lead_id,
  'Lead demo ' || d.n,
  '+5190000000' || d.n,
  'demo' || d.n || '@example.com',
  'Destino demo',
  'web_form',
  'web-form-v1',
  d.idempotency_key,
  encode(sha256(convert_to('demo-' || d.n, 'UTF8')), 'hex')
FROM demo_automation_events AS d
ORDER BY d.n
ON CONFLICT (id) DO NOTHING
RETURNING id, full_name, source, stage, owner_user_id, idempotency_key;

-- Actividad de alta, sin autor (como la crea el formulario web).
INSERT INTO lead_activities (id, lead_id, type)
SELECT d.activity_id, d.lead_id, 'created'
FROM demo_automation_events AS d
ORDER BY d.n
ON CONFLICT (id) DO NOTHING
RETURNING id, lead_id, type, actor_user_id;

-- Eventos de la outbox.
INSERT INTO automation_events (id, type, lead_id, payload_version, payload)
SELECT
  d.id,
  'lead.created',
  d.lead_id,
  1,
  jsonb_build_object(
    'leadId', d.lead_id::text,
    'tripSlug', d.trip_slug,
    'source', 'landing_contact'
  )
FROM demo_automation_events AS d
ORDER BY d.n
ON CONFLICT (type, lead_id) DO NOTHING
RETURNING id, lead_id, payload, status, available_at;

\endif

COMMIT;
