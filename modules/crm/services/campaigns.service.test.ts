// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { CampaignInput } from "../types/campaigns.types";
import { closeCampaign, createCampaign, getCampaignById, listCampaigns, recordCampaignVisit } from "./campaigns.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (same pattern as leads.service.test.ts): records every statement and
// answers each one, in order, with the given rows.
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

const CAMPAIGN_ID = "5b2d7c1e-4a3f-4e8b-9c6d-1f0e2a3b4c5d";
const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

const SELECT_LIST =
  'select "campaigns"."id", "campaigns"."code", "campaigns"."name", "campaigns"."channel", "campaigns"."event_name", "campaigns"."status", "trips"."slug", "trips"."title", "campaigns"."created_at", coalesce("lead_count", 0), coalesce("visit_count", 0)';
const COUNTS =
  'left join (select "campaign_id", count(*) as "lead_count" from "leads" where "leads"."campaign_id" is not null group by "leads"."campaign_id") "lead_counts" on "lead_counts"."campaign_id" = "campaigns"."id" left join (select "campaign_id", sum("visits") as "visit_count" from "campaign_visit_days" group by "campaign_visit_days"."campaign_id") "visit_counts" on "visit_counts"."campaign_id" = "campaigns"."id"';

// List row in select order (array mode): id, code, name, channel, event_name, status,
// trip slug/title, created_at, lead_count (bigint) and visit_count (sum of integer: numeric), both
// strings from Neon.
function listRow(overrides: Record<number, unknown> = {}) {
  const row: unknown[] = [
    CAMPAIGN_ID,
    "mml26",
    "QR stand MML",
    "event",
    "Media Maratón de Lima 2026",
    "active",
    "maraton-santiago-2027",
    "Maratón de Santiago 2027",
    "2026-10-20 15:30:00+00",
    "3",
    "12",
  ];
  for (const [position, value] of Object.entries(overrides)) row[Number(position)] = value;
  return row;
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("listCampaigns", () => {
  it("reads campaigns with their trip, lead and visit counts in one query, active ones first", async () => {
    const fake = useFakeDb({ responses: [[listRow()]] });

    await expect(listCampaigns()).resolves.toEqual([
      {
        id: CAMPAIGN_ID,
        code: "mml26",
        name: "QR stand MML",
        channel: "event",
        eventName: "Media Maratón de Lima 2026",
        status: "active",
        trip: { slug: "maraton-santiago-2027", title: "Maratón de Santiago 2027" },
        createdAt: new Date("2026-10-20T15:30:00Z"),
        leadCount: 3,
        visitCount: 12,
      },
    ]);

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `${SELECT_LIST} from "campaigns" inner join "trips" on "trips"."id" = "campaigns"."trip_id" ${COUNTS} order by "campaigns"."status" = 'closed', "campaigns"."created_at" desc`,
    );
    expect(fake.queries[0].params).toEqual([]);
  });

  it("returns leadCount 0 for a campaign without leads and keeps a closed one without event", async () => {
    useFakeDb({ responses: [[listRow({ 4: null, 5: "closed", 9: 0 })]] });

    await expect(listCampaigns()).resolves.toMatchObject([{ eventName: null, status: "closed", leadCount: 0 }]);
  });

  it("returns visitCount 0 for a campaign without visit rows (coalesce)", async () => {
    useFakeDb({ responses: [[listRow({ 10: "0" })]] });

    await expect(listCampaigns()).resolves.toMatchObject([{ leadCount: 3, visitCount: 0 }]);
  });

  it("returns an empty list when there are no campaigns", async () => {
    useFakeDb({ responses: [[]] });
    await expect(listCampaigns()).resolves.toEqual([]);
  });
});

