// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real pure formatters (trip and offer display); only the server-only services are mocked.
vi.mock("@/modules/trips", async () => {
  const tripDisplay = await vi.importActual<typeof import("@/modules/trips/utils/tripDisplay")>(
    "@/modules/trips/utils/tripDisplay",
  );
  const offerDisplay = await vi.importActual<typeof import("@/modules/trips/utils/offerDisplay")>(
    "@/modules/trips/utils/offerDisplay",
  );
  return {
    getPublicOffer: vi.fn(),
    getPublishedTripBySlug: vi.fn(),
    formatTripDate: tripDisplay.formatTripDate,
    formatTripDateRange: tripDisplay.formatTripDateRange,
    formatTripPrice: tripDisplay.formatTripPrice,
    offerValidityText: offerDisplay.offerValidityText,
  };
});

import { formatPenCents, usdToPenCents } from "@/lib/currency";
import { getPublicOffer, type PublicOffer, type PublicOfferRead } from "@/modules/trips";
import { getCatalogOffer, toOfferView } from "./catalogOffer";

const getPublic = vi.mocked(getPublicOffer);

// Test values of the F3 criterion (Santiago, general offer).
const santiago: PublicOffer = {
  totalPriceUsd: 2000,
  discountUsd: 200,
  finalPriceUsd: 1800,
  depositOptionsUsd: [100, 200],
  balanceDueOn: "2027-03-15",
  bonusDescription: "Polo oficial",
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  termsVersion: "santiago-2027-v1",
  conditions: "Reserva no reembolsable.\r\n\r\n  El saldo se paga antes de la fecha límite.  \n\n",
};

// Single payment, no discount, no bonus, open-ended validity.
const plain: PublicOffer = {
  totalPriceUsd: 1799,
  discountUsd: 0,
  finalPriceUsd: 1799,
  depositOptionsUsd: [],
  balanceDueOn: null,
  bonusDescription: null,
  validFrom: "2026-11-01",
  validUntil: null,
  termsVersion: "lima-2027-v2",
  conditions: "Pago único antes de viajar.",
};

const rate3750 = { usdPen: "3.7500", effectiveFrom: new Date("2026-10-28T15:00:00Z") };

beforeEach(() => {
  getPublic.mockReset();
});

