import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isRegistrationOpen } from "@/lib/registrationConsent";
import {
  attributionParams,
  firstParam,
  getCatalogOffer,
  getCatalogTrip,
  registrationHref,
  SiteFooter,
  SiteHeader,
  TripDetail,
} from "@/modules/landing";

// Rendered per request: the catalog read calls connection(). No generateStaticParams.
export async function generateMetadata({ params }: PageProps<"/viajes/[slug]">): Promise<Metadata> {
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  return {
    title: trip.title,
    description: trip.summary,
    ...(trip.imageUrl ? { openGraph: { images: [trip.imageUrl] } } : {}),
  };
}

export default async function TripPage({ params, searchParams }: PageProps<"/viajes/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  // ?c= selects a valid campaign offer (decided by the server); ?c=, UTM and ref are also carried
  // to «Registrarme», which is hidden while the registration is closed (gate P-L).
  const campaignCode = firstParam(query.c) ?? null;
  const [trip, offer] = await Promise.all([getCatalogTrip(slug), getCatalogOffer(slug, campaignCode)]);
  if (!trip) notFound();
  const registration = isRegistrationOpen() ? registrationHref(slug, attributionParams(query)) : null;
  return (
    <>
      <SiteHeader />
      <main>
        <TripDetail trip={trip} offer={offer} registrationHref={registration} />
      </main>
      <SiteFooter />
    </>
  );
}
