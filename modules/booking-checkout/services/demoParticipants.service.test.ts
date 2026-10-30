// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/env")>(), getStripeCheckoutConfig: vi.fn(),
}));
import { getDb } from "@/lib/db";
import { getStripeCheckoutConfig, type StripeCheckoutConfig } from "@/lib/env";
import { getCheckoutStatus, grantDemoParticipant, listDemoParticipants, revokeDemoParticipant } from "./demoParticipants.service";

function fake(responses: unknown[][] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    queries.push({ sql, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction: vi.fn() }) as never) as ReturnType<typeof getDb>);
  return queries;
}
const config = (overrides: Partial<StripeCheckoutConfig>): StripeCheckoutConfig => ({
  enabled: true, mode: "demo", secretKey: "sk_test_unit_only", webhookSecret: "whsec_unit_only",
  allowDraftContracts: false, disabledReason: null, ...overrides,
});
beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(getStripeCheckoutConfig).mockReset().mockReturnValue(config({}));
});

describe("getCheckoutStatus", () => {
  it.each(["test", "demo", "live"] as const)("reports the %s mode while Checkout is on", (mode) => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config({ mode }));
    expect(getCheckoutStatus()).toBe(mode);
  });
  it("reports off without the internal reason or any secret", () => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config({ enabled: false, disabledReason: "demo_requires_test_key" }));
    expect(getCheckoutStatus()).toBe("off");
  });
});

describe("grantDemoParticipant", () => {
  const grant = (rows: unknown[]) => {
    const queries = fake([rows]);
    return { queries, run: () => grantDemoParticipant({ email: " Demo@Example.TEST ", note: "Jurado" }, "trusted-admin") };
  };
  it("grants the single enabled account with that verified email, as the session actor", async () => {
    const { queries, run } = grant([{ matches: 1, changed: 1, inserted: true }]);
    await expect(run()).resolves.toBe("granted");
    expect(queries).toHaveLength(1);
    const [{ sql, params }] = queries;
    expect(params).toEqual(["demo@example.test", "Jurado", "trusted-admin"]);
    expect(sql).toContain('"profiles"."email" = $1');
    expect(sql).toContain('"profiles"."disabled_at" IS NULL');
    expect(sql).toContain('"profiles"."deleted_at" IS NULL');
    expect(sql).toContain('INSERT INTO "checkout_demo_participants"');
    expect(sql).toContain("WHERE (SELECT count(*) FROM candidates) = 1");
  });
  it("tells the admin the person must sign in first when no account has the email", async () => {
    const { run } = grant([{ matches: 0, changed: 0, inserted: false }]);
    await expect(run()).resolves.toBe("account_not_found");
  });
  it("grants nothing when several accounts share the email", async () => {
    const { run } = grant([{ matches: 2, changed: 0, inserted: false }]);
    await expect(run()).resolves.toBe("ambiguous_account");
  });
  it("re-grants a revoked participant by clearing revoked_at and recording the new grant", async () => {
    const { queries, run } = grant([{ matches: 1, changed: 1, inserted: false }]);
    await expect(run()).resolves.toBe("restored");
    expect(queries[0].sql).toMatch(/ON CONFLICT \("user_id"\) DO UPDATE\s+SET "note" = excluded."note", "granted_by" = excluded."granted_by", "granted_at" = now\(\), "revoked_at" = NULL\s+WHERE "checkout_demo_participants"."revoked_at" IS NOT NULL/);
  });
  it("leaves an active participant and its original audit fields untouched", async () => {
    const { run } = grant([{ matches: 1, changed: 0, inserted: false }]);
    await expect(run()).resolves.toBe("already_active");
  });
  it("stores an empty note as NULL", async () => {
    const queries = fake([[{ matches: 1, changed: 1, inserted: true }]]);
    await grantDemoParticipant({ email: "demo@example.test", note: "  " }, "trusted-admin");
    expect(queries[0].params).toEqual(["demo@example.test", null, "trusted-admin"]);
  });
  it("rejects an invalid email before any query", async () => {
    const queries = fake();
    await expect(grantDemoParticipant({ email: "no-es-correo", note: null }, "trusted-admin")).rejects.toThrow();
    expect(queries).toHaveLength(0);
  });
});

describe("revokeDemoParticipant", () => {
  it("sets revoked_at only on an active participant", async () => {
    const queries = fake([[["user_demo"]]]);
    await expect(revokeDemoParticipant({ userId: "user_demo" })).resolves.toBe("revoked");
    expect(queries[0].sql).toMatch(/^update "checkout_demo_participants" set "revoked_at" = now\(\)/);
    expect(queries[0].sql).toContain('"checkout_demo_participants"."revoked_at" is null');
    expect(queries[0].params).toEqual(["user_demo"]);
  });
  it("reports an unknown or already revoked participant", async () => {
    fake([[]]);
    await expect(revokeDemoParticipant({ userId: "user_revoked" })).resolves.toBe("not_active");
  });
});

describe("listDemoParticipants", () => {
  it("lists active and revoked participants with the email of who granted them, active first", async () => {
    const grantedAt = new Date("2026-10-30T10:00:00Z").toISOString();
    const queries = fake([[["user_demo", "demo@example.test", null, "admin@example.test", grantedAt, null]]]);
    await expect(listDemoParticipants()).resolves.toEqual([{
      userId: "user_demo", email: "demo@example.test", note: null, grantedByEmail: "admin@example.test",
      grantedAt: new Date(grantedAt), revokedAt: null,
    }]);
    expect(queries[0].sql).toContain('inner join "profiles" "granted_by_profile"');
    expect(queries[0].sql).toMatch(/order by "checkout_demo_participants"."revoked_at" IS NOT NULL, "checkout_demo_participants"."granted_at" desc/);
  });
});
