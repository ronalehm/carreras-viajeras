// Pure booking and timeline logic for the runner portal. Only used on the server: @/modules/trips
// re-exports server-only services alongside formatTripPrice.
import { formatTripPrice } from "@/modules/trips";
import type {
  ItineraryStatus,
  PaymentSummary,
  RunnerBookingDetail,
  RunnerBookingSummary,
  RunnerPayment,
  RunnerTrip,
  ScheduleEdge,
  Timeline,
  TimelineEntry,
} from "../types/bookings.types";
import { ITINERARY_KIND_LABELS, limaDate } from "./bookingDisplay";

// Dates are YYYY-MM-DD, so string comparison is chronological.
function byDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isTripFinished(trip: Pick<RunnerTrip, "raceDate" | "endDate">, today: string): boolean {
  return today > (trip.endDate ?? trip.raceDate);
}

// Requirement 7: active by race date asc, then finished, then cancelled, both by race date desc.
export function orderRunnerBookings<T extends RunnerBookingSummary>(bookings: readonly T[], today: string): T[] {
  const rank = (b: T) => (b.status === "cancelled" ? 2 : isTripFinished(b.trip, today) ? 1 : 0);
  return [...bookings].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const date = byDate(a.trip.raceDate, b.trip.raceDate);
    return rank(a) === 0 ? date : -date;
  });
}

// Payments are already non-voided (the service filters them). Balance < 0 is credit in favour.
export function getPaymentSummary(
  totalUsd: number,
  payments: readonly RunnerPayment[],
  balanceDueOn: string | null,
): PaymentSummary {
  const paidUsd = payments.reduce((sum, p) => sum + p.amountUsd, 0);
  const balanceUsd = totalUsd - paidUsd;
  const completed = balanceUsd <= 0;
  return {
    totalUsd,
    paidUsd,
    balanceUsd,
    dueOn: completed ? null : balanceDueOn,
    status: completed ? "completed" : "pending",
  };
}

const PREPARATION_KINDS: readonly TimelineEntry["kind"][] = ["document", "registration"];
// Enum order: flight, transfer, hotel, activity, race, return.
const TRIP_KINDS: readonly TimelineEntry["kind"][] = ["flight", "transfer", "hotel", "activity", "race", "return"];

function dateOnly(date: string): ScheduleEdge {
  return { date, time: null, timeZone: null };
}

function derivedEntry(
  entry: Pick<TimelineEntry, "key" | "kind" | "status" | "title" | "start"> & Partial<TimelineEntry>,
): TimelineEntry {
  return { details: null, location: null, end: null, ...entry, derived: true };
}

const BOOKING_TIMELINE_STATUS: Record<RunnerBookingDetail["status"], ItineraryStatus> = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
};

function byTitle(a: TimelineEntry, b: TimelineEntry): number {
  return a.title.localeCompare(b.title, "es");
}

// (date, time — no time first —, kind, title); undated last. Local wall-clock times: see Decision 7.
function byStart(a: TimelineEntry, b: TimelineEntry): number {
  if (!a.start || !b.start) return (a.start ? 0 : 1) - (b.start ? 0 : 1);
  return (
    byDate(a.start.date, b.start.date) ||
    byDate(a.start.time ?? "", b.start.time ?? "") ||
    TRIP_KINDS.indexOf(a.kind) - TRIP_KINDS.indexOf(b.kind)
  );
}

export function buildTimeline(detail: RunnerBookingDetail, today: string): Timeline {
  const items: TimelineEntry[] = detail.items.map((item) => ({ ...item, key: item.id, derived: false }));

  const payment = getPaymentSummary(detail.totalUsd, detail.payments, detail.balanceDueOn);
  const preparation = [
    derivedEntry({
      key: "booking",
      kind: "booking",
      status: BOOKING_TIMELINE_STATUS[detail.status],
      title: "Reserva",
      start: dateOnly(limaDate(detail.createdAt)),
    }),
    derivedEntry({
      key: "payments",
      kind: "payments",
      status: payment.status,
      title: "Pagos",
      details: `Pagado ${formatTripPrice(payment.paidUsd)} de ${formatTripPrice(payment.totalUsd)}`,
      start: payment.dueOn ? dateOnly(payment.dueOn) : null,
    }),
    ...PREPARATION_KINDS.flatMap((kind) =>
      items.filter((i) => i.kind === kind).sort((a, b) => byStart(a, b) || byTitle(a, b)),
    ),
  ];

  const tripItems = items.filter((i) => TRIP_KINDS.includes(i.kind));
  // A visible race item replaces the one derived from the catalog.
  if (!tripItems.some((i) => i.kind === "race")) {
    tripItems.push(
      derivedEntry({
        key: "race",
        kind: "race",
        status: today > detail.trip.raceDate ? "completed" : "confirmed",
        title: ITINERARY_KIND_LABELS.race,
        location: `${detail.trip.city}, ${detail.trip.country}`,
        start: dateOnly(detail.trip.raceDate),
      }),
    );
  }

  const trip = tripItems.filter((i) => i.start).sort((a, b) => byStart(a, b) || byTitle(a, b));
  const unscheduled = tripItems
    .filter((i) => !i.start)
    .sort((a, b) => TRIP_KINDS.indexOf(a.kind) - TRIP_KINDS.indexOf(b.kind) || byTitle(a, b));

  // Decision 9.
  const settled: readonly ItineraryStatus[] = ["confirmed", "completed", "cancelled"];
  const itineraryConfirmed =
    unscheduled.length === 0 && trip.every((e) => settled.includes(e.status)) && trip.some((e) => !e.derived);

  return { preparation, trip, unscheduled, itineraryConfirmed };
}
