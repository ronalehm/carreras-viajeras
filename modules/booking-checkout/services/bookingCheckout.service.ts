import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
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
};
export type ReservationRecord = {
  id: string; packageLabel: string; offerVersion: number; termsVersion: string; conditions: string;
  tripIncludes: string[]; tripExcludes: string[];
  quote: { totalUsd: number; principalUsd: number; balanceUsd: number; rateId: string; rateUsdPen: string; amountPenCents: number };
  expiresAt: Date;
};
export type ReservationResult = ReservationRecord | "sold_out" | "request_conflict" | "booking_exists";

export function isCheckoutSandboxEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.STRIPE_CHECKOUT_ENABLED === "true";
}

type StoredReservationRow = {
  id: string; runner_user_id: string; checkout_input_hash: string; package_label: string;
  offer_version: number; offer_terms_version: string; offer_conditions_snapshot: string; trip_includes_snapshot: string[];
  trip_excludes_snapshot: string[]; total_usd: number; initial_payment_usd: number;
  checkout_rate_id: string; checkout_rate_usd_pen: string; checkout_amount_pen_cents: number;
  reservation_expires_at: Date;
};

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
  };
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
  try {
    // Preparation can be abandoned before a Stripe Session exists, so Stripe cannot emit an
    // expiration webhook for that hold. Reclaim only elapsed pending reservations, once.
    await db.execute(sql`
      WITH expired AS (
        UPDATE ${offerCapacityAllocations} allocation
        SET status = 'released'::offer_capacity_allocation_status, released_at = now(), updated_at = now()
        FROM ${bookings} booking
        WHERE booking.id = allocation.booking_id AND allocation.status = 'held'
          AND allocation.expires_at <= now() AND booking.status = 'pending'
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
      ) SELECT booking_id FROM expired
    `);
    const result = await db.execute<StoredReservationRow & { user_id: string; input_hash: string }>(sql`
      WITH existing AS (
        SELECT id, runner_user_id, checkout_input_hash, package_label, offer_version, offer_terms_version,
          offer_conditions_snapshot, trip_includes_snapshot, trip_excludes_snapshot, total_usd,
          initial_payment_usd, checkout_rate_id, checkout_rate_usd_pen, checkout_amount_pen_cents,
          reservation_expires_at
        FROM ${bookings}
        WHERE checkout_request_id = ${snapshot.requestId}::uuid
      ),
      capacity AS (
        INSERT INTO ${offerCapacityCounters} (${sql.raw('"offer_version_id", "capacity_limit", "allocated_count"')})
        SELECT ${snapshot.offerVersionId}::uuid, ${snapshot.capacityLimit}, 1
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT (${sql.raw('"offer_version_id"')}) DO UPDATE
          SET ${sql.raw('"allocated_count"')} = ${offerCapacityCounters.allocatedCount} + 1,
              ${sql.raw('"updated_at"')} = now()
        RETURNING "offer_version_id"
      ),
      inserted AS (
        INSERT INTO ${bookings} (${sql.raw('"trip_id", "participant_name", "participant_email", "runner_user_id", "lead_id", "package_label", "distance", "total_usd", "balance_due_on", "created_by", "offer_version_id", "offer_version", "offer_campaign_id", "offer_terms_version", "offer_conditions_snapshot", "trip_includes_snapshot", "trip_excludes_snapshot", "initial_payment_usd", "checkout_rate_id", "checkout_rate_usd_pen", "checkout_amount_pen_cents", "checkout_request_id", "checkout_input_hash", "reservation_expires_at"')})
        SELECT
          ${snapshot.tripId}::uuid, ${snapshot.participantName}, ${snapshot.email}, ${snapshot.userId},
          ${snapshot.leadId}::uuid, ${snapshot.packageLabel}, ${snapshot.distance}, ${snapshot.totalUsd},
          ${snapshot.balanceDueOn}::date, NULL, ${snapshot.offerVersionId}::uuid, ${snapshot.offerVersion},
          ${snapshot.campaignId}::uuid, ${snapshot.termsVersion}, ${snapshot.conditions},
          ${textArray(snapshot.tripIncludes)}, ${textArray(snapshot.tripExcludes)}, ${snapshot.initialPaymentUsd},
          ${snapshot.rateId}::uuid, ${snapshot.rateUsdPen}::numeric, ${snapshot.amountPenCents},
          ${snapshot.requestId}::uuid, ${snapshot.inputHash}, now() + interval '30 minutes'
        FROM capacity
        RETURNING id, runner_user_id, checkout_input_hash, package_label, offer_version, offer_terms_version,
          offer_conditions_snapshot, trip_includes_snapshot, trip_excludes_snapshot, total_usd,
          initial_payment_usd, checkout_rate_id, checkout_rate_usd_pen, checkout_amount_pen_cents,
          reservation_expires_at
      ),
      allocated AS (
        INSERT INTO ${offerCapacityAllocations} (${sql.raw('"booking_id", "offer_version_id", "status", "expires_at"')})
        SELECT id, ${snapshot.offerVersionId}::uuid, 'held'::offer_capacity_allocation_status, now() + interval '30 minutes'
        FROM inserted
        RETURNING ${offerCapacityAllocations.bookingId}
      )
      SELECT inserted.id, inserted.runner_user_id, inserted.checkout_input_hash, inserted.package_label, inserted.offer_version,
        inserted.offer_terms_version, inserted.offer_conditions_snapshot, inserted.trip_includes_snapshot,
        inserted.trip_excludes_snapshot, inserted.total_usd, inserted.initial_payment_usd,
        inserted.checkout_rate_id, inserted.checkout_rate_usd_pen, inserted.checkout_amount_pen_cents,
        inserted.reservation_expires_at, inserted.runner_user_id AS user_id,
        inserted.checkout_input_hash AS input_hash
      FROM inserted JOIN allocated ON allocated.booking_id = inserted.id
      UNION ALL
      SELECT existing.id, existing.runner_user_id, existing.checkout_input_hash, existing.package_label, existing.offer_version,
        existing.offer_terms_version, existing.offer_conditions_snapshot, existing.trip_includes_snapshot,
        existing.trip_excludes_snapshot, existing.total_usd, existing.initial_payment_usd,
        existing.checkout_rate_id, existing.checkout_rate_usd_pen, existing.checkout_amount_pen_cents,
        existing.reservation_expires_at, existing.runner_user_id AS user_id,
        existing.checkout_input_hash AS input_hash
      FROM existing
    `);
    const row = result.rows[0];
    if (!row) return "sold_out";
    if (row.user_id !== snapshot.userId || row.input_hash !== snapshot.inputHash) return "request_conflict";
    return reservationRecord(row);
  } catch (error) {
    const pg = postgresError(error);
    if (pg.code === "23514" && pg.constraint === "offer_capacity_counters_count_chk") return "sold_out";
    if (pg.code !== "23505") throw new Error("checkout reservation failed");
    const result = await db.execute<StoredReservationRow>(sql`
      SELECT id, runner_user_id, checkout_input_hash, package_label, offer_version, offer_terms_version,
        offer_conditions_snapshot, trip_includes_snapshot, trip_excludes_snapshot, total_usd,
        initial_payment_usd, checkout_rate_id, checkout_rate_usd_pen, checkout_amount_pen_cents,
        reservation_expires_at FROM ${bookings}
      WHERE checkout_request_id = ${snapshot.requestId}::uuid
    `);
    const existing = result.rows[0];
    if (!existing) return "booking_exists";
    return existing.runner_user_id === snapshot.userId && existing.checkout_input_hash === snapshot.inputHash
      ? reservationRecord(existing)
      : "request_conflict";
  }
}

export async function getCheckoutReservation(
  requestId: string,
  userId: string,
  inputHash: string,
): Promise<ReservationRecord | "request_conflict" | null> {
  const result = await getDb().execute<StoredReservationRow & { runner_user_id: string; checkout_input_hash: string }>(sql`
    SELECT id, runner_user_id, checkout_input_hash, package_label, offer_version, offer_terms_version,
      offer_conditions_snapshot, trip_includes_snapshot, trip_excludes_snapshot, total_usd,
      initial_payment_usd, checkout_rate_id, checkout_rate_usd_pen, checkout_amount_pen_cents,
      reservation_expires_at
    FROM ${bookings} WHERE checkout_request_id = ${requestId}::uuid
  `);
  const row = result.rows[0];
  if (!row) return null;
  if (row.runner_user_id !== userId || row.checkout_input_hash !== inputHash) return "request_conflict";
  return reservationRecord(row);
}
