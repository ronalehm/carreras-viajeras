-- =============================================================================
-- bootstrap-admin.sql — Alta manual del primer admin del CRM
-- =============================================================================
--
-- Uso (desde la raíz del repositorio):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='<user_id exacto de Neon Auth>' \
--     -v email='<correo de la cuenta>' \
--     -v reason='<operador>: <motivo>' \
--     -f scripts/sql/bootstrap-admin.sql
--
-- Ejemplo:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='3f0c2a9e-0000-0000-0000-000000000000' \
--     -v email='Ana@Example.com' \
--     -v reason='ana: alta del primer admin del CRM' \
--     -f scripts/sql/bootstrap-admin.sql
--
-- Requisitos previos:
--   - La cuenta ya existe en Neon Auth y tiene el correo verificado.
--     Este script no lo comprueba: verifícalo antes en la consola.
--   - El user_id exacto y el correo se obtienen en la consola de Neon
--     (Auth -> Users). Nunca se elige un usuario por ser el primer registro.
--   - Formato de reason: "<operador>: <motivo>". No puede estar vacío.
--   - La migración drizzle/0000_*.sql ya está aplicada en esa rama.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n.
--   - Ejecutar primero en una rama Neon de desarrollo. En production, solo con
--     autorización explícita.
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - Crea el perfil con el correo en minúsculas o reutiliza el existente
--     (si ya existía, su correo no se modifica).
--   - Inserta una asignación 'admin' activa con granted_by = NULL
--     (NULL identifica las altas hechas por este script).
--   - Falla si reason (o user_id / email) está vacío, o si el usuario ya tiene
--     una asignación 'admin' activa (índice único parcial
--     staff_assignments_active_uq).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- psql no sustituye variables dentro de bloques $$ … $$, así que los valores
-- se pasan al bloque DO como ajustes locales de la transacción.
SELECT
  set_config('bootstrap_admin.user_id', :'user_id', true) IS NOT NULL AS user_id_loaded,
  set_config('bootstrap_admin.email', :'email', true) IS NOT NULL AS email_loaded,
  set_config('bootstrap_admin.reason', :'reason', true) IS NOT NULL AS reason_loaded;

DO $$
BEGIN
  IF length(trim(current_setting('bootstrap_admin.user_id'))) = 0 THEN
    RAISE EXCEPTION 'bootstrap-admin: user_id no puede estar vacío';
  END IF;
  IF length(trim(current_setting('bootstrap_admin.email'))) = 0 THEN
    RAISE EXCEPTION 'bootstrap-admin: email no puede estar vacío';
  END IF;
  IF length(trim(current_setting('bootstrap_admin.reason'))) = 0 THEN
    RAISE EXCEPTION 'bootstrap-admin: reason no puede estar vacío (formato "<operador>: <motivo>")';
  END IF;
END
$$;

INSERT INTO profiles (user_id, email)
VALUES (:'user_id', lower(:'email'))
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO staff_assignments (user_id, role, reason, granted_by)
VALUES (:'user_id', 'admin', :'reason', NULL)
RETURNING id, user_id, role, granted_at;

COMMIT;
