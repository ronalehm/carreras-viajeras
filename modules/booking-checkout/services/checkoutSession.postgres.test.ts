// @vitest-environment node
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const stripeMocks = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_ORIGIN: "http://localhost:3001" }) }));
vi.mock("stripe", () => ({ default: class StripeMock {
  checkout = { sessions: { create: stripeMocks.create, retrieve: stripeMocks.retrieve } };
} }));
import { getDb } from "@/lib/db";
import { checkoutQuoteHash } from "./quote.service";
import { createBookingCheckoutSession } from "./checkoutSession.service";
import { handleBookingStripeEvent } from "./bookingWebhook.service";
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
const requestId = "12121212-1212-4121-8121-121212121212";
const quoteHash = checkoutQuoteHash({
  bookingId, kind: "initial", offerVersion: 1, termsVersion: "checkout-session-test-v1",
  amountUsd: 250, amountPenCents: 93750, rateId, rateUsdPen: "3.7500",
});
const balanceHash = checkoutQuoteHash({ bookingId, kind: "balance", offerVersion: 1,
  termsVersion: "checkout-session-test-v1", amountUsd: 750, amountPenCents: 281250,
  rateId, rateUsdPen: "3.7500" });
const canonicalSession = {
  id: sessionId, object: "checkout.session", livemode: false, mode: "payment",
  status: "open", payment_status: "unpaid", amount_total: 93750, currency: "pen",
  client_reference_id: bookingId, metadata: { bookingId, attemptId: "33333333-3333-4333-8333-333333333333", paymentKind: "initial" },
  url: "https://checkout.stripe.test/cs_test_checkout_session",
};

describe.skipIf(!enabled)("checkout session PostgreSQL integration", () => {
  beforeAll(async () => {
    process.env.STRIPE_CHECKOUT_ORIGIN = "http://localhost:3001";
    if (database !== "cv_stripe_checkout_f2_test") throw new Error("unsafe test database");
    const { rows } = await pool.query("select current_database() as name, to_regclass('public.booking_checkout_attempts') as attempts");
    if (rows[0].name !== database || !rows[0].attempts) throw new Error("test DB must have local migrations 0012-0015 applied");
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
    await pool.query("insert into bookings(id,trip_id,participant_name,participant_email,runner_user_id,lead_id,status,offer_version_id,offer_version,offer_terms_version,offer_conditions_snapshot,trip_includes_snapshot,trip_excludes_snapshot,initial_payment_usd,checkout_rate_id,checkout_rate_usd_pen,checkout_amount_pen_cents,checkout_request_id,checkout_input_hash,reservation_expires_at,package_label,total_usd,balance_due_on,created_by) values($1,$2,'Checkout Runner','checkout-runner@example.invalid',$3,$4,'pending',$5,1,'checkout-session-test-v1','Test conditions.',ARRAY['Hotel'],ARRAY['Flights'],250,$6,3.7500,93750,'abababab-abab-4bab-8bab-abababababac',$7,now()+interval '30 minutes','Checkout offer',1000,'2027-01-01',NULL) on conflict(id) do nothing",[bookingId,tripId,runnerId,leadId,offerId,rateId,"c".repeat(64)]);
    await pool.query("insert into booking_contract_acceptances(booking_id,runner_user_id,contract_version_key,contract_document_hash,document_snapshot,document_hash) values($1,$2,'checkout-session-test-v1',$3,'Synthetic approved contract acceptance snapshot for testing.',$4) on conflict(booking_id) do nothing",[bookingId,runnerId,"a".repeat(64),"b".repeat(64)]);
    await pool.query("insert into offer_capacity_counters(offer_version_id,capacity_limit,allocated_count) values($1,2,1) on conflict(offer_version_id) do nothing",[offerId]);
    await pool.query("insert into offer_capacity_allocations(booking_id,offer_version_id,status,expires_at) values($1,$2,'held',now()+interval '30 minutes') on conflict(booking_id) do nothing",[bookingId,offerId]);
    vi.mocked(getDb).mockReturnValue(drizzlePg(pool) as never);
  });
  afterAll(async () => { await pool.end(); });
  it("creates one exact PEN session, persists it, and reuses it on replay", async () => {
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_test_only";
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
    const { rows } = await pool.query("select status,amount_usd,amount_pen_cents,stripe_session_id from booking_checkout_attempts where booking_id=$1",[bookingId]);
    expect(rows).toEqual([{ status: "created", amount_usd: 250, amount_pen_cents: 93750, stripe_session_id: sessionId }]);
  });

  it("settles one canonical payment under repeated Checkout and PaymentIntent events", async () => {
    const { rows: attempts } = await pool.query("select id from booking_checkout_attempts where booking_id=$1", [bookingId]);
    const attemptId = attempts[0].id as string;
    const paidSession = {
      ...canonicalSession, status: "complete", payment_status: "paid", payment_intent: "pi_test_checkout_f2",
      metadata: { bookingId, attemptId, paymentKind: "initial" },
    };
    const stripe = {
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(paidSession), list: vi.fn().mockResolvedValue({ data: [paidSession] }) } },
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_test_checkout_f2", object: "payment_intent", status: "succeeded", livemode: false,
        metadata: { bookingId, attemptId, paymentKind: "initial" } }) },
    } as unknown as Stripe;
    const makeEvent = (id: string, type: string, object: Record<string, unknown>) => ({
      id, type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object },
    }) as unknown as Stripe.Event;
    const checkoutEvent = makeEvent("evt_checkout_settlement_test", "checkout.session.completed", {
      id: sessionId, metadata: paidSession.metadata,
    });
    await expect(handleBookingStripeEvent(checkoutEvent, stripe)).resolves.toBe("processed");
    await expect(handleBookingStripeEvent(checkoutEvent, stripe)).resolves.toBe("duplicate");
    const intentEvent = makeEvent("evt_intent_settlement_test", "payment_intent.succeeded", {
      id: "pi_test_checkout_f2", metadata: paidSession.metadata,
    });
    await expect(handleBookingStripeEvent(intentEvent, stripe)).resolves.toBe("duplicate");
    const { rows: settlements } = await pool.query("select status,expected_amount_pen_cents,received_amount_pen_cents,amount_usd from booking_stripe_settlements where booking_id=$1", [bookingId]);
    expect(settlements).toEqual([{ status: "applied", expected_amount_pen_cents: 93750, received_amount_pen_cents: 93750, amount_usd: 250 }]);
    const { rows: booking } = await pool.query("select status from bookings where id=$1", [bookingId]);
    expect(booking[0].status).toBe("confirmed");
    const { rows: allocation } = await pool.query("select status from offer_capacity_allocations where booking_id=$1", [bookingId]);
    expect(allocation[0].status).toBe("confirmed");

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
});
