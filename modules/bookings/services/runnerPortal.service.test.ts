// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
// @/modules/trips also re-exports server code (services, actions); only the real formatter is needed.
vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));

import { getDb } from "@/lib/db";
import { loadRunnerPortal } from "./runnerPortal.service";

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

const USER = "user-a";
const EMAIL = "ana@example.com";
const TODAY = "2026-10-18";
const ACTIVE = "11111111-1111-4111-8111-111111111111";
const FINISHED = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";

// List rows in select order: id, status, simulated, trip (title, city, country, raceDate, startDate, endDate, includes).
const LIST = [
  [FINISHED, "confirmed", false, "Maratón de Lima 2026", "Lima", "Perú", "2026-05-17", null, null, []],
  [ACTIVE, "confirmed", false, "Maratón de Santiago 2027", "Santiago", "Chile", "2027-05-16", "2027-05-14", "2027-05-18", ["Hotel"]],
];
// Detail batch: booking, manual payments, items, updates; then the common balance batch
// (getBookingBalance): totals (id, total, manual paid), settlements (id, booking, amount, paid at, status).
const DETAIL = [
  [["Paquete corredor", "42K", "1499", "2027-04-01", "2026-03-03 15:00:00+00"]],
  [["pay-1", "300", "2026-03-03", "Reserva"]],
  [
    ["item-1", "flight", "confirmed", "Vuelo de ida", null, "LIM", "2027-05-14", "01:30:00", "America/Lima", "2027-05-14", "06:55:00", "America/Santiago"],
    ["item-2", "hotel", "pending", "Hotel", null, null, null, null, null, null, null, null],
  ],
  [["upd-1", "Recojo de kits", "Lleva tu DNI", "2027-05-10 12:00:00+00"]],
  [[ACTIVE, "1499", "300"]],
  [["stripe-settlement-1", ACTIVE, "200", new Date("2026-03-06T03:00:00Z"), "applied"]],
];
const detailFor = (id: string) => [...DETAIL.slice(0, 4), [[id, "1499", "300"]], DETAIL[5].map((row) => [row[0], id, ...(row as unknown[]).slice(2)])];

beforeEach(() => vi.mocked(getDb).mockReset());

