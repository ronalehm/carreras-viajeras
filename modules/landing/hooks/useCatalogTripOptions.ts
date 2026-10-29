"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCatalogTrips } from "../services/catalogTrips.api";
import { landingQueryKeys } from "./landingQueryKeys";

// At most one retry: an unavailable endpoint leaves the destinations without catalog instead of
// retrying in a loop.
export function useCatalogTripOptions() {
  return useQuery({ queryKey: landingQueryKeys.catalogTrips, queryFn: fetchCatalogTrips, retry: 1 });
}
