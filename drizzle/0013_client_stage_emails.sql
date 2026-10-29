CREATE TYPE "public"."client_email_status" AS ENUM('pending', 'claimed', 'sending', 'sent', 'failed', 'skipped', 'unknown');--> statement-breakpoint
CREATE TABLE "client_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_event_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"stage" "lead_stage" NOT NULL,
	"template_version" smallint DEFAULT 1 NOT NULL,
	"recipient" text,
	"sender" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "client_email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"attempt_token" uuid,
	"lease_until" timestamp with time zone,
	"execution_id" text,
	"smtp_message_id" text,
	"last_error_code" text,
	"retry_requested_by" text,
	"retry_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "client_emails_attempts_chk" CHECK ("client_emails"."attempts" BETWEEN 0 AND 3),
	CONSTRAINT "client_emails_lease_chk" CHECK (("client_emails"."status" IN ('claimed', 'sending')) = ("client_emails"."lease_until" IS NOT NULL)),
	CONSTRAINT "client_emails_token_chk" CHECK ("client_emails"."status" NOT IN ('claimed', 'sending', 'sent', 'unknown') OR "client_emails"."attempt_token" IS NOT NULL),
	CONSTRAINT "client_emails_sent_chk" CHECK (("client_emails"."status" = 'sent') = ("client_emails"."sent_at" IS NOT NULL)),
	CONSTRAINT "client_emails_content_chk" CHECK (char_length("client_emails"."subject") BETWEEN 1 AND 200 AND char_length("client_emails"."body") BETWEEN 1 AND 4000 AND char_length("client_emails"."sender") BETWEEN 3 AND 254 AND ("client_emails"."recipient" IS NULL OR char_length("client_emails"."recipient") BETWEEN 3 AND 254)),
	CONSTRAINT "client_emails_error_chk" CHECK ("client_emails"."last_error_code" IS NULL OR "client_emails"."last_error_code" ~ '^[a-z0-9_]{1,40}$'),
	CONSTRAINT "client_emails_execution_chk" CHECK ("client_emails"."execution_id" IS NULL OR char_length("client_emails"."execution_id") BETWEEN 1 AND 120),
	CONSTRAINT "client_emails_smtp_id_chk" CHECK ("client_emails"."smtp_message_id" IS NULL OR char_length("client_emails"."smtp_message_id") BETWEEN 1 AND 254)
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "client_emails" ADD CONSTRAINT "client_emails_source_event_id_outbox_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_emails" ADD CONSTRAINT "client_emails_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_emails" ADD CONSTRAINT "client_emails_retry_requested_by_profiles_user_id_fk" FOREIGN KEY ("retry_requested_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_emails_event_uq" ON "client_emails" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "client_emails_lead_created_idx" ON "client_emails" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "client_emails_ready_idx" ON "client_emails" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_sequence_uq" ON "outbox_events" USING btree ("sequence");--> statement-breakpoint
CREATE INDEX "outbox_events_lead_sequence_idx" ON "outbox_events" USING btree ("lead_id","sequence");