import type { z } from "zod";
import type { bookingStatusEnum, itineraryKindEnum, itineraryStatusEnum } from "@/lib/db-schema";
import type { bookingFormSchema, paymentFormSchema, updateBookingSchema } from "../schemas/bookings.schema";

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];

export type PaymentInput = z.output<typeof paymentFormSchema>;
export type CrmPayment = {
  id: string; amountUsd: number; paidOn: string; concept: string;
  recordedByEmail: string; voided: boolean;
};
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

// simulated: a demo-checkout booking (Stripe test mode), never a real sale.
export type RunnerBookingSummary = { id: string; status: BookingStatus; simulated: boolean; trip: RunnerTrip };

// Only non-voided payments reach the runner. Amounts are integer USD.
export type RunnerPayment = { id: string; amountUsd: number; paidOn: string; concept: string };

// A Stripe settlement as a payment entry: paidOn is the Lima date of Stripe's paid_at.
export type StripePayment = { id: string; amountUsd: number; paidOn: string };

// Common balance (bookings-stripe-checkout-production.md, Lógica E): paid = non-voided manual
// payments + applied Stripe settlements; needs_review settlements never count and come apart.
export type BookingBalance = {
  totalUsd: number;
  paidUsd: number;
  balanceUsd: number;
  stripePayments: StripePayment[];
  needsReview: StripePayment[];
};

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

// paidUsd comes from the common balance; payments is the history (manual and applied Stripe).
export type RunnerBookingDetail = RunnerBookingSummary & {
  packageLabel: string;
  distance: string | null;
  totalUsd: number;
  paidUsd: number;
  paymentInReview: boolean; // a Stripe settlement needs_review: not counted as paid
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


// CRM (bookings.manage). Amounts are integer USD; paidUsd and balanceUsd come from the common balance.
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
  balanceUsd: number;
  paymentInReview: boolean; // a Stripe settlement needs_review (reconciliation)
  simulated: boolean; // demo checkout: never mixed into real totals
  linked: boolean; // runner_user_id is set; the id itself never leaves the service
  trip: { id: string; title: string };
};

// ?tipo= of the CRM list: real bookings by default, simulated ones apart.
export type BookingListFilter = { tripId?: string; simulated: boolean };

export type CrmBooking = CrmBookingListItem & {
  priceLocked: boolean;
  distance: string | null;
  balanceDueOn: string | null; // YYYY-MM-DD
  internalNote: string | null;
  createdAt: Date;
  lead: { id: string; fullName: string } | null; // bookings.lead_id, set only on creation
  stripePayments: StripePayment[];
  needsReview: StripePayment[];
};

// Fits ConfirmActionState of components/shared/ConfirmActionButton.
export type BookingActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input" | "invalid_trip" | "duplicate"
        | "email_locked" | "not_found" | "invalid_transition" | "invalid_lead" | "lead_taken"
        | "payment_conflict" | "discount_locked";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
