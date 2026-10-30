// Query keys of the landing module, in one place.
export const landingQueryKeys = {
  catalogTrips: ["landing", "catalog-trips"],
  catalogTrip: (slug: string, campaignCode: string | null) => ["landing", "catalog-trip", slug, campaignCode],
} as const;
