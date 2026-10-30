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

const OUTPUT_KEYS = [
  "campaignCode",
  "destination",
  "email",
  "form",
  "fullName",
  "marketingOptIn",
  "phone",
  "referredBy",
  "submissionId",
  "turnstileToken",
  "utmCampaign",
  "utmMedium",
  "utmSource",
];

function fieldErrors(input: Record<string, unknown>) {
  const result = webLeadFormSchema.safeParse(input);
  if (result.success) throw new Error("expected the schema to fail");
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe("webLeadFormSchema", () => {
  it("returns the normalized submission: trimmed name, lowercase email, E.164 phone and no attribution", () => {
    expect(webLeadFormSchema.parse(VALID)).toEqual({
      fullName: "Ana María Pérez",
      email: "ana.perez@example.com",
      phone: "+51938127170",
      destination: "maraton-santiago-2027",
      marketingOptIn: false,
      form: "contact",
      submissionId: SUBMISSION_ID,
      turnstileToken: "token-123",
      campaignCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referredBy: null,
    });
  });

  it("normalizes the campaign code, the UTM values and ref", () => {
    expect(
      webLeadFormSchema.parse({
        ...VALID,
        c: " MML26 ",
        utm_source: "Instagram",
        utm_medium: " social ",
        utm_campaign: "PREVENTA",
        ref: "Club-Lima",
      }),
    ).toMatchObject({
      campaignCode: "mml26",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "preventa",
      referredBy: "club-lima",
    });
  });

  it.each([
    ["empty values", { c: "", utm_source: "", utm_medium: "", utm_campaign: "", ref: "" }],
    [
      "invalid values",
      { c: "x y", utm_source: "<script>", utm_medium: "a b", utm_campaign: "promoción", ref: "a" },
    ],
    [
      "values over 200 characters",
      {
        c: "a".repeat(201),
        utm_source: "a".repeat(201),
        utm_medium: "a".repeat(201),
        utm_campaign: "a".repeat(201),
        ref: "a".repeat(201),
      },
    ],
  ])("turns %s of the attribution into null without an error", (_case, override) => {
    expect(webLeadFormSchema.parse({ ...VALID, ...override })).toMatchObject({
      campaignCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referredBy: null,
    });
  });

  it.each([
    ["missing", undefined, false],
    ["off", "off", false],
    ["yes", "yes", false],
    ["on", "on", true],
  ])("maps the promotions checkbox %s to %s without an error", (_case, marketing, expected) => {
    const input = marketing === undefined ? VALID : { ...VALID, marketing };
    expect(webLeadFormSchema.parse(input).marketingOptIn).toBe(expected);
  });

  it.each([
    ["registration", "registration", "registration"],
    ["contact", "contact", "contact"],
    ["missing", undefined, "contact"],
    ["empty", "", "contact"],
    ["unknown", "admin", "contact"],
    ["uppercase", "REGISTRATION", "contact"],
  ])("maps the form field %s to %s without an error", (_case, form, expected) => {
    const input = form === undefined ? VALID : { ...VALID, form };
    const result = webLeadFormSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data?.form).toBe(expected);
  });

  it("drops extra keys such as source, stage, channel, campaignId, ownerUserId, consentVersion or price", () => {
    const parsed = webLeadFormSchema.parse({
      ...VALID,
      source: "whatsapp",
      stage: "paid",
      channel: "event",
      campaignId: "6b0f8c1e-2a4d-4f3b-9c7e-1d2a3b4c5d6e",
      ownerUserId: "staff-1",
      consentVersion: "crm-manual-v1",
      price: "1",
      website: "",
      modo: "stand",
    });
    expect(Object.keys(parsed).sort()).toEqual(OUTPUT_KEYS);
    expect(parsed).toMatchObject({ destination: "maraton-santiago-2027", campaignCode: null });
  });

  it("accepts any published-slug shape (rio, roma or a catalog slug), and a missing token becomes an empty string", () => {
    const withoutToken: Partial<typeof VALID> = { ...VALID };
    delete withoutToken["cf-turnstile-response"];
    expect(webLeadFormSchema.parse({ ...withoutToken, destination: "rio" })).toMatchObject({
      destination: "rio",
      turnstileToken: "",
    });
    expect(webLeadFormSchema.parse({ ...VALID, destination: "roma" }).destination).toBe("roma");
    expect(webLeadFormSchema.parse({ ...VALID, destination: "maraton-lima-2028" }).destination).toBe(
      "maraton-lima-2028",
    );
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
    ["an empty destination", { destination: "" }, "destination", "Elige la carrera."],
    ["a destination with spaces", { destination: " roma " }, "destination", "Elige la carrera."],
    ["a destination with uppercase letters", { destination: "Maraton-Santiago-2027" }, "destination", "Elige la carrera."],
    ["a destination over 80 characters", { destination: "a".repeat(81) }, "destination", "Elige la carrera."],
    ["an unchecked consent", { consent: "off" }, "consent", "Necesitamos tu autorización para guardar tus datos."],
  ])("rejects %s with an error on its field", (_case, override, field, message) => {
    expect(fieldErrors({ ...VALID, ...override })).toEqual({ [field]: message });
  });

  it("rejects missing fields with the Spanish messages, never zod's defaults", () => {
    expect(fieldErrors({ submissionId: SUBMISSION_ID })).toEqual({
      name: "Escribe tu nombre (2 a 80 caracteres).",
      email: "Escribe un correo válido.",
      phone: "Escribe el número con código de país, p. ej. +51 938 127 170.",
      destination: "Elige la carrera.",
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
