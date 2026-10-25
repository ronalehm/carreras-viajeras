import { describe, expect, it } from "vitest";
import { webLeadFormSchema } from "./webLeads.schema";

const SUBMISSION_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const VALID = {
  name: "  Ana María Pérez  ",
  email: "  Ana.Perez@Example.COM ",
  phone: "+51 938-127 170",
  destination: "maraton-santiago-2027",
  consent: "on",
  submissionId: SUBMISSION_ID,
  "cf-turnstile-response": "token-123",
};

function fieldErrors(input: Record<string, unknown>) {
  const result = webLeadFormSchema.safeParse(input);
  if (result.success) throw new Error("expected the schema to fail");
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe("webLeadFormSchema", () => {
  it("returns the normalized submission: trimmed name, lowercase email and E.164 phone", () => {
    expect(webLeadFormSchema.parse(VALID)).toEqual({
      fullName: "Ana María Pérez",
      email: "ana.perez@example.com",
      phone: "+51938127170",
      destination: "maraton-santiago-2027",
      submissionId: SUBMISSION_ID,
      turnstileToken: "token-123",
    });
  });

  it("drops extra keys such as source, stage, ownerUserId or consentVersion", () => {
    const parsed = webLeadFormSchema.parse({
      ...VALID,
      source: "whatsapp",
      stage: "paid",
      ownerUserId: "staff-1",
      consentVersion: "crm-manual-v1",
      website: "",
    });
    expect(Object.keys(parsed).sort()).toEqual(
      ["destination", "email", "fullName", "phone", "submissionId", "turnstileToken"],
    );
  });

  it("accepts rio and roma, and a missing Turnstile token becomes an empty string", () => {
    const withoutToken: Partial<typeof VALID> = { ...VALID };
    delete withoutToken["cf-turnstile-response"];
    expect(webLeadFormSchema.parse({ ...withoutToken, destination: "rio" })).toMatchObject({
      destination: "rio",
      turnstileToken: "",
    });
    expect(webLeadFormSchema.parse({ ...VALID, destination: "roma" }).destination).toBe("roma");
  });

  it.each([
    ["a 1-character name", { name: " A " }, "name", "Escribe tu nombre (2 a 80 caracteres)."],
    ["an 81-character name", { name: "a".repeat(81) }, "name", "Escribe tu nombre (2 a 80 caracteres)."],
    ["an invalid email", { email: "ana@" }, "email", "Escribe un correo válido."],
    ["an email over 150 characters", { email: `${"a".repeat(140)}@example.com` }, "email", "Escribe un correo válido."],
    [
      "a phone without country code",
      { phone: "938 127 170" },
      "phone",
      "Escribe el número con código de país, p. ej. +51 938 127 170.",
    ],
    ["the old santiago-2027 destination", { destination: "santiago-2027" }, "destination", "Elige un destino."],
    ["an unknown destination", { destination: "panama" }, "destination", "Elige un destino."],
    ["an unchecked consent", { consent: "off" }, "consent", "Necesitamos tu autorización para guardar tus datos."],
  ])("rejects %s with an error on its field", (_case, override, field, message) => {
    expect(fieldErrors({ ...VALID, ...override })).toEqual({ [field]: message });
  });

  it("rejects missing fields with the Spanish messages, never zod's defaults", () => {
    expect(fieldErrors({ submissionId: SUBMISSION_ID })).toEqual({
      name: "Escribe tu nombre (2 a 80 caracteres).",
      email: "Escribe un correo válido.",
      phone: "Escribe el número con código de país, p. ej. +51 938 127 170.",
      destination: "Elige un destino.",
      consent: "Necesitamos tu autorización para guardar tus datos.",
    });
  });

  it("rejects a submissionId that is not a UUID", () => {
    expect(Object.keys(fieldErrors({ ...VALID, submissionId: "abc" }))).toEqual(["submissionId"]);
  });

  it("rejects a Turnstile token over 2048 characters", () => {
    expect(Object.keys(fieldErrors({ ...VALID, "cf-turnstile-response": "t".repeat(2049) }))).toEqual([
      "cf-turnstile-response",
    ]);
  });
});
