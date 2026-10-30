// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { BookingInput, UpdateBookingInput } from "../types/bookings.types";
import {
  createBooking,
  getBookingById,
  getLeadBooking,
  listBookings,
  setBookingStatus,
  updateBooking,
} from "./bookings.service";

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

const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR = "staff-1";

const fields = {
  participantName: "Ana Pérez",
  participantEmail: "ana@example.com",
  packageLabel: "Paquete corredor",
  distance: "42K",
  totalUsd: 1499,
  balanceDueOn: "2027-04-01",
  internalNote: null,
};
const input: BookingInput = { tripId: TRIP_ID, leadId: null, ...fields };
const linkedInput: BookingInput = { ...input, leadId: LEAD_ID };
const update: UpdateBookingInput = { bookingId: BOOKING_ID, ...fields };

beforeEach(() => vi.mocked(getDb).mockReset());

// List rows in select order: id, name, email, status, package, total, simulated, linked, trip (id, title).
const LIST_ROW = [BOOKING_ID, "Ana Pérez", "ana@example.com", "pending", "Paquete corredor", "1499", false, false, TRIP_ID, "Maratón de Santiago 2027"];
const SIMULATED_ID = "33333333-3333-4333-8333-333333333333";
const SIMULATED_ROW = [SIMULATED_ID, "Demo Uno", "demo@example.com", "confirmed", "Paquete corredor", "11000", true, true, TRIP_ID, "Maratón de Santiago 2027"];
// Common balance batch (getBookingBalance): totals (id, total, manual paid), then settlements
// (id, booking, amount, paid at, status).
const BALANCE = [[BOOKING_ID, "1499", "300"]];
const SETTLEMENTS = [
  ["set-1", BOOKING_ID, "200", new Date("2026-03-06T15:00:00Z"), "applied"],
  ["set-2", BOOKING_ID, "100", new Date("2026-03-07T15:00:00Z"), "needs_review"],
];

describe("listBookings", () => {
  it("lists real bookings only, with the common balance read in one batch for the whole page", async () => {
    const fake = useFakeDb([[LIST_ROW], BALANCE, SETTLEMENTS]);

    await expect(listBookings()).resolves.toEqual([{
      id: BOOKING_ID,
      participantName: "Ana Pérez",
      participantEmail: "ana@example.com",
      status: "pending",
      packageLabel: "Paquete corredor",
      totalUsd: 1499,
      // 300 manual + 200 Stripe applied; the 100 in review never counts.
      paidUsd: 500,
      balanceUsd: 999,
      paymentInReview: true,
      simulated: false,
      linked: false,
      trip: { id: TRIP_ID, title: "Maratón de Santiago 2027" },
    }]);

    expect(fake.queries).toHaveLength(3);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain('"bookings"."runner_user_id" is not null');
    expect(statement).toContain('inner join "trips" on "trips"."id" = "bookings"."trip_id"');
    // No payment join or aggregate in the list itself: paid comes only from getBookingBalance.
    expect(statement).not.toMatch(/booking_payments|booking_stripe_settlements|sum\(/);
    expect(statement).toMatch(/where "bookings"\."is_simulated" = \$1 order by "trips"\."race_date" desc, "bookings"\."participant_name" asc$/);
    expect(fake.queries[0].params).toEqual([false]);
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.queries[1].params).toEqual([BOOKING_ID]);
    // The runner's id never leaves the service: only whether it is set.
    expect(statement).not.toMatch(/select .*"bookings"\."runner_user_id",/);
  });

  it("lists simulated bookings apart, never mixed with real ones", async () => {
    const fake = useFakeDb([[SIMULATED_ROW], [[SIMULATED_ID, "11000", "0"]], [["set-9", SIMULATED_ID, "300", new Date("2026-10-30T15:00:00Z"), "applied"]]]);
    const [booking] = await listBookings({ simulated: true });
    expect(booking).toMatchObject({ id: SIMULATED_ID, simulated: true, paidUsd: 300, balanceUsd: 10700, paymentInReview: false });
    expect(fake.queries[0].params).toEqual([true]);
  });

  it("filters by trip", async () => {
    const fake = useFakeDb([[]]);
    await expect(listBookings({ tripId: TRIP_ID, simulated: false })).resolves.toEqual([]);
    expect(normalize(fake.queries[0].sql)).toContain('where ("bookings"."is_simulated" = $1 and "bookings"."trip_id" = $2) order by');
    expect(fake.queries[0].params).toEqual([false, TRIP_ID]);
    // Nothing listed: no balance batch.
    expect(fake.queries).toHaveLength(1);
  });
});

