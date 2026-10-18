// Public read contract for the landing. Server Components only: the services are server-only.
export { getPublishedTripBySlug, listPublishedTrips } from "./services/trips.service";
export type { PublicTrip } from "./types/trips.types";
// Canonical trip slug format, reused by other modules (e.g. the automation event payload).
export { tripSlugSchema } from "./schemas/trips.schema";
export { formatTripDate, formatTripDateRange, formatTripPrice } from "./utils/tripDisplay";
