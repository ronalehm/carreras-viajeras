import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip, SiteFooter, SiteHeader, TRIPS, TripDetail } from "@/modules/landing";

// Slugs outside TRIPS return 404 without rendering in the Worker.
export const dynamicParams = false;

export function generateStaticParams() {
  return TRIPS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/viajes/[slug]">): Promise<Metadata> {
  const trip = getTrip((await params).slug);
  if (!trip) notFound();
  return { title: trip.name, description: trip.description };
}

export default async function TripPage({ params }: PageProps<"/viajes/[slug]">) {
  const trip = getTrip((await params).slug);
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
