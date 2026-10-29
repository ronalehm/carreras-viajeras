// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { ackEvent, claimEvents, failEvent } from "./outbox.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][] }: { responses?: unknown[][] } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const EVENT_ID = "a0000000-0000-4000-8000-000000000001";
const LEASE = "b0000000-0000-4000-8000-000000000001";
const LEAD_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const CURRENT_LEASE =
  'where ("outbox_events"."id" = $7 and "outbox_events"."lease_token" = $8 and "outbox_events"."status" = $9 and "outbox_events"."lease_until" > now())';

// Claimed row in RETURNING order (array mode): id, type, lead_id, payload_version, payload,
// attempts, lease_token, lease_until, created_at, available_at.
function claimedRow(id: string, availableAt: string, payload: unknown = { source: "web_form" }) {
  return [
    id,
    "lead.created",
    LEAD_ID,
    1,
    payload,
    1,
    LEASE,
    "2026-10-18 18:05:00+00",
    "2026-10-18 17:00:00+00",
    availableAt,
  ];
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("claimEvents", () => {
  it("moves exhausted expired leases to dead before the claim, in one batch", async () => {
    const fake = useFakeDb();
    await claimEvents(2);

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    const [dead, claim] = fake.queries;
    expect(normalize(dead.sql)).toBe(
      'update "outbox_events" set "status" = $1, "lease_until" = $2, "lease_token" = $3, "processed_at" = now(), "last_error_code" = $4 where "outbox_events"."id" in (select "id" from "outbox_events" where (("outbox_events"."status" = $5 and "outbox_events"."lease_until" <= now()) and "outbox_events"."attempts" >= $6) for update skip locked)',
    );
    expect(dead.params).toEqual(["dead", null, null, "lease_expired", "processing", 8]);
    expect(normalize(claim.sql)).toMatch(/^with "ready" as \(select "id" from "outbox_events"/);
  });

  it("claims ready events in one statement with for update skip locked, limit, a new lease and attempts + 1", async () => {
    const fake = useFakeDb();
    await claimEvents(2);

    const claim = fake.queries[1];
    expect(normalize(claim.sql)).toBe(
      'with "ready" as (select "id" from "outbox_events" where ((("outbox_events"."status" = $1 and "outbox_events"."available_at" <= now()) or ("outbox_events"."status" = $2 and "outbox_events"."lease_until" <= now())) and "outbox_events"."attempts" < $3) order by "outbox_events"."available_at", "outbox_events"."id" limit $4 for update skip locked) ' +
        'update "outbox_events" set "status" = $5, "attempts" = "outbox_events"."attempts" + 1, "lease_until" = now() + interval \'5 minutes\', "lease_token" = gen_random_uuid() from "ready" where "outbox_events"."id" = "ready"."id" ' +
        'returning "outbox_events"."id", "outbox_events"."type", "outbox_events"."lead_id", "outbox_events"."payload_version", "outbox_events"."payload", "outbox_events"."attempts", "outbox_events"."lease_token", "outbox_events"."lease_until", "outbox_events"."created_at", "outbox_events"."available_at"',
    );
    expect(claim.params).toEqual(["pending", "processing", 8, 2, "processing"]);
  });

  it("returns the claimed events oldest first, in the contract shape", async () => {
    const older = "a0000000-0000-4000-8000-000000000002";
    useFakeDb({
      responses: [
        [],
        [
          claimedRow(EVENT_ID, "2026-10-18 17:59:00+00", { stageFrom: "new", stageTo: "quoted" }),
          claimedRow(older, "2026-10-18 17:58:00+00"),
        ],
      ],
    });

    const events = await claimEvents(10);

    expect(events.map((event) => event.id)).toEqual([older, EVENT_ID]);
    expect(events[1]).toEqual({
      id: EVENT_ID,
      type: "lead.created",
      leadId: LEAD_ID,
      payloadVersion: 1,
      payload: { stageFrom: "new", stageTo: "quoted" },
      attempts: 1,
      leaseToken: LEASE,
      leaseUntil: "2026-10-18T18:05:00.000Z",
      createdAt: "2026-10-18T17:00:00.000Z",
    });
    expect(events[1]).not.toHaveProperty("availableAt");
  });

  it("returns [] when nothing is ready", async () => {
    useFakeDb();
    await expect(claimEvents(10)).resolves.toEqual([]);
  });
});

describe("ackEvent", () => {
  it("marks succeeded only with the current lease (token, processing, lease_until > now())", async () => {
    const fake = useFakeDb({ responses: [[[EVENT_ID]]] });

    await expect(ackEvent(EVENT_ID, LEASE)).resolves.toBe("succeeded");
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "outbox_events" set "status" = $1, "lease_until" = $2, "lease_token" = $3, "processed_at" = now() where ("outbox_events"."id" = $4 and "outbox_events"."lease_token" = $5 and "outbox_events"."status" = $6 and "outbox_events"."lease_until" > now()) returning "id"',
    );
    expect(fake.queries[0].params).toEqual(["succeeded", null, null, EVENT_ID, LEASE, "processing"]);
  });

  it("returns lease_lost without rows", async () => {
    useFakeDb({ responses: [[]] });
    await expect(ackEvent(EVENT_ID, LEASE)).resolves.toBe("lease_lost");
  });
});

describe("failEvent", () => {
  it("updates in one statement with the current lease: dead at 8 attempts, otherwise pending with backoff", async () => {
    const fake = useFakeDb({ responses: [[["pending", "2026-10-18 18:00:30+00"]]] });
    await failEvent(EVENT_ID, LEASE, "smtp_error");

    expect(fake.queries).toHaveLength(1);
    const sql = normalize(fake.queries[0].sql);
    expect(sql).toContain(
      `"status" = CASE WHEN "outbox_events"."attempts" >= $1 THEN 'dead' ELSE 'pending' END::outbox_status`,
    );
    expect(sql).toContain(
      `"available_at" = CASE WHEN "outbox_events"."attempts" >= $2 THEN "outbox_events"."available_at" ELSE now() + least(3600, 30 * power(2, "outbox_events"."attempts" - 1)) * (0.8 + random() * 0.4) * interval '1 second' END`,
    );
    expect(sql).toContain('"lease_until" = $3, "lease_token" = $4');
    expect(sql).toContain(`"processed_at" = CASE WHEN "outbox_events"."attempts" >= $5 THEN now() END`);
    expect(sql).toContain(`"last_error_code" = $6 ${CURRENT_LEASE} returning "status", "available_at"`);
    expect(fake.queries[0].params).toEqual([8, 8, null, null, 8, "smtp_error", EVENT_ID, LEASE, "processing"]);
  });

  it("returns pending with the next attempt time (attempts < 8)", async () => {
    useFakeDb({ responses: [[["pending", "2026-10-18 18:00:30+00"]]] });
    await expect(failEvent(EVENT_ID, LEASE, "smtp_error")).resolves.toEqual({
      status: "pending",
      availableAt: new Date("2026-10-18T18:00:30.000Z"),
    });
  });

  it("returns dead (attempts = 8)", async () => {
    useFakeDb({ responses: [[["dead", "2026-10-18 17:00:00+00"]]] });
    await expect(failEvent(EVENT_ID, LEASE, "smtp_error")).resolves.toEqual({ status: "dead" });
  });

  it("returns lease_lost without rows", async () => {
    useFakeDb({ responses: [[]] });
    await expect(failEvent(EVENT_ID, LEASE, "smtp_error")).resolves.toBe("lease_lost");
  });
});
