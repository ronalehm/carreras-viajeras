-- Moved to the top by hand (drizzle-kit emits it last): the composite foreign key
-- "trip_offers_campaign_trip_fk" below references this unique constraint, so it must exist first.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_id_trip_uq" UNIQUE("id","trip_id");--> statement-breakpoint
CREATE TYPE "public"."trip_offer_status" AS ENUM('draft', 'approved', 'active', 'closed');--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usd_pen" numeric(10, 4) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_usd_pen_chk" CHECK ("exchange_rates"."usd_pen" > 0 AND "exchange_rates"."usd_pen" < 100)
);
--> statement-breakpoint
CREATE TABLE "trip_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"campaign_id" uuid,
	"version" integer NOT NULL,
	"status" "trip_offer_status" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"total_price_usd" integer NOT NULL,
	"discount_usd" integer DEFAULT 0 NOT NULL,
	"final_price_usd" integer GENERATED ALWAYS AS ("total_price_usd" - "discount_usd") STORED,
	"deposit_options_usd" integer[] DEFAULT '{}' NOT NULL,
	"balance_due_on" date,
	"bonus_description" text,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"capacity_limit" integer,
	"terms_version" text NOT NULL,
	"conditions" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"superseded_by" uuid,
	CONSTRAINT "trip_offers_version_chk" CHECK ("trip_offers"."version" >= 1),
	CONSTRAINT "trip_offers_name_chk" CHECK (char_length("trip_offers"."name") BETWEEN 2 AND 80),
	CONSTRAINT "trip_offers_price_chk" CHECK ("trip_offers"."total_price_usd" BETWEEN 1 AND 1000000 AND "trip_offers"."discount_usd" >= 0 AND "trip_offers"."discount_usd" < "trip_offers"."total_price_usd"),
	CONSTRAINT "trip_offers_deposits_chk" CHECK (cardinality("trip_offers"."deposit_options_usd") <= 3 AND array_position("trip_offers"."deposit_options_usd", NULL) IS NULL AND 0 < ALL ("trip_offers"."deposit_options_usd") AND ("trip_offers"."total_price_usd" - "trip_offers"."discount_usd") > ALL ("trip_offers"."deposit_options_usd")),
	CONSTRAINT "trip_offers_balance_chk" CHECK ((cardinality("trip_offers"."deposit_options_usd") = 0) = ("trip_offers"."balance_due_on" IS NULL)),
	CONSTRAINT "trip_offers_bonus_chk" CHECK ("trip_offers"."bonus_description" IS NULL OR char_length("trip_offers"."bonus_description") BETWEEN 2 AND 200),
	CONSTRAINT "trip_offers_validity_chk" CHECK ("trip_offers"."valid_until" IS NULL OR "trip_offers"."valid_until" >= "trip_offers"."valid_from"),
	CONSTRAINT "trip_offers_capacity_chk" CHECK ("trip_offers"."capacity_limit" IS NULL OR "trip_offers"."capacity_limit" BETWEEN 1 AND 10000),
	CONSTRAINT "trip_offers_terms_version_chk" CHECK ("trip_offers"."terms_version" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("trip_offers"."terms_version") BETWEEN 3 AND 60),
	CONSTRAINT "trip_offers_conditions_chk" CHECK (char_length("trip_offers"."conditions") BETWEEN 10 AND 2000),
	CONSTRAINT "trip_offers_approved_chk" CHECK (("trip_offers"."approved_at" IS NULL) = ("trip_offers"."approved_by" IS NULL) AND ("trip_offers"."status" <> 'draft' OR "trip_offers"."approved_at" IS NULL) AND ("trip_offers"."status" NOT IN ('approved', 'active') OR "trip_offers"."approved_at" IS NOT NULL)),
	CONSTRAINT "trip_offers_activated_chk" CHECK (("trip_offers"."activated_at" IS NULL) = ("trip_offers"."activated_by" IS NULL) AND ("trip_offers"."activated_at" IS NULL OR "trip_offers"."approved_at" IS NOT NULL) AND ("trip_offers"."status" <> 'active' OR "trip_offers"."activated_at" IS NOT NULL) AND ("trip_offers"."status" NOT IN ('draft', 'approved') OR "trip_offers"."activated_at" IS NULL)),
	CONSTRAINT "trip_offers_closed_chk" CHECK (("trip_offers"."status" = 'closed') = ("trip_offers"."closed_at" IS NOT NULL) AND ("trip_offers"."closed_at" IS NULL) = ("trip_offers"."closed_by" IS NULL) AND ("trip_offers"."superseded_by" IS NULL OR ("trip_offers"."status" = 'closed' AND "trip_offers"."activated_at" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_approved_by_profiles_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_activated_by_profiles_user_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_closed_by_profiles_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_superseded_by_trip_offers_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."trip_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offers" ADD CONSTRAINT "trip_offers_campaign_trip_fk" FOREIGN KEY ("campaign_id","trip_id") REFERENCES "public"."campaigns"("id","trip_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_created_idx" ON "exchange_rates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trip_offers_trip_idx" ON "trip_offers" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_offers_general_version_uq" ON "trip_offers" USING btree ("trip_id","version") WHERE "trip_offers"."campaign_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_offers_campaign_version_uq" ON "trip_offers" USING btree ("campaign_id","version") WHERE "trip_offers"."campaign_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_offers_general_active_uq" ON "trip_offers" USING btree ("trip_id") WHERE "trip_offers"."status" = 'active' AND "trip_offers"."campaign_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_offers_campaign_active_uq" ON "trip_offers" USING btree ("campaign_id") WHERE "trip_offers"."status" = 'active' AND "trip_offers"."campaign_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_offers_general_pending_uq" ON "trip_offers" USING btree ("trip_id") WHERE "trip_offers"."status" IN ('draft', 'approved') AND "trip_offers"."campaign_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_offers_campaign_pending_uq" ON "trip_offers" USING btree ("campaign_id") WHERE "trip_offers"."status" IN ('draft', 'approved') AND "trip_offers"."campaign_id" IS NOT NULL;