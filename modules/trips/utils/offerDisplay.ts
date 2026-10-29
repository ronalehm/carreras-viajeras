// No server-only: the CRM and, later, the landing format offers with these helpers. Pure: dates are
// YYYY-MM-DD strings and "today" is passed in, so nothing depends on the process time zone.
import { compareToToday } from "@/lib/dates";
import type { OfferListItem, OfferStatus } from "../types/offers.types";
import { formatTripDate, formatTripDateRange } from "./tripDisplay";

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Borrador",
  approved: "Aprobada",
  active: "Activa",
  closed: "Cerrada",
};

// Validity dates are inclusive Lima calendar dates (YYYY-MM-DD); today comes from getTodayDate().
export function offerTiming(
  validFrom: string,
  validUntil: string | null,
  today: string,
): "scheduled" | "in_force" | "expired" {
  if (compareToToday(validFrom, today) === "future") return "scheduled";
  if (validUntil !== null && compareToToday(validUntil, today) === "past") return "expired";
  return "in_force";
}

export function offerValidityText(validFrom: string, validUntil: string | null): string {
  if (validUntil === null) return `Precio vigente desde el ${formatTripDate(validFrom)}.`;
  return `Precio válido: ${formatTripDateRange(validFrom, validUntil)} (hora de Lima).`;
}

export function offerScopeLabel(
  campaign: Pick<NonNullable<OfferListItem["campaign"]>, "code" | "name"> | null,
): string {
  return campaign ? `Campaña ${campaign.name} (${campaign.code})` : "General";
}
