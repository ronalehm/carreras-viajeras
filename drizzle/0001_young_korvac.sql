CREATE TYPE "public"."trip_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"race_date" date NOT NULL,
	"start_date" date,
	"end_date" date,
	"distances" text[] NOT NULL,
	"summary" text NOT NULL,
	"includes" text[] DEFAULT '{}' NOT NULL,
	"price_usd" integer,
	"capacity" integer,
	"image_url" text,
	"status" "trip_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_slug_format_chk" CHECK ("trips"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("trips"."slug") BETWEEN 3 AND 80),
	CONSTRAINT "trips_travel_dates_chk" CHECK (("trips"."start_date" IS NULL) = ("trips"."end_date" IS NULL) AND ("trips"."start_date" IS NULL OR ("trips"."start_date" <= "trips"."race_date" AND "trips"."race_date" <= "trips"."end_date"))),
	CONSTRAINT "trips_distances_chk" CHECK (cardinality("trips"."distances") BETWEEN 1 AND 10),
	CONSTRAINT "trips_includes_chk" CHECK (cardinality("trips"."includes") <= 20),
	CONSTRAINT "trips_price_usd_chk" CHECK ("trips"."price_usd" IS NULL OR "trips"."price_usd" >= 0),
	CONSTRAINT "trips_capacity_chk" CHECK ("trips"."capacity" IS NULL OR "trips"."capacity" > 0),
	CONSTRAINT "trips_image_url_chk" CHECK ("trips"."image_url" IS NULL OR "trips"."image_url" LIKE 'https://%')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trips_slug_uq" ON "trips" USING btree ("slug");