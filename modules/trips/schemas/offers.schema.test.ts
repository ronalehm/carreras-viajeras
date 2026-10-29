// @vitest-environment node
import { describe, expect, it } from "vitest";
import { tripOfferStatusEnum } from "@/lib/db-schema";
import {
  createOfferSchema,
  exchangeRateFormSchema,
  offerFormSchema,
  offerIdSchema,
  offerStatusSchema,
  offerTransitionSchema,
  updateOfferSchema,
} from "./offers.schema";

const OFFER_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const TRIP_ID = "9b2e7c4a-1d3f-4e5a-8b6c-7d8e9f0a1b2c";
const CAMPAIGN_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";

// Strings as they come from Object.fromEntries(formData).
const validForm = {
  name: "  Santiago general 2027 ",
  totalPriceUsd: "2000",
  discountUsd: "200",
  depositOptionsUsd: "200, 100, ,100",
  balanceDueOn: "2027-03-15",
  bonusDescription: "  Polo oficial de la carrera ",
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  capacityLimit: "40",
  termsVersion: " Santiago-2027-V1 ",
  conditions: "  Anticipo no reembolsable.\nSaldo hasta la fecha indicada.  ",
};

const parse = (overrides: Record<string, string | undefined>) =>
  offerFormSchema.safeParse({ ...validForm, ...overrides });

const issueFields = (result: { error?: { issues: { path: PropertyKey[] }[] } }) => [
  ...new Set(result.error?.issues.map((issue) => issue.path[0])),
];

const issueMessages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

const expectErrorOn = (overrides: Record<string, string | undefined>, field: string) => {
  const result = parse(overrides);
  expect(result.success).toBe(false);
  expect(issueFields(result)).toEqual([field]);
  return result;
};

describe("offerStatusSchema", () => {
  it("matches the trip_offer_status database enum", () => {
    expect(offerStatusSchema.options).toEqual(tripOfferStatusEnum.enumValues);
  });
});

