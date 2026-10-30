import "server-only";
import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingCheckoutAttempts, bookingStripeEventReceipts } from "@/lib/db-schema";

export type BookingWebhookResult = "processed" | "duplicate" | "ignored" | "not_applicable";
const SESSION_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);

function resourceId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}
function metadataValue(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !("metadata" in value)) return null;
  const metadata = value.metadata as Record<string, unknown>;
  return metadata && typeof metadata === "object" && key in metadata && typeof metadata[key] === "string"
    ? metadata[key] as string : null;
}
function isSession(value: unknown): value is Stripe.Checkout.Session {
  return Boolean(value && typeof value === "object" && "id" in value && (value as { object?: string }).object === "checkout.session");
}

async function checkoutSessionForEvent(event: Stripe.Event, stripe: Stripe): Promise<Stripe.Checkout.Session | null> {
  if (SESSION_EVENTS.has(event.type)) {
    const id = resourceId(event.data.object);
    if (!id) return null;
    return stripe.checkout.sessions.retrieve(id);
  }
  if (event.type === "payment_intent.succeeded") {
    const id = resourceId(event.data.object);
    if (!id) return null;
    const intent = await stripe.paymentIntents.retrieve(id);
    if (intent.livemode !== false || intent.status !== "succeeded"
        || !metadataValue(intent, "bookingId") || !metadataValue(intent, "attemptId")) return null;
    const sessions = await stripe.checkout.sessions.list({ payment_intent: id, limit: 10 });
    return sessions.data.find(session =>
      session.livemode === false
      && resourceId(session.payment_intent) === id
      && metadataValue(session, "bookingId") === metadataValue(intent, "bookingId")
      && metadataValue(session, "attemptId") === metadataValue(intent, "attemptId"),
    ) ?? null;
  }
  return null;
}

async function hasReceipt(eventId: string): Promise<boolean> {
  const [receipt] = await getDb().select({ eventId: bookingStripeEventReceipts.eventId })
    .from(bookingStripeEventReceipts).where(eq(bookingStripeEventReceipts.eventId, eventId)).limit(1);
  return Boolean(receipt);
}
async function recordIgnored(event: Stripe.Event, outcome: string, attemptId: string | null, sessionId: string | null) {
  await getDb().insert(bookingStripeEventReceipts).values({
    eventId: event.id, eventType: event.type, outcome, attemptId, stripeSessionId: sessionId,
  }).onConflictDoNothing();
}
async function findAttempt(attemptId: string, bookingId: string) {
  const [attempt] = await getDb().select().from(bookingCheckoutAttempts)
    .where(and(eq(bookingCheckoutAttempts.id, attemptId), eq(bookingCheckoutAttempts.bookingId, bookingId))).limit(1);
  return attempt ?? null;
}

async function expireAttempt(event: Stripe.Event, attempt: NonNullable<Awaited<ReturnType<typeof findAttempt>>>, session: Stripe.Checkout.Session) {
  const outcome = event.type === "checkout.session.expired" ? "expired" : "async_payment_failed";
  const result = await getDb().execute<{ event_id: string }>(sql`
    WITH local_attempt AS (
      SELECT a.id, a.booking_id, a.stripe_session_id
      FROM ${bookingCheckoutAttempts} a
      WHERE a.id = ${attempt.id}::uuid AND a.booking_id = ${attempt.bookingId}::uuid
      FOR UPDATE
    ), receipt AS (
      INSERT INTO ${bookingStripeEventReceipts}
        (${sql.raw('"event_id", "event_type", "attempt_id", "stripe_session_id", "outcome"')})
      SELECT ${event.id}, ${event.type}, id, ${session.id}, ${outcome} FROM local_attempt
      ON CONFLICT ("event_id") DO NOTHING
      RETURNING event_id
    ), updated_attempt AS (
      UPDATE ${bookingCheckoutAttempts} a SET status = ${outcome === "expired" ? "expired" : "failed"},
        stripe_session_id = COALESCE(a.stripe_session_id, ${session.id}),
        updated_at = now()
      FROM local_attempt l, receipt r WHERE a.id = l.id RETURNING a.booking_id
    ), released AS (
      UPDATE offer_capacity_allocations allocation SET status = 'released'::offer_capacity_allocation_status,
        released_at = now(), updated_at = now()
      FROM updated_attempt u
      WHERE allocation.booking_id = u.booking_id AND allocation.status = 'held'
      RETURNING allocation.offer_version_id, allocation.booking_id
    ), decremented AS (
      UPDATE offer_capacity_counters counter SET allocated_count = greatest(0, counter.allocated_count - 1), updated_at = now()
      FROM released r WHERE counter.offer_version_id = r.offer_version_id RETURNING counter.offer_version_id
    ), cancelled AS (
      UPDATE bookings b SET status = 'cancelled', updated_at = now()
      FROM released r WHERE b.id = r.booking_id AND b.status = 'pending' RETURNING b.id
    )
    SELECT event_id FROM receipt
  `);
  return result.rows.length ? "processed" as const : "duplicate" as const;
}

