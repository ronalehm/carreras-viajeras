// No server-only: labels and formatting are shared by CRM client forms and the runner portal.
// Type-only imports keep the bundle small.
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { BookingStatus, ItineraryKind, ItineraryStatus, ScheduleEdge } from "../types/bookings.types";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const BOOKINGS_PATH = "/crm/reservas";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pendiente de confirmación",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

// Distinctive of a demo-checkout booking (bookings-stripe-checkout-demo.md, C) in the portal and the CRM.
export const SIMULATED_BOOKING_LABEL = "SIMULADA";
// ?tipo= values of the CRM list: only simulated or only real bookings. Absent or unknown lists both.
export const BOOKING_KIND_SIMULATED = "simuladas";
export const BOOKING_KIND_REAL = "reales";
// Concept of a Stripe settlement in the portal and CRM payment histories.
export const STRIPE_PAYMENT_CONCEPT = "Stripe - tarjeta";

export const ITINERARY_STATUS_LABELS: Record<ItineraryStatus, string> = {
  pending: "Pendiente",
  provisional: "Provisional",
  confirmed: "Confirmado",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const ITINERARY_KIND_LABELS: Record<ItineraryKind, string> = {
  document: "Documentación",
  registration: "Inscripción",
  flight: "Vuelo",
  transfer: "Traslado",
  hotel: "Hotel",
  activity: "Actividad",
  race: "Día de carrera",
  return: "Retorno",
};

export const ITINERARY_STATUS_BADGE: Record<ItineraryStatus, { variant: BadgeVariant; className?: string }> = {
  pending: { variant: "outline" },
  provisional: { variant: "outline", className: "border-dashed border-primary/50" },
  confirmed: { variant: "default" },
  completed: { variant: "outline", className: "border-highlight bg-highlight/15" },
  cancelled: { variant: "secondary", className: "line-through" },
};

const DEPARTURE = { start: "Sale", end: "Llega" };
const STAY = { start: "Entrada", end: "Salida" };
const SPAN = { start: "Inicio", end: "Fin" };

export const SCHEDULE_EDGE_LABELS: Record<ItineraryKind, { start: string; end: string }> = {
  document: SPAN,
  registration: SPAN,
  flight: DEPARTURE,
  transfer: DEPARTURE,
  hotel: STAY,
  activity: SPAN,
  race: SPAN,
  return: DEPARTURE,
};

// "en-CA" formats as YYYY-MM-DD. Independent of the process TZ.
const limaDateFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Lima",
});

// Calendar dates have no zone; formatting in UTC keeps the day fixed.
const shortDateFormat = new Intl.DateTimeFormat("es", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function limaDate(instant: Date): string {
  return limaDateFormat.format(instant);
}

export function formatShortDate(date: string): string {
  return shortDateFormat.format(new Date(`${date}T00:00:00Z`));
}

export function timeZoneLabel(timeZone: string): string {
  return `hora de ${timeZone.split("/").at(-1)!.replaceAll("_", " ")}`;
}

// Shown as stored, never converted to Lima time (Decision 17).
export function formatScheduleEdge(edge: ScheduleEdge): string {
  const date = formatShortDate(edge.date);
  if (!edge.time) return date;
  return [date, "·", edge.time, edge.timeZone && timeZoneLabel(edge.timeZone)].filter(Boolean).join(" ");
}

export function firstName(name?: string): string | undefined {
  return name?.trim().split(/\s+/)[0] || undefined;
}