describe("toOfferView", () => {
  it("formats the Santiago offer with its soles at 3.7500", () => {
    expect(toOfferView({ offer: santiago, exchangeRate: rate3750 })).toEqual({
      totalPrice: "US$ 2,000",
      totalPricePen: "S/ 7,500.00",
      discount: "US$ 200",
      discountPen: "S/ 750.00",
      finalPrice: "US$ 1,800",
      finalPricePen: "S/ 6,750.00",
      deposits: [
        { deposit: "US$ 100", depositPen: "S/ 375.00", balance: "US$ 1,700", balancePen: "S/ 6,375.00" },
        { deposit: "US$ 200", depositPen: "S/ 750.00", balance: "US$ 1,600", balancePen: "S/ 6,000.00" },
      ],
      balanceDueOn: "15 de marzo de 2027",
      bonus: "Polo oficial",
      validity: "Precio válido: 1–30 de noviembre de 2026 (hora de Lima).",
      conditions: ["Reserva no reembolsable.", "El saldo se paga antes de la fecha límite."],
      termsVersion: "santiago-2027-v1",
      exchangeRate: { rate: "3.7500", since: "28 de octubre de 2026" },
    });
  });

  it("shows exactly S/ 6,748.41 for a final price of 1799 at 3.7512", () => {
    const view = toOfferView({
      offer: plain,
      exchangeRate: { usdPen: "3.7512", effectiveFrom: new Date("2026-10-28T15:00:00Z") },
    });
    expect(view.finalPricePen).toBe("S/ 6,748.41");
    expect(view.exchangeRate).toEqual({ rate: "3.7512", since: "28 de octubre de 2026" });
  });

  it("without discount, deposits, bonus or end date: single payment and open validity", () => {
    const view = toOfferView({ offer: plain, exchangeRate: rate3750 });
    expect(view.discount).toBeNull();
    expect(view.discountPen).toBeNull();
    expect(view.deposits).toEqual([]);
    expect(view.balanceDueOn).toBeNull();
    expect(view.bonus).toBeNull();
    expect(view.validity).toBe("Precio vigente desde el 1 de noviembre de 2026.");
    expect(view.conditions).toEqual(["Pago único antes de viajar."]);
  });

  it("with 3 deposits, each balance is the final price minus that deposit", () => {
    const view = toOfferView({
      offer: { ...santiago, depositOptionsUsd: [100, 250, 499] },
      exchangeRate: null,
    });
    expect(view.deposits.map(({ deposit, balance }) => [deposit, balance])).toEqual([
      ["US$ 100", "US$ 1,700"],
      ["US$ 250", "US$ 1,550"],
      ["US$ 499", "US$ 1,301"],
    ]);
  });

  it("converts every amount to soles on its own with usdToPenCents", () => {
    const rateE4 = 37512;
    const view = toOfferView({
      offer: { ...santiago, totalPriceUsd: 1999, discountUsd: 200, finalPriceUsd: 1799, depositOptionsUsd: [100, 333] },
      exchangeRate: { usdPen: "3.7512", effectiveFrom: rate3750.effectiveFrom },
    });
    const pen = (usd: number) => formatPenCents(usdToPenCents(usd, rateE4));
    expect(view.totalPricePen).toBe(pen(1999));
    expect(view.discountPen).toBe(pen(200));
    expect(view.finalPricePen).toBe(pen(1799));
    expect(view.deposits).toEqual([
      { deposit: "US$ 100", depositPen: pen(100), balance: "US$ 1,699", balancePen: pen(1699) },
      { deposit: "US$ 333", depositPen: pen(333), balance: "US$ 1,466", balancePen: pen(1466) },
    ]);
  });

  it("without an exchange rate every soles amount is null", () => {
    const view = toOfferView({ offer: santiago, exchangeRate: null });
    expect(view.totalPricePen).toBeNull();
    expect(view.discountPen).toBeNull();
    expect(view.finalPricePen).toBeNull();
    expect(view.deposits.every(({ depositPen, balancePen }) => depositPen === null && balancePen === null)).toBe(true);
    expect(view.exchangeRate).toBeNull();
    expect(view.finalPrice).toBe("US$ 1,800");
  });

  it("dates the exchange rate by its Lima calendar day", () => {
    // 03:00 UTC on Oct 29 is still Oct 28 in Lima (UTC−5).
    const view = toOfferView({
      offer: plain,
      exchangeRate: { usdPen: "3.7500", effectiveFrom: new Date("2026-10-29T03:00:00Z") },
    });
    expect(view.exchangeRate?.since).toBe("28 de octubre de 2026");
  });

  it("drops a trailing period from the bonus (the block adds its own sentence)", () => {
    const view = toOfferView({
      offer: { ...santiago, bonusDescription: "Polo oficial de la carrera. " },
      exchangeRate: null,
    });
    expect(view.bonus).toBe("Polo oficial de la carrera");
  });

  it("exposes no ids, internal name, campaign, capacity or audit", () => {
    const read = {
      offer: { ...santiago, name: "Interna", capacityLimit: 50, offerVersionId: "x", campaignId: "y" },
      exchangeRate: null,
    } as unknown as PublicOfferRead;
    const json = JSON.stringify(toOfferView(read));
    expect(json).not.toMatch(/Interna|capacity|offerVersionId|campaign/);
  });
});

describe("getCatalogOffer", () => {
  it("passes only the slug and the campaign code to getPublicOffer", async () => {
    getPublic.mockResolvedValue({ offer: santiago, exchangeRate: rate3750 });

    const view = await getCatalogOffer("maraton-santiago-2027", "mml26");

    expect(getPublic).toHaveBeenCalledOnce();
    expect(getPublic).toHaveBeenCalledWith("maraton-santiago-2027", "mml26");
    expect(view).toEqual(toOfferView({ offer: santiago, exchangeRate: rate3750 }));
  });

  it("passes a null code when there is no ?c=", async () => {
    getPublic.mockResolvedValue(null);
    await getCatalogOffer("maraton-santiago-2027", null);
    expect(getPublic).toHaveBeenCalledWith("maraton-santiago-2027", null);
  });

  it("returns null when there is no offer in force", async () => {
    getPublic.mockResolvedValue(null);
    await expect(getCatalogOffer("maraton-lima-2027", null)).resolves.toBeNull();
  });

  it("propagates database errors", async () => {
    const error = new Error("database down");
    getPublic.mockRejectedValue(error);
    await expect(getCatalogOffer("maraton-lima-2027", null)).rejects.toBe(error);
  });
});
