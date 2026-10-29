import "server-only";
import { and, asc, desc, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookingPayments, bookings, leads, trips } from "@/lib/db-schema";
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

const uuidSchema = z.uuid();

// Activity text when confirming a linked booking moves its lead to reserved.
const BOOKING_CONFIRMED_NOTE = "Reserva confirmada en el CRM.";

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
  lead: { id: leads.id, fullName: leads.fullName },
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

// The linked lead (if any) comes through a LEFT JOIN: drizzle maps an all-NULL lead to null.
export async function getBookingById(id: string): Promise<CrmBooking | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  const [booking] = await getDb()
    .select(detailColumns)
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(leads, eq(leads.id, bookings.leadId))
    .leftJoin(bookingPayments, eq(bookingPayments.bookingId, bookings.id))
    .where(eq(bookings.id, id))
    .groupBy(bookings.id, trips.id, leads.id);
  return booking ?? null;
}

// The lead's active (non-cancelled) booking, for the lead's page: at most one exists
// (bookings_lead_active_uq).
export async function getLeadBooking(leadId: string): Promise<{ id: string; status: BookingStatus } | null> {
  if (!uuidSchema.safeParse(leadId).success) return null;
  const [booking] = await getDb()
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.leadId, leadId), ne(bookings.status, "cancelled")))
    .limit(1);
  return booking ?? null;
}

// One statement: the booking is inserted only for a trip that is not archived and, when linked,
// for a lead that exists, is not archived and has no other non-cancelled booking. The partial
// unique indexes (trip, email) and (lead) WHERE status <> 'cancelled' turn a duplicate into a
// no-op; the lead index is the final guarantee if two requests race for the same lead (that rare
// no-op reads as "duplicate"). status takes the column default ('pending') and runner_user_id
// stays NULL: neither ever comes from the input.
export async function createBooking(
  input: BookingInput,
  actorUserId: string,
): Promise<{ id: string } | "invalid_trip" | "duplicate" | "invalid_lead" | "lead_taken"> {
  const result = await getDb().execute<{
    id: string | null; trip_ok: boolean; lead_ok: boolean; lead_free: boolean;
  }>(sql`
    WITH trip AS (
      SELECT id FROM trips WHERE id = ${input.tripId}::uuid AND status <> 'archived'
    ),
    link AS (
      SELECT ${input.leadId}::uuid AS lead_id
    ),
    checks AS (
      SELECT
        link.lead_id,
        link.lead_id IS NULL OR EXISTS (
          SELECT 1 FROM leads WHERE leads.id = link.lead_id AND leads.archived_at IS NULL
        ) AS lead_ok,
        link.lead_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM bookings active WHERE active.lead_id = link.lead_id AND active.status <> 'cancelled'
        ) AS lead_free
      FROM link
    ),
    inserted AS (
      INSERT INTO bookings (
        trip_id, participant_name, participant_email, package_label, distance,
        total_usd, balance_due_on, internal_note, created_by, lead_id
      )
      SELECT
        trip.id, ${input.participantName}, ${input.participantEmail}, ${input.packageLabel}, ${input.distance},
        ${input.totalUsd}::integer, ${input.balanceDueOn}::date, ${input.internalNote}, ${actorUserId}, checks.lead_id
      FROM trip, checks
      WHERE checks.lead_ok AND checks.lead_free
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM trip) AS trip_ok, lead_ok, lead_free
    FROM checks
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  if (!row?.trip_ok) return "invalid_trip";
  if (!row.lead_ok) return "invalid_lead";
  if (!row.lead_free) return "lead_taken";
  // Known ambiguity, kept on purpose: with a leadId, a no-op here may also be a concurrent request
  // that just took the same lead (bookings_lead_active_uq), and it reads as "duplicate" (the email
  // message). This statement cannot tell the two apart: its subqueries share the snapshot taken
  // before the competing insert committed, so neither index's winner is visible. Telling them apart
  // would need a second query; the race needs two people booking the same lead at once.
  return "duplicate";
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
// an archived trip (decision 22). Missing booking or another source status → invalid_transition; a
// pending booking of an archived trip that is being confirmed → trip_archived. One statement:
// confirming a booking linked to a lead that is not archived and not yet reserved or paid also
// moves the lead to reserved (out of lost, its reason cleared),
// with a stage_changed activity by the actor and a lead.stage_changed event with
// trigger "booking" (decision 14). Cancelling never touches the lead.
export async function setBookingStatus(
  bookingId: string,
  status: StatusChange,
  actorUserId: string,
): Promise<"changed" | "invalid_transition" | "trip_archived"> {
  const sources = sql.join(STATUS_SOURCES[status].map((source) => sql`${source}::booking_status`), sql`, `);
  const advanceLead = status === "confirmed"
    ? sql`,
    target AS (
      SELECT leads.id, leads.stage FROM leads
      JOIN changed ON changed.lead_id = leads.id
      WHERE leads.archived_at IS NULL AND leads.stage NOT IN ('reserved', 'paid')
      FOR UPDATE OF leads
    ),
    lead_updated AS (
      UPDATE leads
      SET stage = 'reserved'::lead_stage, lost_reason = NULL, updated_at = now()
      FROM target
      WHERE leads.id = target.id
      RETURNING leads.id, target.stage AS stage_from
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, body, stage_from, stage_to, actor_user_id)
      SELECT id, 'stage_changed', ${BOOKING_CONFIRMED_NOTE}, stage_from, 'reserved'::lead_stage, ${actorUserId}
      FROM lead_updated
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.stage_changed', id,
        jsonb_build_object('stageFrom', stage_from, 'stageTo', 'reserved', 'trigger', 'booking')
      FROM lead_updated
    )`
    : sql``;
  const tripGuard = status === "confirmed" ? sql` AND ${tripOpen}` : sql``;
  const result = await getDb().execute<{ changed: boolean; trip_archived: boolean }>(sql`
    WITH changed AS (
      UPDATE bookings
      SET status = ${status}::booking_status, updated_at = now()
      WHERE id = ${bookingId}::uuid AND status IN (${sources})${tripGuard}
      RETURNING id, lead_id
    )${advanceLead}
    SELECT EXISTS (SELECT 1 FROM changed) AS changed,
      EXISTS (
        SELECT 1 FROM bookings JOIN trips ON trips.id = bookings.trip_id
        WHERE bookings.id = ${bookingId}::uuid AND bookings.status = 'pending' AND ${tripArchived}
      ) AS trip_archived
  `);
  const row = result.rows[0];
  if (row?.changed) return "changed";
  return status === "confirmed" && row?.trip_archived ? "trip_archived" : "invalid_transition";
}
