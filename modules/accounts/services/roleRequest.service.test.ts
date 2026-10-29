// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import {
  approveRoleRequest,
  createAdminRoleRequest,
  getPendingRoleRequest,
  listPendingRoleRequests,
  rejectRoleRequest,
} from "./roleRequest.service";

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

// Same shape for raw sql`` statements (db.execute reads rows as objects).
function useFakeExecute({ rows = [] as Record<string, unknown>[], failWith }: { rows?: Record<string, unknown>[]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows, fields: [] };
  });
  const client = Object.assign(query, { transaction: vi.fn() });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
// Columns that must never be read by these statements (Requirement 23).
const SENSITIVE = /phone|document|birth|medical|notes|amount|usd/i;
const REQUEST_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getPendingRoleRequest", () => {
  it("reads only the date of the account's pending request in one SELECT", async () => {
    const fake = useFakeDb({ responses: [[["2026-10-29 15:00:00+00"]]] });

    await expect(getPendingRoleRequest("user-1")).resolves.toEqual({
      createdAt: new Date("2026-10-29T15:00:00Z"),
    });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'select "created_at" from "role_requests" ' +
        'where ("role_requests"."user_id" = $1 and "role_requests"."status" = $2) limit $3',
    );
    expect(fake.queries[0].params).toEqual(["user-1", "pending", 1]);
  });

  it("returns null without a pending request", async () => {
    useFakeDb();
    await expect(getPendingRoleRequest("user-1")).resolves.toBeNull();
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(getPendingRoleRequest("user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("createAdminRoleRequest", () => {
  it("inserts a pending admin request for the given account and ignores conflicts", async () => {
    const fake = useFakeDb();

    await expect(createAdminRoleRequest("user-1")).resolves.toBeUndefined();

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(
      'insert into "role_requests" ("id", "user_id", "role", "status", "created_at", "decided_at", "decided_by") ' +
        "values (default, $1, $2, default, default, default, default) on conflict do nothing",
    );
    expect(fake.queries[0].params).toEqual(["user-1", "admin"]);
  });

  it("is the same success when a pending request already exists", async () => {
    useFakeDb({ responses: [[]] });
    await expect(createAdminRoleRequest("user-1")).resolves.toBeUndefined();
    await expect(createAdminRoleRequest("user-1")).resolves.toBeUndefined();
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(createAdminRoleRequest("user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("listPendingRoleRequests", () => {
  it("reads id, email and date of pending requests in one SELECT, oldest first", async () => {
    const fake = useFakeDb({
      responses: [
        [
          ["req-1", "ana@example.com", "2026-10-28 10:00:00+00"],
          ["req-2", "luis@example.com", "2026-10-29 09:30:00+00"],
        ],
      ],
    });

    await expect(listPendingRoleRequests()).resolves.toEqual([
      { id: "req-1", email: "ana@example.com", createdAt: new Date("2026-10-28T10:00:00Z") },
      { id: "req-2", email: "luis@example.com", createdAt: new Date("2026-10-29T09:30:00Z") },
    ]);

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(
      'select "role_requests"."id", "profiles"."email", "role_requests"."created_at" from "role_requests" ' +
        'inner join "profiles" on "profiles"."user_id" = "role_requests"."user_id" ' +
        'where "role_requests"."status" = $1 order by "role_requests"."created_at" asc',
    );
    expect(statement).not.toMatch(SENSITIVE);
    expect(fake.queries[0].params).toEqual(["pending"]);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(listPendingRoleRequests()).rejects.toMatchObject({ cause: failure });
  });
});

describe("approveRoleRequest", () => {
  it("approves only a pending request and grants admin in one statement", async () => {
    const fake = useFakeExecute({ rows: [{ id: REQUEST_ID }] });

    await expect(approveRoleRequest(REQUEST_ID, "super-1")).resolves.toBe(true);

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(
      "WITH approved AS ( UPDATE role_requests " +
        "SET status = 'approved', decided_at = now(), decided_by = $1 " +
        "WHERE id = $2 AND status = 'pending' " +
        "AND NOT EXISTS ( SELECT 1 FROM profiles p WHERE p.user_id = role_requests.user_id AND p.disabled_at IS NOT NULL ) " +
        "RETURNING id, user_id, role ), " +
        "granted AS ( INSERT INTO staff_assignments (user_id, role, reason, granted_by) " +
        "SELECT user_id, role, 'role_request:' || id::text, $3 FROM approved " +
        "ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING RETURNING id ) " +
        "SELECT id FROM approved",
    );
    expect(statement).not.toMatch(SENSITIVE);
    expect(fake.queries[0].params).toEqual(["super-1", REQUEST_ID, "super-1"]);
  });

  it("returns false (not_found) when the request is no longer pending", async () => {
    useFakeExecute({ rows: [] });
    await expect(approveRoleRequest(REQUEST_ID, "super-1")).resolves.toBe(false);
  });

  it("never approves the request of a disabled or deleted account (the UPDATE itself excludes it)", async () => {
    const fake = useFakeExecute({ rows: [] });

    await expect(approveRoleRequest(REQUEST_ID, "super-1")).resolves.toBe(false);
    const statement = normalize(fake.queries[0].sql);
    // The condition sits inside the UPDATE, so the request stays pending and the INSERT gets nothing.
    const update = statement.slice(statement.indexOf("UPDATE role_requests"), statement.indexOf("RETURNING id, user_id, role"));
    expect(update).toContain(
      "AND NOT EXISTS ( SELECT 1 FROM profiles p WHERE p.user_id = role_requests.user_id AND p.disabled_at IS NOT NULL )",
    );
    expect(statement).toMatch(/SELECT user_id, role, 'role_request:' \|\| id::text, \$3 FROM approved/);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeExecute({ failWith: failure });
    await expect(approveRoleRequest(REQUEST_ID, "super-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("rejectRoleRequest", () => {
  it("rejects only a pending request, records the actor and grants nothing", async () => {
    const fake = useFakeDb({ responses: [[[REQUEST_ID]]] });

    await expect(rejectRoleRequest(REQUEST_ID, "super-1")).resolves.toBe(true);

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(
      'update "role_requests" set "status" = $1, "decided_at" = now(), "decided_by" = $2 ' +
        'where ("role_requests"."id" = $3 and "role_requests"."status" = $4) returning "id"',
    );
    expect(statement).not.toMatch(/staff_assignments/);
    expect(fake.queries[0].params).toEqual(["rejected", "super-1", REQUEST_ID, "pending"]);
  });

  it("returns false (not_found) when the request is no longer pending", async () => {
    useFakeDb();
    await expect(rejectRoleRequest(REQUEST_ID, "super-1")).resolves.toBe(false);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(rejectRoleRequest(REQUEST_ID, "super-1")).rejects.toMatchObject({ cause: failure });
  });
});
