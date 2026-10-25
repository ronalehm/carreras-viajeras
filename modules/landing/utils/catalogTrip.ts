import { cache } from "react";
import { formatTripDate, formatTripPrice, getPublishedTripBySlug } from "@/modules/trips";
import { getTrip, type Trip } from "./trips";

// React cache: generateMetadata and the page share one Neon query per request.
// Database errors propagate on purpose (default Next error page, message hidden in production).
export const getCatalogTrip = cache(async (slug: string): Promise<Trip | null> => {
  const content = getTrip(slug);
  if (!content) return null; // no fixed content → 404 without querying Neon
  const published = await getPublishedTripBySlug(slug);
  if (!published) return null;
  return {
    ...content,
    name: published.title,
    description: published.summary,
    raceDate: formatTripDate(published.raceDate),
    capacity: published.capacity === null ? "Cupos por confirmar" : `${published.capacity} cupos definidos`,
    prices: { ...content.prices, cash: formatTripPrice(published.priceUsd) },
  };
});
