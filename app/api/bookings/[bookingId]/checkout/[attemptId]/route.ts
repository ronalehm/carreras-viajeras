import { requireVerifiedEmail } from "@/lib/auth/guards";
import {
  attemptRouteParamsSchema, checkoutError, checkoutFailure, checkoutJson, getBookingCheckoutState, isCheckoutEnabled,
} from "@/modules/booking-checkout";

const ROUTE = "state";

export async function GET(_request: Request, context: RouteContext<"/api/bookings/[bookingId]/checkout/[attemptId]">) {
  if (!isCheckoutEnabled()) return checkoutError(ROUTE, "not_found", 404);
  try {
    const params = attemptRouteParamsSchema.safeParse(await context.params);
    if (!params.success) return checkoutError(ROUTE, "not_found", 404);
    const user = await requireVerifiedEmail();
    const state = await getBookingCheckoutState(params.data.bookingId, params.data.attemptId, user.id);
    return state ? checkoutJson(state) : checkoutError(ROUTE, "not_found", 404);
  } catch (error) {
    return checkoutFailure(ROUTE, error);
  }
}
