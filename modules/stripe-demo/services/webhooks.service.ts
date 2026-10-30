import "server-only";
import Stripe from "stripe";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { WebhookLedger, type StripeSnapshot } from "./webhookLedger";
import { handleBookingStripeEvent, type BookingWebhookResult } from "@/modules/booking-checkout/services/bookingWebhook.service";

const EVENTS = new Set([
 "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
 "payment_intent.succeeded", "payment_intent.processing", "payment_intent.payment_failed", "payment_intent.canceled",
 "invoice.created", "invoice.updated", "invoice.finalized", "invoice.paid", "invoice.payment_succeeded",
 "invoice.payment_failed", "invoice.finalization_failed", "invoice.voided", "invoice.marked_uncollectible",
 "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
 "customer.subscription.paused", "customer.subscription.resumed",
 "charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created",
]);
const HEADERS = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 512 * 1024;
let localLedger: WebhookLedger | undefined;

function getLedger() {
 // shortcut: local SQLite belongs only to this Node demo; use a dedicated durable DB before deployment.
 if (!localLedger) {
  const directory = join(process.cwd(), ".stripe-sandbox");
  mkdirSync(directory, { recursive: true });
  localLedger = new WebhookLedger(join(directory, "webhooks.sqlite"));
 }
 return localLedger;
}
function json(body: Record<string, unknown>, status = 200) { return Response.json(body, { status, headers: HEADERS }); }
function sandbox<T extends { livemode: boolean }>(object: T): T {
 if (object.livemode !== false) throw new Error("Unexpected resource mode");
 return object;
}
function resourceId(value: unknown): string | null {
 if (typeof value === "string") return value;
 if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
 return null;
}
async function readRawBody(request: Request): Promise<string | null> {
 if (!request.body) return "";
 const reader = request.body.getReader();
 const chunks: Uint8Array[] = [];
 let size = 0;
 try {
  while (true) {
   const { done, value } = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 return Buffer.concat(chunks).toString("utf8");
}
async function snapshot(stripe: Stripe, event: Stripe.Event): Promise<StripeSnapshot> {
 const id = resourceId(event.data.object);
 if (!id) throw new Error("Missing Stripe resource");
 if (event.type.startsWith("checkout.session.")) {
  const current = sandbox(await stripe.checkout.sessions.retrieve(id));
  return { id:current.id,type:current.object,status:current.status??"unknown",paymentConfirmed:current.payment_status==="paid",amount:current.amount_total??0,currency:current.currency };
 }
 if (event.type.startsWith("payment_intent.")) {
  const current = sandbox(await stripe.paymentIntents.retrieve(id));
  return { id:current.id,type:current.object,status:current.status,paymentConfirmed:current.status==="succeeded",amount:current.amount_received,currency:current.currency };
 }
 if (event.type.startsWith("invoice.")) {
  const current = sandbox(await stripe.invoices.retrieve(id));
  return { id:current.id,type:current.object,status:current.status??"unknown",paymentConfirmed:current.status==="paid",amount:current.amount_paid,currency:current.currency };
 }
 if (event.type.startsWith("customer.subscription.")) {
  const current = sandbox(await stripe.subscriptions.retrieve(id));
  return { id:current.id,type:current.object,status:current.status,paymentConfirmed:false,amount:0,currency:null };
 }
 if (event.type==="charge.refunded") {
  const current = sandbox(await stripe.charges.retrieve(id));
  return { id:current.id,type:current.object,status:current.refunded?"refunded":current.status,paymentConfirmed:current.paid&&!current.refunded,amount:current.amount_captured,currency:current.currency,refunded:current.amount_refunded,relatedId:resourceId(current.payment_intent) };
 }
 if (event.type==="charge.dispute.created") {
  const current = sandbox(await stripe.disputes.retrieve(id));
  return { id:current.id,type:current.object,status:current.status,paymentConfirmed:false,amount:current.amount,currency:current.currency,relatedId:resourceId(current.payment_intent)??resourceId(current.charge) };
 }
 const current = sandbox(await stripe.radar.earlyFraudWarnings.retrieve(id));
 return { id:current.id,type:current.object,status:"early_fraud_warning",paymentConfirmed:false,amount:0,currency:null,relatedId:resourceId(current.payment_intent)??resourceId(current.charge) };
}

export function createWebhookHandler(dependencies: { stripe: Stripe; signingSecret: string; ledger: () => WebhookLedger;
 bookingProcessor?: (event: Stripe.Event, stripe: Stripe) => Promise<BookingWebhookResult> }) {
 return async (request: Request): Promise<Response> => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({error:"invalid_signature"},400);
  let event: Stripe.Event;
  try {
   const raw = await readRawBody(request);
   if (raw === null) return json({error:"payload_too_large"},413);
   // Stripe must verify the exact original body, before JSON is parsed or anything is persisted.
   event = dependencies.stripe.webhooks.constructEvent(raw,signature,dependencies.signingSecret);
  } catch { return json({error:"invalid_signature"},400); }
  if (event.livemode !== false || event.account || typeof event.id!=="string" || !event.id.startsWith("evt_") || !Number.isSafeInteger(event.created)) {
   return json({error:"sandbox_events_only"},400);
  }
  try {
   if (dependencies.bookingProcessor) {
    const bookingResult = await dependencies.bookingProcessor(event, dependencies.stripe);
    if (bookingResult !== "not_applicable") {
     return json({received:true,duplicate:bookingResult==="duplicate",...(bookingResult==="ignored"&&{ignored:true})});
    }
   }
   const ledger = dependencies.ledger();
   if (ledger.hasEvent(event.id)) return json({received:true,duplicate:true});
   let operationId: string | null = null;
   if (event.type==="payment_intent.succeeded" || event.type==="checkout.session.completed") {
    const id=resourceId(event.data.object);
    if (!id) throw new Error("Missing Stripe resource");
    operationId=ledger.operation(id);
    if (!operationId) {
     // CLI fixtures and unrelated sandbox objects must never create a local payment.
     const applied=ledger.apply(event,null);
     return json({received:true,duplicate:!applied,ignored:true,reason:"no_local_operation"});
    }
   }
   const relevant = EVENTS.has(event.type);
   // Read the canonical Stripe resource. A signed completed event may still represent an unpaid checkout.
   const current = relevant ? await snapshot(dependencies.stripe,event) : null;
   if (current && operationId) current.operationId=operationId;
   const applied = ledger.apply(event,current);
   return json({received:true,duplicate:!applied,...(!relevant&&{ignored:true})});
  } catch (error) {
   // Log stack frames and enum-like codes only: API error messages can contain credentials.
   const details = error as { name?: string; code?: string; statusCode?: number; stack?: string };
   console.error("stripe-webhook: processing failed", {
    eventType:event.type,
    errorName:/^[A-Za-z]{1,80}$/.test(details?.name??"")?details.name:"Error",
    code:/^[a-z_]{1,60}$/.test(details?.code??"")&&!/^(sk|rk|pk|whsec)_/.test(details.code??"")?details.code:undefined,
    statusCode:details?.statusCode,
    frames:details?.stack?.split("\n").slice(1).filter(line=>line.trimStart().startsWith("at ")).slice(0,8),
   });
   return json({error:"webhook_processing_failed"},500);
  }
 };
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
 if (!request.headers.get("stripe-signature")) return json({error:"invalid_signature"},400);
 if (process.env.NODE_ENV==="production") return json({error:"sandbox_local_only"},503);
 const key = process.env.STRIPE_SECRET_KEY;
 const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
 if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key??"") || !/^whsec_[A-Za-z0-9_]+$/.test(signingSecret??"")) {
  return json({error:"stripe_sandbox_not_configured"},503);
 }
 const stripe = new Stripe(key!,{apiVersion:"2026-09-30.endive",timeout:10000,maxNetworkRetries:1});
 return createWebhookHandler({stripe,signingSecret:signingSecret!,ledger:getLedger,bookingProcessor:handleBookingStripeEvent})(request);
}
