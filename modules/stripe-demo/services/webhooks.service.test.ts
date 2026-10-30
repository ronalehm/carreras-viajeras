// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
vi.mock("server-only", () => ({}));
import { createWebhookHandler } from "./webhooks.service";
import { WebhookLedger } from "./webhookLedger";
import { POST } from "@/app/api/webhooks/stripe/route";

const signingSecret = "whsec_synthetic_test_only";
let directory: string;
let ledger: WebhookLedger;
let stripe: Stripe;
beforeEach(() => {
 directory = mkdtempSync(join(tmpdir(), "stripe-webhook-"));
 ledger = new WebhookLedger(join(directory, "events.sqlite"));
 ledger.registerOperation("cs_test", "local-checkout");
 ledger.registerOperation("pi_test", "local-payment");
 stripe = new Stripe("sk_test_synthetic_test_only");
});
afterEach(() => {
 ledger.close(); vi.restoreAllMocks();
 const target = resolve(directory);
 if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1)?.startsWith("stripe-webhook-")) throw new Error("Invalid test cleanup path");
 rmSync(target, { recursive: true, force: true });
});
function payload(id = "evt_test", type = "checkout.session.completed", created = 100) {
 return JSON.stringify({ id, object:"event", type, created, livemode:false, data:{ object:{id:"cs_test",object:"checkout.session",payment_status:"paid"} } });
}
function request(body: string, secret = signingSecret) {
 const signature = stripe.webhooks.generateTestHeaderString({payload:body,secret});
 return new Request("http://localhost:3001/api/webhooks/stripe", {method:"POST",headers:{"stripe-signature":signature},body});
}
function handler() { return createWebhookHandler({ stripe, signingSecret, ledger: () => ledger }); }
function response<T extends object>(object: T): Stripe.Response<T> {
 return Object.assign(object, { lastResponse: { headers: {}, requestId: "req_synthetic", statusCode: 200 } });
}
function checkout(status: string): Stripe.Response<Stripe.Checkout.Session> {
 return response({id:"cs_test",object:"checkout.session",livemode:false,status:"complete",payment_status:status,amount_total:1000,currency:"usd"} as Stripe.Checkout.Session);
}
describe("Stripe sandbox webhook", () => {
 it("exposes the actual POST route and rejects missing signatures with 400", async () => {
  const response = await POST(new Request("http://localhost:3001/api/webhooks/stripe", {method:"POST",body:"{}"}));
  expect(response.status).toBe(400);
 });
 it("validates a signature against the original body and records a paid Checkout", async () => {
  vi.spyOn(stripe.checkout.sessions,"retrieve").mockResolvedValue(checkout("paid"));
  const response = await handler()(request(payload()));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({received:true,duplicate:false});
  expect(ledger.object("cs_test")).toMatchObject({paymentConfirmed:true,amount:1000});
  expect(ledger.hasEvent("evt_test")).toBe(true);
 });
 it("rejects invalid signatures and altered bodies without processing them", async () => {
  expect((await handler()(request(payload(), "whsec_other_test_only"))).status).toBe(400);
  const body = payload();
  const signed = request(body);
  const tampered = new Request(signed.url, {method:"POST",headers:signed.headers,body:body+" "});
  expect((await handler()(tampered)).status).toBe(400);
  expect(ledger.hasEvent("evt_test")).toBe(false);
 });
 it("does not confirm unpaid Checkout events and confirms asynchronous success later", async () => {
  const retrieve = vi.spyOn(stripe.checkout.sessions,"retrieve");
  retrieve.mockResolvedValueOnce(checkout("unpaid")).mockResolvedValueOnce(checkout("paid"));
  await handler()(request(payload()));
  expect(ledger.object("cs_test")?.paymentConfirmed).toBe(false);
  await handler()(request(payload("evt_async","checkout.session.async_payment_succeeded",101)));
  expect(ledger.object("cs_test")?.paymentConfirmed).toBe(true);
 });
 it("deduplicates persistently across reopening the database", async () => {
  const retrieve = vi.spyOn(stripe.checkout.sessions,"retrieve").mockResolvedValue(checkout("paid"));
  await handler()(request(payload()));
  ledger.close(); ledger = new WebhookLedger(join(directory,"events.sqlite"));
  retrieve.mockRejectedValue(new Error("A duplicate must not fetch Stripe again"));
  const response = await handler()(request(payload()));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({duplicate:true});
  expect(ledger.eventCount()).toBe(1);
 });
 it("keeps one receipt for concurrent deliveries", async () => {
  vi.spyOn(stripe.checkout.sessions,"retrieve").mockResolvedValue(checkout("paid"));
  const responses = await Promise.all([handler()(request(payload())), handler()(request(payload()))]);
  expect(responses.map(r=>r.status)).toEqual([200,200]);
  expect(ledger.eventCount()).toBe(1);
 });
 it("returns a retryable 500 without leaking errors or consuming the event", async () => {
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const retrieve = vi.spyOn(stripe.checkout.sessions,"retrieve").mockRejectedValue(new Error("private sk_test_synthetic_internal"));
  const response = await handler()(request(payload()));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("synthetic_internal");
  expect(ledger.hasEvent("evt_test")).toBe(false);
  retrieve.mockResolvedValue(checkout("paid"));
  expect((await handler()(request(payload()))).status).toBe(200);
 });
 it("rejects live events even when the signature is correct", async () => {
  const body = payload().replace('"livemode":false','"livemode":true');
  expect((await handler()(request(body))).status).toBe(400);
  expect(ledger.eventCount()).toBe(0);
 });
 it("records Invoicing state only after retrieving the canonical invoice", async () => {
  const invoice = {id:"in_test",object:"invoice",livemode:false,status:"open",amount_paid:0,currency:"usd"} as Stripe.Invoice;
  vi.spyOn(stripe.invoices,"retrieve").mockResolvedValue(response(invoice));
  const body = JSON.stringify({id:"evt_invoice",type:"invoice.paid",created:100,livemode:false,data:{object:{id:"in_test",object:"invoice",status:"paid"}}});
  expect((await handler()(request(body))).status).toBe(200);
  expect(ledger.object("in_test")).toMatchObject({status:"open",paymentConfirmed:false});
 });
 it("records Billing changes without treating an active subscription as payment", async () => {
  const subscription = {id:"sub_test",object:"subscription",livemode:false,status:"active"} as Stripe.Subscription;
  vi.spyOn(stripe.subscriptions,"retrieve").mockResolvedValue(response(subscription));
  const body = JSON.stringify({id:"evt_subscription",type:"customer.subscription.updated",created:100,livemode:false,data:{object:{id:"sub_test",object:"subscription"}}});
  expect((await handler()(request(body))).status).toBe(200);
  expect(ledger.object("sub_test")).toMatchObject({status:"active",paymentConfirmed:false});
 });
 it("records succeeded PaymentIntents and ignores irrelevant events safely", async () => {
  vi.spyOn(stripe.paymentIntents,"retrieve").mockResolvedValue(response({id:"pi_test",object:"payment_intent",livemode:false,status:"succeeded",amount_received:1500,currency:"usd"} as Stripe.PaymentIntent));
  const body = JSON.stringify({id:"evt_payment",type:"payment_intent.succeeded",created:100,livemode:false,data:{object:{id:"pi_test",object:"payment_intent"}}});
  expect((await handler()(request(body))).status).toBe(200);
  expect(ledger.object("pi_test")).toMatchObject({paymentConfirmed:true,amount:1500});
  const ignored = await handler()(request(payload("evt_ignore","customer.created")));
  expect(ignored.status).toBe(200);
  expect(await ignored.json()).toMatchObject({ignored:true});
 });
 it("does not regress a projection when older events arrive last", () => {
  const newer = {id:"evt_new",type:"invoice.paid",created:200} as Stripe.Event;
  const older = {id:"evt_old",type:"invoice.updated",created:100} as Stripe.Event;
  ledger.apply(newer,{id:"in_order",type:"invoice",status:"paid",paymentConfirmed:true,amount:1000,currency:"usd"});
  ledger.apply(older,{id:"in_order",type:"invoice",status:"open",paymentConfirmed:false,amount:0,currency:"usd"});
  expect(ledger.object("in_order")?.paymentConfirmed).toBe(true);
 });
});

