import "server-only";
import { createHash } from "node:crypto";
import { parseUsdPenRate, usdToPenCents } from "@/lib/currency";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, campaigns, leads, trips } from "@/lib/db-schema";
import { getActiveOffer } from "@/modules/trips";
import { getCheckoutContractVersion } from "@/modules/contracts";
import type { CurrentUser } from "@/lib/auth/guards";
import { checkoutQuoteHash, createCheckoutQuote, getCurrentCheckoutRate } from "./quote.service";
import {
  findResumableCheckoutBooking,
  getCheckoutReservation,
  isCheckoutEnabled,
  persistCheckoutReservation,
  type ReservationRecord,
} from "./bookingCheckout.service";
import type { PrepareCheckoutInput } from "../schemas/checkout.schema";

type QuoteAmounts = { amountUsd: number; amountPenCents: number; quoteHash: string };
// Server-side record used to accept the contract: carries the contract version fingerprint.
export type PreparedCheckout = {
  bookingId: string;
  tripTitle: string;
  offerVersion: number;
  quote: ReservationRecord["quote"];
  checkoutQuotes: { initial: QuoteAmounts; balance: QuoteAmounts | null };
  contract: { versionKey: string; title: string; documentHash: string; testDocument: boolean };
  // The full document the runner accepts, contract body included: the only copy of that body.
  documentSnapshot: string;
  documentHash: string;
  expiresAt: Date;
};
// What the browser receives: no rate id, no contract fingerprint and a single document body.
export type PreparedCheckoutView = Omit<PreparedCheckout, "quote" | "contract"> & {
  quote: Omit<ReservationRecord["quote"], "rateId">;
  contract: { versionKey: string; title: string; testDocument: boolean };
  // True when an active reservation of this runner for the trip was resumed instead of created.
  resumed: boolean;
};
export type PrepareCheckoutResult = PreparedCheckoutView | "offer_unavailable" | "rate_unavailable" |
  "contract_unavailable" | "registration_required" | "sold_out" | "request_conflict" | "booking_exists" |
  "invalid_payment_choice";

function documentFor(
  reservation: ReservationRecord,
  contract: { title: string; body: string; versionKey: string },
): { document: string; hash: string } {
  const document = [
    "Viaje: " + reservation.packageLabel,
    "Versión de oferta: " + reservation.offerVersion + "; términos: " + reservation.termsVersion,
    "Precio total: US$ " + reservation.quote.totalUsd,
    "Pago inicial: US$ " + reservation.quote.principalUsd + "; saldo: US$ " + reservation.quote.balanceUsd,
    "Conversión confirmada: " + reservation.quote.rateUsdPen + " PEN/USD; cobro inicial: " +
      reservation.quote.amountPenCents + " céntimos PEN",
    "Condiciones de la oferta:\n" + reservation.conditions,
    "Incluye:\n" + reservation.tripIncludes.map(item => "- " + item).join("\n"),
    "No incluye:\n" + reservation.tripExcludes.map(item => "- " + item).join("\n"),
    "Contrato " + contract.title + " (" + contract.versionKey + "):\n" + contract.body,
  ].join("\n\n");
  if (document.length > 100000) throw new Error("checkout contract too long");
  return { document, hash: createHash("sha256").update(document).digest("hex") };
}

