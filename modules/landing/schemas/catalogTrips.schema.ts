import { z } from "zod";
import type { OfferView } from "../utils/catalogOffer";
import type { TripLanding } from "../utils/catalogTrip";

// Browser boundary for GET /api/viajes: only slug and title of each published trip (extra keys
// are dropped), in the order the endpoint returns them.
const catalogTripOptionSchema = z.object({ slug: z.string().min(1), title: z.string().min(1) });
export const catalogTripsResponseSchema = z.object({ trips: z.array(catalogTripOptionSchema) });

// Browser boundary for GET /api/viajes/[slug]: the same fields the server builds with
// getCatalogTrip and getCatalogOffer (extra keys are dropped). `satisfies` keeps them in sync with
// the server types, which are imported as types only (their modules are server-only).
const tripLandingSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  location: z.string(),
  distances: z.array(z.string()),
  imageUrl: z.string().nullable(),
  raceDate: z.string(),
  travelDates: z.string().nullable(),
  capacity: z.string(),
  officialUrl: z.string().nullable(),
  includes: z.array(z.string()),
  excludes: z.array(z.string()),
  notes: z.array(z.string()),
}) satisfies z.ZodType<TripLanding>;

const offerViewSchema = z.object({
  totalPrice: z.string(),
  totalPricePen: z.string().nullable(),
  discount: z.string().nullable(),
  discountPen: z.string().nullable(),
  finalPrice: z.string(),
  finalPricePen: z.string().nullable(),
  deposits: z.array(
    z.object({
      deposit: z.string(),
      depositPen: z.string().nullable(),
      balance: z.string(),
      balancePen: z.string().nullable(),
    }),
  ),
  balanceDueOn: z.string().nullable(),
  bonus: z.string().nullable(),
  validity: z.string(),
  conditions: z.array(z.string()),
  termsVersion: z.string(),
  exchangeRate: z.object({ rate: z.string(), since: z.string() }).nullable(),
}) satisfies z.ZodType<OfferView>;

export const catalogTripResponseSchema = z.object({
  trip: tripLandingSchema,
  offer: offerViewSchema.nullable(),
});
