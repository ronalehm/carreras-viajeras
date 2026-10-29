// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { CreateLeadInput } from "../types/leads.types";
import { createLead, getLeadFormOptions, getLeadList } from "./leads.service";

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

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
// Roles with leads.manage in the permission matrix (organizer has no leads.manage).
const LEAD_OWNER_ROLES = ["commercial", "admin", "super_admin"];
const ACTIVE_OWNER_ROLES = '"staff_assignments"."revoked_at" is null and "staff_assignments"."role" in ($1, $2, $3)';

// List row in select order (array mode): id, full_name, phone, stage, source, trip id/title,
// destination_text, owner user_id/email/active.
function listRow(index: number, overrides: unknown[] = []) {
  const row = [
    `lead-${index}`,
    `Lead ${index}`,
    "+51938127170",
    "new",
    "whatsapp",
    null,
    null,
    null,
    "user-1",
    "ana@example.com",
    true,
  ];
  overrides.forEach((value, position) => {
    if (value !== undefined) row[position] = value as never;
  });
  return row;
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getLeadList", () => {
  it("reads the page, the funnel counts and the owner options in one batch", async () => {
    const fake = useFakeDb();
    await getLeadList({ page: 1 }, "user-1");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(3);
    const [list, counts, owners] = fake.queries.map((query) => normalize(query.sql));

    expect(list).toMatch(
      /^select "leads"\."id", .* from "leads" inner join "profiles" on "profiles"\."user_id" = "leads"\."owner_user_id" left join "trips" on "trips"\."id" = "leads"\."trip_id"/,
    );
    expect(list).toContain(
      `exists (select 1 from "staff_assignments" where ("staff_assignments"."user_id" = "leads"."owner_user_id" and (${ACTIVE_OWNER_ROLES})))`,
    );
    expect(list).toContain('where "leads"."archived_at" is null order by "leads"."created_at" desc, "leads"."id" desc limit $4');
    expect(list).not.toContain("offset");
    expect(fake.queries[0].params).toEqual([...LEAD_OWNER_ROLES, 26]);
    expect(fake.queries[2].params).toEqual(LEAD_OWNER_ROLES);
    expect(fake.queries[2].params).not.toContain("organizer");

    expect(counts).toBe(
      'select "stage", count(*) from "leads" where "leads"."archived_at" is null group by "leads"."stage"',
    );
    expect(owners).toBe(
      `select distinct "profiles"."user_id", "profiles"."email" from "staff_assignments" inner join "profiles" on "profiles"."user_id" = "staff_assignments"."user_id" where (${ACTIVE_OWNER_ROLES}) order by "profiles"."email" asc, "profiles"."user_id" asc`,
    );
  });

  it("applies stage, mine (session user) and the page offset; counts ignore the stage", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "quoted", owner: "mine", page: 3 }, "user-1");

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" = $4) and "leads"."stage" = $5) order by "leads"."created_at" desc, "leads"."id" desc limit $6 offset $7',
    );
    expect(list.params).toEqual([...LEAD_OWNER_ROLES, "user-1", "quoted", 26, 50]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" = $1) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["user-1"]);
  });

  it("filters by a specific owner id", async () => {
    const fake = useFakeDb();
    await getLeadList({ owner: "user-7", page: 1 }, "user-1");

    expect(fake.queries[0].params).toEqual([...LEAD_OWNER_ROLES, "user-7", 26]);
    expect(fake.queries[1].params).toEqual(["user-7"]);
  });

  it("returns 25 leads and hasNextPage when the database returns 26 rows", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => listRow(index));
    useFakeDb({ responses: [rows, [], []] });

    const result = await getLeadList({ page: 1 }, "user-1");
    expect(result.leads).toHaveLength(25);
    expect(result.leads.at(-1)?.id).toBe("lead-24");
    expect(result.hasNextPage).toBe(true);
  });

  it("maps rows, zero-fills the funnel and returns the owner options", async () => {
    useFakeDb({
      responses: [
        [
          listRow(1, [undefined, "Ana Pérez", undefined, "quoted", "other", TRIP_ID, "Maratón de Santiago 2027", "Panamá"]),
          listRow(2, [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "user-9", "ex@example.com", false]),
        ],
        [
          ["quoted", 1],
          ["new", 4],
        ],
        [["user-1", "ana@example.com"]],
      ],
    });

    await expect(getLeadList({ page: 1 }, "user-1")).resolves.toEqual({
      leads: [
        {
          id: "lead-1",
          fullName: "Ana Pérez",
          phone: "+51938127170",
          stage: "quoted",
          source: "other",
          trip: { id: TRIP_ID, title: "Maratón de Santiago 2027" },
          destinationText: "Panamá",
          owner: { userId: "user-1", email: "ana@example.com", active: true },
        },
        {
          id: "lead-2",
          fullName: "Lead 2",
          phone: "+51938127170",
          stage: "new",
          source: "whatsapp",
          trip: null,
          destinationText: null,
          owner: { userId: "user-9", email: "ex@example.com", active: false },
        },
      ],
      hasNextPage: false,
      stageCounts: { new: 4, contacted: 0, quoted: 1, reserved: 0, paid: 0, lost: 0 },
      ownerOptions: [{ userId: "user-1", email: "ana@example.com" }],
    });
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(getLeadList({ page: 1 }, "user-1")).rejects.toBe(failure);
  });
});

