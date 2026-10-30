import "server-only";
import Stripe from "stripe";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingCheckoutAttempts, bookingContractAcceptances, bookingStripeSettlements, bookings, offerCapacityAllocations, trips } from "@/lib/db-schema";
import { parseUsdPenRate, usdToPenCents } from "@/lib/currency";
import { checkoutQuoteHash } from "./quote.service";
import type { CreateCheckoutSessionInput } from "../schemas/checkout.schema";
import { isCheckoutSandboxEnabled } from "./bookingCheckout.service";

export type CreateSessionResult =
  | { state: "created" | "reused"; attemptId: string; checkoutUrl: string }
  | "checkout_unavailable" | "booking_not_found" | "contract_not_accepted" | "reservation_expired"
  | "quote_changed" | "attempt_conflict" | "attempt_expired" | "balance_not_due";

export async function getBookingCheckoutState(bookingId: string, attemptId: string, userId: string) {
  const [row] = await getDb().select({
    kind: bookingCheckoutAttempts.kind,
    status: bookingCheckoutAttempts.status, amountUsd: bookingCheckoutAttempts.amountUsd,
    amountPenCents: bookingCheckoutAttempts.amountPenCents, checkoutUrl: bookingCheckoutAttempts.checkoutUrl,
    settlementStatus: bookingStripeSettlements.status,
    totalUsd: bookings.totalUsd, initialPaymentUsd: bookings.initialPaymentUsd,
    offerVersion: bookings.offerVersion, termsVersion: bookings.offerTermsVersion,
    rateId: bookings.checkoutRateId, rateUsdPen: bookings.checkoutRateUsdPen,
  }).from(bookingCheckoutAttempts)
    .innerJoin(bookings, eq(bookings.id, bookingCheckoutAttempts.bookingId))
    .leftJoin(bookingStripeSettlements, eq(bookingStripeSettlements.attemptId, bookingCheckoutAttempts.id))
    .where(and(eq(bookingCheckoutAttempts.id, attemptId), eq(bookingCheckoutAttempts.bookingId, bookingId), eq(bookings.runnerUserId, userId)))
    .limit(1);
  if (!row) return null;
  const balanceUsd = row.totalUsd - (row.initialPaymentUsd ?? 0);
  const rateE4 = row.rateUsdPen ? parseUsdPenRate(row.rateUsdPen) : null;
  const balancePenCents = balanceUsd > 0 && rateE4 !== null ? usdToPenCents(balanceUsd, rateE4) : 0;
  const balanceQuote = row.kind === "initial" && row.settlementStatus === "applied" && balanceUsd > 0
    && rateE4 !== null && row.rateId && row.offerVersion && row.termsVersion
    ? { amountUsd: balanceUsd, amountPenCents: balancePenCents, quoteHash: checkoutQuoteHash({
        bookingId, kind: "balance", offerVersion: row.offerVersion, termsVersion: row.termsVersion,
        amountUsd: balanceUsd, amountPenCents: balancePenCents, rateId: row.rateId, rateUsdPen: row.rateUsdPen!,
      }) }
    : null;
  return {
    status: row.settlementStatus === "applied" ? "paid" : row.settlementStatus === "needs_review" ? "needs_review" : row.status,
    amountUsd: row.amountUsd, amountPenCents: row.amountPenCents,
    checkoutUrl: row.status === "created" ? row.checkoutUrl : null,
    balanceQuote,
  };
}

type StripeSessionClient = Pick<Stripe, "checkout">;
type BookingRow = {
  id: string; status: "pending" | "confirmed" | "completed" | "cancelled"; packageLabel: string;
  tripSlug: string;
  participantEmail: string; totalUsd: number; initialPaymentUsd: number | null; offerVersion: number | null;
  offerTermsVersion: string | null; checkoutRateId: string | null; checkoutRateUsdPen: string | null;
  checkoutAmountPenCents: number | null; reservationExpiresAt: Date | null; acceptedBookingId: string | null;
};

function stripeClient(): StripeSessionClient | null {
  const key = process.env.STRIPE_SECRET_KEY;
  const origin = process.env.STRIPE_CHECKOUT_ORIGIN;
  if (!isCheckoutSandboxEnabled() || !/^sk_test_[A-Za-z0-9_]+$/.test(key ?? "")
      || !["http://localhost:3001", "http://127.0.0.1:3001"].includes(origin ?? "")) return null;
  return new Stripe(key!, { apiVersion: "2026-09-30.endive", timeout: 10000, maxNetworkRetries: 1 });
}

