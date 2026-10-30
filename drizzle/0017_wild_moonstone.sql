ALTER TABLE "profiles" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "disabled_by" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_disabled_by_profiles_user_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_deleted_by_profiles_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_deleted_chk" CHECK ("profiles"."deleted_at" IS NULL OR "profiles"."disabled_at" IS NOT NULL);