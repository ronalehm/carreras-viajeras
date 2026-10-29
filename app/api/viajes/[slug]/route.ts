import { getCatalogOffer, getCatalogTrip } from "@/modules/landing";

const NO_STORE = { "Cache-Control": "no-store" };

// A published trip and its offer in force, read in the browser so /viajes/<slug> stays static.
// Only ?c= (first value) reaches the offer read, which the server decides; every other parameter
// is ignored and no amount comes from the URL. Unknown, unpublished or non-canonical → 404.
// A failed read answers 503 with a fixed code and logs a fixed message, never the cause.
export async function GET(request: Request, ctx: RouteContext<"/api/viajes/[slug]">) {
  const { slug } = await ctx.params;
  const campaignCode = new URL(request.url).searchParams.get("c");
  try {
    const [trip, offer] = await Promise.all([getCatalogTrip(slug), getCatalogOffer(slug, campaignCode)]);
    if (!trip) return Response.json({ error: "trip_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ trip, offer }, { headers: NO_STORE });
  } catch {
    console.error("trips: published trip unavailable");
    return Response.json({ error: "trip_unavailable" }, { status: 503, headers: NO_STORE });
  }
}
