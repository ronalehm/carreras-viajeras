// @vitest-environment node
import { describe, expect, it } from "vitest";
import { roleRequestIdSchema } from "./roleRequest.schema";

const REQUEST_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

describe("roleRequestIdSchema", () => {
  it("accepts a UUID", () => {
    expect(roleRequestIdSchema.safeParse({ requestId: REQUEST_ID })).toEqual({
      success: true,
      data: { requestId: REQUEST_ID },
    });
  });

  it.each(["", "abc", "123", `${REQUEST_ID}x`, "' OR 1=1 --"])("rejects the id %j", (requestId) => {
    expect(roleRequestIdSchema.safeParse({ requestId }).success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(roleRequestIdSchema.safeParse({}).success).toBe(false);
  });

  it("drops extra fields such as the actor, user or status", () => {
    const result = roleRequestIdSchema.safeParse({
      requestId: REQUEST_ID,
      decidedBy: "attacker",
      userId: "other-user",
      status: "approved",
    });

    expect(result.data).toEqual({ requestId: REQUEST_ID });
  });
});
