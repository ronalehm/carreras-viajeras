// @vitest-environment node
import { describe, expect, it } from "vitest";
import { userListFilterSchema, userRoleFilterSchema } from "./userDirectory.schema";

const parse = (searchParams: Record<string, unknown>) => userListFilterSchema.parse(searchParams);

describe("userRoleFilterSchema", () => {
  it("offers the staff roles plus the derived runner, in this order", () => {
    expect(userRoleFilterSchema.options).toEqual(["commercial", "admin", "sponsor", "runner"]);
  });
});

describe("userListFilterSchema", () => {
  it("returns no filter for empty search params", () => {
    expect(parse({})).toEqual({});
  });

  describe("q", () => {
    it("is trimmed and keeps its case", () => {
      expect(parse({ q: "  ANA@ " }).q).toBe("ANA@");
    });

    it("keeps LIKE wildcards as plain text", () => {
      expect(parse({ q: "%" }).q).toBe("%");
      expect(parse({ q: "_" }).q).toBe("_");
    });

    it("accepts up to 100 characters", () => {
      expect(parse({ q: "a".repeat(100) }).q).toBe("a".repeat(100));
      expect(parse({ q: ` ${"a".repeat(100)} ` }).q).toBe("a".repeat(100));
    });

    it.each([
      ["empty", ""],
      ["blank", "   "],
      ["longer than 100 characters", "a".repeat(101)],
      ["repeated (array)", ["ana", "luis"]],
      ["not a string", 42],
    ])("is ignored when %s", (_label, q) => {
      expect(parse({ q }).q).toBeUndefined();
    });
  });

  describe("rol", () => {
    it.each(userRoleFilterSchema.options)("accepts %s and returns it as role", (rol) => {
      expect(parse({ rol })).toEqual({ role: rol });
    });

    it.each([
      ["unknown", "operations"],
      ["empty", ""],
      ["differently cased", "Admin"],
      ["repeated (array)", ["admin", "sponsor"]],
    ])("is ignored when %s", (_label, rol) => {
      expect(parse({ rol }).role).toBeUndefined();
    });

    it("never outputs the URL key rol", () => {
      expect(parse({ rol: "runner" })).not.toHaveProperty("rol");
    });
  });

  it("combines q and rol", () => {
    expect(parse({ q: "ana", rol: "runner" })).toEqual({ q: "ana", role: "runner" });
  });

  it("drops an invalid key without dropping the valid one", () => {
    expect(parse({ q: "ana", rol: "operations" })).toEqual({ q: "ana" });
    expect(parse({ q: "", rol: "admin" })).toEqual({ role: "admin" });
  });

  it("discards extra keys", () => {
    const result = parse({ q: "ana", role: "admin", viaje: "x", pagina: "2" });
    expect(result).toEqual({ q: "ana" });
    expect(result.role).toBeUndefined();
    expect(result).not.toHaveProperty("viaje");
    expect(result).not.toHaveProperty("pagina");
  });
});
