// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_ORIGIN: "http://localhost:3001" }) }));
vi.mock("./bookingCheckout.service", () => ({ isCheckoutSandboxEnabled: vi.fn() }));
vi.mock("stripe", () => ({ default: vi.fn() }));
import { getDb } from "@/lib/db";
import { isCheckoutSandboxEnabled } from "./bookingCheckout.service";
import { createBookingCheckoutSession } from "./checkoutSession.service";
import { checkoutQuoteHash } from "./quote.service";

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(Stripe).mockReset();
  vi.mocked(isCheckoutSandboxEnabled).mockReset().mockReturnValue(true);
  process.env.STRIPE_CHECKOUT_ORIGIN = "http://localhost:3001";
});

describe("sandbox checkout session service", () => {
  it("refuses live or missing application keys before any database access", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_synthetic_for_test";
    await expect(createBookingCheckoutSession("11111111-1111-4111-8111-111111111111", "runner", {
      requestId: "22222222-2222-4222-8222-222222222222", kind: "initial", quoteHash: "a".repeat(64),
    })).resolves.toBe("checkout_unavailable");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("refuses calls when the explicit sandbox feature flag is off", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_test_only";
    vi.mocked(isCheckoutSandboxEnabled).mockReturnValue(false);
    await expect(createBookingCheckoutSession("11111111-1111-4111-8111-111111111111", "runner", {
      requestId: "22222222-2222-4222-8222-222222222222", kind: "initial", quoteHash: "a".repeat(64),
    })).resolves.toBe("checkout_unavailable");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("refuses calls when the dedicated checkout origin is not an allowed local origin", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_test_only";
    process.env.STRIPE_CHECKOUT_ORIGIN = "https://untrusted.example";
    await expect(createBookingCheckoutSession("11111111-1111-4111-8111-111111111111", "runner", {
      requestId: "22222222-2222-4222-8222-222222222222", kind: "initial", quoteHash: "a".repeat(64),
    })).resolves.toBe("checkout_unavailable");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("creates Checkout with card as the only payment method", async () => {
    const bookingId = "11111111-1111-4111-8111-111111111111";
    const attemptId = "33333333-3333-4333-8333-333333333333";
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000);
    const booking = {
      id: bookingId, status: "pending", packageLabel: "Carrera 10K", tripSlug: "lima-10k",
      participantEmail: "runner@example.test", totalUsd: 500, initialPaymentUsd: 100,
      offerVersion: 1, offerTermsVersion: "v1", checkoutRateId: "rate-1",
      checkoutRateUsdPen: "3.75", checkoutAmountPenCents: 37500,
      reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000), acceptedBookingId: bookingId,
    };
    const quoteHash = checkoutQuoteHash({
      bookingId, kind: "initial", offerVersion: 1, termsVersion: "v1",
      amountUsd: 100, amountPenCents: 37500, rateId: "rate-1", rateUsdPen: "3.75",
    });
    const selectResults: unknown[][] = [[booking], [], []];
    const db = {
      select: vi.fn(() => {
        const result = selectResults.shift() ?? [];
        const query = {
          from: () => query, innerJoin: () => query, leftJoin: () => query,
          where: () => query, limit: async () => result,
        };
        return query;
      }),
      execute: vi.fn().mockResolvedValue({ rows: [{ booking_id: bookingId }] }),
      insert: vi.fn(() => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: async () => [{
              ...values, id: attemptId, status: "pending", stripeSessionId: null,
              expiresAt: values.expiresAt,
            }],
          }),
        }),
      })),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    };
    vi.mocked(getDb).mockReturnValue(db as never);
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_test_only";
    const createSession = vi.fn().mockImplementation(async (params: { metadata: Record<string, string> }) => ({
      id: "cs_test_example", url: "https://checkout.stripe.com/c/pay/cs_test_example",
      livemode: false, mode: "payment", metadata: params.metadata, amount_total: 37500,
      currency: "pen", status: "open", expires_at: Math.floor(expiresAt.getTime() / 1000),
    }));
    vi.mocked(Stripe).mockImplementation(function StripeMock() {
      return { checkout: { sessions: { create: createSession } } } as unknown as Stripe;
    });

    const result = await createBookingCheckoutSession(bookingId, "runner", {
      requestId: "22222222-2222-4222-8222-222222222222", kind: "initial", quoteHash,
    });

    expect(result).toMatchObject({ state: "created", attemptId, checkoutUrl: expect.stringContaining("checkout.stripe.com") });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_payment_method_types: ["card"],
        success_url: expect.stringMatching(/^http:\/\/localhost:3001\//),
        cancel_url: expect.stringMatching(/^http:\/\/localhost:3001\//),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });
});
