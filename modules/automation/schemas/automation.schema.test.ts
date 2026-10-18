// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// tripSlugSchema comes from the public API of @/modules/trips, which also exports server-only services.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import {
  ackRequestSchema,
  claimRequestSchema,
  DEFAULT_CLAIM_LIMIT,
  eventIdSchema,
  failRequestSchema,
  leadCreatedPayloadSchema,
  MAX_CLAIM_LIMIT,
} from "./automation.schema";

const LEAD_ID = "3f2c1a9e-7b4d-4e8f-9a1b-2c3d4e5f6a7b";
const LEASE_TOKEN = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const valid = { leadId: LEAD_ID, tripSlug: "maraton-santiago-2027", source: "landing_contact" };

describe("leadCreatedPayloadSchema", () => {
  it("accepts a valid payload unchanged", () => {
    expect(leadCreatedPayloadSchema.parse(valid)).toEqual(valid);
  });

  it("accepts a null tripSlug", () => {
    expect(leadCreatedPayloadSchema.parse({ ...valid, tripSlug: null })).toEqual({ ...valid, tripSlug: null });
  });

  it("normalizes an uppercase tripSlug to the trips.slug format", () => {
    expect(leadCreatedPayloadSchema.parse({ ...valid, tripSlug: "Maraton-Santiago-2027" }).tripSlug).toBe(
      "maraton-santiago-2027",
    );
  });

  it.each([
    ["a non-UUID leadId", { ...valid, leadId: "lead-1" }],
    ["a missing leadId", { tripSlug: valid.tripSlug, source: valid.source }],
    ["a tripSlug with spaces inside", { ...valid, tripSlug: "maraton santiago" }],
    ["a too short tripSlug", { ...valid, tripSlug: "ab" }],
    ["a missing tripSlug", { leadId: LEAD_ID, source: valid.source }],
    ["another source", { ...valid, source: "crm" }],
    ["extra fields", { ...valid, email: "ana@example.com" }],
  ])("rejects %s", (_, payload) => {
    expect(leadCreatedPayloadSchema.safeParse(payload).success).toBe(false);
  });
});

describe("claimRequestSchema", () => {
  it("defaults limit to 10 when absent", () => {
    expect(claimRequestSchema.parse({})).toEqual({ limit: DEFAULT_CLAIM_LIMIT });
    expect(DEFAULT_CLAIM_LIMIT).toBe(10);
  });

  it.each([1, 10, MAX_CLAIM_LIMIT])("accepts limit %d", (limit) => {
    expect(claimRequestSchema.parse({ limit })).toEqual({ limit });
  });

  it.each([0, 26, 2.5, -1, "10", null])("rejects limit %j", (limit) => {
    expect(claimRequestSchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(claimRequestSchema.safeParse({ limit: 5, status: "dead" }).success).toBe(false);
  });
});

describe("ackRequestSchema", () => {
  it("accepts a UUID lease token", () => {
    expect(ackRequestSchema.parse({ leaseToken: LEASE_TOKEN })).toEqual({ leaseToken: LEASE_TOKEN });
  });

  it.each([{}, { leaseToken: "token" }, { leaseToken: LEASE_TOKEN, extra: 1 }])("rejects %j", (body) => {
    expect(ackRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("failRequestSchema", () => {
  it.each(["timeout", "unsupported_event", "a", "x".repeat(64), "http_503"])("accepts the error code %j", (errorCode) => {
    expect(failRequestSchema.parse({ leaseToken: LEASE_TOKEN, errorCode })).toEqual({ leaseToken: LEASE_TOKEN, errorCode });
  });

  it.each(["provider down", "Timeout", "x".repeat(65), "", "time-out", "error\n"])(
    "rejects the error code %j",
    (errorCode) => {
      expect(failRequestSchema.safeParse({ leaseToken: LEASE_TOKEN, errorCode }).success).toBe(false);
    },
  );

  it("rejects a missing error code, a non-UUID token and extra fields", () => {
    expect(failRequestSchema.safeParse({ leaseToken: LEASE_TOKEN }).success).toBe(false);
    expect(failRequestSchema.safeParse({ leaseToken: "token", errorCode: "timeout" }).success).toBe(false);
    expect(failRequestSchema.safeParse({ leaseToken: LEASE_TOKEN, errorCode: "timeout", detail: "x" }).success).toBe(false);
  });
});

describe("eventIdSchema", () => {
  it("accepts a UUID and rejects anything else", () => {
    expect(eventIdSchema.safeParse(LEAD_ID).success).toBe(true);
    expect(eventIdSchema.safeParse("123").success).toBe(false);
  });
});
