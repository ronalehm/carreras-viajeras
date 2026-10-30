import "server-only";
import { asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { bookingStripeSettlements, bookings } from "@/lib/db-schema";
import type { BookingBalance, StripePayment } from "../types/bookings.types";
import { limaDate } from "../utils/bookingDisplay";

const bookingIdsSchema = z.array(z.uuid());

// The common balance of the portal and the CRM (bookings-stripe-checkout-production.md, Lógica E):
// paid = non-voided booking_payments + booking_stripe_settlements 'applied'; balance = total − paid.
// 'needs_review' settlements never count as paid and are returned apart for reconciliation.
// One batch (one transaction, two statements) for any number of bookings: no N+1. Ids that are not
// UUIDs, or that do not exist, are simply absent from the map.
export async function getBookingBalance(bookingIds: readonly string[]): Promise<Map<string, BookingBalance>> {
  const ids = [...new Set(bookingIds)];
  if (ids.length === 0 || !bookingIdsSchema.safeParse(ids).success) return new Map();

  const db = getDb();
  const [totals, settlements] = await db.batch([
    db
      .select({
        id: bookings.id,
        totalUsd: bookings.totalUsd,
        // SUM(integer) is bigint (text on the wire): map it back to number.
        // Written-out names: in a single-table select drizzle drops the table prefix, and a bare
        // "id" inside the subquery would bind to booking_payments.id.
        manualPaidUsd: sql<number>`coalesce((select sum(p.amount_usd) from booking_payments p where p.booking_id = bookings.id and p.voided_at is null), 0)`
          .mapWith(Number),
      })
      .from(bookings)
      .where(inArray(bookings.id, ids)),
    db
      .select({
        id: bookingStripeSettlements.id,
        bookingId: bookingStripeSettlements.bookingId,
        amountUsd: bookingStripeSettlements.amountUsd,
        paidAt: bookingStripeSettlements.paidAt,
        status: bookingStripeSettlements.status,
      })
      .from(bookingStripeSettlements)
      .where(inArray(bookingStripeSettlements.bookingId, ids))
      .orderBy(asc(bookingStripeSettlements.paidAt), asc(bookingStripeSettlements.recordedAt)),
  ]);

  const balances = new Map<string, BookingBalance>();
  for (const row of totals) {
    balances.set(row.id, {
      totalUsd: row.totalUsd,
      paidUsd: row.manualPaidUsd,
      balanceUsd: row.totalUsd - row.manualPaidUsd,
      stripePayments: [],
      needsReview: [],
    });
  }
  for (const settlement of settlements) {
    const balance = balances.get(settlement.bookingId);
    if (!balance) continue;
    const payment: StripePayment = {
      id: settlement.id,
      amountUsd: settlement.amountUsd,
      paidOn: limaDate(settlement.paidAt),
    };
    if (settlement.status === "applied") {
      balance.stripePayments.push(payment);
      balance.paidUsd += payment.amountUsd;
      balance.balanceUsd -= payment.amountUsd;
    } else {
      balance.needsReview.push(payment);
    }
  }
  return balances;
}