describe("loadRunnerPortal", () => {
  it("links by verified email before listing, in the same batch, and lists only this user's bookings", async () => {
    const fake = useFakeDb([[], LIST, ...DETAIL]);
    await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    // Link + list, the detail batch and the balance batch.
    expect(fake.transaction).toHaveBeenCalledTimes(3);
    const [link, list] = fake.queries;
    expect(normalize(link.sql)).toBe(
      'update "bookings" set "runner_user_id" = $1, "updated_at" = now() where ("bookings"."participant_email" = $2 and "bookings"."runner_user_id" is null)',
    );
    expect(link.params).toEqual([USER, EMAIL]);
    expect(normalize(list.sql)).toMatch(/^select .* from "bookings" inner join "trips" on "trips"\."id" = "bookings"\."trip_id" where \("bookings"\."runner_user_id" = \$1 and not \(/);
    expect(list.params).toEqual([USER]);
  });

  it("never selects private columns", async () => {
    const fake = useFakeDb([[], LIST, ...DETAIL]);
    await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    for (const { sql } of fake.queries.slice(1)) {
      expect(sql).not.toMatch(/participant_email|participant_name|internal_note|created_by|recorded_by|voided_by/);
    }
  });

  it("returns no bookings and skips the detail batch when the user has none", async () => {
    const fake = useFakeDb([[], []]);
    await expect(loadRunnerPortal(USER, EMAIL, ACTIVE, TODAY)).resolves.toEqual({ bookings: [], selected: null });
    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
  });

  it("scopes every detail read to the booking and its owner", async () => {
    const fake = useFakeDb([[], LIST, ...DETAIL]);
    await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    const [booking, payments, items, updates] = fake.queries.slice(2, 6);
    const OWNED = '"bookings"."id" = $1 and "bookings"."runner_user_id" = $2';
    for (const query of [booking, payments, items, updates]) {
      expect(normalize(query.sql)).toContain(OWNED);
      expect(query.params.slice(0, 2)).toEqual([ACTIVE, USER]);
    }
    expect(normalize(payments.sql)).toContain('"booking_payments"."voided_at" is null');
    expect(normalize(items.sql)).toContain('inner join "bookings" on "bookings"."trip_id" = "itinerary_items"."trip_id"');
    expect(normalize(items.sql)).toContain('"itinerary_items"."runner_visible" = $3');
    expect(items.params[2]).toBe(true);
    expect(normalize(items.sql)).toContain(
      '("itinerary_items"."booking_id" is null or "itinerary_items"."booking_id" = "bookings"."id")',
    );
    expect(normalize(updates.sql)).toContain('inner join "bookings" on "bookings"."trip_id" = "trip_updates"."trip_id"');
    expect(normalize(updates.sql)).toMatch(/order by "trip_updates"\."published_at" desc$/);
  });

  it("reads the common balance only for the runner's chosen booking", async () => {
    const fake = useFakeDb([[], LIST, ...DETAIL]);
    await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    expect(fake.transaction).toHaveBeenCalledTimes(3);
    const [totals, settlements] = fake.queries.slice(6);
    expect(normalize(totals.sql)).toContain("from booking_payments p where p.booking_id = bookings.id and p.voided_at is null");
    expect(totals.params).toEqual([ACTIVE]);
    expect(normalize(settlements.sql)).toContain('from "booking_stripe_settlements" where "booking_stripe_settlements"."booking_id" in ($1)');
    expect(settlements.params).toEqual([ACTIVE]);
  });

  it("hides checkout bookings cancelled without any payment", async () => {
    const fake = useFakeDb([[], LIST, ...DETAIL]);
    await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    expect(normalize(fake.queries[1].sql)).toContain(
      'where ("bookings"."runner_user_id" = $1 and not ("bookings"."status" = \'cancelled\' and "bookings"."offer_version_id" is not null and not exists (select 1 from booking_payments p where p.booking_id = "bookings"."id" and p.voided_at is null) and not exists (select 1 from booking_stripe_settlements s where s.booking_id = "bookings"."id")))',
    );
  });

  it("counts Stripe in review apart: not paid, flagged, and absent from the history", async () => {
    useFakeDb([[], LIST, ...DETAIL.slice(0, 5), [
      ["stripe-settlement-1", ACTIVE, "200", new Date("2026-03-06T03:00:00Z"), "applied"],
      ["stripe-settlement-2", ACTIVE, "500", new Date("2026-03-07T15:00:00Z"), "needs_review"],
    ]]);
    const { selected } = await loadRunnerPortal(USER, EMAIL, undefined, TODAY);
    expect(selected).toMatchObject({ paidUsd: 500, paymentInReview: true });
    expect(selected?.payments.map((p) => p.id)).toEqual(["pay-1", "stripe-settlement-1"]);
  });

  it("flags a simulated booking in the list (race selector) and in the selected detail", async () => {
    const list = [LIST[0], [ACTIVE, "pending", true, ...LIST[1].slice(3)]];
    const fake = useFakeDb([[], list, ...DETAIL]);
    const data = await loadRunnerPortal(USER, EMAIL, undefined, TODAY);
    expect(data.bookings.map((b) => [b.id, b.simulated])).toEqual([[ACTIVE, true], [FINISHED, false]]);
    expect(data.selected?.simulated).toBe(true);
    expect(normalize(fake.queries[1].sql)).toMatch(/^select "bookings"\."id", "bookings"\."status", "bookings"\."is_simulated", /);
  });

  it("selects the first booking by Requirement 7 and maps times to HH:MM and amounts to integers", async () => {
    useFakeDb([[], LIST, ...DETAIL]);
    const data = await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    expect(data.bookings.map((b) => b.id)).toEqual([ACTIVE, FINISHED]);
    expect(data.selected).toEqual({
      id: ACTIVE,
      status: "confirmed",
      trip: {
        title: "Maratón de Santiago 2027",
        city: "Santiago",
        country: "Chile",
        raceDate: "2027-05-16",
        startDate: "2027-05-14",
        endDate: "2027-05-18",
        includes: ["Hotel"],
      },
      packageLabel: "Paquete corredor",
      distance: "42K",
      totalUsd: 1499,
      // Common balance: 300 manual + 200 Stripe applied.
      paidUsd: 500,
      paymentInReview: false,
      simulated: false,
      balanceDueOn: "2027-04-01",
      createdAt: new Date("2026-03-03T15:00:00Z"),
      payments: [
        { id: "pay-1", amountUsd: 300, paidOn: "2026-03-03", concept: "Reserva" },
        { id: "stripe-settlement-1", amountUsd: 200, paidOn: "2026-03-05", concept: "Stripe - tarjeta" },
      ],
      items: [
        {
          id: "item-1",
          kind: "flight",
          status: "confirmed",
          title: "Vuelo de ida",
          details: null,
          location: "LIM",
          start: { date: "2027-05-14", time: "01:30", timeZone: "America/Lima" },
          end: { date: "2027-05-14", time: "06:55", timeZone: "America/Santiago" },
        },
        { id: "item-2", kind: "hotel", status: "pending", title: "Hotel", details: null, location: null, start: null, end: null },
      ],
      updates: [{ id: "upd-1", title: "Recojo de kits", body: "Lleva tu DNI", publishedAt: new Date("2027-05-10T12:00:00Z") }],
    });
  });

  it("selects a valid param that belongs to the user", async () => {
    const fake = useFakeDb([[], LIST, ...detailFor(FINISHED)]);
    const data = await loadRunnerPortal(USER, EMAIL, FINISHED, TODAY);

    expect(data.selected?.id).toBe(FINISHED);
    expect(fake.queries[2].params.slice(0, 2)).toEqual([FINISHED, USER]);
  });

  it.each([
    ["foreign", FOREIGN],
    ["malformed", "not-a-uuid"],
    ["repeated", [FINISHED, ACTIVE]],
    ["number", 42],
  ])("ignores a %s param exactly like no param", async (_, param) => {
    const withoutParam = useFakeDb([[], LIST, ...DETAIL]);
    const expected = await loadRunnerPortal(USER, EMAIL, undefined, TODAY);

    const withParam = useFakeDb([[], LIST, ...DETAIL]);
    await expect(loadRunnerPortal(USER, EMAIL, param, TODAY)).resolves.toEqual(expected);
    expect(withParam.queries).toEqual(withoutParam.queries);
  });

  it("returns the list without a detail if the booking is no longer owned", async () => {
    useFakeDb([[], LIST, [], [], [], [], [], []]);
    const data = await loadRunnerPortal(USER, EMAIL, undefined, TODAY);
    expect(data.bookings).toHaveLength(2);
    expect(data.selected).toBeNull();
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    const query = vi.fn(async () => {
      throw failure;
    });
    const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
    vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction }) as never) as ReturnType<typeof getDb>);
    await expect(loadRunnerPortal(USER, EMAIL, undefined, TODAY)).rejects.toBe(failure);
  });
});
