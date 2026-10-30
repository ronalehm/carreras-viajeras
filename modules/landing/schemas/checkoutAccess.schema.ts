import { z } from "zod";

// Browser boundary for GET /api/bookings/checkout/access: only whether the checkout link is shown.
export const checkoutAccessResponseSchema = z.object({ available: z.boolean() });
