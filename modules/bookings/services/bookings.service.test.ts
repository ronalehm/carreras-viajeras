// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NeonDbError } from "@neondatabase/serverless";
import { DrizzleQueryError } from "drizzle-orm/errors";
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
// Write guard of Decision 22: the booking's trip is not archived.
const TRIP_OPEN = `exists (select 1 from "trips" where "trips"."id" = "bookings"."trip_id" and "trips"."status" <> 'archived')`;

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

// List rows in select order: id, name, email, status, package, total, paid, linked, trip (id, title).
const LIST_ROW = [BOOKING_ID, "Ana Pérez", "ana@example.com", "pending", "Paquete corredor", "1499", "300", false, TRIP_ID, "Maratón de Santiago 2027"];

describe("listBookings", () => {
  it("sums only non-voided payments and orders by race date, then participant", async () => {
    const fake = useFakeDb([[LIST_ROW]]);

    await expect(listBookings()).resolves.toEqual([{
      id: BOOKING_ID,
      participantName: "Ana Pérez",
      participantEmail: "ana@example.com",
      status: "pending",
      packageLabel: "Paquete corredor",
      totalUsd: 1499,
      paidUsd: 300,
      linked: false,
      trip: { id: TRIP_ID, title: "Maratón de Santiago 2027" },
    }]);

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(
      'coalesce(sum("booking_payments"."amount_usd") filter (where "booking_payments"."voided_at" is null), 0)',
    );
    expect(statement).toContain('"bookings"."runner_user_id" is not null');
    expect(statement).toContain('inner join "trips" on "trips"."id" = "bookings"."trip_id"');
    expect(statement).toContain('left join "booking_payments" on "booking_payments"."booking_id" = "bookings"."id"');
    expect(statement).toMatch(/group by "bookings"\."id", "trips"\."id" order by "trips"\."race_date" desc, "bookings"\."participant_name" asc$/);
    expect(statement).not.toMatch(/ where /);
    // The runner's id never leaves the service: only whether it is set.
    expect(statement).not.toMatch(/select .*"bookings"\."runner_user_id",/);
  });

  it("filters by trip", async () => {
    const fake = useFakeDb([[]]);
    await expect(listBookings(TRIP_ID)).resolves.toEqual([]);
    expect(normalize(fake.queries[0].sql)).toContain('where "bookings"."trip_id" = $1 group by');
    expect(fake.queries[0].params).toEqual([TRIP_ID]);
  });
});