describe("offerFormSchema", () => {
  it("parses a complete valid form into clean values", () => {
    const result = parse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Santiago general 2027",
      totalPriceUsd: 2000,
      discountUsd: 200,
      depositOptionsUsd: [100, 200],
      balanceDueOn: "2027-03-15",
      bonusDescription: "Polo oficial de la carrera",
      validFrom: "2026-11-01",
      validUntil: "2026-11-30",
      capacityLimit: 40,
      termsVersion: "santiago-2027-v1",
      conditions: "Anticipo no reembolsable.\nSaldo hasta la fecha indicada.",
    });
  });

  it("turns blank optional fields into null, a blank discount into 0 and no deposits into []", () => {
    const result = parse({
      discountUsd: "",
      depositOptionsUsd: "",
      balanceDueOn: "",
      bonusDescription: "   ",
      validUntil: "",
      capacityLimit: "",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      discountUsd: 0,
      depositOptionsUsd: [],
      balanceDueOn: null,
      bonusDescription: null,
      validUntil: null,
      capacityLimit: null,
    });
  });

  it("treats missing optional keys as blank", () => {
    const result = parse({
      discountUsd: undefined,
      depositOptionsUsd: undefined,
      balanceDueOn: undefined,
      bonusDescription: undefined,
      validUntil: undefined,
      capacityLimit: undefined,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ discountUsd: 0, depositOptionsUsd: [], balanceDueOn: null });
  });

  it("drops client-side state and amounts it does not own", () => {
    const result = offerFormSchema.safeParse({
      ...validForm,
      status: "active",
      version: "7",
      finalPriceUsd: "1",
      approvedBy: "attacker",
      tripId: TRIP_ID,
      price: "1",
    });

    expect(result.success).toBe(true);
    for (const key of ["status", "version", "finalPriceUsd", "approvedBy", "tripId", "price"]) {
      expect(result.data).not.toHaveProperty(key);
    }
  });

  it.each([
    ["0", "total 0"],
    ["1999.5", "decimal"],
    ["1000001", "above 1,000,000"],
    ["-5", "negative"],
    ["", "blank"],
    ["abc", "not a number"],
  ])("rejects totalPriceUsd %j (%s) on its field", (totalPriceUsd) => {
    const result = expectErrorOn({ totalPriceUsd }, "totalPriceUsd");
    expect(issueMessages(result)).toContain("Indica el precio total en dólares, sin decimales.");
  });

  it("accepts the 1,000,000 total limit", () => {
    expect(parse({ totalPriceUsd: "1000000", depositOptionsUsd: "", balanceDueOn: "" }).success).toBe(
      true,
    );
  });

  it.each(["2000", "2500"])("rejects a discount of %s (≥ total) on discountUsd", (discountUsd) => {
    const result = expectErrorOn({ discountUsd }, "discountUsd");
    expect(issueMessages(result)).toEqual(["El descuento debe ser menor que el precio total."]);
  });

  it("rejects a decimal discount on its field", () => {
    expectErrorOn({ discountUsd: "10.5" }, "discountUsd");
  });

  it("rejects 4 deposits", () => {
    const result = expectErrorOn({ depositOptionsUsd: "100, 200, 300, 400" }, "depositOptionsUsd");
    expect(issueMessages(result)).toEqual(["Indica como máximo 3 anticipos."]);
  });

  it("counts deposits after removing duplicates", () => {
    const result = parse({ depositOptionsUsd: "300, 100, 200, 300" });
    expect(result.success).toBe(true);
    expect(result.data?.depositOptionsUsd).toEqual([100, 200, 300]);
  });

  it.each(["1800", "100, 1900"])("rejects a deposit ≥ the final price (1800): %j", (depositOptionsUsd) => {
    const result = expectErrorOn({ depositOptionsUsd }, "depositOptionsUsd");
    expect(issueMessages(result)).toEqual(["Cada anticipo debe ser menor que el precio final."]);
  });

  it.each(["0", "100, 0", "50.5", "US$ 100", "-100"])(
    "rejects an invalid deposit %j on its field",
    (depositOptionsUsd) => {
      expectErrorOn({ depositOptionsUsd }, "depositOptionsUsd");
    },
  );

  it("rejects deposits without balanceDueOn", () => {
    const result = expectErrorOn({ balanceDueOn: "" }, "balanceDueOn");
    expect(issueMessages(result)).toEqual(["Indica hasta cuándo se paga el saldo."]);
  });

  it("rejects balanceDueOn without deposits", () => {
    const result = expectErrorOn({ depositOptionsUsd: "" }, "balanceDueOn");
    expect(issueMessages(result)).toEqual(["Sin anticipos no hay saldo: deja la fecha vacía."]);
  });

  it("rejects validUntil before validFrom", () => {
    const result = expectErrorOn({ validUntil: "2026-10-31" }, "validUntil");
    expect(issueMessages(result)).toEqual(["La fecha final no puede ser anterior a la inicial."]);
  });

  it("accepts a one-day validity (validUntil = validFrom)", () => {
    expect(parse({ validUntil: "2026-11-01" }).success).toBe(true);
  });

  it.each([
    [{ validFrom: "" }, "validFrom"],
    [{ validFrom: "2026-02-30" }, "validFrom"],
    [{ validUntil: "30/11/2026" }, "validUntil"],
    [{ balanceDueOn: "mañana" }, "balanceDueOn"],
  ])("rejects an invalid date %j on its field", (overrides, field) => {
    expectErrorOn(overrides, field);
  });

  it.each(["0", "10001", "1.5"])("rejects capacityLimit %j", (capacityLimit) => {
    expectErrorOn({ capacityLimit }, "capacityLimit");
  });

  it("rejects conditions of 9 characters", () => {
    expectErrorOn({ conditions: "123456789" }, "conditions");
    expect(parse({ conditions: "1234567890" }).success).toBe(true);
  });

  it.each(["A", "x".repeat(81)])("rejects a name of the wrong length", (name) => {
    expectErrorOn({ name }, "name");
  });

  it.each(["ab", "santiago_2027", "santiago--v1", "-v1", "v1-", "x".repeat(61)])(
    "rejects termsVersion %j",
    (termsVersion) => {
      expectErrorOn({ termsVersion }, "termsVersion");
    },
  );

  it.each([
    "US$ 50 de descuento",
    "S/ 100",
    "50 dólares",
    "50 dolares de regalo",
    "Bono de $50",
    "USD100 en tienda",
    "100 USD",
    "PEN 200",
    "Vale de 20 soles",
    "US$1,499",
  ])("rejects a bonus with money amounts: %j", (bonusDescription) => {
    const result = expectErrorOn({ bonusDescription }, "bonusDescription");
    expect(issueMessages(result)).toEqual([
      "Un bono no es un descuento: descríbelo sin importes (p. ej. «Polo oficial de la carrera»).",
    ]);
  });

  it.each(["Polo oficial de la carrera", "Kit 2 en 1", "Cena para 2 personas", "Open 5K pendiente"])(
    "accepts a non-monetary bonus: %j",
    (bonusDescription) => {
      expect(parse({ bonusDescription }).success).toBe(true);
    },
  );

  it("rejects a 1-character bonus", () => {
    expectErrorOn({ bonusDescription: "x" }, "bonusDescription");
  });

  it("does not compare prices when the total is invalid", () => {
    expectErrorOn({ totalPriceUsd: "0", discountUsd: "500" }, "totalPriceUsd");
  });
});

