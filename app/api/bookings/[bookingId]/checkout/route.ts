import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import {
  bookingRouteParamsSchema, checkoutError, checkoutFailure, checkoutJson, createBookingCheckoutSession,
  createCheckoutSessionSchema, hasAppOrigin, isCheckoutEnabled,
} from "@/modules/booking-checkout";

const ROUTE = "session";
const RESULT_STATUS = {
  checkout_unavailable: 503, booking_not_found: 404, contract_not_accepted: 409, reservation_expired: 409,
  quote_changed: 409, attempt_conflict: 409, attempt_expired: 409, balance_not_due: 409,
  payment_processing: 409, stripe_unavailable: 502,
} as const;
// A missing booking and another runner's booking answer the same 404.
const RESULT_CODE: Partial<Record<keyof typeof RESULT_STATUS, string>> = {
  checkout_unavailable: "stripe_unavailable", booking_not_found: "not_found",
};

export async function POST(request: Request, context: RouteContext<"/api/bookings/[bookingId]/checkout">) {
  if (!isCheckoutEnabled()) return checkoutError(ROUTE, "not_found", 404);
  try {
    if (!hasAppOrigin(request, getEnv().APP_ORIGIN)) return checkoutError(ROUTE, "invalid_origin", 403);
    const params = bookingRouteParamsSchema.safeParse(await context.params);
    if (!params.success) return checkoutError(ROUTE, "not_found", 404);
    const user = await requireVerifiedEmail();
    const body = await readJsonBody(request, createCheckoutSessionSchema);
    if (!body) return checkoutError(ROUTE, "invalid_request", 400);
    const result = await createBookingCheckoutSession(params.data.bookingId, user.id, body);
    if (typeof result !== "string") return checkoutJson(result);
    return checkoutError(ROUTE, RESULT_CODE[result] ?? result, RESULT_STATUS[result]);
  } catch (error) {
    return checkoutFailure(ROUTE, error);
  }
}
