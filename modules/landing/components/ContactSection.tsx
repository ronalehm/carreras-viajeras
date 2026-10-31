import { INQUIRY_DESTINATIONS, INQUIRY_DESTINATION_IDS } from "@/lib/inquiryDestinations";
import { isRegistrationOpen } from "@/lib/registrationConsent";
import {
  GENERAL_INQUIRY_MESSAGE,
  WHATSAPP_NUMBER,
  buildWhatsAppUrl,
  resolveDestination,
  type LeadAttributionParams,
} from "../utils/inquiry";
import { LeadCaptureForm, RegistrationClosedNotice, type LeadCaptureAction } from "./LeadCaptureForm";

type ContactSectionProps = {
  action: LeadCaptureAction;
  trips: { slug: string; title: string }[];
  destination?: string | string[];
  attribution: LeadAttributionParams;
};

/** /contacto: the same lead form with a race selector (published trips, then destinations without catalog). */
export function ContactSection({ action, trips, destination, attribution }: ContactSectionProps) {
  const options = [
    ...trips.map((trip) => ({ value: trip.slug, label: trip.title })),
    ...INQUIRY_DESTINATION_IDS.map((id) => ({
      value: id,
      label: `${INQUIRY_DESTINATIONS[id].name} · Quiero novedades`,
    })),
  ];
  const defaultValue = resolveDestination(
    destination,
    options.map((option) => option.value),
  );
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
          Cuéntanos qué carrera tienes en mente y te escribiremos por WhatsApp.
          <br />
          Sin pagos. Sin compromiso de reserva.
        </p>
      </div>
      <div className="w-full max-w-md lg:max-w-xl">
        {/* Gate P-L: in production with the placeholder legal text the form is not shown. */}
        {isRegistrationOpen() ? (
          // key: navigating to another ?destino= without unmounting resets the form to its new default.
          <LeadCaptureForm
            key={defaultValue}
            action={action}
            form="contact"
            destination={{ kind: "select", options, defaultValue }}
            attribution={attribution}
            standMode={false}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
            whatsAppUrl={whatsAppUrl}
          />
        ) : (
          <RegistrationClosedNotice whatsAppUrl={whatsAppUrl} />
        )}
      </div>
    </section>
  );
}
