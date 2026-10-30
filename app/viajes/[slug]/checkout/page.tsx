import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader, firstParam, getCatalogOffer, getCatalogTrip } from "@/modules/landing";
import { getPublishedTripIdBySlug } from "@/modules/trips";
import { RunnerCheckout } from "@/modules/booking-checkout/components/RunnerCheckout";

export const metadata: Metadata = { title: "Checkout de viaje" };
export default async function BookingCheckoutPage({
  params, searchParams,
}: PageProps<"/viajes/[slug]/checkout">) {
  const { slug } = await params;
  const query = await searchParams;
  const campaignCode = firstParam(query.c) ?? null;
  const [trip, tripId, offer] = await Promise.all([
    getCatalogTrip(slug), getPublishedTripIdBySlug(slug), getCatalogOffer(slug, campaignCode),
  ]);
  if (!trip || !tripId) notFound();
  if (process.env.NODE_ENV === "production" || process.env.STRIPE_CHECKOUT_ENABLED !== "true") notFound();
  return (
    <>
      <SiteHeader />
      <main>
        <RunnerCheckout tripId={tripId} tripTitle={trip.title} campaignCode={campaignCode}
          offer={offer} returned={firstParam(query.return) === "success"} cancelled={firstParam(query.cancelled) === "1"}
          bookingId={firstParam(query.booking_id) ?? null} attemptId={firstParam(query.attempt_id) ?? null} />
      </main>
      <SiteFooter />
    </>
  );
}
