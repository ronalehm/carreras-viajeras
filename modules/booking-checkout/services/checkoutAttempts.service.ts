import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingCheckoutAttempts, bookings, offerCapacityAllocations, offerCapacityCounters } from "@/lib/db-schema";

type ActiveAttempt = { id: string; bookingId: string; status: "pending" | "created" | "completed" | "expired" | "failed" };

// Retires an active attempt whose Stripe Session can no longer be paid, so it stops blocking
// `booking_checkout_attempts_active_uq` for its booking and kind. With `releaseHold`, an initial
// attempt also gives back its held seat and cancels the still-pending booking, in the same
// statement and with the same rules the webhook applies to `checkout.session.expired`. A balance
// attempt never touches capacity: its allocation is already confirmed. The seat is released only
// while the booking is still pending: a booking confirmed by hand in the CRM keeps its seat.
// Lock order, shared by every statement that releases, extends or confirms a hold (this one, the
// webhook, the expired-hold sweep and the reservation extension): the attempt first when there is
// one, then the booking (FOR UPDATE, rechecked as pending after any concurrent change), then its
// seat, then the capacity counter.
// Compare-and-set on the observed status: returns false if another request or the webhook
// changed the attempt first, and then nothing is written.
export async function retireCheckoutAttempt(
  attempt: ActiveAttempt,
  status: "expired" | "failed",
  releaseHold: boolean,
): Promise<boolean> {
  const result = await getDb().execute<{ booking_id: string }>(sql`
    WITH retired AS (
      UPDATE ${bookingCheckoutAttempts} AS a
      SET status = ${status}::booking_checkout_attempt_status, updated_at = now()
      WHERE a.id = ${attempt.id}::uuid AND a.booking_id = ${attempt.bookingId}::uuid
        AND a.status = ${attempt.status}::booking_checkout_attempt_status
        AND a.status IN ('pending', 'created')
      RETURNING a.booking_id, a.kind
    ), pending_booking AS MATERIALIZED (
      SELECT b.id FROM ${bookings} AS b
      JOIN retired r ON b.id = r.booking_id
      WHERE ${releaseHold}::boolean AND r.kind = 'initial' AND b.status = 'pending'
      FOR UPDATE OF b
    ), released AS (
      UPDATE ${offerCapacityAllocations} AS allocation
      SET status = 'released'::offer_capacity_allocation_status, released_at = now(), updated_at = now()
      FROM pending_booking p
      WHERE allocation.booking_id = p.id AND allocation.status = 'held'
      RETURNING allocation.offer_version_id, allocation.booking_id
    ), decremented AS (
      UPDATE ${offerCapacityCounters} AS counter
      SET allocated_count = greatest(0, counter.allocated_count - 1), updated_at = now()
      FROM released r WHERE counter.offer_version_id = r.offer_version_id
      RETURNING counter.offer_version_id
    ), cancelled AS (
      UPDATE ${bookings} AS b SET status = 'cancelled', updated_at = now()
      FROM released r WHERE b.id = r.booking_id AND b.status = 'pending'
      RETURNING b.id
    )
    SELECT booking_id FROM retired
  `);
  return result.rows.length > 0;
}
