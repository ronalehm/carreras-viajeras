import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import {
  checkoutAccessFor, checkoutError, checkoutFailure, checkoutJson, hasAppOrigin, isCheckoutEnabled, prepareBookingCheckout, prepareCheckoutSchema,
} from "@/modules/booking-checkout";

const ROUTE = "prepare";
const RESULT_STATUS = {
  offer_unavailable: 409, rate_unavailable: 503, contract_unavailable: 503,
  registration_required: 409, sold_out: 409, request_conflict: 409, booking_exists: 409,
  invalid_payment_choice: 400,
} as const;

export async function POST(request: Request) {
  if (!isCheckoutEnabled()) return checkoutError(ROUTE, "not_found", 404);
  try {
    if (!hasAppOrigin(request, getEnv().APP_ORIGIN)) return checkoutError(ROUTE, "invalid_origin", 403);
    const user = await requireVerifiedEmail();
    // Demo mode: only an active demo participant, read from Neon; others get the same 404 as when off.
    if (!await checkoutAccessFor(user.id)) return checkoutError(ROUTE, "not_found", 404);
    const body = await readJsonBody(request, prepareCheckoutSchema);
    if (!body) return checkoutError(ROUTE, "invalid_request", 400);

    const result = await prepareBookingCheckout(body, user);
    if (typeof result === "string") return checkoutError(ROUTE, result, RESULT_STATUS[result]);
    return checkoutJson(result);
  } catch (error) {
    return checkoutFailure(ROUTE, error);
  }
}
