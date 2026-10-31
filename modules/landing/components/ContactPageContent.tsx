"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCatalogTripOptions } from "../hooks/useCatalogTripOptions";
import { attributionParams, registrationHref, resolveDestination, searchParamsToRecord } from "../utils/inquiry";
import { ContactSection } from "./ContactSection";
import { ScrollToHero } from "./ScrollToHero";

/** Brief loading state while the published trips arrive (or while an old link redirects). */
export function ContactPageLoading() {
  return (
    <section className="bg-sky px-4 py-12 text-night sm:px-[8%] sm:py-16">
      <p role="status" aria-busy="true" className="text-base text-asphalt">
        Cargando las carreras…
      </p>
    </section>
  );
}

/**
 * /contacto in the browser: the published trips from GET /api/viajes and the attribution from the
 * URL. An old `?destino=` link of a published trip (or its alias) goes to that trip's registration
 * page with the same attribution, so campaigns keep working.
 */
export function ContactPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, data } = useCatalogTripOptions();
  const query = searchParamsToRecord(searchParams);
  const attribution = attributionParams(query);
  const trips = data ?? [];
  const target = resolveDestination(query.destino, trips.map((trip) => trip.slug));
  const redirectTo = target ? registrationHref(target, attribution) : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (status === "pending" || redirectTo) return <ContactPageLoading />;
  return (
    <>
      {/* The page opens at its hero, not where the previous one was. */}
      <ScrollToHero />
      <ContactSection trips={trips} attribution={attribution} />
    </>
  );
}
