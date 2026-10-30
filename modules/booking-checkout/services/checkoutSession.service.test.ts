// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/env")>(), getEnv: vi.fn(), getStripeCheckoutConfig: vi.fn() }));
vi.mock("./checkoutAttempts.service", () => ({ retireCheckoutAttempt: vi.fn() }));
vi.mock("stripe", () => ({ default: vi.fn() }));
import { getDb } from "@/lib/db";
import { getEnv, getStripeCheckoutConfig, type StripeCheckoutConfig } from "@/lib/env";
import { retireCheckoutAttempt } from "./checkoutAttempts.service";
import { createBookingCheckoutSession } from "./checkoutSession.service";
import { checkoutQuoteHash } from "./quote.service";

const bookingId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const staleAttemptId = "44444444-4444-4444-8444-444444444444";
const MINUTE = 60 * 1000;
const initialHash = checkoutQuoteHash({
  bookingId, kind: "initial", offerVersion: 1, termsVersion: "v1",
  amountUsd: 100, amountPenCents: 37500, rateId: "rate-1", rateUsdPen: "3.75",
});
const balanceHash = checkoutQuoteHash({
  bookingId, kind: "balance", offerVersion: 1, termsVersion: "v1",
  amountUsd: 400, amountPenCents: 150000, rateId: "rate-1", rateUsdPen: "3.75",
});
const testConfig: StripeCheckoutConfig = {
  enabled: true, mode: "test", secretKey: "sk_test_unit_only", webhookSecret: null, allowDraftContracts: false, disabledReason: null,
};

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: bookingId, status: "pending", packageLabel: "Carrera 10K", tripSlug: "lima-10k",
    participantEmail: "runner@example.test", totalUsd: 500, initialPaymentUsd: 100,
    offerVersion: 1, offerTermsVersion: "v1", checkoutRateId: "rate-1",
    checkoutRateUsdPen: "3.75", checkoutAmountPenCents: 37500,
    reservationExpiresAt: new Date(Date.now() + 20 * MINUTE), acceptedBookingId: bookingId, ...overrides,
  };
}
function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: staleAttemptId, bookingId, requestId: "55555555-5555-4555-8555-555555555555", kind: "balance", status: "created",
    quoteHash: balanceHash, amountUsd: 400, amountPenCents: 150000, idempotencyKey: "cv-checkout-stale",
    stripeSessionId: "cs_test_stale", checkoutUrl: "https://checkout.stripe.test/stale",
    expiresAt: new Date(Date.now() - MINUTE), ...overrides,
  };
}
function session(params: Partial<Stripe.Checkout.Session> & { metadata: Record<string, string> }) {
  return {
    id: "cs_test_new", object: "checkout.session", url: "https://checkout.stripe.test/new", livemode: false, mode: "payment",
    amount_total: 37500, currency: "pen", status: "open", expires_at: Math.floor((Date.now() + 40 * MINUTE) / 1000), ...params,
  } as Stripe.Checkout.Session;
}

// Select results are consumed in call order; execute serves the initial-reservation extension.
// `recorded` is what the final compare-and-set update of the attempt returns.
function fakeDb(selects: unknown[][], extension: unknown[] = [], recorded: unknown[] = [{ id: attemptId }]) {
  const inserted: Record<string, unknown>[] = [];
  const wheres: SQL[] = [];
  const updateWhere = vi.fn((condition: SQL) => { void condition; return { returning: async () => recorded }; });
  const db = {
    select: vi.fn(() => {
      const result = selects.shift() ?? [];
      const query = {
        from: () => query, innerJoin: () => query, leftJoin: () => query,
        where: (condition: SQL) => { wheres.push(condition); return query; }, limit: async () => result,
      };
      return query;
    }),
    execute: vi.fn().mockResolvedValue({ rows: extension }),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            inserted.push(values);
            return [{ ...values, id: attemptId, status: "pending", stripeSessionId: null, checkoutUrl: null }];
          },
        }),
      }),
    })),
    update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
  };
  vi.mocked(getDb).mockReturnValue(db as never);
  return { db, inserted, updateWhere, wheres };
}
function stripeWith(create = vi.fn(), retrieve = vi.fn()) {
  vi.mocked(Stripe).mockImplementation(function StripeMock() {
    return { checkout: { sessions: { create, retrieve } } } as unknown as Stripe;
  });
  return { create, retrieve };
}
const echoCreate = (overrides: Partial<Omit<Stripe.Checkout.Session, "metadata">> = {}) => vi.fn().mockImplementation(
  async (params: { metadata: Record<string, string>; line_items: { price_data: { unit_amount: number } }[] }) =>
    session({ metadata: params.metadata, amount_total: params.line_items[0].price_data.unit_amount, ...overrides }));

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(Stripe).mockReset();
  vi.mocked(retireCheckoutAttempt).mockReset().mockResolvedValue(true);
  vi.mocked(getStripeCheckoutConfig).mockReset().mockReturnValue(testConfig);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
});