describe("local operation correlation for the two failing events", () => {
 it.each([
  ["payment_intent.succeeded","payment_intent","pi_unowned"],
  ["checkout.session.completed","checkout.session","cs_test_unowned"],
 ])("acknowledges unrelated %s without inventing a payment", async (type,object,id) => {
  vi.spyOn(stripe.checkout.sessions,"retrieve").mockRejectedValue(new Error("Unowned fixture must not be retrieved"));
  vi.spyOn(stripe.paymentIntents,"retrieve").mockRejectedValue(new Error("Unowned fixture must not be retrieved"));
  const body=JSON.stringify({id:"evt_unowned",type,created:100,livemode:false,data:{object:{id,object}}});
  const first=await handler()(request(body));
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({received:true,ignored:true,reason:"no_local_operation",duplicate:false});
  expect(ledger.object(id)).toBeNull();
  const second=await handler()(request(body));
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({duplicate:true});
  expect(ledger.eventCount()).toBe(1);
 });
 it("preserves a retryable failure for a known local payment missing from the configured Stripe account", async () => {
  vi.spyOn(console,"error").mockImplementation(()=>{});
  vi.spyOn(stripe.paymentIntents,"retrieve").mockRejectedValue(Object.assign(new Error("private sk_test_synthetic_private"),{code:"resource_missing",statusCode:404}));
  const body=JSON.stringify({id:"evt_known_missing",type:"payment_intent.succeeded",created:100,livemode:false,data:{object:{id:"pi_test",object:"payment_intent"}}});
  expect((await handler()(request(body))).status).toBe(500);
  expect(ledger.hasEvent("evt_known_missing")).toBe(false);
  expect(ledger.object("pi_test")).toBeNull();
 });
 it("does not overwrite a confirmed checkout with an older read from the same second", () => {
  const newer={id:"evt_paid_same_second",type:"checkout.session.completed",created:200} as Stripe.Event;
  const older={id:"evt_unpaid_same_second",type:"checkout.session.completed",created:200} as Stripe.Event;
  ledger.apply(newer,{id:"cs_test",type:"checkout.session",status:"complete",paymentConfirmed:true,amount:1000,currency:"usd"});
  ledger.apply(older,{id:"cs_test",type:"checkout.session",status:"complete",paymentConfirmed:false,amount:0,currency:"usd"});
  expect(ledger.object("cs_test")?.paymentConfirmed).toBe(true);
  expect(ledger.object("cs_test")?.amount).toBe(1000);
 });
});

describe("successful local PaymentIntent duplicate", () => {
 it("records one projection for repeated deliveries and distinct events for the same payment", async () => {
  vi.spyOn(stripe.paymentIntents,"retrieve").mockResolvedValue(response({id:"pi_test",object:"payment_intent",livemode:false,status:"succeeded",amount_received:1500,currency:"usd"} as Stripe.PaymentIntent));
  const make=(id:string)=>JSON.stringify({id,type:"payment_intent.succeeded",created:100,livemode:false,data:{object:{id:"pi_test",object:"payment_intent"}}});
  expect((await handler()(request(make("evt_pi_one")))).status).toBe(200);
  const duplicate=await handler()(request(make("evt_pi_one")));
  expect(await duplicate.json()).toMatchObject({duplicate:true});
  expect((await handler()(request(make("evt_pi_two")))).status).toBe(200);
  expect(ledger.object("pi_test")).toMatchObject({amount:1500,operationId:"local-payment"});
  expect(ledger.eventCount()).toBe(2);
 });
});
