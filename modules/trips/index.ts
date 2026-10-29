// Public read contract for the landing. Server Components only: the services are server-only.
export { getPublishedTripBySlug, listPublishedTrips } from "./services/trips.service";
export type { PublicTrip } from "./types/trips.types";
// Canonical trip slug format, reused by other modules (e.g. the automation event payload).
export { tripSlugSchema } from "./schemas/trips.schema";
export { formatTripDate, formatTripDateRange, formatTripPrice } from "./utils/tripDisplay";
export { listTrips, getTripById } from "./services/trips.service";
export { TripTable } from "./components/TripTable";
export { TripForm } from "./components/TripForm";
export type { Trip, TripScope } from "./types/trips.types";
// Server-only: the CRM actor's trip scope, required by every CRM trip read and write.
export { tripScopeFor } from "./utils/tripScope";

// Commercial offers and USD→PEN exchange rate. Server-only reads: getActiveOffer for the bookings
// specs, getPublicOffer for the landing and getCurrentExchangeRate for bookings-mercadopago.
export {
  getActiveOffer,
  getOfferById,
  getPublicOffer,
  listOffers,
} from "./services/offers.service";
export { getCurrentExchangeRate, listExchangeRates } from "./services/exchangeRates.service";
// Also exported so that the offers routes reach the actions from their server graph: an action
// imported only from a client component is compiled in a separate layer with its own copy of
// drizzle, the Neon driver and zod (same reason as in modules/crm).
export {
  activateOfferAction,
  approveOfferAction,
  closeOfferAction,
  createOfferAction,
  createOfferVersionAction,
  updateOfferAction,
} from "./actions/offers.actions";
export { setExchangeRateAction } from "./actions/exchangeRates.actions";
export { OfferDetails } from "./components/OfferDetails";
export { OfferForm } from "./components/OfferForm";
export { OfferTable } from "./components/OfferTable";
export { ExchangeRateForm } from "./components/ExchangeRateForm";
export { ExchangeRateTable } from "./components/ExchangeRateTable";
export {
  OFFER_STATUS_LABELS,
  offerScopeLabel,
  offerTiming,
  offerValidityText,
} from "./utils/offerDisplay";
export type {
  ActiveOffer,
  ExchangeRate,
  PublicOffer,
  PublicOfferRead,
} from "./types/offers.types";
