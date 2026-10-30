import { describe, expect, it } from "vitest";
import { contractAcceptanceSchema, prepareCheckoutSchema } from "./checkout.schema";

const tripId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
describe("booking checkout input boundaries", () => {
  it("accepts a server-resolved full payment and an allowed deposit index", () => {
    expect(prepareCheckoutSchema.safeParse({ tripId, requestId, paymentChoice: { kind: "full" } }).success).toBe(true);
    expect(prepareCheckoutSchema.safeParse({ tripId, requestId, campaignCode: "Maraton-2027", paymentChoice: { kind: "deposit", index: 0 } }).success).toBe(true);
  });
  it("rejects arbitrary amounts, user ids and malformed choices", () => {
    expect(prepareCheckoutSchema.safeParse({ tripId, requestId, amountUsd: 1, userId: "forged", paymentChoice: { kind: "full" } }).success).toBe(false);
    expect(prepareCheckoutSchema.safeParse({ tripId: "bad", requestId, paymentChoice: { kind: "deposit", index: -1 } }).success).toBe(false);
    expect(prepareCheckoutSchema.safeParse({ tripId, requestId, paymentChoice: { kind: "deposit", index: 4 } }).success).toBe(false);
    expect(prepareCheckoutSchema.safeParse({ tripId, paymentChoice: { kind: "full" } }).success).toBe(false);
  });
  it("accepts only explicit acceptance and a SHA-256 document fingerprint", () => {
    expect(contractAcceptanceSchema.safeParse({ accepted: true, documentHash: "a".repeat(64) }).success).toBe(true);
    expect(contractAcceptanceSchema.safeParse({ accepted: false, documentHash: "a".repeat(64) }).success).toBe(false);
    expect(contractAcceptanceSchema.safeParse({ accepted: true, documentHash: "bad", body: "forged" }).success).toBe(false);
  });
});
