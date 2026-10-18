CREATE TYPE "public"."automation_event_status" AS ENUM('pending', 'processing', 'succeeded', 'dead');--> statement-breakpoint
CREATE TABLE "automation_event_redrives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"performed_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_event_redrives_reason_chk" CHECK (char_length("automation_event_redrives"."reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "automation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"payload_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "automation_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "automation_events_type_chk" CHECK ("automation_events"."type" IN ('lead.created')),
	CONSTRAINT "automation_events_payload_version_chk" CHECK ("automation_events"."payload_version" > 0),
	CONSTRAINT "automation_events_attempts_chk" CHECK ("automation_events"."attempts" BETWEEN 0 AND 8),
	CONSTRAINT "automation_events_last_error_code_chk" CHECK ("automation_events"."last_error_code" IS NULL OR "automation_events"."last_error_code" ~ '^[a-z0-9_]{1,64}$'),
	CONSTRAINT "automation_events_processing_lease_chk" CHECK ("automation_events"."status" <> 'processing' OR ("automation_events"."lease_token" IS NOT NULL AND "automation_events"."lease_until" IS NOT NULL)),
	CONSTRAINT "automation_events_processed_at_chk" CHECK (("automation_events"."status" = 'succeeded') = ("automation_events"."processed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "automation_event_redrives" ADD CONSTRAINT "automation_event_redrives_event_id_automation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_event_redrives" ADD CONSTRAINT "automation_event_redrives_performed_by_profiles_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_events_type_lead_uq" ON "automation_events" USING btree ("type","lead_id");--> statement-breakpoint
CREATE INDEX "automation_events_pending_idx" ON "automation_events" USING btree ("available_at","id") WHERE "automation_events"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "automation_events_lease_idx" ON "automation_events" USING btree ("lease_until") WHERE "automation_events"."status" = 'processing';