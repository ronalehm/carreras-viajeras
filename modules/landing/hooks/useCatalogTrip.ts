"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCatalogTrip } from "../services/catalogTrips.api";
import { landingQueryKeys } from "./landingQueryKeys";

// A 404 resolves to null (a result, never retried); any other failure retries once at most.
export function useCatalogTrip(slug: string, campaignCode: string | null) {
  return useQuery({
    queryKey: landingQueryKeys.catalogTrip(slug, campaignCode),
    queryFn: () => fetchCatalogTrip(slug, campaignCode),
    retry: 1,
  });
}
