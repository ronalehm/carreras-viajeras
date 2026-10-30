import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingPayments, bookingStripeSettlements, bookings, itineraryItems, trips, tripUpdates } from "@/lib/db-schema";
import type { RunnerBookingDetail, RunnerPortalData, ScheduleEdge } from "../types/bookings.types";
import { orderRunnerBookings } from "../utils/runnerBookings";
import { limaDate } from "../utils/bookingDisplay";

// Columns that may leave the database for the runner. Never participant_email, participant_name,
// internal_note, created_by, recorded_by or voided_by.
const summaryColumns = {
  id: bookings.id,
  status: bookings.status,
  trip: {
    title: trips.title,
    city: trips.city,
    country: trips.country,
    raceDate: trips.raceDate,
    startDate: trips.startDate,
    endDate: trips.endDate,
    includes: trips.includes,
  },
};

// Postgres `time` comes back as HH:MM:SS; the portal shows HH:MM.
function edge(date: string | null, time: string | null, timeZone: string | null): ScheduleEdge | null {
  return date ? { date, time: time ? time.slice(0, 5) : null, timeZone } : null;
}

// Requirements 3, 5, 6 and 7. `email` is the session's verified, lowercase email; `today` is Lima's date.
// Every read is scoped by runner_user_id = userId: a foreign, missing or malformed bookingParam
// falls back to the default booking without revealing anything.
export async function loadRunnerPortal(
  userId: string,
  email: string,
  bookingParam: unknown,
  today: string,
): Promise<RunnerPortalData> {
  const db = getDb();

  // One batch (one transaction): link unlinked bookings by verified email (idempotent, never
  // overwrites an existing link), then list this user's bookings, which already sees the new links.
  const [, rows] = await db.batch([
    db
      .update(bookings)
      .set({ runnerUserId: userId, updatedAt: sql`now()` })
      .where(and(eq(bookings.participantEmail, email), isNull(bookings.runnerUserId))),
    db
      .select(summaryColumns)
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(eq(bookings.runnerUserId, userId)),
  ]);

  const ordered = orderRunnerBookings(rows, today);
  if (ordered.length === 0) return { bookings: [], selected: null };

  // Membership in the user's own list is the validation: anything else (non-string, array,
  // malformed or foreign id) can never match, so the default booking is used.
  const chosen = ordered.find((b) => b.id === bookingParam) ?? ordered[0];
  const owned = and(eq(bookings.id, chosen.id), eq(bookings.runnerUserId, userId));

  const [details, manualPayments, stripeSettlements, items, updates] = await db.batch([
    db
      .select({
        packageLabel: bookings.packageLabel,
        distance: bookings.distance,
        totalUsd: bookings.totalUsd,
        balanceDueOn: bookings.balanceDueOn,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(owned),
    db
      .select({
        id: bookingPayments.id,
        amountUsd: bookingPayments.amountUsd,
        paidOn: bookingPayments.paidOn,
        concept: bookingPayments.concept,
      })
      .from(bookingPayments)
      .innerJoin(bookings, eq(bookings.id, bookingPayments.bookingId))
      .where(and(owned, isNull(bookingPayments.voidedAt)))
      .orderBy(asc(bookingPayments.paidOn), asc(bookingPayments.createdAt)),
    db
      .select({ id: bookingStripeSettlements.id, amountUsd: bookingStripeSettlements.amountUsd, paidAt: bookingStripeSettlements.paidAt })
      .from(bookingStripeSettlements)
      .innerJoin(bookings, eq(bookings.id, bookingStripeSettlements.bookingId))
      .where(and(owned, eq(bookingStripeSettlements.status, "applied")))
      .orderBy(asc(bookingStripeSettlements.paidAt), asc(bookingStripeSettlements.recordedAt)),
    // Trip-wide items plus this booking's own items, only those visible to the runner.
    db
      .select({
        id: itineraryItems.id,
        kind: itineraryItems.kind,
        status: itineraryItems.status,
        title: itineraryItems.title,
        details: itineraryItems.details,
        location: itineraryItems.location,
        startDate: itineraryItems.startDate,
        startTime: itineraryItems.startTime,
        startTimeZone: itineraryItems.startTimeZone,
        endDate: itineraryItems.endDate,
        endTime: itineraryItems.endTime,
        endTimeZone: itineraryItems.endTimeZone,
      })
      .from(itineraryItems)
      .innerJoin(bookings, eq(bookings.tripId, itineraryItems.tripId))
      .where(
        and(
          owned,
          eq(itineraryItems.runnerVisible, true),
          or(isNull(itineraryItems.bookingId), eq(itineraryItems.bookingId, bookings.id)),
        ),
      ),
    db
      .select({
        id: tripUpdates.id,
        title: tripUpdates.title,
        body: tripUpdates.body,
        publishedAt: tripUpdates.publishedAt,
      })
      .from(tripUpdates)
      .innerJoin(bookings, eq(bookings.tripId, tripUpdates.tripId))
      .where(owned)
      .orderBy(desc(tripUpdates.publishedAt)),
  ]);

  const [detail] = details;
  // Unlinked between the two batches (manual SQL): show the list without a detail.
  if (!detail) return { bookings: ordered, selected: null };

  const payments = [...manualPayments, ...stripeSettlements.map((settlement) => ({
    id: settlement.id,
    amountUsd: settlement.amountUsd,
    paidOn: limaDate(settlement.paidAt),
    concept: "Stripe - tarjeta",
  }))].sort((a, b) => a.paidOn.localeCompare(b.paidOn));

  const selected: RunnerBookingDetail = {
    ...chosen,
    ...detail,
    payments,
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      status: i.status,
      title: i.title,
      details: i.details,
      location: i.location,
      start: edge(i.startDate, i.startTime, i.startTimeZone),
      end: edge(i.endDate, i.endTime, i.endTimeZone),
    })),
    updates,
  };
  return { bookings: ordered, selected };
}