describe("getLeadFormOptions", () => {
  it("reads active owners and non-archived trips in one batch", async () => {
    const fake = useFakeDb({
      responses: [
        [["user-1", "ana@example.com"]],
        [[TRIP_ID, "Maratón de Santiago 2027", "draft"]],
      ],
    });

    await expect(getLeadFormOptions()).resolves.toEqual({
      ownerOptions: [{ userId: "user-1", email: "ana@example.com" }],
      tripOptions: [{ id: TRIP_ID, title: "Maratón de Santiago 2027", status: "draft" }],
    });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    const [owners, tripsQuery] = fake.queries;
    expect(normalize(owners.sql)).toContain(`where (${ACTIVE_OWNER_ROLES})`);
    expect(owners.params).toEqual(LEAD_OWNER_ROLES);
    expect(owners.params).not.toContain("organizer");
    expect(normalize(tripsQuery.sql)).toBe(
      'select "id", "title", "status" from "trips" where "trips"."status" <> $1 order by "trips"."race_date" asc, "trips"."title" asc',
    );
    expect(tripsQuery.params).toEqual(["archived"]);
  });
});

describe("createLead", () => {
  const input: CreateLeadInput = {
    fullName: "Ana Pérez",
    phone: "+51938127170",
    email: "ana@example.com",
    location: "Lima",
    tripId: TRIP_ID,
    destinationText: null,
    source: "whatsapp",
    ownerUserId: "user-2",
    note: "Quiere la 21K.",
    consent: "on",
  };

  it("inserts the lead and its created activity in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ id: "lead-1", owner_ok: true, trip_ok: true }]] });

    await expect(createLead(input, "user-1")).resolves.toEqual({ id: "lead-1" });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toMatch(
      /^WITH checks AS \( SELECT exists \(select 1 from "staff_assignments" where \("staff_assignments"\."user_id" = \$1 and \("staff_assignments"\."revoked_at" is null and "staff_assignments"\."role" in \(\$2, \$3, \$4\)\)\)\) AS owner_ok, \(\$5::uuid IS NULL OR EXISTS \( SELECT 1 FROM trips WHERE trips\.id = \$6::uuid AND trips\.status <> 'archived' \)\) AS trip_ok \)/,
    );
    expect(statement).toContain(
      "INSERT INTO leads ( full_name, phone, email, location, trip_id, destination_text, source, owner_user_id, consent_version, created_by ) SELECT $7, $8, $9, $10, $11::uuid, $12, $13::lead_source, $14, $15, $16 FROM checks WHERE owner_ok AND trip_ok RETURNING id",
    );
    expect(statement).toContain(
      "INSERT INTO lead_activities (lead_id, type, body, actor_user_id) SELECT id, 'created', $17, $18 FROM inserted",
    );
    expect(statement).toMatch(/SELECT \(SELECT id FROM inserted\) AS id, owner_ok, trip_ok FROM checks$/);
    expect(fake.queries[0].params).toEqual([
      "user-2",
      ...LEAD_OWNER_ROLES,
      TRIP_ID,
      TRIP_ID,
      "Ana Pérez",
      "+51938127170",
      "ana@example.com",
      "Lima",
      TRIP_ID,
      null,
      "whatsapp",
      "user-2",
      "crm-manual-v1",
      "user-1",
      "Quiere la 21K.",
      "user-1",
    ]);
  });

  it("never sends the stage: the column default applies", async () => {
    const fake = useFakeDb({ responses: [[{ id: "lead-1", owner_ok: true, trip_ok: true }]] });
    await createLead({ ...input, stage: "paid" } as CreateLeadInput, "user-1");

    expect(normalize(fake.queries[0].sql)).not.toMatch(/stage/i);
    expect(fake.queries[0].params).not.toContain("paid");
  });

  it.each([
    [{ id: null, owner_ok: false, trip_ok: true }, "invalid_owner"],
    [{ id: null, owner_ok: false, trip_ok: false }, "invalid_owner"],
    [{ id: null, owner_ok: true, trip_ok: false }, "invalid_trip"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(createLead(input, "user-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(createLead(input, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});
