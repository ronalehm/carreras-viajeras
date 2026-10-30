-- Stripe Checkout: modo DEMO y ajustes previstos para producción (docs/specs/bookings-stripe-checkout-demo.md,
-- sección E, y docs/specs/bookings-stripe-checkout-production.md, "0021 propuesta"). Se aplica a mano, DESPUÉS de
-- la 0020, en un solo bloque entre BEGIN; y COMMIT;, primero en la rama Neon de ensayo y después en production,
-- ANTES de mergear y desplegar. No hay ALTER TYPE ... ADD VALUE sobre enums existentes: el enum stripe_mode es
-- nuevo y puede usarse en la misma transacción.
-- Compatible con el código desplegado: crea un enum y una tabla nuevos, añade columnas NOT NULL con DEFAULT (las
-- filas existentes quedan is_simulated=false y stripe_mode='test'; las tablas de Stripe están vacías en
-- production), recrea bookings_trip_email_active_uq excluyendo solo filas simuladas (ninguna fila existente lo es,
-- así que no puede fallar por duplicados), añade un índice, renombra dos FK sin revalidarlas y elimina un CHECK
-- siempre verdadero (created_by es NOT NULL desde la 0003). No toca datos ni neon_auth.
CREATE TYPE "public"."stripe_mode" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TABLE "checkout_demo_participants" (
	"user_id" text PRIMARY KEY NOT NULL,
	"note" text,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkout_demo_participants" ADD CONSTRAINT "checkout_demo_participants_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_demo_participants" ADD CONSTRAINT "checkout_demo_participants_granted_by_profiles_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_checkout_attempts" ADD COLUMN "stripe_mode" "stripe_mode" DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_stripe_settlements" ADD COLUMN "stripe_mode" "stripe_mode" DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Las reservas simuladas no bloquean una reserva real con el mismo correo. DROP y CREATE en la misma transacción.
DROP INDEX "bookings_trip_email_active_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_trip_email_active_uq" ON "bookings" USING btree ("trip_id","participant_email") WHERE "bookings"."status" <> 'cancelled' AND NOT "bookings"."is_simulated";--> statement-breakpoint
CREATE INDEX "booking_stripe_settlements_booking_idx" ON "booking_stripe_settlements" USING btree ("booking_id");--> statement-breakpoint
-- PostgreSQL truncó a 63 caracteres los nombres que generó la 0020; se renombran a los que declara lib/db-schema.ts.
ALTER TABLE "booking_stripe_event_receipts" RENAME CONSTRAINT "booking_stripe_event_receipts_attempt_id_booking_checkout_attem" TO "booking_stripe_event_receipts_attempt_id_fk";--> statement-breakpoint
ALTER TABLE "booking_stripe_settlements" RENAME CONSTRAINT "booking_stripe_settlements_attempt_id_booking_checkout_attempts" TO "booking_stripe_settlements_attempt_id_fk";--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_created_by_or_runner_chk";
