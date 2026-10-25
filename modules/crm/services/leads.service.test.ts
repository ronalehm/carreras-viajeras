// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
// The public API of @/modules/trips (reused by @/modules/automation) also exports CRM components and
// actions (Neon Auth, next/headers): expose only the schema the outbox payload needs.
vi.mock("@/modules/trips", async () => ({
  tripSlugSchema: (await import("@/modules/trips/schemas/trips.schema")).tripSlugSchema,
}));

import { getDb } from "@/lib/db";
import type { CreateLeadInput, WebLeadInput } from "../types/leads.types";
import { webLeadRequestHash } from "../utils/webLeadHash";
import { createLead, createWebLead, getLeadFormOptions, getLeadList } from "./leads.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers each one, in order, with the given rows.
// failTransactionWith rejects only the batch (after recording its statements), so the statements
// that follow it still get their responses.
function useFakeDb({
  responses = [] as unknown[][],
  failWith,
  failTransactionWith,
}: { responses?: unknown[][]; failWith?: Error; failTransactionWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn(async (pending: Promise<unknown>[]) => {
    const results = await Promise.all(pending);
    if (failTransactionWith) throw failTransactionWith;
    return results;
  });
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
const ACTIVE_OWNER_ROLES = '"staff_assignments"."revoked_at" is null and "staff_assignments"."role" in ($1, $2)';

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
      /^select "leads"\."id", .* from "leads" left join "profiles" on "profiles"\."user_id" = "leads"\."owner_user_id" left join "trips" on "trips"\."id" = "leads"\."trip_id"/,
    );
    expect(list).toContain(
      `exists (select 1 from "staff_assignments" where ("staff_assignments"."user_id" = "leads"."owner_user_id" and (${ACTIVE_OWNER_ROLES})))`,
    );
    expect(list).toContain('where "leads"."archived_at" is null order by "leads"."created_at" desc, "leads"."id" desc limit $3');
    expect(list).not.toContain("offset");
    expect(fake.queries[0].params).toEqual(["commercial", "admin", 26]);

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
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" = $3) and "leads"."stage" = $4) order by "leads"."created_at" desc, "leads"."id" desc limit $5 offset $6',
    );
    expect(list.params).toEqual(["commercial", "admin", "user-1", "quoted", 26, 50]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" = $1) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["user-1"]);
  });

  it("filters by a specific owner id", async () => {
    const fake = useFakeDb();
    await getLeadList({ owner: "user-7", page: 1 }, "user-1");

    expect(fake.queries[0].params).toEqual(["commercial", "admin", "user-7", 26]);
    expect(fake.queries[1].params).toEqual(["user-7"]);
  });

  it("filters unassigned leads by a null owner in the page and in the funnel", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "new", owner: "unassigned", page: 1 }, "user-1");

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" is null) and "leads"."stage" = $3) order by',
    );
    expect(list.params).toEqual(["commercial", "admin", "new", 26]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" is null) group by "leads"."stage"',
    );
    expect(counts.params).toEqual([]);
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
          listRow(3, [undefined, undefined, undefined, undefined, "web_form", undefined, undefined, "Roma", null, null, false]),
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
        {
          id: "lead-3",
          fullName: "Lead 3",
          phone: "+51938127170",
          stage: "new",
          source: "web_form",
          trip: null,
          destinationText: "Roma",
          owner: null,
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
    expect(owners.params).toEqual(["commercial", "admin"]);
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
      /^WITH checks AS \( SELECT exists \(select 1 from "staff_assignments" where \("staff_assignments"\."user_id" = \$1 and \("staff_assignments"\."revoked_at" is null and "staff_assignments"\."role" in \(\$2, \$3\)\)\)\) AS owner_ok, \(\$4::uuid IS NULL OR EXISTS \( SELECT 1 FROM trips WHERE trips\.id = \$5::uuid AND trips\.status <> 'archived' \)\) AS trip_ok \)/,
    );
    expect(statement).toContain(
      "INSERT INTO leads ( full_name, phone, email, location, trip_id, destination_text, source, owner_user_id, consent_version, created_by ) SELECT $6, $7, $8, $9, $10::uuid, $11, $12::lead_source, $13, $14, $15 FROM checks WHERE owner_ok AND trip_ok RETURNING id",
    );
    expect(statement).toContain(
      "INSERT INTO lead_activities (lead_id, type, body, actor_user_id) SELECT id, 'created', $16, $17 FROM inserted",
    );
    expect(statement).toMatch(/SELECT \(SELECT id FROM inserted\) AS id, owner_ok, trip_ok FROM checks$/);
    expect(fake.queries[0].params).toEqual([
      "user-2",
      "commercial",
      "admin",
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

describe("createWebLead", () => {
  const LEAD_ID = "3f2c1a9e-7b4d-4e8f-9a1b-2c3d4e5f6a7b";
  const EXISTING_ID = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
  const KEY = "0c9b8a7f-6e5d-4c3b-9a2f-1e0d9c8b7a6f";
  const input: WebLeadInput = {
    fullName: "Ana Pérez",
    phone: "+51938127170",
    email: "ana@example.com",
    interest: { tripSlug: "maraton-santiago-2027", destinationName: "Maratón de Santiago 42K 2027" },
    idempotencyKey: KEY,
  };
  const hashOf = (value: WebLeadInput) =>
    webLeadRequestHash({
      fullName: value.fullName,
      phone: value.phone,
      email: value.email,
      tripSlug: value.interest.tripSlug,
      destinationName: value.interest.destinationName,
      consentVersion: "web-form-v1",
    });

  // insert into "t" ("a", "b") values ($1, default) → { a: <param 1>, b: "default" }
  function insertedValues({ sql, params }: Query) {
    const match = normalize(sql).match(/^insert into "(\w+)" \((.*)\) values \((.*)\)$/);
    if (!match) throw new Error(`not a single-row insert: ${sql}`);
    const columns = match[2].split(", ").map((column) => column.replaceAll('"', ""));
    const values = match[3].split(", ").map((value) => (value === "default" ? "default" : params[Number(value.slice(1)) - 1]));
    return { table: match[1], values: Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
  }

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(LEAD_ID);
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads the published trip and then writes lead, activity and event in a single batch", async () => {
    const fake = useFakeDb({ responses: [[["trip-1"]]] });
    const errors = vi.spyOn(console, "error");
    const logs = vi.spyOn(console, "log");

    await expect(createWebLead(input)).resolves.toEqual({ id: LEAD_ID });

    expect(fake.queries).toHaveLength(4);
    expect(normalize(fake.queries[0].sql)).toBe(
      'select "id" from "trips" where ("trips"."slug" = $1 and "trips"."status" = $2) limit $3',
    );
    expect(fake.queries[0].params).toEqual(["maraton-santiago-2027", "published", 1]);
    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.transaction.mock.calls[0][0]).toHaveLength(3);

    const [lead, activity, event] = fake.queries.slice(1).map(insertedValues);
    expect(lead.table).toBe("leads");
    expect(lead.values).toMatchObject({
      id: LEAD_ID,
      full_name: "Ana Pérez",
      phone: "+51938127170",
      email: "ana@example.com",
      trip_id: "trip-1",
      destination_text: null,
      source: "web_form",
      consent_version: "web-form-v1",
      idempotency_key: KEY,
      request_hash: await hashOf(input),
      // Never sent: no owner or author for web leads, and the stage takes the column default.
      owner_user_id: "default",
      created_by: "default",
      stage: "default",
      consented_at: "default",
    });

    expect(activity.table).toBe("lead_activities");
    expect(activity.values).toMatchObject({
      lead_id: LEAD_ID,
      type: "created",
      actor_user_id: "default",
      body: "default",
    });

    expect(event.table).toBe("automation_events");
    expect(event.values).toMatchObject({
      type: "lead.created",
      lead_id: LEAD_ID,
      payload: JSON.stringify({ leadId: LEAD_ID, tripSlug: "maraton-santiago-2027", source: "landing_contact" }),
    });

    expect(errors).not.toHaveBeenCalled();
    expect(logs).not.toHaveBeenCalled();
  });

  it("keeps the destination as text and sends tripSlug null without a published trip", async () => {
    const fake = useFakeDb({ responses: [[]] });

    await expect(createWebLead(input)).resolves.toEqual({ id: LEAD_ID });

    const [lead, , event] = fake.queries.slice(1).map(insertedValues);
    expect(lead.values).toMatchObject({ trip_id: null, destination_text: "Maratón de Santiago 42K 2027" });
    expect(event.values.payload).toBe(
      JSON.stringify({ leadId: LEAD_ID, tripSlug: null, source: "landing_contact" }),
    );
  });

  it("returns the existing lead when the batch fails and the key has the same hash", async () => {
    const failure = new Error("duplicate key value violates unique constraint");
    const fake = useFakeDb({
      responses: [[["trip-1"]], [], [], [], [[EXISTING_ID, await hashOf(input)]]],
      failTransactionWith: failure,
    });

    await expect(createWebLead(input)).resolves.toEqual({ id: EXISTING_ID });

    expect(fake.queries).toHaveLength(5);
    expect(normalize(fake.queries[4].sql)).toBe(
      'select "id", "request_hash" from "leads" where "leads"."idempotency_key" = $1 limit $2',
    );
    expect(fake.queries[4].params).toEqual([KEY, 1]);
  });

  it("returns conflict when the key exists with another hash", async () => {
    const changed = { ...input, phone: "+51938127171" };
    useFakeDb({
      responses: [[["trip-1"]], [], [], [], [[EXISTING_ID, await hashOf(input)]]],
      failTransactionWith: new Error("duplicate key value violates unique constraint"),
    });

    await expect(createWebLead(changed)).resolves.toBe("conflict");
  });

  it("rethrows the original error when no lead has the key", async () => {
    const failure = new Error("connection refused");
    const errors = vi.spyOn(console, "error");
    useFakeDb({ responses: [[["trip-1"]], [], [], [], []], failTransactionWith: failure });

    await expect(createWebLead(input)).rejects.toBe(failure);
    expect(errors).not.toHaveBeenCalled();
  });
});
