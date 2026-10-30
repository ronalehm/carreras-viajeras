// @vitest-environment node
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
const state = vi.hoisted(() => ({
  mode: "demo" as "test" | "live" | "demo", userId: "", create: vi.fn(), retrieve: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/env")>(),
  getEnv: () => ({ APP_ORIGIN: "http://localhost:3001" }),
  getStripeCheckoutConfig: () => ({
    enabled: true, mode: state.mode, secretKey: state.mode === "live" ? "sk_live_synthetic_test_only" : "sk_test_synthetic_test_only",
    webhookSecret: null, allowDraftContracts: false, disabledReason: null,
  }),
}));
vi.mock("@/lib/auth/guards", () => {
  const sessionUser = async () => ({ id: state.userId, email: "checkout-sim-runner@example.invalid", emailVerified: true, staffRoles: [] });
  // getCurrentUser feeds the demo pre-gate; requireVerifiedEmail the usual route checks.
  return { getCurrentUser: sessionUser, requireVerifiedEmail: sessionUser };
});
vi.mock("@/modules/integrations", () => ({ readJsonBody: vi.fn() }));
vi.mock("stripe", () => ({ default: class StripeMock {
  checkout = { sessions: { create: state.create, retrieve: state.retrieve } };
} }));
import { getDb } from "@/lib/db";
import { checkoutQuoteHash } from "./quote.service";
import {
  findResumableCheckoutBooking, getCheckoutReservation, persistCheckoutReservation, type CheckoutReservationSnapshot,
} from "./bookingCheckout.service";
import { createBookingCheckoutSession } from "./checkoutSession.service";
import { handleBookingStripeEvent, StripeModeMismatchError } from "./bookingWebhook.service";
import { retireCheckoutAttempt } from "./checkoutAttempts.service";
import { isActiveDemoParticipant } from "./checkoutAccess.service";
import { POST as preparePost } from "@/app/api/bookings/checkout/prepare/route";
import { POST as sessionPost } from "@/app/api/bookings/[bookingId]/checkout/route";
import { GET as stateGet } from "@/app/api/bookings/[bookingId]/checkout/[attemptId]/route";
import { POST as acceptancePost } from "@/app/api/bookings/[bookingId]/contract-acceptance/route";

// Same isolated database as the other checkout PostgreSQL tests, with fixtures of its own trip.
// Run these files with --no-file-parallelism: the reservation sweep is global.
const enabled = process.env.CHECKOUT_POSTGRES_TESTS === "true";
const database = "cv_stripe_checkout_f2_test";
const pool = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", database });
const adminId = "checkout-sim-admin";
const runnerId = "checkout-sim-runner";
const revokedId = "checkout-sim-revoked";
const email = "checkout-sim-runner@example.invalid";
const tripId = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const offerId = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const rateId = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";
const terms = "checkout-simulated-test-v1";
const requests = Array.from({ length: 7 }, (_v, i) => {
  const n = i + 1;
  return `b${n}b${n}b${n}b${n}-b${n}b${n}-4b${n}b-8b${n}b-b${n}b${n}b${n}b${n}b${n}b${n}`;
});
// One lead per booking, all with the runner's email: bookings_lead_active_uq (one active booking
// per lead, simulated or not) is outside this change; the email index is the one that excludes
// simulated bookings.
const leadIds = requests.map((_r, i) => `a${i + 1}a${i + 1}a${i + 1}a${i + 1}-a4a4-4a4a-8a4a-a4a4a4a4a4a4`);

