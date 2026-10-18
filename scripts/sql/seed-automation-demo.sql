-- =============================================================================
-- seed-automation-demo.sql — Eventos ficticios lead.created para probar n8n
-- =============================================================================
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!  SOLO PARA UNA RAMA NEON DE DESARROLLO. NUNCA EN `production`.         !!
-- !!  Comprueba en la consola de Neon que la cadena de conexión apunta a     !!
-- !!  la rama de desarrollo antes de ejecutarlo. Los eventos de este script  !!
-- !!  harían que n8n enviara correos de leads inexistentes al equipo.        !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- Uso (desde la raíz del repositorio, con la URL de la rama de DESARROLLO):
--
--   Cargar los eventos ficticios:
--
--     psql "$DATABASE_MIGRATION_URL" \
--       -f scripts/sql/seed-automation-demo.sql
--
--   Limpieza (borra exactamente estos eventos y sus filas de reenvío):
--
--     psql "$DATABASE_MIGRATION_URL" \
--       -v cleanup=on \
--       -f scripts/sql/seed-automation-demo.sql
--
-- Requisitos previos:
--   - La migración drizzle/0003_*.sql (automation_events y
--     automation_event_redrives) ya está aplicada en esa rama.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa) de la rama de
--     desarrollo. Nunca la URL de runtime del Worker ni de n8n.
--
-- Eventos ficticios (UUID fijos con prefijo de000000, slugs con "demo"):
--
--   event id                              lead_id                               tripSlug
--   de000000-0000-4000-8000-000000002001  de000000-0000-4000-8000-000000001001  maraton-demo-2027
--   de000000-0000-4000-8000-000000002002  de000000-0000-4000-8000-000000001002  media-maraton-demo
--   de000000-0000-4000-8000-000000002003  de000000-0000-4000-8000-000000001003  trail-demo-2027
--   de000000-0000-4000-8000-000000002004  de000000-0000-4000-8000-000000001004  (null: sin viaje)
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - Carga: inserta los eventos como lead.created, payload_version = 1, estado
--     pending y disponibles ya, con payload
--     {"leadId": <lead_id>, "tripSlug": <slug | null>, "source": "landing_contact"}.
--     Es idempotente: si el evento de ese lead ya existe (índice único
--     automation_events_type_lead_uq) no se toca, aunque n8n ya lo haya
--     procesado. Devuelve solo las filas insertadas (0 filas al repetirlo).
--   - Limpieza (-v cleanup=on): borra primero las filas de
--     automation_event_redrives de esos eventos y después los eventos, sea cual
--     sea su estado. Devuelve las filas borradas. No toca ningún otro evento.
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

-- Lista única de eventos ficticios que usan la carga y la limpieza.
CREATE TEMP TABLE demo_automation_events (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL UNIQUE,
  trip_slug text
) ON COMMIT DROP;

INSERT INTO demo_automation_events (id, lead_id, trip_slug) VALUES
  ('de000000-0000-4000-8000-000000002001', 'de000000-0000-4000-8000-000000001001', 'maraton-demo-2027'),
  ('de000000-0000-4000-8000-000000002002', 'de000000-0000-4000-8000-000000001002', 'media-maraton-demo'),
  ('de000000-0000-4000-8000-000000002003', 'de000000-0000-4000-8000-000000001003', 'trail-demo-2027'),
  ('de000000-0000-4000-8000-000000002004', 'de000000-0000-4000-8000-000000001004', NULL);

\if :cleanup

-- Limpieza: los reenvíos primero (FK restrict hacia automation_events).
DELETE FROM automation_event_redrives AS r
USING automation_events AS e, demo_automation_events AS d
WHERE r.event_id = e.id
  AND e.type = 'lead.created'
  AND e.lead_id = d.lead_id
RETURNING r.id, r.event_id, r.performed_by, r.created_at;

DELETE FROM automation_events AS e
USING demo_automation_events AS d
WHERE e.type = 'lead.created'
  AND e.lead_id = d.lead_id
RETURNING e.id, e.lead_id, e.status, e.attempts;

\else

-- Carga.
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
ORDER BY d.id
ON CONFLICT (type, lead_id) DO NOTHING
RETURNING id, lead_id, payload, status, available_at;

\endif

COMMIT;
