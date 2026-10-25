// @vitest-environment node
import { describe, expect, it } from "vitest";
import { raceDistanceEnum, shirtSizeEnum, travelDocumentTypeEnum } from "@/lib/db-schema";
import {
  raceDistanceSchema,
  runnerProfileFormSchema,
  shirtSizeSchema,
  travelDocumentTypeSchema,
} from "./runnerProfile.schema";

const TODAY = "2026-10-25";
const schema = runnerProfileFormSchema(TODAY);

// Strings as they come from Object.fromEntries(formData).
const minimalForm = { fullName: "  Ana Pérez ", phone: "+51 938 127 170", consent: "on" };
const fullForm: Record<string, string> = {
  ...minimalForm,
  country: " Perú ",
  city: " Lima ",
  birthDate: "1990-04-12",
  documentType: "passport",
  documentNumber: " ab-123.456 ",
  documentExpiresOn: "2030-01-31",
  shirtSize: "m",
  preferredDistance: "42k",
  personalBest: " 42K en 3:45:10 ",
  club: " Lima Runners ",
  emergencyContactName: " Luis Pérez ",
  emergencyContactPhone: "+51 999 888 777",
  medicalNotes: " Alergia a la penicilina. ",
};

const parse = (overrides: Record<string, string | undefined>) =>
  schema.safeParse({ ...fullForm, ...overrides });

const errorsOf = (result: ReturnType<typeof parse>) => result.error?.flatten().fieldErrors ?? {};

describe("enum schemas", () => {
  it("match the database enums", () => {
    expect(travelDocumentTypeSchema.options).toEqual(travelDocumentTypeEnum.enumValues);
    expect(shirtSizeSchema.options).toEqual(shirtSizeEnum.enumValues);
    expect(raceDistanceSchema.options).toEqual(raceDistanceEnum.enumValues);
  });
});

