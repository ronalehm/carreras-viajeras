-- =============================================================================
-- bootstrap-admin.sql — Alta manual de un admin o del super admin del CRM
-- =============================================================================
--
-- Uso (desde la raíz del repositorio):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='<user_id exacto de Clerk: user_…>' \
--     -v email='<correo primario verificado de la cuenta>' \
--     -v reason='<operador>: <motivo>' \
--     [-v role=<admin | super_admin>] \
--     -f scripts/sql/bootstrap-admin.sql
--
-- Sin -v role se asigna 'admin' (comportamiento original del script).
--
-- Ejemplo (alta del super admin):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='user_2abcDEFghiJKLmnoPQRstuVWXyz' \
--     -v email='linderhassinger01@gmail.com' \
--     -v reason='<operador>: alta del super admin' \
--     -v role=super_admin \
--     -f scripts/sql/bootstrap-admin.sql
--
-- Requisitos previos:
--   - La cuenta ya existe en Clerk y su correo primario está verificado.
--     Este script no lo comprueba: verifícalo antes en el panel de Clerk.
--   - El user_id exacto (empieza por "user_") y el correo primario se copian
--     del panel de Clerk (Users -> la cuenta). Nunca se elige un usuario por
--     ser el primer registro ni por coincidir el correo.
--   - Formato de reason: "<operador>: <motivo>". No puede estar vacío.
--   - role solo admite 'admin' o 'super_admin'; cualquier otro valor falla.
--     Los demás roles se asignan desde el CRM.
--   - Las migraciones drizzle/0000_*.sql y, para role=super_admin,
--     drizzle/0009_chilly_patriot.sql ya están aplicadas en esa rama.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n.
--   - Ejecutar primero en una rama Neon de desarrollo. En production, solo con
--     autorización explícita.
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - Recorta espacios de user_id y email antes de guardarlos.
--   - Crea el perfil con el correo en minúsculas o reutiliza el existente
--     (si ya existía, su correo no se modifica).
--   - Inserta una asignación activa del rol indicado con granted_by = NULL
--     (NULL identifica las altas hechas por este script) y el reason dado.
--   - Falla sin cambiar nada si user_id, email o reason están vacíos, si role
--     no es 'admin' ni 'super_admin', o si el usuario ya tiene una asignación
--     activa de ese rol (índice único parcial staff_assignments_active_uq).
-- =============================================================================

\set ON_ERROR_STOP on

-- Sin -v role se asigna 'admin'. El valor se valida más abajo, en el bloque DO.
\if :{?role}
\else
  \set role admin
\endif

BEGIN;

-- psql no sustituye variables dentro de bloques $$ … $$, así que los valores
-- se pasan al bloque DO como ajustes locales de la transacción.
SELECT
  set_config('bootstrap_admin.user_id', :'user_id', true) IS NOT NULL AS user_id_loaded,
  set_config('bootstrap_admin.email', :'email', true) IS NOT NULL AS email_loaded,
  set_config('bootstrap_admin.reason', :'reason', true) IS NOT NULL AS reason_loaded,
  set_config('bootstrap_admin.role', :'role', true) IS NOT NULL AS role_loaded;

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
  IF current_setting('bootstrap_admin.role') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'bootstrap-admin: role debe ser "admin" o "super_admin"';
  END IF;
END
$$;

-- Se guardan los mismos valores recortados que se validaron arriba.
INSERT INTO profiles (user_id, email)
VALUES (trim(:'user_id'), lower(trim(:'email')))
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO staff_assignments (user_id, role, reason, granted_by)
VALUES (trim(:'user_id'), (:'role')::staff_role, :'reason', NULL)
RETURNING id, user_id, role, granted_at;

COMMIT;
