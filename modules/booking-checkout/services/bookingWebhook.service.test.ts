// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { handleBookingStripeEvent, StripeModeMismatchError } from "./bookingWebhook.service";

const bookingId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const created = 1793310000;
function event(type: string, object: Record<string, unknown>, id = "evt_test_1", livemode = false) {
  return { id, type, created, livemode, data: { object } } as unknown as Stripe.Event;
}
function dbMock({ receipts = [], attempt = null, rows = [] }: {
  receipts?: unknown[]; attempt?: unknown; rows?: unknown[];
} = {}) {
  let selectCount = 0;
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit: async () => (++selectCount === 1 ? receipts : attempt ? [attempt] : []) }) }),
  }));
  const execute = vi.fn().mockResolvedValue({ rows });
  const values = vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) }));
  const insert = vi.fn(() => ({ values }));
  vi.mocked(getDb).mockReturnValue({ select, execute, insert } as never);
  return { select, execute, insert, values };
}
// Renders the single statement sent to the database, to check what it compares.
function statement(execute: ReturnType<typeof vi.fn>) {
  expect(execute).toHaveBeenCalledTimes(1);
  return new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL);
}
const localAttempt = {
  id: attemptId, bookingId, stripeSessionId: "cs_test_1", kind: "initial", amountUsd: 250, amountPenCents: 93750, stripeMode: "test",
};
const baseSession = {
  id: "cs_test_1", object: "checkout.session", livemode: false, mode: "payment", status: "complete",
  payment_status: "paid", amount_total: 93750, currency: "pen", client_reference_id: bookingId,
  metadata: { bookingId, attemptId, paymentKind: "initial" }, payment_intent: "pi_test_1", url: null,
};
type SessionFixture = Omit<typeof baseSession, "livemode"> & { livemode: boolean };
const stripe = (session: SessionFixture = baseSession, intent: Record<string, unknown> | null = null) => ({
  checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session), list: vi.fn().mockResolvedValue({ data: [session] }) } },
  paymentIntents: { retrieve: vi.fn().mockResolvedValue(intent) },
}) as unknown as Stripe;
const sessionEvent = (type: string, id = "evt_test_1") => event(type, { id: "cs_test_1", metadata: baseSession.metadata }, id);
const applied = { event_id: "evt_test_1", settlement_status: "applied" };
const needsReview = { event_id: "evt_test_1", settlement_status: "needs_review" };

beforeEach(() => vi.mocked(getDb).mockReset());
afterEach(() => vi.useRealTimers());

