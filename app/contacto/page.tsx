import type { Metadata } from "next";
import { submitWebLeadAction } from "@/modules/crm";
import { ContactSection, SiteFooter, SiteHeader, attributionParams } from "@/modules/landing";
import { listPublishedTrips } from "@/modules/trips";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Consulta por tu próximo viaje con Carreras Viajeras.",
};

// Rendered per request: listPublishedTrips calls connection().
export default async function ContactPage({ searchParams }: PageProps<"/contacto">) {
  const query = await searchParams;
  const trips = await listPublishedTrips();

  return (
    <>
      <SiteHeader />
      <main>
        {/* The action comes from crm and is passed as a prop: landing never imports crm at runtime. */}
        <ContactSection
          action={submitWebLeadAction}
          trips={trips.map(({ slug, title }) => ({ slug, title }))}
          destination={query.destino}
          attribution={attributionParams(query)}
        />
      </main>
      <SiteFooter />
    </>
  );
}
