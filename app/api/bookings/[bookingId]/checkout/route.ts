import { authErrorResponse } from "@/lib/auth/errors";
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { createCheckoutSessionSchema, isCheckoutSandboxEnabled } from "@/modules/booking-checkout";
import { createBookingCheckoutSession } from "@/modules/booking-checkout";

const NO_STORE = { "Cache-Control": "no-store" };
const ERRORS = new Set(["booking_not_found", "contract_not_accepted", "reservation_expired", "quote_changed", "attempt_conflict", "attempt_expired", "balance_not_due"]);
export async function POST(request: Request, context: RouteContext<"/api/bookings/[bookingId]/checkout">) {
  if (!isCheckoutSandboxEnabled()) return Response.json({ error: "checkout_unavailable" }, { status: 404, headers: NO_STORE });
  try {
    if (request.headers.get("origin") !== new URL(getEnv().APP_ORIGIN).origin) {
      return Response.json({ error: "invalid_origin" }, { status: 403, headers: NO_STORE });
    }
    const user = await requireVerifiedEmail();
    const { bookingId } = await context.params;
    const body = await readJsonBody(request, createCheckoutSessionSchema);
    if (!body) return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
    const result = await createBookingCheckoutSession(bookingId, user.id, body);
    if (typeof result !== "string") return Response.json(result, { headers: NO_STORE });
    if (result === "checkout_unavailable") return Response.json({ error: result }, { status: 503, headers: NO_STORE });
    if (ERRORS.has(result)) return Response.json({ error: result }, { status: result === "booking_not_found" ? 404 : 409, headers: NO_STORE });
    console.error("booking checkout: session creation failed");
    return Response.json({ error: "checkout_failed" }, { status: 502, headers: NO_STORE });
  } catch (error) {
    try { return authErrorResponse(error); }
    catch {
      console.error("booking checkout: session creation failed");
      return Response.json({ error: "checkout_failed" }, { status: 502, headers: NO_STORE });
    }
  }
}
