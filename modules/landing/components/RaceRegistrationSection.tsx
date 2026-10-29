import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { isRegistrationOpen } from "@/lib/registrationConsent";
import { cn } from "@/lib/utils";
import type { OfferView } from "../utils/catalogOffer";
import type { TripLanding } from "../utils/catalogTrip";
import {
  GENERAL_INQUIRY_MESSAGE,
  WHATSAPP_NUMBER,
  buildWhatsAppUrl,
  type LeadAttributionParams,
} from "../utils/inquiry";
import { LeadCaptureForm, RegistrationClosedNotice, type LeadCaptureAction } from "./LeadCaptureForm";
import { OfferSummary } from "./OfferSummary";

type RaceRegistrationSectionProps = {
  trip: Pick<TripLanding, "slug" | "title" | "location" | "raceDate" | "distances" | "imageUrl">;
  action: LeadCaptureAction;
  attribution: LeadAttributionParams;
  standMode: boolean;
  offer: OfferView | null; // resolved by the server from the slug and ?c= only
};

/**
 * Registration page of a published race: minimal commercial header (catalog data only), the price
 * block of the offer in force (if any) and the lead form. Stand mode keeps only the race name and a
 * larger form: no price block.
 */
export function RaceRegistrationSection({
  trip,
  action,
  attribution,
  standMode,
  offer,
}: RaceRegistrationSectionProps) {
  const whatsAppUrl = buildWhatsAppUrl(WHATSAPP_NUMBER, GENERAL_INQUIRY_MESSAGE);
  // Gate P-L: in production with the placeholder legal text the form is not shown.
  const form = isRegistrationOpen() ? (
    <LeadCaptureForm
      action={action}
      destination={{ kind: "fixed", value: trip.slug }}
      attribution={attribution}
      standMode={standMode}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
      whatsAppUrl={whatsAppUrl}
    />
  ) : (
    <RegistrationClosedNotice whatsAppUrl={whatsAppUrl} />
  );

  if (standMode) {
    return (
      <section id="registro" aria-labelledby="registro-title" className="min-h-svh bg-sky px-4 py-8 text-night sm:py-12">
        <div className="mx-auto flex max-w-md flex-col gap-8">
          <h1 id="registro-title" className="display-title text-display-section wrap-break-word">
            {trip.title}
          </h1>
          {form}
        </div>
      </section>
    );
  }

  // The full package page keeps the campaign code so that it shows the same offer.
  const packageHref = attribution.c
    ? `/viajes/${trip.slug}?c=${encodeURIComponent(attribution.c)}`
    : `/viajes/${trip.slug}`;

  return (
    <>
      <section
        aria-labelledby="race-title"
        className="relative isolate overflow-hidden bg-night text-primary-foreground"
      >
        {trip.imageUrl && (
          // Flat duotone: the photo's luminosity over --night (decorative, the title names the race).
          <div className="absolute inset-0 -z-10 opacity-55 mix-blend-luminosity">
            <Image src={trip.imageUrl} alt="" fill unoptimized preload sizes="100vw" className="object-cover" />
          </div>
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-night/35" />
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-[8%] sm:py-20">
          <p className="text-sm font-semibold wrap-break-word sm:text-base">
            {trip.location} · {trip.raceDate}
          </p>
          <h1 id="race-title" className="mt-4 display-title text-display-section wrap-break-word">
            {trip.title}
          </h1>
          {trip.distances.length > 0 && (
            <p className="mt-5 text-base font-semibold wrap-break-word">{trip.distances.join(" · ")}</p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a
              href="#registro"
              className={cn(
                buttonVariants(),
                "h-auto gap-2 rounded-full bg-highlight px-6 py-3.5 text-base font-semibold whitespace-normal text-night hover:bg-background",
              )}
            >
              Quiero correr esta maratón <ArrowDown aria-hidden />
            </a>
            <Link
              href={packageHref}
              className="inline-flex items-center gap-1 text-base font-semibold underline decoration-highlight decoration-2 underline-offset-[6px]"
            >
              Ver el paquete completo <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {offer && (
        <div className="bg-background px-4 py-12 text-night sm:py-16">
          <OfferSummary offer={offer} className="mx-auto max-w-md" />
        </div>
      )}

      <section id="registro" aria-labelledby="registro-title" className="bg-sky px-4 py-12 text-night sm:py-16">
        <div className="mx-auto flex max-w-md flex-col gap-6">
          <div>
            <h2 id="registro-title" className="display-title text-display-section">
              Regístrate
            </h2>
            <p className="mt-4 text-base leading-relaxed">
              Te escribiremos por WhatsApp para contarte los detalles. Sin pagos.
            </p>
          </div>
          {form}
        </div>
      </section>
    </>
  );
}