describe("booking Stripe webhook processor", () => {
  it("leaves unrelated Stripe CLI fixtures outside the booking database", async () => {
    const db = dbMock();
    await expect(handleBookingStripeEvent(event("checkout.session.completed", { id: "cs_fixture" }), stripe(), "test"))
      .resolves.toEqual({ outcome: "ignored", attemptId: null, bookingId: null });
    expect(db.select).not.toHaveBeenCalled();
  });
  it("ignores event types outside bookings without querying the database", async () => {
    const db = dbMock();
    await expect(handleBookingStripeEvent(event("invoice.paid", { id: "in_test_1", metadata: baseSession.metadata }), stripe(), "test"))
      .resolves.toMatchObject({ outcome: "ignored" });
    expect(db.select).not.toHaveBeenCalled();
  });
  it("does not settle a completed but unpaid Checkout Session", async () => {
    const db = dbMock({ attempt: localAttempt });
    const provider = stripe({ ...baseSession, payment_status: "unpaid" });
    const result = await handleBookingStripeEvent(sessionEvent("checkout.session.completed"), provider, "test");
    expect(result).toEqual({ outcome: "ignored", attemptId, bookingId });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
  it("persists one canonical paid settlement through the atomic database statement", async () => {
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.completed"), stripe(), "test"))
      .resolves.toEqual({ outcome: "applied", attemptId, bookingId });
    const query = statement(db.execute);
    // The settlement records its Stripe mode explicitly: test for test and demo.
    expect(query.sql).toMatch(/"paid_at", "stripe_mode"\)[\s\S]*\$\d+::stripe_mode/);
    expect(query.params).toContain("test");
  });
  it("returns duplicate before retrieving or settling a session", async () => {
    const db = dbMock({ receipts: [{ eventId: "evt_test_1" }] });
    const provider = stripe();
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.completed"), provider, "test")).resolves.toMatchObject({ outcome: "duplicate" });
    expect((provider.checkout.sessions.retrieve as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("reports duplicate when the settlement already exists for the attempt", async () => {
    dbMock({ attempt: localAttempt, rows: [{ event_id: "evt_test_1", settlement_status: null }] });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.completed"), stripe(), "test")).resolves.toMatchObject({ outcome: "duplicate" });
  });
  it("records an unknown attempt as ignored without referencing it", async () => {
    const db = dbMock({ attempt: null });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.completed"), stripe(), "test")).resolves.toMatchObject({ outcome: "ignored" });
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no_matching_local_attempt", attemptId: null }));
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("expires the attempt and releases the held capacity on checkout.session.expired", async () => {
    const db = dbMock({ attempt: localAttempt, rows: [{ event_id: "evt_test_1" }] });
    const provider = stripe({ ...baseSession, status: "expired", payment_status: "unpaid", payment_intent: null as unknown as string });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.expired"), provider, "test"))
      .resolves.toEqual({ outcome: "expired", attemptId, bookingId });
    const query = statement(db.execute);
    expect(query.params).toEqual(expect.arrayContaining(["evt_test_1", "checkout.session.expired", "expired"]));
    expect(query.sql).toContain("UPDATE offer_capacity_allocations");
    expect(query.sql).toContain("UPDATE bookings b SET status = 'cancelled'");
    // The seat is released only for a booking still pending, locked before its seat (as everywhere).
    expect(query.sql).toMatch(/pending_booking AS MATERIALIZED \(\s*SELECT b\.id, b\.is_simulated FROM bookings b[\s\S]*WHERE b\.status = 'pending'\s*FOR UPDATE OF b/);
    expect(query.sql).toMatch(/released AS \([\s\S]*FROM pending_booking p\s*WHERE allocation\.booking_id = p\.id/);
    expect(query.sql.indexOf("pending_booking AS")).toBeLessThan(query.sql.indexOf("released AS"));
    // A simulated booking has no seat: nothing is released, it is only cancelled.
    expect(query.sql).toMatch(/allocation\.status = 'held' AND NOT p\.is_simulated/);
    expect(query.sql).toMatch(/cancelled AS \([\s\S]*FROM pending_booking p[\s\S]*\(p\.is_simulated OR EXISTS \(SELECT 1 FROM released r WHERE r\.booking_id = p\.id\)\)/);
  });
  it("ignores an expired event whose session is not expired at Stripe", async () => {
    const db = dbMock({ attempt: localAttempt });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.expired"), stripe(), "test")).resolves.toMatchObject({ outcome: "ignored" });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("fails the attempt on checkout.session.async_payment_failed", async () => {
    const db = dbMock({ attempt: localAttempt, rows: [{ event_id: "evt_test_1" }] });
    const provider = stripe({ ...baseSession, payment_status: "unpaid" });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.async_payment_failed"), provider, "test"))
      .resolves.toEqual({ outcome: "failed", attemptId, bookingId });
    expect(statement(db.execute).params).toEqual(expect.arrayContaining(["async_payment_failed", "failed"]));
  });
  it("reports a repeated expiration as duplicate", async () => {
    dbMock({ attempt: localAttempt, rows: [] });
    const provider = stripe({ ...baseSession, status: "expired", payment_status: "unpaid" });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.expired"), provider, "test")).resolves.toMatchObject({ outcome: "duplicate" });
  });
  it("settles a paid session on checkout.session.async_payment_succeeded", async () => {
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.async_payment_succeeded"), stripe(), "test"))
      .resolves.toEqual({ outcome: "applied", attemptId, bookingId });
    expect(statement(db.execute).sql).toContain("INSERT INTO booking_stripe_settlements");
  });
  it("settles through the Checkout Session of a payment_intent.succeeded event", async () => {
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    const intent = { id: "pi_test_1", object: "payment_intent", livemode: false, status: "succeeded", metadata: baseSession.metadata };
    const provider = stripe(baseSession, intent);
    const result = await handleBookingStripeEvent(event("payment_intent.succeeded", { id: "pi_test_1", metadata: baseSession.metadata }), provider, "test");
    expect(result).toEqual({ outcome: "applied", attemptId, bookingId });
    expect(provider.checkout.sessions.list).toHaveBeenCalledWith({ payment_intent: "pi_test_1", limit: 10 });
    expect(statement(db.execute).params).toContain("pi_test_1");
  });
  it("ignores a payment_intent.succeeded whose PaymentIntent has not succeeded", async () => {
    const db = dbMock({ attempt: localAttempt });
    const provider = stripe(baseSession, { id: "pi_test_1", livemode: false, status: "processing", metadata: baseSession.metadata });
    await expect(handleBookingStripeEvent(event("payment_intent.succeeded", { id: "pi_test_1", metadata: baseSession.metadata }), provider, "test"))
      .resolves.toMatchObject({ outcome: "ignored" });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it.each([
    ["amount", { amount_total: 90000 }, 90000],
    ["currency", { currency: "usd" }, "usd"],
  ])("sends a %s mismatch to review with the received value", async (_label, override, received) => {
    const db = dbMock({ attempt: localAttempt, rows: [needsReview] });
    const result = await handleBookingStripeEvent(sessionEvent("checkout.session.completed"), stripe({ ...baseSession, ...override }), "test");
    expect(result).toEqual({ outcome: "needs_review", attemptId, bookingId });
    const query = statement(db.execute);
    expect(query.params).toContain(received);
    expect(query.sql).toMatch(/CASE WHEN \$\d+ = 'pen' AND \$\d+ = l\.amount_pen_cents/);
    expect(query.sql).toContain("ELSE 'needs_review'::booking_stripe_settlement_status");
  });
  it("judges the reservation deadline at Stripe's payment time, so a late delivery stays applied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date((created + 3 * 24 * 3600) * 1000));
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.completed"), stripe(), "test"))
      .resolves.toMatchObject({ outcome: "applied" });
    const query = statement(db.execute);
    const comparison = query.sql.match(/l\.reservation_expires_at > \$(\d+)::timestamptz/);
    expect(comparison).not.toBeNull();
    expect(query.params[Number(comparison![1]) - 1]).toEqual(new Date(created * 1000));
    expect(query.sql).not.toMatch(/reservation_expires_at > now\(\)/);
  });

  it.each([
    ["a live event on a test deployment", "test" as const, true, false],
    ["a test event on a live deployment", "live" as const, false, false],
    ["a live session on a test deployment", "test" as const, false, true],
  ])("stops on %s without touching data", async (_label, mode, eventLive, sessionLive) => {
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    const provider = stripe({ ...baseSession, livemode: sessionLive });
    const live = event("checkout.session.completed", { id: "cs_test_1", metadata: baseSession.metadata }, "evt_test_1", eventLive);
    await expect(handleBookingStripeEvent(live, provider, mode)).rejects.toBeInstanceOf(StripeModeMismatchError);
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it.each([
    ["a live event", true, false],
    ["a live session", false, true],
  ])("stops on %s in demo mode without touching data", async (_label, eventLive, sessionLive) => {
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    const provider = stripe({ ...baseSession, livemode: sessionLive });
    const incoming = event("checkout.session.completed", { id: "cs_test_1", metadata: baseSession.metadata }, "evt_test_1", eventLive);
    await expect(handleBookingStripeEvent(incoming, provider, "demo")).rejects.toBeInstanceOf(StripeModeMismatchError);
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("stops on a live PaymentIntent in demo mode", async () => {
    const db = dbMock({ attempt: localAttempt });
    const provider = stripe(baseSession, { id: "pi_test_1", livemode: true, status: "succeeded", metadata: baseSession.metadata });
    const incoming = event("payment_intent.succeeded", { id: "pi_test_1", metadata: baseSession.metadata }, "evt_test_1", false);
    await expect(handleBookingStripeEvent(incoming, provider, "demo")).rejects.toBeInstanceOf(StripeModeMismatchError);
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("settles test events in demo mode with stripe_mode test", async () => {
    const db = dbMock({ attempt: localAttempt, rows: [applied] });
    await expect(handleBookingStripeEvent(sessionEvent("checkout.session.completed"), stripe(), "demo"))
      .resolves.toMatchObject({ outcome: "applied" });
    expect(statement(db.execute).params).toContain("test");
  });
  it.each([
    ["a live attempt reached by a test event", "test" as const, "live", false],
    ["a test attempt reached by a live event", "live" as const, "test", true],
    ["a live attempt reached by a test event in demo mode", "demo" as const, "live", false],
  ])("stops on %s without touching data", async (_label, mode, stripeMode, livemode) => {
    for (const type of ["checkout.session.completed", "checkout.session.expired"]) {
      const db = dbMock({ attempt: { ...localAttempt, stripeMode }, rows: [applied] });
      const status = type === "checkout.session.expired" ? { status: "expired", payment_status: "unpaid" } : {};
      const provider = stripe({ ...baseSession, ...status, livemode });
      const incoming = event(type, { id: "cs_test_1", metadata: baseSession.metadata }, "evt_mode_1", livemode);
      await expect(handleBookingStripeEvent(incoming, provider, mode)).rejects.toBeInstanceOf(StripeModeMismatchError);
      expect(db.execute).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    }
  });
  it("stops on a test PaymentIntent in live mode", async () => {
    const db = dbMock({ attempt: localAttempt });
    const provider = stripe({ ...baseSession, livemode: true }, { id: "pi_live_1", livemode: false, status: "succeeded", metadata: baseSession.metadata });
    const live = event("payment_intent.succeeded", { id: "pi_live_1", metadata: baseSession.metadata }, "evt_live_1", true);
    await expect(handleBookingStripeEvent(live, provider, "live")).rejects.toBeInstanceOf(StripeModeMismatchError);
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("settles live events in live mode with stripe_mode live", async () => {
    const db = dbMock({ attempt: { ...localAttempt, stripeMode: "live" }, rows: [applied] });
    const provider = stripe({ ...baseSession, livemode: true });
    const live = event("checkout.session.completed", { id: "cs_test_1", metadata: baseSession.metadata }, "evt_live_1", true);
    await expect(handleBookingStripeEvent(live, provider, "live")).resolves.toMatchObject({ outcome: "applied" });
    const query = statement(db.execute);
    expect(query.params).toContain("live");
    expect(query.params).not.toContain("test");
  });

  describe("refunds and disputes", () => {
    const refund = (paymentIntent: unknown = "pi_test_1") =>
      event("charge.refunded", { id: "ch_test_1", object: "charge", livemode: false, payment_intent: paymentIntent }, "evt_refund_1");
    const dispute = event("charge.dispute.created", { id: "dp_test_1", object: "dispute", livemode: false, payment_intent: { id: "pi_test_1" } }, "evt_dispute_1");
    const flagged = [{ attempt_id: attemptId, booking_id: bookingId, recorded: 1 }];

    it.each([
      ["charge.refunded", refund(), "refund_review"],
      ["charge.dispute.created", dispute, "dispute_review"],
    ])("flags the settlement of %s for review without reverting the booking", async (_type, incoming, outcome) => {
      const db = dbMock({ rows: flagged });
      const provider = stripe();
      await expect(handleBookingStripeEvent(incoming, provider, "test")).resolves.toEqual({ outcome: "needs_review", attemptId, bookingId });
      const query = statement(db.execute);
      expect(query.params).toEqual(expect.arrayContaining(["pi_test_1", outcome]));
      expect(query.sql).toContain("UPDATE booking_stripe_settlements s SET status = 'needs_review'");
      expect(query.sql).not.toMatch(/UPDATE (bookings|offer_capacity|booking_checkout_attempts)/);
      expect(provider.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });
    it("ignores a refund without a local settlement", async () => {
      dbMock({ rows: [] });
      await expect(handleBookingStripeEvent(refund(), stripe(), "test")).resolves.toEqual({ outcome: "ignored", attemptId: null, bookingId: null });
    });
    it("ignores a refund without a PaymentIntent without querying the database", async () => {
      const db = dbMock();
      await expect(handleBookingStripeEvent(refund(null), stripe(), "test")).resolves.toMatchObject({ outcome: "ignored" });
      expect(db.select).not.toHaveBeenCalled();
      expect(db.execute).not.toHaveBeenCalled();
    });
    it("returns duplicate for a refund already recorded", async () => {
      const db = dbMock({ receipts: [{ eventId: "evt_refund_1" }] });
      await expect(handleBookingStripeEvent(refund(), stripe(), "test")).resolves.toMatchObject({ outcome: "duplicate" });
      expect(db.execute).not.toHaveBeenCalled();
    });
    it("returns duplicate when a concurrent delivery recorded the refund first", async () => {
      dbMock({ rows: [{ attempt_id: attemptId, booking_id: bookingId, recorded: 0 }] });
      await expect(handleBookingStripeEvent(refund(), stripe(), "test")).resolves.toMatchObject({ outcome: "duplicate", attemptId });
    });
  });
});