function prepared(reservation: ReservationRecord, contract: { title: string; body: string; versionKey: string; documentHash: string | null; reviewHash: string; status: "draft" | "approved" }): PreparedCheckout {
  const snapshot = documentFor(reservation, contract);
  const contractHash=contract.documentHash??contract.reviewHash;
  const balanceUsd = reservation.quote.balanceUsd;
  const rateE4 = parseUsdPenRate(reservation.quote.rateUsdPen);
  if (rateE4 === null) throw new Error("invalid checkout rate");
  const balancePenCents = usdToPenCents(balanceUsd, rateE4);
  return {
    bookingId: reservation.id,
    tripTitle: reservation.packageLabel,
    offerVersion: reservation.offerVersion,
    quote: reservation.quote,
    checkoutQuotes: {
      initial: { amountUsd: reservation.quote.principalUsd, amountPenCents: reservation.quote.amountPenCents,
        quoteHash: checkoutQuoteHash({ bookingId: reservation.id, kind: "initial", offerVersion: reservation.offerVersion,
          termsVersion: reservation.termsVersion, amountUsd: reservation.quote.principalUsd,
          amountPenCents: reservation.quote.amountPenCents, rateId: reservation.quote.rateId, rateUsdPen: reservation.quote.rateUsdPen }) },
      balance: balanceUsd > 0 ? {
        amountUsd: balanceUsd,
        amountPenCents: balancePenCents,
        quoteHash: checkoutQuoteHash({ bookingId: reservation.id, kind: "balance", offerVersion: reservation.offerVersion,
          termsVersion: reservation.termsVersion, amountUsd: balanceUsd, amountPenCents: balancePenCents,
          rateId: reservation.quote.rateId, rateUsdPen: reservation.quote.rateUsdPen }),
      } : null,
    },
    contract: { versionKey: contract.versionKey, title: contract.title, documentHash: contractHash, testDocument: contract.status === "draft" },
    documentSnapshot: snapshot.document,
    documentHash: snapshot.hash,
    expiresAt: reservation.expiresAt,
  };
}

function view(prepared: PreparedCheckout, resumed: boolean): PreparedCheckoutView {
  const { totalUsd, principalUsd, balanceUsd, rateUsdPen, amountPenCents } = prepared.quote;
  return {
    ...prepared, resumed, quote: { totalUsd, principalUsd, balanceUsd, rateUsdPen, amountPenCents },
    contract: { versionKey: prepared.contract.versionKey, title: prepared.contract.title, testDocument: prepared.contract.testDocument },
  };
}

// A runner's active reservation for this trip is resumed whatever payment choice is sent now: its
// snapshot (price, rate, contract) is authoritative. Another account's booking stays `booking_exists`.
async function resumeActiveBooking(tripId: string, user: Pick<CurrentUser, "id" | "email">): Promise<PreparedCheckoutView | null> {
  const bookingId = await findResumableCheckoutBooking(tripId, user.email, user.id);
  if (!bookingId) return null;
  const prepared = await getPreparedBookingCheckout(bookingId, user.id);
  return prepared ? view(prepared, true) : null;
}

