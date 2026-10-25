CREATE TYPE "public"."trip_review_status" AS ENUM('in_review', 'changes_requested');--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'sponsor';--> statement-breakpoint
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