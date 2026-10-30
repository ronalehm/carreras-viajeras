import { handleStripeWebhook } from "@/modules/booking-checkout";

export const runtime = "nodejs";
export const POST = handleStripeWebhook;
