import "server-only";
import { and, asc, desc, eq, exists, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookings, itineraryItems, tripUpdates } from "@/lib/db-schema";
import type {
  CrmItineraryItem,
  CrmTripUpdate,
  ItineraryItemInput,
  TripUpdateInput,
  UpdateItineraryItemInput,
} from "../types/bookings.types";

type ItemOrigin = { tripId: string; bookingId: string | null };

const idSchema = z.uuid();

// Postgres `time` comes back as HH:MM:SS; the form edits HH:MM.
const hhmm = (column: typeof itineraryItems.startTime | typeof itineraryItems.endTime) =>
  sql<string | null>`to_char(${column}, 'HH24:MI')`;

const itemColumns = {
  id: itineraryItems.id,
  tripId: itineraryItems.tripId,
  bookingId: itineraryItems.bookingId,
  kind: itineraryItems.kind,
  status: itineraryItems.status,
  title: itineraryItems.title,
  details: itineraryItems.details,
  location: itineraryItems.location,
  startDate: itineraryItems.startDate,
  startTime: hhmm(itineraryItems.startTime),
  startTimeZone: itineraryItems.startTimeZone,
  endDate: itineraryItems.endDate,
  endTime: hhmm(itineraryItems.endTime),
  endTimeZone: itineraryItems.endTimeZone,
  runnerVisible: itineraryItems.runnerVisible,
};

const origin = { tripId: itineraryItems.tripId, bookingId: itineraryItems.bookingId };

// Undated items last, then by time (no time first) and title.
const itemOrder = [
  sql`${itineraryItems.startDate} asc nulls last`,
  sql`${itineraryItems.startTime} asc nulls first`,
  asc(itineraryItems.title),
];

// Booking items of a cancelled booking are read-only; trip items are always editable.
const editableItem = (db: ReturnType<typeof getDb>) =>
  or(
    isNull(itineraryItems.bookingId),
    exists(
      db
        .select({ one: sql`1` })
        .from(bookings)
        .where(and(eq(bookings.id, itineraryItems.bookingId), ne(bookings.status, "cancelled"))),
    ),
  );

// Trip-level items (booking_id IS NULL) and announcements, newest first, in one batch. A non-UUID id
// returns empty lists without a query, so the page can load it in parallel with getTripById.
export async function getTripItinerary(tripId: string): Promise<{ items: CrmItineraryItem[]; updates: CrmTripUpdate[] }> {
  if (!idSchema.safeParse(tripId).success) return { items: [], updates: [] };
  const db = getDb();
  const [items, updates] = await db.batch([
    db
      .select(itemColumns)
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, tripId), isNull(itineraryItems.bookingId)))
      .orderBy(...itemOrder),
    db
      .select({ id: tripUpdates.id, title: tripUpdates.title, body: tripUpdates.body, publishedAt: tripUpdates.publishedAt })
      .from(tripUpdates)
      .where(eq(tripUpdates.tripId, tripId))
      .orderBy(desc(tripUpdates.publishedAt)),
  ]);
  return { items, updates };
}

// A non-UUID id returns [] without a query, so the page can load it in parallel with getBookingById.
export async function listBookingItems(bookingId: string): Promise<CrmItineraryItem[]> {
  if (!idSchema.safeParse(bookingId).success) return [];
  return getDb()
    .select(itemColumns)
    .from(itineraryItems)
    .where(eq(itineraryItems.bookingId, bookingId))
    .orderBy(...itemOrder);
}

export async function getItineraryItemById(id: string): Promise<CrmItineraryItem | null> {
  if (!idSchema.safeParse(id).success) return null;
  const [item] = await getDb().select(itemColumns).from(itineraryItems).where(eq(itineraryItems.id, id));
  return item ?? null;
}

// One statement. A booking item takes trip_id from its booking (not cancelled); a trip item needs
// an existing trip. Nothing else of where the item belongs comes from the input.
export async function createItineraryItem(
  input: ItineraryItemInput,
): Promise<({ id: string } & ItemOrigin) | "not_found"> {
  const owner = input.bookingId
    ? sql`SELECT trip_id, id FROM bookings WHERE id = ${input.bookingId}::uuid AND status <> 'cancelled'`
    : sql`SELECT id, NULL::uuid FROM trips WHERE id = ${input.tripId}::uuid`;
  const result = await getDb().execute<{ id: string; trip_id: string; booking_id: string | null }>(sql`
    INSERT INTO itinerary_items (
      trip_id, booking_id, kind, status, title, details, location,
      start_date, start_time, start_time_zone, end_date, end_time, end_time_zone, runner_visible
    )
    SELECT
      owner.*, ${input.kind}::itinerary_kind, ${input.status}::itinerary_status, ${input.title},
      ${input.details}, ${input.location}, ${input.startDate}::date, ${input.startTime}::time,
      ${input.startTimeZone}, ${input.endDate}::date, ${input.endTime}::time, ${input.endTimeZone},
      ${input.runnerVisible}
    FROM (${owner}) AS owner
    RETURNING id, trip_id, booking_id
  `);
  const [row] = result.rows;
  return row ? { id: row.id, tripId: row.trip_id, bookingId: row.booking_id } : "not_found";
}

export async function updateItineraryItem(input: UpdateItineraryItemInput): Promise<ItemOrigin | "not_found"> {
  const db = getDb();
  const [updated] = await db
    .update(itineraryItems)
    .set({
      kind: input.kind,
      status: input.status,
      title: input.title,
      details: input.details,
      location: input.location,
      startDate: input.startDate,
      startTime: input.startTime,
      startTimeZone: input.startTimeZone,
      endDate: input.endDate,
      endTime: input.endTime,
      endTimeZone: input.endTimeZone,
      runnerVisible: input.runnerVisible,
      updatedAt: sql`now()`,
    })
    .where(and(eq(itineraryItems.id, input.itemId), editableItem(db)))
    .returning(origin);
  return updated ?? "not_found";
}

export async function deleteItineraryItem(itemId: string): Promise<ItemOrigin | "not_found"> {
  const db = getDb();
  const [deleted] = await db
    .delete(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), editableItem(db)))
    .returning(origin);
  return deleted ?? "not_found";
}

// One statement: only for an existing trip; created_by is always the actor.
export async function createTripUpdate(input: TripUpdateInput, actorUserId: string): Promise<"created" | "not_found"> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO trip_updates (trip_id, title, body, created_by)
    SELECT id, ${input.title}, ${input.body}, ${actorUserId} FROM trips WHERE id = ${input.tripId}::uuid
    RETURNING id
  `);
  return result.rows.length > 0 ? "created" : "not_found";
}

export async function deleteTripUpdate(updateId: string): Promise<{ tripId: string } | "not_found"> {
  const [deleted] = await getDb()
    .delete(tripUpdates)
    .where(eq(tripUpdates.id, updateId))
    .returning({ tripId: tripUpdates.tripId });
  return deleted ?? "not_found";
}
