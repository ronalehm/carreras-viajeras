CREATE TYPE "public"."outbox_event_type" AS ENUM('lead.created', 'lead.stage_changed');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'succeeded', 'dead');--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'automation';--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "outbox_event_type" NOT NULL,
	"lead_id" uuid NOT NULL,
	"payload_version" smallint DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error_code" text,
	CONSTRAINT "outbox_events_payload_version_chk" CHECK ("outbox_events"."payload_version" >= 1),
	CONSTRAINT "outbox_events_payload_chk" CHECK (jsonb_typeof("outbox_events"."payload") = 'object' AND octet_length("outbox_events"."payload"::text) <= 1024),
	CONSTRAINT "outbox_events_attempts_chk" CHECK ("outbox_events"."attempts" BETWEEN 0 AND 8),
	CONSTRAINT "outbox_events_lease_chk" CHECK (("outbox_events"."status" = 'processing') = ("outbox_events"."lease_token" IS NOT NULL) AND ("outbox_events"."lease_token" IS NULL) = ("outbox_events"."lease_until" IS NULL)),
	CONSTRAINT "outbox_events_processed_chk" CHECK (("outbox_events"."status" IN ('succeeded', 'dead')) = ("outbox_events"."processed_at" IS NOT NULL)),
	CONSTRAINT "outbox_events_last_error_code_chk" CHECK ("outbox_events"."last_error_code" IS NULL OR "outbox_events"."last_error_code" ~ '^[a-z0-9_]{1,40}$')
);
--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_body_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_owner_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "submission_hash" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_events_ready_idx" ON "outbox_events" USING btree ("available_at") WHERE "outbox_events"."status" IN ('pending', 'processing');--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_source_event_id_outbox_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_activities_source_event_uq" ON "lead_activities" USING btree ("source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_idempotency_key_uq" ON "leads" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_chk" CHECK ("lead_activities"."actor_user_id" IS NOT NULL OR "lead_activities"."type" IN ('created', 'automation'));--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_event_chk" CHECK (("lead_activities"."type" = 'automation') = ("lead_activities"."source_event_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_body_chk" CHECK (("lead_activities"."body" IS NULL OR char_length("lead_activities"."body") BETWEEN 1 AND 2000) AND CASE WHEN "lead_activities"."type" IN ('note', 'call', 'message') THEN "lead_activities"."body" IS NOT NULL WHEN "lead_activities"."type" = 'automation' THEN "lead_activities"."body" IS NOT NULL AND char_length("lead_activities"."body") <= 500 WHEN "lead_activities"."type" IN ('created', 'stage_changed') THEN true ELSE "lead_activities"."body" IS NULL END);--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_owner_chk" CHECK (CASE WHEN "lead_activities"."type" = 'owner_changed' THEN "lead_activities"."owner_to" IS NOT NULL AND "lead_activities"."owner_from" IS DISTINCT FROM "lead_activities"."owner_to" ELSE "lead_activities"."owner_from" IS NULL AND "lead_activities"."owner_to" IS NULL END);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_chk" CHECK ("leads"."created_by" IS NOT NULL OR "leads"."source" = 'web_form');--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_submission_chk" CHECK (("leads"."idempotency_key" IS NULL) = ("leads"."submission_hash" IS NULL) AND ("leads"."submission_hash" IS NULL OR "leads"."submission_hash" ~ '^[0-9a-f]{64}$'));