describe("getCampaignById", () => {
  it("returns null without querying when the id is not a UUID", async () => {
    const fake = useFakeDb();
    await expect(getCampaignById("abc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("returns null when the campaign does not exist", async () => {
    useFakeDb({ responses: [[]] });
    await expect(getCampaignById(CAMPAIGN_ID)).resolves.toBeNull();
  });

  it("reads an active campaign with its author, trip, lead and visit counts in one query; closedBy is null", async () => {
    const fake = useFakeDb({ responses: [[[...listRow(), "agent@example.com", null, null]]] });

    await expect(getCampaignById(CAMPAIGN_ID)).resolves.toEqual({
      id: CAMPAIGN_ID,
      code: "mml26",
      name: "QR stand MML",
      channel: "event",
      eventName: "Media Maratón de Lima 2026",
      status: "active",
      trip: { slug: "maraton-santiago-2027", title: "Maratón de Santiago 2027" },
      createdAt: new Date("2026-10-20T15:30:00Z"),
      leadCount: 3,
      visitCount: 12,
      createdBy: { email: "agent@example.com" },
      closedAt: null,
      closedBy: null,
    });

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `${SELECT_LIST}, "creator"."email", "campaigns"."closed_at", "closer"."email" from "campaigns" inner join "trips" on "trips"."id" = "campaigns"."trip_id" inner join "profiles" "creator" on "creator"."user_id" = "campaigns"."created_by" left join "profiles" "closer" on "closer"."user_id" = "campaigns"."closed_by" ${COUNTS} where "campaigns"."id" = $1 limit $2`,
    );
    expect(fake.queries[0].params).toEqual([CAMPAIGN_ID, 1]);
  });

  it("returns who closed a campaign and when", async () => {
    useFakeDb({
      responses: [[[...listRow({ 5: "closed" }), "agent@example.com", "2026-10-25 18:00:00+00", "admin@example.com"]]],
    });

    await expect(getCampaignById(CAMPAIGN_ID)).resolves.toMatchObject({
      status: "closed",
      closedAt: new Date("2026-10-25T18:00:00Z"),
      closedBy: { email: "admin@example.com" },
    });
  });
});

describe("createCampaign", () => {
  const input: CampaignInput = {
    code: "mml26",
    name: "QR stand MML",
    tripId: TRIP_ID,
    channel: "event",
    eventName: "Media Maratón de Lima 2026",
  };

  it("inserts the campaign in a single statement only if the trip is not archived, authored by the actor", async () => {
    const fake = useFakeDb({ responses: [[{ id: CAMPAIGN_ID, trip_ok: true }]] });

    await expect(createCampaign(input, "user-1")).resolves.toEqual({ id: CAMPAIGN_ID });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toBe(
      "WITH trip AS ( SELECT id FROM trips WHERE id = $1::uuid AND status <> 'archived' ), inserted AS ( INSERT INTO campaigns (code, trip_id, channel, name, event_name, created_by) SELECT $2, id, $3::lead_channel, $4, $5, $6 FROM trip ON CONFLICT (code) DO NOTHING RETURNING id ) SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM trip) AS trip_ok",
    );
    expect(fake.queries[0].params).toEqual([
      TRIP_ID,
      "mml26",
      "event",
      "QR stand MML",
      "Media Maratón de Lima 2026",
      "user-1",
    ]);
  });

  it("sends a null event name", async () => {
    const fake = useFakeDb({ responses: [[{ id: CAMPAIGN_ID, trip_ok: true }]] });
    await createCampaign({ ...input, eventName: null }, "user-1");
    expect(fake.queries[0].params[4]).toBeNull();
  });

  it("never sends status, author or closing fields from the input: defaults and the actor apply", async () => {
    const fake = useFakeDb({ responses: [[{ id: CAMPAIGN_ID, trip_ok: true }]] });
    const extra = { status: "closed", createdBy: "intruder", closedAt: new Date(), closedBy: "intruder" };
    await createCampaign({ ...input, ...extra } as CampaignInput, "user-1");

    const statement = normalize(fake.queries[0].sql);
    expect(statement).not.toMatch(/status,|closed_at|closed_by/);
    expect(fake.queries[0].params).not.toContain("intruder");
    expect(fake.queries[0].params).not.toContain("closed");
    expect(fake.queries[0].params).not.toContain(extra.closedAt);
  });

  it.each([
    [{ id: null, trip_ok: true }, "code_taken"],
    [{ id: null, trip_ok: false }, "invalid_trip"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(createCampaign(input, "user-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(createCampaign(input, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("closeCampaign", () => {
  it("closes only an active campaign in one statement, setting status, closed_at and closed_by together", async () => {
    const fake = useFakeDb({ responses: [[[CAMPAIGN_ID]]] });

    await expect(closeCampaign(CAMPAIGN_ID, "user-1")).resolves.toBe("closed");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "campaigns" set "status" = $1, "closed_at" = now(), "closed_by" = $2 where ("campaigns"."id" = $3 and "campaigns"."status" = $4) returning "id"',
    );
    expect(fake.queries[0].params).toEqual(["closed", "user-1", CAMPAIGN_ID, "active"]);
  });

  it("returns not_found when the campaign is missing or already closed (idempotent)", async () => {
    useFakeDb({ responses: [[]] });
    await expect(closeCampaign(CAMPAIGN_ID, "user-1")).resolves.toBe("not_found");
  });

  it("never touches the campaign's leads", async () => {
    const fake = useFakeDb({ responses: [[[CAMPAIGN_ID]]] });
    await closeCampaign(CAMPAIGN_ID, "user-1");
    expect(normalize(fake.queries[0].sql)).not.toContain("leads");
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(closeCampaign(CAMPAIGN_ID, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("recordCampaignVisit", () => {
  const visit = { slug: "maraton-santiago-2027", c: "mml26" };
  const STATEMENT =
    "INSERT INTO campaign_visit_days (campaign_id, day, visits) SELECT c.id, (now() AT TIME ZONE 'America/Lima')::date, 1 FROM campaigns c JOIN trips t ON t.id = c.trip_id WHERE c.code = $1 AND c.status = 'active' AND t.slug = $2 AND t.status = 'published' ON CONFLICT (campaign_id, day) DO UPDATE SET visits = campaign_visit_days.visits + 1";

  it("upserts today's Lima row of an active campaign of the published trip in a single statement", async () => {
    const fake = useFakeDb();

    await expect(recordCampaignVisit(visit)).resolves.toBeUndefined();

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toBe(STATEMENT);
    expect(fake.queries[0].params).toEqual(["mml26", "maraton-santiago-2027"]);
  });

  it("only counts an active campaign of a published trip with that slug", async () => {
    const fake = useFakeDb();
    await recordCampaignVisit(visit);

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("FROM campaigns c JOIN trips t ON t.id = c.trip_id");
    expect(statement).toContain("c.code = $1 AND c.status = 'active'");
    expect(statement).toContain("t.slug = $2 AND t.status = 'published'");
  });

  it("uses the America/Lima calendar day and increments on conflict instead of inserting twice", async () => {
    const fake = useFakeDb();
    await recordCampaignVisit(visit);

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("(now() AT TIME ZONE 'America/Lima')::date");
    expect(statement).toContain(
      "ON CONFLICT (campaign_id, day) DO UPDATE SET visits = campaign_visit_days.visits + 1",
    );
  });

  it("sends only the slug and the code: nothing about the visitor", async () => {
    const fake = useFakeDb();
    await recordCampaignVisit(visit);
    expect(fake.queries[0].params).toHaveLength(2);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(recordCampaignVisit(visit)).rejects.toMatchObject({ cause: failure });
  });
});
