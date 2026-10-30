import { stripeLivemodeFor, type StripeMode } from "@/lib/env";

// Every Stripe TEST key (test mode outside production, or demo in production) produces simulated
// bookings: only a live key creates real ones (bookings-stripe-checkout-demo.md, C). Simulated and
// real bookings never mix: every checkout lookup filters on this value.
export function isSimulatedMode(mode: StripeMode): boolean {
  return mode !== "live";
}

// Value written to `stripe_mode` on attempts and settlements: Stripe only knows test and live, so
// demo is stored as test.
export function stripeModeColumn(mode: StripeMode): "test" | "live" {
  return stripeLivemodeFor(mode) ? "live" : "test";
}

// Shown in the Stripe Checkout line item of every simulated payment.
export const SIMULATED_PAYMENT_LABEL = "SIMULACIÓN – sin cargo real";