describe("checkout session service: configuration", () => {
  it.each([
    ["disabled", { ...testConfig, enabled: false, disabledReason: "not_enabled" as const }],
    ["without a key for this environment", { ...testConfig, enabled: false, mode: null, secretKey: null, disabledReason: "mode_not_allowed" as const }],
  ])("refuses calls %s before any database access", async (_label, config) => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config);
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toBe("checkout_unavailable");
    expect(getDb).not.toHaveBeenCalled();
    expect(Stripe).not.toHaveBeenCalled();
  });

  it("creates Checkout with card only, returning to APP_ORIGIN, with the configured key", async () => {
    const reservationEnd = new Date(Date.now() + 33 * MINUTE);
    const { inserted } = fakeDb([[booking()], [], []], [{ expires_at: reservationEnd.toISOString() }]);
    const { create } = stripeWith(echoCreate());
    const result = await createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash });
    expect(result).toMatchObject({ state: "created", attemptId, checkoutUrl: expect.stringContaining("checkout.stripe.test") });
    expect(Stripe).toHaveBeenCalledWith("sk_test_unit_only", expect.anything());
    const [params, options] = create.mock.calls[0];
    expect(params).toMatchObject({
      allowed_payment_method_types: ["card"],
      success_url: expect.stringMatching(/^http:\/\/localhost:3001\/viajes\/lima-10k\/checkout\?booking_id=.+&return=success$/),
      cancel_url: expect.stringMatching(/^http:\/\/localhost:3001\/viajes\/lima-10k\/checkout\?booking_id=.+&cancelled=1$/),
      expires_at: Math.floor(reservationEnd.getTime() / 1000),
    });
    expect(options).toEqual({ idempotencyKey: `cv-checkout-${bookingId}-initial-${requestId}` });
    expect(inserted[0]).toMatchObject({ expiresAt: reservationEnd, idempotencyKey: options.idempotencyKey });
  });

  it("aligns the session with the reservation, never below Stripe's 30 minutes", async () => {
    const { db } = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 32 * MINUTE).toISOString() }]);
    const { create } = stripeWith(echoCreate());
    await createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash });
    const sent = create.mock.calls[0][0].expires_at * 1000;
    expect(sent - Date.now()).toBeGreaterThan(30 * MINUTE);
    expect(sent - Date.now()).toBeLessThanOrEqual(24 * 60 * MINUTE);
    // The extension is a single bounded statement on the booking and its held seat.
    const statement = new PgDialect().sqlToQuery(db.execute.mock.calls[0][0] as SQL).sql;
    expect(statement).toContain("greatest(reservation_expires_at");
    expect(statement).toContain("created_at +");
    // Only a booking that still holds its seat is extended; a simulated one has no seat to hold.
    expect(statement).toMatch(/extended_booking AS \([\s\S]*AND \("bookings"\."is_simulated" OR EXISTS \(\s*SELECT 1 FROM "offer_capacity_allocations" AS hold\s*WHERE hold\.booking_id = "bookings"\.id AND hold\.status = 'held'\s*\)\)\s*RETURNING/);
    expect(statement).toMatch(/LEFT JOIN extended_allocation[\s\S]*WHERE extended_booking\.is_simulated OR extended_allocation\.booking_id IS NOT NULL/);
  });

  it.each([["test", "test"], ["demo", "test"]] as const)(
    "marks %s-mode sessions and attempts as simulated (stripe_mode %s) and only pays simulated bookings",
    async (mode, stripeMode) => {
      vi.mocked(getStripeCheckoutConfig).mockReturnValue({ ...testConfig, mode });
      const { inserted, wheres } = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE).toISOString() }]);
      const { create } = stripeWith(echoCreate());
      await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
        .resolves.toMatchObject({ state: "created" });
      const [params, options] = create.mock.calls[0];
      const metadata = { bookingId, attemptId, paymentKind: "initial", environment: mode, simulated: "true" };
      expect(params.metadata).toEqual(metadata);
      expect(params.payment_intent_data.metadata).toEqual(metadata);
      expect(params.line_items[0].price_data).toEqual({
        currency: "pen", unit_amount: 37500,
        product_data: { name: "SIMULACIÓN – sin cargo real · Carrera 10K", description: "SIMULACIÓN – sin cargo real · Pago inicial de reserva" },
      });
      expect(params.allowed_payment_method_types).toEqual(["card"]);
      expect(options).toEqual({ idempotencyKey: `cv-checkout-${bookingId}-initial-${requestId}` });
      expect(inserted[0]).toMatchObject({ stripeMode });
      const bookingFilter = new PgDialect().sqlToQuery(wheres[0]);
      expect(bookingFilter.sql).toMatch(/"bookings"\."is_simulated" = \$\d+/);
      expect(bookingFilter.params.at(-1)).toBe(true);
    },
  );

  it("keeps live sessions unmarked, with stripe_mode live, and only pays real bookings", async () => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue({ ...testConfig, mode: "live", secretKey: "sk_live_unit_only" });
    vi.mocked(getEnv).mockReturnValue({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" } as ReturnType<typeof getEnv>);
    const { inserted, wheres } = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE).toISOString() }]);
    const { create } = stripeWith(echoCreate({ livemode: true }));
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toMatchObject({ state: "created" });
    const [params] = create.mock.calls[0];
    expect(params.metadata).toEqual({ bookingId, attemptId, paymentKind: "initial" });
    expect(params.payment_intent_data.metadata).toEqual({ bookingId, attemptId, paymentKind: "initial" });
    expect(params.line_items[0].price_data.product_data).toEqual({ name: "Carrera 10K", description: "Pago inicial de reserva" });
    expect(inserted[0]).toMatchObject({ stripeMode: "live" });
    expect(new PgDialect().sqlToQuery(wheres[0]).params.at(-1)).toBe(false);
  });

  it("does not hand out a Session when the attempt stopped being pending, and logs its id for reconciliation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { updateWhere } = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE).toISOString() }], []);
    stripeWith(echoCreate({ id: "cs_test_unrecorded" }));
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toBe("attempt_conflict");
    const where = new PgDialect().sqlToQuery(updateWhere.mock.calls[0][0]);
    expect(where.sql).toMatch(/"id" = \$1 and "booking_checkout_attempts"\."status" = \$2/);
    expect(where.params).toEqual([attemptId, "pending"]);
    expect(warn).toHaveBeenCalledWith("booking checkout: session not recorded", {
      bookingId, attemptId, stripeSessionId: "cs_test_unrecorded", alert: true,
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("runner@example.test");
    expect(logged).not.toContain("checkout.stripe.test");
    warn.mockRestore();
  });

  it("uses test sessions in demo mode and refuses a live one", async () => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue({ ...testConfig, mode: "demo" });
    vi.mocked(getEnv).mockReturnValue({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" } as ReturnType<typeof getEnv>);
    const live = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE) }]);
    stripeWith(echoCreate({ livemode: true }));
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toBe("stripe_unavailable");
    expect(live.db.update).not.toHaveBeenCalled();

    fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE) }]);
    stripeWith(echoCreate({ livemode: false }));
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toMatchObject({ state: "created" });
  });

  it("refuses with reservation_expired when the bounded extension is not possible", async () => {
    fakeDb([[booking()], [], []], []);
    const { create } = stripeWith(echoCreate());
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toBe("reservation_expired");
    expect(create).not.toHaveBeenCalled();
  });

  it("requires live sessions in live mode", async () => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue({ ...testConfig, mode: "live", secretKey: "sk_live_unit_only" });
    vi.mocked(getEnv).mockReturnValue({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" } as ReturnType<typeof getEnv>);
    const { db } = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE) }]);
    stripeWith(echoCreate({ livemode: false }));
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toBe("stripe_unavailable");
    expect(db.update).not.toHaveBeenCalled();

    const live = fakeDb([[booking()], [], []], [{ expires_at: new Date(Date.now() + 33 * MINUTE) }]);
    const { create } = stripeWith(echoCreate({ livemode: true }));
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toMatchObject({ state: "created" });
    expect(create.mock.calls[0][0].success_url).toMatch(/^https:\/\/carreras-viajeras\.mentec\.dev\//);
    expect(live.db.update).toHaveBeenCalled();
  });
});

