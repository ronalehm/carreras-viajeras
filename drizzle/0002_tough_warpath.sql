CREATE TYPE "public"."lead_activity_type" AS ENUM('created', 'stage_changed', 'owner_changed', 'archived', 'note', 'call', 'message');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('whatsapp', 'web_form', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'quoted', 'reserved', 'paid', 'lost');--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "lead_activity_type" NOT NULL,
	"body" text,
	"stage_from" "lead_stage",
	"stage_to" "lead_stage",
	"owner_from" text,
	"owner_to" text,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_body_chk" CHECK (("lead_activities"."body" IS NULL OR char_length("lead_activities"."body") BETWEEN 1 AND 2000) AND CASE WHEN "lead_activities"."type" IN ('note', 'call', 'message') THEN "lead_activities"."body" IS NOT NULL WHEN "lead_activities"."type" IN ('created', 'stage_changed') THEN true ELSE "lead_activities"."body" IS NULL END),
	CONSTRAINT "lead_activities_stage_chk" CHECK (CASE WHEN "lead_activities"."type" = 'stage_changed' THEN "lead_activities"."stage_from" IS NOT NULL AND "lead_activities"."stage_to" IS NOT NULL AND "lead_activities"."stage_from" <> "lead_activities"."stage_to" ELSE "lead_activities"."stage_from" IS NULL AND "lead_activities"."stage_to" IS NULL END),
	CONSTRAINT "lead_activities_owner_chk" CHECK (CASE WHEN "lead_activities"."type" = 'owner_changed' THEN "lead_activities"."owner_from" IS NOT NULL AND "lead_activities"."owner_to" IS NOT NULL AND "lead_activities"."owner_from" <> "lead_activities"."owner_to" ELSE "lead_activities"."owner_from" IS NULL AND "lead_activities"."owner_to" IS NULL END)
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"location" text,
	"trip_id" uuid,
	"destination_text" text,
	"source" "lead_source" NOT NULL,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"lost_reason" text,
	"owner_user_id" text NOT NULL,
	"next_action_date" date,
	"next_action_note" text,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	CONSTRAINT "leads_full_name_chk" CHECK (char_length("leads"."full_name") BETWEEN 2 AND 120),
	CONSTRAINT "leads_phone_chk" CHECK ("leads"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "leads_email_chk" CHECK ("leads"."email" IS NULL OR ("leads"."email" = lower("leads"."email") AND char_length("leads"."email") <= 254)),
	CONSTRAINT "leads_location_chk" CHECK ("leads"."location" IS NULL OR char_length("leads"."location") <= 80),
	CONSTRAINT "leads_destination_text_chk" CHECK ("leads"."destination_text" IS NULL OR char_length("leads"."destination_text") <= 120),
	CONSTRAINT "leads_lost_reason_chk" CHECK (("leads"."stage" = 'lost') = ("leads"."lost_reason" IS NOT NULL) AND ("leads"."lost_reason" IS NULL OR char_length("leads"."lost_reason") <= 200)),
	CONSTRAINT "leads_next_action_chk" CHECK (("leads"."next_action_note" IS NULL OR ("leads"."next_action_date" IS NOT NULL AND char_length("leads"."next_action_note") <= 200)) AND ("leads"."next_action_date" IS NULL OR ("leads"."stage" NOT IN ('paid', 'lost') AND "leads"."archived_at" IS NULL))),
	CONSTRAINT "leads_consent_version_chk" CHECK (char_length("leads"."consent_version") BETWEEN 1 AND 40),
	CONSTRAINT "leads_archived_chk" CHECK (("leads"."archived_at" IS NULL) = ("leads"."archived_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_owner_from_profiles_user_id_fk" FOREIGN KEY ("owner_from") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_owner_to_profiles_user_id_fk" FOREIGN KEY ("owner_to") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_profiles_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_profiles_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_archived_by_profiles_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activities_lead_created_idx" ON "lead_activities" USING btree ("lead_id","created_at");