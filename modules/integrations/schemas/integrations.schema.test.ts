import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactPreferenceEnum, leadChannelEnum } from "@/lib/db-schema";
import {
  ackRequestSchema,
  claimRequestSchema,
  createIntegrationLeadSchema,
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

describe("createIntegrationLeadSchema", () => {
  const NOW = new Date("2026-10-25T15:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const googleForm = {
    source: "google_form",
    externalId: "1AbC-sheet_id:42",
    consentVersion: "google-form-v1",
    consentedAt: "2026-09-14T08:12:00-05:00",
    fullName: "  Ana Pérez ",
    phone: "+51 938-127 170",
    email: " Ana.Perez@Example.COM ",
    tripSlug: "maraton-santiago-2027",
    destinationText: "Santiago",
    channel: "instagram",
    originDetail: " Historia de Instagram ",
    referredBy: "Club Runners Lima",
    contactPreference: "email",
  };
  const importRow = {
    source: "import",
    externalId: "mml-2026:17",
    consentVersion: "import-mml-v1",
    consentedAt: "2026-04-12T10:00:00Z",
    fullName: "Luis García",
    phone: "+51938127171",
  };

  it("accepts a google_form answer and normalizes phone, email and text", () => {
    expect(createIntegrationLeadSchema.parse(googleForm)).toEqual({
      source: "google_form",
      externalId: "1AbC-sheet_id:42",
      consentVersion: "google-form-v1",
      consentedAt: "2026-09-14T08:12:00-05:00",
      fullName: "Ana Pérez",
      phone: "+51938127170",
      email: "ana.perez@example.com",
      tripSlug: "maraton-santiago-2027",
      destinationText: "Santiago",
      channel: "instagram",
      originDetail: "Historia de Instagram",
      referredBy: "Club Runners Lima",
      contactPreference: "email",
    });
  });

  it("accepts an import row: missing optionals become null and channel defaults to unknown", () => {
    expect(createIntegrationLeadSchema.parse(importRow)).toEqual({
      ...importRow,
      email: null,
      tripSlug: null,
      destinationText: null,
      channel: "unknown",
      originDetail: null,
      referredBy: null,
      contactPreference: null,
    });
  });

  it('turns "" (a blank spreadsheet cell), blanks and null into null in the optional fields', () => {
    const blanks = { email: "", tripSlug: "", destinationText: "  ", originDetail: "", referredBy: null, contactPreference: "" };
    expect(createIntegrationLeadSchema.parse({ ...importRow, ...blanks })).toMatchObject({
      email: null,
      tripSlug: null,
      destinationText: null,
      originDetail: null,
      referredBy: null,
      contactPreference: null,
    });
  });

  it("accepts a consent given up to 5 minutes in the future (clock skew)", () => {
    expect(createIntegrationLeadSchema.safeParse({ ...importRow, consentedAt: "2026-10-25T15:05:00Z" }).success).toBe(true);
  });

  it.each([
    ["a version of the other entry path", { ...googleForm, consentVersion: "import-mml-v1" }],
    ["a version of the other entry path (import)", { ...importRow, consentVersion: "google-form-v1" }],
    ["an unknown version", { ...importRow, consentVersion: "import-mml-v2" }],
    ["consentedAt without time zone", { ...importRow, consentedAt: "2026-04-12T10:00:00" }],
    ["consentedAt more than 5 minutes in the future", { ...importRow, consentedAt: "2026-10-25T15:05:01Z" }],
    ["consentedAt as a date only", { ...importRow, consentedAt: "2026-04-12" }],
    ["externalId with spaces", { ...importRow, externalId: "mml 2026:17" }],
    ["externalId of 101 characters", { ...importRow, externalId: "x".repeat(101) }],
    ["an empty externalId", { ...importRow, externalId: "" }],
    ["a phone without country code", { ...importRow, phone: "938 127 170" }],
    ["source web_form", { ...importRow, source: "web_form" }],
    ["an invalid email", { ...importRow, email: "ana@" }],
    ["an invalid trip slug", { ...importRow, tripSlug: "Maraton Santiago" }],
    ["an unknown channel", { ...importRow, channel: "foo" }],
    ["an unknown contact preference", { ...importRow, contactPreference: "sms" }],
    ["an origin detail of 1 character", { ...importRow, originDetail: "x" }],
    ["a referrer of 121 characters", { ...importRow, referredBy: "x".repeat(121) }],
    ["a name of 1 character", { ...importRow, fullName: " A " }],
  ])("rejects %s", (_case, body) => {
    expect(createIntegrationLeadSchema.safeParse(body).success).toBe(false);
  });

  it("drops ownerUserId, stage, bulk and createdBy", () => {
    const parsed = createIntegrationLeadSchema.parse({
      ...importRow,
      ownerUserId: "user-1",
      stage: "paid",
      bulk: false,
      createdBy: "user-1",
    });
    for (const key of ["ownerUserId", "stage", "bulk", "createdBy"]) expect(parsed).not.toHaveProperty(key);
  });

  it("uses the channel and contact preference values of the database enums", () => {
    for (const channel of leadChannelEnum.enumValues) {
      expect(createIntegrationLeadSchema.parse({ ...importRow, channel }).channel).toBe(channel);
    }
    for (const contactPreference of contactPreferenceEnum.enumValues) {
      expect(createIntegrationLeadSchema.parse({ ...importRow, contactPreference }).contactPreference).toBe(contactPreference);
    }
  });
});
