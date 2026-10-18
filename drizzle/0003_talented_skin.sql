CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."itinerary_kind" AS ENUM('document', 'registration', 'flight', 'transfer', 'hotel', 'activity', 'race', 'return');--> statement-breakpoint
CREATE TYPE "public"."itinerary_status" AS ENUM('pending', 'provisional', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "booking_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_usd" integer NOT NULL,
	"paid_on" date NOT NULL,
	"concept" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	CONSTRAINT "booking_payments_amount_usd_chk" CHECK ("booking_payments"."amount_usd" > 0),
	CONSTRAINT "booking_payments_concept_chk" CHECK (char_length("booking_payments"."concept") BETWEEN 1 AND 80),
	CONSTRAINT "booking_payments_voided_chk" CHECK (("booking_payments"."voided_at" IS NULL) = ("booking_payments"."voided_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"participant_name" text NOT NULL,
	"participant_email" text NOT NULL,
	"runner_user_id" text,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"package_label" text NOT NULL,
	"distance" text,
	"total_usd" integer NOT NULL,
	"balance_due_on" date,
	"internal_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_id_trip_uq" UNIQUE("id","trip_id"),
	CONSTRAINT "bookings_participant_name_chk" CHECK (char_length("bookings"."participant_name") BETWEEN 2 AND 120),
	CONSTRAINT "bookings_participant_email_chk" CHECK ("bookings"."participant_email" = lower("bookings"."participant_email") AND char_length("bookings"."participant_email") <= 254),
	CONSTRAINT "bookings_package_label_chk" CHECK (char_length("bookings"."package_label") BETWEEN 1 AND 80),
	CONSTRAINT "bookings_distance_chk" CHECK ("bookings"."distance" IS NULL OR char_length("bookings"."distance") <= 20),
	CONSTRAINT "bookings_total_usd_chk" CHECK ("bookings"."total_usd" >= 0),
	CONSTRAINT "bookings_internal_note_chk" CHECK ("bookings"."internal_note" IS NULL OR char_length("bookings"."internal_note") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"booking_id" uuid,
	"kind" "itinerary_kind" NOT NULL,
	"status" "itinerary_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"location" text,
	"start_date" date,
	"start_time" time,
	"start_time_zone" text,
	"end_date" date,
	"end_time" time,
	"end_time_zone" text,
	"runner_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_items_title_chk" CHECK (char_length("itinerary_items"."title") BETWEEN 1 AND 120),
	CONSTRAINT "itinerary_items_details_chk" CHECK ("itinerary_items"."details" IS NULL OR char_length("itinerary_items"."details") <= 1000),
	CONSTRAINT "itinerary_items_location_chk" CHECK ("itinerary_items"."location" IS NULL OR char_length("itinerary_items"."location") <= 160),
	CONSTRAINT "itinerary_items_start_time_zone_chk" CHECK ("itinerary_items"."start_time_zone" IS NULL OR ("itinerary_items"."start_time_zone" ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length("itinerary_items"."start_time_zone") <= 64)),
	CONSTRAINT "itinerary_items_end_time_zone_chk" CHECK ("itinerary_items"."end_time_zone" IS NULL OR ("itinerary_items"."end_time_zone" ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length("itinerary_items"."end_time_zone") <= 64)),
	CONSTRAINT "itinerary_items_schedule_chk" CHECK (("itinerary_items"."start_time" IS NULL OR "itinerary_items"."start_date" IS NOT NULL) AND ("itinerary_items"."end_time" IS NULL OR "itinerary_items"."end_date" IS NOT NULL) AND ("itinerary_items"."start_time" IS NULL) = ("itinerary_items"."start_time_zone" IS NULL) AND ("itinerary_items"."end_time" IS NULL) = ("itinerary_items"."end_time_zone" IS NULL) AND ("itinerary_items"."end_date" IS NULL OR ("itinerary_items"."start_date" IS NOT NULL AND "itinerary_items"."end_date" >= "itinerary_items"."start_date")))
);
--> statement-breakpoint
CREATE TABLE "trip_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_updates_title_chk" CHECK (char_length("trip_updates"."title") BETWEEN 3 AND 120),
	CONSTRAINT "trip_updates_body_chk" CHECK (char_length("trip_updates"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_recorded_by_profiles_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_voided_by_profiles_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_booking_trip_fk" FOREIGN KEY ("booking_id","trip_id") REFERENCES "public"."bookings"("id","trip_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_updates" ADD CONSTRAINT "trip_updates_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_updates" ADD CONSTRAINT "trip_updates_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_payments_booking_idx" ON "booking_payments" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_trip_email_active_uq" ON "bookings" USING btree ("trip_id","participant_email") WHERE "bookings"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "bookings_runner_user_idx" ON "bookings" USING btree ("runner_user_id");--> statement-breakpoint
CREATE INDEX "bookings_unlinked_email_idx" ON "bookings" USING btree ("participant_email") WHERE "bookings"."runner_user_id" IS NULL;--> statement-breakpoint
CREATE INDEX "itinerary_items_trip_idx" ON "itinerary_items" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "itinerary_items_booking_idx" ON "itinerary_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "trip_updates_trip_published_idx" ON "trip_updates" USING btree ("trip_id","published_at");