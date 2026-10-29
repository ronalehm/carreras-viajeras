import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { submitWebLeadAction } from "@/modules/crm";
import {
  RaceRegistrationSection,
  SiteFooter,
  SiteHeader,
  attributionParams,
  firstParam,
  getCatalogOffer,
  getCatalogTrip,
} from "@/modules/landing";

// Rendered per request: the catalog read calls connection(). Indexing stays off (root layout robots).
export async function generateMetadata({ params }: PageProps<"/viajes/[slug]/registro">): Promise<Metadata> {
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  return { title: `Registro · ${trip.title}`, description: trip.summary };
}

export default async function RaceRegistrationPage({
  params,
  searchParams,
}: PageProps<"/viajes/[slug]/registro">) {
  const { slug } = await params;
  const query = await searchParams;
  // Stand mode only changes the layout: it grants nothing on the server and shows no price block.
  const standMode = firstParam(query.modo) === "stand";
  // ?c= only selects a valid campaign offer (decided by the server); every other parameter is ignored.
  const [trip, offer] = await Promise.all([
    getCatalogTrip(slug),
    standMode ? null : getCatalogOffer(slug, firstParam(query.c) ?? null),
  ]);
  if (!trip) notFound();
  // The action comes from crm and is passed as a prop: landing never imports crm at runtime.
  const section = (
    <RaceRegistrationSection
      trip={trip}
      action={submitWebLeadAction}
      attribution={attributionParams(query)}
      standMode={standMode}
      offer={offer}
    />
  );

  if (standMode) return <main>{section}</main>;
  return (
    <>
      <SiteHeader />
      <main>{section}</main>
      <SiteFooter />
    </>
  );
}
