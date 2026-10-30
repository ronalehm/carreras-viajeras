-- Descuento de bienvenida para leads sin cuenta (docs/specs/crm-welcome-discount.md). Se aplica a mano, en un
-- solo bloque entre BEGIN; y COMMIT;, primero en la rama Neon dev-test y después en production, ANTES de mergear
-- y desplegar la Fase 1. No hay ALTER TYPE ... ADD VALUE sobre enums existentes: el enum welcome_code_status es
-- nuevo y puede usarse en la misma transacción.
-- Compatible con el código desplegado: crea tablas, funciones y un índice nuevos, añade a booking_benefits la
-- columna nullable welcome_code_id y recrea booking_benefits_price_chk sin invalidar filas existentes (todo
-- descuento actual tiene redemption_id y ningún welcome_code_id). No toca datos ni siembra configuración: el
-- importe y la vigencia los configura el admin en el CRM.
-- * welcome_discount_versions: configuración versionada e inmutable (solo puede desactivarse), con una sola
--   versión activa (índice único parcial). Reutiliza cv_reward_version_immutable de 0012.
-- * welcome_discount_codes: un código por evento lead.created (source_event_id único), de un solo uso, con el
--   importe copiado de su versión. «Caducado» se calcula: status 'issued' con expires_at vencido.
-- * booking_benefits_price_chk: un 'discount' tiene exactamente una fuente, redemption_id o welcome_code_id; un
--   'contractual' no tiene ninguna. El resto de condiciones de precio no cambia.
-- * profiles_email_idx: búsqueda de cuenta existente por correo, sin hacerlo único.
-- * cv_create_welcome_discount_version: con candado advisory, desactiva la versión activa y guarda la nueva
--   (activa o no; una versión inactiva equivale a apagar el descuento).
-- * cv_apply_welcome_code: aplica el código a la primera reserva de una cuenta con el mismo correo (Requisito 4).
--   Bloquea código y reserva; actualiza total_usd antes de insertar el booking_benefits, de modo que el candado
--   bookings_reward_price_guard de 0012 impide cambiar el total después, igual que cv_apply_booking_reward.
CREATE TYPE "public"."welcome_code_status" AS ENUM('issued', 'applied', 'void');--> statement-breakpoint
CREATE TABLE "welcome_discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"amount_usd" integer NOT NULL,
	"version_id" uuid NOT NULL,
	"source_event_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "welcome_code_status" DEFAULT 'issued' NOT NULL,
	"booking_id" uuid,
	"applied_at" timestamp with time zone,
	"applied_by" text,
	CONSTRAINT "welcome_discount_codes_email_chk" CHECK ("welcome_discount_codes"."email" = lower("welcome_discount_codes"."email") AND char_length("welcome_discount_codes"."email") <= 254),
	CONSTRAINT "welcome_discount_codes_code_chk" CHECK ("welcome_discount_codes"."code" ~ '^CV-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
	CONSTRAINT "welcome_discount_codes_amount_chk" CHECK ("welcome_discount_codes"."amount_usd" BETWEEN 1 AND 10000),
	CONSTRAINT "welcome_discount_codes_expiry_chk" CHECK ("welcome_discount_codes"."expires_at" > "welcome_discount_codes"."issued_at"),
	CONSTRAINT "welcome_discount_codes_applied_chk" CHECK (("welcome_discount_codes"."status" = 'applied') = ("welcome_discount_codes"."booking_id" IS NOT NULL AND "welcome_discount_codes"."applied_at" IS NOT NULL AND "welcome_discount_codes"."applied_by" IS NOT NULL) AND ("welcome_discount_codes"."booking_id" IS NULL) = ("welcome_discount_codes"."applied_at" IS NULL) AND ("welcome_discount_codes"."applied_at" IS NULL) = ("welcome_discount_codes"."applied_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "welcome_discount_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount_usd" integer NOT NULL,
	"validity_days" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welcome_discount_versions_values_chk" CHECK ("welcome_discount_versions"."amount_usd" BETWEEN 1 AND 10000 AND "welcome_discount_versions"."validity_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
ALTER TABLE "booking_benefits" DROP CONSTRAINT "booking_benefits_price_chk";--> statement-breakpoint
ALTER TABLE "booking_benefits" ADD COLUMN "welcome_code_id" uuid;--> statement-breakpoint
ALTER TABLE "welcome_discount_codes" ADD CONSTRAINT "welcome_discount_codes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_discount_codes" ADD CONSTRAINT "welcome_discount_codes_version_id_welcome_discount_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."welcome_discount_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_discount_codes" ADD CONSTRAINT "welcome_discount_codes_source_event_id_outbox_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_discount_codes" ADD CONSTRAINT "welcome_discount_codes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_discount_codes" ADD CONSTRAINT "welcome_discount_codes_applied_by_profiles_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_discount_versions" ADD CONSTRAINT "welcome_discount_versions_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "welcome_discount_codes_code_uq" ON "welcome_discount_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "welcome_discount_codes_source_event_uq" ON "welcome_discount_codes" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "welcome_discount_codes_email_status_idx" ON "welcome_discount_codes" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "welcome_discount_codes_lead_idx" ON "welcome_discount_codes" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "welcome_discount_versions_active_uq" ON "welcome_discount_versions" USING btree ("active") WHERE "welcome_discount_versions"."active";--> statement-breakpoint
ALTER TABLE "booking_benefits" ADD CONSTRAINT "booking_benefits_welcome_code_id_welcome_discount_codes_id_fk" FOREIGN KEY ("welcome_code_id") REFERENCES "public"."welcome_discount_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_benefits_welcome_code_uq" ON "booking_benefits" USING btree ("welcome_code_id");--> statement-breakpoint
ALTER TABLE "booking_benefits" ADD CONSTRAINT "booking_benefits_price_chk" CHECK (("booking_benefits"."kind" = 'contractual' AND "booking_benefits"."original_total_usd" IS NULL AND "booking_benefits"."discount_usd" IS NULL AND "booking_benefits"."final_total_usd" IS NULL AND "booking_benefits"."redemption_id" IS NULL AND "booking_benefits"."welcome_code_id" IS NULL) OR ("booking_benefits"."kind" = 'discount' AND "booking_benefits"."original_total_usd" IS NOT NULL AND "booking_benefits"."discount_usd" IS NOT NULL AND "booking_benefits"."final_total_usd" IS NOT NULL AND "booking_benefits"."original_total_usd" > 0 AND "booking_benefits"."discount_usd" > 0 AND "booking_benefits"."final_total_usd" > 0 AND "booking_benefits"."original_total_usd" - "booking_benefits"."discount_usd" = "booking_benefits"."final_total_usd" AND ("booking_benefits"."redemption_id" IS NULL) <> ("booking_benefits"."welcome_code_id" IS NULL)));--> statement-breakpoint
CREATE TRIGGER welcome_discount_versions_immutable BEFORE UPDATE OR DELETE ON welcome_discount_versions FOR EACH ROW EXECUTE FUNCTION cv_reward_version_immutable();
--> statement-breakpoint
CREATE FUNCTION cv_create_welcome_discount_version(p_actor text,p_amount integer,p_days integer,p_active boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cv-welcome-discount'));
  UPDATE welcome_discount_versions SET active=false WHERE active;
  INSERT INTO welcome_discount_versions(amount_usd,validity_days,active,created_by)
    VALUES(p_amount,p_days,coalesce(p_active,false),p_actor) RETURNING id INTO created;
  RETURN jsonb_build_object('status','success','code','created','id',created);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_apply_welcome_code(p_actor text,p_code text,p_booking uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c welcome_discount_codes%ROWTYPE; b bookings%ROWTYPE;
BEGIN
  SELECT * INTO c FROM welcome_discount_codes WHERE code=upper(btrim(p_code)) FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status','error','code','code_not_found'); END IF;
  IF c.status='issued' AND c.expires_at<clock_timestamp() THEN RETURN jsonb_build_object('status','error','code','code_expired'); END IF;
  IF c.status<>'issued' THEN RETURN jsonb_build_object('status','error','code','code_used'); END IF;
  -- Payment writers lock the booking first; after waiting, each statement below sees their committed rows.
  SELECT * INTO b FROM bookings WHERE id=p_booking FOR UPDATE;
  IF b.id IS NULL THEN RETURN jsonb_build_object('status','error','code','booking_not_eligible'); END IF;
  IF b.runner_user_id IS NULL THEN RETURN jsonb_build_object('status','error','code','booking_not_linked'); END IF;
  IF b.participant_email<>c.email THEN RETURN jsonb_build_object('status','error','code','email_mismatch'); END IF;
  IF EXISTS(SELECT 1 FROM bookings WHERE participant_email=c.email AND id<>b.id AND status<>'cancelled') THEN
    RETURN jsonb_build_object('status','error','code','not_first_booking');
  END IF;
  IF b.status<>'pending' OR EXISTS(SELECT 1 FROM booking_payments WHERE booking_id=b.id AND voided_at IS NULL) THEN
    RETURN jsonb_build_object('status','error','code','booking_not_eligible');
  END IF;
  IF EXISTS(SELECT 1 FROM booking_benefits WHERE booking_id=b.id AND kind='discount') THEN RETURN jsonb_build_object('status','error','code','discount_already_applied'); END IF;
  IF c.amount_usd>=b.total_usd THEN RETURN jsonb_build_object('status','error','code','discount_exceeds_total'); END IF;
  -- Price first, benefit second: the price guard only locks totals of bookings that already have a discount.
  UPDATE bookings SET total_usd=b.total_usd-c.amount_usd,updated_at=now() WHERE id=b.id;
  INSERT INTO booking_benefits(booking_id,runner_user_id,kind,title,description,original_total_usd,discount_usd,final_total_usd,welcome_code_id,created_by)
    VALUES(b.id,b.runner_user_id,'discount','Descuento de bienvenida','Descuento de bienvenida por crear tu cuenta, aplicado en tu primera reserva.',
      b.total_usd,c.amount_usd,b.total_usd-c.amount_usd,c.id,p_actor);
  UPDATE welcome_discount_codes SET status='applied',booking_id=b.id,applied_at=now(),applied_by=p_actor WHERE id=c.id;
  RETURN jsonb_build_object('status','success','code','applied','id',c.id);
END $$;
