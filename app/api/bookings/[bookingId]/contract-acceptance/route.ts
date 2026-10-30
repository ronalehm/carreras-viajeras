import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import {
  acceptBookingContract, bookingRouteParamsSchema, checkoutAccessFor, checkoutError, checkoutFailure, checkoutJson,
  contractAcceptanceSchema, hasAppOrigin, isCheckoutEnabled,
} from "@/modules/booking-checkout";

const ROUTE = "contract_acceptance";
const RESULT_STATUS = {
  checkout_unavailable: 404, reservation_unavailable: 404, document_changed: 409, acceptance_conflict: 409,
} as const;

export async function POST(request: Request, context: RouteContext<"/api/bookings/[bookingId]/contract-acceptance">) {
  if (!isCheckoutEnabled()) return checkoutError(ROUTE, "not_found", 404);
  try {
    if (!hasAppOrigin(request, getEnv().APP_ORIGIN)) return checkoutError(ROUTE, "invalid_origin", 403);
    const params = bookingRouteParamsSchema.safeParse(await context.params);
    if (!params.success) return checkoutError(ROUTE, "not_found", 404);
    const user = await requireVerifiedEmail();
    // Demo mode: only an active demo participant, read from Neon; others get the same 404 as when off.
    if (!await checkoutAccessFor(user.id)) return checkoutError(ROUTE, "not_found", 404);
    const body = await readJsonBody(request, contractAcceptanceSchema);
    if (!body) return checkoutError(ROUTE, "invalid_request", 400);
    const result = await acceptBookingContract(params.data.bookingId, user.id, body.documentHash);
    if (result === "accepted" || result === "already_accepted") return checkoutJson({ accepted: true });
    return checkoutError(ROUTE, result === "checkout_unavailable" ? "not_found" : result, RESULT_STATUS[result]);
  } catch (error) {
    return checkoutFailure(ROUTE, error);
  }
}
