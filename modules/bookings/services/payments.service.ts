import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookingPayments, profiles } from "@/lib/db-schema";
import type { CrmPayment, PaymentInput } from "../types/bookings.types";

const bookingIdSchema = z.uuid();

// Every payment of the booking, voided ones included, with the email of who recorded it. A non-UUID
// id returns [] without a query, so the page can load it in parallel with getBookingById.
export async function listBookingPayments(bookingId: string): Promise<CrmPayment[]> {
  if (!bookingIdSchema.safeParse(bookingId).success) return [];
  return getDb()
    .select({
      id: bookingPayments.id,
      amountUsd: bookingPayments.amountUsd,
      paidOn: bookingPayments.paidOn,
      concept: bookingPayments.concept,
      recordedByEmail: profiles.email,
      voided: sql<boolean>`${bookingPayments.voidedAt} is not null`,
    })
    .from(bookingPayments)
    .innerJoin(profiles, eq(profiles.userId, bookingPayments.recordedBy))
    .where(eq(bookingPayments.bookingId, bookingId))
    .orderBy(asc(bookingPayments.paidOn), asc(bookingPayments.createdAt));
}

// Lock the booking before writing: discounts, cancellation and payment registration
// serialize on this same row. A receipt's stable request key makes retries idempotent.
export async function addPayment(input: PaymentInput, actorUserId: string): Promise<"added" | "not_found" | "payment_conflict"> {
  const result = await getDb().execute<{ added: boolean; booking_ok: boolean }>(sql`
    WITH target AS MATERIALIZED (
      SELECT id FROM bookings
      WHERE id = ${input.bookingId}::uuid AND status <> 'cancelled'
      FOR UPDATE
    ), inserted AS (
      INSERT INTO booking_payments (booking_id, amount_usd, paid_on, concept, recorded_by, request_key)
      SELECT id, ${input.amountUsd}::integer, ${input.paidOn}::date, ${input.concept}, ${actorUserId}, ${input.requestKey}::uuid
      FROM target
      ON CONFLICT (booking_id, request_key) DO UPDATE SET request_key = EXCLUDED.request_key
      WHERE booking_payments.amount_usd = EXCLUDED.amount_usd
        AND booking_payments.paid_on = EXCLUDED.paid_on
        AND booking_payments.concept = EXCLUDED.concept
        AND booking_payments.recorded_by = EXCLUDED.recorded_by
        AND booking_payments.voided_at IS NULL
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS added, EXISTS (SELECT 1 FROM target) AS booking_ok
  `);
  const [row] = result.rows;
  return row?.added ? "added" : row?.booking_ok ? "payment_conflict" : "not_found";
}

export async function voidPayment(paymentId: string, actorUserId: string): Promise<{ bookingId: string } | "not_found"> {
  const result = await getDb().execute<{ booking_id: string }>(sql`
    WITH target AS MATERIALIZED (
      SELECT b.id FROM bookings b
      JOIN booking_payments p ON p.booking_id = b.id
      WHERE p.id = ${paymentId}::uuid AND b.status <> 'cancelled'
      FOR UPDATE OF b
    )
    UPDATE booking_payments p
    SET voided_at = now(), voided_by = ${actorUserId}
    FROM target
    WHERE p.id = ${paymentId}::uuid AND p.booking_id = target.id AND p.voided_at IS NULL
    RETURNING p.booking_id
  `);
  return result.rows[0] ? { bookingId: result.rows[0].booking_id } : "not_found";
}
