import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { submitWebLeadAction } from "@/modules/crm";
import {
  RaceRegistrationSection,
  SiteFooter,
  SiteHeader,
  attributionParams,
  firstParam,
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
  const trip = await getCatalogTrip((await params).slug);
  if (!trip) notFound();
  const query = await searchParams;
  // Stand mode only changes the layout: it grants nothing on the server.
  const standMode = firstParam(query.modo) === "stand";
  // The action comes from crm and is passed as a prop: landing never imports crm at runtime.
  const section = (
    <RaceRegistrationSection
      trip={trip}
      action={submitWebLeadAction}
      attribution={attributionParams(query)}
      standMode={standMode}
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
