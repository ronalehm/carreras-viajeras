// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { getUserDetail, listUsers, USER_LIST_LIMIT } from "./userDirectory.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (pattern of staff.service.test.ts): records every statement and answers
// each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction }) as never) as ReturnType<typeof getDb>);
  return { queries, query, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

// Raw execute() rows come as objects; count(*) is bigint, so text on the wire.
function listRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-a",
    name: null,
    email: "a@example.com",
    roles: [],
    sponsor_name: null,
    is_runner: false,
    active_bookings: "0",
    ...overrides,
  };
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("listUsers", () => {
  it("reads the three sources in a single statement", async () => {
    const fake = useFakeDb();
    await listUsers({});

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(
      "WITH ids AS ( SELECT user_id FROM profiles UNION SELECT user_id FROM runner_profiles " +
        "UNION SELECT runner_user_id FROM bookings WHERE runner_user_id IS NOT NULL )",
    );
    expect(statement).toContain("LEFT JOIN profiles p ON p.user_id = ids.user_id");
    expect(statement).toContain("LEFT JOIN runner_profiles rp ON rp.user_id = ids.user_id");
    // Active assignments only, roles in enum order as a text[] (a JS array), brand of the sponsor one.
    expect(statement).toContain(
      "SELECT array_agg(sa.role::text ORDER BY sa.role) AS roles, max(s.name) AS sponsor_name " +
        "FROM staff_assignments sa LEFT JOIN sponsors s ON s.id = sa.sponsor_id " +
        "WHERE sa.user_id = ids.user_id AND sa.revoked_at IS NULL",
    );
    // Linked bookings: the not cancelled count and the latest one for the identity.
    expect(statement).toContain("count(*) FILTER (WHERE b.status <> 'cancelled') AS active");
    expect(statement).toContain("WHERE b.runner_user_id = ids.user_id ORDER BY b.created_at DESC, b.id LIMIT 1");
    // Identity (requirement 5) and derived runner.
    expect(statement).toContain("coalesce(rp.full_name, lb.participant_name) AS name");
    expect(statement).toContain("coalesce(p.email, rp.email, lb.participant_email) AS email");
    expect(statement).toContain("(rp.user_id IS NOT NULL OR lb.participant_email IS NOT NULL) AS is_runner");
  });

  it("orders by name (or email) then id and asks for one row past the limit, without filters", async () => {
    const fake = useFakeDb();
    await listUsers({});

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toMatch(
      /FROM directory ORDER BY lower\(coalesce\(name, email\)\), user_id LIMIT \$1$/,
    );
    expect(fake.queries[0].params).toEqual([USER_LIST_LIMIT + 1]);
    expect(USER_LIST_LIMIT + 1).toBe(201);
  });

  it("never selects sensitive columns", async () => {
    const fake = useFakeDb();
    await listUsers({ q: "ana", role: "runner" });

    const statement = normalize(fake.queries[0].sql).toLowerCase();
    for (const column of [
      "phone",
      "birth_date",
      "document_",
      "emergency_contact_",
      "medical_notes",
      "internal_note",
      "total_usd",
    ]) {
      expect(statement).not.toContain(column);
    }
  });

  it("searches name and email by literal, case-insensitive substring", async () => {
    const fake = useFakeDb();
    await listUsers({ q: "ANA@" });

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(
      "FROM directory WHERE (strpos(lower(coalesce(name, '')), lower($1)) > 0 OR strpos(lower(email), lower($2)) > 0) ORDER BY",
    );
    expect(statement).not.toMatch(/\blike\b|\bilike\b/i);
    expect(fake.queries[0].params).toEqual(["ANA@", "ANA@", 201]);
  });

  it.each(["%", "_"])("sends %s as a plain parameter, never as a pattern", async (q) => {
    const fake = useFakeDb();
    await listUsers({ q });

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("strpos(lower(email), lower($2)) > 0");
    expect(statement).not.toMatch(/\b(i?like|similar to|escape)\b/i);
    expect(fake.queries[0].params).toEqual([q, q, 201]);
  });

  it.each(["commercial", "admin", "super_admin", "organizer", "sponsor"] as const)("filters %s by the active roles array", async (role) => {
    const fake = useFakeDb();
    await listUsers({ role });

    expect(normalize(fake.queries[0].sql)).toContain("FROM directory WHERE $1::text = ANY (roles) ORDER BY");
    expect(fake.queries[0].params).toEqual([role, 201]);
  });

  it("filters runner by the derived flag, without a parameter", async () => {
    const fake = useFakeDb();
    await listUsers({ role: "runner" });

    expect(normalize(fake.queries[0].sql)).toContain("FROM directory WHERE is_runner ORDER BY");
    expect(fake.queries[0].params).toEqual([201]);
  });

  it("combines search and role with AND", async () => {
    const fake = useFakeDb();
    await listUsers({ q: "ana", role: "runner" });

    expect(normalize(fake.queries[0].sql)).toContain(
      "WHERE (strpos(lower(coalesce(name, '')), lower($1)) > 0 OR strpos(lower(email), lower($2)) > 0) AND is_runner ORDER BY",
    );
    expect(fake.queries[0].params).toEqual(["ana", "ana", 201]);
  });

  it("maps rows to JS types", async () => {
    useFakeDb({
      responses: [
        [
          listRow({ user_id: "user-c2", email: "c2@example.com", roles: ["commercial"], is_runner: true, active_bookings: "2" }),
          listRow({ user_id: "user-r", name: "Ana Pérez", email: "ana@example.com", is_runner: true, active_bookings: "1" }),
          listRow({ user_id: "user-s", email: "lucia@marca.com", roles: ["sponsor"], sponsor_name: "Marca Norte" }),
          listRow({ user_id: "user-e", email: "e@example.com" }),
        ],
      ],
    });

    await expect(listUsers({})).resolves.toEqual({
      users: [
        { userId: "user-c2", name: null, email: "c2@example.com", roles: ["commercial"], sponsorName: null, isRunner: true, activeBookings: 2 },
        { userId: "user-r", name: "Ana Pérez", email: "ana@example.com", roles: [], sponsorName: null, isRunner: true, activeBookings: 1 },
        { userId: "user-s", name: null, email: "lucia@marca.com", roles: ["sponsor"], sponsorName: "Marca Norte", isRunner: false, activeBookings: 0 },
        { userId: "user-e", name: null, email: "e@example.com", roles: [], sponsorName: null, isRunner: false, activeBookings: 0 },
      ],
      truncated: false,
    });
  });

  it("returns the limit and truncated when the database returns 201 rows", async () => {
    const rows = Array.from({ length: USER_LIST_LIMIT + 1 }, (_, index) =>
      listRow({ user_id: `user-${index}`, email: `u${index}@example.com` }),
    );
    useFakeDb({ responses: [rows] });

    const { users, truncated } = await listUsers({});
    expect(truncated).toBe(true);
    expect(users).toHaveLength(USER_LIST_LIMIT);
    expect(users.at(-1)?.userId).toBe(`user-${USER_LIST_LIMIT - 1}`);
  });

  it("is not truncated with exactly the limit", async () => {
    const rows = Array.from({ length: USER_LIST_LIMIT }, (_, index) => listRow({ user_id: `user-${index}` }));
    useFakeDb({ responses: [rows] });

    const { users, truncated } = await listUsers({});
    expect(truncated).toBe(false);
    expect(users).toHaveLength(USER_LIST_LIMIT);
  });

  it("returns an empty list when nobody matches", async () => {
    useFakeDb();
    await expect(listUsers({ q: "nadie" })).resolves.toEqual({ users: [], truncated: false });
  });

  it("sanitizes database errors before Next can log search parameters or their cause", async () => {
    const failure = new Error("connection refused: ana@example.com private connection details");
    useFakeDb({ failWith: failure });
    const error = await listUsers({ q: "ana@example.com" }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("user-directory: load failed");
    expect(error).not.toHaveProperty("cause");
    expect(error).not.toHaveProperty("params");
  });
});

describe("getUserDetail", () => {
  const USER = "user-c";
  const GRANTED = "2026-10-20 10:00:00+00";
  const SPONSOR_ID = "6f1c2b4e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

  // Batch responses, in order: profiles, active assignments, runner profile, latest linked booking.
  function detailResponses({
    profile = [] as unknown[][],
    assignments = [] as unknown[][],
    runner = [] as unknown[][],
    booking = [] as unknown[][],
  } = {}) {
    return [profile, assignments, runner, booking];
  }

  it.each([
    ["empty", ""],
    ["longer than 255 characters", "x".repeat(256)],
  ])("returns null without querying for an id %s", async (_, id) => {
    const fake = useFakeDb();
    await expect(getUserDetail(id)).resolves.toBeNull();
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it("accepts an id of exactly 255 characters", async () => {
    const fake = useFakeDb();
    await getUserDetail("x".repeat(255));
    expect(fake.transaction).toHaveBeenCalledTimes(1);
  });

  it("runs a single batch whose statements are all filtered by the id", async () => {
    const fake = useFakeDb();
    await getUserDetail(USER);

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(4);
    const [profile, assignments, runner, booking] = fake.queries.map(({ sql }) => normalize(sql));
    expect(profile).toBe('select "email" from "profiles" where "profiles"."user_id" = $1');
    expect(assignments).toBe(
      'select "staff_assignments"."role", "staff_assignments"."granted_at", "staff_assignments"."sponsor_id", "sponsors"."name" ' +
        'from "staff_assignments" left join "sponsors" on "sponsors"."id" = "staff_assignments"."sponsor_id" ' +
        'where ("staff_assignments"."user_id" = $1 and "staff_assignments"."revoked_at" is null) ' +
        'order by "staff_assignments"."role" asc',
    );
    // Identity only: no sensitive column of the runner profile.
    expect(runner).toBe('select "full_name", "email" from "runner_profiles" where "runner_profiles"."user_id" = $1');
    expect(booking).toBe(
      'select "participant_name", "participant_email" from "bookings" where "bookings"."runner_user_id" = $1 ' +
        'order by "bookings"."created_at" desc, "bookings"."id" asc limit $2',
    );
    expect(fake.queries.map(({ params }) => params)).toEqual([[USER], [USER], [USER], [USER, 1]]);
  });

  it("returns null when no source has a row", async () => {
    useFakeDb({ responses: detailResponses() });
    await expect(getUserDetail(USER)).resolves.toBeNull();
  });

  it("builds the member from the active roles of a staff account without a name", async () => {
    useFakeDb({
      responses: detailResponses({
        profile: [["c@example.com"]],
        assignments: [
          ["commercial", GRANTED, null, null],
          ["admin", "2026-10-22 10:00:00+00", null, null],
        ],
      }),
    });

    await expect(getUserDetail(USER)).resolves.toEqual({
      userId: USER,
      name: null,
      email: "c@example.com",
      hasRoleProfile: true,
      member: {
        userId: USER,
        email: "c@example.com",
        roles: [
          { role: "commercial", grantedAt: new Date("2026-10-20T10:00:00Z") },
          { role: "admin", grantedAt: new Date("2026-10-22T10:00:00Z") },
        ],
      },
      sponsor: null,
      isRunner: false,
    });
  });

  it("has a null member when the role profile has no active roles", async () => {
    useFakeDb({ responses: detailResponses({ profile: [["e@example.com"]] }) });

    await expect(getUserDetail(USER)).resolves.toMatchObject({
      email: "e@example.com",
      hasRoleProfile: true,
      member: null,
      sponsor: null,
      isRunner: false,
    });
  });

  it("takes the sponsor from the active sponsor assignment", async () => {
    useFakeDb({
      responses: detailResponses({
        profile: [["lucia@marca.com"]],
        assignments: [["sponsor", GRANTED, SPONSOR_ID, "Marca Norte"]],
      }),
    });

    const detail = await getUserDetail(USER);
    expect(detail?.sponsor).toEqual({ id: SPONSOR_ID, name: "Marca Norte" });
    expect(detail?.member?.roles).toEqual([{ role: "sponsor", grantedAt: new Date("2026-10-20T10:00:00Z") }]);
  });

  it("uses the runner profile name and email for a runner without a role profile", async () => {
    useFakeDb({
      responses: detailResponses({
        runner: [["Ana Pérez", "ana@example.com"]],
        booking: [["Ana P.", "otra@example.com"]],
      }),
    });

    await expect(getUserDetail(USER)).resolves.toEqual({
      userId: USER,
      name: "Ana Pérez",
      email: "ana@example.com",
      hasRoleProfile: false,
      member: null,
      sponsor: null,
      isRunner: true,
    });
  });

  it("falls back to the latest linked booking without a runner profile", async () => {
    useFakeDb({ responses: detailResponses({ booking: [["Beto Ruiz", "beto@example.com"]] }) });

    await expect(getUserDetail(USER)).resolves.toMatchObject({
      name: "Beto Ruiz",
      email: "beto@example.com",
      hasRoleProfile: false,
      isRunner: true,
    });
  });

  it("prefers the role profile email over the runner profile and booking ones", async () => {
    useFakeDb({
      responses: detailResponses({
        profile: [["c2@example.com"]],
        assignments: [["commercial", GRANTED, null, null]],
        runner: [["Carla Díaz", "carla@example.com"]],
        booking: [["Carla D.", "carla.d@example.com"]],
      }),
    });

    await expect(getUserDetail(USER)).resolves.toMatchObject({
      name: "Carla Díaz",
      email: "c2@example.com",
      hasRoleProfile: true,
      member: { email: "c2@example.com" },
      isRunner: true,
    });
  });

  it("sanitizes database errors before Next can log the account id or their cause", async () => {
    const failure = new Error(`connection refused: ${USER} private connection details`);
    useFakeDb({ failWith: failure });
    const error = await getUserDetail(USER).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("user-directory: load failed");
    expect(error).not.toHaveProperty("cause");
    expect(error).not.toHaveProperty("params");
  });
});
