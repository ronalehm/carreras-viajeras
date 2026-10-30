import { describe, expect, it } from "vitest";
import { contractFormSchema, contractEditSchema, contractApprovalSchema } from "./contracts.schema";

const valid = { versionKey: "Santiago-2027-V1", title: "Contrato de prueba", body: "Condiciones sintéticas de prueba.\r\nSegunda línea." };

describe("contract input boundaries", () => {
 it("normalizes version and line endings without changing document text", () => {
  expect(contractFormSchema.parse(valid)).toEqual({versionKey:"santiago-2027-v1",title:"Contrato de prueba",body:"Condiciones sintéticas de prueba.\nSegunda línea."});
 });
 it("rejects short or invalid documents and version identifiers", () => {
  expect(contractFormSchema.safeParse({...valid,body:"corto"}).success).toBe(false);
  expect(contractFormSchema.safeParse({...valid,versionKey:"../otro"}).success).toBe(false);
  expect(contractFormSchema.safeParse({...valid,body:"x".repeat(50001)}).success).toBe(false);
 });
 it("never accepts approval, actor or database state from creation input", () => {
  for(const extra of [{status:"approved"},{approvedBy:"attacker"},{documentHash:"0".repeat(64)}]) {
   expect(contractFormSchema.safeParse({...valid,...extra}).success).toBe(false);
  }
 });
 it("prevents a draft edit from changing its version identifier", () => {
  const id="11111111-1111-4111-8111-111111111111";
  expect(contractEditSchema.safeParse({id,title:valid.title,body:valid.body}).success).toBe(true);
  expect(contractEditSchema.safeParse({id,...valid}).success).toBe(false);
 });
 it("requires the document fingerprint actually reviewed for approval", () => {
  const id="11111111-1111-4111-8111-111111111111";
  expect(contractApprovalSchema.safeParse({id,documentHash:"a".repeat(64)}).success).toBe(true);
  expect(contractApprovalSchema.safeParse({id}).success).toBe(false);
  expect(contractApprovalSchema.safeParse({id,documentHash:"sk_test_not_a_hash"}).success).toBe(false);
 });
});