function snapshot(n: number, simulated: boolean): CheckoutReservationSnapshot {
  return {
    requestId: requests[n], inputHash: String(n).repeat(64), userId: runnerId, email, leadId: leadIds[n], tripId,
    participantName: "Simulated Runner", packageLabel: "Carrera simulada", distance: null, totalUsd: 1000,
    initialPaymentUsd: 250, balanceDueOn: "2027-01-01", offerVersionId: offerId, offerVersion: 1, campaignId: null,
    termsVersion: terms, conditions: "Condiciones sintéticas.", tripIncludes: ["Hotel"], tripExcludes: ["Vuelos"],
    rateId, rateUsdPen: "3.7500", amountPenCents: 93750, capacityLimit: 2, simulated,
  };
}
const quoteHash = (bookingId: string) => checkoutQuoteHash({
  bookingId, kind: "initial", offerVersion: 1, termsVersion: terms, amountUsd: 250, amountPenCents: 93750, rateId, rateUsdPen: "3.7500",
});
async function capacity() {
  const { rows: [counter] } = await pool.query("select allocated_count from offer_capacity_counters where offer_version_id=$1", [offerId]);
  const { rows: [allocations] } = await pool.query("select count(*)::int as n from offer_capacity_allocations a join bookings b on b.id=a.booking_id where b.is_simulated and b.trip_id=$1", [tripId]);
  return { allocated: counter.allocated_count as number, simulatedAllocations: allocations.n as number };
}
async function bookingRow(id: string) {
  const { rows: [row] } = await pool.query("select status, is_simulated from bookings where id=$1", [id]);
  return row as { status: string; is_simulated: boolean };
}
async function accept(bookingId: string) {
  await pool.query("insert into booking_contract_acceptances(booking_id,runner_user_id,contract_version_key,contract_document_hash,document_snapshot,document_hash) values($1,$2,$3,$4,'Synthetic simulated contract acceptance snapshot.',$5) on conflict(booking_id) do nothing",
    [bookingId, runnerId, terms, "a".repeat(64), "b".repeat(64)]);
}
const echoSession = (overrides: Record<string, unknown> = {}) => async (params: {
  metadata: Record<string, string>; client_reference_id: string; expires_at: number; line_items: { price_data: { unit_amount: number } }[];
}) => ({
  id: "cs_test_simulated", object: "checkout.session", livemode: false, mode: "payment", status: "open", currency: "pen",
  amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata, client_reference_id: params.client_reference_id,
  expires_at: params.expires_at, url: "https://checkout.stripe.test/cs_test_simulated", ...overrides,
});
const ids: Record<string, string> = {};

