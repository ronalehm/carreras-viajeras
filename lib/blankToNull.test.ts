import { describe, expect, it } from "vitest";
import { z } from "zod";
import { blankToNull } from "./blankToNull";

describe("blankToNull", () => {
  const schema = blankToNull(z.string().max(3));

  it("turns blank or missing input into null and trims the rest", () => {
    expect(schema.parse("  ")).toBeNull();
    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse(" ab ")).toBe("ab");
  });

  it("still validates non-blank input", () => {
    expect(schema.safeParse("abcd").success).toBe(false);
  });
});
