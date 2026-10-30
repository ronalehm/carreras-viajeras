CREATE TYPE "public"."role_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "role_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"status" "role_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	CONSTRAINT "role_requests_role_chk" CHECK ("role_requests"."role"::text = 'admin'),
	CONSTRAINT "role_requests_decision_chk" CHECK (("role_requests"."status" = 'pending') = ("role_requests"."decided_at" IS NULL AND "role_requests"."decided_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_decided_by_profiles_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_requests_pending_user_uq" ON "role_requests" USING btree ("user_id") WHERE "role_requests"."status" = 'pending';