-- =============================================================================
-- seed-trips.sql — Viajes iniciales en borrador para un organizador
-- =============================================================================
--
-- NO EJECUTAR hasta que exista el organizador (cuenta de Clerk con el rol
-- organizer activo en Neon). Primero en una rama Neon de desarrollo; en
-- production, solo con autorización explícita.
--
-- Uso (desde la raíz del repositorio):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v organizer_email='<correo del organizador>' \
--     -f scripts/sql/seed-trips.sql
--
-- Ejemplo:
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v organizer_email='organizador@example.com' \
--     -f scripts/sql/seed-trips.sql
--
-- Requisitos previos:
--   - Migraciones drizzle/0000_*.sql a drizzle/0009_chilly_patriot.sql
--     aplicadas en esa rama (0009 añade el rol organizer y trips.organizer_id).
--   - El organizador ya tiene perfil y el rol organizer activo: un super_admin
--     lo invitó como "Organizador" desde /crm/admin/usuarios y la persona creó
--     su cuenta de Clerk con ese correo y lo verificó (al entrar en /crm se
--     acepta la invitación y se crean el perfil y la asignación).
--   - Credencial: DATABASE_MIGRATION_URL (administrativa). Nunca la URL de
--     runtime del Worker ni de n8n.
--   - Ningún script de package.json, build, arranque ni setup lo ejecuta.
--
-- Comportamiento:
--   - Todo va en una única transacción; cualquier error la deshace entera.
--   - organizer_email es obligatorio. Se compara recortado y en minúsculas con
--     profiles.email.
--   - Falla sin cambiar nada si organizer_email está vacío, si falta la
--     migración 0009, o si no hay EXACTAMENTE un perfil con ese correo y el
--     rol organizer activo (0 o más de 1).
--   - Bloquea la asignación organizer (FOR SHARE) hasta el final, así que una
--     revocación simultánea espera a que termine el seed.
--   - Inserta los viajes del seed con status = 'draft' y organizer_id = el
--     user_id de ese perfil. Ninguno aparece en la web hasta que se publique
--     desde /crm/viajes.
--   - Idempotente por slug: ON CONFLICT (slug) DO NOTHING. Un slug que ya
--     existe NO se modifica ni se asigna al organizador. Devuelve solo las
--     filas insertadas; repetirlo devuelve 0 filas.
--   - No escribe las columnas antiguas de precio de trips (price_usd,
--     deposit_usd, installments_price_usd, companion_price_usd,
--     payment_terms): el precio vive en las ofertas de /crm/ofertas y este
--     script no crea ofertas.
--   - Espera como mucho 10 s por bloqueos; si los hay, falla sin cambiar nada
--     y se puede repetir.
--
-- Datos: solo las carreras con datos completos en el repositorio (fecha,
-- distancias y resumen obligatorios). Hoy, Santiago 2027 (textos de
-- modules/landing/utils/trips.ts antes de 51ceec6). Río, Roma y el resto se
-- añadirán cuando haya datos confirmados.
-- =============================================================================

\set ON_ERROR_STOP on

-- Una variable sin pasar se trata como vacía para que el bloque DO dé un
-- error claro en vez de un error de sintaxis.
\if :{?organizer_email}
\else
  \set organizer_email ''
\endif

BEGIN;

SET LOCAL lock_timeout = '10s';

-- psql no sustituye variables dentro de bloques $$ … $$, así que el valor
-- (recortado y en minúsculas) se pasa al bloque DO como ajuste local.
SELECT
  set_config('seed_trips.organizer_email', lower(trim(:'organizer_email')), true) IS NOT NULL
    AS organizer_email_loaded;

DO $$
DECLARE
  v_email text := current_setting('seed_trips.organizer_email');
  v_count integer;
  v_user_id text;
BEGIN
  IF length(v_email) = 0 THEN
    RAISE EXCEPTION 'seed-trips: organizer_email no puede estar vacío (-v organizer_email=…)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'staff_role' AND e.enumlabel = 'organizer'
  ) THEN
    RAISE EXCEPTION 'seed-trips: falta la migración 0009 (rol organizer) en esta rama';
  END IF;

  -- Bloquea las asignaciones candidatas antes de contarlas.
  PERFORM 1
  FROM staff_assignments sa
  JOIN profiles p ON p.user_id = sa.user_id
  WHERE p.email = v_email
    AND sa.role = 'organizer'
    AND sa.revoked_at IS NULL
  FOR SHARE OF sa;

  -- staff_assignments_active_uq garantiza una sola asignación activa por
  -- (user_id, role): cada fila es un perfil distinto.
  SELECT count(*), min(p.user_id)
  INTO v_count, v_user_id
  FROM staff_assignments sa
  JOIN profiles p ON p.user_id = sa.user_id
  WHERE p.email = v_email
    AND sa.role = 'organizer'
    AND sa.revoked_at IS NULL;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'seed-trips: no hay ningún perfil con ese correo y el rol organizer activo';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'seed-trips: hay % perfiles con ese correo y el rol organizer activo; se esperaba exactamente uno', v_count;
  END IF;

  PERFORM set_config('seed_trips.organizer_id', v_user_id, true);
END
$$;

INSERT INTO trips (
  slug,
  title,
  city,
  country,
  race_date,
  start_date,
  end_date,
  distances,
  summary,
  includes,
  excludes,
  capacity,
  notes,
  image_url,
  official_url,
  status,
  organizer_id
)
VALUES
  (
    'maraton-santiago-2027',
    'Maratón de Santiago 2027',
    'Santiago',
    'Chile',
    DATE '2027-05-16',
    NULL,
    NULL,
    ARRAY['42K'],
    'Viaje grupal desde Lima para correr los 42K de la Maratón de Santiago: vuelos, 3 noches en hotel 4 estrellas, inscripción, desayuno y traslados.',
    ARRAY[
      'Inscripción: A la Maratón de Santiago, distancia 42K.',
      'Vuelos ida y vuelta: Lima → Santiago → Lima.',
      '3 noches de alojamiento: Hotel de 4 estrellas, cercano al punto de partida.',
      'Desayuno: Incluido durante la estadía del paquete.',
      'Traslados de aeropuerto: Aeropuerto de Santiago → hotel → aeropuerto.',
      'Expo en grupo: Traslado y acompañamiento grupal, en horarios establecidos.',
      'Camino a la partida: Traslado, acompañamiento y ubicación en el punto de partida.',
      'Seguro médico de viaje: Aseguradora, límites, exclusiones y cobertura deportiva por confirmar.',
      'Tarjeta de metro: Para movilidad en Santiago; carga o saldo incluido por precisar.'
    ],
    ARRAY[
      'Tours o actividades turísticas adicionales.',
      'Almuerzos, cenas y consumos personales.'
    ],
    100,
    -- Un párrafo por línea (la landing pinta cada línea no vacía como párrafo).
    'Aerolínea, fechas y horarios, equipaje y tasas; nombre y ubicación del hotel, ocupación de habitación y horario de desayuno; asignación efectiva de inscripción; horarios y alcance de traslados, acceso al punto de partida según el organizador; póliza de seguro y cobertura para correr la maratón; y saldo de la tarjeta de metro.'
      || E'\n'
      || 'El merchandising figuraba en la propuesta inicial y no aparece en el afiche actualizado: su inclusión está pendiente de ratificar.',
    'https://carreras-viajeras.mentec.dev/images/cover-santiago.webp',
    'https://maratondesantiago.cl/',
    'draft',
    current_setting('seed_trips.organizer_id')
  )
ON CONFLICT (slug) DO NOTHING
RETURNING id, slug, title, status, organizer_id;

COMMIT;
