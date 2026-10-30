// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/env")>(), getStripeCheckoutConfig: vi.fn() }));
import { getDb } from "@/lib/db";
import { getStripeCheckoutConfig, type StripeCheckoutConfig } from "@/lib/env";
import { createStripeWebhookHandler, handleStripeWebhook } from "./stripeWebhook.service";
import type { BookingWebhookResult } from "./bookingWebhook.service";
import { POST } from "@/app/api/webhooks/stripe/route";

const webhookSecret = "whsec_synthetic_test_only";
const stripe = new Stripe("sk_test_synthetic_test_only");
const bookingId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";

function payload({ id = "evt_test_1", type = "checkout.session.completed", livemode = false, account }: {
  id?: string; type?: string; livemode?: boolean; account?: string;
} = {}) {
  return JSON.stringify({
    id, object: "event", type, created: 1793310000, livemode, ...(account && { account }),
    data: { object: { id: "cs_test_1", object: "checkout.session", customer_email: "runner@example.test", metadata: { bookingId, attemptId } } },
  });
}
function signedRequest(body: string, secret = webhookSecret) {
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("https://carreras-viajeras.mentec.dev/api/webhooks/stripe", {
    method: "POST", headers: { "stripe-signature": signature }, body,
  });
}
function config(overrides: Partial<StripeCheckoutConfig> = {}): StripeCheckoutConfig {
  return {
    enabled: false, mode: "test", secretKey: "sk_test_synthetic_test_only", webhookSecret,
    allowDraftContracts: false, disabledReason: "not_enabled", ...overrides,
  };
}
function processor(result: BookingWebhookResult = { outcome: "applied", attemptId, bookingId }) {
  return vi.fn().mockResolvedValue(result);
}
const logs = () => ({
  info: vi.spyOn(console, "info").mockImplementation(() => {}),
  warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(getStripeCheckoutConfig).mockReset().mockReturnValue(config());
});
afterEach(() => vi.restoreAllMocks());

