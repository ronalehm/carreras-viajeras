import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type WebLeadHashInput, webLeadRequestHash } from "./webLeadHash";

const input: WebLeadHashInput = {
  fullName: "Ana Pérez",
  phone: "+51938127170",
  email: "ana.perez@example.com",
  tripSlug: "maraton-santiago-2027",
  destinationName: "Maratón de Santiago 42K 2027",
  consentVersion: "web-form-v1",
};

describe("webLeadRequestHash", () => {
  it("returns 64 lowercase hex characters (leads_idempotency_chk)", async () => {
    expect(await webLeadRequestHash(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the SHA-256 of the six values as a JSON array, in order", async () => {
    const expected = createHash("sha256")
      .update(
        JSON.stringify([
          input.fullName,
          input.phone,
          input.email,
          input.tripSlug,
          input.destinationName,
          input.consentVersion,
        ]),
        "utf8",
      )
      .digest("hex");
    expect(await webLeadRequestHash(input)).toBe(expected);
  });

  it("returns the same value for the same input", async () => {
    expect(await webLeadRequestHash({ ...input })).toBe(await webLeadRequestHash(input));
  });

  it.each(Object.keys(input) as (keyof WebLeadHashInput)[])("changes when %s changes", async (field) => {
    const changed = await webLeadRequestHash({ ...input, [field]: `${input[field]}x` });
    expect(changed).not.toBe(await webLeadRequestHash(input));
  });

  it("does not mix values across field boundaries", async () => {
    const a = await webLeadRequestHash({ ...input, fullName: "Ana", phone: "+51938127170" });
    const b = await webLeadRequestHash({ ...input, fullName: "Ana+51938127170", phone: "" });
    expect(a).not.toBe(b);
  });

  it("does not depend on the idempotency key or the Turnstile token", async () => {
    const withExtras = {
      ...input,
      idempotencyKey: "0b6f3c0e-3c5e-4d7a-9d43-6f7c2e9b1a10",
      turnstileToken: "token",
    };
    const otherExtras = {
      ...input,
      idempotencyKey: "5f0a1d2e-8b7c-4c3d-a1e2-3f4b5c6d7e8f",
      turnstileToken: "other-token",
    };
    const plain = await webLeadRequestHash(input);
    expect(await webLeadRequestHash(withExtras)).toBe(plain);
    expect(await webLeadRequestHash(otherExtras)).toBe(plain);
  });
});
