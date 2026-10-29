"use client";

import { useSearchParams } from "next/navigation";
import { useCatalogTripOptions } from "../hooks/useCatalogTripOptions";
import { attributionParams, searchParamsToRecord } from "../utils/inquiry";
import { ContactSection } from "./ContactSection";
import type { LeadCaptureAction } from "./LeadCaptureForm";

/** Brief loading state without the form: it is mounted once, with the trips already known. */
export function ContactPageLoading() {
  return (
    <section className="bg-sky px-4 py-12 text-night sm:px-[8%] sm:py-16">
      <p role="status" aria-busy="true" className="text-base text-asphalt">
        Cargando el formulario de contacto…
      </p>
    </section>
  );
}

/**
 * /contacto in the browser: ?destino= and the attribution come from the URL, and the published
 * trips from GET /api/viajes. If the endpoint fails, the form keeps the destinations without catalog.
 */
export function ContactPageContent({ action }: { action: LeadCaptureAction }) {
  const searchParams = useSearchParams();
  const { status, data } = useCatalogTripOptions();
  if (status === "pending") return <ContactPageLoading />;

  const query = searchParamsToRecord(searchParams);
  return (
    <ContactSection
      action={action}
      // Trips already loaded stay after a failed refetch, so the form keeps its key and what was typed.
      trips={data ?? []}
      destination={query.destino}
      attribution={attributionParams(query)}
    />
  );
}
