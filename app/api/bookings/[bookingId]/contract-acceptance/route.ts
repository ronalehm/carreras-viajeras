import { authErrorResponse } from "@/lib/auth/errors";
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { contractAcceptanceSchema, isCheckoutSandboxEnabled } from "@/modules/booking-checkout";
import { acceptBookingContract } from "@/modules/booking-checkout";

const NO_STORE = { "Cache-Control": "no-store" };
export async function POST(request: Request, context: RouteContext<"/api/bookings/[bookingId]/contract-acceptance">) {
  if (!isCheckoutSandboxEnabled()) return Response.json({ error: "checkout_unavailable" }, { status: 404, headers: NO_STORE });
  try {
    const origin = new URL(getEnv().APP_ORIGIN).origin;
    if (request.headers.get("origin") !== origin) return Response.json({ error: "invalid_origin" }, { status: 403, headers: NO_STORE });
    const user = await requireVerifiedEmail();
    const { bookingId } = await context.params;
    const body = await readJsonBody(request, contractAcceptanceSchema);
    if (!body) return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
    const result = await acceptBookingContract(bookingId, user.id, body.documentHash);
    if (result === "accepted" || result === "already_accepted") return Response.json({ accepted: true }, { headers: NO_STORE });
    const status = result === "checkout_unavailable" ? 404 : result === "reservation_unavailable" ? 404 : 409;
    return Response.json({ error: result }, { status, headers: NO_STORE });
  } catch (error) {
    try { return authErrorResponse(error); }
    catch {
      console.error("booking checkout: contract acceptance failed");
      return Response.json({ error: "internal_error" }, { status: 500, headers: NO_STORE });
    }
  }
}
