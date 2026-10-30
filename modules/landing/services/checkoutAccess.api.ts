import { api } from "@/lib/api";
import { checkoutAccessResponseSchema } from "../schemas/checkoutAccess.schema";

// Whether this visitor may continue to the checkout, decided by the server on every request (the
// trip page itself is static). A failure or a malformed body throws: the caller shows nothing.
export async function fetchCheckoutAvailable() {
  const { data } = await api.get("/bookings/checkout/access");
  return checkoutAccessResponseSchema.parse(data).available;
}