describe("getBookingById", () => {
  it("returns null for a non-UUID id without querying", async () => {
    const fake = useFakeDb();
    await expect(getBookingById("abc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("reads one booking with its paid amount, whether its trip is archived and without lead", async () => {
    const fake = useFakeDb([[[...LIST_ROW, true, "42K", "2027-04-01", "Nota", "2026-03-03 15:00:00+00", null, null]]]);
    await expect(getBookingById(BOOKING_ID)).resolves.toMatchObject({
      id: BOOKING_ID, paidUsd: 300, totalUsd: 1499, distance: "42K", balanceDueOn: "2027-04-01", internalNote: "Nota",
      trip: { id: TRIP_ID, title: "Maratón de Santiago 2027", archived: true },
      lead: null,
    });
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(`"trips"."status" = 'archived'`);
    expect(statement).toContain('left join "leads" on "leads"."id" = "bookings"."lead_id"');
    expect(statement).toContain('where "bookings"."id" = $1 group by "bookings"."id", "trips"."id", "leads"."id"');
    expect(fake.queries[0].params).toEqual([BOOKING_ID]);
  });

  it("returns the linked lead's id and name", async () => {
    useFakeDb([[[...LIST_ROW, false, null, null, null, "2026-03-03 15:00:00+00", LEAD_ID, "Ana Pérez Rojas"]]]);
    await expect(getBookingById(BOOKING_ID)).resolves.toMatchObject({
      lead: { id: LEAD_ID, fullName: "Ana Pérez Rojas" },
    });
  });

  it("returns null when it does not exist", async () => {
    useFakeDb([[]]);
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
    expect(statement).toContain(
      "link.lead_id IS NULL OR NOT EXISTS ( SELECT 1 FROM bookings active WHERE active.lead_id = link.lead_id AND active.status <> 'cancelled' ) AS lead_free",
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

  it("reads the lead's non-cancelled booking", async () => {
    const fake = useFakeDb([[[BOOKING_ID, "pending"]]]);
    await expect(getLeadBooking(LEAD_ID)).resolves.toEqual({ id: BOOKING_ID, status: "pending" });
    expect(normalize(fake.queries[0].sql)).toBe(
      'select "id", "status" from "bookings" where ("bookings"."lead_id" = $1 and "bookings"."status" <> $2) limit $3',
    );
    expect(fake.queries[0].params).toEqual([LEAD_ID, "cancelled", 1]);
  });

  it("returns null when the lead has no active booking", async () => {
    useFakeDb([[]]);
    await expect(getLeadBooking(LEAD_ID)).resolves.toBeNull();
  });
});

describe("updateBooking", () => {
  it("decides with its WHERE and diagnoses in the same batch", async () => {
    const fake = useFakeDb([[[BOOKING_ID]], [["pending", "ana@example.com", false, false]]]);
    await expect(updateBooking(update)).resolves.toBe("updated");

    expect(fake.transaction).toHaveBeenCalledOnce();
    const [mutation, diagnosis] = fake.queries;
    const statement = normalize(mutation.sql);
    expect(statement).toMatch(/^update "bookings" set "participant_name" = \$1, "participant_email" = \$2, "package_label" = \$3, "distance" = \$4, "total_usd" = \$5, "balance_due_on" = \$6, "internal_note" = \$7, "updated_at" = now\(\) where/);
    expect(statement).not.toMatch(/"trip_id" = \$|"status" = \$\d+,|"runner_user_id" = \$|created_by/);
    expect(statement).toContain('"bookings"."status" <> $9');
    expect(statement).toContain(TRIP_OPEN);
    expect(statement).toContain('("bookings"."runner_user_id" is null or "bookings"."participant_email" = $10)');
    expect(statement).toContain(
      'not exists (select 1 from "bookings" "other" where ("other"."trip_id" = "bookings"."trip_id" and "other"."participant_email" = $11 and "other"."status" <> $12 and "other"."id" <> "bookings"."id"))',
    );
    expect(mutation.params).toEqual([
      "Ana Pérez", "ana@example.com", "Paquete corredor", "42K", 1499, "2027-04-01", null,
      BOOKING_ID, "cancelled", "ana@example.com", "ana@example.com", "cancelled",
    ]);
    expect(normalize(diagnosis.sql)).toContain(
      `"trips"."status" = 'archived' from "bookings" inner join "trips" on "trips"."id" = "bookings"."trip_id" where "bookings"."id" = $1`,
    );
  });

  it.each([
    ["not_found", []],
    ["cancelled", [["cancelled", "ana@example.com", false, false]]],
    ["cancelled", [["cancelled", "ana@example.com", false, true]]],
    ["trip_archived", [["pending", "ana@example.com", false, true]]],
    ["trip_archived", [["confirmed", "otro@example.com", true, true]]],
    ["email_locked", [["confirmed", "otro@example.com", true, false]]],
    ["duplicate", [["pending", "otro@example.com", false, false]]],
    ["duplicate", [["confirmed", "ana@example.com", true, false]]],
  ])("returns %s when nothing was updated", async (expected, current) => {
    useFakeDb([[], current]);
    await expect(updateBooking(update)).resolves.toBe(expected);
  });

  // A concurrent create wins the race: the partial unique index rejects the UPDATE. db.batch throws
  // Neon's error as is; a drizzle query error carries it in `cause`.
  const conflict = (constraint: string) =>
    Object.assign(new NeonDbError("duplicate key value"), { code: "23505", constraint });

  it.each([
    ["Neon's error", conflict("bookings_trip_email_active_uq")],
    ["a wrapped error", new DrizzleQueryError("update ...", [], conflict("bookings_trip_email_active_uq"))],
  ])("returns duplicate when the active-email index rejects it (%s)", async (_label, error) => {
    useFakeDb().transaction.mockRejectedValueOnce(error);
    await expect(updateBooking(update)).resolves.toBe("duplicate");
  });

  it("rethrows any other database error", async () => {
    const error = conflict("bookings_pkey");
    useFakeDb().transaction.mockRejectedValueOnce(error);
    await expect(updateBooking(update)).rejects.toBe(error);
  });
});

describe("setBookingStatus", () => {
  it.each([
    ["confirmed", ["pending"], ` AND ${TRIP_OPEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`],
    ["cancelled", ["pending", "confirmed"], ""],
  ] as const)("changes to %s only from %o in one statement (trip guard only when confirming)", async (status, sources, guard) => {
    const fake = useFakeDb([[{ changed: true }]]);
    await expect(setBookingStatus(BOOKING_ID, status, ACTOR)).resolves.toBe("changed");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const placeholders = sources.map((_, i) => `$${i + 3}::booking_status`).join(", ");
    expect(normalize(fake.queries[0].sql)).toMatch(new RegExp(
      `^WITH changed AS \\( UPDATE bookings SET status = \\$1::booking_status, updated_at = now\\(\\) WHERE id = \\$2::uuid AND status IN \\(${placeholders.replaceAll("$", "\\$")}\\)${guard} RETURNING id, lead_id \\)`,
    ));
    expect(normalize(fake.queries[0].sql)).toMatch(
      /SELECT EXISTS \(SELECT 1 FROM changed\) AS changed, EXISTS \( SELECT 1 FROM bookings JOIN trips ON trips\.id = bookings\.trip_id WHERE bookings\.id = \$\d+::uuid AND bookings\.status = 'pending' AND "trips"\."status" = 'archived' \) AS trip_archived$/,
    );
    expect(fake.queries[0].params.slice(0, 2 + sources.length)).toEqual([status, BOOKING_ID, ...sources]);
  });

  it("confirming moves a linked, open lead to reserved with the actor's activity and a booking event", async () => {
    const fake = useFakeDb([[{ changed: true }]]);
    await setBookingStatus(BOOKING_ID, "confirmed", ACTOR);

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(
      "target AS ( SELECT leads.id, leads.stage FROM leads JOIN changed ON changed.lead_id = leads.id WHERE leads.archived_at IS NULL AND leads.stage NOT IN ('reserved', 'paid') FOR UPDATE OF leads )",
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
    expect(fake.queries[0].params).toEqual(["confirmed", BOOKING_ID, "pending", "Reserva confirmada en el CRM.", ACTOR, BOOKING_ID]);
  });

  it("cancelling never touches the lead", async () => {
    const fake = useFakeDb([[{ changed: true }]]);
    await setBookingStatus(BOOKING_ID, "cancelled", ACTOR);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).not.toMatch(/leads|lead_activities|outbox_events/);
    expect(fake.queries[0].params).toEqual(["cancelled", BOOKING_ID, "pending", "confirmed", BOOKING_ID]);
  });

  it.each(["confirmed", "cancelled"] as const)("returns invalid_transition for %s when no row matches", async (status) => {
    useFakeDb([[{ changed: false }]]);
    await expect(setBookingStatus(BOOKING_ID, status, ACTOR)).resolves.toBe("invalid_transition");
  });

  it.each([
    ["confirmed", "trip_archived"],
    ["cancelled", "invalid_transition"],
  ] as const)("a pending booking of an archived trip that does not change to %s gives %s", async (status, expected) => {
    useFakeDb([[{ changed: false, trip_archived: true }]]);
    await expect(setBookingStatus(BOOKING_ID, status, ACTOR)).resolves.toBe(expected);
  });
});
