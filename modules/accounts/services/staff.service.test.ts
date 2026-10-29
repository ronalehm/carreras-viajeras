// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import {
  createInvitation,
  grantStaffRole,
  listStaffOverview,
  revokeInvitation,
  revokeStaffRole,
} from "./staff.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const PENDING = '("staff_invitations"."accepted_at" is null and "staff_invitations"."revoked_at" is null)';

beforeEach(() => vi.mocked(getDb).mockReset());

describe("listStaffOverview", () => {
  it("reads active staff and pending invitations in one batch of two SELECTs", async () => {
    const fake = useFakeDb();
    await listStaffOverview();

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    const [staff, invitations] = fake.queries.map((query) => normalize(query.sql));
    expect(staff).toMatch(/^select .* from "staff_assignments" inner join "profiles" on "profiles"\."user_id" = "staff_assignments"\."user_id"/);
    expect(staff).toContain('where "staff_assignments"."revoked_at" is null');
    expect(invitations).toMatch(/^select .*"expires_at" <= now\(\) from "staff_invitations"/);
    expect(invitations).toContain(`where ${PENDING}`);
  });

  it("groups roles by user and keeps the database expiry flag", async () => {
    useFakeDb({
      responses: [
        [
          ["user-1", "ana@example.com", "admin", "2026-10-01 10:00:00+00"],
          ["user-1", "ana@example.com", "commercial", "2026-10-02 10:00:00+00"],
          ["user-2", "luis@example.com", "commercial", "2026-10-03 10:00:00+00"],
        ],
        [
          ["inv-1", "old@example.com", "commercial", "2026-10-10 10:00:00+00", true],
          ["inv-2", "new@example.com", "admin", "2026-10-25 10:00:00+00", false],
        ],
      ],
    });

    await expect(listStaffOverview()).resolves.toEqual({
      staff: [
        {
          userId: "user-1",
          email: "ana@example.com",
          roles: [
            { role: "admin", grantedAt: new Date("2026-10-01T10:00:00Z") },
            { role: "commercial", grantedAt: new Date("2026-10-02T10:00:00Z") },
          ],
        },
        {
          userId: "user-2",
          email: "luis@example.com",
          roles: [{ role: "commercial", grantedAt: new Date("2026-10-03T10:00:00Z") }],
        },
      ],
      invitations: [
        { id: "inv-1", email: "old@example.com", role: "commercial", expiresAt: new Date("2026-10-10T10:00:00Z"), expired: true },
        { id: "inv-2", email: "new@example.com", role: "admin", expiresAt: new Date("2026-10-25T10:00:00Z"), expired: false },
      ],
    });
  });

  it("returns empty lists when there is nothing", async () => {
    useFakeDb();
    await expect(listStaffOverview()).resolves.toEqual({ staff: [], invitations: [] });
  });
});

