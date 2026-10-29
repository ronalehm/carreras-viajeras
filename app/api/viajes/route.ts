import { listPublishedTrips } from "@/modules/trips";

const NO_STORE = { "Cache-Control": "no-store" };

// Published trips for the /contacto selector, read in the browser so the page stays static.
// Only slug and title, in the catalog order. Takes no parameters: any query string is ignored.
// A failed read answers 503 with a fixed code and logs a fixed message, never the cause.
export async function GET() {
  try {
    const trips = await listPublishedTrips();
    return Response.json({ trips: trips.map(({ slug, title }) => ({ slug, title })) }, { headers: NO_STORE });
  } catch {
    console.error("trips: published trips unavailable");
    return Response.json({ error: "trips_unavailable" }, { status: 503, headers: NO_STORE });
  }
}
