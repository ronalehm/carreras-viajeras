CREATE TYPE "public"."content_category" AS ENUM('news', 'update', 'article');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."booking_benefit_kind" AS ENUM('contractual', 'discount');--> statement-breakpoint
CREATE TYPE "public"."reward_kind" AS ENUM('discount', 'benefit');--> statement-breakpoint
CREATE TYPE "public"."reward_ledger_kind" AS ENUM('referral_credit', 'referral_reversal', 'redemption', 'redemption_refund');--> statement-breakpoint
CREATE TYPE "public"."reward_redemption_status" AS ENUM('available', 'applied', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "content_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"draft_revision_id" uuid,
	"published_revision_id" uuid,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_posts_slug_chk" CHECK ("content_posts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("content_posts"."slug") BETWEEN 3 AND 100),
	CONSTRAINT "content_posts_version_chk" CHECK ("content_posts"."version" > 0),
	CONSTRAINT "content_posts_publication_chk" CHECK (("content_posts"."published_at" IS NULL) = ("content_posts"."published_by" IS NULL) AND ("content_posts"."status" <> 'published' OR ("content_posts"."published_revision_id" IS NOT NULL AND "content_posts"."published_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"category" "content_category" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"image_alt" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_id_post_uq" UNIQUE("id","post_id"),
	CONSTRAINT "content_revisions_version_chk" CHECK ("content_revisions"."version" > 0),
	CONSTRAINT "content_revisions_title_chk" CHECK (char_length("content_revisions"."title") BETWEEN 3 AND 160),
	CONSTRAINT "content_revisions_summary_chk" CHECK (char_length("content_revisions"."summary") BETWEEN 10 AND 400),
	CONSTRAINT "content_revisions_body_chk" CHECK (char_length("content_revisions"."body") BETWEEN 20 AND 30000),
	CONSTRAINT "content_revisions_image_chk" CHECK (("content_revisions"."image_url" IS NULL AND "content_revisions"."image_alt" IS NULL) OR ("content_revisions"."image_url" IS NOT NULL AND "content_revisions"."image_alt" IS NOT NULL AND "content_revisions"."image_url" LIKE 'https://%' AND char_length("content_revisions"."image_url") <= 2048 AND char_length("content_revisions"."image_alt") BETWEEN 3 AND 200))
);
--> statement-breakpoint
CREATE TABLE "booking_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"runner_user_id" text NOT NULL,
	"kind" "booking_benefit_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"original_total_usd" integer,
	"discount_usd" integer,
	"final_total_usd" integer,
	"redemption_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_benefits_content_chk" CHECK (char_length("booking_benefits"."title") BETWEEN 2 AND 120 AND char_length("booking_benefits"."description") BETWEEN 10 AND 4000),
	CONSTRAINT "booking_benefits_price_chk" CHECK (("booking_benefits"."kind" = 'contractual' AND "booking_benefits"."original_total_usd" IS NULL AND "booking_benefits"."discount_usd" IS NULL AND "booking_benefits"."final_total_usd" IS NULL AND "booking_benefits"."redemption_id" IS NULL) OR ("booking_benefits"."kind" = 'discount' AND "booking_benefits"."original_total_usd" IS NOT NULL AND "booking_benefits"."discount_usd" IS NOT NULL AND "booking_benefits"."final_total_usd" IS NOT NULL AND "booking_benefits"."original_total_usd" > 0 AND "booking_benefits"."discount_usd" > 0 AND "booking_benefits"."final_total_usd" > 0 AND "booking_benefits"."original_total_usd" - "booking_benefits"."discount_usd" = "booking_benefits"."final_total_usd" AND "booking_benefits"."redemption_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_chk" CHECK ("referral_codes"."code" ~ '^[A-Za-z0-9_-]{24,64}$')
);
--> statement-breakpoint
CREATE TABLE "reward_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_accounts_balance_chk" CHECK ("reward_accounts"."balance" BETWEEN -9007199254740991 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "reward_catalog_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"kind" "reward_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"cost_stars" integer NOT NULL,
	"discount_usd" integer,
	"active" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" text,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"stock" integer,
	"max_per_runner" integer NOT NULL,
	"redemption_days" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_catalog_versions_key_version_uq" UNIQUE("catalog_key","version"),
	CONSTRAINT "reward_catalog_versions_values_chk" CHECK ("reward_catalog_versions"."version" > 0 AND "reward_catalog_versions"."cost_stars" BETWEEN 1 AND 1000000 AND "reward_catalog_versions"."max_per_runner" BETWEEN 1 AND 10000 AND "reward_catalog_versions"."redemption_days" BETWEEN 1 AND 3650 AND ("reward_catalog_versions"."stock" IS NULL OR "reward_catalog_versions"."stock" BETWEEN 1 AND 1000000)),
	CONSTRAINT "reward_catalog_versions_content_chk" CHECK (char_length("reward_catalog_versions"."title") BETWEEN 2 AND 120 AND char_length("reward_catalog_versions"."description") BETWEEN 10 AND 4000),
	CONSTRAINT "reward_catalog_versions_discount_chk" CHECK (("reward_catalog_versions"."kind" = 'discount' AND "reward_catalog_versions"."discount_usd" IS NOT NULL AND "reward_catalog_versions"."discount_usd" BETWEEN 1 AND 1000000) OR ("reward_catalog_versions"."kind" = 'benefit' AND "reward_catalog_versions"."discount_usd" IS NULL)),
	CONSTRAINT "reward_catalog_versions_dates_chk" CHECK ("reward_catalog_versions"."valid_until" IS NULL OR "reward_catalog_versions"."valid_until" >= "reward_catalog_versions"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "reward_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "reward_ledger_kind" NOT NULL,
	"delta" integer NOT NULL,
	"cause_key" text NOT NULL,
	"referral_user_id" text,
	"redemption_id" uuid,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_ledger_delta_chk" CHECK ("reward_ledger"."delta" <> 0),
	CONSTRAINT "reward_ledger_cause_chk" CHECK (("reward_ledger"."referral_user_id" IS NOT NULL) <> ("reward_ledger"."redemption_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"status" "reward_redemption_status" DEFAULT 'available' NOT NULL,
	"kind" "reward_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"cost_stars" integer NOT NULL,
	"discount_usd" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" text,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reward_redemptions_request_uq" UNIQUE("user_id","request_key"),
	CONSTRAINT "reward_redemptions_cost_chk" CHECK ("reward_redemptions"."cost_stars" > 0),
	CONSTRAINT "reward_redemptions_discount_chk" CHECK (("reward_redemptions"."kind" = 'discount' AND "reward_redemptions"."discount_usd" IS NOT NULL AND "reward_redemptions"."discount_usd" > 0) OR ("reward_redemptions"."kind" = 'benefit' AND "reward_redemptions"."discount_usd" IS NULL)),
	CONSTRAINT "reward_redemptions_applied_chk" CHECK (("reward_redemptions"."status" = 'applied') = ("reward_redemptions"."applied_at" IS NOT NULL) AND ("reward_redemptions"."applied_at" IS NULL) = ("reward_redemptions"."applied_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "reward_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"points_per_referral" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" text,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"max_referrals_per_runner" integer,
	"terms" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_rule_versions_values_chk" CHECK ("reward_rule_versions"."version" > 0 AND "reward_rule_versions"."points_per_referral" BETWEEN 1 AND 1000000 AND ("reward_rule_versions"."max_referrals_per_runner" IS NULL OR "reward_rule_versions"."max_referrals_per_runner" BETWEEN 1 AND 1000000)),
	CONSTRAINT "reward_rule_versions_dates_chk" CHECK ("reward_rule_versions"."valid_until" IS NULL OR "reward_rule_versions"."valid_until" >= "reward_rule_versions"."valid_from"),
	CONSTRAINT "reward_rule_versions_terms_chk" CHECK (char_length("reward_rule_versions"."terms") BETWEEN 10 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "runner_referrals" (
	"referred_user_id" text PRIMARY KEY NOT NULL,
	"referrer_user_id" text NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"net_points" integer DEFAULT 0 NOT NULL,
	"eligibility_version" integer DEFAULT 0 NOT NULL,
	"credited_booking_id" uuid,
	"last_qualified_at" timestamp with time zone,
	CONSTRAINT "runner_referrals_self_chk" CHECK ("runner_referrals"."referred_user_id" <> "runner_referrals"."referrer_user_id"),
	CONSTRAINT "runner_referrals_points_chk" CHECK ("runner_referrals"."net_points" >= 0 AND "runner_referrals"."eligibility_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "booking_payments" ADD COLUMN "request_key" uuid;--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_published_by_profiles_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_draft_revision_fk" FOREIGN KEY ("draft_revision_id","id") REFERENCES "public"."content_revisions"("id","post_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_published_revision_fk" FOREIGN KEY ("published_revision_id","id") REFERENCES "public"."content_revisions"("id","post_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_post_id_content_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_benefits" ADD CONSTRAINT "booking_benefits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_benefits" ADD CONSTRAINT "booking_benefits_redemption_id_reward_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."reward_redemptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_benefits" ADD CONSTRAINT "booking_benefits_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_catalog_versions" ADD CONSTRAINT "reward_catalog_versions_deactivated_by_profiles_user_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_catalog_versions" ADD CONSTRAINT "reward_catalog_versions_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_user_id_reward_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reward_accounts"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_referral_user_id_runner_referrals_referred_user_id_fk" FOREIGN KEY ("referral_user_id") REFERENCES "public"."runner_referrals"("referred_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_redemption_id_reward_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."reward_redemptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_user_id_reward_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reward_accounts"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_catalog_version_id_reward_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."reward_catalog_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_applied_by_profiles_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_rule_versions" ADD CONSTRAINT "reward_rule_versions_deactivated_by_profiles_user_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_rule_versions" ADD CONSTRAINT "reward_rule_versions_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_referrals" ADD CONSTRAINT "runner_referrals_referrer_user_id_referral_codes_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."referral_codes"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_referrals" ADD CONSTRAINT "runner_referrals_rule_version_id_reward_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."reward_rule_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_referrals" ADD CONSTRAINT "runner_referrals_credited_booking_id_bookings_id_fk" FOREIGN KEY ("credited_booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_posts_slug_uq" ON "content_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_posts_public_idx" ON "content_posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_version_uq" ON "content_revisions" USING btree ("post_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_benefits_redemption_uq" ON "booking_benefits" USING btree ("redemption_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_benefits_discount_booking_uq" ON "booking_benefits" USING btree ("booking_id") WHERE "booking_benefits"."kind" = 'discount';--> statement-breakpoint
CREATE INDEX "booking_benefits_runner_idx" ON "booking_benefits" USING btree ("runner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_uq" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_catalog_versions_active_uq" ON "reward_catalog_versions" USING btree ("catalog_key") WHERE "reward_catalog_versions"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "reward_ledger_cause_uq" ON "reward_ledger" USING btree ("cause_key");--> statement-breakpoint
CREATE INDEX "reward_ledger_user_idx" ON "reward_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reward_redemptions_user_idx" ON "reward_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_rule_versions_version_uq" ON "reward_rule_versions" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_rule_versions_active_uq" ON "reward_rule_versions" USING btree ("active") WHERE "reward_rule_versions"."active";--> statement-breakpoint
CREATE INDEX "runner_referrals_referrer_idx" ON "runner_referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payments_request_uq" ON "booking_payments" USING btree ("booking_id","request_key");