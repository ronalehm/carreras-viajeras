import "server-only";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getStripeCheckoutConfig, type StripeMode } from "@/lib/env";
import { bookings, offerCapacityAllocations, offerCapacityCounters } from "@/lib/db-schema";

function textArray(values: string[]) {
  return values.length
    ? sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`
    : sql`ARRAY[]::text[]`;
}

export type CheckoutReservationSnapshot = {
  requestId: string;
  inputHash: string;
  userId: string;
  email: string;
  leadId: string;
  tripId: string;
  participantName: string;
  packageLabel: string;
  distance: string | null;
  totalUsd: number;
  initialPaymentUsd: number;
  balanceDueOn: string | null;
  offerVersionId: string;
  offerVersion: number;
  campaignId: string | null;
  termsVersion: string;
  conditions: string;
  tripIncludes: string[];
  tripExcludes: string[];
  rateId: string;
  rateUsdPen: string;
  amountPenCents: number;
  capacityLimit: number | null;
  // True for every Stripe TEST mode (test or demo): no seat is held and the booking never counts
  // as a real one (see isSimulatedMode).
  simulated: boolean;
};
export type ReservationRecord = {
  id: string; packageLabel: string; offerVersion: number; termsVersion: string; conditions: string;
  tripIncludes: string[]; tripExcludes: string[];
  quote: { totalUsd: number; principalUsd: number; balanceUsd: number; rateId: string; rateUsdPen: string; amountPenCents: number };
  expiresAt: Date;
  simulated: boolean;
};
export type ReservationResult = ReservationRecord | "sold_out" | "request_conflict" | "booking_exists";

// Checkout is on only when the Stripe configuration allows it for this environment (test mode
// outside production; live, or demo with STRIPE_DEMO_MODE, with every production requirement met).
// Fails closed.
export function isCheckoutEnabled(): boolean {
  return getStripeCheckoutConfig().enabled;
}

// The mode of the enabled Checkout, or null while it is off.
export function enabledCheckoutMode(): StripeMode | null {
  const config = getStripeCheckoutConfig();
  return config.enabled ? config.mode : null;
}

type StoredReservationRow = {
  id: string; runner_user_id: string; checkout_input_hash: string; package_label: string;
  offer_version: number; offer_terms_version: string; offer_conditions_snapshot: string; trip_includes_snapshot: string[];
  trip_excludes_snapshot: string[]; total_usd: number; initial_payment_usd: number;
  checkout_rate_id: string; checkout_rate_usd_pen: string; checkout_amount_pen_cents: number;
  reservation_expires_at: Date; is_simulated: boolean;
};
const RESERVATION_COLUMNS = [
  "id", "runner_user_id", "checkout_input_hash", "package_label", "offer_version", "offer_terms_version",
  "offer_conditions_snapshot", "trip_includes_snapshot", "trip_excludes_snapshot", "total_usd", "initial_payment_usd",
  "checkout_rate_id", "checkout_rate_usd_pen", "checkout_amount_pen_cents", "reservation_expires_at", "is_simulated",
] as const satisfies readonly (keyof StoredReservationRow)[];
const STORED_RESERVATION_COLUMNS = sql.raw(RESERVATION_COLUMNS.join(", "));
function prefixedColumns(table: "inserted" | "existing") {
  return sql.raw(RESERVATION_COLUMNS.map(column => `${table}.${column}`).join(", "));
}

function reservationRecord(row: StoredReservationRow): ReservationRecord {
  return {
    id: row.id, packageLabel: row.package_label, offerVersion: row.offer_version, termsVersion: row.offer_terms_version,
    conditions: row.offer_conditions_snapshot, tripIncludes: row.trip_includes_snapshot,
    tripExcludes: row.trip_excludes_snapshot,
    quote: {
      totalUsd: Number(row.total_usd), principalUsd: Number(row.initial_payment_usd),
      balanceUsd: Number(row.total_usd) - Number(row.initial_payment_usd), rateId: row.checkout_rate_id,
      rateUsdPen: row.checkout_rate_usd_pen, amountPenCents: Number(row.checkout_amount_pen_cents),
    },
    expiresAt: new Date(row.reservation_expires_at),
    simulated: row.is_simulated,
  };
}

// A request id names one reservation of one runner, input and mode: the same id replayed in the
// other mode (a simulated booking under a live key, or the reverse) is a conflict, never a resume.
function ownsReservation(row: StoredReservationRow, userId: string, inputHash: string, simulated: boolean) {
  return row.runner_user_id === userId && row.checkout_input_hash === inputHash && row.is_simulated === simulated;
}

function postgresError(error: unknown): { code?: string; constraint?: string } {
  if (!error || typeof error !== "object") return {};
  const value = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (typeof value.code !== "string" && value.cause) return postgresError(value.cause);
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    constraint: typeof value.constraint === "string" ? value.constraint : undefined,
  };
}

export async function persistCheckoutReservation(snapshot: CheckoutReservationSnapshot): Promise<ReservationResult> {
  const db = getDb();
  // A real booking holds a seat: the counter is incremented and an allocation is created in the
  // same statement. A simulated one never touches offer_capacity_counters nor allocations.
  const real = !snapshot.simulated;
  try {
    // Preparation can be abandoned before a Stripe Session exists, so Stripe cannot emit an
    // expiration webhook for that hold. Reclaim only elapsed pending reservations, once.
    // Same lock order as the other release paths: the pending bookings first (in id order, so two
    // sweeps never wait on each other in a cycle), then their seats, rechecked as still expired.
    // Elapsed pending simulated bookings have no seat: they are only cancelled, in the same order.
    await db.execute(sql`
      WITH expired_booking AS MATERIALIZED (
        SELECT booking.id FROM ${bookings} booking
        JOIN ${offerCapacityAllocations} allocation ON allocation.booking_id = booking.id
        WHERE allocation.status = 'held' AND allocation.expires_at <= now() AND booking.status = 'pending'
        ORDER BY booking.id
        FOR UPDATE OF booking
      ), expired AS (
        UPDATE ${offerCapacityAllocations} allocation
        SET status = 'released'::offer_capacity_allocation_status, released_at = now(), updated_at = now()
        FROM expired_booking booking
        WHERE booking.id = allocation.booking_id AND allocation.status = 'held'
          AND allocation.expires_at <= now()
        RETURNING allocation.booking_id, allocation.offer_version_id
      ), decremented AS (
        UPDATE ${offerCapacityCounters} counter
        SET allocated_count = greatest(0, counter.allocated_count - counts.amount), updated_at = now()
        FROM (SELECT offer_version_id, count(*)::int AS amount FROM expired GROUP BY offer_version_id) counts
        WHERE counter.offer_version_id = counts.offer_version_id
        RETURNING counter.offer_version_id
      ), cancelled AS (
        UPDATE ${bookings} booking SET status = 'cancelled', updated_at = now()
        FROM expired WHERE booking.id = expired.booking_id AND booking.status = 'pending'
        RETURNING booking.id
      ), expired_simulated AS MATERIALIZED (
        SELECT booking.id FROM ${bookings} booking
        WHERE booking.is_simulated AND booking.status = 'pending' AND booking.offer_version_id IS NOT NULL
          AND booking.reservation_expires_at <= now()
        ORDER BY booking.id
        FOR UPDATE OF booking
      ), cancelled_simulated AS (
        UPDATE ${bookings} booking SET status = 'cancelled', updated_at = now()
        FROM expired_simulated expired
        WHERE booking.id = expired.id AND booking.status = 'pending' AND booking.reservation_expires_at <= now()
        RETURNING booking.id
      ) SELECT booking_id FROM expired
    `);
    const capacity = real ? sql`
      capacity AS (
        INSERT INTO ${offerCapacityCounters} (${sql.raw('"offer_version_id", "capacity_limit", "allocated_count"')})
        SELECT ${snapshot.offerVersionId}::uuid, ${snapshot.capacityLimit}, 1
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT (${sql.raw('"offer_version_id"')}) DO UPDATE
          SET ${sql.raw('"allocated_count"')} = ${offerCapacityCounters.allocatedCount} + 1,
              ${sql.raw('"updated_at"')} = now()
        RETURNING "offer_version_id"
      ),` : sql``;
    const insertSource = real ? sql`FROM capacity` : sql`WHERE NOT EXISTS (SELECT 1 FROM existing)`;
    const allocated = real ? sql`,
      allocated AS (
        INSERT INTO ${offerCapacityAllocations} (${sql.raw('"booking_id", "offer_version_id", "status", "expires_at"')})
        SELECT id, ${snapshot.offerVersionId}::uuid, 'held'::offer_capacity_allocation_status, now() + interval '30 minutes'
        FROM inserted
        RETURNING ${offerCapacityAllocations.bookingId}
      )` : sql``;
    const insertedRows = real ? sql`FROM inserted JOIN allocated ON allocated.booking_id = inserted.id` : sql`FROM inserted`;
    const result = await db.execute<StoredReservationRow>(sql`
      WITH existing AS (
        SELECT ${STORED_RESERVATION_COLUMNS}
        FROM ${bookings}
        WHERE checkout_request_id = ${snapshot.requestId}::uuid
      ),${capacity}
      -- created_by is NOT NULL (FK to profiles): a self-service booking is created by its runner,
      -- whose profile the verified-email guard registers before preparation runs.
      inserted AS (
        INSERT INTO ${bookings} (${sql.raw('"trip_id", "participant_name", "participant_email", "runner_user_id", "lead_id", "package_label", "distance", "total_usd", "balance_due_on", "created_by", "offer_version_id", "offer_version", "offer_campaign_id", "offer_terms_version", "offer_conditions_snapshot", "trip_includes_snapshot", "trip_excludes_snapshot", "initial_payment_usd", "checkout_rate_id", "checkout_rate_usd_pen", "checkout_amount_pen_cents", "checkout_request_id", "checkout_input_hash", "reservation_expires_at", "is_simulated"')})
        SELECT
          ${snapshot.tripId}::uuid, ${snapshot.participantName}, ${snapshot.email}, ${snapshot.userId},
          ${snapshot.leadId}::uuid, ${snapshot.packageLabel}, ${snapshot.distance}, ${snapshot.totalUsd},
          ${snapshot.balanceDueOn}::date, ${snapshot.userId}, ${snapshot.offerVersionId}::uuid, ${snapshot.offerVersion},
          ${snapshot.campaignId}::uuid, ${snapshot.termsVersion}, ${snapshot.conditions},
          ${textArray(snapshot.tripIncludes)}, ${textArray(snapshot.tripExcludes)}, ${snapshot.initialPaymentUsd},
          ${snapshot.rateId}::uuid, ${snapshot.rateUsdPen}::numeric, ${snapshot.amountPenCents},
          ${snapshot.requestId}::uuid, ${snapshot.inputHash}, now() + interval '30 minutes', ${snapshot.simulated}::boolean
        ${insertSource}
        RETURNING ${STORED_RESERVATION_COLUMNS}
      )${allocated}
      SELECT ${prefixedColumns("inserted")}
      ${insertedRows}
      UNION ALL
      SELECT ${prefixedColumns("existing")}
      FROM existing
    `);
    const row = result.rows[0];
    if (!row) return "sold_out";
    if (!ownsReservation(row, snapshot.userId, snapshot.inputHash, snapshot.simulated)) return "request_conflict";
    return reservationRecord(row);
  } catch (error) {
    const pg = postgresError(error);
    if (pg.code === "23514" && pg.constraint === "offer_capacity_counters_count_chk") return "sold_out";
    if (pg.code !== "23505") throw new Error("checkout reservation failed");
    const result = await db.execute<StoredReservationRow>(sql`
      SELECT ${STORED_RESERVATION_COLUMNS} FROM ${bookings}
      WHERE checkout_request_id = ${snapshot.requestId}::uuid
    `);
    const existing = result.rows[0];
    if (!existing) return "booking_exists";
    return ownsReservation(existing, snapshot.userId, snapshot.inputHash, snapshot.simulated)
      ? reservationRecord(existing)
      : "request_conflict";
  }
}

export async function getCheckoutReservation(
  requestId: string,
  userId: string,
  inputHash: string,
  simulated: boolean,
): Promise<ReservationRecord | "request_conflict" | null> {
  const result = await getDb().execute<StoredReservationRow>(sql`
    SELECT ${STORED_RESERVATION_COLUMNS}
    FROM ${bookings} WHERE checkout_request_id = ${requestId}::uuid
  `);
  const row = result.rows[0];
  if (!row) return null;
  if (!ownsReservation(row, userId, inputHash, simulated)) return "request_conflict";
  return reservationRecord(row);
}

// The active checkout booking of this runner for the trip, so preparation resumes it: for real
// bookings, the one `bookings_trip_email_active_uq` protects; simulated ones are outside that index
// and only resume other simulated ones. Scoped by the session's user id: another account's booking
// with the same email is never returned.
export async function findResumableCheckoutBooking(
  tripId: string, email: string, userId: string, simulated: boolean,
): Promise<string | null> {
  const [row] = await getDb().select({ id: bookings.id }).from(bookings).where(and(
    eq(bookings.tripId, tripId), eq(bookings.participantEmail, email), eq(bookings.runnerUserId, userId),
    eq(bookings.status, "pending"), isNotNull(bookings.offerVersionId), gt(bookings.reservationExpiresAt, sql`now()`),
    eq(bookings.isSimulated, simulated),
  )).orderBy(desc(bookings.createdAt)).limit(1);
  return row?.id ?? null;
}
