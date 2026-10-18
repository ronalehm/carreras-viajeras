import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogTrip, SiteFooter, SiteHeader, TripDetail } from "@/modules/landing";

// Rendered per request: the catalog read calls connection(). No generateStaticParams.
export async function generateMetadata({ params }: PageProps<"/viajes/[slug]">): Promise<Metadata> {
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  return { title: trip.name, description: trip.description };
}

export default async function TripPage({ params }: PageProps<"/viajes/[slug]">) {
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  return (
    <>
      <SiteHeader />
      <main>
        <TripDetail trip={trip} />
      </main>
      <SiteFooter />
    </>
  );
}