async function settlePaidEvent(
  event: Stripe.Event, attempt: NonNullable<Awaited<ReturnType<typeof findAttempt>>>,
  session: Stripe.Checkout.Session, paymentIntentId: string,
) {
  const amount = Number.isSafeInteger(session.amount_total) && (session.amount_total ?? -1) >= 0 ? session.amount_total! : 0;
  const currency = typeof session.currency === "string" ? session.currency : "unk";
  const paidAt = new Date(event.created * 1000);
  const outcome = await getDb().execute<{ event_id: string; settlement_status: "applied" | "needs_review" | null }>(sql`
    WITH local_attempt AS (
      SELECT a.id, a.booking_id, a.kind, a.amount_usd, a.amount_pen_cents, a.stripe_session_id,
        b.status AS booking_status, b.reservation_expires_at
      FROM ${bookingCheckoutAttempts} a
      JOIN bookings b ON b.id = a.booking_id
      WHERE a.id = ${attempt.id}::uuid AND a.booking_id = ${attempt.bookingId}::uuid
      FOR UPDATE OF a, b
    ), receipt AS (
      INSERT INTO ${bookingStripeEventReceipts}
        (${sql.raw('"event_id", "event_type", "attempt_id", "stripe_session_id", "outcome"')})
      SELECT ${event.id}, ${event.type}, id, ${session.id}, 'settlement_candidate' FROM local_attempt
      ON CONFLICT ("event_id") DO NOTHING
      RETURNING event_id
    ), settlement AS (
      INSERT INTO booking_stripe_settlements
        (${sql.raw('"booking_id", "attempt_id", "stripe_session_id", "payment_intent_id", "expected_amount_pen_cents", "received_amount_pen_cents", "amount_usd", "currency", "status", "paid_at"')})
      SELECT l.booking_id, l.id, ${session.id}, ${paymentIntentId}, l.amount_pen_cents, ${amount}, l.amount_usd,
        ${currency}, CASE WHEN ${currency} = 'pen' AND ${amount} = l.amount_pen_cents
          AND ((l.kind = 'initial' AND l.booking_status = 'pending' AND l.reservation_expires_at > now())
            OR (l.kind = 'balance' AND l.booking_status = 'confirmed'))
          THEN 'applied'::booking_stripe_settlement_status ELSE 'needs_review'::booking_stripe_settlement_status END,
        ${paidAt}
      FROM local_attempt l JOIN receipt r ON true
      ON CONFLICT ("attempt_id") DO NOTHING
      RETURNING booking_id, attempt_id, stripe_session_id, status
    ), updated_attempt AS (
      UPDATE ${bookingCheckoutAttempts} a SET status = 'completed',
        stripe_session_id = COALESCE(a.stripe_session_id, s.stripe_session_id), updated_at = now()
      FROM settlement s WHERE a.id = s.attempt_id RETURNING a.id, s.booking_id, s.status
    ), confirmed_booking AS (
      UPDATE bookings b SET status = 'confirmed', updated_at = now()
      FROM updated_attempt u WHERE b.id = u.booking_id AND u.status = 'applied' AND b.status = 'pending'
      RETURNING b.id
    ), confirmed_allocation AS (
      UPDATE offer_capacity_allocations a SET status = 'confirmed', updated_at = now()
      FROM confirmed_booking b WHERE a.booking_id = b.id AND a.status = 'held'
      RETURNING a.booking_id
    )
    SELECT r.event_id, s.status::text AS settlement_status
    FROM receipt r LEFT JOIN settlement s ON true
  `);
  if (outcome.rows[0]?.settlement_status) return "processed";
  return "duplicate";
}

export async function handleBookingStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<BookingWebhookResult> {
  if (!SESSION_EVENTS.has(event.type) && event.type !== "payment_intent.succeeded") return "not_applicable";
  // Stripe CLI fixtures and unrelated account events have no commercial metadata. Leave those
  // to the existing demo handler without querying or writing the bookings database.
  if (!metadataValue(event.data.object, "bookingId") || !metadataValue(event.data.object, "attemptId")) return "not_applicable";
  if (await hasReceipt(event.id)) return "duplicate";
  const session = await checkoutSessionForEvent(event, stripe);
  if (!session || !isSession(session) || session.livemode !== false || session.mode !== "payment") return "not_applicable";

  const bookingId = metadataValue(session, "bookingId");
  const attemptId = metadataValue(session, "attemptId");
  if (!bookingId || !attemptId || session.client_reference_id !== bookingId) {
    await recordIgnored(event, "no_local_booking_metadata", null, session.id);
    return "ignored";
  }
  if (event.type === "checkout.session.expired" && session.status !== "expired") return "not_applicable";
  if (event.type !== "checkout.session.expired" && session.status !== "complete") return "not_applicable";
  const attempt = await findAttempt(attemptId, bookingId);
  if (!attempt || (attempt.stripeSessionId && attempt.stripeSessionId !== session.id)
      || attempt.kind !== metadataValue(session, "paymentKind")) {
    await recordIgnored(event, "no_matching_local_attempt", attemptId, session.id);
    return "ignored";
  }
  if (event.type === "checkout.session.expired"
      || (event.type === "checkout.session.async_payment_failed" && session.payment_status !== "paid")) {
    return expireAttempt(event, attempt, session);
  }
  if (session.payment_status !== "paid") {
    await recordIgnored(event, "payment_not_confirmed", attemptId, session.id);
    return "ignored";
  }
  const paymentIntentId = resourceId(session.payment_intent);
  if (!paymentIntentId) throw new Error("paid Checkout Session has no PaymentIntent");
  return settlePaidEvent(event, attempt, session, paymentIntentId);
}
