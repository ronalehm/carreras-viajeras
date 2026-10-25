-- =============================================================================
-- redrive-automation-event.sql — Reenvío auditado de un evento `dead`
-- =============================================================================
--
-- Uso (desde la raíz del repositorio):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v event_id='<id del evento en automation_events>' \
--     -v performed_by='<user_id del staff que lo reenvía>' \
--     -v reason='<operador>: <motivo>' \
--     -f scripts/sql/redrive-automation-event.sql
--
-- Ejemplo:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v event_id='de000000-0000-4000-8000-000000002001' \
--     -v performed_by='3f0c2a9e-0000-0000-0000-000000000000' \
--     -v reason='ana: SMTP caído, reenvío tras restaurarlo' \
--     -f scripts/sql/redrive-automation-event.sql
--
-- Requisitos previos:
--   - La migración drizzle/0003_*.sql ya está aplicada en esa rama.
--   - event_id es el id del evento (el eventId que ve n8n), no el lead_id.
--   - performed_by es el user_id exacto de un staff con una asignación activa
--     en staff_assignments (y, por tanto, con fila en profiles).
--   - Formato de reason: "<operador>: <motivo>", de 1 a 500 caracteres tras
--     recortar espacios.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n: automation_event_redrives solo la escribe
--     este script.
--   - Ejecutar primero en una rama Neon de desarrollo. En production, solo con
--     autorización explícita.
--
-- Comportamiento:
--   - Una única sentencia (CTE): solo si el evento está `dead` y performed_by
--     es staff activo, inserta la fila de auditoría en automation_event_redrives
--     y devuelve el evento a `pending` con attempts = 0, disponible ya, sin
--     lease y sin last_error_code. Si no, no cambia nada.
--   - Devuelve siempre una fila:
--       applied               true si se reenvió.
--       previous_status       estado antes de ejecutar (NULL: el evento no existe).
--       current_status        estado tras ejecutar.
--       performed_by_is_staff false si performed_by no es staff activo.
--       redrive_id            id de la fila de auditoría (NULL si no se aplicó).
--   - Falla (y no cambia nada) si event_id no es un UUID o si reason queda
--     vacío o supera 500 caracteres al aplicarse (check
--     automation_event_redrives_reason_chk).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

WITH request AS (
  SELECT
    :'event_id'::uuid AS event_id,
    trim(:'performed_by') AS performed_by,
    trim(:'reason') AS reason
),
staff AS (
  SELECT EXISTS (
    SELECT 1
    FROM staff_assignments AS sa, request AS q
    WHERE sa.user_id = q.performed_by
      AND sa.revoked_at IS NULL
  ) AS is_staff
),
redriven AS (
  UPDATE automation_events AS e
  SET status = 'pending',
      attempts = 0,
      available_at = now(),
      lease_token = NULL,
      lease_until = NULL,
      last_error_code = NULL
  FROM request AS q, staff AS s
  WHERE e.id = q.event_id
    AND e.status = 'dead'
    AND s.is_staff
  RETURNING e.id, e.status
),
audit AS (
  INSERT INTO automation_event_redrives (event_id, performed_by, reason)
  SELECT r.id, q.performed_by, q.reason
  FROM redriven AS r, request AS q
  RETURNING id, event_id
)
-- Las lecturas de automation_events en esta SELECT ven el estado previo a la
-- sentencia; el estado nuevo sale de RETURNING (redriven).
SELECT
  q.event_id,
  (a.id IS NOT NULL) AS applied,
  e.status AS previous_status,
  coalesce(r.status, e.status) AS current_status,
  s.is_staff AS performed_by_is_staff,
  a.id AS redrive_id
FROM request AS q
CROSS JOIN staff AS s
LEFT JOIN automation_events AS e ON e.id = q.event_id
LEFT JOIN redriven AS r ON r.id = q.event_id
LEFT JOIN audit AS a ON a.event_id = q.event_id;

COMMIT;
