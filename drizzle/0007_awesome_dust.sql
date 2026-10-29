-- Block 1: apply alone and commit (PostgreSQL cannot use a new enum value in the transaction that adds it).
ALTER TYPE "public"."lead_activity_type" ADD VALUE 're_registered';--> statement-breakpoint
-- Block 2: everything below, after block 1, between BEGIN; and COMMIT;.
CREATE TYPE "public"."campaign_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"channel" "lead_channel" NOT NULL,
	"name" text NOT NULL,
	"event_name" text,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	CONSTRAINT "campaigns_code_chk" CHECK ("campaigns"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("campaigns"."code") BETWEEN 3 AND 32),
	CONSTRAINT "campaigns_channel_chk" CHECK ("campaigns"."channel" <> 'unknown'),
	CONSTRAINT "campaigns_name_chk" CHECK (char_length("campaigns"."name") BETWEEN 2 AND 80),
	CONSTRAINT "campaigns_event_name_chk" CHECK ("campaigns"."event_name" IS NULL OR char_length("campaigns"."event_name") BETWEEN 2 AND 120),
	CONSTRAINT "campaigns_closed_chk" CHECK (("campaigns"."status" = 'closed') = ("campaigns"."closed_at" IS NOT NULL) AND ("campaigns"."closed_at" IS NULL) = ("campaigns"."closed_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_body_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_actor_chk";--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "marketing_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_closed_by_profiles_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_code_uq" ON "campaigns" USING btree ("code");--> statement-breakpoint
CREATE INDEX "campaigns_trip_idx" ON "campaigns" USING btree ("trip_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_activities_submission_uq" ON "lead_activities" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "leads_campaign_idx" ON "leads" USING btree ("campaign_id") WHERE "leads"."campaign_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_submission_chk" CHECK (("lead_activities"."type" = 're_registered') = ("lead_activities"."submission_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_body_chk" CHECK (("lead_activities"."body" IS NULL OR char_length("lead_activities"."body") BETWEEN 1 AND 2000) AND CASE WHEN "lead_activities"."type" IN ('note', 'call', 'message') THEN "lead_activities"."body" IS NOT NULL WHEN "lead_activities"."type" IN ('automation', 're_registered') THEN "lead_activities"."body" IS NOT NULL AND char_length("lead_activities"."body") <= 500 WHEN "lead_activities"."type" IN ('created', 'stage_changed') THEN true ELSE "lead_activities"."body" IS NULL END);--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_chk" CHECK ("lead_activities"."actor_user_id" IS NOT NULL OR "lead_activities"."type" IN ('created', 'automation', 're_registered'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_chk" CHECK ("leads"."campaign_id" IS NULL OR "leads"."source" = 'web_form');