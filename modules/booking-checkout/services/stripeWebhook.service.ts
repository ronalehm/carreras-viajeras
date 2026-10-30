import "server-only";
import Stripe from "stripe";
import { getStripeCheckoutConfig, type StripeMode } from "@/lib/env";
import { handleBookingStripeEvent, type BookingWebhookOutcome } from "./bookingWebhook.service";

const HEADERS = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 512 * 1024;

type WebhookLogResult = BookingWebhookOutcome | "error";
type StripeWebhookDependencies = {
  stripe: Stripe;
  webhookSecret: string;
  mode: StripeMode;
  processEvent?: typeof handleBookingStripeEvent;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

// One line per event, with identifiers and the result only: no PII, amounts or payload.
function logEvent(
  event: Stripe.Event, result: WebhookLogResult, attemptId: string | null = null, bookingId: string | null = null,
  error?: ReturnType<typeof errorDetails>,
) {
  const entry = { eventId: event.id, eventType: event.type, attemptId, bookingId, result, ...error };
  if (result === "error") console.error("stripe-webhook: event failed", entry);
  else if (result === "needs_review") console.warn("stripe-webhook: settlement needs review", { ...entry, alert: true });
  else console.info("stripe-webhook: event processed", entry);
}

// Log the error name and an enum-like code only: Stripe and driver messages can carry
// credentials, SQL or customer data, and the spec keeps stack traces out of logs.
function errorDetails(error: unknown) {
  const details = error as { name?: string; code?: string; statusCode?: number } | null;
  return {
    errorName: /^[A-Za-z]{1,80}$/.test(details?.name ?? "") ? details!.name : "Error",
    code: /^[a-z_]{1,60}$/.test(details?.code ?? "") && !/^(sk|rk|pk|whsec)_/.test(details!.code!) ? details!.code : undefined,
    statusCode: typeof details?.statusCode === "number" ? details.statusCode : undefined,
  };
}

// Stripe signs the exact bytes it sent, so the body is read raw and never re-encoded.
async function readRawBody(request: Request): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
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
  return Buffer.concat(chunks);
}

export function createStripeWebhookHandler({ stripe, webhookSecret, mode, processEvent = handleBookingStripeEvent }: StripeWebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ error: "invalid_signature" }, 400);
    let event: Stripe.Event;
    try {
      const raw = await readRawBody(request);
      if (raw === null) return json({ error: "payload_too_large" }, 413);
      // The async variant works with Node crypto and with the Web Crypto of Workers.
      event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
    } catch { return json({ error: "invalid_signature" }, 400); }
    if (event.livemode !== (mode === "live")) {
      logEvent(event, "error");
      return json({ error: "mode_mismatch" }, 400);
    }
    // Connected-account events never belong to a booking of this account.
    if (event.account) {
      logEvent(event, "ignored");
      return json({ received: true, result: "ignored" });
    }
    try {
      const outcome = await processEvent(event, stripe, mode);
      logEvent(event, outcome.outcome, outcome.attemptId, outcome.bookingId);
      return json({ received: true, result: outcome.outcome });
    } catch (error) {
      logEvent(event, "error", null, null, errorDetails(error));
      // 5xx: nothing was committed, so Stripe retries the delivery.
      return json({ error: "webhook_processing_failed" }, 500);
    }
  };
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  if (!request.headers.get("stripe-signature")) return json({ error: "invalid_signature" }, 400);
  const config = getStripeCheckoutConfig();
  if (!config.mode || !config.secretKey || !config.webhookSecret) {
    console.error("stripe-webhook: not configured", {
      mode: Boolean(config.mode), secretKey: Boolean(config.secretKey), webhookSecret: Boolean(config.webhookSecret),
    });
    return json({ error: "webhook_unavailable" }, 503);
  }
  const stripe = new Stripe(config.secretKey, { apiVersion: "2026-09-30.endive", timeout: 10000, maxNetworkRetries: 1 });
  return createStripeWebhookHandler({ stripe, webhookSecret: config.webhookSecret, mode: config.mode })(request);
}
