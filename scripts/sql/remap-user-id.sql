-- =============================================================================
-- remap-user-id.sql — Pasar una cuenta de staff de su id de Neon Auth a Clerk
-- =============================================================================
--
-- Uso (desde la raíz del repositorio), una ejecución por persona:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v old_user_id='<id de Neon Auth, de la tabla profiles>' \
--     -v new_user_id='<user_id exacto de Clerk: user_…>' \
--     -f scripts/sql/remap-user-id.sql
--
-- Ejemplo:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v old_user_id='0b6c1f5e-3c1d-4a8e-9f2a-6d7e8f901234' \
--     -v new_user_id='user_2abcDEFghiJKLmnoPQRstuVWXyz' \
--     -f scripts/sql/remap-user-id.sql
--
-- Requisitos previos:
--   - La persona ya creó su cuenta en Clerk con el MISMO correo que tiene en
--     profiles y lo verificó con el código. Este script no lo comprueba:
--     verifícalo antes en el panel de Clerk (Users -> la cuenta, correo
--     primario verificado).
--   - new_user_id: el user_id exacto (empieza por "user_") copiado del panel
--     de Clerk de la instancia que corresponde a esa rama de Neon (desarrollo
--     o producción; tienen usuarios e ids distintos).
--   - old_user_id: el id antiguo, copiado de
--       SELECT user_id, email FROM profiles WHERE email = lower('<correo>');
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n.
--   - Ejecutar primero en una rama Neon de desarrollo. En production, solo con
--     autorización explícita.
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - Falla sin cambiar nada si algún id está vacío, si son iguales, si no hay
--     exactamente un id con formato de Clerk (user_ seguido de letras y
--     números), si old_user_id no tiene perfil o si new_user_id ya lo tiene.
--   - Crea el perfil de new_user_id con el correo (y la fecha de alta) del
--     antiguo.
--   - Cambia old_user_id por new_user_id en TODAS las columnas de public con
--     clave foránea hacia profiles(user_id), descubiertas en pg_constraint (así
--     cubre también las tablas que añadan otras ramas), y en
--     bookings.runner_user_id, que no tiene clave foránea. Se conservan los
--     roles (staff_assignments) y la autoría (leads, actividades, viajes,
--     campañas, ofertas, reservas, pagos, avisos…). No toca updated_at.
--     lead_activities es de solo inserción, pero su actor_user_id también
--     cambia: es la misma persona con otra identidad.
--   - Borra el perfil antiguo. Si quedara alguna referencia fuera de public,
--     el borrado falla (ON DELETE restrict) y no cambia nada.
--   - Muestra cuántas filas cambió por columna (también las que quedan en 0).
--   - No lee ni modifica el schema neon_auth.
--   - Idempotente: repetirlo con los mismos ids falla sin cambiar nada,
--     porque old_user_id ya no tiene perfil.
--   - Vuelta atrás: el mismo script con los ids intercambiados (old_user_id =
--     el de Clerk y new_user_id = el de Neon Auth).
--   - Espera como mucho 10 s por bloqueos; si los hay, falla sin cambiar nada
--     y se puede repetir.
-- =============================================================================

\set ON_ERROR_STOP on

-- Una variable sin pasar se trata como vacía para que el bloque DO dé un
-- error claro en vez de un error de sintaxis.
\if :{?old_user_id}
\else
  \set old_user_id ''
\endif
\if :{?new_user_id}
\else
  \set new_user_id ''
\endif

BEGIN;

SET LOCAL lock_timeout = '10s';

-- psql no sustituye variables dentro de bloques $$ … $$, así que los valores
-- (recortados) se pasan al bloque DO como ajustes locales de la transacción.
SELECT
  set_config('remap_user_id.old_user_id', trim(:'old_user_id'), true) IS NOT NULL AS old_user_id_loaded,
  set_config('remap_user_id.new_user_id', trim(:'new_user_id'), true) IS NOT NULL AS new_user_id_loaded;

CREATE TEMP TABLE remap_user_id_report (
  table_name text NOT NULL,
  column_name text NOT NULL,
  rows_changed bigint NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  old_id constant text := current_setting('remap_user_id.old_user_id');
  new_id constant text := current_setting('remap_user_id.new_user_id');
  clerk_id_pattern constant text := '^user_[A-Za-z0-9]+$';
  ref record;
  changed bigint;
BEGIN
  IF length(old_id) = 0 THEN
    RAISE EXCEPTION 'remap-user-id: old_user_id no puede estar vacío';
  END IF;
  IF length(new_id) = 0 THEN
    RAISE EXCEPTION 'remap-user-id: new_user_id no puede estar vacío';
  END IF;
  IF old_id = new_id THEN
    RAISE EXCEPTION 'remap-user-id: old_user_id y new_user_id son iguales';
  END IF;
  -- Ida: Neon Auth -> Clerk. Vuelta atrás: Clerk -> Neon Auth.
  IF (old_id ~ clerk_id_pattern) = (new_id ~ clerk_id_pattern) THEN
    RAISE EXCEPTION 'remap-user-id: exactamente uno de los ids debe ser de Clerk (user_…); normalmente new_user_id';
  END IF;

  -- Bloquea el perfil antiguo: una inserción concurrente que lo referencie
  -- espera y después falla por la clave foránea.
  PERFORM 1 FROM public.profiles WHERE user_id = old_id FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = new_id) THEN
      RAISE EXCEPTION 'remap-user-id: old_user_id no tiene perfil y new_user_id sí: el remapeo ya se hizo';
    END IF;
    RAISE EXCEPTION 'remap-user-id: old_user_id no tiene perfil';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = new_id) THEN
    RAISE EXCEPTION 'remap-user-id: new_user_id ya tiene perfil';
  END IF;

  -- Las claves foráneas son ON DELETE/UPDATE restrict: no se cambia la clave
  -- primaria, sino que se crea el perfil nuevo, se mueven las referencias y
  -- se borra el antiguo.
  INSERT INTO public.profiles (user_id, email, created_at)
  SELECT new_id, email, created_at FROM public.profiles WHERE user_id = old_id;

  FOR ref IN
    SELECT c.oid::regclass AS table_ref, a.attname AS column_name
    FROM pg_constraint fk
    JOIN pg_class c ON c.oid = fk.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = fk.conkey[1]
    WHERE fk.contype = 'f'
      AND fk.confrelid = 'public.profiles'::regclass
      AND cardinality(fk.conkey) = 1
      AND n.nspname = 'public'
    UNION
    -- Sin clave foránea: los runners no tienen perfil.
    SELECT 'public.bookings'::regclass, 'runner_user_id'::name
    ORDER BY 1, 2
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', ref.table_ref, ref.column_name, ref.column_name)
      USING new_id, old_id;
    GET DIAGNOSTICS changed = ROW_COUNT;
    INSERT INTO remap_user_id_report VALUES (ref.table_ref::text, ref.column_name, changed);
  END LOOP;

  DELETE FROM public.profiles WHERE user_id = old_id;
END
$$;

SELECT table_name, column_name, rows_changed
FROM remap_user_id_report
ORDER BY table_name, column_name;

SELECT user_id, email, created_at
FROM profiles
WHERE user_id = current_setting('remap_user_id.new_user_id');

COMMIT;
