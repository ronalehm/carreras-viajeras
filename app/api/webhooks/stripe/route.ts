import { handleStripeWebhook } from "@/modules/stripe-demo";

export const runtime = "nodejs";
export const POST = handleStripeWebhook;
