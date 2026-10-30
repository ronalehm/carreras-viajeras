// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { PaymentInput } from "../types/bookings.types";
import { addPayment, listBookingPayments, voidPayment } from "./payments.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (pattern of staff.service.test.ts): records every statement and answers
// each one, in order, with the given rows.
function useFakeDb(responses: unknown[][] = []) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction }) as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR = "staff-1";
const input: PaymentInput = { bookingId: BOOKING_ID, requestKey: "33333333-3333-4333-8333-333333333333", amountUsd: 300, paidOn: "2027-03-03", concept: "Reserva" };

beforeEach(() => vi.mocked(getDb).mockReset());

describe("listBookingPayments", () => {
  it("lists every payment, voided included, with who recorded it, by date then creation", async () => {
    const fake = useFakeDb([[
      [PAYMENT_ID, 300, "2027-03-03", "Reserva", "agent@example.com", false],
      ["33333333-3333-4333-8333-333333333333", 200, "2027-03-10", "Cuota 2", "admin@example.com", true],
    ]]);

    await expect(listBookingPayments(BOOKING_ID)).resolves.toEqual([
      { id: PAYMENT_ID, amountUsd: 300, paidOn: "2027-03-03", concept: "Reserva", recordedByEmail: "agent@example.com", voided: false },
      { id: "33333333-3333-4333-8333-333333333333", amountUsd: 200, paidOn: "2027-03-10", concept: "Cuota 2", recordedByEmail: "admin@example.com", voided: true },
    ]);

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain('"booking_payments"."voided_at" is not null');
    expect(statement).toContain('inner join "profiles" on "profiles"."user_id" = "booking_payments"."recorded_by"');
    expect(statement).toMatch(
      /where "booking_payments"\."booking_id" = \$1 order by "booking_payments"\."paid_on" asc, "booking_payments"\."created_at" asc$/,
    );
    // Voided payments are not filtered out: the CRM shows them as "Anulado".
    expect(statement).not.toMatch(/"voided_at" is null/);
    expect(fake.queries[0].params).toEqual([BOOKING_ID]);
  });

  it("returns [] for a non-UUID id without querying", async () => {
    const fake = useFakeDb();
    await expect(listBookingPayments("not-a-uuid")).resolves.toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });
});

describe("addPayment", () => {
  it("inserts in one statement only for a non-cancelled booking, recorded by the actor", async () => {
    const fake = useFakeDb([[{ added: true, booking_ok: true }]]);
    await expect(addPayment(input, ACTOR)).resolves.toBe("added");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("FOR UPDATE");
    expect(statement).toContain("WHERE id = $1::uuid AND status <> 'cancelled' AND NOT is_simulated FOR UPDATE");
    expect(statement).toContain("ON CONFLICT (booking_id, request_key) DO UPDATE");
    expect(statement).toContain("booking_payments.voided_at IS NULL");
    expect(statement).toContain("booking_payments.recorded_by = EXCLUDED.recorded_by");
    expect(fake.queries[0].params).toEqual([BOOKING_ID, 300, "2027-03-03", "Reserva", ACTOR, input.requestKey]);
  });

  it("ignores recorder and voiding fields smuggled into the input", async () => {
    const fake = useFakeDb([[{ added: true, booking_ok: true }]]);
    await addPayment({ ...input, recordedBy: "user-x", voidedBy: "user-y" } as PaymentInput, ACTOR);
    expect(fake.queries[0].params).not.toContain("user-x");
    expect(fake.queries[0].params).not.toContain("user-y");
    expect(normalize(fake.queries[0].sql)).not.toMatch(/voided_by/);
  });

  it("rejects reuse with a different receipt or voided receipt", async () => {
    useFakeDb([[{ added: false, booking_ok: true }]]);
    await expect(addPayment(input, ACTOR)).resolves.toBe("payment_conflict");
  });

  it("returns not_found when the booking is missing or cancelled", async () => {
    useFakeDb([[]]);
    await expect(addPayment(input, ACTOR)).resolves.toBe("not_found");
  });

  it("answers not_found for a simulated booking: the locked target is empty, so nothing is inserted", async () => {
    useFakeDb([[{ added: false, booking_ok: false }]]);
    await expect(addPayment(input, ACTOR)).resolves.toBe("not_found");
  });
});

describe("voidPayment", () => {
  it("voids once, only while the booking is not cancelled, and returns the booking", async () => {
    const fake = useFakeDb([[{ booking_id: BOOKING_ID }]]);
    await expect(voidPayment(PAYMENT_ID, ACTOR)).resolves.toEqual({ bookingId: BOOKING_ID });

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("FOR UPDATE OF b");
    expect(statement).toContain("p.voided_at IS NULL");
    expect(statement).toContain("b.status <> 'cancelled'");
    expect(fake.queries[0].params).toEqual([PAYMENT_ID, ACTOR, PAYMENT_ID]);
  });

  it("returns not_found for a missing or already voided payment, or a cancelled booking", async () => {
    useFakeDb([[]]);
    await expect(voidPayment(PAYMENT_ID, ACTOR)).resolves.toBe("not_found");
  });
});
