// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyRewardSchema, bookingBenefitFormSchema, redemptionRequestSchema, referralClaimSchema, rewardCatalogFormSchema, rewardRuleFormSchema } from "./rewards.schema";

const RULE = { pointsPerReferral: "20", maxReferralsPerRunner: "", validFrom: "2026-10-29", validUntil: "", terms: "Una reserva confirmada y su primer pago válido.", active: "on" };
const CATALOG = { catalogKey: "", kind: "discount", title: "Descuento de viaje", description: "Aplicable a una reserva propia pendiente y sin pagos.", costStars: "100", discountUsd: "25", stock: "10", maxPerRunner: "1", redemptionDays: "30", validFrom: "2026-10-29", validUntil: "2026-12-31", active: "on" };
const UUID = "6b9b82aa-fd93-4263-80cf-58a3909501c1";

describe("rewardRuleFormSchema", () => {
  it("parses explicit admin values and removes caller-provided actors and balances", () => {
    const value = rewardRuleFormSchema.parse({ ...RULE, actorId: "intruder", balance: "1000" });
    expect(value).toEqual({ pointsPerReferral: 20, maxReferralsPerRunner: null, validFrom: "2026-10-29", validUntil: null, terms: RULE.terms, active: true });
  });
  it.each(["", "0", "-1", "1.5", "Infinity", "1000001", "1e3"])("rejects invalid points %s", (pointsPerReferral) => {
    expect(rewardRuleFormSchema.safeParse({ ...RULE, pointsPerReferral }).success).toBe(false);
  });
  it("does not activate a rule without an explicit checkbox", () => {
    expect(rewardRuleFormSchema.parse({ ...RULE, active: undefined }).active).toBe(false);
  });
  it("accepts same-day validity and rejects reversed or malformed dates", () => {
    expect(rewardRuleFormSchema.safeParse({ ...RULE, validUntil: RULE.validFrom }).success).toBe(true);
    expect(rewardRuleFormSchema.safeParse({ ...RULE, validUntil: "2026-10-28" }).success).toBe(false);
    expect(rewardRuleFormSchema.safeParse({ ...RULE, validFrom: "2026-02-30" }).success).toBe(false);
  });
});

describe("rewardCatalogFormSchema", () => {
  it("parses a discount version and strips client state", () => {
    const value = rewardCatalogFormSchema.parse({ ...CATALOG, status: "applied", createdBy: "attacker" });
    expect(value.costStars).toBe(100);
    expect(value.discountUsd).toBe(25);
    expect(value.catalogKey).toBeNull();
    expect(value).not.toHaveProperty("createdBy");
  });
  it("requires a discount for a monetary prize and forbids it on a physical benefit", () => {
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, discountUsd: "" }).success).toBe(false);
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, kind: "benefit" }).success).toBe(false);
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, kind: "benefit", discountUsd: "" }).success).toBe(true);
  });
  it.each(["costStars", "maxPerRunner", "redemptionDays"])("requires an explicit positive %s", (field) => {
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, [field]: "0" }).success).toBe(false);
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, [field]: "" }).success).toBe(false);
  });
  it("supports unlimited stock only when blank, not negative or zero stock", () => {
    expect(rewardCatalogFormSchema.parse({ ...CATALOG, stock: "" }).stock).toBeNull();
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, stock: "-5" }).success).toBe(false);
    expect(rewardCatalogFormSchema.safeParse({ ...CATALOG, stock: "0" }).success).toBe(false);
  });
});

describe("runner inputs", () => {
  it("requires explicit attribution consent and an opaque code", () => {
    expect(referralClaimSchema.safeParse({ code: "A".repeat(32), consent: "on", ruleVersionId: UUID }).success).toBe(true);
    expect(referralClaimSchema.safeParse({ code: "A".repeat(32), consent: "on" }).success).toBe(false);
    expect(referralClaimSchema.safeParse({ code: "A".repeat(32) }).success).toBe(false);
    expect(referralClaimSchema.safeParse({ code: "ana@example.com", consent: "on" }).success).toBe(false);
  });
  it("keeps only prize id and idempotency key, never a client cost or owner", () => {
    expect(redemptionRequestSchema.parse({ catalogVersionId: UUID, requestKey: UUID, userId: "other", costStars: "0" })).toEqual({ catalogVersionId: UUID, requestKey: UUID });
  });
  it("validates target ids and contractual evidence", () => {
    expect(applyRewardSchema.safeParse({ redemptionId: UUID, bookingId: "invalid" }).success).toBe(false);
    expect(bookingBenefitFormSchema.safeParse({ bookingId: UUID, title: "Hotel", description: "x" }).success).toBe(false);
    expect(bookingBenefitFormSchema.parse({ bookingId: UUID, title: " Hotel ", description: "Alojamiento contratado por tres noches.", createdBy: "attacker" })).not.toHaveProperty("createdBy");
  });
});
