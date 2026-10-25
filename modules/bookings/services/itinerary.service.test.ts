// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { ItineraryItemInput, UpdateItineraryItemInput } from "../types/bookings.types";
import {
  createItineraryItem,
  createTripUpdate,
  deleteItineraryItem,
  deleteTripUpdate,
  getItineraryItemById,
  getTripItinerary,
  listBookingItems,
  updateItineraryItem,
} from "./itinerary.service";

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
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const UPDATE_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR = "staff-1";

const fields = {
  kind: "flight", status: "confirmed", title: "LA 2370", details: null, location: "Lima",
  startDate: "2027-05-14", startTime: "01:30", startTimeZone: "America/Lima",
  endDate: "2027-05-14", endTime: "06:55", endTimeZone: "America/Santiago", runnerVisible: true,
} as const;
const fieldParams = [
  "flight", "confirmed", "LA 2370", null, "Lima", "2027-05-14", "01:30", "America/Lima",
  "2027-05-14", "06:55", "America/Santiago", true,
];
// Item rows in select order.
const ITEM_ROW = [ITEM_ID, TRIP_ID, null, ...fieldParams];
const ITEM = { id: ITEM_ID, tripId: TRIP_ID, bookingId: null, ...fields };
const ITEM_COLUMNS = '"id", "trip_id", "booking_id", "kind", "status", "title", "details", "location", "start_date", '
  + `to_char("start_time", 'HH24:MI'), "start_time_zone", "end_date", to_char("end_time", 'HH24:MI'), "end_time_zone", "runner_visible"`;
const ITEM_ORDER = 'order by "itinerary_items"."start_date" asc nulls last, "itinerary_items"."start_time" asc nulls first, '
  + '"itinerary_items"."title" asc';
