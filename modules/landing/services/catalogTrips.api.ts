import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import { catalogTripResponseSchema, catalogTripsResponseSchema } from "../schemas/catalogTrips.schema";

// The type of the trips comes from the schema: { slug, title }[].
export async function fetchCatalogTrips() {
  const { data } = await api.get("/viajes");
  return catalogTripsResponseSchema.parse(data).trips;
}

/**
 * A published trip and its offer in force for the race pages. Only the slug and ?c= reach the
 * endpoint, which decides the offer. A 404 resolves to null ("Viaje no encontrado"); any other
 * failure or a malformed body throws.
 */
export async function fetchCatalogTrip(slug: string, campaignCode: string | null) {
  try {
    const { data } = await api.get(`/viajes/${encodeURIComponent(slug)}`, {
      params: campaignCode === null ? undefined : { c: campaignCode },
    });
    return catalogTripResponseSchema.parse(data);
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}