describe("checkout session service: stale attempts", () => {
  const confirmed = booking({ status: "confirmed", reservationExpiresAt: new Date(Date.now() - 60 * MINUTE) });
  const balanceInput = { requestId, kind: "balance" as const, quoteHash: balanceHash };

  it("retires a balance attempt whose Stripe Session expired and opens a new one", async () => {
    const stale = attempt();
    const { inserted } = fakeDb([[confirmed], [{ status: "applied" }], [], [], [stale]]);
    const { create, retrieve } = stripeWith(echoCreate(), vi.fn().mockResolvedValue(session({
      id: "cs_test_stale", status: "expired", amount_total: 150000, metadata: { bookingId, attemptId: staleAttemptId, paymentKind: "balance" },
    })));
    const result = await createBookingCheckoutSession(bookingId, "runner", balanceInput);
    expect(retrieve).toHaveBeenCalledWith("cs_test_stale");
    expect(retireCheckoutAttempt).toHaveBeenCalledWith(stale, "expired", true);
    expect(result).toMatchObject({ state: "created", attemptId });
    expect(inserted).toHaveLength(1);
    const sent = create.mock.calls[0][0].expires_at * 1000 - Date.now();
    expect(sent).toBeGreaterThan(30 * MINUTE);
    expect(sent).toBeLessThanOrEqual(24 * 60 * MINUTE);
  });

  it("retires a pending attempt without a Session once its deadline passed", async () => {
    const stale = attempt({ status: "pending", stripeSessionId: null, checkoutUrl: null });
    fakeDb([[confirmed], [{ status: "applied" }], [], [], [stale]]);
    const { retrieve } = stripeWith(echoCreate());
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toMatchObject({ state: "created", attemptId });
    expect(retireCheckoutAttempt).toHaveBeenCalledWith(stale, "failed", true);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("leaves a completed Session to the webhook and never opens a second payment", async () => {
    fakeDb([[confirmed], [{ status: "applied" }], [], [], [attempt()]]);
    const { create } = stripeWith(echoCreate(), vi.fn().mockResolvedValue(session({
      id: "cs_test_stale", status: "complete", amount_total: 150000, metadata: { bookingId, attemptId: staleAttemptId, paymentKind: "balance" },
    })));
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toBe("payment_processing");
    expect(retireCheckoutAttempt).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses a Session that is still open", async () => {
    const open = attempt({ expiresAt: new Date(Date.now() + 20 * MINUTE) });
    const { inserted } = fakeDb([[confirmed], [{ status: "applied" }], [], [], [open]]);
    const { create } = stripeWith(echoCreate(), vi.fn().mockResolvedValue(session({
      id: "cs_test_stale", url: "https://checkout.stripe.test/stale", amount_total: 150000,
      metadata: { bookingId, attemptId: staleAttemptId, paymentKind: "balance" },
    })));
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput))
      .resolves.toEqual({ state: "reused", attemptId: staleAttemptId, checkoutUrl: "https://checkout.stripe.test/stale" });
    expect(create).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("does not act on a Session that belongs to another attempt", async () => {
    fakeDb([[confirmed], [{ status: "applied" }], [], [], [attempt()]]);
    stripeWith(echoCreate(), vi.fn().mockResolvedValue(session({
      id: "cs_test_stale", status: "expired", metadata: { bookingId, attemptId: "other", paymentKind: "balance" },
    })));
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toBe("attempt_conflict");
    expect(retireCheckoutAttempt).not.toHaveBeenCalled();
  });

  it("retries a pending attempt with its original deadline and idempotency key", async () => {
    const expiresAt = new Date(Date.now() + 40 * MINUTE);
    const pending = attempt({ status: "pending", stripeSessionId: null, checkoutUrl: null, expiresAt });
    const { inserted } = fakeDb([[confirmed], [{ status: "applied" }], [], [], [pending]]);
    const { create } = stripeWith(echoCreate());
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toMatchObject({ state: "created", attemptId: staleAttemptId });
    expect(create.mock.calls[0][0].expires_at).toBe(Math.floor(expiresAt.getTime() / 1000));
    expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: "cv-checkout-stale" });
    expect(inserted).toHaveLength(0);
  });

  it("maps Stripe failures to stripe_unavailable and retires an attempt too close to Stripe's minimum", async () => {
    const pending = attempt({ status: "pending", stripeSessionId: null, checkoutUrl: null, expiresAt: new Date(Date.now() + 10 * MINUTE) });
    fakeDb([[confirmed], [{ status: "applied" }], [], [], [pending]]);
    stripeWith(vi.fn().mockRejectedValue(new Error("expires_at must be at least 30 minutes")));
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toBe("stripe_unavailable");
    expect(retireCheckoutAttempt).toHaveBeenCalledWith(pending, "failed", false);

    vi.mocked(retireCheckoutAttempt).mockClear();
    const fresh = attempt({ status: "pending", stripeSessionId: null, checkoutUrl: null, expiresAt: new Date(Date.now() + 50 * MINUTE) });
    fakeDb([[confirmed], [{ status: "applied" }], [], [], [fresh]]);
    stripeWith(vi.fn().mockRejectedValue(new Error("connection reset")));
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toBe("stripe_unavailable");
    expect(retireCheckoutAttempt).not.toHaveBeenCalled();
  });

  it("answers attempt_expired when the same request id names a retired attempt", async () => {
    const prior = attempt({ requestId, status: "pending", stripeSessionId: null, checkoutUrl: null });
    const { inserted } = fakeDb([[confirmed], [{ status: "applied" }], [], [prior]]);
    stripeWith(echoCreate());
    await expect(createBookingCheckoutSession(bookingId, "runner", balanceInput)).resolves.toBe("attempt_expired");
    expect(retireCheckoutAttempt).toHaveBeenCalledWith(prior, "failed", true);
    expect(inserted).toHaveLength(0);
  });

  it("releases the initial hold when its attempt is retired, then reports the expired reservation", async () => {
    const stale = attempt({ kind: "initial", quoteHash: initialHash, amountUsd: 100, amountPenCents: 37500, status: "pending", stripeSessionId: null, checkoutUrl: null });
    fakeDb([[booking({ reservationExpiresAt: new Date(Date.now() - MINUTE) })], [], [stale]]);
    stripeWith(echoCreate());
    await expect(createBookingCheckoutSession(bookingId, "runner", { requestId, kind: "initial", quoteHash: initialHash }))
      .resolves.toBe("reservation_expired");
    expect(retireCheckoutAttempt).toHaveBeenCalledWith(stale, "failed", true);
  });
});
