import type { z } from "zod";
import type { bookingStatusEnum, itineraryKindEnum, itineraryStatusEnum } from "@/lib/db-schema";
import type { bookingFormSchema, paymentFormSchema, updateBookingSchema } from "../schemas/bookings.schema";

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


// CRM (bookings.manage). Amounts are integer USD; paidUsd excludes voided payments.
export type BookingInput = z.output<typeof bookingFormSchema>;
export type UpdateBookingInput = z.output<typeof updateBookingSchema>;

export type CrmBookingListItem = {
  id: string;
  participantName: string;
  participantEmail: string;
  status: BookingStatus;
  packageLabel: string;
  totalUsd: number;
  paidUsd: number;
  linked: boolean; // runner_user_id is set; the id itself never leaves the service
  trip: { id: string; title: string };
};

export type CrmBooking = CrmBookingListItem & {
  distance: string | null;
  balanceDueOn: string | null; // YYYY-MM-DD
  internalNote: string | null;
  createdAt: Date;
};

export type PaymentInput = z.output<typeof paymentFormSchema>;

// The CRM sees every payment, voided ones included, with who recorded it.
export type CrmPayment = {
  id: string;
  amountUsd: number;
  paidOn: string; // YYYY-MM-DD
  concept: string;
  recordedByEmail: string;
  voided: boolean;
};

// Fits ConfirmActionState of components/shared/ConfirmActionButton.
export type BookingActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input" | "invalid_trip" | "duplicate"
        | "email_locked" | "not_found" | "invalid_transition";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
