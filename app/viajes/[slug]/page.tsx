import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  firstParam,
  getCatalogOffer,
  getCatalogTrip,
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
  // ?c= only selects a valid campaign offer (decided by the server); every other parameter is ignored.
  const campaignCode = firstParam((await searchParams).c) ?? null;
  const [trip, offer] = await Promise.all([getCatalogTrip(slug), getCatalogOffer(slug, campaignCode)]);
  if (!trip) notFound();
  return (
    <>
      <SiteHeader />
      <main>
        <TripDetail trip={trip} offer={offer} />
      </main>
      <SiteFooter />
    </>
  );
}
