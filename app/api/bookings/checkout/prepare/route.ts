import { authErrorResponse } from "@/lib/auth/errors";
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { prepareCheckoutSchema } from "@/modules/booking-checkout";
import { isCheckoutSandboxEnabled, prepareBookingCheckout } from "@/modules/booking-checkout";

const NO_STORE = { "Cache-Control": "no-store" };
const RESULT_STATUS = {
  offer_unavailable: 409, rate_unavailable: 503, contract_unavailable: 503,
  registration_required: 409, sold_out: 409, request_conflict: 409, booking_exists: 409,
} as const;

export async function POST(request: Request) {
  if (!isCheckoutSandboxEnabled()) {
    return Response.json({ error: "checkout_unavailable" }, { status: 404, headers: NO_STORE });
  }
  try {
    const expectedOrigin = new URL(getEnv().APP_ORIGIN).origin;
    if (request.headers.get("origin") !== expectedOrigin) {
      return Response.json({ error: "invalid_origin" }, { status: 403, headers: NO_STORE });
    }
    const user = await requireVerifiedEmail();
    const body = await readJsonBody(request, prepareCheckoutSchema);
    if (!body) return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });

    const result = await prepareBookingCheckout(body, user);
    if (typeof result === "string") {
      return Response.json({ error: result }, { status: RESULT_STATUS[result], headers: NO_STORE });
    }
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("booking checkout: preparation failed");
      return Response.json({ error: "internal_error" }, { status: 500, headers: NO_STORE });
    }
  }
}
