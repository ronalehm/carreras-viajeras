CREATE TYPE "public"."booking_checkout_attempt_kind" AS ENUM('initial', 'balance');--> statement-breakpoint
CREATE TYPE "public"."booking_checkout_attempt_status" AS ENUM('pending', 'created', 'completed', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."booking_stripe_settlement_status" AS ENUM('applied', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."contract_version_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."offer_capacity_allocation_status" AS ENUM('held', 'confirmed', 'released');--> statement-breakpoint
CREATE TABLE "booking_checkout_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "booking_checkout_attempt_kind" NOT NULL,
	"status" "booking_checkout_attempt_status" DEFAULT 'pending' NOT NULL,
	"quote_hash" text NOT NULL,
	"amount_usd" integer NOT NULL,
	"amount_pen_cents" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"stripe_session_id" text,
	"checkout_url" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_checkout_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "booking_checkout_attempts_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "booking_checkout_attempts_request_uq" UNIQUE("booking_id","request_id"),
	CONSTRAINT "booking_checkout_attempts_quote_hash_chk" CHECK ("booking_checkout_attempts"."quote_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "booking_checkout_attempts_amount_chk" CHECK ("booking_checkout_attempts"."amount_usd" > 0 AND "booking_checkout_attempts"."amount_pen_cents" > 0),
	CONSTRAINT "booking_checkout_attempts_session_chk" CHECK ("booking_checkout_attempts"."status" <> 'created' OR ("booking_checkout_attempts"."stripe_session_id" IS NOT NULL AND "booking_checkout_attempts"."checkout_url" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "booking_contract_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"runner_user_id" text NOT NULL,
	"contract_version_key" text NOT NULL,
	"contract_document_hash" text NOT NULL,
	"document_snapshot" text NOT NULL,
	"document_hash" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_contract_acceptances_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "booking_contract_acceptances_hash_chk" CHECK ("booking_contract_acceptances"."contract_document_hash" ~ '^[a-f0-9]{64}$' AND "booking_contract_acceptances"."document_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "booking_contract_acceptances_snapshot_chk" CHECK (char_length("booking_contract_acceptances"."document_snapshot") BETWEEN 20 AND 100000)
);
--> statement-breakpoint
CREATE TABLE "booking_stripe_event_receipts" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"attempt_id" uuid,
	"stripe_session_id" text,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_stripe_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"stripe_session_id" text NOT NULL,
	"payment_intent_id" text NOT NULL,
	"expected_amount_pen_cents" integer NOT NULL,
	"received_amount_pen_cents" integer NOT NULL,
	"amount_usd" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "booking_stripe_settlement_status" NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_stripe_settlements_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "booking_stripe_settlements_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "booking_stripe_settlements_payment_intent_id_unique" UNIQUE("payment_intent_id"),
	CONSTRAINT "booking_stripe_settlements_amount_chk" CHECK ("booking_stripe_settlements"."expected_amount_pen_cents" > 0 AND "booking_stripe_settlements"."received_amount_pen_cents" >= 0 AND "booking_stripe_settlements"."amount_usd" > 0),
	CONSTRAINT "booking_stripe_settlements_currency_chk" CHECK ("booking_stripe_settlements"."currency" ~ '^[a-z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "contract_version_status" DEFAULT 'draft' NOT NULL,
	"document_hash" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "contract_versions_version_key_unique" UNIQUE("version_key"),
	CONSTRAINT "contract_versions_key_chk" CHECK (char_length("contract_versions"."version_key") BETWEEN 3 AND 60 AND "contract_versions"."version_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "contract_versions_title_chk" CHECK (char_length("contract_versions"."title") BETWEEN 2 AND 140),
	CONSTRAINT "contract_versions_body_chk" CHECK (char_length("contract_versions"."body") BETWEEN 20 AND 50000),
	CONSTRAINT "contract_versions_approval_chk" CHECK (("contract_versions"."status" = 'approved') = ("contract_versions"."approved_by" IS NOT NULL) AND ("contract_versions"."status" = 'approved') = ("contract_versions"."approved_at" IS NOT NULL) AND ("contract_versions"."status" = 'approved') = ("contract_versions"."document_hash" IS NOT NULL) AND ("contract_versions"."document_hash" IS NULL OR "contract_versions"."document_hash" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "offer_capacity_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"status" "offer_capacity_allocation_status" DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_capacity_allocations_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "offer_capacity_allocations_release_chk" CHECK (("offer_capacity_allocations"."status" = 'released') = ("offer_capacity_allocations"."released_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "offer_capacity_counters" (
	"offer_version_id" uuid PRIMARY KEY NOT NULL,
	"capacity_limit" integer,
	"allocated_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_capacity_counters_limit_chk" CHECK ("offer_capacity_counters"."capacity_limit" IS NULL OR "offer_capacity_counters"."capacity_limit" BETWEEN 1 AND 10000),
	CONSTRAINT "offer_capacity_counters_count_chk" CHECK ("offer_capacity_counters"."allocated_count" >= 0 AND ("offer_capacity_counters"."capacity_limit" IS NULL OR "offer_capacity_counters"."allocated_count" <= "offer_capacity_counters"."capacity_limit"))
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_version_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_version" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_terms_version" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_conditions_snapshot" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "trip_includes_snapshot" text[];--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "trip_excludes_snapshot" text[];--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "initial_payment_usd" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_rate_usd_pen" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_amount_pen_cents" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_request_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_input_hash" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reservation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_checkout_attempts" ADD CONSTRAINT "booking_checkout_attempts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_contract_acceptances" ADD CONSTRAINT "booking_contract_acceptances_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_contract_acceptances" ADD CONSTRAINT "booking_contract_acceptances_contract_version_key_contract_versions_version_key_fk" FOREIGN KEY ("contract_version_key") REFERENCES "public"."contract_versions"("version_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_stripe_event_receipts" ADD CONSTRAINT "booking_stripe_event_receipts_attempt_id_booking_checkout_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."booking_checkout_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_stripe_settlements" ADD CONSTRAINT "booking_stripe_settlements_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_stripe_settlements" ADD CONSTRAINT "booking_stripe_settlements_attempt_id_booking_checkout_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."booking_checkout_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_approved_by_profiles_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_capacity_allocations" ADD CONSTRAINT "offer_capacity_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_capacity_allocations" ADD CONSTRAINT "offer_capacity_allocations_offer_version_id_trip_offers_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."trip_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_capacity_counters" ADD CONSTRAINT "offer_capacity_counters_offer_version_id_trip_offers_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."trip_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_checkout_attempts_active_uq" ON "booking_checkout_attempts" USING btree ("booking_id","kind") WHERE "booking_checkout_attempts"."status" IN ('pending', 'created');--> statement-breakpoint
CREATE INDEX "offer_capacity_allocations_offer_status_idx" ON "offer_capacity_allocations" USING btree ("offer_version_id","status");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_version_id_trip_offers_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."trip_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_campaign_id_campaigns_id_fk" FOREIGN KEY ("offer_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkout_rate_id_exchange_rates_id_fk" FOREIGN KEY ("checkout_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkout_request_uq" UNIQUE("checkout_request_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_or_runner_chk" CHECK ("bookings"."created_by" IS NOT NULL OR "bookings"."runner_user_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkout_snapshot_chk" CHECK (("bookings"."offer_version_id" IS NULL) = ("bookings"."offer_version" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."offer_terms_version" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."offer_conditions_snapshot" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."trip_includes_snapshot" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."trip_excludes_snapshot" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."initial_payment_usd" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."checkout_input_hash" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."reservation_expires_at" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."checkout_rate_id" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."checkout_rate_usd_pen" IS NULL) AND ("bookings"."offer_version_id" IS NULL) = ("bookings"."checkout_amount_pen_cents" IS NULL) AND ("bookings"."initial_payment_usd" IS NULL OR "bookings"."initial_payment_usd" BETWEEN 1 AND "bookings"."total_usd") AND ("bookings"."checkout_input_hash" IS NULL OR "bookings"."checkout_input_hash" ~ '^[a-f0-9]{64}$') AND ("bookings"."checkout_rate_usd_pen" IS NULL OR "bookings"."checkout_rate_usd_pen" > 0) AND ("bookings"."checkout_amount_pen_cents" IS NULL OR "bookings"."checkout_amount_pen_cents" > 0));