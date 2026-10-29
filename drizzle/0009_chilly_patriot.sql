ALTER TYPE "public"."staff_role" ADD VALUE 'super_admin';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'organizer';--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "organizer_id" text;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizer_id_profiles_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trips_organizer_idx" ON "trips" USING btree ("organizer_id");