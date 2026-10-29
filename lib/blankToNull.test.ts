import { describe, expect, it } from "vitest";
import { z } from "zod";
import { blankToNull } from "./blankToNull";

const MESSAGE = "Mensaje fijo.";

describe("blankToNull", () => {
  const schema = z.object({ city: blankToNull(z.string().min(2, MESSAGE).max(80, MESSAGE)) });

  it.each([[""], ["   "]])("turns %j into null", (value) => {
    expect(schema.parse({ city: value })).toEqual({ city: null });
  });

  it("treats a missing key as blank", () => {
    expect(schema.parse({})).toEqual({ city: null });
  });

  it("trims and validates the rest with the given schema", () => {
    expect(schema.parse({ city: "  Lima  " })).toEqual({ city: "Lima" });

    const result = schema.safeParse({ city: " a " });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([MESSAGE]);
  });

  it("validates the trimmed value with a nested transform", () => {
    const upper = blankToNull(z.string().transform((value) => value.toUpperCase()));
    expect(upper.parse(" ab ")).toBe("AB");
  });
});