function canonicalSession(session: Stripe.Checkout.Session, bookingId: string, attemptId: string, amount: number) {
  return session.livemode === false
    && session.mode === "payment"
    && session.metadata?.bookingId === bookingId
    && session.metadata?.attemptId === attemptId
    && session.amount_total === amount
    && session.currency === "pen"
    && session.status === "open"
    && typeof session.url === "string";
}

export async function createBookingCheckoutSession(
  bookingId: string,
  userId: string,
  input: CreateCheckoutSessionInput,
): Promise<CreateSessionResult> {
  const stripe = stripeClient();
  if (!stripe) return "checkout_unavailable";
  const db = getDb();
  const [booking] = await db.select({
    id: bookings.id, status: bookings.status, packageLabel: bookings.packageLabel,
    tripSlug: trips.slug,
    participantEmail: bookings.participantEmail, totalUsd: bookings.totalUsd, initialPaymentUsd: bookings.initialPaymentUsd,
    offerVersion: bookings.offerVersion, offerTermsVersion: bookings.offerTermsVersion,
    checkoutRateId: bookings.checkoutRateId, checkoutRateUsdPen: bookings.checkoutRateUsdPen,
    checkoutAmountPenCents: bookings.checkoutAmountPenCents, reservationExpiresAt: bookings.reservationExpiresAt,
    acceptedBookingId: bookingContractAcceptances.bookingId,
  }).from(bookings).innerJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(bookingContractAcceptances, eq(bookingContractAcceptances.bookingId, bookings.id))
    .where(and(eq(bookings.id, bookingId), eq(bookings.runnerUserId, userId), isNotNull(bookings.offerVersionId)))
    .limit(1) as [BookingRow?];
  if (!booking || booking.status === "cancelled") return "booking_not_found";
  if (!booking.acceptedBookingId) return "contract_not_accepted";
  if (input.kind === "initial" && (!booking.reservationExpiresAt || booking.reservationExpiresAt.getTime() <= Date.now())) return "reservation_expired";
  if (input.kind === "balance") {
    const [initial] = await db.select({ status: bookingStripeSettlements.status })
      .from(bookingStripeSettlements).innerJoin(bookingCheckoutAttempts, eq(bookingCheckoutAttempts.id, bookingStripeSettlements.attemptId))
      .where(and(eq(bookingStripeSettlements.bookingId, bookingId), eq(bookingCheckoutAttempts.kind, "initial"))).limit(1);
    if (booking.status !== "confirmed" || initial?.status !== "applied") return "balance_not_due";
    const [paidBalance] = await db.select({ attemptId: bookingStripeSettlements.attemptId }).from(bookingStripeSettlements)
      .innerJoin(bookingCheckoutAttempts, eq(bookingCheckoutAttempts.id, bookingStripeSettlements.attemptId))
      .where(and(eq(bookingStripeSettlements.bookingId, bookingId), eq(bookingCheckoutAttempts.kind, "balance"))).limit(1);
    if (paidBalance) return "balance_not_due";
  }
  if (!booking.initialPaymentUsd || !booking.offerVersion || !booking.offerTermsVersion
      || !booking.checkoutRateId || !booking.checkoutRateUsdPen || !booking.checkoutAmountPenCents) {
    return "booking_not_found";
  }

  const amountUsd = input.kind === "initial" ? booking.initialPaymentUsd : booking.totalUsd - booking.initialPaymentUsd;
  const rateE4 = parseUsdPenRate(booking.checkoutRateUsdPen);
  if (amountUsd <= 0 || rateE4 === null) return "booking_not_found";
  const amountPenCents = input.kind === "initial" ? booking.checkoutAmountPenCents : usdToPenCents(amountUsd, rateE4);
  const expectedHash = checkoutQuoteHash({
    bookingId: booking.id, kind: input.kind, offerVersion: booking.offerVersion,
    termsVersion: booking.offerTermsVersion, amountUsd, amountPenCents,
    rateId: booking.checkoutRateId, rateUsdPen: booking.checkoutRateUsdPen,
  });
  if (input.quoteHash !== expectedHash) return "quote_changed";

  const [priorRequest] = await db.select().from(bookingCheckoutAttempts)
    .where(and(eq(bookingCheckoutAttempts.bookingId, bookingId), eq(bookingCheckoutAttempts.requestId, input.requestId))).limit(1);
  if (priorRequest && (priorRequest.kind !== input.kind || priorRequest.quoteHash !== expectedHash)) return "attempt_conflict";

  let attempt = priorRequest;
  if (!attempt) {
    const [active] = await db.select().from(bookingCheckoutAttempts)
      .where(and(eq(bookingCheckoutAttempts.bookingId, bookingId), eq(bookingCheckoutAttempts.kind, input.kind),
        sql`${bookingCheckoutAttempts.status} IN ('pending', 'created')`)).limit(1);
    if (active && active.quoteHash !== expectedHash) return "attempt_conflict";
    attempt = active;
  }
  if (!attempt) {
    const sessionExpiresAt = new Date(Date.now() + 45 * 60 * 1000);
    if (input.kind === "initial") {
      const held = await db.execute<{ booking_id: string }>(sql`
      WITH extended_booking AS (
        UPDATE ${bookings} SET reservation_expires_at = ${sessionExpiresAt}, updated_at = now()
        WHERE id = ${bookingId}::uuid AND runner_user_id = ${userId} AND status = 'pending'
          AND reservation_expires_at > now()
        RETURNING id
      ), extended_allocation AS (
        UPDATE ${offerCapacityAllocations} AS allocation SET expires_at = ${sessionExpiresAt}, updated_at = now()
        FROM extended_booking WHERE allocation.booking_id = extended_booking.id AND allocation.status = 'held'
        RETURNING allocation.booking_id
      ) SELECT booking_id FROM extended_allocation
      `);
      if (!held.rows[0]) return "reservation_expired";
    }
    const [created] = await db.insert(bookingCheckoutAttempts).values({
      bookingId, requestId: input.requestId, kind: input.kind, quoteHash: expectedHash,
      amountUsd, amountPenCents, idempotencyKey: `cv-checkout-${bookingId}-${input.kind}-${input.requestId}`,
      expiresAt: sessionExpiresAt,
    }).onConflictDoNothing().returning();
    attempt = created;
    if (!attempt) {
      const [raced] = await db.select().from(bookingCheckoutAttempts)
        .where(and(eq(bookingCheckoutAttempts.bookingId, bookingId), eq(bookingCheckoutAttempts.kind, input.kind),
          sql`${bookingCheckoutAttempts.status} IN ('pending', 'created')`)).limit(1);
      if (!raced || raced.quoteHash !== expectedHash) return "attempt_conflict";
      attempt = raced;
    }
  }
  if (attempt.status === "expired" || attempt.status === "failed" || attempt.status === "completed") return "attempt_expired";

  if (attempt.stripeSessionId) {
    const session = await stripe.checkout.sessions.retrieve(attempt.stripeSessionId);
    if (!canonicalSession(session, bookingId, attempt.id, amountPenCents)) return "attempt_expired";
    return { state: "reused", attemptId: attempt.id, checkoutUrl: session.url! };
  }
  if (!attempt.expiresAt || attempt.expiresAt.getTime() <= Date.now()) return "attempt_expired";

  const checkoutOrigin = process.env.STRIPE_CHECKOUT_ORIGIN!;
  const checkoutPath = `/viajes/${encodeURIComponent(booking.tripSlug)}/checkout?booking_id=${encodeURIComponent(bookingId)}&attempt_id=${encodeURIComponent(attempt.id)}`;
  const successUrl = new URL(`${checkoutPath}&return=success`, checkoutOrigin).toString();
  const cancelUrl = new URL(`${checkoutPath}&cancelled=1`, checkoutOrigin).toString();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    allowed_payment_method_types: ["card"],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "pen",
        unit_amount: amountPenCents,
        product_data: { name: booking.packageLabel, description: input.kind === "initial" ? "Pago inicial de reserva" : "Saldo de reserva" },
      },
    }],
    customer_email: booking.participantEmail,
    client_reference_id: bookingId,
    metadata: { bookingId, attemptId: attempt.id, paymentKind: input.kind },
    payment_intent_data: { metadata: { bookingId, attemptId: attempt.id, paymentKind: input.kind } },
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor((attempt.expiresAt.getTime()) / 1000),
  }, { idempotencyKey: attempt.idempotencyKey });
  if (!canonicalSession(session, bookingId, attempt.id, amountPenCents)) return "attempt_expired";
  await db.update(bookingCheckoutAttempts).set({
    status: "created", stripeSessionId: session.id, checkoutUrl: session.url,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null, updatedAt: sql`now()`,
  }).where(eq(bookingCheckoutAttempts.id, attempt.id));
  return { state: "created", attemptId: attempt.id, checkoutUrl: session.url! };
}
