import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookingPayments, bookings, trips } from "@/lib/db-schema";
import type {
  BookingInput,
  BookingStatus,
  CrmBooking,
  CrmBookingListItem,
  UpdateBookingInput,
} from "../types/bookings.types";

type StatusChange = Exclude<BookingStatus, "pending">;

// Target status → allowed source statuses. cancelled is final.
const STATUS_SOURCES: Record<StatusChange, BookingStatus[]> = {
  confirmed: ["pending"],
  cancelled: ["pending", "confirmed"],
};

const bookingIdSchema = z.uuid();

const listColumns = {
  id: bookings.id,
  participantName: bookings.participantName,
  participantEmail: bookings.participantEmail,
  status: bookings.status,
  packageLabel: bookings.packageLabel,
  totalUsd: bookings.totalUsd,
  // Voided payments never count. SUM(integer) is bigint (text on the wire): map it back to number.
  paidUsd: sql<number>`coalesce(sum(${bookingPayments.amountUsd}) filter (where ${bookingPayments.voidedAt} is null), 0)`
    .mapWith(Number),
  linked: sql<boolean>`${bookings.runnerUserId} is not null`,
  trip: { id: trips.id, title: trips.title },
};

// Decision 22: an archived trip freezes its bookings. Both read with trips joined.
const tripArchived = sql<boolean>`${trips.status} = 'archived'`;
// Write guard, correlated with the bookings row being updated.
const tripOpen = sql`exists (select 1 from ${trips} where ${trips.id} = ${bookings.tripId} and ${trips.status} <> 'archived')`;

const detailColumns = {
  ...listColumns,
  trip: { ...listColumns.trip, archived: tripArchived },
  distance: bookings.distance,
  balanceDueOn: bookings.balanceDueOn,
  internalNote: bookings.internalNote,
  createdAt: bookings.createdAt,
};

// Both reads: bookings JOIN trips plus the paid amount. GROUP BY the primary keys covers every
// selected column.
// ponytail: no pagination; add it when the list passes ~200 rows.
export async function listBookings(tripId?: string): Promise<CrmBookingListItem[]> {
  return getDb()
    .select(listColumns)
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(bookingPayments, eq(bookingPayments.bookingId, bookings.id))
    .where(tripId === undefined ? undefined : eq(bookings.tripId, tripId))
    .groupBy(bookings.id, trips.id)
    .orderBy(desc(trips.raceDate), asc(bookings.participantName));
}

export async function getBookingById(id: string): Promise<CrmBooking | null> {
  if (!bookingIdSchema.safeParse(id).success) return null;
  const [booking] = await getDb()
    .select(detailColumns)
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(bookingPayments, eq(bookingPayments.bookingId, bookings.id))
    .where(eq(bookings.id, id))
    .groupBy(bookings.id, trips.id);
  return booking ?? null;
}

// One statement: the booking is inserted only for a trip that is not archived; the partial unique
// index (trip, email) WHERE status <> 'cancelled' turns a duplicate into a no-op. status takes the
// column default ('pending') and runner_user_id stays NULL: neither ever comes from the input.
export async function createBooking(
  input: BookingInput,
  actorUserId: string,
): Promise<{ id: string } | "invalid_trip" | "duplicate"> {
  const result = await getDb().execute<{ id: string | null; trip_ok: boolean }>(sql`
    WITH trip AS (
      SELECT id FROM trips WHERE id = ${input.tripId}::uuid AND status <> 'archived'
    ),
    inserted AS (
      INSERT INTO bookings (
        trip_id, participant_name, participant_email, package_label, distance,
        total_usd, balance_due_on, internal_note, created_by
      )
      SELECT
        id, ${input.participantName}, ${input.participantEmail}, ${input.packageLabel}, ${input.distance},
        ${input.totalUsd}::integer, ${input.balanceDueOn}::date, ${input.internalNote}, ${actorUserId}
      FROM trip
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM trip) AS trip_ok
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  return row?.trip_ok ? "duplicate" : "invalid_trip";
}

// A concurrent create can win between the NOT EXISTS and the UPDATE: the partial unique index then
// rejects it. db.batch throws Neon's error as is; single drizzle queries wrap it in `cause`.
function isActiveEmailConflict(error: unknown): boolean {
  return [error, (error as { cause?: unknown } | null)?.cause].some((candidate) => {
    const pg = candidate as { code?: unknown; constraint?: unknown } | null | undefined;
    return pg?.code === "23505" && pg.constraint === "bookings_trip_email_active_uq";
  });
}

// One batch (one transaction). The UPDATE decides with its WHERE: not cancelled, trip not archived,
// email unchanged once linked, no other active booking of the same trip with that email. The SELECT explains a no-op.
export async function updateBooking(
  input: UpdateBookingInput,
): Promise<"updated" | "not_found" | "cancelled" | "trip_archived" | "email_locked" | "duplicate"> {
  const db = getDb();
  const other = alias(bookings, "other");
  const result = await db.batch([
    db
      .update(bookings)
      .set({
        participantName: input.participantName,
        participantEmail: input.participantEmail,
        packageLabel: input.packageLabel,
        distance: input.distance,
        totalUsd: input.totalUsd,
        balanceDueOn: input.balanceDueOn,
        internalNote: input.internalNote,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(bookings.id, input.bookingId),
          ne(bookings.status, "cancelled"),
          tripOpen,
          or(isNull(bookings.runnerUserId), eq(bookings.participantEmail, input.participantEmail)),
          notExists(
            db
              .select({ one: sql`1` })
              .from(other)
              .where(
                and(
                  eq(other.tripId, bookings.tripId),
                  eq(other.participantEmail, input.participantEmail),
                  ne(other.status, "cancelled"),
                  ne(other.id, bookings.id),
                ),
              ),
          ),
        ),
      )
      .returning({ id: bookings.id }),
    db
      .select({
        status: bookings.status,
        participantEmail: bookings.participantEmail,
        linked: sql<boolean>`${bookings.runnerUserId} is not null`,
        tripArchived,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(eq(bookings.id, input.bookingId)),
  ]).catch((error: unknown) => {
    if (isActiveEmailConflict(error)) return "duplicate" as const;
    throw error;
  });
  if (result === "duplicate") return result;
  const [updated, current] = result;

  if (updated.length > 0) return "updated";
  const [booking] = current;
  if (!booking) return "not_found";
  if (booking.status === "cancelled") return "cancelled";
  if (booking.tripArchived) return "trip_archived";
  if (booking.linked && booking.participantEmail !== input.participantEmail) return "email_locked";
  return "duplicate";
}

// confirmed ← pending, only while the trip is not archived; cancelled ← pending | confirmed, also with
// an archived trip. The SELECT in the same batch tells an archived trip from another source status
// or a missing booking (invalid_transition).
export async function setBookingStatus(
  bookingId: string,
  status: StatusChange,
): Promise<"changed" | "invalid_transition" | "trip_archived"> {
  const db = getDb();
  const [updated, [current]] = await db.batch([
    db
      .update(bookings)
      .set({ status, updatedAt: sql`now()` })
      .where(and(
        eq(bookings.id, bookingId),
        inArray(bookings.status, STATUS_SOURCES[status]),
        status === "confirmed" ? tripOpen : undefined,
      ))
      .returning({ id: bookings.id }),
    db
      .select({ status: bookings.status, tripArchived })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(eq(bookings.id, bookingId)),
  ]);
  if (updated.length > 0) return "changed";
  return status === "confirmed" && current?.status === "pending" && current.tripArchived
    ? "trip_archived"
    : "invalid_transition";
}
