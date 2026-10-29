import { api } from "@/lib/api";
import { catalogTripsResponseSchema } from "../schemas/catalogTrips.schema";

// The type of the trips comes from the schema: { slug, title }[].
export async function fetchCatalogTrips() {
  const { data } = await api.get("/viajes");
  return catalogTripsResponseSchema.parse(data).trips;
}
