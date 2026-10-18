import { describe, expect, it } from "vitest";
import {
  ackRequestSchema,
  claimRequestSchema,
  eventIdSchema,
  failRequestSchema,
  leadIdSchema,
} from "./integrations.schema";

const UUID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

describe("claimRequestSchema", () => {
  it("defaults the batch to 10", () => {
    expect(claimRequestSchema.parse({})).toEqual({ limit: 10 });
  });

  it.each([1, 2, 25])("accepts limit %d", (limit) => {
    expect(claimRequestSchema.parse({ limit })).toEqual({ limit });
  });

  it.each([0, 26, -1, 2.5, "2", "abc", null])("rejects limit %j", (limit) => {
    expect(claimRequestSchema.safeParse({ limit }).success).toBe(false);
  });
});

describe("ackRequestSchema", () => {
  it("requires a UUID leaseToken", () => {
    expect(ackRequestSchema.parse({ leaseToken: UUID })).toEqual({ leaseToken: UUID });
    expect(ackRequestSchema.safeParse({}).success).toBe(false);
    expect(ackRequestSchema.safeParse({ leaseToken: "abc" }).success).toBe(false);
  });
});

describe("failRequestSchema", () => {
  it.each(["smtp_error", "lead_not_found", "a", "x".repeat(40), "error_2"])("accepts errorCode %s", (errorCode) => {
    expect(failRequestSchema.parse({ leaseToken: UUID, errorCode })).toEqual({ leaseToken: UUID, errorCode });
  });

  it.each(["Error de SMTP", "SMTP_ERROR", "smtp error", "", "x".repeat(41), "smtp-error"])(
    "rejects errorCode %j",
    (errorCode) => {
      expect(failRequestSchema.safeParse({ leaseToken: UUID, errorCode }).success).toBe(false);
    },
  );

  it("rejects an invalid leaseToken", () => {
    expect(failRequestSchema.safeParse({ leaseToken: "abc", errorCode: "smtp_error" }).success).toBe(false);
  });
});

describe("eventIdSchema and leadIdSchema", () => {
  it.each([eventIdSchema, leadIdSchema])("accept a UUID and reject anything else", (schema) => {
    expect(schema.safeParse(UUID).success).toBe(true);
    expect(schema.safeParse("abc").success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
  });
});