describe("runnerProfileFormSchema", () => {
  it("accepts only the name, the phone and the consent, leaving the rest as null", () => {
    expect(schema.safeParse(minimalForm).data).toEqual({
      fullName: "Ana Pérez",
      phone: "+51938127170",
      country: null,
      city: null,
      birthDate: null,
      documentType: null,
      documentNumber: null,
      documentExpiresOn: null,
      shirtSize: null,
      preferredDistance: null,
      personalBest: null,
      club: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      medicalNotes: null,
      consent: "on",
    });
  });

  it("parses a complete form into clean values", () => {
    expect(parse({}).data).toEqual({
      fullName: "Ana Pérez",
      phone: "+51938127170",
      country: "Perú",
      city: "Lima",
      birthDate: "1990-04-12",
      documentType: "passport",
      documentNumber: "AB123456",
      documentExpiresOn: "2030-01-31",
      shirtSize: "m",
      preferredDistance: "42k",
      personalBest: "42K en 3:45:10",
      club: "Lima Runners",
      emergencyContactName: "Luis Pérez",
      emergencyContactPhone: "+51999888777",
      medicalNotes: "Alergia a la penicilina.",
      consent: "on",
    });
  });

  it("turns blank optional fields into null", () => {
    const result = schema.safeParse({ ...minimalForm, country: "", city: "   ", shirtSize: "", medicalNotes: " " });
    expect(result.data).toMatchObject({ country: null, city: null, shirtSize: null, medicalNotes: null });
  });

  it("drops extra keys that never come from the form", () => {
    const result = schema.safeParse({
      ...fullForm,
      userId: "other-user",
      email: "other@example.com",
      consentVersion: "forged",
      consentedAt: "2020-01-01",
      createdAt: "2020-01-01",
    });
    expect(result.success).toBe(true);
    for (const key of ["userId", "email", "consentVersion", "consentedAt", "createdAt"]) {
      expect(result.data).not.toHaveProperty(key);
    }
  });

  it("requires the name and a phone with country code", () => {
    expect(errorsOf(parse({ fullName: " A " })).fullName).toEqual([
      "El nombre debe tener entre 2 y 120 caracteres.",
    ]);
    expect(errorsOf(parse({ fullName: undefined })).fullName).toEqual([
      "El nombre debe tener entre 2 y 120 caracteres.",
    ]);
    expect(errorsOf(parse({ phone: "938127170" })).phone).toEqual([
      "Escribe el número con código de país, p. ej. +51 938 127 170.",
    ]);
  });

  it("checks the length of country and city", () => {
    const errors = errorsOf(parse({ country: "P", city: "x".repeat(81) }));
    expect(errors.country).toEqual(["El país debe tener entre 2 y 80 caracteres."]);
    expect(errors.city).toEqual(["La ciudad debe tener entre 2 y 80 caracteres."]);
  });

  describe("documentNumber", () => {
    it("removes spaces, dots and dashes and uppercases", () => {
      expect(parse({ documentNumber: " ab-123.456 " }).data?.documentNumber).toBe("AB123456");
    });

    it.each(["ab", "ÑÑÑÑ", "A".repeat(21)])("rejects %s", (documentNumber) => {
      expect(errorsOf(parse({ documentNumber })).documentNumber).toEqual([
        "Usa entre 4 y 20 letras o números.",
      ]);
    });
  });

  describe("document group", () => {
    it("requires the number when the type is set", () => {
      const errors = errorsOf(parse({ documentNumber: "", documentExpiresOn: "" }));
      expect(errors).toEqual({ documentNumber: ["Indica el número del documento."] });
    });

    it("requires the type when the number is set", () => {
      const errors = errorsOf(parse({ documentType: "" }));
      expect(errors).toEqual({ documentType: ["Elige el tipo de documento."] });
    });

    it("requires a document when the expiry date is set", () => {
      const errors = errorsOf(parse({ documentType: "", documentNumber: "" }));
      expect(errors).toEqual({ documentType: ["Elige el tipo de documento."] });
    });

    it("rejects an unknown document type", () => {
      expect(errorsOf(parse({ documentType: "visa" })).documentType).toEqual(["Elige el tipo de documento."]);
    });
  });

  describe("dates", () => {
    it("rejects an expiry date before today and accepts today", () => {
      expect(errorsOf(parse({ documentExpiresOn: "2026-10-24" })).documentExpiresOn).toEqual([
        "La fecha de vencimiento ya pasó.",
      ]);
      expect(parse({ documentExpiresOn: "2026-10-25" }).success).toBe(true);
    });

    it("rejects a malformed expiry date with a single message", () => {
      expect(errorsOf(parse({ documentExpiresOn: "31/01/2030" })).documentExpiresOn).toEqual([
        "Indica una fecha de vencimiento válida.",
      ]);
    });

    it.each(["2026-10-26", "1899-12-31", "1990-02-30", "12/04/1990"])("rejects the birth date %s", (birthDate) => {
      expect(errorsOf(parse({ birthDate })).birthDate).toEqual(["Indica una fecha de nacimiento válida."]);
    });

    it("accepts a birth date of today or 1900-01-01", () => {
      expect(parse({ birthDate: "2026-10-25" }).success).toBe(true);
      expect(parse({ birthDate: "1900-01-01" }).success).toBe(true);
    });
  });

  describe("emergency contact group", () => {
    it("requires the phone when the name is set", () => {
      expect(errorsOf(parse({ emergencyContactPhone: "" }))).toEqual({
        emergencyContactPhone: ["Indica el teléfono del contacto de emergencia."],
      });
    });

    it("requires the name when the phone is set", () => {
      expect(errorsOf(parse({ emergencyContactName: " " }))).toEqual({
        emergencyContactName: ["Indica el nombre del contacto de emergencia."],
      });
    });

    it("validates the contact phone as E.164", () => {
      expect(errorsOf(parse({ emergencyContactPhone: "+51abc" })).emergencyContactPhone).toEqual([
        "Escribe el número con código de país, p. ej. +51 938 127 170.",
      ]);
    });
  });

  it("limits the race fields and the medical notes", () => {
    const errors = errorsOf(
      parse({ personalBest: "x".repeat(61), club: "x".repeat(81), medicalNotes: "x".repeat(501), shirtSize: "xxxl" }),
    );
    expect(errors.personalBest).toEqual(["La mejor marca puede tener hasta 60 caracteres."]);
    expect(errors.club).toEqual(["El club puede tener hasta 80 caracteres."]);
    expect(errors.medicalNotes).toEqual(["Puedes escribir hasta 500 caracteres."]);
    expect(errors.shirtSize).toEqual(["Elige una talla de polo válida."]);
    expect(parse({ medicalNotes: "x".repeat(500) }).success).toBe(true);
  });

  it("requires the consent on every save", () => {
    expect(errorsOf(parse({ consent: undefined })).consent).toEqual([
      "Para guardar tu perfil, acepta el uso de tus datos.",
    ]);
    expect(errorsOf(parse({ consent: "yes" })).consent).toEqual([
      "Para guardar tu perfil, acepta el uso de tus datos.",
    ]);
  });

  it("reports group errors together with other field errors", () => {
    const errors = errorsOf(
      parse({ consent: undefined, phone: "938127170", documentType: "", emergencyContactPhone: "" }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["consent", "documentType", "emergencyContactPhone", "phone"].sort(),
    );
  });

  it("never echoes the submitted values in error messages", () => {
    const invalid = {
      fullName: "Z",
      phone: "938127170",
      country: "Q",
      city: "W",
      birthDate: "2099-01-01",
      documentType: "visa-secreta",
      documentNumber: "ÑÑÑÑsecreto",
      documentExpiresOn: "2001-01-01",
      shirtSize: "talla-secreta",
      preferredDistance: "distancia-secreta",
      personalBest: "marca-secreta".repeat(10),
      club: "club-secreto".repeat(10),
      emergencyContactName: "N",
      emergencyContactPhone: "+0123456789",
      medicalNotes: "diagnóstico-secreto".repeat(30),
      consent: "consentimiento-secreto",
    };
    const result = schema.safeParse(invalid);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => issue.message);
    expect(messages.length).toBeGreaterThanOrEqual(Object.keys(invalid).length);
    for (const message of messages) {
      for (const value of Object.values(invalid).filter((value) => value.length > 1)) {
        expect(message).not.toContain(value);
      }
      expect(message).not.toMatch(/secret|938127170|0123456789|2099|2001/);
    }
  });
});
