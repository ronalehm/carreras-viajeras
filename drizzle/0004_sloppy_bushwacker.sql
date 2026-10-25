ALTER TABLE "trips" ADD COLUMN "official_url" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "installments_price_usd" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "deposit_usd" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "companion_price_usd" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "excludes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_official_url_chk" CHECK ("trips"."official_url" IS NULL OR "trips"."official_url" LIKE 'https://%');--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_installments_price_usd_chk" CHECK ("trips"."installments_price_usd" IS NULL OR "trips"."installments_price_usd" >= 0);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_deposit_usd_chk" CHECK ("trips"."deposit_usd" IS NULL OR "trips"."deposit_usd" >= 0);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_companion_price_usd_chk" CHECK ("trips"."companion_price_usd" IS NULL OR "trips"."companion_price_usd" >= 0);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_excludes_chk" CHECK (cardinality("trips"."excludes") <= 20);