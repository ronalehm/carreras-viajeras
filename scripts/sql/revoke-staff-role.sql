-- =============================================================================
-- revoke-staff-role.sql — Revocación de EMERGENCIA de un rol de staff
-- =============================================================================
--
-- ADVERTENCIA: script solo para emergencias (p. ej. cuenta comprometida o CRM
-- inaccesible). NO protege al último admin: puede dejar el CRM sin ningún admin
-- activo. En condiciones normales, revoca roles desde el CRM, que sí lo impide.
--
-- Uso (desde la raíz del repositorio):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='<user_id exacto de Neon Auth>' \
--     -v role='<commercial | admin>' \
--     -f scripts/sql/revoke-staff-role.sql
--
-- Ejemplo:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v user_id='3f0c2a9e-0000-0000-0000-000000000000' \
--     -v role='commercial' \
--     -f scripts/sql/revoke-staff-role.sql
--
-- Requisitos previos:
--   - El user_id exacto se obtiene en la consola de Neon (Auth -> Users).
--   - role es 'commercial' o 'admin'; cualquier otro valor falla.
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n.
--   - Ejecutar primero en una rama Neon de desarrollo. En production, solo con
--     autorización explícita.
--
-- Comportamiento:
--   - Marca revoked_at = now() en la asignación activa de ese usuario y rol y
--     devuelve la fila afectada. revoked_by queda NULL (revocación manual).
--   - Si devuelve 0 filas, no había ninguna asignación activa: no cambia nada.
--   - El acceso se pierde en la siguiente petición al CRM.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

UPDATE staff_assignments
SET revoked_at = now()
WHERE user_id = :'user_id'
  AND role = :'role'
  AND revoked_at IS NULL
RETURNING id, user_id, role, revoked_at;

COMMIT;
