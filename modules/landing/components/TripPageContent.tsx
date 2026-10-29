"use client";

import { useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { isRegistrationOpen } from "@/lib/registrationConsent";
import { cn } from "@/lib/utils";
import { useCatalogTrip } from "../hooks/useCatalogTrip";
import { useTripPageParams } from "../hooks/useTripPageParams";
import {
  attributionParams,
  firstParam,
  GENERAL_INQUIRY_MESSAGE,
  registrationHref,
  WHATSAPP_NUMBER,
  buildWhatsAppUrl,
} from "../utils/inquiry";
import { WhatsAppLink } from "./LeadCaptureForm";
import { TripDetail } from "./TripDetail";

const stateClass = "mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-12 text-primary sm:py-16";

/** Brief loading state: no form and no amounts until the server has decided the trip and offer. */
export function TripPageLoading() {
  return (
    <section className={stateClass}>
      <p role="status" aria-busy="true" className="text-base">
        Cargando el viaje…
      </p>
    </section>
  );
}

/** The states of a race page without data: loading, not found (404) or unavailable (any error). */
export function TripPageState({ notFound, failed }: { notFound: boolean; failed: boolean }) {
  if (notFound) {
    return (
      <section className={stateClass}>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Viaje no encontrado</h1>
        <p className="text-base leading-relaxed">El viaje que buscas no existe o ya no está publicado.</p>
        <Link href="/" className={cn(buttonVariants(), "h-auto rounded-full px-6 py-3 text-base font-semibold")}>
          Volver al inicio
        </Link>
      </section>
    );
  }
  if (failed) {
    const whatsAppUrl = buildWhatsAppUrl(WHATSAPP_NUMBER, GENERAL_INQUIRY_MESSAGE);
    return (
      <section className={stateClass}>
        <p role="alert" className="text-base leading-relaxed">
          No pudimos cargar este viaje. Inténtalo de nuevo en unos minutos o escríbenos por WhatsApp.
        </p>
        {whatsAppUrl && <WhatsAppLink href={whatsAppUrl}>Escríbenos por WhatsApp</WhatsAppLink>}
      </section>
    );
  }
  return <TripPageLoading />;
}

/**
 * /viajes/<slug> in the browser: the trip and the offer in force come from GET /api/viajes/[slug]
 * with the slug of the URL and ?c= only. Loaded data stays on screen even if a later refetch fails.
 */
export function TripPageContent() {
  const { slug, query } = useTripPageParams();
  const { data, status } = useCatalogTrip(slug, firstParam(query.c) ?? null);
  const title = data?.trip.title;

  useEffect(() => {
    if (title) document.title = `${title} | Carreras Viajeras`;
  }, [title]);

  if (!data) return <TripPageState notFound={data === null} failed={status === "error"} />;
  // ?c=, UTM and ref are carried to «Registrarme», hidden while the registration is closed (gate P-L).
  const registration = isRegistrationOpen() ? registrationHref(slug, attributionParams(query)) : null;
  return <TripDetail trip={data.trip} offer={data.offer} registrationHref={registration} />;
}