describe("getBookingById", () => {
  it("returns null for a non-UUID id without querying", async () => {
    const fake = useFakeDb();
    await expect(getBookingById("abc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  // getBookingBalance's batch is issued first (the detail select runs when Promise.all awaits it).
  const DETAIL_ROW = [...LIST_ROW, "42K", "2027-04-01", "Nota", "2026-03-03 15:00:00+00", null, null, false];

  it("reads one booking with its common balance and the Stripe payments, without lead", async () => {
    const fake = useFakeDb([BALANCE, SETTLEMENTS, [DETAIL_ROW]]);
    await expect(getBookingById(BOOKING_ID)).resolves.toMatchObject({
      id: BOOKING_ID, totalUsd: 1499, paidUsd: 500, balanceUsd: 999, paymentInReview: true, simulated: false,
      distance: "42K", balanceDueOn: "2027-04-01", internalNote: "Nota", lead: null, priceLocked: false,
      stripePayments: [{ id: "set-1", amountUsd: 200, paidOn: "2026-03-06" }],
      needsReview: [{ id: "set-2", amountUsd: 100, paidOn: "2026-03-07" }],
    });
    const statement = normalize(fake.queries[2].sql);
    expect(statement).toContain('left join "leads" on "leads"."id" = "bookings"."lead_id"');
    expect(statement).toMatch(/where "bookings"\."id" = \$1$/);
    expect(statement).not.toMatch(/booking_payments|group by/);
    expect(fake.queries[2].params).toEqual([BOOKING_ID]);
  });

  it("returns the linked lead's id and name", async () => {
    useFakeDb([BALANCE, [], [[...LIST_ROW, null, null, null, "2026-03-03 15:00:00+00", LEAD_ID, "Ana Pérez Rojas"]]]);
    await expect(getBookingById(BOOKING_ID)).resolves.toMatchObject({
      lead: { id: LEAD_ID, fullName: "Ana Pérez Rojas" }, paidUsd: 300, paymentInReview: false,
    });
  });

  it("returns null when it does not exist", async () => {
    useFakeDb([[], [], []]);
    await expect(getBookingById(BOOKING_ID)).resolves.toBeNull();
  });
});

describe("createBooking", () => {
  it("inserts in one statement for a non-archived trip, without status or runner id", async () => {
    const fake = useFakeDb([[{ id: BOOKING_ID, trip_ok: true, lead_ok: true, lead_free: true }]]);
    await expect(createBooking(input, ACTOR)).resolves.toEqual({ id: BOOKING_ID });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toMatch(/^WITH trip AS \( SELECT id FROM trips WHERE id = \$1::uuid AND status <> 'archived' \)/);
    expect(statement).toContain(
      "INSERT INTO bookings ( trip_id, participant_name, participant_email, package_label, distance, total_usd, balance_due_on, internal_note, created_by, lead_id ) SELECT trip.id, $3, $4, $5, $6, $7::integer, $8::date, $9, $10, checks.lead_id FROM trip, checks WHERE checks.lead_ok AND checks.lead_free ON CONFLICT DO NOTHING RETURNING id",
    );
    expect(statement).toMatch(
      /SELECT \(SELECT id FROM inserted\) AS id, EXISTS \(SELECT 1 FROM trip\) AS trip_ok, lead_ok, lead_free FROM checks$/,
    );
    expect(statement).not.toMatch(/status,|runner_user_id/);
    expect(fake.queries[0].params).toEqual([
      TRIP_ID, null, "Ana Pérez", "ana@example.com", "Paquete corredor", "42K", 1499, "2027-04-01", null, ACTOR,
    ]);
  });

  it("checks the lead in the same statement: exists, not archived, no other active booking", async () => {
    const fake = useFakeDb([[{ id: BOOKING_ID, trip_ok: true, lead_ok: true, lead_free: true }]]);
    await expect(createBooking(linkedInput, ACTOR)).resolves.toEqual({ id: BOOKING_ID });

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("link AS ( SELECT $2::uuid AS lead_id )");
    expect(statement).toContain(
      "link.lead_id IS NULL OR EXISTS ( SELECT 1 FROM leads WHERE leads.id = link.lead_id AND leads.archived_at IS NULL ) AS lead_ok",
    );
    // A simulated booking never blocks a real one (like bookings_lead_active_uq).
    expect(statement).toContain(
      "link.lead_id IS NULL OR NOT EXISTS ( SELECT 1 FROM bookings active WHERE active.lead_id = link.lead_id AND active.status <> 'cancelled' AND NOT active.is_simulated ) AS lead_free",
    );
    expect(fake.queries[0].params[1]).toBe(LEAD_ID);
  });

  it("ignores status and runner fields smuggled into the input", async () => {
    const fake = useFakeDb([[{ id: BOOKING_ID, trip_ok: true, lead_ok: true, lead_free: true }]]);
    await createBooking({ ...input, status: "confirmed", runnerUserId: "user-x" } as BookingInput, ACTOR);
    expect(fake.queries[0].params).not.toContain("confirmed");
    expect(fake.queries[0].params).not.toContain("user-x");
  });

  it.each([
    [{ id: null, trip_ok: true, lead_ok: true, lead_free: true }, "duplicate"],
    [{ id: null, trip_ok: false, lead_ok: true, lead_free: true }, "invalid_trip"],
    [{ id: null, trip_ok: false, lead_ok: false, lead_free: true }, "invalid_trip"],
    [{ id: null, trip_ok: true, lead_ok: false, lead_free: true }, "invalid_lead"],
    [{ id: null, trip_ok: true, lead_ok: false, lead_free: false }, "invalid_lead"],
    [{ id: null, trip_ok: true, lead_ok: true, lead_free: false }, "lead_taken"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb([[row]]);
    await expect(createBooking(linkedInput, ACTOR)).resolves.toBe(expected);
  });
});

describe("getLeadBooking", () => {
  it("returns null for a non-UUID id without querying", async () => {
    const fake = useFakeDb();
    await expect(getLeadBooking("abc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("reads the lead's non-cancelled real booking", async () => {
    const fake = useFakeDb([[[BOOKING_ID, "pending"]]]);
    await expect(getLeadBooking(LEAD_ID)).resolves.toEqual({ id: BOOKING_ID, status: "pending" });
    expect(normalize(fake.queries[0].sql)).toBe(
      'select "id", "status" from "bookings" where ("bookings"."lead_id" = $1 and "bookings"."status" <> $2 and "bookings"."is_simulated" = $3) limit $4',
    );
    expect(fake.queries[0].params).toEqual([LEAD_ID, "cancelled", false, 1]);
  });

  it("returns null when the lead has no active booking", async () => {
    useFakeDb([[]]);
    await expect(getLeadBooking(LEAD_ID)).resolves.toBeNull();
  });
});

describe("updateBooking", () => {
  it("maps only the named concurrent price guard and preserves other database failures", async () => {
    const fake = useFakeDb();
    fake.transaction.mockRejectedValueOnce({ cause: { code: "23514", constraint: "bookings_reward_price_locked" } });
    await expect(updateBooking(update)).resolves.toBe("discount_locked");
    const other = new Error("unrelated database failure");
    fake.transaction.mockRejectedValueOnce(other);
    await expect(updateBooking(update)).rejects.toBe(other);
  });
  it("decides with its WHERE and diagnoses in the same batch", async () => {
    const fake = useFakeDb([[[BOOKING_ID]], [["pending", "ana@example.com", false]]]);
    await expect(updateBooking(update)).resolves.toBe("updated");

    expect(fake.transaction).toHaveBeenCalledOnce();
    const [mutation, diagnosis] = fake.queries;
    const statement = normalize(mutation.sql);
    expect(statement).toMatch(/^update "bookings" set "participant_name" = \$1, "participant_email" = \$2, "package_label" = \$3, "distance" = \$4, "total_usd" = \$5, "balance_due_on" = \$6, "internal_note" = \$7, "updated_at" = now\(\) where/);
    expect(statement).not.toMatch(/"trip_id" = \$|"status" = \$\d+,|"runner_user_id" = \$|created_by/);
    expect(statement).toContain('"bookings"."status" <> $9');
    expect(statement).toContain('("bookings"."runner_user_id" is null or "bookings"."participant_email" = $10)');
    // Only another active real booking blocks the email (bookings_trip_email_active_uq excludes simulated ones).
    expect(statement).toContain(
      'not exists (select 1 from "bookings" "other" where ("other"."trip_id" = "bookings"."trip_id" and "other"."participant_email" = $11 and "other"."status" <> $12 and "other"."is_simulated" = $13 and "other"."id" <> "bookings"."id"))',
    );
    expect(mutation.params).toEqual([
      "Ana Pérez", "ana@example.com", "Paquete corredor", "42K", 1499, "2027-04-01", null,
      BOOKING_ID, "cancelled", "ana@example.com", "ana@example.com", "cancelled", false, 1499, "discount",
    ]);
    expect(normalize(diagnosis.sql)).toContain('from "bookings" where "bookings"."id" = $1');
  });

  it.each([
    ["not_found", []],
    ["cancelled", [["cancelled", "ana@example.com", false]]],
    ["email_locked", [["confirmed", "otro@example.com", true]]],
    ["duplicate", [["pending", "otro@example.com", false]]],
    ["duplicate", [["confirmed", "ana@example.com", true]]],
    ["discount_locked", [["pending", "ana@example.com", true, 1200, true]]],
  ])("returns %s when nothing was updated", async (expected, current) => {
    useFakeDb([[], current]);
    await expect(updateBooking(update)).resolves.toBe(expected);
  });
});

describe("setBookingStatus", () => {
  it.each([
    ["confirmed", ["pending"]],
    ["cancelled", ["pending", "confirmed"]],
  ] as const)("changes to %s only from %o in one statement", async (status, sources) => {
    const fake = useFakeDb([[{ changed: true }]]);
    await expect(setBookingStatus(BOOKING_ID, status, ACTOR)).resolves.toBe("changed");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const placeholders = sources.map((_, i) => `$${i + 3}::booking_status`).join(", ");
    expect(normalize(fake.queries[0].sql)).toMatch(new RegExp(
      `^WITH changed AS \\( UPDATE bookings SET status = \\$1::booking_status, updated_at = now\\(\\) WHERE id = \\$2::uuid AND status IN \\(${placeholders.replaceAll("$", "\\$")}\\) RETURNING id, lead_id, is_simulated \\)`,
    ));
    expect(normalize(fake.queries[0].sql)).toMatch(/SELECT EXISTS \(SELECT 1 FROM changed\) AS changed$/);
    expect(fake.queries[0].params.slice(0, 2 + sources.length)).toEqual([status, BOOKING_ID, ...sources]);
  });

  it("confirming moves a linked, open lead to reserved with the actor's activity and a booking event", async () => {
    const fake = useFakeDb([[{ changed: true }]]);
    await setBookingStatus(BOOKING_ID, "confirmed", ACTOR);

    const statement = normalize(fake.queries[0].sql);
    // Only a real booking reaches the lead: a simulated one (demo checkout) yields no target.
    expect(statement).toContain(
      "target AS ( SELECT leads.id, leads.stage FROM leads JOIN changed ON changed.lead_id = leads.id AND NOT changed.is_simulated WHERE leads.archived_at IS NULL AND leads.stage NOT IN ('reserved', 'paid') FOR UPDATE OF leads )",
    );
    expect(statement).toContain(
      "lead_updated AS ( UPDATE leads SET stage = 'reserved'::lead_stage, lost_reason = NULL, updated_at = now() FROM target WHERE leads.id = target.id RETURNING leads.id, target.stage AS stage_from )",
    );
    expect(statement).toContain(
      "INSERT INTO lead_activities (lead_id, type, body, stage_from, stage_to, actor_user_id) SELECT id, 'stage_changed', $4, stage_from, 'reserved'::lead_stage, $5 FROM lead_updated",
    );
    expect(statement).toContain(
      "INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.stage_changed', id, jsonb_build_object('stageFrom', stage_from, 'stageTo', 'reserved', 'trigger', 'booking') FROM lead_updated",
    );
    expect(fake.queries[0].params).toEqual(["confirmed", BOOKING_ID, "pending", "Reserva confirmada en el CRM.", ACTOR]);
  });

  it("confirming a simulated booking enqueues no commercial event: every lead write hangs on a real booking", async () => {
    const fake = useFakeDb([[{ changed: true }]]);
    await expect(setBookingStatus(BOOKING_ID, "confirmed", ACTOR)).resolves.toBe("changed");
    const statement = normalize(fake.queries[0].sql);
    // The only source of rows for the lead update, the activity and the outbox event is target,
    // which requires NOT changed.is_simulated: a simulated booking changes status and nothing else.
    expect(statement).toContain("RETURNING id, lead_id, is_simulated )");
    expect(statement).toContain("JOIN changed ON changed.lead_id = leads.id AND NOT changed.is_simulated");
    expect(statement).toMatch(/lead_updated AS \( UPDATE leads .* FROM target WHERE leads\.id = target\.id/);
    expect(statement.match(/FROM lead_updated/g)).toHaveLength(2);
    expect(statement.match(/INSERT INTO outbox_events/g)).toHaveLength(1);
    expect(statement).toMatch(/INSERT INTO outbox_events \(type, lead_id, payload\) SELECT .* FROM lead_updated \)/);
  });

  it("cancelling never touches the lead", async () => {
    const fake = useFakeDb([[{ changed: true }]]);
    await setBookingStatus(BOOKING_ID, "cancelled", ACTOR);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).not.toMatch(/leads|lead_activities|outbox_events/);
    expect(fake.queries[0].params).toEqual(["cancelled", BOOKING_ID, "pending", "confirmed"]);
  });

  it.each(["confirmed", "cancelled"] as const)("returns invalid_transition for %s when no row matches", async (status) => {
    useFakeDb([[{ changed: false }]]);
    await expect(setBookingStatus(BOOKING_ID, status, ACTOR)).resolves.toBe("invalid_transition");
  });
});
