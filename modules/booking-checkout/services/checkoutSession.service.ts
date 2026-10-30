import "server-only";
import Stripe from "stripe";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingCheckoutAttempts, bookingContractAcceptances, bookingStripeSettlements, bookings, offerCapacityAllocations, trips } from "@/lib/db-schema";
import { getEnv, getStripeCheckoutConfig, stripeLivemodeFor, type StripeMode } from "@/lib/env";
import { parseUsdPenRate, usdToPenCents } from "@/lib/currency";
import { checkoutQuoteHash } from "./quote.service";
import type { CreateCheckoutSessionInput } from "../schemas/checkout.schema";
import { retireCheckoutAttempt } from "./checkoutAttempts.service";
import { isSimulatedMode, SIMULATED_PAYMENT_LABEL, stripeModeColumn } from "../utils/simulatedCheckout";

export type CreateSessionResult =
  | { state: "created" | "reused"; attemptId: string; checkoutUrl: string }
  | "checkout_unavailable" | "booking_not_found" | "contract_not_accepted" | "reservation_expired"
  | "quote_changed" | "attempt_conflict" | "attempt_expired" | "balance_not_due" | "payment_processing"
  | "stripe_unavailable";

export async function getBookingCheckoutState(bookingId: string, attemptId: string, userId: string) {
  const [row] = await getDb().select({
    kind: bookingCheckoutAttempts.kind,
    status: bookingCheckoutAttempts.status, amountUsd: bookingCheckoutAttempts.amountUsd,
    amountPenCents: bookingCheckoutAttempts.amountPenCents, checkoutUrl: bookingCheckoutAttempts.checkoutUrl,
    settlementStatus: bookingStripeSettlements.status,
    totalUsd: bookings.totalUsd, initialPaymentUsd: bookings.initialPaymentUsd,
    offerVersion: bookings.offerVersion, termsVersion: bookings.offerTermsVersion,
    rateId: bookings.checkoutRateId, rateUsdPen: bookings.checkoutRateUsdPen,
    simulated: bookings.isSimulated,
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
    simulated: row.simulated,
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
type AttemptRow = typeof bookingCheckoutAttempts.$inferSelect;

const MINUTE_MS = 60 * 1000;
// Stripe accepts a Checkout Session `expires_at` from 30 minutes to 24 hours after creation.
const STRIPE_MIN_SESSION_MS = 30 * MINUTE_MS;
const STRIPE_MAX_SESSION_MS = 24 * 60 * MINUTE_MS;
// New sessions get two minutes over Stripe's minimum (latency and clock skew)...
const MIN_SESSION_MS = STRIPE_MIN_SESSION_MS + 2 * MINUTE_MS;
// ...so a failed creation can be retried with the same idempotency key and parameters for a
// while; once less than this remains, the attempt is retired and a fresh one is created.
const MIN_RETRY_MS = STRIPE_MIN_SESSION_MS + MINUTE_MS;
// A pending reservation is extended only to fit one session, and never past this hold measured
// from the booking's creation: past it the runner gets `reservation_expired` and prepares again.
const MAX_RESERVATION_HOLD_MINUTES = 120;
const BALANCE_SESSION_MS = 60 * MINUTE_MS;

function stripeClient(): { stripe: StripeSessionClient; mode: StripeMode } | null {
  const config = getStripeCheckoutConfig();
  if (!config.enabled || !config.mode || !config.secretKey) return null;
  return {
    stripe: new Stripe(config.secretKey, { apiVersion: "2026-09-30.endive", timeout: 10000, maxNetworkRetries: 1 }),
    mode: config.mode,
  };
}

function ownsSession(session: Stripe.Checkout.Session, bookingId: string, attemptId: string, mode: StripeMode) {
  return session.livemode === stripeLivemodeFor(mode)
    && session.mode === "payment"
    && session.metadata?.bookingId === bookingId
    && session.metadata?.attemptId === attemptId;
}

function canonicalSession(session: Stripe.Checkout.Session, bookingId: string, attemptId: string, amount: number, mode: StripeMode) {
  return ownsSession(session, bookingId, attemptId, mode)
    && session.amount_total === amount
    && session.currency === "pen"
    && session.status === "open"
    && typeof session.url === "string";
}

type ActiveAttemptState =
  | { state: "open"; session: Stripe.Checkout.Session | null }
  | { state: "retired" }
  | "payment_processing" | "attempt_conflict" | "stripe_unavailable";

// Decides whether an active attempt can still be paid. A Session that Stripe already closed, or a
// creation that never finished before its deadline, is retired so it stops blocking a new attempt;
// a completed Session is left to the webhook. Nothing is written for a Session of another booking.
async function refreshActiveAttempt(
  attempt: AttemptRow, stripe: StripeSessionClient, mode: StripeMode, amountPenCents: number,
): Promise<ActiveAttemptState> {
  if (!attempt.stripeSessionId) {
    if (attempt.expiresAt && attempt.expiresAt.getTime() > Date.now()) return { state: "open", session: null };
    return await retireCheckoutAttempt(attempt, "failed", true) ? { state: "retired" } : "attempt_conflict";
  }
  let session: Stripe.Checkout.Session;
  try { session = await stripe.checkout.sessions.retrieve(attempt.stripeSessionId); }
  catch { return "stripe_unavailable"; }
  if (!ownsSession(session, attempt.bookingId, attempt.id, mode)) return "attempt_conflict";
  if (session.status === "open") {
    return canonicalSession(session, attempt.bookingId, attempt.id, amountPenCents, mode)
      ? { state: "open", session } : "attempt_conflict";
  }
  if (session.status === "expired") {
    return await retireCheckoutAttempt(attempt, "expired", true) ? { state: "retired" } : "attempt_conflict";
  }
  return "payment_processing";
}

// Session deadline for an initial payment: the reservation deadline, extended (atomically with the
// held seat) only when fewer than MIN_SESSION_MS remain, and capped by MAX_RESERVATION_HOLD_MINUTES.
// Only a pending booking that still holds its seat is extended; a simulated booking has no seat and
// is extended alone, with the same cap. Lock order as everywhere else: booking (this UPDATE), then
// seat. Every statement that releases a seat also locks and cancels its pending booking, so a
// release that commits first fails the status recheck of this UPDATE.
async function initialSessionExpiry(bookingId: string, userId: string): Promise<Date | null> {
  const minimum = new Date(Date.now() + MIN_SESSION_MS);
  const held = await getDb().execute<{ expires_at: Date | string }>(sql`
    WITH extended_booking AS (
      UPDATE ${bookings} SET reservation_expires_at = greatest(reservation_expires_at, ${minimum}::timestamptz), updated_at = now()
      WHERE id = ${bookingId}::uuid AND runner_user_id = ${userId} AND status = 'pending'
        AND reservation_expires_at > now()
        AND greatest(reservation_expires_at, ${minimum}::timestamptz)
          <= created_at + ${MAX_RESERVATION_HOLD_MINUTES} * interval '1 minute'
        AND (${bookings.isSimulated} OR EXISTS (
          SELECT 1 FROM ${offerCapacityAllocations} AS hold
          WHERE hold.booking_id = ${bookings}.id AND hold.status = 'held'
        ))
      RETURNING id, reservation_expires_at, is_simulated
    ), extended_allocation AS (
      UPDATE ${offerCapacityAllocations} AS allocation SET expires_at = extended_booking.reservation_expires_at, updated_at = now()
      FROM extended_booking WHERE allocation.booking_id = extended_booking.id AND allocation.status = 'held'
        AND NOT extended_booking.is_simulated
      RETURNING allocation.booking_id
    ) SELECT extended_booking.reservation_expires_at AS expires_at
    FROM extended_booking LEFT JOIN extended_allocation ON extended_allocation.booking_id = extended_booking.id
    WHERE extended_booking.is_simulated OR extended_allocation.booking_id IS NOT NULL
  `);
  const row = held.rows[0];
  if (!row) return null;
  const expiresAt = new Date(row.expires_at);
  return new Date(Math.min(expiresAt.getTime(), Date.now() + STRIPE_MAX_SESSION_MS - MINUTE_MS));
}

async function findActiveAttempt(bookingId: string, kind: "initial" | "balance") {
  const [active] = await getDb().select().from(bookingCheckoutAttempts)
    .where(and(eq(bookingCheckoutAttempts.bookingId, bookingId), eq(bookingCheckoutAttempts.kind, kind),
      sql`${bookingCheckoutAttempts.status} IN ('pending', 'created')`)).limit(1);
  return active;
}

export async function createBookingCheckoutSession(
  bookingId: string,
  userId: string,
  input: CreateCheckoutSessionInput,
): Promise<CreateSessionResult> {
  const client = stripeClient();
  if (!client) return "checkout_unavailable";
  const { stripe, mode } = client;
  const simulated = isSimulatedMode(mode);
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
    // Simulated and real bookings never mix: each is paid only in its own Stripe mode.
    .where(and(eq(bookings.id, bookingId), eq(bookings.runnerUserId, userId), isNotNull(bookings.offerVersionId),
      eq(bookings.isSimulated, simulated)))
    .limit(1) as [BookingRow?];
  if (!booking || booking.status === "cancelled") return "booking_not_found";
  if (!booking.acceptedBookingId) return "contract_not_accepted";
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

  let attempt: AttemptRow | undefined = priorRequest ?? await findActiveAttempt(bookingId, input.kind);
  let openSession: Stripe.Checkout.Session | null = null;
  if (attempt && (attempt.status === "pending" || attempt.status === "created")) {
    const state = await refreshActiveAttempt(attempt, stripe, mode, amountPenCents);
    if (typeof state === "string") return state;
    if (state.state === "retired") {
      // A request id names one attempt: once it is retired, a new click sends a new id.
      if (attempt === priorRequest) return "attempt_expired";
      attempt = undefined;
    } else {
      openSession = state.session;
    }
  }
  if (attempt && attempt.status !== "pending" && attempt.status !== "created") return "attempt_expired";
  if (attempt && attempt.quoteHash !== expectedHash) return "attempt_conflict";
  if (input.kind === "initial" && (!booking.reservationExpiresAt || booking.reservationExpiresAt.getTime() <= Date.now())) return "reservation_expired";
  if (openSession && attempt) return { state: "reused", attemptId: attempt.id, checkoutUrl: openSession.url! };

  if (!attempt) {
    const sessionExpiresAt = input.kind === "initial"
      ? await initialSessionExpiry(bookingId, userId)
      : new Date(Date.now() + BALANCE_SESSION_MS);
    if (!sessionExpiresAt) return "reservation_expired";
    const [created] = await db.insert(bookingCheckoutAttempts).values({
      bookingId, requestId: input.requestId, kind: input.kind, quoteHash: expectedHash,
      amountUsd, amountPenCents, idempotencyKey: `cv-checkout-${bookingId}-${input.kind}-${input.requestId}`,
      expiresAt: sessionExpiresAt, stripeMode: stripeModeColumn(mode),
    }).onConflictDoNothing().returning();
    attempt = created ?? await findActiveAttempt(bookingId, input.kind);
    if (!attempt || attempt.quoteHash !== expectedHash) return "attempt_conflict";
    // A concurrent request won the race and already has a Session: reuse it.
    if (attempt.stripeSessionId) {
      const state = await refreshActiveAttempt(attempt, stripe, mode, amountPenCents);
      if (typeof state === "string") return state;
      if (state.state !== "open" || !state.session) return "attempt_expired";
      return { state: "reused", attemptId: attempt.id, checkoutUrl: state.session.url! };
    }
  }
  if (!attempt.expiresAt) return "attempt_expired";
  const remainingMs = attempt.expiresAt.getTime() - Date.now();

  // The return URLs use the same origin that the POST Origin check accepts.
  const appOrigin = getEnv().APP_ORIGIN;
  const checkoutPath = `/viajes/${encodeURIComponent(booking.tripSlug)}/checkout?booking_id=${encodeURIComponent(bookingId)}&attempt_id=${encodeURIComponent(attempt.id)}`;
  const successUrl = new URL(`${checkoutPath}&return=success`, appOrigin).toString();
  const cancelUrl = new URL(`${checkoutPath}&cancelled=1`, appOrigin).toString();
  const paymentLabel = input.kind === "initial" ? "Pago inicial de reserva" : "Saldo de reserva";
  // TEST modes say so in the Checkout page and in Stripe's metadata; live keeps its exact parameters.
  const product = simulated
    ? { name: `${SIMULATED_PAYMENT_LABEL} · ${booking.packageLabel}`, description: `${SIMULATED_PAYMENT_LABEL} · ${paymentLabel}` }
    : { name: booking.packageLabel, description: paymentLabel };
  const metadata = {
    bookingId, attemptId: attempt.id, paymentKind: input.kind,
    ...(simulated && { environment: mode, simulated: "true" }),
  };
  let session: Stripe.Checkout.Session;
  try {
    // Same idempotency key and parameters as the first try (expires_at included), so a retry
    // after a lost response returns the Session Stripe already created instead of a second one.
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "pen",
          unit_amount: amountPenCents,
          product_data: product,
        },
      }],
      customer_email: booking.participantEmail,
      client_reference_id: bookingId,
      metadata,
      payment_intent_data: { metadata },
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
    }, { idempotencyKey: attempt.idempotencyKey });
  } catch {
    // Too close to Stripe's minimum to retry with the same parameters: retire it, keeping the
    // reservation, so the next click creates a fresh attempt with a valid deadline.
    if (remainingMs < MIN_RETRY_MS) await retireCheckoutAttempt(attempt, "failed", false);
    return "stripe_unavailable";
  }
  if (!canonicalSession(session, bookingId, attempt.id, amountPenCents, mode)) return "stripe_unavailable";
  // Compare-and-set: only a still-pending attempt takes the Session. If the webhook or a retirement
  // changed it meanwhile, the Session is not handed out; its id is logged for reconciliation.
  const [recorded] = await db.update(bookingCheckoutAttempts).set({
    status: "created", stripeSessionId: session.id, checkoutUrl: session.url,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null, updatedAt: sql`now()`,
  }).where(and(eq(bookingCheckoutAttempts.id, attempt.id), eq(bookingCheckoutAttempts.status, "pending")))
    .returning({ id: bookingCheckoutAttempts.id });
  if (!recorded) {
    console.warn("booking checkout: session not recorded", {
      bookingId, attemptId: attempt.id, stripeSessionId: session.id, alert: true,
    });
    return "attempt_conflict";
  }
  return { state: "created", attemptId: attempt.id, checkoutUrl: session.url! };
}
