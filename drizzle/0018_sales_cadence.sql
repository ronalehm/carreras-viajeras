-- Secuencia automática de seguimiento comercial (docs/specs/crm-sales-cadence.md). Se aplica a mano, en dos
-- bloques, primero en la rama Neon dev-test y después en production, ANTES de mergear y desplegar la Fase 1.
-- Compatible con el código desplegado: solo añade valores de enum y recrea dos CHECK sin invalidar filas
-- existentes; no toca datos.
-- Bloque 1: los cuatro ALTER TYPE ... ADD VALUE, solos (sin BEGIN/COMMIT) o en su propia transacción ya
-- confirmada; PostgreSQL no deja usar un valor de enum nuevo en la transacción que lo añade.
-- Bloque 2: todo lo que sigue al comentario «Bloque 2», después de confirmar el bloque 1, entre BEGIN; y COMMIT;.
-- El bloque 2 recrea dos CHECK de lead_activities para la baja que el cliente confirma desde el enlace del
-- correo, que no tiene autor (Requisito 5 de la spec):
-- * lead_activities_actor_chk: actor_user_id NULL sigue limitado a created, automation y re_registered, y además
--   admite opted_out solo si lleva la nota obligatoria exacta 'Baja desde el enlace del correo'. Una baja sin
--   autor y sin esa nota, o con otra nota, se rechaza. Usa IS NOT DISTINCT FROM porque con "=" un body NULL
--   dejaría la expresión en NULL y un CHECK acepta NULL.
-- * lead_activities_body_chk: opted_out deja de exigir siempre body NULL; admite body NULL (baja desde el CRM,
--   con autor) o esa nota exacta solo cuando no hay autor. El resto de ramas no cambia: responded (marcado por el
--   staff) sigue con body NULL y exige autor.
-- La nota es fija para que la actividad identifique el origen de la baja sin datos del cliente.
ALTER TYPE "public"."client_email_kind" ADD VALUE 'cadence_proposal';--> statement-breakpoint
ALTER TYPE "public"."client_email_kind" ADD VALUE 'cadence_reminder';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'responded';--> statement-breakpoint
ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.cadence_due';--> statement-breakpoint
-- Bloque 2 (migration:split-transaction): después de confirmar el bloque 1, entre BEGIN; y COMMIT;.
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_body_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_actor_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_body_chk" CHECK (("lead_activities"."body" IS NULL OR char_length("lead_activities"."body") BETWEEN 1 AND 2000) AND CASE WHEN "lead_activities"."type" IN ('note', 'call', 'message') THEN "lead_activities"."body" IS NOT NULL WHEN "lead_activities"."type" IN ('automation', 're_registered') THEN "lead_activities"."body" IS NOT NULL AND char_length("lead_activities"."body") <= 500 WHEN "lead_activities"."type" IN ('created', 'stage_changed') THEN true WHEN "lead_activities"."type" = 'opted_out' THEN "lead_activities"."body" IS NULL OR ("lead_activities"."actor_user_id" IS NULL AND "lead_activities"."body" = 'Baja desde el enlace del correo') ELSE "lead_activities"."body" IS NULL END);--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_chk" CHECK ("lead_activities"."actor_user_id" IS NOT NULL OR "lead_activities"."type" IN ('created', 'automation', 're_registered') OR ("lead_activities"."type" = 'opted_out' AND "lead_activities"."body" IS NOT DISTINCT FROM 'Baja desde el enlace del correo'));