describe("createOfferSchema", () => {
  it("adds the scope: trip and optional campaign", () => {
    const general = createOfferSchema.safeParse({ ...validForm, tripId: TRIP_ID, campaignId: "" });
    expect(general.success).toBe(true);
    expect(general.data).toMatchObject({ tripId: TRIP_ID, campaignId: null });

    const campaign = createOfferSchema.safeParse({
      ...validForm,
      tripId: TRIP_ID,
      campaignId: CAMPAIGN_ID,
    });
    expect(campaign.data).toMatchObject({ tripId: TRIP_ID, campaignId: CAMPAIGN_ID });
  });

  it("rejects an invalid trip or campaign on its field", () => {
    const result = createOfferSchema.safeParse({ ...validForm, tripId: "1", campaignId: "x" });
    expect(issueFields(result)).toEqual(["tripId", "campaignId"]);
  });

  it("keeps the refinements", () => {
    const result = createOfferSchema.safeParse({ ...validForm, tripId: TRIP_ID, discountUsd: "2000" });
    expect(issueFields(result)).toEqual(["discountUsd"]);
  });
});

describe("updateOfferSchema", () => {
  it("requires the offer id and drops tripId and campaignId", () => {
    const result = updateOfferSchema.safeParse({
      ...validForm,
      id: OFFER_ID,
      tripId: TRIP_ID,
      campaignId: CAMPAIGN_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(OFFER_ID);
    expect(result.data).not.toHaveProperty("tripId");
    expect(result.data).not.toHaveProperty("campaignId");
  });

  it("rejects a non-UUID id and keeps the refinements", () => {
    const result = updateOfferSchema.safeParse({ ...validForm, id: "1", validUntil: "2026-10-01" });
    expect(issueFields(result)).toEqual(["id", "validUntil"]);
  });
});

describe("offerTransitionSchema and offerIdSchema", () => {
  it("accepts only a UUID offerId", () => {
    expect(offerTransitionSchema.safeParse({ offerId: OFFER_ID, status: "active" }).data).toEqual({
      offerId: OFFER_ID,
    });
    expect(offerTransitionSchema.safeParse({ offerId: "1" }).success).toBe(false);
    expect(offerIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("exchangeRateFormSchema", () => {
  it.each([
    ["3.75", "3.7500"],
    [" 3.7512 ", "3.7512"],
    ["10", "10.0000"],
  ])("normalizes %j → %j", (usdPen, expected) => {
    expect(exchangeRateFormSchema.safeParse({ usdPen }).data).toEqual({ usdPen: expected });
  });

  it.each(["3,75", "0", "3.12345", "100", "", "-3.75", "abc"])("rejects %j", (usdPen) => {
    const result = exchangeRateFormSchema.safeParse({ usdPen });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toEqual(["usdPen"]);
    expect(issueMessages(result)).toEqual([
      "Indica el tipo con punto decimal y hasta 4 decimales (p. ej. 3.7500).",
    ]);
  });

  it("rejects a missing usdPen with the Spanish message", () => {
    expect(issueMessages(exchangeRateFormSchema.safeParse({}))).toEqual([
      "Indica el tipo con punto decimal y hasta 4 decimales (p. ej. 3.7500).",
    ]);
  });
});
