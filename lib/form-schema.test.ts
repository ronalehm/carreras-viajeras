import { describe, expect, it } from "vitest";
import { z } from "zod";
import { blankToNull, e164PhoneSchema, requiredText } from "./form-schema";

const MESSAGE = "Mensaje fijo.";

function issueMessages(result: { success: boolean; error?: z.ZodError }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

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
    expect(issueMessages(result)).toEqual([MESSAGE]);
  });

  it("validates the trimmed value with a nested transform", () => {
    const upper = blankToNull(z.string().transform((value) => value.toUpperCase()));
    expect(upper.parse(" ab ")).toBe("AB");
  });
});

describe("requiredText", () => {
  const schema = requiredText(2, 5, MESSAGE);

  it("trims and accepts text within the limits", () => {
    expect(schema.parse("  Ana  ")).toBe("Ana");
    expect(schema.parse("ab")).toBe("ab");
    expect(schema.parse("abcde")).toBe("abcde");
  });

  it.each([[""], ["  a  "], ["abcdef"]])("rejects %j with the given message", (value) => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toEqual([MESSAGE]);
  });

  it("rejects a missing value with the given message", () => {
    const result = z.object({ name: schema }).safeParse({});
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toEqual([MESSAGE]);
  });
});

describe("e164PhoneSchema", () => {
  const schema = e164PhoneSchema(MESSAGE);

  it("normalizes spaces, dashes, dots and parentheses", () => {
    expect(schema.parse("+51 938-127.170")).toBe("+51938127170");
    expect(schema.parse("+1 (415) 555-0100")).toBe("+14155550100");
  });

  it.each([["938127170"], ["+0123456789"], ["+51abc"], [""]])(
    "rejects %j with the given message, without echoing the value",
    (value) => {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      const messages = issueMessages(result);
      expect(messages).toEqual([MESSAGE]);
      if (value) for (const message of messages) expect(message).not.toContain(value);
    },
  );

  it("rejects a missing value with the given message", () => {
    const result = z.object({ phone: schema }).safeParse({});
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toEqual([MESSAGE]);
  });

  it("works inside blankToNull for optional phones", () => {
    const optional = blankToNull(schema);
    expect(optional.parse("")).toBeNull();
    expect(optional.parse(" +51 938 127 170 ")).toBe("+51938127170");
    expect(optional.safeParse("938127170").success).toBe(false);
  });
});
