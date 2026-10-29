import { describe, expect, it } from "vitest";
import { emailSchema } from "./auth.schema";

describe("emailSchema", () => {
  it("trims the email and lowercases it", () => {
    const result = emailSchema.safeParse("  Admin@Example.COM  ");

    expect(result.success).toBe(true);
    expect(result.data).toBe("admin@example.com");
  });

  it.each(["", "   ", "not-an-email", "ana", "ana@"])("rejects %j with a Spanish message", (email) => {
    const result = emailSchema.safeParse(email);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Introduce un correo válido.",
    ]);
  });
});
