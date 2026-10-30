// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import {
  deleteAccount,
  disableAccount,
  getAccountState,
  reactivateAccount,
} from "./accountStatus.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers the first one with `rows`
// (db.execute reads rows as objects); later statements of a batch answer no rows.
function useFakeDb({ rows = [] as Record<string, unknown>[], failWith }: { rows?: Record<string, unknown>[]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: queries.length === 1 ? rows : [], fields: [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
// Columns that must never be read by these statements (Requirement 23).
const SENSITIVE = /phone|document|birth|medical|notes|amount|usd|full_name|participant/i;
const TARGET = "user_target";
const ACTOR = "user_super";

const flags = (overrides: Record<string, boolean> = {}) => ({
  done: false,
  found: true,
  is_protected: false,
  is_last_admin: false,
  email_matches: true,
  ...overrides,
});

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getAccountState", () => {
  it("reads the status and the protected flag of one profile", async () => {
    const fake = useFakeDb({ rows: [{ status: "disabled", is_protected: false }] });

    await expect(getAccountState(TARGET)).resolves.toEqual({ status: "disabled", protected: false });

    expect(fake.queries).toHaveLength(1);
    const text = normalize(fake.queries[0].sql);
    expect(text).toContain("WHEN p.deleted_at IS NOT NULL THEN 'deleted' WHEN p.disabled_at IS NOT NULL THEN 'disabled' ELSE 'active'");
    expect(text).toMatch(/sa\.role = 'super_admin' AND sa\.revoked_at IS NULL/);
    expect(text).toMatch(/FROM profiles p WHERE p\.user_id = \$1$/);
    expect(text).not.toMatch(SENSITIVE);
    expect(text).not.toMatch(/email/);
    expect(fake.queries[0].params).toEqual([TARGET]);
  });

  it("returns null without a profiles row", async () => {
    useFakeDb({ rows: [] });
    await expect(getAccountState(TARGET)).resolves.toBeNull();
  });
});

describe("disableAccount", () => {
  it("is one statement that locks the admins, fixes disabled_*, revokes every assignment and rejects pending requests", async () => {
    const fake = useFakeDb({ rows: [flags({ done: true })] });

    await expect(disableAccount(TARGET, ACTOR)).resolves.toBe("disabled");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const text = normalize(fake.queries[0].sql);
    expect(text.match(/;/g)).toBeNull();
    // Same lock pattern as revokeStaffRole.
    expect(text).toMatch(
      /^WITH admins AS MATERIALIZED \( SELECT id, user_id FROM staff_assignments WHERE role = 'admin' AND revoked_at IS NULL ORDER BY id FOR UPDATE \)/,
    );
    // super_admin and the last admin are checked in the same statement.
    expect(text).toMatch(/sa\.role = 'super_admin' AND sa\.revoked_at IS NULL/);
    expect(text).toMatch(/NOT EXISTS \(SELECT 1 FROM admins WHERE admins\.user_id <> p\.user_id\)/);
    expect(text).toMatch(/WHERE p\.user_id = \$1 AND p\.disabled_at IS NULL AND p\.deleted_at IS NULL/);
    expect(text).toMatch(
      /UPDATE profiles SET disabled_at = now\(\), disabled_by = \$2 FROM target WHERE profiles\.user_id = target\.user_id AND profiles\.disabled_at IS NULL AND profiles\.deleted_at IS NULL AND NOT target\.is_protected AND NOT target\.is_last_admin/,
    );
    expect(text).toMatch(
      /UPDATE staff_assignments SET revoked_at = now\(\), revoked_by = \$3 WHERE user_id IN \(SELECT user_id FROM disabled\) AND revoked_at IS NULL/,
    );
    // Pending role requests are rejected in the same statement, only for the disabled account.
    expect(text).toMatch(
      /rejected AS \( UPDATE role_requests SET status = 'rejected', decided_at = now\(\), decided_by = \$4 WHERE user_id IN \(SELECT user_id FROM disabled\) AND status = 'pending' RETURNING id \)/,
    );
    expect(text).not.toMatch(SENSITIVE);
    expect(fake.queries[0].params).toEqual([TARGET, ACTOR, ACTOR, ACTOR]);
  });

  it.each([
    ["protected", flags({ is_protected: true })],
    ["last_admin", flags({ is_last_admin: true })],
    ["not_found", flags({ found: false })],
    ["not_found", flags()],
  ])("returns %s from the statement flags", async (expected, row) => {
    useFakeDb({ rows: [row] });
    await expect(disableAccount(TARGET, ACTOR)).resolves.toBe(expected);
  });

  it("propagates database errors", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(disableAccount(TARGET, ACTOR)).rejects.toMatchObject({ cause: failure });
  });
});

