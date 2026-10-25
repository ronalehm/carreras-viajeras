ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_owner_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "automation_events" ADD CONSTRAINT "automation_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_idempotency_key_uq" ON "leads" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_chk" CHECK ("lead_activities"."actor_user_id" IS NOT NULL OR "lead_activities"."type" = 'created');--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_owner_chk" CHECK (CASE WHEN "lead_activities"."type" = 'owner_changed' THEN "lead_activities"."owner_to" IS NOT NULL AND "lead_activities"."owner_from" IS DISTINCT FROM "lead_activities"."owner_to" ELSE "lead_activities"."owner_from" IS NULL AND "lead_activities"."owner_to" IS NULL END);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_chk" CHECK ("leads"."owner_user_id" IS NOT NULL OR "leads"."source" = 'web_form');--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_chk" CHECK (("leads"."created_by" IS NULL) = ("leads"."source" = 'web_form'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_idempotency_chk" CHECK (CASE WHEN "leads"."source" = 'web_form' THEN "leads"."idempotency_key" IS NOT NULL AND "leads"."request_hash" IS NOT NULL AND "leads"."request_hash" ~ '^[0-9a-f]{64}$' ELSE "leads"."idempotency_key" IS NULL AND "leads"."request_hash" IS NULL END);