describe.skipIf(!enabled)("simulated checkout bookings on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (database !== "cv_stripe_checkout_f2_test") throw new Error("unsafe test database");
    const { rows } = await pool.query("select current_database() as name, to_regclass('public.checkout_demo_participants') as participants");
    if (rows[0].name !== database || !rows[0].participants) throw new Error("test DB must have local migrations 0000-0021 applied");
    const trip = "(select id from bookings where trip_id=$1)";
    await pool.query(`delete from booking_stripe_event_receipts where attempt_id in (select id from booking_checkout_attempts where booking_id in ${trip})`, [tripId]);
    await pool.query(`delete from booking_stripe_settlements where booking_id in ${trip}`, [tripId]);
    await pool.query(`delete from booking_checkout_attempts where booking_id in ${trip}`, [tripId]);
    await pool.query(`delete from booking_contract_acceptances where booking_id in ${trip}`, [tripId]);
    await pool.query(`delete from offer_capacity_allocations where booking_id in ${trip}`, [tripId]);
    await pool.query("delete from bookings where trip_id=$1", [tripId]);
    await pool.query("delete from offer_capacity_counters where offer_version_id=$1", [offerId]);
    await pool.query("delete from checkout_demo_participants where user_id=any($1)", [[runnerId, revokedId]]);
    for (const [id, mail] of [[adminId, "checkout-sim-admin@example.invalid"], [runnerId, email], [revokedId, "checkout-sim-revoked@example.invalid"]]) {
      await pool.query("insert into profiles(user_id,email) values($1,$2) on conflict do nothing", [id, mail]);
    }
    await pool.query("insert into trips(id,slug,title,city,country,race_date,distances,summary,includes,excludes,status) values($1,'checkout-simulated-trip','Carrera simulada','Lima','Peru','2027-06-01',ARRAY['21K'],'Simulated trip',ARRAY['Hotel'],ARRAY['Vuelos'],'published') on conflict(id) do nothing", [tripId]);
    await pool.query("insert into exchange_rates(id,usd_pen,created_by) values($1,3.7500,$2) on conflict(id) do nothing", [rateId, adminId]);
    await pool.query("insert into trip_offers(id,trip_id,version,status,name,total_price_usd,discount_usd,deposit_options_usd,balance_due_on,valid_from,capacity_limit,terms_version,conditions,created_by,approved_by,approved_at,activated_by,activated_at) values($1,$2,1,'active','Oferta simulada',1000,0,ARRAY[250],'2027-01-01','2026-01-01',2,$3,'Condiciones sintéticas.',$4,$4,now(),$4,now()) on conflict(id) do nothing", [offerId, tripId, terms, adminId]);
    for (const [i, leadId] of leadIds.entries()) {
      await pool.query("insert into leads(id,full_name,phone,email,trip_id,source,consent_version) values($1,'Simulated Runner',$2,$3,$4,'web_form','test-v1') on conflict(id) do nothing", [leadId, "+5199999990" + i, email, tripId]);
    }
    await pool.query("insert into contract_versions(version_key,title,body,status,document_hash,created_by,approved_by,approved_at) values($1,'Simulated terms','Approved synthetic contract terms for simulated checkout tests.','approved',$2,$3,$3,now()) on conflict(version_key) do nothing", [terms, "a".repeat(64), adminId]);
    // One of the three seats is already taken by a real booking elsewhere.
    await pool.query("insert into offer_capacity_counters(offer_version_id,capacity_limit,allocated_count) values($1,3,1)", [offerId]);
    await pool.query("insert into checkout_demo_participants(user_id,note,granted_by) values($1,'Demo account',$2)", [runnerId, adminId]);
    await pool.query("insert into checkout_demo_participants(user_id,note,granted_by,revoked_at) values($1,'Revoked demo account',$2,now())", [revokedId, adminId]);
    vi.mocked(getDb).mockReturnValue(drizzlePg(pool) as never);
  });
  beforeEach(() => { state.mode = "demo"; state.create.mockReset(); state.retrieve.mockReset(); });
  afterAll(async () => { await pool.end(); });

  it("creates simulated bookings without a seat, and they never block a real one with the same email", async () => {
    const first = await persistCheckoutReservation(snapshot(0, true));
    const second = await persistCheckoutReservation(snapshot(1, true));
    if (typeof first === "string" || typeof second === "string") throw new Error("expected two simulated reservations, got " + String(first) + " " + String(second));
    expect(first.simulated && second.simulated).toBe(true);
    expect(await capacity()).toEqual({ allocated: 1, simulatedAllocations: 0 });
    ids.simulated = first.id;
    ids.simulatedOther = second.id;

    // A real booking takes a seat and stays unique per trip and email.
    const real = await persistCheckoutReservation(snapshot(2, false));
    if (typeof real === "string") throw new Error("expected a real reservation, got " + real);
    ids.real = real.id;
    expect(real.simulated).toBe(false);
    expect(await capacity()).toEqual({ allocated: 2, simulatedAllocations: 0 });
    await expect(persistCheckoutReservation(snapshot(3, false))).resolves.toBe("booking_exists");
    expect(await capacity()).toEqual({ allocated: 2, simulatedAllocations: 0 });
    // With the offer full for real bookings, a simulated one is still created and consumes nothing.
    await pool.query("update offer_capacity_counters set allocated_count=capacity_limit where offer_version_id=$1", [offerId]);
    await expect(persistCheckoutReservation({ ...snapshot(3, false), requestId: "c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9" })).resolves.toBe("sold_out");
    const third = await persistCheckoutReservation(snapshot(4, true));
    if (typeof third === "string") throw new Error("expected a simulated reservation, got " + third);
    ids.simulatedThird = third.id;
    expect(await capacity()).toEqual({ allocated: 3, simulatedAllocations: 0 });
    const { rows } = await pool.query("select is_simulated, count(*)::int as n from bookings where trip_id=$1 and participant_email=$2 and status='pending' group by is_simulated order by is_simulated", [tripId, email]);
    expect(rows).toEqual([{ is_simulated: false, n: 1 }, { is_simulated: true, n: 3 }]);
  });

  it("resumes and replays only bookings of the same kind", async () => {
    await expect(findResumableCheckoutBooking(tripId, email, runnerId, false)).resolves.toBe(ids.real);
    const simulated = await findResumableCheckoutBooking(tripId, email, runnerId, true);
    expect([ids.simulated, ids.simulatedOther, ids.simulatedThird]).toContain(simulated);
    await expect(getCheckoutReservation(requests[0], runnerId, "0".repeat(64), true)).resolves.toMatchObject({ id: ids.simulated, simulated: true });
    await expect(getCheckoutReservation(requests[0], runnerId, "0".repeat(64), false)).resolves.toBe("request_conflict");
    await expect(persistCheckoutReservation(snapshot(2, true))).resolves.toBe("request_conflict");
  });

  it("extends a simulated reservation without a seat and opens a demo session marked as simulated", async () => {
    await accept(ids.simulated);
    await pool.query("update bookings set reservation_expires_at=now()+interval '10 minutes', created_at=now()-interval '5 minutes' where id=$1", [ids.simulated]);
    state.create.mockImplementation(echoSession());
    const result = await createBookingCheckoutSession(ids.simulated, runnerId, {
      requestId: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", kind: "initial", quoteHash: quoteHash(ids.simulated),
    });
    expect(result).toMatchObject({ state: "created" });
    ids.attempt = (result as { attemptId: string }).attemptId;
    const [params, options] = state.create.mock.calls[0];
    expect(params.metadata).toEqual({ bookingId: ids.simulated, attemptId: ids.attempt, paymentKind: "initial", environment: "demo", simulated: "true" });
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
    expect(params.line_items[0].price_data.product_data.name).toMatch(/^SIMULACIÓN – sin cargo real/);
    expect(params.line_items[0].price_data).toMatchObject({ currency: "pen", unit_amount: 93750 });
    expect(params.allowed_payment_method_types).toEqual(["card"]);
    expect(options.idempotencyKey).toBe(`cv-checkout-${ids.simulated}-initial-c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1`);
    const { rows: [row] } = await pool.query("select floor(extract(epoch from b.reservation_expires_at))::bigint as booking_end, a.stripe_mode from bookings b join booking_checkout_attempts a on a.booking_id=b.id where b.id=$1", [ids.simulated]);
    expect(Number(row.booking_end)).toBe(params.expires_at);
    expect(params.expires_at * 1000 - Date.now()).toBeGreaterThan(30 * 60 * 1000);
    expect(row.stripe_mode).toBe("test");
    expect(await capacity()).toEqual({ allocated: 3, simulatedAllocations: 0 });

    // A live key never pays a simulated booking.
    state.mode = "live";
    await expect(createBookingCheckoutSession(ids.simulated, runnerId, {
      requestId: "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2", kind: "initial", quoteHash: quoteHash(ids.simulated),
    })).resolves.toBe("booking_not_found");
  });

  it("refuses to extend a simulated reservation past the maximum hold", async () => {
    await accept(ids.simulatedOther);
    await pool.query("update bookings set reservation_expires_at=now()+interval '10 minutes', created_at=now()-interval '115 minutes' where id=$1", [ids.simulatedOther]);
    await expect(createBookingCheckoutSession(ids.simulatedOther, runnerId, {
      requestId: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3", kind: "initial", quoteHash: quoteHash(ids.simulatedOther),
    })).resolves.toBe("reservation_expired");
    expect(state.create).not.toHaveBeenCalled();
    const { rows: [row] } = await pool.query("select reservation_expires_at - now() < interval '11 minutes' as unchanged from bookings where id=$1", [ids.simulatedOther]);
    expect(row.unchanged).toBe(true);
  });

  it("does not touch data when the attempt's Stripe mode differs from the event's livemode", async () => {
    const { rows: [attempt] } = await pool.query("insert into booking_checkout_attempts(booking_id,request_id,kind,quote_hash,amount_usd,amount_pen_cents,idempotency_key,expires_at,stripe_session_id,checkout_url,status,stripe_mode) values($1,gen_random_uuid(),'initial',$2,250,93750,'cv-checkout-sim-live',now()+interval '30 minutes','cs_test_live_attempt','https://checkout.stripe.test/live','created','live') returning id",
      [ids.simulatedThird, quoteHash(ids.simulatedThird)]);
    const paid = { id: "cs_test_live_attempt", object: "checkout.session", livemode: false, mode: "payment", status: "complete", payment_status: "paid",
      amount_total: 93750, currency: "pen", client_reference_id: ids.simulatedThird, payment_intent: "pi_test_live_attempt",
      metadata: { bookingId: ids.simulatedThird, attemptId: attempt.id, paymentKind: "initial" } };
    const stripe = { checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(paid) } } } as unknown as Stripe;
    const event = { id: "evt_sim_mode_mismatch", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: false,
      data: { object: { id: paid.id, metadata: paid.metadata } } } as unknown as Stripe.Event;
    await expect(handleBookingStripeEvent(event, stripe, "demo")).rejects.toBeInstanceOf(StripeModeMismatchError);
    const { rows: [after] } = await pool.query("select a.status, (select count(*)::int from booking_stripe_settlements where attempt_id=a.id) as settlements, (select count(*)::int from booking_stripe_event_receipts where event_id='evt_sim_mode_mismatch') as receipts from booking_checkout_attempts a where a.id=$1", [attempt.id]);
    expect(after).toEqual({ status: "created", settlements: 0, receipts: 0 });
    expect(await bookingRow(ids.simulatedThird)).toEqual({ status: "pending", is_simulated: true });
    await pool.query("delete from booking_checkout_attempts where id=$1", [attempt.id]);
  });

  it("settles a demo payment as test mode and confirms the simulated booking without a seat", async () => {
    const paid = { id: "cs_test_simulated", object: "checkout.session", livemode: false, mode: "payment", status: "complete", payment_status: "paid",
      amount_total: 93750, currency: "pen", client_reference_id: ids.simulated, payment_intent: "pi_test_simulated",
      metadata: { bookingId: ids.simulated, attemptId: ids.attempt, paymentKind: "initial", environment: "demo", simulated: "true" } };
    const stripe = { checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(paid) } } } as unknown as Stripe;
    const event = { id: "evt_sim_paid", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: false,
      data: { object: { id: paid.id, metadata: paid.metadata } } } as unknown as Stripe.Event;
    await expect(handleBookingStripeEvent(event, stripe, "demo")).resolves.toMatchObject({ outcome: "applied", attemptId: ids.attempt });
    const { rows } = await pool.query("select s.status, s.stripe_mode, a.stripe_mode as attempt_mode, b.status as booking_status, b.is_simulated from booking_stripe_settlements s join booking_checkout_attempts a on a.id=s.attempt_id join bookings b on b.id=s.booking_id where s.booking_id=$1", [ids.simulated]);
    expect(rows).toEqual([{ status: "applied", stripe_mode: "test", attempt_mode: "test", booking_status: "confirmed", is_simulated: true }]);
    expect(await capacity()).toEqual({ allocated: 3, simulatedAllocations: 0 });
  });

  it("cancels simulated bookings on retirement, webhook expiry and the sweep, without touching capacity", async () => {
    const { rows: [pending] } = await pool.query("insert into booking_checkout_attempts(booking_id,request_id,kind,quote_hash,amount_usd,amount_pen_cents,idempotency_key,expires_at,stripe_mode) values($1,gen_random_uuid(),'initial',$2,250,93750,'cv-checkout-sim-retire',now()-interval '1 minute','test') returning id",
      [ids.simulatedOther, quoteHash(ids.simulatedOther)]);
    await expect(retireCheckoutAttempt({ id: pending.id, bookingId: ids.simulatedOther, status: "pending" }, "failed", true)).resolves.toBe(true);
    expect(await bookingRow(ids.simulatedOther)).toEqual({ status: "cancelled", is_simulated: true });

    const { rows: [created] } = await pool.query("insert into booking_checkout_attempts(booking_id,request_id,kind,quote_hash,amount_usd,amount_pen_cents,idempotency_key,expires_at,stripe_session_id,checkout_url,status,stripe_mode) values($1,gen_random_uuid(),'initial',$2,250,93750,'cv-checkout-sim-expire',now()+interval '30 minutes','cs_test_sim_expired','https://checkout.stripe.test/expired','created','test') returning id",
      [ids.simulatedThird, quoteHash(ids.simulatedThird)]);
    const expired = { id: "cs_test_sim_expired", object: "checkout.session", livemode: false, mode: "payment", status: "expired", payment_status: "unpaid",
      amount_total: 93750, currency: "pen", client_reference_id: ids.simulatedThird,
      metadata: { bookingId: ids.simulatedThird, attemptId: created.id, paymentKind: "initial" } };
    const stripe = { checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(expired) } } } as unknown as Stripe;
    const event = { id: "evt_sim_expired", type: "checkout.session.expired", created: Math.floor(Date.now() / 1000), livemode: false,
      data: { object: { id: expired.id, metadata: expired.metadata } } } as unknown as Stripe.Event;
    await expect(handleBookingStripeEvent(event, stripe, "test")).resolves.toMatchObject({ outcome: "expired", attemptId: created.id });
    expect(await bookingRow(ids.simulatedThird)).toEqual({ status: "cancelled", is_simulated: true });

    const abandoned = await persistCheckoutReservation(snapshot(5, true));
    if (typeof abandoned === "string") throw new Error("expected a simulated reservation, got " + abandoned);
    await pool.query("update bookings set reservation_expires_at=now()-interval '1 minute' where id=$1", [abandoned.id]);
    const next = await persistCheckoutReservation(snapshot(6, true));
    expect(typeof next).not.toBe("string");
    expect(await bookingRow(abandoned.id)).toEqual({ status: "cancelled", is_simulated: true });
    // The real booking and its seat are untouched by all of the above.
    expect(await bookingRow(ids.real)).toEqual({ status: "pending", is_simulated: false });
    const { rows: [seat] } = await pool.query("select status from offer_capacity_allocations where booking_id=$1", [ids.real]);
    expect(seat.status).toBe("held");
    expect(await capacity()).toEqual({ allocated: 3, simulatedAllocations: 0 });
  });

  describe("demo participants", () => {
    const routeRequest = (path: string, method = "POST") => new Request(`http://localhost:3001${path}`, {
      method, headers: { origin: "http://localhost:3001", "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined,
    });

    it("are active only while revoked_at is NULL", async () => {
      await expect(isActiveDemoParticipant(runnerId)).resolves.toBe(true);
      await expect(isActiveDemoParticipant(revokedId)).resolves.toBe(false);
      await expect(isActiveDemoParticipant(adminId)).resolves.toBe(false);
    });

    it("a revoked participant gets the disabled 404 on the four checkout routes", async () => {
      state.userId = revokedId;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const bookingParams = { params: Promise.resolve({ bookingId: ids.simulated }) };
        const responses = [
          await preparePost(routeRequest("/api/bookings/checkout/prepare")),
          await sessionPost(routeRequest(`/api/bookings/${ids.simulated}/checkout`), bookingParams as never),
          await stateGet(routeRequest(`/api/bookings/${ids.simulated}/checkout/${ids.attempt}`, "GET"),
            { params: Promise.resolve({ bookingId: ids.simulated, attemptId: ids.attempt }) } as never),
          await acceptancePost(routeRequest(`/api/bookings/${ids.simulated}/contract-acceptance`), bookingParams as never),
        ];
        for (const response of responses) {
          expect(response.status).toBe(404);
          await expect(response.json()).resolves.toEqual({ code: "not_found", requestId: expect.any(String) });
        }
      } finally { warn.mockRestore(); }
    });

    it("an active participant reads the attempt state, marked as simulated", async () => {
      state.userId = runnerId;
      const response = await stateGet(routeRequest(`/api/bookings/${ids.simulated}/checkout/${ids.attempt}`, "GET"),
        { params: Promise.resolve({ bookingId: ids.simulated, attemptId: ids.attempt }) } as never);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: "paid", simulated: true });
    });
  });
});
