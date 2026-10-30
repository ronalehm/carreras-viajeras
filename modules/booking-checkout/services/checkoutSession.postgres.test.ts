// @vitest-environment node
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const stripeMocks = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/env")>(),
  getEnv: () => ({ APP_ORIGIN: "http://localhost:3001" }),
  // Real bookings: these cases cover seats and settlements in live mode (the mocked Stripe never
  // reaches the network). Simulated bookings are covered in simulatedCheckout.postgres.test.ts.
  getStripeCheckoutConfig: () => ({ enabled: true, mode: "live", secretKey: "sk_live_synthetic_test_only",
    webhookSecret: null, allowDraftContracts: false, disabledReason: null }),
}));
vi.mock("stripe", () => ({ default: class StripeMock {
  checkout = { sessions: { create: stripeMocks.create, retrieve: stripeMocks.retrieve } };
} }));
import { getDb } from "@/lib/db";
import { checkoutQuoteHash } from "./quote.service";
import { createBookingCheckoutSession } from "./checkoutSession.service";
import { handleBookingStripeEvent } from "./bookingWebhook.service";
import { retireCheckoutAttempt } from "./checkoutAttempts.service";
import type Stripe from "stripe";

const enabled = process.env.CHECKOUT_POSTGRES_TESTS === "true";
const database = "cv_stripe_checkout_f2_test";
const pool = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", database });
const adminId = "checkout-f2-admin";
const runnerId = "checkout-session-runner";
const tripId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const offerId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const rateId = "abababab-abab-4bab-8bab-abababababab";
const leadId = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const bookingId = "dededede-dede-4ede-8ede-dededededede";
const sessionId = "cs_test_checkout_session";
const heldBookingId = "fafafafa-fafa-4afa-8afa-fafafafafafa";
const heldLeadId = "cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb";
const requestId = "12121212-1212-4121-8121-121212121212";
const quoteHash = checkoutQuoteHash({
  bookingId, kind: "initial", offerVersion: 1, termsVersion: "checkout-session-test-v1",
  amountUsd: 250, amountPenCents: 93750, rateId, rateUsdPen: "3.7500",
});
const balanceHash = checkoutQuoteHash({ bookingId, kind: "balance", offerVersion: 1,
  termsVersion: "checkout-session-test-v1", amountUsd: 750, amountPenCents: 281250,
  rateId, rateUsdPen: "3.7500" });
const canonicalSession = {
  id: sessionId, object: "checkout.session", livemode: true, mode: "payment",
  status: "open", payment_status: "unpaid", amount_total: 93750, currency: "pen",
  client_reference_id: bookingId, metadata: { bookingId, attemptId: "33333333-3333-4333-8333-333333333333", paymentKind: "initial" },
  url: "https://checkout.stripe.test/cs_test_checkout_session",
};