const EDITABLE = '("itinerary_items"."booking_id" is null or exists (select 1 from "bookings" where '
  + '("bookings"."id" = "itinerary_items"."booking_id" and "bookings"."status" <> $';

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getTripItinerary", () => {
  it("reads trip-level items and announcements (newest first) in one batch", async () => {
    const publishedAt = new Date("2027-05-01T15:00:00Z");
    const fake = useFakeDb([[ITEM_ROW], [[UPDATE_ID, "Recojo de kits", "Sábado 10:00", publishedAt.toISOString()]]]);

    await expect(getTripItinerary(TRIP_ID)).resolves.toEqual({
      items: [ITEM],
      updates: [{ id: UPDATE_ID, title: "Recojo de kits", body: "Sábado 10:00", publishedAt }],
    });
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${ITEM_COLUMNS} from "itinerary_items" where ("itinerary_items"."trip_id" = $1 and "itinerary_items"."booking_id" is null) ${ITEM_ORDER}`,
    );
    expect(normalize(fake.queries[1].sql)).toBe(
      'select "id", "title", "body", "published_at" from "trip_updates" where "trip_updates"."trip_id" = $1 order by "trip_updates"."published_at" desc',
    );
    expect(fake.queries.map((q) => q.params)).toEqual([[TRIP_ID], [TRIP_ID]]);
  });
});

describe("listBookingItems and getItineraryItemById", () => {
  it("lists only the booking's own items", async () => {
    const fake = useFakeDb([[[ITEM_ID, TRIP_ID, BOOKING_ID, ...fieldParams]]]);
    await expect(listBookingItems(BOOKING_ID)).resolves.toEqual([{ ...ITEM, bookingId: BOOKING_ID }]);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${ITEM_COLUMNS} from "itinerary_items" where "itinerary_items"."booking_id" = $1 ${ITEM_ORDER}`,
    );
  });

  it("reads one item by id with whether it is still editable, or null", async () => {
    const fake = useFakeDb([[[...ITEM_ROW, false]]]);
    await expect(getItineraryItemById(ITEM_ID)).resolves.toEqual({ ...ITEM, editable: false });
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${ITEM_COLUMNS}, ${EDITABLE}1))) from "itinerary_items" where "itinerary_items"."id" = $2`,
    );
    useFakeDb([[]]);
    await expect(getItineraryItemById(ITEM_ID)).resolves.toBeNull();
  });

  it("skips the query for a non-UUID id", async () => {
    const fake = useFakeDb();
    await expect(listBookingItems("abc")).resolves.toEqual([]);
    await expect(getItineraryItemById("abc")).resolves.toBeNull();
    await expect(getTripItinerary("abc")).resolves.toEqual({ items: [], updates: [] });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("createItineraryItem", () => {
  const INSERT = "INSERT INTO itinerary_items ( trip_id, booking_id, kind, status, title, details, location, "
    + "start_date, start_time, start_time_zone, end_date, end_time, end_time_zone, runner_visible ) "
    + "SELECT owner.*, $1::itinerary_kind, $2::itinerary_status, $3, $4, $5, $6::date, $7::time, $8, $9::date, $10::time, $11, $12 ";

  it("takes a booking item's trip from its non-cancelled booking, ignoring any tripId", async () => {
    const fake = useFakeDb([[{ id: ITEM_ID, trip_id: TRIP_ID, booking_id: BOOKING_ID }]]);
    const input: ItineraryItemInput = { ...fields, tripId: "99999999-9999-4999-8999-999999999999", bookingId: BOOKING_ID };
    await expect(createItineraryItem(input)).resolves.toEqual({ id: ITEM_ID, tripId: TRIP_ID, bookingId: BOOKING_ID });

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `${INSERT}FROM (SELECT trip_id, id FROM bookings WHERE id = $13::uuid AND status <> 'cancelled') AS owner RETURNING id, trip_id, booking_id`,
    );
    expect(fake.queries[0].params).toEqual([...fieldParams, BOOKING_ID]);
  });

  it("creates a trip item only for an existing trip", async () => {
    const fake = useFakeDb([[{ id: ITEM_ID, trip_id: TRIP_ID, booking_id: null }]]);
    await expect(createItineraryItem({ ...fields, tripId: TRIP_ID, bookingId: null }))
      .resolves.toEqual({ id: ITEM_ID, tripId: TRIP_ID, bookingId: null });
    expect(normalize(fake.queries[0].sql)).toBe(
      `${INSERT}FROM (SELECT id, NULL::uuid FROM trips WHERE id = $13::uuid) AS owner RETURNING id, trip_id, booking_id`,
    );
    expect(fake.queries[0].params).toEqual([...fieldParams, TRIP_ID]);
  });

  it("returns not_found for a cancelled or missing booking, or a missing trip", async () => {
    useFakeDb([[]]);
    await expect(createItineraryItem({ ...fields, tripId: null, bookingId: BOOKING_ID })).resolves.toBe("not_found");
  });
});

describe("updateItineraryItem and deleteItineraryItem", () => {
  const update: UpdateItineraryItemInput = { itemId: ITEM_ID, ...fields, status: "completed" };

  it("updates only an editable item and returns its origin", async () => {
    const fake = useFakeDb([[[TRIP_ID, BOOKING_ID]]]);
    await expect(updateItineraryItem(update)).resolves.toEqual({ tripId: TRIP_ID, bookingId: BOOKING_ID });
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toMatch(/^update "itinerary_items" set "kind" = \$1, "status" = \$2, .*"runner_visible" = \$12, "updated_at" = now\(\)/);
    expect(statement).toContain(`where ("itinerary_items"."id" = $13 and ${EDITABLE}14))))`);
    expect(statement).toMatch(/returning "trip_id", "booking_id"$/);
    // Where the item belongs never changes.
    expect(statement).not.toMatch(/set .*"(trip_id|booking_id)" =/);
    expect(fake.queries[0].params).toEqual([...fieldParams.with(1, "completed"), ITEM_ID, "cancelled"]);
  });

  it("deletes only an editable item and returns its origin", async () => {
    const fake = useFakeDb([[[TRIP_ID, null]]]);
    await expect(deleteItineraryItem(ITEM_ID)).resolves.toEqual({ tripId: TRIP_ID, bookingId: null });
    expect(normalize(fake.queries[0].sql)).toBe(
      `delete from "itinerary_items" where ("itinerary_items"."id" = $1 and ${EDITABLE}2)))) returning "trip_id", "booking_id"`,
    );
  });

  it("returns not_found for a missing item or one of a cancelled booking", async () => {
    useFakeDb([[], []]);
    await expect(updateItineraryItem(update)).resolves.toBe("not_found");
    await expect(deleteItineraryItem(ITEM_ID)).resolves.toBe("not_found");
  });
});

describe("trip updates", () => {
  it("publishes only for an existing trip, created by the actor", async () => {
    const fake = useFakeDb([[{ id: UPDATE_ID }]]);
    await expect(createTripUpdate({ tripId: TRIP_ID, title: "Recojo de kits", body: "Sábado" }, ACTOR)).resolves.toBe("created");
    expect(normalize(fake.queries[0].sql)).toBe(
      "INSERT INTO trip_updates (trip_id, title, body, created_by) SELECT id, $1, $2, $3 FROM trips WHERE id = $4::uuid RETURNING id",
    );
    expect(fake.queries[0].params).toEqual(["Recojo de kits", "Sábado", ACTOR, TRIP_ID]);
  });

  it("returns not_found for a missing trip", async () => {
    useFakeDb([[]]);
    await expect(createTripUpdate({ tripId: TRIP_ID, title: "Hola", body: "x" }, ACTOR)).resolves.toBe("not_found");
  });

  it("deletes and returns the trip, or not_found", async () => {
    const fake = useFakeDb([[[TRIP_ID]], []]);
    await expect(deleteTripUpdate(UPDATE_ID)).resolves.toEqual({ tripId: TRIP_ID });
    expect(normalize(fake.queries[0].sql)).toBe('delete from "trip_updates" where "trip_updates"."id" = $1 returning "trip_id"');
    await expect(deleteTripUpdate(UPDATE_ID)).resolves.toBe("not_found");
  });
});
