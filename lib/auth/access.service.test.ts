// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import {
  acceptInvitationAndLoadStaffRoles,
  loadSponsorId,
  loadStaffRoles,
} from "@/lib/auth/access.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement sent and answers without a network.
// Selects on profiles answer the blocked flag (null = no profiles row); every other select answers
// selectRows (default: one row per role).
function useFakeDb({
  roles = [] as string[],
  blocked = false as boolean | null,
  selectRows,
  failWith,
}: { roles?: string[]; blocked?: boolean | null; selectRows?: unknown[][]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    if (!text.trimStart().startsWith("select")) return { rows: [] };
    if (text.includes('from "profiles"')) return { rows: blocked === null ? [] : [[blocked]] };
    return { rows: selectRows ?? roles.map((role) => [role]) };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

beforeEach(() => vi.mocked(getDb).mockReset());

describe("acceptInvitationAndLoadStaffRoles", () => {
  it("sends a single batch of four statements and returns the active roles", async () => {
    const fake = useFakeDb({ roles: ["commercial"] });

    await expect(acceptInvitationAndLoadStaffRoles("user-1", "ana@example.com")).resolves.toEqual({
      staffRoles: ["commercial"],
      blocked: false,
    });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.transaction.mock.calls[0][0]).toHaveLength(4);
    expect(fake.queries).toHaveLength(4);
  });

  it("returns blocked = true (with the stored roles) for a disabled account", async () => {
    const fake = useFakeDb({ roles: ["commercial"], blocked: true });

    await expect(acceptInvitationAndLoadStaffRoles("user-1", "ana@example.com")).resolves.toEqual({
      staffRoles: ["commercial"],
      blocked: true,
    });
    expect(normalize(fake.queries[3].sql)).toBe(
      'select "disabled_at" IS NOT NULL from "profiles" where "profiles"."user_id" = $1',
    );
    expect(fake.queries[3].params).toEqual(["user-1"]);
  });

  it("first registers the account in profiles, refreshing only a changed email", async () => {
    const fake = useFakeDb();
    await acceptInvitationAndLoadStaffRoles("user-1", "ana@example.com");

    const register = normalize(fake.queries[0].sql);
    expect(register).toMatch(
      /^INSERT INTO profiles \(user_id, email\) VALUES \(\$1, \$2\) ON CONFLICT \(user_id\) DO UPDATE SET email = excluded\.email WHERE profiles\.email <> excluded\.email AND profiles\.deleted_at IS NULL$/,
    );
    // Never writes the disabled or deleted columns.
    expect(register).not.toMatch(/SET .*(disabled_|deleted_)\w* =/);
    expect(fake.queries[0].params).toEqual(["user-1", "ana@example.com"]);
    // The acceptance comes after the registration.
    expect(normalize(fake.queries[1].sql)).toMatch(/^WITH accepted AS/);
  });

  it("accepts the invitation in one CTE statement fed by the UPDATE … RETURNING", async () => {
    const fake = useFakeDb();
    await acceptInvitationAndLoadStaffRoles("user-1", "ana@example.com");

    const accept = normalize(fake.queries[1].sql);
    expect(accept).toMatch(/^WITH accepted AS \( UPDATE staff_invitations SET accepted_at = now\(\)/);
    expect(accept).toMatch(/WHERE email = \$\d+ AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now\(\)/);
    // A blocked account accepts nothing, so no assignment is inserted from the invitation.
    expect(accept).toMatch(
      /expires_at > now\(\) AND NOT EXISTS \( SELECT 1 FROM profiles WHERE user_id = \$\d+ AND disabled_at IS NOT NULL \) RETURNING/,
    );
    expect(accept).toContain("RETURNING id, email, role, invited_by, sponsor_id )");
    expect(accept).toMatch(
      /INSERT INTO profiles \(user_id, email\) SELECT \$\d+, accepted\.email FROM accepted ON CONFLICT \(user_id\) DO NOTHING/,
    );
    expect(accept).toMatch(
      /INSERT INTO staff_assignments \(user_id, role, reason, granted_by, sponsor_id\) SELECT \$\d+, accepted\.role, 'invitation:' \|\| accepted\.id::text, accepted\.invited_by, accepted\.sponsor_id FROM accepted ON CONFLICT DO NOTHING$/,
    );
    expect(accept.match(/;/g)).toBeNull();
    expect(fake.queries[1].params).toEqual(["user-1", "ana@example.com", "user-1", "user-1", "user-1"]);
  });

  it("loads roles filtered by user_id and revoked_at IS NULL, then the blocked flag", async () => {
    const fake = useFakeDb();
    await acceptInvitationAndLoadStaffRoles("user-1", "ana@example.com");

    const roles = normalize(fake.queries[2].sql);
    expect(roles).toBe(
      'select "role" from "staff_assignments" where ("staff_assignments"."user_id" = $1 and "staff_assignments"."revoked_at" is null)',
    );
    expect(fake.queries[2].params).toEqual(["user-1"]);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("relation does not exist");
    useFakeDb({ failWith: failure });
    await expect(acceptInvitationAndLoadStaffRoles("user-1", "ana@example.com")).rejects.toBe(failure);
  });
});

describe("loadStaffRoles", () => {
  it("only reads active roles and the blocked flag, in one batch, and never writes", async () => {
    const fake = useFakeDb({ roles: ["commercial", "admin"] });

    await expect(loadStaffRoles("user-1")).resolves.toEqual({
      staffRoles: ["commercial", "admin"],
      blocked: false,
    });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    // Unverified accounts are never registered: no profiles write, no invitation acceptance.
    for (const { sql } of fake.queries) {
      expect(sql).not.toMatch(/staff_invitations|insert|update/i);
    }
    expect(fake.queries[0].sql).toMatch(/"user_id" = \$1 and "staff_assignments"\."revoked_at" is null/);
    expect(fake.queries[0].params).toEqual(["user-1"]);
    expect(normalize(fake.queries[1].sql)).toBe(
      'select "disabled_at" IS NOT NULL from "profiles" where "profiles"."user_id" = $1',
    );
    expect(fake.queries[1].params).toEqual(["user-1"]);
  });

  it("returns no roles when nothing is active, and not blocked without a profiles row", async () => {
    useFakeDb({ blocked: null });
    await expect(loadStaffRoles("user-1")).resolves.toEqual({ staffRoles: [], blocked: false });
  });

  it("returns blocked = true for a disabled account", async () => {
    useFakeDb({ roles: ["admin"], blocked: true });
    await expect(loadStaffRoles("user-1")).resolves.toEqual({ staffRoles: ["admin"], blocked: true });
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(loadStaffRoles("user-1")).rejects.toBe(failure);
  });
});

describe("loadSponsorId", () => {
  const sponsorId = "6f1c2b9e-4a8d-4f3e-9b7a-2c5d8e1f0a3b";

  it("selects the active sponsor assignment of the user, at most one row", async () => {
    const fake = useFakeDb({ selectRows: [[sponsorId]] });

    await expect(loadSponsorId("user-1")).resolves.toBe(sponsorId);

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'select "sponsor_id" from "staff_assignments" where ("staff_assignments"."user_id" = $1 and "staff_assignments"."role" = $2 and "staff_assignments"."revoked_at" is null) limit $3',
    );
    expect(fake.queries[0].params).toEqual(["user-1", "sponsor", 1]);
    expect(fake.queries[0].sql).not.toMatch(/staff_invitations|insert|update/i);
  });

  it("returns null without an active sponsor assignment", async () => {
    useFakeDb({ selectRows: [] });
    await expect(loadSponsorId("user-1")).resolves.toBeNull();
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(loadSponsorId("user-1")).rejects.toMatchObject({ cause: failure });
  });
});
