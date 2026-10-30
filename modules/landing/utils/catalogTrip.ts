import { cache } from "react";
import {
  formatTripDate,
  formatTripDateRange,
  getPublishedTripBySlug,
  type PublicTrip,
} from "@/modules/trips";

/**
 * What the trip page renders, built only from the published catalog. No prices: the price lives in
 * the commercial offers (catalogOffer.ts); the old price fields of trips are no longer published.
 */
export type TripLanding = {
  slug: string;
  title: string;
  summary: string;
  location: string; // "Santiago, Chile"
  distances: string[];
  imageUrl: string | null;
  raceDate: string;
  travelDates: string | null;
  capacity: string; // "100 cupos" | "Cupos por confirmar"
  officialUrl: string | null;
  includes: string[];
  excludes: string[];
  notes: string[]; // paragraphs
};

/** One paragraph per non-empty line, trimmed. */
export function paragraphs(text: string | null): string[] {
  if (text === null) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toTripLanding(trip: PublicTrip): TripLanding {
  return {
    slug: trip.slug,
    title: trip.title,
    summary: trip.summary,
    location: `${trip.city}, ${trip.country}`,
    distances: trip.distances,
    imageUrl: trip.imageUrl,
    raceDate: formatTripDate(trip.raceDate),
    travelDates:
      trip.startDate && trip.endDate ? formatTripDateRange(trip.startDate, trip.endDate) : null,
    capacity: trip.capacity === null ? "Cupos por confirmar" : `${trip.capacity} cupos`,
    officialUrl: trip.officialUrl,
    includes: trip.includes,
    excludes: trip.excludes,
    notes: paragraphs(trip.notes),
  };
}

// Read by GET /api/viajes/[slug] (React cache dedupes repeated calls within one request).
// Database errors propagate on purpose: the endpoint turns them into 503 trip_unavailable.
export const getCatalogTrip = cache(async (slug: string): Promise<TripLanding | null> => {
  const published = await getPublishedTripBySlug(slug);
  return published ? toTripLanding(published) : null;
});
