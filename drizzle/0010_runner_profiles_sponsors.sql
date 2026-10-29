CREATE TYPE "public"."race_distance" AS ENUM('5k', '10k', '21k', '42k', 'ultra');--> statement-breakpoint
CREATE TYPE "public"."shirt_size" AS ENUM('xs', 's', 'm', 'l', 'xl', 'xxl');--> statement-breakpoint
CREATE TYPE "public"."travel_document_type" AS ENUM('passport', 'national_id', 'foreign_id');--> statement-breakpoint
CREATE TYPE "public"."trip_review_status" AS ENUM('in_review', 'changes_requested');--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'sponsor';--> statement-breakpoint
CREATE TABLE "runner_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"country" text,
	"city" text,
	"birth_date" date,
	"document_type" "travel_document_type",
	"document_number" text,
	"document_expires_on" date,
	"shirt_size" "shirt_size",
	"preferred_distance" "race_distance",
	"personal_best" text,
	"club" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"medical_notes" text,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runner_profiles_email_chk" CHECK ("runner_profiles"."email" = lower("runner_profiles"."email") AND char_length("runner_profiles"."email") <= 254),
	CONSTRAINT "runner_profiles_full_name_chk" CHECK (char_length("runner_profiles"."full_name") BETWEEN 2 AND 120),
	CONSTRAINT "runner_profiles_phone_chk" CHECK ("runner_profiles"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "runner_profiles_country_chk" CHECK ("runner_profiles"."country" IS NULL OR char_length("runner_profiles"."country") BETWEEN 2 AND 80),
	CONSTRAINT "runner_profiles_city_chk" CHECK ("runner_profiles"."city" IS NULL OR char_length("runner_profiles"."city") BETWEEN 2 AND 80),
	CONSTRAINT "runner_profiles_birth_date_chk" CHECK ("runner_profiles"."birth_date" IS NULL OR "runner_profiles"."birth_date" >= '1900-01-01'),
	CONSTRAINT "runner_profiles_document_number_chk" CHECK ("runner_profiles"."document_number" IS NULL OR "runner_profiles"."document_number" ~ '^[A-Z0-9]{4,20}$'),
	CONSTRAINT "runner_profiles_document_chk" CHECK (("runner_profiles"."document_type" IS NULL) = ("runner_profiles"."document_number" IS NULL) AND ("runner_profiles"."document_expires_on" IS NULL OR "runner_profiles"."document_type" IS NOT NULL)),
	CONSTRAINT "runner_profiles_personal_best_chk" CHECK ("runner_profiles"."personal_best" IS NULL OR char_length("runner_profiles"."personal_best") <= 60),
	CONSTRAINT "runner_profiles_club_chk" CHECK ("runner_profiles"."club" IS NULL OR char_length("runner_profiles"."club") <= 80),
	CONSTRAINT "runner_profiles_emergency_contact_name_chk" CHECK ("runner_profiles"."emergency_contact_name" IS NULL OR char_length("runner_profiles"."emergency_contact_name") BETWEEN 2 AND 120),
	CONSTRAINT "runner_profiles_emergency_contact_phone_chk" CHECK ("runner_profiles"."emergency_contact_phone" IS NULL OR "runner_profiles"."emergency_contact_phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "runner_profiles_emergency_chk" CHECK (("runner_profiles"."emergency_contact_name" IS NULL) = ("runner_profiles"."emergency_contact_phone" IS NULL)),
	CONSTRAINT "runner_profiles_medical_notes_chk" CHECK ("runner_profiles"."medical_notes" IS NULL OR char_length("runner_profiles"."medical_notes") <= 500),
	CONSTRAINT "runner_profiles_consent_version_chk" CHECK (char_length("runner_profiles"."consent_version") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"website_url" text,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsors_slug_format_chk" CHECK ("sponsors"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("sponsors"."slug") BETWEEN 3 AND 80),
	CONSTRAINT "sponsors_name_chk" CHECK (char_length("sponsors"."name") BETWEEN 2 AND 80),
	CONSTRAINT "sponsors_logo_url_chk" CHECK ("sponsors"."logo_url" IS NULL OR ("sponsors"."logo_url" LIKE 'https://%' AND char_length("sponsors"."logo_url") <= 2048)),
	CONSTRAINT "sponsors_website_url_chk" CHECK ("sponsors"."website_url" IS NULL OR ("sponsors"."website_url" LIKE 'https://%' AND char_length("sponsors"."website_url") <= 2048)),
	CONSTRAINT "sponsors_description_chk" CHECK ("sponsors"."description" IS NULL OR char_length("sponsors"."description") BETWEEN 10 AND 500)
);
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD COLUMN "sponsor_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN "sponsor_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "sponsor_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "review_status" "trip_review_status";--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_slug_uq" ON "sponsors" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trips_sponsor_idx" ON "trips" USING btree ("sponsor_id");--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_sponsor_chk" CHECK (("staff_assignments"."role"::text = 'sponsor') = ("staff_assignments"."sponsor_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_sponsor_chk" CHECK (("staff_invitations"."role"::text = 'sponsor') = ("staff_invitations"."sponsor_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_featured_chk" CHECK (NOT "trips"."featured" OR "trips"."status" = 'published');--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_review_chk" CHECK ("trips"."review_status" IS NULL OR ("trips"."sponsor_id" IS NOT NULL AND "trips"."status" = 'draft'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_review_note_chk" CHECK (("trips"."review_status" IS NOT DISTINCT FROM 'changes_requested') = ("trips"."review_note" IS NOT NULL) AND ("trips"."review_note" IS NULL OR char_length("trips"."review_note") BETWEEN 3 AND 500));