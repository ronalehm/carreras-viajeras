import { describe, expect, it } from "vitest";
import { z } from "zod";
import { leadActivityTypeEnum, leadSourceEnum, leadStageEnum } from "@/lib/db-schema";
import {
  createLeadSchema,
  leadActivityTypeSchema,
  leadListQuerySchema,
  leadSourceSchema,
  leadStageSchema,
  phoneSchema,
} from "./leads.schema";

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

// Strings as Object.fromEntries(formData) delivers them: blanks are "", the checkbox is "on".
const validForm = {
  fullName: "  Ana Pérez ",
  phone: "+51 938-127 170",
  email: " Ana.Perez@Example.COM ",
  location: "",
  tripId: "",
  destinationText: "",
  source: "whatsapp",
  ownerUserId: "user-1",
  note: "",
  consent: "on",
};

function fieldErrors(input: Record<string, unknown>) {
  const result = createLeadSchema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
}

describe("lead enums", () => {
  it("match the database enums", () => {
    expect(leadStageSchema.options).toEqual(leadStageEnum.enumValues);
    expect(leadSourceSchema.options).toEqual(leadSourceEnum.enumValues);
    expect(leadActivityTypeSchema.options).toEqual(leadActivityTypeEnum.enumValues);
  });

  it("include the automation activity type (n8n)", () => {
    expect(leadActivityTypeSchema.options).toContain("automation");
    expect(leadActivityTypeEnum.enumValues).toContain("automation");
  });
});

describe("phoneSchema", () => {
  it("normalizes to E.164 and rejects a number without country code", () => {
    expect(phoneSchema.parse("+51 938-127 170")).toBe("+51938127170");
    expect(phoneSchema.parse("+56 (9) 1234.5678")).toBe("+56912345678");
    const result = phoneSchema.safeParse("938 127 170");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Escribe el número con código de país, p. ej. +51 938 127 170.");
  });
});

describe("createLeadSchema", () => {
  it("normalizes a valid form and drops unknown keys", () => {
    const result = createLeadSchema.parse({
      ...validForm,
      stage: "paid",
      createdBy: "attacker",
      consentVersion: "forged",
    });

    expect(result).toEqual({
      fullName: "Ana Pérez",
      phone: "+51938127170",
      email: "ana.perez@example.com",
      location: null,
      tripId: null,
      destinationText: null,
      source: "whatsapp",
      ownerUserId: "user-1",
      note: null,
      consent: "on",
    });
    expect(result).not.toHaveProperty("stage");
    expect(result).not.toHaveProperty("createdBy");
    expect(result).not.toHaveProperty("consentVersion");
  });

  it("keeps the optional fields when filled", () => {
    const result = createLeadSchema.parse({
      ...validForm,
      phone: "+56 (9) 1234.5678",
      email: "",
      location: " Lima, Perú ",
      tripId: TRIP_ID,
      destinationText: " Panamá ",
      source: "other",
      note: " Quiere la 21K. ",
    });

    expect(result).toMatchObject({
      phone: "+56912345678",
      email: null,
      location: "Lima, Perú",
      tripId: TRIP_ID,
      destinationText: "Panamá",
      source: "other",
      note: "Quiere la 21K.",
    });
  });

  it("turns missing optional keys into null without errors", () => {
    const optionalKeys = ["email", "location", "tripId", "destinationText", "note"];
    const required = Object.fromEntries(Object.entries(validForm).filter(([key]) => !optionalKeys.includes(key)));
    const result = createLeadSchema.safeParse(required);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      email: null,
      location: null,
      tripId: null,
      destinationText: null,
      note: null,
    });
  });

  it.each([
    ["without country code", "938 127 170"],
    ["with letters", "+51 938 abc 170"],
    ["with 7 digits", "+5193812"],
    ["with 16 digits", "+5193812717012345"],
    ["starting with +0", "+0938127170"],
  ])("rejects a phone %s", (_, phone) => {
    expect(fieldErrors({ ...validForm, phone }).phone).toEqual([
      "Escribe el número con código de país, p. ej. +51 938 127 170.",
    ]);
  });

  it("rejects a 1-character name", () => {
    expect(fieldErrors({ ...validForm, fullName: " A " }).fullName).toEqual([
      "El nombre debe tener entre 2 y 120 caracteres.",
    ]);
  });

  it("rejects an invalid email", () => {
    expect(fieldErrors({ ...validForm, email: "ana@" }).email).toEqual(["Introduce un correo válido."]);
  });

  it("rejects a tripId that is not a UUID", () => {
    expect(fieldErrors({ ...validForm, tripId: "maraton-santiago-2027" }).tripId).toEqual([
      "Elige un viaje del catálogo.",
    ]);
  });

  it("rejects the web_form source in the manual form", () => {
    expect(fieldErrors({ ...validForm, source: "web_form" }).source).toEqual(["Elige el origen del lead."]);
  });

  it.each([
    ["missing", undefined],
    ["not checked", "off"],
  ])("rejects consent %s", (_, consent) => {
    expect(fieldErrors({ ...validForm, consent }).consent).toEqual([
      "Confirma que el contacto aceptó que guardemos sus datos.",
    ]);
  });

  it("rejects an empty owner and texts over their limits", () => {
    const errors = fieldErrors({
      ...validForm,
      ownerUserId: "",
      location: "x".repeat(81),
      destinationText: "x".repeat(121),
      note: "x".repeat(2001),
    });
    expect(Object.keys(errors).sort()).toEqual(["destinationText", "location", "note", "ownerUserId"]);
  });

  it("never echoes the input in its messages", () => {
    const secret = "+51 SECRETO";
    const result = createLeadSchema.safeParse({ ...validForm, phone: secret, fullName: "Z" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).not.toContain("SECRETO");
  });
});

describe("leadListQuerySchema", () => {
  it("parses valid values", () => {
    expect(leadListQuerySchema.parse({ etapa: "quoted", responsable: "mios", pagina: "3" })).toEqual({
      etapa: "quoted",
      responsable: "mios",
      pagina: 3,
    });
  });

  it("falls back to the defaults on invalid values or arrays", () => {
    expect(
      leadListQuerySchema.parse({ etapa: "foo", responsable: ["mios", "user-1"], pagina: ["1", "2"] }),
    ).toEqual({ etapa: undefined, responsable: undefined, pagina: 1 });
    expect(leadListQuerySchema.parse({ etapa: ["new", "lost"], responsable: "" })).toEqual({
      etapa: undefined,
      responsable: undefined,
      pagina: 1,
    });
  });

  it.each(["0", "-3", "abc", "1.5", "1001", ""])("turns pagina=%j into 1", (pagina) => {
    expect(leadListQuerySchema.parse({ pagina }).pagina).toBe(1);
  });

  it("accepts the last page (1000)", () => {
    expect(leadListQuerySchema.parse({ pagina: "1000" }).pagina).toBe(1000);
  });
});