describe("reactivateAccount", () => {
  it("clears disabled_* in one statement, only while the account is not deleted", async () => {
    const fake = useFakeDb({ rows: [flags({ done: true })] });

    await expect(reactivateAccount(TARGET)).resolves.toBe("reactivated");

    expect(fake.queries).toHaveLength(1);
    const text = normalize(fake.queries[0].sql);
    expect(text).toMatch(/WHERE p\.user_id = \$1 AND p\.disabled_at IS NOT NULL AND p\.deleted_at IS NULL/);
    expect(text).toMatch(
      /UPDATE profiles SET disabled_at = NULL, disabled_by = NULL FROM target WHERE profiles\.user_id = target\.user_id AND profiles\.disabled_at IS NOT NULL AND profiles\.deleted_at IS NULL AND NOT target\.is_protected/,
    );
    // Roles are not restored.
    expect(text).not.toMatch(/staff_assignments SET|INSERT/);
    expect(fake.queries[0].params).toEqual([TARGET]);
  });

  it.each([
    ["protected", flags({ is_protected: true })],
    ["not_found", flags({ found: false })],
  ])("returns %s", async (expected, row) => {
    useFakeDb({ rows: [row] });
    await expect(reactivateAccount(TARGET)).resolves.toBe(expected);
  });
});

describe("deleteAccount", () => {
  const input = { userId: TARGET, confirmEmail: "ana@correo.com" };

  it("sends one batch (one transaction) with the gate first and every deletion step", async () => {
    const fake = useFakeDb({ rows: [flags({ done: true })] });

    await expect(deleteAccount(input, ACTOR)).resolves.toBe("deleted");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.transaction.mock.calls[0][0]).toHaveLength(7);
    const texts = fake.queries.map(({ sql }) => normalize(sql));

    // Gate: email, super_admin and last admin checked; anonymizes and fixes disabled_*/deleted_*.
    const [gate] = texts;
    expect(gate).toMatch(/^WITH admins AS MATERIALIZED \(.* FOR UPDATE \)/);
    expect(gate).toMatch(/p\.email = \$1 AS email_matches/);
    expect(gate).toMatch(/WHERE p\.user_id = \$2 AND p\.deleted_at IS NULL/);
    expect(gate).toContain("SET email = 'deleted-' || md5(profiles.user_id) || '@invalid'");
    expect(gate).toContain("disabled_at = coalesce(profiles.disabled_at, now())");
    expect(gate).toMatch(/disabled_by = CASE WHEN profiles\.disabled_at IS NULL THEN \$3 ELSE profiles\.disabled_by END/);
    expect(gate).toMatch(/deleted_at = now\(\), deleted_by = \$4/);
    expect(gate).toMatch(
      /AND target\.email_matches AND NOT target\.is_protected AND NOT target\.is_last_admin/,
    );
    expect(fake.queries[0].params).toEqual(["ana@correo.com", TARGET, ACTOR, ACTOR]);

    // Every later step only acts if this transaction deleted the profile.
    const deletedHere = /EXISTS \( SELECT 1 FROM profiles WHERE user_id = \$\d+ AND deleted_by = \$\d+ AND deleted_at = now\(\) \)/;
    for (const text of texts.slice(1)) expect(text).toMatch(deletedHere);

    expect(texts[1]).toMatch(
      /^UPDATE staff_assignments SET revoked_at = now\(\), revoked_by = \$1 WHERE user_id = \$2 AND revoked_at IS NULL/,
    );
    expect(texts[2]).toMatch(
      /^UPDATE role_requests SET status = 'rejected', decided_at = now\(\), decided_by = \$1 WHERE user_id = \$2 AND status = 'pending'/,
    );
    expect(texts[3]).toMatch(/^DELETE FROM runner_profiles WHERE user_id = \$1/);
    expect(texts[4]).toMatch(
      /^DELETE FROM referral_codes WHERE user_id = \$1 AND NOT EXISTS \(SELECT 1 FROM runner_referrals WHERE referrer_user_id = \$2\)/,
    );
    expect(texts[5]).toMatch(/^UPDATE referral_codes SET active = false WHERE user_id = \$1 AND active/);
    expect(texts[6]).toMatch(
      /^UPDATE bookings SET runner_user_id = NULL, updated_at = now\(\) WHERE runner_user_id = \$1/,
    );
    expect(fake.queries[1].params).toEqual([ACTOR, TARGET, TARGET, ACTOR]);
    expect(fake.queries[6].params).toEqual([TARGET, TARGET, ACTOR]);

    // reward_* tables and the other authorship rows are kept; no sensitive column is read.
    for (const text of texts) {
      expect(text).not.toMatch(/reward_|DELETE FROM profiles|DELETE FROM bookings/);
      expect(text).not.toMatch(SENSITIVE);
    }
  });

  it.each([
    ["not_found", flags({ found: false, email_matches: false })],
    ["protected", flags({ is_protected: true })],
    ["email_mismatch", flags({ email_matches: false })],
    ["last_admin", flags({ is_last_admin: true })],
    ["protected", flags({ is_protected: true, email_matches: false })],
  ])("returns %s from the gate flags", async (expected, row) => {
    useFakeDb({ rows: [row] });
    await expect(deleteAccount(input, ACTOR)).resolves.toBe(expected);
  });

  it("propagates database errors", async () => {
    const failure = new Error("deadlock detected");
    useFakeDb({ failWith: failure });
    await expect(deleteAccount(input, ACTOR)).rejects.toBe(failure);
  });
});
