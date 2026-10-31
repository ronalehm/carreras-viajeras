import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  GENERAL_INQUIRY_MESSAGE,
  WHATSAPP_NUMBER,
  buildWhatsAppUrl,
  registrationHref,
  type LeadAttributionParams,
} from "../utils/inquiry";
import { WhatsAppLink } from "./LeadCaptureForm";

type ContactSectionProps = {
  trips: { slug: string; title: string }[];
  attribution: LeadAttributionParams;
};

/**
 * /contacto without a form: the only data form is each race's "Pide información". This page lists
 * the published races (keeping the URL attribution) and offers WhatsApp for anything else.
 */
export function ContactSection({ trips, attribution }: ContactSectionProps) {
  const whatsAppUrl = buildWhatsAppUrl(WHATSAPP_NUMBER, GENERAL_INQUIRY_MESSAGE);

  return (
    <section
      id="quiero-ir"
      aria-labelledby="contact-title"
      className="grid gap-8 bg-sky px-4 py-12 text-night sm:grid-cols-[1fr_1.1fr] sm:gap-[5%] sm:px-[8%] sm:py-16 lg:gap-[8%]"
    >
      <div>
        <p className="mb-6 text-xs font-bold tracking-[0.2em]">EL PRIMER PASO ES DECIDIRTE</p>
        <h1 id="contact-title" className="mb-6 display-title text-display-section">
          Tu próxima historia empieza aquí.
        </h1>
        <p className="text-base leading-relaxed text-asphalt">
          Elige tu carrera y pide información: te escribiremos por WhatsApp. Sin pagos. Sin compromiso
          de reserva.
        </p>
      </div>
      <div className="grid content-start gap-6">
        {trips.length > 0 && (
          <ul aria-label="Carreras disponibles" className="grid gap-3">
            {trips.map((trip) => (
              <li key={trip.slug}>
                <Link
                  href={registrationHref(trip.slug, attribution)}
                  className="flex items-center justify-between gap-4 rounded-xl border border-primary/15 bg-background p-5 font-semibold no-underline transition-colors hover:border-primary"
                >
                  {trip.title}
                  <span className="flex items-center gap-1 text-sm text-primary">
                    Pide información <ArrowUpRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {whatsAppUrl && (
          <p className="text-base">
            ¿Otra carrera o una duda?{" "}
            <WhatsAppLink href={whatsAppUrl}>Escríbenos por WhatsApp</WhatsAppLink>
          </p>
        )}
      </div>
    </section>
  );
}