describe("createInvitation", () => {
  const input = { email: "luis@example.com", role: "commercial" } as const;

  it("revokes this email's expired pending invitations and inserts in one batch", async () => {
    const fake = useFakeDb({ responses: [[], [["inv-1", "2026-10-25 12:00:00+00"]]] });

    await expect(createInvitation(input, "admin-1")).resolves.toEqual({
      id: "inv-1",
      expiresAt: new Date("2026-10-25T12:00:00Z"),
    });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    const [revoke, insert] = fake.queries;
    expect(normalize(revoke.sql)).toBe(
      `update "staff_invitations" set "revoked_at" = now(), "revoked_by" = $1 where ("staff_invitations"."email" = $2 and ${PENDING} and "staff_invitations"."expires_at" <= now())`,
    );
    expect(revoke.params).toEqual(["admin-1", "luis@example.com"]);
    expect(normalize(insert.sql)).toMatch(/^insert into "staff_invitations" /);
    expect(normalize(insert.sql)).toContain(`on conflict ("email") where ${PENDING} do nothing returning "id", "expires_at"`);
    expect(insert.params).toEqual(["luis@example.com", "commercial", "admin-1"]);
  });

  it("leaves expires_at to the database default (7 days)", async () => {
    const fake = useFakeDb({ responses: [[], [["inv-1", "2026-10-25 12:00:00+00"]]] });
    await createInvitation(input, "admin-1");

    expect(normalize(fake.queries[1].sql)).toMatch(/values \(default, \$1, \$2, \$3, default, default, /);
  });

  it("returns pending_invitation_exists when the insert hits a valid pending invitation", async () => {
    useFakeDb({ responses: [[], []] });
    await expect(createInvitation(input, "admin-1")).resolves.toBe("pending_invitation_exists");
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(createInvitation(input, "admin-1")).rejects.toBe(failure);
  });
});

describe("revokeInvitation", () => {
  it("only revokes a pending invitation whose role is manageable and records who revoked it", async () => {
    const fake = useFakeDb({ responses: [[["inv-1"]]] });

    await expect(revokeInvitation("inv-1", "admin-1", ["commercial", "organizer", "admin"])).resolves.toBe(true);

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `update "staff_invitations" set "revoked_at" = now(), "revoked_by" = $1 where ("staff_invitations"."id" = $2 and ${PENDING} and "staff_invitations"."role" in ($3, $4, $5)) returning "id"`,
    );
    expect(fake.queries[0].params).toEqual(["admin-1", "inv-1", "commercial", "organizer", "admin"]);
  });

  it("filters by the given roles only", async () => {
    const fake = useFakeDb();

    await expect(revokeInvitation("inv-1", "admin-1", ["commercial"])).resolves.toBe(false);

    expect(normalize(fake.queries[0].sql)).toContain(`and "staff_invitations"."role" in ($3))`);
    expect(fake.queries[0].params).toEqual(["admin-1", "inv-1", "commercial"]);
  });

  it("returns false without querying when the actor manages no roles", async () => {
    const fake = useFakeDb();

    await expect(revokeInvitation("inv-1", "admin-1", [])).resolves.toBe(false);

    expect(getDb).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(0);
  });

  it("returns false when nothing pending matches", async () => {
    useFakeDb();
    await expect(revokeInvitation("inv-1", "admin-1", ["commercial"])).resolves.toBe(false);
  });
});

describe("grantStaffRole", () => {
  it("inserts from an existing profile, ignoring an already active role", async () => {
    const fake = useFakeDb({ responses: [[{ id: "assignment-1" }]] });

    await expect(grantStaffRole({ userId: "user-2", role: "admin" }, "admin-1")).resolves.toBe(true);

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      "INSERT INTO staff_assignments (user_id, role, reason, granted_by) " +
        "SELECT profiles.user_id, $1::staff_role, 'crm-admin', $2 FROM profiles WHERE profiles.user_id = $3 " +
        "ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING RETURNING id",
    );
    expect(fake.queries[0].params).toEqual(["admin", "admin-1", "user-2"]);
  });

  it("returns false (no_change) when no row is inserted", async () => {
    useFakeDb();
    await expect(grantStaffRole({ userId: "user-2", role: "admin" }, "admin-1")).resolves.toBe(false);
  });
});

describe("revokeStaffRole", () => {
  it("runs a single statement that locks the active admins before revoking", async () => {
    const fake = useFakeDb({ responses: [[{ revoked: true, target_is_active_admin: true }]] });

    await revokeStaffRole({ userId: "user-2", role: "admin" }, "admin-1");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toMatch(
      /^WITH admins AS MATERIALIZED \( SELECT id, user_id FROM staff_assignments WHERE role = 'admin' AND revoked_at IS NULL ORDER BY id FOR UPDATE \)/,
    );
    expect(statement).toMatch(
      /revoked AS \( UPDATE staff_assignments SET revoked_at = now\(\), revoked_by = \$1 WHERE user_id = \$2 AND role = \$3::staff_role AND revoked_at IS NULL AND \(\$4::staff_role <> 'admin' OR \(SELECT count\(\*\) FROM admins\) > 1\) RETURNING id \)/,
    );
    expect(statement.match(/;/g)).toBeNull();
    expect(fake.queries[0].params).toEqual(["admin-1", "user-2", "admin", "admin", "admin", "user-2"]);
  });

  it.each([
    [{ revoked: true, target_is_active_admin: true }, "revoked"],
    [{ revoked: true, target_is_active_admin: false }, "revoked"],
    [{ revoked: false, target_is_active_admin: true }, "last_admin"],
    [{ revoked: false, target_is_active_admin: false }, "not_found"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(revokeStaffRole({ userId: "user-2", role: "admin" }, "admin-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("deadlock detected");
    useFakeDb({ failWith: failure });
    await expect(revokeStaffRole({ userId: "user-2", role: "commercial" }, "admin-1")).rejects.toMatchObject({
      cause: failure,
    });
  });
});
