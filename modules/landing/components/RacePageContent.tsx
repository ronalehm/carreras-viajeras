"use client";

import { useEffect } from "react";
import { useCatalogTrip } from "../hooks/useCatalogTrip";
import { useTripPageParams } from "../hooks/useTripPageParams";
import { attributionParams, firstParam } from "../utils/inquiry";
import type { LeadCaptureAction } from "./LeadCaptureForm";
import { RaceRegistrationSection } from "./RaceRegistrationSection";
import { ScrollToHero } from "./ScrollToHero";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { TripPageState } from "./TripPageContent";

/**
 * /viajes/<slug>/registro in the browser. Stand mode (?modo=stand) only changes the layout: no
 * header, footer or price block, and it grants nothing on the server. Otherwise ?c= selects the
 * offer, decided by the server. Loaded data keeps the form mounted even if a later refetch fails.
 */
export function RacePageContent({ action, checkoutEnabled = false }: { action: LeadCaptureAction; checkoutEnabled?: boolean }) {
  const { slug, query } = useTripPageParams();
  const standMode = firstParam(query.modo) === "stand";
  const campaignCode = firstParam(query.c) ?? null;
  const { data, status } = useCatalogTrip(slug, standMode ? null : campaignCode);
  const title = data?.trip.title;

  useEffect(() => {
    if (title) document.title = `Registro · ${title} | Carreras Viajeras`;
  }, [title]);

  const content = data ? (
    <>
      {/* Once the race is mounted: the page opens at its hero, not where the previous one was. */}
      <ScrollToHero />
      <RaceRegistrationSection
        trip={data.trip}
        action={action}
        attribution={attributionParams(query)}
        standMode={standMode}
        offer={standMode ? null : data.offer}
        checkoutHref={checkoutEnabled && !standMode && data.offer
          ? `/viajes/${slug}/checkout${campaignCode ? `?c=${encodeURIComponent(campaignCode)}` : ""}`
          : undefined}
      />
    </>
  ) : (
    <TripPageState notFound={data === null} failed={status === "error"} />
  );

  if (standMode) return <main>{content}</main>;
  return (
    <>
      <SiteHeader />
      <main>{content}</main>
      <SiteFooter />
    </>
  );
}
