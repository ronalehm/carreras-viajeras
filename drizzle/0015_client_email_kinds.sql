-- Número definitivo 0015: se redactó como 0014 y main ocupó ese número con 0014_cute_nebula (visitas).
-- Mismas sentencias que la versión 0014 revisada; si ya se aplicó con ese número, no se repite.
-- Tipos de correo del ciclo de vida (docs/specs/crm-lifecycle-emails.md). Se aplica a mano, en dos bloques,
-- primero en la rama Neon dev-test y después en production, ANTES de mergear y desplegar el código de la Fase 1.
-- Bloque 1: los dos ALTER TYPE ... ADD VALUE, solos (sin BEGIN/COMMIT) o en su propia transacción ya confirmada;
-- PostgreSQL no deja usar un valor de enum nuevo en la transacción que lo añade.
-- Bloque 2: todo lo que sigue al comentario «Bloque 2», después de confirmar el bloque 1, entre BEGIN; y COMMIT;.
-- El bloque 2 también recrea leads_created_by_chk para que runner_account admita created_by NULL, como web_form,
-- google_form e import: el lead lo crea el propio runner, que no tiene fila en profiles. Usa el valor nuevo
-- 'runner_account', por eso va después del bloque 1.
-- Las filas existentes de client_emails quedan con kind = 'stage' (valor por defecto) y el insert actual no envía kind.
-- Aviso: el código desplegado hoy inserta con ON CONFLICT (source_event_id), que deja de tener índice único propio;
-- con CRM_EMAIL_AUTOMATION_ENABLED=true ese insert falla hasta desplegar la Fase 1. La automatización debe estar
-- apagada antes de migrar y seguir apagada hasta que la Fase 1 esté desplegada.
ALTER TYPE "public"."lead_source" ADD VALUE 'runner_account';--> statement-breakpoint
ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.owner_assigned';--> statement-breakpoint
-- Bloque 2 (migration:split-transaction): después de confirmar el bloque 1, entre BEGIN; y COMMIT;.
CREATE TYPE "public"."client_email_kind" AS ENUM('stage', 'welcome_registration', 'welcome_contact', 'welcome_account', 'follow_up', 'booking_confirmed', 'team_alert', 'owner_alert');--> statement-breakpoint
ALTER TABLE "client_emails" ADD COLUMN "kind" "client_email_kind" DEFAULT 'stage' NOT NULL;--> statement-breakpoint
DROP INDEX "client_emails_event_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "client_emails_event_kind_uq" ON "client_emails" USING btree ("source_event_id","kind");--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_created_by_chk";--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_chk" CHECK ("leads"."created_by" IS NOT NULL OR "leads"."source" IN ('web_form', 'google_form', 'import', 'runner_account'));
