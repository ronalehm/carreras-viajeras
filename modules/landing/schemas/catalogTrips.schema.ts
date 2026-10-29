import { z } from "zod";

// Browser boundary for GET /api/viajes: only slug and title of each published trip (extra keys
// are dropped), in the order the endpoint returns them.
const catalogTripOptionSchema = z.object({ slug: z.string().min(1), title: z.string().min(1) });
export const catalogTripsResponseSchema = z.object({ trips: z.array(catalogTripOptionSchema) });
