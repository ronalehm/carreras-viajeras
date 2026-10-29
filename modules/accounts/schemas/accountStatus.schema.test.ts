// @vitest-environment node
import { describe, expect, it } from "vitest";
import { accountTargetSchema, deleteAccountSchema } from "./accountStatus.schema";

describe("accountTargetSchema", () => {
  it("accepts a Clerk user id", () => {
    expect(accountTargetSchema.safeParse({ userId: "user_2abc" })).toEqual({
      success: true,
      data: { userId: "user_2abc" },
    });
  });

  it.each([["an empty id", ""], ["a too long id", "x".repeat(256)]])("rejects %s", (_, userId) => {
    expect(accountTargetSchema.safeParse({ userId }).success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(accountTargetSchema.safeParse({}).success).toBe(false);
  });

  it("drops extra fields such as the actor or the status", () => {
    const result = accountTargetSchema.safeParse({
      userId: "user_2abc",
      actorUserId: "attacker",
      disabledBy: "attacker",
      status: "active",
    });
    expect(result).toEqual({ success: true, data: { userId: "user_2abc" } });
  });
});

describe("deleteAccountSchema", () => {
  it("trims and lowercases the confirmation email", () => {
    expect(
      deleteAccountSchema.safeParse({ userId: "user_2abc", confirmEmail: "  Ana@Correo.COM " }),
    ).toEqual({ success: true, data: { userId: "user_2abc", confirmEmail: "ana@correo.com" } });
  });

  it.each([
    ["a missing email", { userId: "user_2abc" }],
    ["an empty email", { userId: "user_2abc", confirmEmail: "   " }],
    ["a too long email", { userId: "user_2abc", confirmEmail: `${"a".repeat(320)}@x.pe` }],
    ["a missing id", { confirmEmail: "ana@correo.com" }],
  ])("rejects %s", (_, input) => {
    expect(deleteAccountSchema.safeParse(input).success).toBe(false);
  });

  it("drops extra fields", () => {
    const result = deleteAccountSchema.safeParse({
      userId: "user_2abc",
      confirmEmail: "ana@correo.com",
      deletedBy: "attacker",
    });
    expect(result).toEqual({
      success: true,
      data: { userId: "user_2abc", confirmEmail: "ana@correo.com" },
    });
  });
});
