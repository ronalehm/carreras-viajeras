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

// The price section is the offer in force (resolved by the server) or a notice without amounts.
export function TripDetail({ trip, offer }: { trip: TripLanding; offer: OfferView | null }) {
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

  return (
    <article className="mx-auto grid max-w-2xl grid-cols-1 gap-10 px-4 py-12 text-primary sm:py-16">
      <header>
        <p className="text-sm wrap-break-word">{[trip.location, ...trip.distances].join(" · ")}</p>
        <h1 className="mt-3 font-heading text-4xl leading-tight font-bold tracking-tight wrap-break-word sm:text-5xl">
          {trip.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed wrap-break-word">{trip.summary}</p>
        {trip.imageUrl && (
          <div className="relative mt-8 aspect-video overflow-hidden rounded-lg">
            <Image
              src={trip.imageUrl}
              alt={`Imagen de ${trip.title}`}
              fill
              unoptimized
              preload
              sizes="(min-width: 672px) 672px, 100vw"
              className="object-cover"
            />
          </div>
        )}
      </header>

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

      {offer ? (
        <OfferSummary offer={offer} className={section} />
      ) : (
        <section aria-labelledby="trip-price-title" className={section}>
          <h2 id="trip-price-title" className="sr-only">
            Precio
          </h2>
          <p className="text-base font-bold">Todavía no publicamos el precio de este viaje.</p>
        </section>
      )}

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

      <div className={section}>
        {whatsAppUrl && (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-auto w-full py-3 text-base font-bold whitespace-normal",
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
    </article>
  );
}
