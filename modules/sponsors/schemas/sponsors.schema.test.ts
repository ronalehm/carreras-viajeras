// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sponsorFormSchema, sponsorSlugSchema, updateSponsorSchema } from "./sponsors.schema";

const SPONSOR_ID = "5b7f3c2e-1a4d-4e8f-9c0b-6d2a8e4f1b37";
const SLUG_MESSAGE = "Usa minúsculas, números y guiones (p. ej. marca-deportiva).";
const URL_MESSAGE = "Indica una URL que empiece por https://.";
const DESCRIPTION_MESSAGE = "La descripción debe tener entre 10 y 500 caracteres.";

// Strings as they come from Object.fromEntries(formData).
const validForm = {
  name: "  Marca Deportiva ",
  slug: "marca-deportiva",
  logoUrl: " https://example.com/logo.png ",
  websiteUrl: "https://example.com/",
  description: "  Ropa y calzado para corredores.  ",
};

const parse = (overrides: Record<string, string>) =>
  sponsorFormSchema.safeParse({ ...validForm, ...overrides });

const firstMessage = (overrides: Record<string, string>) => parse(overrides).error?.issues[0]?.message;

describe("sponsorFormSchema", () => {
  it("parses a complete form, trimming every text", () => {
    expect(sponsorFormSchema.parse(validForm)).toEqual({
      name: "Marca Deportiva",
      slug: "marca-deportiva",
      logoUrl: "https://example.com/logo.png",
      websiteUrl: "https://example.com/",
      description: "Ropa y calzado para corredores.",
    });
  });

  it("turns blank or missing optional fields into null", () => {
    expect(parse({ logoUrl: "", websiteUrl: "  ", description: "" }).data).toMatchObject({
      logoUrl: null, websiteUrl: null, description: null,
    });
    expect(sponsorFormSchema.parse({ name: "Marca", slug: "marca" })).toEqual({
      name: "Marca", slug: "marca", logoUrl: null, websiteUrl: null, description: null,
    });
  });

  it("drops unknown keys such as createdBy or id", () => {
    const parsed = parse({ createdBy: "attacker", id: SPONSOR_ID });
    expect(parsed.data).not.toHaveProperty("createdBy");
    expect(parsed.data).not.toHaveProperty("id");
  });

  it.each(["a", " a ", "", "x".repeat(81)])("rejects the name %j", (name) => {
    expect(firstMessage({ name })).toBe("El nombre debe tener entre 2 y 80 caracteres.");
  });

  describe("slug", () => {
    it("lowercases and trims", () => {
      expect(parse({ slug: "  Marca-Deportiva " }).data?.slug).toBe("marca-deportiva");
    });

    it.each(["Marca Deportiva", "marca deportiva", "marca--deportiva", "-marca", "marca-", "ab", "márca", "a".repeat(81), ""])(
      "rejects %j with the fixed message",
      (slug) => {
        expect(firstMessage({ slug })).toBe(SLUG_MESSAGE);
        expect(sponsorSlugSchema.safeParse(slug).success).toBe(false);
      },
    );
  });

  it.each(["logoUrl", "websiteUrl"])("%s only accepts https:// URLs up to 2048 characters", (field) => {
    for (const url of ["http://example.com/", "ftp://example.com/", "no-es-url", `https://example.com/${"a".repeat(2040)}`]) {
      expect(firstMessage({ [field]: url })).toBe(URL_MESSAGE);
    }
  });

  it.each(["x".repeat(9), "x".repeat(501), " corta  "])("rejects the description %j", (description) => {
    expect(firstMessage({ description })).toBe(DESCRIPTION_MESSAGE);
  });

  it("accepts descriptions of 10 and 500 characters", () => {
    expect(parse({ description: "x".repeat(10) }).success).toBe(true);
    expect(parse({ description: "x".repeat(500) }).success).toBe(true);
  });
});

describe("updateSponsorSchema", () => {
  it("drops the slug and keeps the id", () => {
    expect(updateSponsorSchema.parse({ ...validForm, id: SPONSOR_ID })).toEqual({
      id: SPONSOR_ID,
      name: "Marca Deportiva",
      logoUrl: "https://example.com/logo.png",
      websiteUrl: "https://example.com/",
      description: "Ropa y calzado para corredores.",
    });
  });

  it.each(["abc", "", undefined])("requires a UUID id (%j)", (id) => {
    const parsed = updateSponsorSchema.safeParse({ ...validForm, id });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path[0])).toEqual(["id"]);
  });
});
