import { cache } from "react";
import { formatPenCents, formatUsdPenRate, parseUsdPenRate, usdToPenCents } from "@/lib/currency";
import { getTodayDate } from "@/lib/dates";
import {
  formatTripDate,
  formatTripPrice,
  getPublicOffer,
  offerValidityText,
  type PublicOfferRead,
} from "@/modules/trips";
import { paragraphs } from "./catalogTrip";

/**
 * What the public price block renders: the offer in force, already formatted. USD amounts with
 * their soles at the current rate (null when there is no rate). No ids, internal name, campaign,
 * capacity or audit: PublicOfferRead does not carry them.
 */
export type OfferView = {
  totalPrice: string; // "US$ 2,000"
  totalPricePen: string | null; // "S/ 7,500.00"
  discount: string | null; // null when the discount is 0
  discountPen: string | null;
  finalPrice: string;
  finalPricePen: string | null;
  deposits: { deposit: string; depositPen: string | null; balance: string; balancePen: string | null }[];
  balanceDueOn: string | null; // "15 de marzo de 2027"
  bonus: string | null; // without a trailing period: the block appends its own sentence
  validity: string; // offerValidityText
  conditions: string[]; // paragraphs
  termsVersion: string;
  exchangeRate: { rate: string; since: string } | null; // "3.7500", Lima calendar date of effectiveFrom
};

/** Pure: formats a public offer. Each amount is converted to soles on its own (lib/currency). */
export function toOfferView({ offer, exchangeRate }: PublicOfferRead): OfferView {
  const rateE4 = exchangeRate ? parseUsdPenRate(exchangeRate.usdPen) : null;
  const pen = (usd: number) => (rateE4 === null ? null : formatPenCents(usdToPenCents(usd, rateE4)));
  const hasDiscount = offer.discountUsd > 0;

  return {
    totalPrice: formatTripPrice(offer.totalPriceUsd),
    totalPricePen: pen(offer.totalPriceUsd),
    discount: hasDiscount ? formatTripPrice(offer.discountUsd) : null,
    discountPen: hasDiscount ? pen(offer.discountUsd) : null,
    finalPrice: formatTripPrice(offer.finalPriceUsd),
    finalPricePen: pen(offer.finalPriceUsd),
    deposits: offer.depositOptionsUsd.map((depositUsd) => {
      const balanceUsd = offer.finalPriceUsd - depositUsd;
      return {
        deposit: formatTripPrice(depositUsd),
        depositPen: pen(depositUsd),
        balance: formatTripPrice(balanceUsd),
        balancePen: pen(balanceUsd),
      };
    }),
    balanceDueOn: offer.balanceDueOn === null ? null : formatTripDate(offer.balanceDueOn),
    bonus: offer.bonusDescription === null ? null : offer.bonusDescription.replace(/[\s.]+$/, ""),
    validity: offerValidityText(offer.validFrom, offer.validUntil),
    conditions: paragraphs(offer.conditions),
    termsVersion: offer.termsVersion,
    exchangeRate:
      exchangeRate && rateE4 !== null
        ? { rate: formatUsdPenRate(rateE4), since: formatTripDate(getTodayDate(exchangeRate.effectiveFrom)) }
        : null,
  };
}

// Read by GET /api/viajes/[slug] (React cache dedupes repeated calls within one request). Only the
// slug and the ?c= code reach the service, which validates both and decides the offer
// (Requirement 5); no amount comes from the URL. Database errors propagate on purpose, like
// getCatalogTrip: the endpoint turns them into 503 trip_unavailable.
export const getCatalogOffer = cache(
  async (slug: string, campaignCode: string | null): Promise<OfferView | null> => {
    const read = await getPublicOffer(slug, campaignCode);
    return read ? toOfferView(read) : null;
  },
);
