-- =============================================================================
-- revoke-staff-role.sql — Revocación de EMERGENCIA de un rol de staff
-- =============================================================================
--
-- ADVERTENCIA: script solo para emergencias (p. ej. cuenta comprometida o CRM
-- inaccesible). NO protege al último admin: puede dejar el CRM sin ningún admin
-- activo. En condiciones normales, revoca roles desde el CRM, que sí lo impide.
-- Sí protege al último super_admin: se niega a revocarlo (el CRM nunca gestiona
-- ese rol, así que este script es la única vía para quitarlo).
--
-- Uso (desde la raíz del repositorio):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='<user_id exacto de Clerk: user_…>' \
--     -v role='<commercial | organizer | admin | super_admin>' \
--     -f scripts/sql/revoke-staff-role.sql
--
-- Ejemplo:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='user_2abcDEFghiJKLmnoPQRstuVWXyz' \
--     -v role='commercial' \
--     -f scripts/sql/revoke-staff-role.sql
--
-- Requisitos previos:
--   - El user_id exacto se copia del panel de Clerk (Users -> la cuenta).
--   - role es 'commercial', 'organizer', 'admin' o 'super_admin'; cualquier
--     otro valor falla. 'organizer' y 'super_admin' requieren la migración
--     drizzle/0009_chilly_patriot.sql aplicada en esa rama.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n.
--   - Ejecutar primero en una rama Neon de desarrollo. En production, solo con
--     autorización explícita.
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - Con role='super_admin', primero bloquea todas las asignaciones
--     super_admin activas (FOR UPDATE) y las cuenta. Si el objetivo es el
--     último super_admin activo, falla con "no se puede revocar el último
--     super_admin" y no cambia nada. Una revocación concurrente espera al
--     bloqueo, así que dos ejecuciones no pueden quitar los dos últimos.
--   - Marca revoked_at = now() en la asignación activa de ese usuario y rol y
--     devuelve la fila afectada. revoked_by queda NULL (revocación manual).
--   - Si devuelve 0 filas, no había ninguna asignación activa: no cambia nada.
--   - El acceso se pierde en la siguiente petición al CRM.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- psql no sustituye variables dentro de bloques $$ … $$, así que los valores
-- se pasan al bloque DO como ajustes locales de la transacción.
SELECT
  set_config('revoke_staff_role.user_id', :'user_id', true) IS NOT NULL AS user_id_loaded,
  set_config('revoke_staff_role.role', :'role', true) IS NOT NULL AS role_loaded;

DO $$
DECLARE
  active_super_admins integer;
  target_is_active boolean;
BEGIN
  IF current_setting('revoke_staff_role.role') = 'super_admin' THEN
    -- Orden fijo para que dos ejecuciones concurrentes no se bloqueen entre sí.
    PERFORM 1
    FROM staff_assignments
    WHERE role = 'super_admin'
      AND revoked_at IS NULL
    ORDER BY id
    FOR UPDATE;

    SELECT count(*) INTO active_super_admins
    FROM staff_assignments
    WHERE role = 'super_admin'
      AND revoked_at IS NULL;

    SELECT EXISTS (
      SELECT 1
      FROM staff_assignments
      WHERE user_id = current_setting('revoke_staff_role.user_id')
        AND role = 'super_admin'
        AND revoked_at IS NULL
    ) INTO target_is_active;

    IF target_is_active AND active_super_admins <= 1 THEN
      RAISE EXCEPTION 'revoke-staff-role: no se puede revocar el último super_admin';
    END IF;
  END IF;
END
$$;

UPDATE staff_assignments
SET revoked_at = now()
WHERE user_id = :'user_id'
  AND role = :'role'
  AND revoked_at IS NULL
RETURNING id, user_id, role, revoked_at;

COMMIT;