describe("Stripe webhook route", () => {
  it("exposes the POST route from the booking-checkout module and rejects a missing signature", async () => {
    const response = await POST(new Request("https://carreras-viajeras.mentec.dev/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(getStripeCheckoutConfig).not.toHaveBeenCalled();
  });

  it.each([
    ["no secret key", { mode: null, secretKey: null, webhookSecret: null }],
    ["no webhook secret", { webhookSecret: null }],
    ["a disallowed key mode", { mode: null, secretKey: null, webhookSecret: null, disabledReason: "mode_not_allowed" as const }],
  ])("answers 503 without revealing the reason when there is %s", async (_label, overrides) => {
    const log = logs();
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config(overrides));
    const response = await handleStripeWebhook(signedRequest(payload()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "webhook_unavailable" });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("sk_test_");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("works while Checkout is switched off and ignores unrelated events without touching the database", async () => {
    logs();
    const body = JSON.stringify({ id: "evt_test_invoice", object: "event", type: "invoice.paid", created: 1793310000,
      livemode: false, data: { object: { id: "in_test_1", object: "invoice" } } });
    const response = await handleStripeWebhook(signedRequest(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("ignores a booking event without local metadata, such as a CLI fixture", async () => {
    logs();
    const body = JSON.stringify({ id: "evt_test_fixture", object: "event", type: "checkout.session.completed", created: 1793310000,
      livemode: false, data: { object: { id: "cs_fixture", object: "checkout.session" } } });
    const response = await handleStripeWebhook(signedRequest(body));
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe("Stripe webhook dispatcher", () => {
  it("verifies the signature over the raw body and delegates the event in the configured mode", async () => {
    logs();
    const processEvent = processor();
    const response = await createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent })(signedRequest(payload()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ received: true, result: "applied" });
    expect(processEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_test_1", type: "checkout.session.completed" }), stripe, "test");
  });

  it("rejects an invalid signature or an altered body with 400 and processes nothing", async () => {
    const processEvent = processor();
    const handler = createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent });
    expect((await handler(signedRequest(payload(), "whsec_other_test_only"))).status).toBe(400);
    const body = payload();
    const signed = signedRequest(body);
    const tampered = new Request(signed.url, { method: "POST", headers: signed.headers, body: `${body} ` });
    const response = await handler(tampered);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects a body over 512 KB before verifying it", async () => {
    const processEvent = processor();
    const handler = createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent });
    const response = await handler(signedRequest("x".repeat(512 * 1024 + 1)));
    expect(response.status).toBe(413);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["a live event on a test deployment", "test" as const, true],
    ["a test event on a live deployment", "live" as const, false],
    ["a live event on a demo deployment", "demo" as const, true],
  ])("rejects %s without touching data", async (_label, mode, livemode) => {
    const log = logs();
    const processEvent = processor();
    const response = await createStripeWebhookHandler({ stripe, webhookSecret, mode, processEvent })(signedRequest(payload({ livemode })));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "mode_mismatch" });
    expect(processEvent).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("stripe-webhook: event failed", expect.objectContaining({ eventId: "evt_test_1", result: "error" }));
  });

  it("accepts live events on a live deployment", async () => {
    logs();
    const processEvent = processor();
    const response = await createStripeWebhookHandler({ stripe, webhookSecret, mode: "live", processEvent })(signedRequest(payload({ livemode: true })));
    expect(response.status).toBe(200);
    expect(processEvent).toHaveBeenCalledWith(expect.anything(), stripe, "live");
  });

  it("accepts test events on a demo deployment and delegates them in demo mode", async () => {
    logs();
    const processEvent = processor();
    const response = await createStripeWebhookHandler({ stripe, webhookSecret, mode: "demo", processEvent })(signedRequest(payload({ livemode: false })));
    expect(response.status).toBe(200);
    expect(processEvent).toHaveBeenCalledWith(expect.anything(), stripe, "demo");
  });

  it.each([
    ["a live key under the demo flag", { mode: null, secretKey: null, webhookSecret: null, disabledReason: "demo_requires_test_key" as const }],
  ])("answers 503 with %s", async (_label, overrides) => {
    const log = logs();
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config(overrides));
    const response = await handleStripeWebhook(signedRequest(payload()));
    expect(response.status).toBe(503);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("sk_");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("ignores connected-account events", async () => {
    logs();
    const processEvent = processor();
    const response = await createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent })(signedRequest(payload({ account: "acct_test_1" })));
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("logs one structured line per event with identifiers and result only", async () => {
    const log = logs();
    await createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent: processor() })(signedRequest(payload()));
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith("stripe-webhook: event processed", {
      eventId: "evt_test_1", eventType: "checkout.session.completed", attemptId, bookingId, result: "applied",
    });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("runner@example.test");
  });

  it("raises an alert when a settlement needs review", async () => {
    const log = logs();
    const processEvent = processor({ outcome: "needs_review", attemptId, bookingId });
    const response = await createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent })(signedRequest(payload({ type: "charge.refunded" })));
    expect(await response.json()).toEqual({ received: true, result: "needs_review" });
    expect(log.warn).toHaveBeenCalledWith("stripe-webhook: settlement needs review", expect.objectContaining({
      eventType: "charge.refunded", attemptId, bookingId, result: "needs_review", alert: true,
    }));
  });

  it("answers 5xx on a database failure so Stripe retries, without logging the error message", async () => {
    const log = logs();
    const failure = Object.assign(new Error("connection to postgresql://user:secret@db failed"), { code: "ECONNRESET" });
    const processEvent = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ outcome: "applied", attemptId, bookingId });
    const handler = createStripeWebhookHandler({ stripe, webhookSecret, mode: "test", processEvent });
    const first = await handler(signedRequest(payload()));
    expect(first.status).toBe(500);
    expect(await first.json()).toEqual({ error: "webhook_processing_failed" });
    const logged = JSON.stringify(log.error.mock.calls);
    expect(logged).toContain("evt_test_1");
    expect(logged).not.toContain("secret@db");
    expect(logged).not.toContain("ECONNRESET");
    const retry = await handler(signedRequest(payload()));
    expect(await retry.json()).toEqual({ received: true, result: "applied" });
  });
});
