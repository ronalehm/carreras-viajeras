import { describe, expect, it } from "vitest";
import { z } from "zod";
import { leadActivityTypeEnum, leadSourceEnum, leadStageEnum } from "@/lib/db-schema";
import {
  createLeadSchema,
  leadActivityTypeSchema,
  leadEmailSchema,
  leadFullNameSchema,
  leadPhoneSchema,
  leadListQuerySchema,
  leadSourceSchema,
  leadStageSchema,
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
});

function issues(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return result.error.issues.map((issue) => issue.message);
}

describe("shared lead subschemas", () => {
  it("leadFullNameSchema trims and accepts 2 to 120 characters", () => {
    expect(leadFullNameSchema.parse("  Ana Pérez ")).toBe("Ana Pérez");
    expect(leadFullNameSchema.parse("x".repeat(120))).toHaveLength(120);
    for (const value of [" A ", "", "x".repeat(121), undefined]) {
      expect(issues(leadFullNameSchema, value)).toEqual(["El nombre debe tener entre 2 y 120 caracteres."]);
    }
  });

  it("leadPhoneSchema normalizes to E.164", () => {
    expect(leadPhoneSchema.parse("+51 (938) 127-170")).toBe("+51938127170");
    expect(leadPhoneSchema.parse("+56 9.1234.5678")).toBe("+56912345678");
    for (const value of ["938 127 170", "+0938127170", "", undefined]) {
      expect(issues(leadPhoneSchema, value)).toEqual([
        "Escribe el número con código de país, p. ej. +51 938 127 170.",
      ]);
    }
  });

  it("leadEmailSchema trims and lowercases", () => {
    expect(leadEmailSchema.parse(" Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("leadEmailSchema accepts 254 characters and rejects 255", () => {
    // Labels of at most 63 characters, so only the length limit decides.
    const email = (firstLabel: number) =>
      `${"a".repeat(64)}@${"b".repeat(firstLabel)}.${"c".repeat(60)}.${"d".repeat(63)}.com`;
    expect(email(60)).toHaveLength(254);
    expect(leadEmailSchema.parse(email(60))).toBe(email(60));
    expect(issues(leadEmailSchema, email(61))).toEqual(["Introduce un correo válido."]);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["without domain", "ana@"],
    ["missing", undefined],
  ])("leadEmailSchema rejects an email %s", (_, value) => {
    expect(issues(leadEmailSchema, value)).toEqual(["Introduce un correo válido."]);
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
