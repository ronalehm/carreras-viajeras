import { describe, expect, it } from "vitest";
import { z } from "zod";
import { webLeadFormSchema } from "./webLeads.schema";

const SUBMISSION_ID = "6f9a1c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b";

const VALID = {
  name: "  Ana María Pérez ",
  email: " Ana.Perez@Example.COM ",
  phone: "+51 938-127 170",
  destination: "maraton-santiago-2027",
  consent: "on",
  submissionId: SUBMISSION_ID,
  "cf-turnstile-response": "turnstile-token",
};

function fieldErrors(values: Record<string, unknown>) {
  const result = webLeadFormSchema.safeParse(values);
  expect(result.success).toBe(false);
  return (result.error ? z.flattenError(result.error).fieldErrors : {}) as Record<string, string[] | undefined>;
}

describe("webLeadFormSchema", () => {
  it("normalizes a valid submission and drops extra keys", () => {
    const result = webLeadFormSchema.parse({
      ...VALID,
      source: "whatsapp",
      stage: "paid",
      ownerUserId: "staff-1",
      consentVersion: "fake",
      website: "",
    });
    expect(result).toEqual({
      fullName: "Ana María Pérez",
      email: "ana.perez@example.com",
      phone: "+51938127170",
      destination: "maraton-santiago-2027",
      submissionId: SUBMISSION_ID,
      turnstileToken: "turnstile-token",
    });
  });

  it.each(["rio", "roma"])("accepts the destination %s", (destination) => {
    expect(webLeadFormSchema.parse({ ...VALID, destination }).destination).toBe(destination);
  });

  it("defaults a missing Turnstile token to an empty string", () => {
    const withoutToken: Record<string, string> = { ...VALID };
    delete withoutToken["cf-turnstile-response"];
    expect(webLeadFormSchema.parse(withoutToken).turnstileToken).toBe("");
  });

  it.each([
    ["a name of 1 character", { name: "A" }, "name", "Escribe tu nombre (2 a 80 caracteres)."],
    ["a name of 81 characters", { name: "a".repeat(81) }, "name", "Escribe tu nombre (2 a 80 caracteres)."],
    ["an invalid email", { email: "ana@" }, "email", "Escribe un correo válido."],
    ["an email of 151 characters", { email: `${"a".repeat(139)}@example.com` }, "email", "Escribe un correo válido."],
    [
      "a phone without country code",
      { phone: "938 127 170" },
      "phone",
      "Escribe el número con código de país, p. ej. +51 938 127 170.",
    ],
    ["the old destination id santiago-2027", { destination: "santiago-2027" }, "destination", "Elige un destino."],
    ["an unknown destination", { destination: "panama" }, "destination", "Elige un destino."],
    ["a consent other than on", { consent: "yes" }, "consent", "Necesitamos tu autorización para guardar tus datos."],
    ["a submissionId that is not a UUID", { submissionId: "abc" }, "submissionId", "Recarga la página e inténtalo de nuevo."],
    [
      "a Turnstile token longer than 2048 characters",
      { "cf-turnstile-response": "t".repeat(2049) },
      "cf-turnstile-response",
      "Recarga la página e inténtalo de nuevo.",
    ],
  ])("rejects %s in its field", (_label, override, field, message) => {
    expect(fieldErrors({ ...VALID, ...override })[field]).toEqual([message]);
  });

  it.each(["name", "email", "phone", "destination", "consent", "submissionId"])(
    "rejects a missing %s with a Spanish message",
    (field) => {
      const values: Record<string, unknown> = { ...VALID };
      delete values[field];
      const errors = fieldErrors(values)[field];
      expect(errors).toHaveLength(1);
      expect(errors?.[0]).not.toMatch(/invalid|expected|required/i);
    },
  );
});
