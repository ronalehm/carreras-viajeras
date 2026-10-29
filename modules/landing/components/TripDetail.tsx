import Image from "next/image";
import { ArrowUpRight, Check, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfferView } from "../utils/catalogOffer";
import type { TripLanding } from "../utils/catalogTrip";
import { buildTripInquiryMessage, buildWhatsAppUrl, WHATSAPP_NUMBER } from "../utils/inquiry";
import { OfferSummary } from "./OfferSummary";

const section = "border-t border-primary/15 pt-8";
const sectionTitle = "mb-4 text-sm font-bold tracking-wide";
const fullWidthButton = "h-auto w-full py-3 text-base font-bold whitespace-normal";

type TripDetailProps = {
  trip: TripLanding;
  offer: OfferView | null;
  registrationHref: string | null; // null → registration closed (gate P-L): WhatsApp only
};

// The price section is the offer in force (resolved by the server) or a notice without amounts.
export function TripDetail({ trip, offer, registrationHref }: TripDetailProps) {
  const facts = [
    { label: "Carrera", value: trip.raceDate },
    { label: "Viaje", value: trip.travelDates ?? "Fechas por confirmar" },
    { label: "Distancias", value: trip.distances.join(" · ") },
    { label: "Cupos", value: trip.capacity },
  ];
  const whatsAppUrl = buildWhatsAppUrl(
    WHATSAPP_NUMBER,
    buildTripInquiryMessage({ title: trip.title, raceDate: trip.raceDate, location: trip.location }),
  );
  // Plain <a>: the registration page is not prefetched.
  const registrationLink = registrationHref ? (
    <a href={registrationHref} className={cn(buttonVariants({ size: "lg" }), fullWidthButton)}>
      Registrarme
    </a>
  ) : null;

  const hasDetails = trip.includes.length > 0 || trip.excludes.length > 0 || trip.notes.length > 0;

  // DOM order is the mobile order. On lg the body has two rows: [image, facts] and [details], with
  // the action block spanning both in the right column. The last row is 1fr so that, when the
  // action block is taller, the extra height goes below the details instead of between rows.
  return (
    <article
      className={cn(
        "mx-auto grid max-w-2xl grid-cols-1 gap-10 px-4 py-12 text-primary sm:py-16",
        "lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-12",
        hasDetails && "lg:grid-rows-[auto_auto_1fr]",
      )}
    >
      <header className="lg:col-span-2">
        <p className="text-sm wrap-break-word">{[trip.location, ...trip.distances].join(" · ")}</p>
        <h1 className="mt-3 font-heading text-4xl leading-tight font-bold tracking-tight wrap-break-word sm:text-5xl">
          {trip.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed wrap-break-word">{trip.summary}</p>
      </header>

      <div className="grid min-w-0 gap-10 lg:col-start-1">
        {trip.imageUrl && (
          <div className="relative aspect-video overflow-hidden rounded-lg">
            <Image
              src={trip.imageUrl}
              alt={`Imagen de ${trip.title}`}
              fill
              unoptimized
              preload
              sizes="(min-width: 1024px) 688px, (min-width: 672px) 672px, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <section aria-labelledby="trip-facts-title" className={section}>
          <h2 id="trip-facts-title" className="sr-only">
            Datos clave
          </h2>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {facts.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs">{label}</dt>
                <dd className="mt-1 font-bold">{value}</dd>
              </div>
            ))}
            {trip.officialUrl && (
              <div>
                <dt className="text-xs">Web oficial</dt>
                <dd className="mt-1 font-bold">
                  <a
                    href={trip.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline underline-offset-4"
                  >
                    Ver web oficial <ArrowUpRight aria-hidden className="size-4" />
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <aside
        aria-label="Precio y registro"
        className={cn(
          section,
          "grid min-w-0 gap-8",
          "lg:sticky lg:top-32 lg:col-start-2 lg:row-start-2 lg:self-start lg:rounded-xl lg:border lg:bg-card lg:p-6",
          // Capped to the viewport below the site header: the price scrolls inside, the actions stay.
          "lg:flex lg:max-h-[calc(100dvh-9rem)] lg:flex-col lg:gap-4",
          hasDetails && "lg:row-span-2",
        )}
      >
        <div className="lg:min-h-0 lg:overflow-y-auto">
          {offer ? (
            <OfferSummary offer={offer} />
          ) : (
            <section aria-labelledby="trip-price-title">
              <h2 id="trip-price-title" className="sr-only">
                Precio
              </h2>
              <p className="text-base font-bold">Todavía no publicamos el precio de este viaje.</p>
            </section>
          )}
        </div>

        <div className="lg:shrink-0 lg:border-t lg:border-primary/15 lg:pt-4">
          {registrationLink}
          {whatsAppUrl && (
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants(registrationHref ? { size: "lg", variant: "outline" } : { size: "lg" }),
                fullWidthButton,
                registrationHref && "mt-3",
              )}
            >
              Consultar por WhatsApp <ArrowUpRight aria-hidden />
            </a>
          )}
          <p className="mt-4 text-xs leading-relaxed">
            Consulta sin compromiso. Los cupos son informativos y no reflejan disponibilidad en
            tiempo real. No se reciben pagos en la web.
          </p>
        </div>
      </aside>

      {hasDetails && (
        <div className="grid min-w-0 gap-10 lg:col-start-1">
          {trip.includes.length > 0 && (
            <section aria-labelledby="trip-includes-title" className={section}>
              <h2 id="trip-includes-title" className={sectionTitle}>
                Qué incluye
              </h2>
              <ul className="grid gap-2.5 text-sm">
                {trip.includes.map((item, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-highlight" />
                    <span className="min-w-0 wrap-break-word">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {trip.excludes.length > 0 && (
            <section aria-labelledby="trip-excludes-title" className={section}>
              <h2 id="trip-excludes-title" className={sectionTitle}>
                No incluye
              </h2>
              <ul className="grid gap-2.5 text-sm">
                {trip.excludes.map((item, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <X aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 wrap-break-word">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {trip.notes.length > 0 && (
            <section aria-labelledby="trip-notes-title" className={section}>
              <details open>
                <summary id="trip-notes-title" className={cn(sectionTitle, "cursor-pointer")}>
                  Detalles por confirmar
                </summary>
                {trip.notes.map((paragraph, index) => (
                  <p key={index} className="mb-3 text-sm leading-relaxed wrap-break-word">
                    {paragraph}
                  </p>
                ))}
              </details>
            </section>
          )}
        </div>
      )}
    </article>
  );
}
