import type { z } from "zod";
import type {
  createOfferSchema,
  offerFormSchema,
  offerStatusSchema,
} from "../schemas/offers.schema";

export type OfferStatus = z.infer<typeof offerStatusSchema>;
export type OfferInput = z.output<typeof offerFormSchema>;
export type CreateOfferInput = z.output<typeof createOfferSchema>;

// One version of an offer, as listed in the CRM (also the rows of a scope's history).
export type OfferListItem = {
  id: string;
  version: number;
  status: OfferStatus;
  name: string; // internal, CRM only
  trip: { id: string; slug: string; title: string };
  campaign: { id: string; code: string; name: string; status: "active" | "closed" } | null; // null = general offer
  finalPriceUsd: number;
  validFrom: string; // YYYY-MM-DD, Lima calendar date
  validUntil: string | null;
  approvedAt: Date | null;
  activatedAt: Date | null;
  closedAt: Date | null;
};

export type OfferDetail = OfferListItem &
  OfferInput & {
    totalPriceUsd: number;
    discountUsd: number;
    createdAt: Date;
    createdBy: { email: string };
    approvedBy: { email: string } | null;
    activatedBy: { email: string } | null;
    closedBy: { email: string } | null;
    supersededByVersion: number | null;
    history: OfferListItem[]; // every version of the scope, version DESC
  };

// The offer in force for a trip (and optional campaign), for the bookings specs. offerVersionId is
// trip_offers.id: immutable since its approval.
export type ActiveOffer = {
  offerVersionId: string;
  tripId: string;
  campaignId: string | null;
  version: number;
  totalPriceUsd: number;
  discountUsd: number;
  finalPriceUsd: number;
  depositOptionsUsd: number[]; // 0..3, ascending, each < finalPriceUsd
  balanceDueOn: string | null; // YYYY-MM-DD; set only when there are deposits
  bonusDescription: string | null; // non-monetary
  validFrom: string;
  validUntil: string | null;
  capacityLimit: number | null;
  termsVersion: string;
  conditions: string;
  approvedAt: Date;
  activatedAt: Date;
};

// Public read: no ids, internal name, campaign, seats or audit.
export type PublicOffer = Pick<
  ActiveOffer,
  | "totalPriceUsd"
  | "discountUsd"
  | "finalPriceUsd"
  | "depositOptionsUsd"
  | "balanceDueOn"
  | "bonusDescription"
  | "validFrom"
  | "validUntil"
  | "termsVersion"
  | "conditions"
>;

export type ExchangeRate = { usdPen: string; effectiveFrom: Date }; // usdPen "3.7500"
export type ExchangeRateListItem = ExchangeRate & { id: string; createdBy: { email: string } };
export type PublicOfferRead = { offer: PublicOffer; exchangeRate: ExchangeRate | null };

export type OfferActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input" | "invalid_trip" | "invalid_campaign"
        | "pending_exists" | "not_found" | "not_draft" | "invalid_transition" | "expired"
        | "not_started" | "trip_archived" | "campaign_closed";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };

export type ExchangeRateActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
