import { authErrorResponse } from "@/lib/auth/errors";
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { isCheckoutSandboxEnabled, getBookingCheckoutState } from "@/modules/booking-checkout";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(_request: Request, context: RouteContext<"/api/bookings/[bookingId]/checkout/[attemptId]">) {
  if (!isCheckoutSandboxEnabled()) return Response.json({ error: "checkout_unavailable" }, { status: 404, headers: NO_STORE });
  try {
    const user = await requireVerifiedEmail();
    const { bookingId, attemptId } = await context.params;
    if (!UUID.test(bookingId) || !UUID.test(attemptId)) {
      return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    const state = await getBookingCheckoutState(bookingId, attemptId, user.id);
    return state
      ? Response.json(state, { headers: NO_STORE })
      : Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  } catch (error) {
    try { return authErrorResponse(error); }
    catch {
      console.error("booking checkout: state lookup failed");
      return Response.json({ error: "internal_error" }, { status: 500, headers: NO_STORE });
    }
  }
}
