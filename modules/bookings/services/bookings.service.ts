import "server-only";
import { and, asc, desc, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookingBenefits, bookings, leads, trips } from "@/lib/db-schema";
import type {
  BookingBalance,
  BookingInput,
  BookingListFilter,
  BookingStatus,
  CrmBooking,
  CrmBookingListItem,
  UpdateBookingInput,
} from "../types/bookings.types";
import { getBookingBalance } from "./bookingBalance.service";

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
  simulated: bookings.isSimulated,
  linked: sql<boolean>`${bookings.runnerUserId} is not null`,
  trip: { id: trips.id, title: trips.title },
};

const detailColumns = {
  ...listColumns,
  distance: bookings.distance,
  balanceDueOn: bookings.balanceDueOn,
  internalNote: bookings.internalNote,
  createdAt: bookings.createdAt,
  lead: { id: leads.id, fullName: leads.fullName },
  priceLocked: sql<boolean>`exists (select 1 from booking_benefits where booking_id = ${bookings.id} and kind = 'discount')`,
};

// Absent only if the row disappeared between the two reads (the manual cleanup of simulated
// bookings): count nothing as paid rather than fail the page.
function balanceOf(balances: Map<string, BookingBalance>, id: string, totalUsd: number): BookingBalance {
  return balances.get(id) ?? { totalUsd, paidUsd: 0, balanceUsd: totalUsd, stripePayments: [], needsReview: [] };
}

// Real and simulated bookings are never listed together (bookings-stripe-checkout-demo.md, C): the
// CRM shows real ones by default and simulated ones apart. Paid and balance come from the common
// balance in one more batch for the whole page (no N+1).
// ponytail: no pagination; add it when the list passes ~200 rows.
export async function listBookings(filter: BookingListFilter = { simulated: false }): Promise<CrmBookingListItem[]> {
  const rows = await getDb()
    .select(listColumns)
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(and(
      eq(bookings.isSimulated, filter.simulated),
      filter.tripId === undefined ? undefined : eq(bookings.tripId, filter.tripId),
    ))
    .orderBy(desc(trips.raceDate), asc(bookings.participantName));
  if (rows.length === 0) return [];
  const balances = await getBookingBalance(rows.map((row) => row.id));
  return rows.map((row) => {
    const { paidUsd, balanceUsd, needsReview } = balanceOf(balances, row.id, row.totalUsd);
    return { ...row, paidUsd, balanceUsd, paymentInReview: needsReview.length > 0 };
  });
}

// The linked lead (if any) comes through a LEFT JOIN: drizzle maps an all-NULL lead to null. The
// balance is read in parallel: the id is known.
export async function getBookingById(id: string): Promise<CrmBooking | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  const [[booking], balances] = await Promise.all([
    getDb()
      .select(detailColumns)
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .leftJoin(leads, eq(leads.id, bookings.leadId))
      .where(eq(bookings.id, id)),
    getBookingBalance([id]),
  ]);
  if (!booking) return null;
  const { paidUsd, balanceUsd, stripePayments, needsReview } = balanceOf(balances, id, booking.totalUsd);
  return { ...booking, paidUsd, balanceUsd, paymentInReview: needsReview.length > 0, stripePayments, needsReview };
}

// The lead's active (non-cancelled) real booking, for the lead's page: at most one exists
// (bookings_lead_active_uq, which excludes simulated bookings).
export async function getLeadBooking(leadId: string): Promise<{ id: string; status: BookingStatus } | null> {
  if (!uuidSchema.safeParse(leadId).success) return null;
  const [booking] = await getDb()
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.leadId, leadId), ne(bookings.status, "cancelled"), eq(bookings.isSimulated, false)))
    .limit(1);
  return booking ?? null;
}

// One statement: the booking is inserted only for a trip that is not archived and, when linked,
// for a lead that exists, is not archived and has no other non-cancelled real booking (a simulated
// one never blocks it, like the partial unique indexes). The partial
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
          SELECT 1 FROM bookings active
          WHERE active.lead_id = link.lead_id AND active.status <> 'cancelled' AND NOT active.is_simulated
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

// One batch (one transaction). The UPDATE decides with its WHERE: not cancelled, email unchanged once
// linked, no other active real booking of the same trip with that email (bookings_trip_email_active_uq). The SELECT explains a no-op.
export async function updateBooking(
  input: UpdateBookingInput,
): Promise<"updated" | "not_found" | "cancelled" | "email_locked" | "duplicate" | "discount_locked"> {
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
                  eq(other.isSimulated, false),
                  ne(other.id, bookings.id),
                ),
              ),
          ),
          or(
            eq(bookings.totalUsd, input.totalUsd),
            notExists(db.select({ one: sql`1` }).from(bookingBenefits).where(
              and(eq(bookingBenefits.bookingId, bookings.id), eq(bookingBenefits.kind, "discount")),
            )),
          ),
        ),
      )
      .returning({ id: bookings.id }),
    db
      .select({
        status: bookings.status,
        participantEmail: bookings.participantEmail,
        linked: sql<boolean>`${bookings.runnerUserId} is not null`,
        totalUsd: bookings.totalUsd,
        discountLocked: sql<boolean>`exists (select 1 from booking_benefits where booking_id = ${bookings.id} and kind = 'discount')`,
      })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId)),
  ]).catch((error: unknown) => {
    // The database trigger closes the race with a concurrently applied discount.
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23514"
      && "constraint" in cause && cause.constraint === "bookings_reward_price_locked") {
      return null;
    }
    throw error;
  });

  if (result === null) return "discount_locked";
  const [updated, current] = result;
  if (updated.length > 0) return "updated";
  const [booking] = current;
  if (!booking) return "not_found";
  if (booking.status === "cancelled") return "cancelled";
  if (booking.linked && booking.participantEmail !== input.participantEmail) return "email_locked";
  if (booking.discountLocked && booking.totalUsd !== input.totalUsd) return "discount_locked";
  return "duplicate";
}

// confirmed ← pending; cancelled ← pending | confirmed. Missing booking or another source status
// → invalid_transition. One statement: confirming a real booking linked to a lead that is not
// archived and not yet reserved or paid also moves the lead to reserved (out of lost, its reason
// cleared), with a stage_changed activity by the actor and a lead.stage_changed event with
// trigger "booking" (decision 14). A simulated booking (demo checkout) never touches the lead nor
// enqueues commercial events for n8n (bookings-stripe-checkout-demo.md, C). Cancelling never touches the lead.
export async function setBookingStatus(
  bookingId: string,
  status: StatusChange,
  actorUserId: string,
): Promise<"changed" | "invalid_transition"> {
  const sources = sql.join(STATUS_SOURCES[status].map((source) => sql`${source}::booking_status`), sql`, `);
  const advanceLead = status === "confirmed"
    ? sql`,
    target AS (
      SELECT leads.id, leads.stage FROM leads
      JOIN changed ON changed.lead_id = leads.id AND NOT changed.is_simulated
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
  const result = await getDb().execute<{ changed: boolean }>(sql`
    WITH changed AS (
      UPDATE bookings
      SET status = ${status}::booking_status, updated_at = now()
      WHERE id = ${bookingId}::uuid AND status IN (${sources})
      RETURNING id, lead_id, is_simulated
    )${advanceLead}
    SELECT EXISTS (SELECT 1 FROM changed) AS changed
  `);
  return result.rows[0]?.changed ? "changed" : "invalid_transition";
}
