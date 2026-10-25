ALTER TYPE "public"."lead_activity_type" ADD VALUE 'source_changed';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'event';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'partner';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'referral';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'whatsapp_status';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'facebook';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'tiktok';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'youtube';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'google_ads';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'luma';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'unknown';--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "source_from" "lead_source";--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "source_to" "lead_source";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_detail" text;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_source_chk" CHECK (CASE WHEN "lead_activities"."type" = 'source_changed' THEN "lead_activities"."source_from" IS NOT NULL AND "lead_activities"."source_to" IS NOT NULL AND "lead_activities"."source_from" <> "lead_activities"."source_to" ELSE "lead_activities"."source_from" IS NULL AND "lead_activities"."source_to" IS NULL END);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_detail_chk" CHECK ("leads"."source_detail" IS NULL OR char_length("leads"."source_detail") BETWEEN 2 AND 120);