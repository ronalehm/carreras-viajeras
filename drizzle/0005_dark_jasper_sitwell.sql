CREATE TYPE "public"."contact_preference" AS ENUM('whatsapp', 'email', 'call');--> statement-breakpoint
CREATE TYPE "public"."lead_channel" AS ENUM('event', 'partner', 'referral', 'whatsapp', 'whatsapp_status', 'instagram', 'facebook', 'tiktok', 'youtube', 'google_ads', 'luma', 'web', 'other', 'unknown');--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'channel_changed';--> statement-breakpoint
ALTER TYPE "public"."lead_activity_type" ADD VALUE 'opted_out';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'google_form';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'import';--> statement-breakpoint
ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.follow_up_due';--> statement-breakpoint
ALTER TYPE "public"."outbox_event_type" ADD VALUE 'lead.opted_out';--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_created_by_chk";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "channel_from" "lead_channel";--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "channel_to" "lead_channel";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "channel" "lead_channel" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
-- Backfill (crm-journey-automation.md): existing leads keep their origin when it is known.
UPDATE "leads" SET "channel" = 'whatsapp' WHERE "source" = 'whatsapp';--> statement-breakpoint
UPDATE "leads" SET "channel" = 'web' WHERE "source" = 'web_form';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "origin_detail" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "referred_by" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "referral_permission" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_preference" "contact_preference";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_lead_active_uq" ON "bookings" USING btree ("lead_id") WHERE "bookings"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_dedupe_key_uq" ON "outbox_events" USING btree ("dedupe_key") WHERE "outbox_events"."dedupe_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_channel_chk" CHECK (CASE WHEN "lead_activities"."type" = 'channel_changed' THEN "lead_activities"."channel_from" IS NOT NULL AND "lead_activities"."channel_to" IS NOT NULL AND "lead_activities"."channel_from" <> "lead_activities"."channel_to" ELSE "lead_activities"."channel_from" IS NULL AND "lead_activities"."channel_to" IS NULL END);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_detail_chk" CHECK ("leads"."origin_detail" IS NULL OR char_length("leads"."origin_detail") BETWEEN 2 AND 120);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_utm_chk" CHECK (("leads"."utm_source" IS NULL OR char_length("leads"."utm_source") BETWEEN 1 AND 100) AND ("leads"."utm_medium" IS NULL OR char_length("leads"."utm_medium") BETWEEN 1 AND 100) AND ("leads"."utm_campaign" IS NULL OR char_length("leads"."utm_campaign") BETWEEN 1 AND 100));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_referred_by_chk" CHECK ("leads"."referred_by" IS NULL OR char_length("leads"."referred_by") BETWEEN 2 AND 120);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_referral_permission_chk" CHECK (NOT "leads"."referral_permission" OR "leads"."referred_by" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_opt_out_chk" CHECK ("leads"."contact_opt_out_at" IS NULL OR "leads"."next_action_date" IS NULL);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_chk" CHECK ("leads"."created_by" IS NOT NULL OR "leads"."source" IN ('web_form', 'google_form', 'import'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_dedupe_key_chk" CHECK (("outbox_events"."dedupe_key" IS NULL OR char_length("outbox_events"."dedupe_key") BETWEEN 1 AND 120) AND ("outbox_events"."type" <> 'lead.follow_up_due' OR "outbox_events"."dedupe_key" IS NOT NULL));