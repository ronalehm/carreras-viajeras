// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { handleBookingStripeEvent } from "./bookingWebhook.service";

const bookingId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
function event(type: string, object: Record<string, unknown>, id = "evt_test_1") {
  return { id, type, created: 1793310000, livemode: false, data: { object } } as unknown as Stripe.Event;
}
function dbMock({ receipts = [], attempt = null, settlement = [] }: {
  receipts?: unknown[]; attempt?: unknown; settlement?: unknown[];
} = {}) {
  let selectCount = 0;
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit: async () => (++selectCount === 1 ? receipts : attempt ? [attempt] : []) }) }),
  }));
  const execute = vi.fn().mockResolvedValue({ rows: settlement });
  const insert = vi.fn(() => ({ values: () => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) }) }));
  vi.mocked(getDb).mockReturnValue({ select, execute, insert } as never);
  return { select, execute, insert };
}
const localAttempt = { id: attemptId, bookingId, stripeSessionId: "cs_test_1", kind: "initial", amountUsd: 250, amountPenCents: 93750 };
const baseSession = {
  id: "cs_test_1", object: "checkout.session", livemode: false, mode: "payment", status: "complete",
  payment_status: "paid", amount_total: 93750, currency: "pen", client_reference_id: bookingId,
  metadata: { bookingId, attemptId, paymentKind: "initial" }, payment_intent: "pi_test_1", url: null,
};
const stripe = (session = baseSession) => ({
  checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session), list: vi.fn() } },
  paymentIntents: { retrieve: vi.fn(), },
}) as unknown as Stripe;

beforeEach(() => vi.mocked(getDb).mockReset());
describe("booking Stripe webhook processor", () => {
  it("leaves unrelated Stripe CLI fixtures outside the booking database", async () => {
    const db = dbMock();
    await expect(handleBookingStripeEvent(event("checkout.session.completed", { id: "cs_fixture" }), stripe())).resolves.toBe("not_applicable");
    expect(db.select).not.toHaveBeenCalled();
  });
  it("does not settle a completed but unpaid Checkout Session", async () => {
    const db = dbMock({ attempt: localAttempt });
    const provider = stripe({ ...baseSession, payment_status: "unpaid" });
    const result = await handleBookingStripeEvent(event("checkout.session.completed", { id: "cs_test_1", metadata: baseSession.metadata }), provider);
    expect(result).toBe("ignored");
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
  it("persists one canonical paid settlement through the atomic database statement", async () => {
    const db = dbMock({ attempt: localAttempt, settlement: [{ event_id: "evt_test_1", settlement_status: "applied" }] });
    await expect(handleBookingStripeEvent(event("checkout.session.completed", { id: "cs_test_1", metadata: baseSession.metadata }), stripe())).resolves.toBe("processed");
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it("returns duplicate before retrieving or settling a session", async () => {
    const db = dbMock({ receipts: [{ eventId: "evt_test_1" }] });
    const provider = stripe();
    await expect(handleBookingStripeEvent(event("checkout.session.completed", { id: "cs_test_1", metadata: baseSession.metadata }), provider)).resolves.toBe("duplicate");
    expect((provider.checkout.sessions.retrieve as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
});
