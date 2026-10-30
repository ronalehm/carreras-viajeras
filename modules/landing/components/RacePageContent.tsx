"use client";

import { useEffect } from "react";
import { useCatalogTrip } from "../hooks/useCatalogTrip";
import { useTripPageParams } from "../hooks/useTripPageParams";
import { attributionParams, firstParam } from "../utils/inquiry";
import type { LeadCaptureAction } from "./LeadCaptureForm";
import { RaceRegistrationSection } from "./RaceRegistrationSection";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { TripPageState } from "./TripPageContent";

/**
 * /viajes/<slug>/registro in the browser. Stand mode (?modo=stand) only changes the layout: no
 * header, footer or price block, and it grants nothing on the server. Otherwise ?c= selects the
 * offer, decided by the server. Loaded data keeps the form mounted even if a later refetch fails.
 */
export function RacePageContent({ action }: { action: LeadCaptureAction }) {
  const { slug, query } = useTripPageParams();
  const standMode = firstParam(query.modo) === "stand";
  const { data, status } = useCatalogTrip(slug, standMode ? null : (firstParam(query.c) ?? null));
  const title = data?.trip.title;

  useEffect(() => {
    if (title) document.title = `Registro · ${title} | Carreras Viajeras`;
  }, [title]);

  const content = data ? (
    <RaceRegistrationSection
      trip={data.trip}
      action={action}
      attribution={attributionParams(query)}
      standMode={standMode}
      offer={standMode ? null : data.offer}
    />
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
