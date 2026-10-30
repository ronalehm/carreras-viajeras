// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createEmbeddedDb } from "@/lib/testing/embeddedDb";

type Result = { status: string; code: string; id?: string };

// Schema, constraints and SQL functions of migration 0019 (crm-welcome-discount F1-T1).
// Only this isolated, in-memory database. Never Neon or a network connection.
describe("welcome discount schema against PostgreSQL", () => {
  let pg: PGlite;
  let tripA: string;
  let tripB: string;

  beforeAll(async () => {
    pg = (await createEmbeddedDb()).pg;
  }, 30000);
  afterAll(async () => {
    await pg?.close();
  });

  beforeEach(async () => {
    await pg.exec("TRUNCATE welcome_discount_versions, reward_accounts, leads, profiles, trips RESTART IDENTITY CASCADE");
    await pg.query(
      "INSERT INTO profiles(user_id,email) VALUES ('staff','staff@example.test'),('runner','ana@example.test')",
    );
    const trips = await pg.query<{ id: string }>(
      `INSERT INTO trips(slug,title,city,country,race_date,distances,summary) VALUES
        ('maraton-lima','Maratón de Lima','Lima','PE','2027-05-16','{42K}','Resumen'),
        ('maraton-berlin','Maratón de Berlín','Berlín','DE','2027-09-26','{42K}','Resumen')
      RETURNING id`,
    );
    [tripA, tripB] = trips.rows.map((row) => row.id);
  });

  async function createVersion(amount: number, days: number, active: boolean) {
    const result = await pg.query<{ result: Result }>(
      "SELECT cv_create_welcome_discount_version('staff',$1,$2,$3) AS result",
      [amount, days, active],
    );
    return result.rows[0].result;
  }
  async function versions() {
    const result = await pg.query<{ id: string; amount_usd: number; active: boolean }>(
      "SELECT id,amount_usd,active FROM welcome_discount_versions ORDER BY created_at,amount_usd",
    );
    return result.rows;
  }

  // A web lead, its lead.created event and a code issued from an active version.
  async function insertCode(
    options: { code?: string; email?: string; amount?: number; status?: string; expired?: boolean } = {},
  ) {
    const version = await pg.query<{ id: string }>(
      "INSERT INTO welcome_discount_versions(amount_usd,validity_days,created_by) VALUES (50,60,'staff') RETURNING id",
    );
    const lead = await pg.query<{ id: string }>(
      `INSERT INTO leads(full_name,phone,email,source,consent_version)
      VALUES ('Ana Vega','+51938127170','ana@example.test','web_form','test-v1') RETURNING id`,
    );
    const event = await pg.query<{ id: string }>(
      `INSERT INTO outbox_events(type,lead_id,payload) VALUES ('lead.created',$1,'{"source":"web_form"}') RETURNING id`,
      [lead.rows[0].id],
    );
    const result = await pg.query<{ id: string }>(
      `INSERT INTO welcome_discount_codes(lead_id,email,code,amount_usd,version_id,source_event_id,issued_at,expires_at,status)
      VALUES ($1,$2,$3,$4,$5,$6,
        CASE WHEN $7 THEN now()-interval '61 days' ELSE now() END,
        CASE WHEN $7 THEN now()-interval '1 day' ELSE now()+interval '60 days' END,$8::welcome_code_status)
      RETURNING id`,
      [
        lead.rows[0].id,
        options.email ?? "ana@example.test",
        options.code ?? "CV-ABCDEF",
        options.amount ?? 50,
        version.rows[0].id,
        event.rows[0].id,
        options.expired ?? false,
        options.status ?? "issued",
      ],
    );
    return { id: result.rows[0].id, leadId: lead.rows[0].id, eventId: event.rows[0].id, versionId: version.rows[0].id };
  }

  async function insertBooking(
    options: { email?: string; runner?: string | null; status?: string; total?: number; trip?: string } = {},
  ) {
    const result = await pg.query<{ id: string }>(
      `INSERT INTO bookings(trip_id,participant_name,participant_email,runner_user_id,status,package_label,total_usd,created_by)
      VALUES ($1,'Ana Vega',$2,$3,$4::booking_status,'Paquete',$5,'staff') RETURNING id`,
      [
        options.trip ?? tripA,
        options.email ?? "ana@example.test",
        options.runner === undefined ? "runner" : options.runner,
        options.status ?? "pending",
        options.total ?? 500,
      ],
    );
    return result.rows[0].id;
  }

  async function apply(code: string, bookingId: string) {
    const result = await pg.query<{ result: Result }>(
      "SELECT cv_apply_welcome_code('staff',$1,$2) AS result",
      [code, bookingId],
    );
    return result.rows[0].result;
  }

  async function constraintOf(statement: string, params: unknown[] = []) {
    try {
      await pg.query(statement, params);
    } catch (error) {
      return (error as { constraint?: string; message: string }).constraint ?? (error as Error).message;
    }
    return null;
  }

  describe("configuration versions", () => {
    it("keeps a single active version and deactivates the previous one on each change", async () => {
      const first = await createVersion(50, 60, true);
      expect(first).toMatchObject({ status: "success", code: "created" });
      const second = await createVersion(80, 30, true);
      expect(await versions()).toEqual([
        { id: first.id, amount_usd: 50, active: false },
        { id: second.id, amount_usd: 80, active: true },
      ]);
    });

    it("an inactive change only deactivates and stores the inactive version", async () => {
      await createVersion(50, 60, true);
      const off = await createVersion(70, 30, false);
      const rows = await versions();
      expect(rows.filter((row) => row.active)).toEqual([]);
      expect(rows.find((row) => row.id === off.id)).toEqual({ id: off.id, amount_usd: 70, active: false });
    });

    it("rejects a second active version and out-of-range values", async () => {
      await createVersion(50, 60, true);
      expect(
        await constraintOf(
          "INSERT INTO welcome_discount_versions(amount_usd,validity_days,active,created_by) VALUES (50,60,true,'staff')",
        ),
      ).toBe("welcome_discount_versions_active_uq");
      for (const [amount, days] of [[0, 60], [10001, 60], [50, 0], [50, 366]])
        expect(
          await constraintOf(
            "INSERT INTO welcome_discount_versions(amount_usd,validity_days,created_by) VALUES ($1,$2,'staff')",
            [amount, days],
          ),
        ).toBe("welcome_discount_versions_values_chk");
      await expect(createVersion(10000, 365, true)).resolves.toMatchObject({ status: "success" });
    });

    it("versions are immutable except for their active flag and are never deleted", async () => {
      const { id } = await createVersion(50, 60, true);
      expect(await constraintOf("UPDATE welcome_discount_versions SET amount_usd=60 WHERE id=$1", [id])).toBe(
        "reward version is immutable",
      );
      expect(await constraintOf("DELETE FROM welcome_discount_versions WHERE id=$1", [id])).toBe(
        "reward version is immutable",
      );
    });

    it("a new version does not alter codes already issued", async () => {
      const code = await insertCode({ amount: 50 });
      await createVersion(90, 10, true);
      const row = await pg.query<{ amount_usd: number }>("SELECT amount_usd FROM welcome_discount_codes WHERE id=$1", [
        code.id,
      ]);
      expect(row.rows[0].amount_usd).toBe(50);
    });
  });

  describe("code constraints", () => {
    it("accepts only CV- plus six characters of the unambiguous alphabet", async () => {
      for (const bad of ["CV-ABCDE", "CV-ABCDEFG", "cv-abcdef", "CV-ABCDE0", "CV-ABCDEO", "CV-ABCDE1", "CV-ABCDEI", "XX-ABCDEF"])
        await expect(insertCode({ code: bad })).rejects.toMatchObject({ constraint: "welcome_discount_codes_code_chk" });
      await expect(insertCode({ code: "CV-23456Z" })).resolves.toBeTruthy();
    });

    it("requires a lowercase email of at most 254 characters and a positive bounded amount", async () => {
      await expect(insertCode({ email: "Ana@example.test" })).rejects.toMatchObject({
        constraint: "welcome_discount_codes_email_chk",
      });
      await expect(insertCode({ email: `${"a".repeat(243)}@example.test` })).rejects.toMatchObject({
        constraint: "welcome_discount_codes_email_chk",
      });
      for (const amount of [0, 10001])
        await expect(insertCode({ amount })).rejects.toMatchObject({ constraint: "welcome_discount_codes_amount_chk" });
    });

    it("expiry must follow issue", async () => {
      const { id } = await insertCode();
      expect(await constraintOf("UPDATE welcome_discount_codes SET expires_at=issued_at WHERE id=$1", [id])).toBe(
        "welcome_discount_codes_expiry_chk",
      );
    });

    it("applied iff booking, date and actor are all present", async () => {
      const { id } = await insertCode();
      const bookingId = await insertBooking();
      expect(await constraintOf("UPDATE welcome_discount_codes SET status='applied' WHERE id=$1", [id])).toBe(
        "welcome_discount_codes_applied_chk",
      );
      expect(
        await constraintOf("UPDATE welcome_discount_codes SET booking_id=$2,applied_at=now(),applied_by='staff' WHERE id=$1", [
          id,
          bookingId,
        ]),
      ).toBe("welcome_discount_codes_applied_chk");
      expect(
        await constraintOf(
          "UPDATE welcome_discount_codes SET status='applied',booking_id=$2,applied_at=now() WHERE id=$1",
          [id, bookingId],
        ),
      ).toBe("welcome_discount_codes_applied_chk");
      expect(
        await constraintOf("UPDATE welcome_discount_codes SET status='void',applied_by='staff' WHERE id=$1", [id]),
      ).toBe("welcome_discount_codes_applied_chk");
      expect(await constraintOf("UPDATE welcome_discount_codes SET status='void' WHERE id=$1", [id])).toBeNull();
    });

    it("codes and source events are unique", async () => {
      const first = await insertCode();
      await expect(insertCode({ code: "CV-ABCDEF" })).rejects.toMatchObject({ constraint: "welcome_discount_codes_code_uq" });
      expect(
        await constraintOf(
          `INSERT INTO welcome_discount_codes(lead_id,email,code,amount_usd,version_id,source_event_id,expires_at)
          VALUES ($1,'ana@example.test','CV-ZZZZZZ',50,$2,$3,now()+interval '1 day')`,
          [first.leadId, first.versionId, first.eventId],
        ),
      ).toBe("welcome_discount_codes_source_event_uq");
      const conflict = await pg.query(
        `INSERT INTO welcome_discount_codes(lead_id,email,code,amount_usd,version_id,source_event_id,expires_at)
        VALUES ($1,'ana@example.test','CV-ZZZZZZ',50,$2,$3,now()+interval '1 day') ON CONFLICT (source_event_id) DO NOTHING`,
        [first.leadId, first.versionId, first.eventId],
      );
      expect(conflict.affectedRows).toBe(0);
    });
  });

  describe("booking_benefits sources", () => {
    async function insertBenefit(kind: string, withWelcome: boolean, withRedemption: boolean) {
      const code = await insertCode();
      const bookingId = await insertBooking();
      let redemption: string | null = null;
      if (withRedemption) {
        await pg.query("INSERT INTO reward_accounts(user_id,balance) VALUES ('runner',0)");
        const catalog = await pg.query<{ id: string }>(
          `INSERT INTO reward_catalog_versions(version,kind,title,description,cost_stars,discount_usd,max_per_runner,redemption_days,valid_from,created_by)
          VALUES (1,'discount','Premio','Condiciones publicadas.',10,20,1,30,current_date,'staff') RETURNING id`,
        );
        const row = await pg.query<{ id: string }>(
          `INSERT INTO reward_redemptions(user_id,catalog_version_id,request_key,kind,title,description,cost_stars,discount_usd,expires_at)
          VALUES ('runner',$1,gen_random_uuid(),'discount','Premio','Condiciones publicadas.',10,20,now()+interval '1 day') RETURNING id`,
          [catalog.rows[0].id],
        );
        redemption = row.rows[0].id;
      }
      const priced = kind === "discount";
      return constraintOf(
        `INSERT INTO booking_benefits(booking_id,runner_user_id,kind,title,description,original_total_usd,discount_usd,final_total_usd,redemption_id,welcome_code_id,created_by)
        VALUES ($1,'runner',$2::booking_benefit_kind,'Beneficio','Descripción del beneficio.',$3,$4,$5,$6,$7,'staff')`,
        [bookingId, kind, priced ? 500 : null, priced ? 50 : null, priced ? 450 : null, redemption, withWelcome ? code.id : null],
      );
    }

    it("a discount has exactly one source", async () => {
      expect(await insertBenefit("discount", true, true)).toBe("booking_benefits_price_chk");
    });
    it("a discount without a source is rejected", async () => {
      expect(await insertBenefit("discount", false, false)).toBe("booking_benefits_price_chk");
    });
    it("a discount from a welcome code alone is valid", async () => {
      expect(await insertBenefit("discount", true, false)).toBeNull();
    });
    it("a discount from a redemption alone is still valid", async () => {
      expect(await insertBenefit("discount", false, true)).toBeNull();
    });
    it("a contractual benefit cannot reference a welcome code", async () => {
      expect(await insertBenefit("contractual", true, false)).toBe("booking_benefits_price_chk");
    });
  });

  describe("cv_apply_welcome_code", () => {
    it("applies once: lowers the total, records the benefit, marks the code and locks the price", async () => {
      const code = await insertCode({ amount: 50 });
      const bookingId = await insertBooking({ total: 500 });
      // A voided payment does not make the booking ineligible.
      await pg.query(
        `INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by,voided_at,voided_by)
        VALUES ($1,100,current_date,'Anulado','staff',now(),'staff')`,
        [bookingId],
      );
      expect(await apply("  cv-abcdef ", bookingId)).toEqual({ status: "success", code: "applied", id: code.id });

      const booking = await pg.query<{ total_usd: number }>("SELECT total_usd FROM bookings WHERE id=$1", [bookingId]);
      expect(booking.rows[0].total_usd).toBe(450);
      const benefits = await pg.query(
        `SELECT runner_user_id,kind,title,original_total_usd,discount_usd,final_total_usd,welcome_code_id,redemption_id,created_by
        FROM booking_benefits WHERE booking_id=$1`,
        [bookingId],
      );
      expect(benefits.rows).toEqual([
        {
          runner_user_id: "runner",
          kind: "discount",
          title: "Descuento de bienvenida",
          original_total_usd: 500,
          discount_usd: 50,
          final_total_usd: 450,
          welcome_code_id: code.id,
          redemption_id: null,
          created_by: "staff",
        },
      ]);
      const row = await pg.query<{ status: string; booking_id: string; applied_by: string; applied: boolean }>(
        "SELECT status,booking_id,applied_by,applied_at IS NOT NULL AS applied FROM welcome_discount_codes WHERE id=$1",
        [code.id],
      );
      expect(row.rows[0]).toEqual({ status: "applied", booking_id: bookingId, applied_by: "staff", applied: true });
      // The code never reaches the benefit text the runner sees.
      const text = await pg.query<{ description: string }>("SELECT description FROM booking_benefits WHERE booking_id=$1", [
        bookingId,
      ]);
      expect(text.rows[0].description).not.toContain("CV-");

      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "code_used" });
      expect(await constraintOf("UPDATE bookings SET total_usd=600 WHERE id=$1", [bookingId])).toBe(
        "bookings_reward_price_locked",
      );
    });

    it("rejects an unknown code", async () => {
      const bookingId = await insertBooking();
      expect(await apply("CV-ZZZZZZ", bookingId)).toEqual({ status: "error", code: "code_not_found" });
    });

    it("rejects an expired code", async () => {
      await insertCode({ expired: true });
      const bookingId = await insertBooking();
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "code_expired" });
    });

    it("rejects a void code", async () => {
      await insertCode({ status: "void" });
      const bookingId = await insertBooking();
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "code_used" });
    });

    it("rejects a missing booking", async () => {
      await insertCode();
      expect(await apply("CV-ABCDEF", "00000000-0000-4000-8000-000000000000")).toEqual({
        status: "error",
        code: "booking_not_eligible",
      });
    });

    it("rejects a booking not linked to an account", async () => {
      await insertCode();
      const bookingId = await insertBooking({ runner: null });
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "booking_not_linked" });
    });

    it("rejects a booking with another email", async () => {
      await insertCode();
      const bookingId = await insertBooking({ email: "otra@example.test" });
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "email_mismatch" });
    });

    it("rejects when another non-cancelled booking has the same email, ignoring cancelled ones", async () => {
      await insertCode();
      await insertBooking({ trip: tripB, status: "cancelled" });
      const bookingId = await insertBooking();
      const other = await insertBooking({ trip: tripB, runner: null });
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "not_first_booking" });
      await pg.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [other]);
      expect(await apply("CV-ABCDEF", bookingId)).toMatchObject({ status: "success", code: "applied" });
    });

    it("rejects a booking that is not pending", async () => {
      await insertCode();
      const bookingId = await insertBooking({ status: "confirmed" });
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "booking_not_eligible" });
    });

    it("rejects a booking with a payment that is not voided", async () => {
      await insertCode();
      const bookingId = await insertBooking();
      await pg.query(
        "INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES ($1,100,current_date,'Pago','staff')",
        [bookingId],
      );
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "booking_not_eligible" });
    });

    it("rejects a booking that already has a discount", async () => {
      await insertCode({ code: "CV-ABCDEF" });
      const second = await insertCode({ code: "CV-ABCDEG" });
      const bookingId = await insertBooking();
      expect(await apply("CV-ABCDEF", bookingId)).toMatchObject({ status: "success" });
      expect(await apply("CV-ABCDEG", bookingId)).toEqual({ status: "error", code: "discount_already_applied" });
      const row = await pg.query<{ status: string }>("SELECT status FROM welcome_discount_codes WHERE id=$1", [second.id]);
      expect(row.rows[0].status).toBe("issued");
    });

    it("rejects a discount equal to or greater than the total and leaves everything unchanged", async () => {
      const code = await insertCode({ amount: 500 });
      const bookingId = await insertBooking({ total: 500 });
      expect(await apply("CV-ABCDEF", bookingId)).toEqual({ status: "error", code: "discount_exceeds_total" });
      const booking = await pg.query<{ total_usd: number }>("SELECT total_usd FROM bookings WHERE id=$1", [bookingId]);
      expect(booking.rows[0].total_usd).toBe(500);
      const row = await pg.query<{ status: string }>("SELECT status FROM welcome_discount_codes WHERE id=$1", [code.id]);
      expect(row.rows[0].status).toBe("issued");
      const benefits = await pg.query("SELECT 1 FROM booking_benefits WHERE booking_id=$1", [bookingId]);
      expect(benefits.rows).toEqual([]);
    });
  });
});
