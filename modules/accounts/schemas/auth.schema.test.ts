import { describe, expect, it } from "vitest";
import { signInSchema } from "./auth.schema";

describe("signInSchema", () => {
  it("trims the email and lowercases it", () => {
    const result = signInSchema.safeParse({
      email: "  Admin@Example.COM  ",
      password: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: "admin@example.com", password: "secret" });
  });

  it("rejects an invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["email"]]);
  });

  it("rejects an empty email", () => {
    const result = signInSchema.safeParse({ email: "   ", password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["email"]]);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({ email: "admin@example.com", password: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["password"]]);
  });

  it("does not trim or otherwise alter the password", () => {
    const result = signInSchema.safeParse({ email: "admin@example.com", password: " pass " });

    expect(result.data?.password).toBe(" pass ");
  });
});
