import "server-only";
import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { formatUsdPenRate, parseUsdPenRate, usdToPenCents } from "@/lib/currency";
import { getDb } from "@/lib/db";
import { exchangeRates } from "@/lib/db-schema";
import type { ActiveOffer, ExchangeRate } from "@/modules/trips";
import type { PaymentChoice } from "../schemas/checkout.schema";

export type CheckoutQuote = {
  totalUsd: number;
  principalUsd: number;
  balanceUsd: number;
  rateId: string;
  rateUsdPen: string;
  amountPenCents: number;
};

export function checkoutQuoteHash(input: {
  bookingId: string; kind: "initial" | "balance"; offerVersion: number; termsVersion: string;
  amountUsd: number; amountPenCents: number; rateId: string; rateUsdPen: string;
}): string {
  return createHash("sha256").update(JSON.stringify([
    input.bookingId, input.kind, input.offerVersion, input.termsVersion, input.amountUsd,
    input.amountPenCents, input.rateId, input.rateUsdPen,
  ])).digest("hex");
}

export async function getCurrentCheckoutRate(): Promise<(ExchangeRate & { id: string }) | null> {
  const [row] = await getDb().select({
    id: exchangeRates.id,
    usdPen: exchangeRates.usdPen,
    effectiveFrom: exchangeRates.createdAt,
  }).from(exchangeRates).orderBy(desc(exchangeRates.createdAt), desc(exchangeRates.id)).limit(1);
  if (!row) return null;
  const rateE4 = parseUsdPenRate(row.usdPen);
  if (rateE4 === null) throw new Error("invalid exchange rate row");
  return { ...row, usdPen: formatUsdPenRate(rateE4) };
}

// A deposit index the offer does not have is a client error, not a server failure.
export function createCheckoutQuote(
  offer: ActiveOffer,
  choice: PaymentChoice,
  rate: (ExchangeRate & { id: string }) | null,
): CheckoutQuote | "invalid_payment_choice" {
  if (!rate) throw new Error("exchange rate unavailable");
  const principalUsd = choice.kind === "full"
    ? offer.finalPriceUsd
    : offer.depositOptionsUsd[choice.index];
  if (!principalUsd || principalUsd > offer.finalPriceUsd) return "invalid_payment_choice";
  const rateE4 = parseUsdPenRate(rate.usdPen);
  if (rateE4 === null) throw new Error("invalid exchange rate row");
  return {
    totalUsd: offer.finalPriceUsd,
    principalUsd,
    balanceUsd: offer.finalPriceUsd - principalUsd,
    rateId: rate.id,
    rateUsdPen: formatUsdPenRate(rateE4),
    amountPenCents: usdToPenCents(principalUsd, rateE4),
  };
}
