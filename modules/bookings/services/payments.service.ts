import "server-only";
import { and, asc, eq, exists, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookingPayments, bookings, profiles } from "@/lib/db-schema";
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

// One statement: the payment is inserted only for a booking that exists and is not cancelled.
// recorded_by is always the actor; voided_* stay NULL.
export async function addPayment(input: PaymentInput, actorUserId: string): Promise<"added" | "not_found"> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO booking_payments (booking_id, amount_usd, paid_on, concept, recorded_by)
    SELECT id, ${input.amountUsd}::integer, ${input.paidOn}::date, ${input.concept}, ${actorUserId}
    FROM bookings
    WHERE id = ${input.bookingId}::uuid AND status <> 'cancelled'
    RETURNING id
  `);
  return result.rows.length > 0 ? "added" : "not_found";
}

// A payment is voided once, and only while its booking is not cancelled. Missing payment, already
// voided or cancelled booking → not_found.
export async function voidPayment(
  paymentId: string,
  actorUserId: string,
): Promise<{ bookingId: string } | "not_found"> {
  const db = getDb();
  const [voided] = await db
    .update(bookingPayments)
    .set({ voidedAt: sql`now()`, voidedBy: actorUserId })
    .where(
      and(
        eq(bookingPayments.id, paymentId),
        isNull(bookingPayments.voidedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(bookings)
            .where(and(eq(bookings.id, bookingPayments.bookingId), ne(bookings.status, "cancelled"))),
        ),
      ),
    )
    .returning({ bookingId: bookingPayments.bookingId });
  return voided ?? "not_found";
}
