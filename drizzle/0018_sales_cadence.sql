-- Secuencia automática de seguimiento comercial (docs/specs/crm-sales-cadence.md). Se aplica a mano, en dos
-- bloques, primero en la rama Neon dev-test y después en production, ANTES de mergear y desplegar la Fase 1.
-- Compatible con el código desplegado: solo añade valores de enum y relaja un CHECK; no toca filas existentes.
-- Bloque 1: los cuatro ALTER TYPE ... ADD VALUE, solos (sin BEGIN/COMMIT) o en su propia transacción ya
-- confirmada; PostgreSQL no deja usar un valor de enum nuevo en la transacción que lo añade.
-- Bloque 2: todo lo que sigue al comentario «Bloque 2», después de confirmar el bloque 1, entre BEGIN; y COMMIT;.
-- El bloque 2 recrea lead_activities_actor_chk para que opted_out admita actor_user_id NULL: la baja confirmada
-- por el cliente desde el enlace del correo no tiene autor. lead_activities_body_chk no cambia: opted_out y el
-- nuevo responded siguen con body NULL, y responded (marcado por el staff) sigue exigiendo autor.
ALTER TYPE "public"."client_email_kind" ADD VALUE 'cadence_proposal';--> statement-breakpoint
ALTER TYPE "public"."client_email_kind" ADD VALUE 'cadence_reminder';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'responded';--> statement-breakpoint
ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.cadence_due';--> statement-breakpoint
-- Bloque 2 (migration:split-transaction): después de confirmar el bloque 1, entre BEGIN; y COMMIT;.
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_actor_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_chk" CHECK ("lead_activities"."actor_user_id" IS NOT NULL OR "lead_activities"."type" IN ('created', 'automation', 're_registered', 'opted_out'));
