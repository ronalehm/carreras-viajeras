"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCatalogTrips } from "../services/catalogTrips.api";

export const landingQueryKeys = { catalogTrips: ["landing", "catalog-trips"] } as const;

// At most one retry: an unavailable endpoint leaves the destinations without catalog instead of
// retrying in a loop.
export function useCatalogTripOptions() {
  return useQuery({ queryKey: landingQueryKeys.catalogTrips, queryFn: fetchCatalogTrips, retry: 1 });
}
