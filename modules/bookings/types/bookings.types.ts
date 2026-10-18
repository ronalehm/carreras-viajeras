import type { bookingStatusEnum, itineraryKindEnum, itineraryStatusEnum } from "@/lib/db-schema";

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type ItineraryKind = (typeof itineraryKindEnum.enumValues)[number];
export type ItineraryStatus = (typeof itineraryStatusEnum.enumValues)[number];

// Dates are calendar dates (YYYY-MM-DD).
export type RunnerTrip = {
  title: string;
  city: string;
  country: string;
  raceDate: string;
  startDate: string | null;
  endDate: string | null;
  includes: string[];
};

export type RunnerBookingSummary = { id: string; status: BookingStatus; trip: RunnerTrip };

// Only non-voided payments reach the runner. Amounts are integer USD.
export type RunnerPayment = { id: string; amountUsd: number; paidOn: string; concept: string };

// Wall-clock time (HH:MM) at the place, with its IANA zone; no time → no zone.
export type ScheduleEdge = { date: string; time: string | null; timeZone: string | null };

export type RunnerItineraryItem = {
  id: string;
  kind: ItineraryKind;
  status: ItineraryStatus;
  title: string;
  details: string | null;
  location: string | null;
  start: ScheduleEdge | null;
  end: ScheduleEdge | null;
};

export type RunnerTripUpdate = { id: string; title: string; body: string; publishedAt: Date };

export type RunnerBookingDetail = RunnerBookingSummary & {
  packageLabel: string;
  distance: string | null;
  totalUsd: number;
  balanceDueOn: string | null;
  createdAt: Date;
  payments: RunnerPayment[];
  items: RunnerItineraryItem[];
  updates: RunnerTripUpdate[];
};

export type RunnerPortalData = { bookings: RunnerBookingSummary[]; selected: RunnerBookingDetail | null };

export type PaymentSummary = {
  totalUsd: number;
  paidUsd: number;
  balanceUsd: number;
  dueOn: string | null;
  status: "pending" | "completed";
};

// Derived entries ("booking", "payments") carry their single date in `start`:
// the booking's creation day, or the balance due date.
export type TimelineEntry = {
  key: string;
  kind: ItineraryKind | "booking" | "payments";
  status: ItineraryStatus;
  title: string;
  details: string | null;
  location: string | null;
  start: ScheduleEdge | null;
  end: ScheduleEdge | null;
  derived: boolean;
};

export type Timeline = {
  preparation: TimelineEntry[];
  trip: TimelineEntry[];
  unscheduled: TimelineEntry[];
  itineraryConfirmed: boolean;
};