describe.skipIf(!enabled)("checkout session PostgreSQL integration", () => {
  beforeAll(async () => {
    if (database !== "cv_stripe_checkout_f2_test") throw new Error("unsafe test database");
    const { rows } = await pool.query("select current_database() as name, to_regclass('public.booking_checkout_attempts') as attempts");
    if (rows[0].name !== database || !rows[0].attempts) throw new Error("test DB must have local migrations 0012-0015 applied");
    await pool.query("delete from booking_stripe_event_receipts where attempt_id in (select id from booking_checkout_attempts where booking_id=$1)",[heldBookingId]);
    await pool.query("delete from offer_capacity_allocations where booking_id=$1",[heldBookingId]);
    await pool.query("delete from booking_contract_acceptances where booking_id=$1",[heldBookingId]);
    await pool.query("delete from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
    await pool.query("delete from bookings where id=$1",[heldBookingId]);
    await pool.query("delete from booking_stripe_settlements where booking_id=$1",[bookingId]);
    await pool.query("delete from booking_stripe_event_receipts where attempt_id in (select id from booking_checkout_attempts where booking_id=$1)",[bookingId]);
    await pool.query("delete from booking_checkout_attempts where booking_id=$1",[bookingId]);
    await pool.query("update bookings set status='pending',reservation_expires_at=now()+interval '30 minutes' where id=$1",[bookingId]);
    await pool.query("update offer_capacity_allocations set status='held',released_at=NULL,expires_at=now()+interval '30 minutes' where booking_id=$1",[bookingId]);
    await pool.query("update offer_capacity_counters set allocated_count=1 where offer_version_id=$1",[offerId]);
    await pool.query("insert into profiles(user_id,email) values($1,'checkout-admin@example.invalid') on conflict do nothing",[adminId]);
    await pool.query("insert into profiles(user_id,email) values($1,'checkout-runner@example.invalid') on conflict do nothing",[runnerId]);
    await pool.query("insert into trips(id,slug,title,city,country,race_date,distances,summary,includes,excludes,status) values($1,'checkout-session-test-trip','Carrera checkout session','Lima','Peru','2027-06-01',ARRAY['21K'],'Test trip',ARRAY['Hotel'],ARRAY['Flights'],'published') on conflict(id) do nothing",[tripId]);
    await pool.query("insert into exchange_rates(id,usd_pen,created_by) values($1,3.7500,$2) on conflict(id) do nothing",[rateId,adminId]);
    await pool.query("insert into trip_offers(id,trip_id,version,status,name,total_price_usd,discount_usd,deposit_options_usd,balance_due_on,valid_from,capacity_limit,terms_version,conditions,created_by,approved_by,approved_at,activated_by,activated_at) values($1,$2,1,'active','Checkout offer',1000,0,ARRAY[250],'2027-01-01','2026-01-01',2,'checkout-session-test-v1','Test conditions.',$3,$3,now(),$3,now()) on conflict(id) do nothing",[offerId,tripId,adminId]);
    await pool.query("insert into leads(id,full_name,phone,email,trip_id,source,consent_version) values($1,'Checkout Runner','+51999999998','checkout-runner@example.invalid',$2,'web_form','test-v1') on conflict(id) do nothing",[leadId,tripId]);
    await pool.query("insert into contract_versions(version_key,title,body,status,document_hash,created_by,approved_by,approved_at) values('checkout-session-test-v1','Checkout terms','Approved synthetic contract terms for isolated checkout tests.','approved',$1,$2,$2,now()) on conflict(version_key) do nothing",["a".repeat(64),adminId]);
    await pool.query("insert into bookings(id,trip_id,participant_name,participant_email,runner_user_id,lead_id,status,offer_version_id,offer_version,offer_terms_version,offer_conditions_snapshot,trip_includes_snapshot,trip_excludes_snapshot,initial_payment_usd,checkout_rate_id,checkout_rate_usd_pen,checkout_amount_pen_cents,checkout_request_id,checkout_input_hash,reservation_expires_at,package_label,total_usd,balance_due_on,created_by) values($1,$2,'Checkout Runner','checkout-runner@example.invalid',$3,$4,'pending',$5,1,'checkout-session-test-v1','Test conditions.',ARRAY['Hotel'],ARRAY['Flights'],250,$6,3.7500,93750,'abababab-abab-4bab-8bab-abababababac',$7,now()+interval '30 minutes','Checkout offer',1000,'2027-01-01',$3) on conflict(id) do nothing",[bookingId,tripId,runnerId,leadId,offerId,rateId,"c".repeat(64)]);
    await pool.query("insert into booking_contract_acceptances(booking_id,runner_user_id,contract_version_key,contract_document_hash,document_snapshot,document_hash) values($1,$2,'checkout-session-test-v1',$3,'Synthetic approved contract acceptance snapshot for testing.',$4) on conflict(booking_id) do nothing",[bookingId,runnerId,"a".repeat(64),"b".repeat(64)]);
    await pool.query("insert into offer_capacity_counters(offer_version_id,capacity_limit,allocated_count) values($1,2,1) on conflict(offer_version_id) do nothing",[offerId]);
    await pool.query("insert into offer_capacity_allocations(booking_id,offer_version_id,status,expires_at) values($1,$2,'held',now()+interval '30 minutes') on conflict(booking_id) do nothing",[bookingId,offerId]);
    vi.mocked(getDb).mockReturnValue(drizzlePg(pool) as never);
  });
  afterAll(async () => { await pool.end(); });
  it("creates one exact PEN session, persists it, and reuses it on replay", async () => {
    stripeMocks.create.mockReset().mockImplementation(async (params: { metadata: Record<string, string>; client_reference_id: string }) => ({
      ...canonicalSession, metadata: params.metadata, client_reference_id: params.client_reference_id,
    }));
    const input = { requestId, kind: "initial" as const, quoteHash };
    const first = await createBookingCheckoutSession(bookingId, runnerId, input);
    expect(first).toMatchObject({ state: "created", checkoutUrl: canonicalSession.url });
    const createdAttemptId = (first as { attemptId: string }).attemptId;
    stripeMocks.retrieve.mockReset().mockResolvedValue({
      ...canonicalSession, metadata: { ...canonicalSession.metadata, attemptId: createdAttemptId },
    });
    expect(stripeMocks.create).toHaveBeenCalledTimes(1);
    const [params, options] = stripeMocks.create.mock.calls[0];
    expect(params.line_items[0].price_data).toMatchObject({ currency: "pen", unit_amount: 93750 });
    expect(params.payment_intent_data.metadata).toMatchObject({ bookingId, paymentKind: "initial" });
    expect(options.idempotencyKey).toContain(bookingId);
    const replay = await createBookingCheckoutSession(bookingId, runnerId, { ...input, requestId: "13131313-1313-4131-8131-131313131313" });
    expect(replay).toMatchObject({ state: "reused", attemptId: createdAttemptId, checkoutUrl: canonicalSession.url });
    expect(stripeMocks.create).toHaveBeenCalledTimes(1);
    await expect(createBookingCheckoutSession(bookingId, runnerId, {
      requestId: "14141414-1414-4141-8141-141414141414", kind: "balance", quoteHash: balanceHash,
    })).resolves.toBe("balance_not_due");
    expect(stripeMocks.create).toHaveBeenCalledTimes(1);
    const { rows } = await pool.query("select status,amount_usd,amount_pen_cents,stripe_session_id,stripe_mode from booking_checkout_attempts where booking_id=$1",[bookingId]);
    expect(rows).toEqual([{ status: "created", amount_usd: 250, amount_pen_cents: 93750, stripe_session_id: sessionId, stripe_mode: "live" }]);
    expect(params.metadata).toEqual({ bookingId, attemptId: createdAttemptId, paymentKind: "initial" });
  });

  it("settles one canonical payment under repeated Checkout and PaymentIntent events, delivered after the deadline", async () => {
    const { rows: attempts } = await pool.query("select id from booking_checkout_attempts where booking_id=$1", [bookingId]);
    const attemptId = attempts[0].id as string;
    const paidSession = {
      ...canonicalSession, status: "complete", payment_status: "paid", payment_intent: "pi_test_checkout_f2",
      metadata: { bookingId, attemptId, paymentKind: "initial" },
    };
    const stripe = {
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(paidSession), list: vi.fn().mockResolvedValue({ data: [paidSession] }) } },
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_test_checkout_f2", object: "payment_intent", status: "succeeded", livemode: true,
        metadata: { bookingId, attemptId, paymentKind: "initial" } }) },
    } as unknown as Stripe;
    // Paid five minutes ago, before the reservation deadline, but delivered once it has passed.
    const paidAt = Math.floor(Date.now() / 1000) - 300;
    await pool.query("update bookings set reservation_expires_at=to_timestamp($2) where id=$1", [bookingId, paidAt + 60]);
    const makeEvent = (id: string, type: string, object: Record<string, unknown>) => ({
      id, type, created: paidAt, livemode: true, data: { object },
    }) as unknown as Stripe.Event;
    const checkoutEvent = makeEvent("evt_checkout_settlement_test", "checkout.session.completed", {
      id: sessionId, metadata: paidSession.metadata,
    });
    await expect(handleBookingStripeEvent(checkoutEvent, stripe, "live")).resolves.toMatchObject({ outcome: "applied" });
    await expect(handleBookingStripeEvent(checkoutEvent, stripe, "live")).resolves.toMatchObject({ outcome: "duplicate" });
    const intentEvent = makeEvent("evt_intent_settlement_test", "payment_intent.succeeded", {
      id: "pi_test_checkout_f2", metadata: paidSession.metadata,
    });
    await expect(handleBookingStripeEvent(intentEvent, stripe, "live")).resolves.toMatchObject({ outcome: "duplicate" });
    const { rows: settlements } = await pool.query("select status,expected_amount_pen_cents,received_amount_pen_cents,amount_usd,stripe_mode from booking_stripe_settlements where booking_id=$1", [bookingId]);
    expect(settlements).toEqual([{ status: "applied", expected_amount_pen_cents: 93750, received_amount_pen_cents: 93750, amount_usd: 250, stripe_mode: "live" }]);
    const { rows: booking } = await pool.query("select status from bookings where id=$1", [bookingId]);
    expect(booking[0].status).toBe("confirmed");
    const { rows: allocation } = await pool.query("select status from offer_capacity_allocations where booking_id=$1", [bookingId]);
    expect(allocation[0].status).toBe("confirmed");

    const refundEvent = makeEvent("evt_refund_settlement_test", "charge.refunded", {
      id: "ch_test_checkout_f2", object: "charge", livemode: true, payment_intent: "pi_test_checkout_f2",
    });
    await expect(handleBookingStripeEvent(refundEvent, stripe, "live")).resolves.toMatchObject({ outcome: "needs_review", attemptId, bookingId });
    await expect(handleBookingStripeEvent(refundEvent, stripe, "live")).resolves.toMatchObject({ outcome: "duplicate" });
    const { rows: reviewed } = await pool.query("select s.status, b.status as booking_status from booking_stripe_settlements s join bookings b on b.id=s.booking_id where s.booking_id=$1", [bookingId]);
    expect(reviewed).toEqual([{ status: "needs_review", booking_status: "confirmed" }]);
    await pool.query("update booking_stripe_settlements set status='applied' where booking_id=$1", [bookingId]);

    stripeMocks.create.mockImplementation(async (params: { metadata: Record<string, string>; client_reference_id: string;
      line_items: { price_data: { unit_amount: number } }[] }) => ({
      ...canonicalSession, id: "cs_test_checkout_balance", status: "open", payment_status: "unpaid",
      amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata,
      client_reference_id: params.client_reference_id, url: "https://checkout.stripe.test/cs_test_checkout_balance",
    }));
    const balance = await createBookingCheckoutSession(bookingId, runnerId, {
      requestId: "15151515-1515-4151-8151-151515151515", kind: "balance", quoteHash: balanceHash,
    });
    expect(balance).toMatchObject({ state: "created", checkoutUrl: "https://checkout.stripe.test/cs_test_checkout_balance" });
    const balanceCall = stripeMocks.create.mock.calls.at(-1);
    if (!balanceCall) throw new Error("Stripe mock was not called for the balance session");
    const [balanceParams] = balanceCall;
    expect(balanceParams.line_items[0].price_data).toMatchObject({ currency: "pen", unit_amount: 281250 });
  });

  it("retires a balance attempt whose Session expired without a webhook and opens a new one", async () => {
    const { rows: before } = await pool.query("select id from booking_checkout_attempts where booking_id=$1 and kind='balance' and status='created'", [bookingId]);
    expect(before).toHaveLength(1);
    const staleId = before[0].id as string;
    stripeMocks.retrieve.mockReset().mockResolvedValue({
      ...canonicalSession, id: "cs_test_checkout_balance", status: "expired", amount_total: 281250,
      metadata: { bookingId, attemptId: staleId, paymentKind: "balance" },
    });
    stripeMocks.create.mockReset().mockImplementation(async (params: { metadata: Record<string, string>; client_reference_id: string; expires_at: number;
      line_items: { price_data: { unit_amount: number } }[] }) => ({
      ...canonicalSession, id: "cs_test_checkout_balance_2", amount_total: params.line_items[0].price_data.unit_amount,
      metadata: params.metadata, client_reference_id: params.client_reference_id, expires_at: params.expires_at,
      url: "https://checkout.stripe.test/cs_test_checkout_balance_2",
    }));
    const result = await createBookingCheckoutSession(bookingId, runnerId, {
      requestId: "16161616-1616-4161-8161-161616161616", kind: "balance", quoteHash: balanceHash,
    });
    expect(result).toMatchObject({ state: "created", checkoutUrl: "https://checkout.stripe.test/cs_test_checkout_balance_2" });
    const sentExpiry = stripeMocks.create.mock.calls[0][0].expires_at * 1000 - Date.now();
    expect(sentExpiry).toBeGreaterThan(30 * 60 * 1000);
    const { rows } = await pool.query("select id,status from booking_checkout_attempts where booking_id=$1 and kind='balance' order by created_at", [bookingId]);
    expect(rows.map(row => row.status)).toEqual(["expired", "created"]);
    const { rows: booking } = await pool.query("select b.status, a.status as allocation from bookings b join offer_capacity_allocations a on a.booking_id=b.id where b.id=$1", [bookingId]);
    expect(booking[0]).toEqual({ status: "confirmed", allocation: "confirmed" });
  });

  it("fails an initial attempt stuck without a Session past its deadline and releases its seat once", async () => {
    await pool.query("insert into leads(id,full_name,phone,email,trip_id,source,consent_version) values($1,'Held Runner','+51999999997','held-runner@example.invalid',$2,'web_form','test-v1') on conflict(id) do nothing",[heldLeadId,tripId]);
    await pool.query("insert into bookings(id,trip_id,participant_name,participant_email,runner_user_id,lead_id,status,offer_version_id,offer_version,offer_terms_version,offer_conditions_snapshot,trip_includes_snapshot,trip_excludes_snapshot,initial_payment_usd,checkout_rate_id,checkout_rate_usd_pen,checkout_amount_pen_cents,checkout_request_id,checkout_input_hash,reservation_expires_at,package_label,total_usd,balance_due_on,created_by) values($1,$2,'Held Runner','held-runner@example.invalid',$3,$4,'pending',$5,1,'checkout-session-test-v1','Test conditions.',ARRAY['Hotel'],ARRAY['Flights'],250,$6,3.7500,93750,'abababab-abab-4bab-8bab-abababababad',$7,now()-interval '1 minute','Checkout offer',1000,'2027-01-01',$3)",[heldBookingId,tripId,runnerId,heldLeadId,offerId,rateId,"d".repeat(64)]);
    await pool.query("insert into booking_contract_acceptances(booking_id,runner_user_id,contract_version_key,contract_document_hash,document_snapshot,document_hash) values($1,$2,'checkout-session-test-v1',$3,'Synthetic approved contract acceptance snapshot for testing.',$4)",[heldBookingId,runnerId,"a".repeat(64),"b".repeat(64)]);
    await pool.query("update offer_capacity_counters set allocated_count=allocated_count+1 where offer_version_id=$1",[offerId]);
    await pool.query("insert into offer_capacity_allocations(booking_id,offer_version_id,status,expires_at) values($1,$2,'held',now()-interval '1 minute')",[heldBookingId,offerId]);
    const heldHash = checkoutQuoteHash({ bookingId: heldBookingId, kind: "initial", offerVersion: 1, termsVersion: "checkout-session-test-v1",
      amountUsd: 250, amountPenCents: 93750, rateId, rateUsdPen: "3.7500" });
    await pool.query("insert into booking_checkout_attempts(booking_id,request_id,kind,quote_hash,amount_usd,amount_pen_cents,idempotency_key,expires_at,stripe_mode) values($1,'17171717-1717-4171-8171-171717171717','initial',$2,250,93750,'cv-checkout-held-stuck',now()-interval '1 minute','live')",[heldBookingId,heldHash]);
    const { rows: [counterBefore] } = await pool.query("select allocated_count from offer_capacity_counters where offer_version_id=$1",[offerId]);
    stripeMocks.create.mockReset();
    stripeMocks.retrieve.mockReset();
    const input = { requestId: "18181818-1818-4181-8181-181818181818", kind: "initial" as const, quoteHash: heldHash };
    await expect(createBookingCheckoutSession(heldBookingId, runnerId, input)).resolves.toBe("reservation_expired");
    await expect(createBookingCheckoutSession(heldBookingId, runnerId, { ...input, requestId: "19191919-1919-4191-8191-191919191919" }))
      .resolves.toBe("booking_not_found");
    expect(stripeMocks.create).not.toHaveBeenCalled();
    const { rows: [state] } = await pool.query("select b.status, a.status as allocation, (select status from booking_checkout_attempts where booking_id=b.id) as attempt from bookings b join offer_capacity_allocations a on a.booking_id=b.id where b.id=$1",[heldBookingId]);
    expect(state).toEqual({ status: "cancelled", allocation: "released", attempt: "failed" });
    const { rows: [counterAfter] } = await pool.query("select allocated_count from offer_capacity_counters where offer_version_id=$1",[offerId]);
    expect(counterAfter.allocated_count).toBe(counterBefore.allocated_count - 1);
  });

  it("extends a short reservation once to Stripe's minimum and refuses past the maximum hold", async () => {
    await pool.query("delete from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
    await pool.query("update bookings set status='pending',reservation_expires_at=now()+interval '10 minutes',created_at=now()-interval '5 minutes' where id=$1",[heldBookingId]);
    await pool.query("update offer_capacity_allocations set status='held',released_at=NULL,expires_at=now()+interval '10 minutes' where booking_id=$1",[heldBookingId]);
    const heldHash = checkoutQuoteHash({ bookingId: heldBookingId, kind: "initial", offerVersion: 1, termsVersion: "checkout-session-test-v1",
      amountUsd: 250, amountPenCents: 93750, rateId, rateUsdPen: "3.7500" });
    stripeMocks.create.mockReset().mockImplementation(async (params: { metadata: Record<string, string>; client_reference_id: string; expires_at: number }) => ({
      ...canonicalSession, id: "cs_test_checkout_held", metadata: params.metadata, client_reference_id: params.client_reference_id,
      expires_at: params.expires_at, url: "https://checkout.stripe.test/cs_test_checkout_held",
    }));
    await expect(createBookingCheckoutSession(heldBookingId, runnerId, {
      requestId: "20202020-2020-4202-8202-202020202020", kind: "initial", quoteHash: heldHash,
    })).resolves.toMatchObject({ state: "created" });
    const sent = stripeMocks.create.mock.calls[0][0].expires_at as number;
    const { rows: [row] } = await pool.query("select floor(extract(epoch from b.reservation_expires_at))::bigint as booking_end, floor(extract(epoch from a.expires_at))::bigint as hold_end from bookings b join offer_capacity_allocations a on a.booking_id=b.id where b.id=$1",[heldBookingId]);
    expect(Number(row.booking_end)).toBe(sent);
    expect(Number(row.hold_end)).toBe(sent);
    expect(sent * 1000 - Date.now()).toBeGreaterThan(30 * 60 * 1000);
    expect(sent * 1000 - Date.now()).toBeLessThan(33 * 60 * 1000);

    await pool.query("delete from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
    await pool.query("update bookings set reservation_expires_at=now()+interval '10 minutes',created_at=now()-interval '115 minutes' where id=$1",[heldBookingId]);
    stripeMocks.create.mockClear();
    await expect(createBookingCheckoutSession(heldBookingId, runnerId, {
      requestId: "21212121-2121-4212-8212-212121212121", kind: "initial", quoteHash: heldHash,
    })).resolves.toBe("reservation_expired");
    expect(stripeMocks.create).not.toHaveBeenCalled();
    const { rows: [unchanged] } = await pool.query("select reservation_expires_at - now() < interval '11 minutes' as unchanged from bookings where id=$1",[heldBookingId]);
    expect(unchanged.unchanged).toBe(true);
  });

  describe("seat release and extension guards", () => {
    const heldHash = checkoutQuoteHash({ bookingId: heldBookingId, kind: "initial", offerVersion: 1, termsVersion: "checkout-session-test-v1",
      amountUsd: 250, amountPenCents: 93750, rateId, rateUsdPen: "3.7500" });
    // Booking and seat in the given states, with one pending initial attempt (optionally with a Session).
    async function heldState(bookingStatus: string, allocationStatus: string, minutes: number, sessionIdForAttempt: string | null = null) {
      await pool.query("delete from booking_stripe_event_receipts where attempt_id in (select id from booking_checkout_attempts where booking_id=$1)",[heldBookingId]);
      await pool.query("delete from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
      await pool.query("update bookings set status=$2,reservation_expires_at=now()+make_interval(mins=>$3),created_at=now()-interval '5 minutes' where id=$1",[heldBookingId,bookingStatus,minutes]);
      await pool.query("update offer_capacity_allocations set status=$2::offer_capacity_allocation_status,released_at=CASE WHEN $2::offer_capacity_allocation_status='released' THEN now() END,expires_at=now()+make_interval(mins=>$3) where booking_id=$1",[heldBookingId,allocationStatus,minutes]);
      const { rows: [created] } = await pool.query("insert into booking_checkout_attempts(booking_id,request_id,kind,quote_hash,amount_usd,amount_pen_cents,idempotency_key,expires_at,stripe_session_id,checkout_url,status,stripe_mode) values($1,gen_random_uuid(),'initial',$2,250,93750,'cv-checkout-guard-'||gen_random_uuid(),now()+make_interval(mins=>$3),$4,$5,$6,'live') returning id",
        [heldBookingId,heldHash,minutes,sessionIdForAttempt,sessionIdForAttempt && `https://checkout.stripe.test/${sessionIdForAttempt}`,sessionIdForAttempt ? "created" : "pending"]);
      return created.id as string;
    }
    async function seatState() {
      const { rows: [row] } = await pool.query("select b.status, a.status as allocation, (select allocated_count from offer_capacity_counters where offer_version_id=$2) as allocated, (select status from booking_checkout_attempts where booking_id=b.id) as attempt, (select stripe_session_id from booking_checkout_attempts where booking_id=b.id) as session from bookings b join offer_capacity_allocations a on a.booking_id=b.id where b.id=$1",[heldBookingId,offerId]);
      return row as { status: string; allocation: string; allocated: number; attempt: string; session: string | null };
    }

    it("keeps the seat of a booking confirmed by hand when its stale attempt is retired", async () => {
      await heldState("confirmed", "held", -1);
      const before = await seatState();
      stripeMocks.create.mockReset();
      await expect(createBookingCheckoutSession(heldBookingId, runnerId, {
        requestId: "22222222-2222-4222-8222-222222222223", kind: "initial", quoteHash: heldHash,
      })).resolves.toBe("reservation_expired");
      expect(stripeMocks.create).not.toHaveBeenCalled();
      expect(await seatState()).toEqual({ ...before, status: "confirmed", allocation: "held", attempt: "failed" });
    });

    it("does not release the seat when the CRM confirms the booking while the attempt is being retired", async () => {
      const attemptId = await heldState("pending", "held", -1);
      const before = await seatState();
      const crm = await pool.connect();
      try {
        await crm.query("begin");
        await crm.query("update bookings set status='confirmed', updated_at=now() where id=$1", [heldBookingId]);
        const retiring = retireCheckoutAttempt({ id: attemptId, bookingId: heldBookingId, status: "pending" }, "failed", true);
        // The retirement must wait on the CRM's row lock before the CRM commits.
        const deadline = Date.now() + 10_000;
        for (;;) {
          const { rows: [waiting] } = await pool.query("select count(*)::int as n from pg_stat_activity where datname=$1 and wait_event_type='Lock' and query like '%pending_booking AS MATERIALIZED%'", [database]);
          if (waiting.n > 0) break;
          if (Date.now() > deadline) throw new Error("retirement did not wait for the booking lock");
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        await crm.query("commit");
        await expect(retiring).resolves.toBe(true);
      } finally { crm.release(); }
      expect(await seatState()).toEqual({ ...before, status: "confirmed", allocation: "held", attempt: "failed" });
    });

    it("keeps the seat when Stripe expires the Session of a booking confirmed by hand", async () => {
      const attemptId = await heldState("confirmed", "held", 20, "cs_test_checkout_guard");
      const before = await seatState();
      const expired = {
        ...canonicalSession, id: "cs_test_checkout_guard", status: "expired", client_reference_id: heldBookingId,
        metadata: { bookingId: heldBookingId, attemptId, paymentKind: "initial" },
      };
      const stripe = { checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(expired) } } } as unknown as Stripe;
      const event = { id: "evt_guard_expired", type: "checkout.session.expired", created: Math.floor(Date.now() / 1000), livemode: true,
        data: { object: { id: expired.id, metadata: expired.metadata } } } as unknown as Stripe.Event;
      await expect(handleBookingStripeEvent(event, stripe, "live")).resolves.toMatchObject({ outcome: "expired", attemptId });
      expect(await seatState()).toEqual({ ...before, status: "confirmed", allocation: "held", attempt: "expired" });
      const { rows: receipts } = await pool.query("select outcome from booking_stripe_event_receipts where event_id='evt_guard_expired'");
      expect(receipts).toEqual([{ outcome: "expired" }]);
    });

    it("does not extend a pending reservation whose seat is no longer held", async () => {
      await heldState("pending", "released", 10);
      await pool.query("delete from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
      const { rows: [before] } = await pool.query("select reservation_expires_at from bookings where id=$1",[heldBookingId]);
      stripeMocks.create.mockReset();
      await expect(createBookingCheckoutSession(heldBookingId, runnerId, {
        requestId: "23232323-2323-4232-8232-232323232323", kind: "initial", quoteHash: heldHash,
      })).resolves.toBe("reservation_expired");
      expect(stripeMocks.create).not.toHaveBeenCalled();
      const { rows: [after] } = await pool.query("select reservation_expires_at, (select count(*)::int from booking_checkout_attempts where booking_id=$1) as attempts from bookings where id=$1",[heldBookingId]);
      expect(after).toEqual({ reservation_expires_at: before.reservation_expires_at, attempts: 0 });
    });

    it("answers attempt_conflict and logs the Session id when the attempt changed while Stripe created it", async () => {
      await heldState("pending", "held", 40);
      await pool.query("delete from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      stripeMocks.create.mockReset().mockImplementation(async (params: { metadata: Record<string, string>; client_reference_id: string; expires_at: number }) => {
        // A concurrent retirement (or webhook) moves the attempt on before the Session is recorded.
        await pool.query("update booking_checkout_attempts set status='failed', updated_at=now() where booking_id=$1 and status='pending'", [heldBookingId]);
        return { ...canonicalSession, id: "cs_test_checkout_unrecorded", metadata: params.metadata,
          client_reference_id: params.client_reference_id, expires_at: params.expires_at, url: "https://checkout.stripe.test/cs_test_checkout_unrecorded" };
      });
      try {
        await expect(createBookingCheckoutSession(heldBookingId, runnerId, {
          requestId: "24242424-2424-4242-8242-242424242424", kind: "initial", quoteHash: heldHash,
        })).resolves.toBe("attempt_conflict");
        const { rows: [attempt] } = await pool.query("select id, status, stripe_session_id, checkout_url from booking_checkout_attempts where booking_id=$1",[heldBookingId]);
        expect(attempt).toMatchObject({ status: "failed", stripe_session_id: null, checkout_url: null });
        expect(warn).toHaveBeenCalledWith("booking checkout: session not recorded", {
          bookingId: heldBookingId, attemptId: attempt.id, stripeSessionId: "cs_test_checkout_unrecorded", alert: true,
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("held-runner@example.invalid");
      } finally { warn.mockRestore(); }
    });
  });
});
