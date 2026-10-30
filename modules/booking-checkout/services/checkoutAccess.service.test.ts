// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/env")>(), getStripeCheckoutConfig: vi.fn(),
}));
import { getDb } from "@/lib/db";
import { getStripeCheckoutConfig, type StripeCheckoutConfig } from "@/lib/env";
import { checkoutAccessFor, checkoutRequiresDemoParticipant, isActiveDemoParticipant } from "./checkoutAccess.service";

const config = (overrides: Partial<StripeCheckoutConfig>): StripeCheckoutConfig => ({
  enabled: true, mode: "demo", secretKey: "sk_test_unit_only", webhookSecret: "whsec_unit_only",
  allowDraftContracts: false, disabledReason: null, ...overrides,
});
function participants(rows: unknown[]) {
  const where = vi.fn((condition: SQL) => { void condition; return { limit: async () => rows }; });
  const select = vi.fn(() => ({ from: () => ({ where }) }));
  vi.mocked(getDb).mockReturnValue({ select } as never);
  return { select, where };
}
beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(getStripeCheckoutConfig).mockReset().mockReturnValue(config({}));
});

describe("isActiveDemoParticipant", () => {
  it("reads the participant by user id and only while revoked_at is NULL", async () => {
    const { where } = participants([{ userId: "user_demo" }]);
    await expect(isActiveDemoParticipant("user_demo")).resolves.toBe(true);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('"checkout_demo_participants"."user_id" = $1');
    expect(query.sql).toContain('"checkout_demo_participants"."revoked_at" is null');
    expect(query.params).toEqual(["user_demo"]);
  });
  it("is false for an unknown or revoked participant", async () => {
    participants([]);
    await expect(isActiveDemoParticipant("user_revoked")).resolves.toBe(false);
  });
});

describe("checkoutAccessFor", () => {
  it.each(["test", "live"] as const)("follows the configuration in %s mode, without a session or a query", async (mode) => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config({ mode }));
    await expect(checkoutAccessFor(null)).resolves.toBe(true);
    await expect(checkoutAccessFor("user_any")).resolves.toBe(true);
    expect(getDb).not.toHaveBeenCalled();
    expect(checkoutRequiresDemoParticipant()).toBe(false);
  });
  it("is closed while checkout is off, whatever the user", async () => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config({ enabled: false, disabledReason: "not_enabled" }));
    participants([{ userId: "user_demo" }]);
    await expect(checkoutAccessFor("user_demo")).resolves.toBe(false);
    expect(getDb).not.toHaveBeenCalled();
    expect(checkoutRequiresDemoParticipant()).toBe(false);
  });
  it("in demo mode admits only an active participant read from the database", async () => {
    expect(checkoutRequiresDemoParticipant()).toBe(true);
    participants([{ userId: "user_demo" }]);
    await expect(checkoutAccessFor("user_demo")).resolves.toBe(true);
    participants([]);
    await expect(checkoutAccessFor("user_revoked")).resolves.toBe(false);
  });
  it("in demo mode is closed without a session, before any query", async () => {
    await expect(checkoutAccessFor(null)).resolves.toBe(false);
    expect(getDb).not.toHaveBeenCalled();
  });
});