export async function prepareBookingCheckout(
  input: PrepareCheckoutInput,
  user: Pick<CurrentUser, "id" | "email">,
): Promise<PrepareCheckoutResult> {
  if (!isCheckoutEnabled()) throw new Error("checkout disabled");
  const inputHash = createHash("sha256").update(JSON.stringify([
    user.id, input.tripId, input.campaignCode ?? null, input.paymentChoice,
  ])).digest("hex");

  const prior = await getCheckoutReservation(input.requestId, user.id, inputHash);
  if (prior === "request_conflict") return prior;
  if (prior) {
    const contract = await getCheckoutContractVersion(prior.termsVersion);
    return contract ? view(prepared(prior, contract), false) : "contract_unavailable";
  }
  const resumed = await resumeActiveBooking(input.tripId, user);
  if (resumed) return resumed;

  const db = getDb();
  const [campaign] = input.campaignCode
    ? await db.select({ id: campaigns.id }).from(campaigns)
      .where(and(eq(campaigns.tripId, input.tripId), eq(campaigns.code, input.campaignCode), eq(campaigns.status, "active"))).limit(1)
    : [];
  if (input.campaignCode && !campaign) return "offer_unavailable";
  const offer = await getActiveOffer(input.tripId, campaign?.id ?? null);
  if (!offer) return "offer_unavailable";
  const rate = await getCurrentCheckoutRate();
  if (!rate) return "rate_unavailable";
  const quote = createCheckoutQuote(offer, input.paymentChoice, rate);
  if (quote === "invalid_payment_choice") return quote;
  const contract = await getCheckoutContractVersion(offer.termsVersion);
  if (!contract) return "contract_unavailable";

  const [registration] = await db.select({
    leadId: leads.id,
    participantName: leads.fullName,
    tripTitle: trips.title,
    includes: trips.includes,
    excludes: trips.excludes,
  }).from(trips).innerJoin(leads, eq(leads.tripId, trips.id))
    .where(and(
      eq(trips.id, input.tripId),
      eq(trips.status, "published"),
      eq(leads.email, user.email),
      isNull(leads.archivedAt),
    ))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  if (!registration) return "registration_required";

  const reservation = await persistCheckoutReservation({
    requestId: input.requestId, inputHash, userId: user.id, email: user.email, leadId: registration.leadId,
    tripId: input.tripId, participantName: registration.participantName, packageLabel: registration.tripTitle,
    distance: null, totalUsd: quote.totalUsd, initialPaymentUsd: quote.principalUsd,
    balanceDueOn: offer.balanceDueOn, offerVersionId: offer.offerVersionId, offerVersion: offer.version,
    campaignId: offer.campaignId, termsVersion: offer.termsVersion, conditions: offer.conditions,
    tripIncludes: registration.includes, tripExcludes: registration.excludes,
    rateId: quote.rateId, rateUsdPen: quote.rateUsdPen, amountPenCents: quote.amountPenCents,
    capacityLimit: offer.capacityLimit,
  });
  // A concurrent preparation of the same runner may have created the booking in the meantime.
  if (reservation === "booking_exists") return (await resumeActiveBooking(input.tripId, user)) ?? reservation;
  if (typeof reservation === "string") return reservation;

  // The persisted version is authoritative if an offer changes while a concurrent request is resolving.
  const savedContract = reservation.termsVersion === contract.versionKey
    ? contract
    : await getCheckoutContractVersion(reservation.termsVersion);
  return savedContract ? view(prepared(reservation, savedContract), false) : "contract_unavailable";
}

export async function getPreparedBookingCheckout(bookingId: string, userId: string): Promise<PreparedCheckout | null> {
  const db = getDb();
  const [row] = await db.select({
    id: bookings.id, runnerUserId: bookings.runnerUserId, packageLabel: bookings.packageLabel,
    offerVersion: bookings.offerVersion, termsVersion: bookings.offerTermsVersion,
    conditions: bookings.offerConditionsSnapshot, tripIncludes: bookings.tripIncludesSnapshot,
    tripExcludes: bookings.tripExcludesSnapshot, totalUsd: bookings.totalUsd,
    principalUsd: bookings.initialPaymentUsd, rateId: bookings.checkoutRateId,
    rateUsdPen: bookings.checkoutRateUsdPen, amountPenCents: bookings.checkoutAmountPenCents,
    expiresAt: bookings.reservationExpiresAt,
  }).from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.runnerUserId, userId),
    eq(bookings.status, "pending"), isNotNull(bookings.offerVersionId))).limit(1);
  if (!row || !row.termsVersion || !row.conditions || !row.tripIncludes || !row.tripExcludes
      || !row.principalUsd || !row.rateId || !row.rateUsdPen || !row.amountPenCents || !row.expiresAt
      || !row.offerVersion || row.expiresAt.getTime() <= Date.now()) return null;
  const contract = await getCheckoutContractVersion(row.termsVersion);
  if (!contract) return null;
  const reservation: ReservationRecord = {
    id: row.id, packageLabel: row.packageLabel, offerVersion: row.offerVersion, termsVersion: row.termsVersion,
    conditions: row.conditions, tripIncludes: row.tripIncludes, tripExcludes: row.tripExcludes,
    quote: { totalUsd: row.totalUsd, principalUsd: row.principalUsd, balanceUsd: row.totalUsd - row.principalUsd,
      rateId: row.rateId, rateUsdPen: row.rateUsdPen, amountPenCents: row.amountPenCents },
    expiresAt: row.expiresAt,
  };
  return prepared(reservation, contract);
}
