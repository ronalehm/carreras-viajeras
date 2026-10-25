// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
// The public API of @/modules/trips also exports CRM components and actions (Neon Auth, next/headers):
// expose only the schema this module reuses.
vi.mock("@/modules/trips", async () => ({
  tripSlugSchema: (await import("@/modules/trips/schemas/trips.schema")).tripSlugSchema,
}));

import { getDb } from "@/lib/db";
import type { LeadCreatedPayload } from "../types/automation.types";
import { ackEvent, claimEvents, failEvent, leadCreatedEventInsert } from "./automation.service";

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
  const db = drizzle(client as never) as ReturnType<typeof getDb>;
  vi.mocked(getDb).mockReturnValue(db);
  return { db, queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const EVENT_ID = "6b1f4c2e-8d3a-4f5b-9c7e-1a2b3c4d5e6f";
const LEASE_TOKEN = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const payload: LeadCreatedPayload = {
  leadId: "3f2c1a9e-7b4d-4e8f-9a1b-2c3d4e5f6a7b",
  tripSlug: "maraton-santiago-2027",
  source: "landing_contact",
};

beforeEach(() => {
  vi.mocked(getDb).mockReset();
});

describe("leadCreatedEventInsert", () => {
  it("returns an unexecuted lead.created v1 insert with the exact payload", () => {
    const fake = useFakeDb();

    const statement = leadCreatedEventInsert(fake.db, payload);

    expect(fake.queries).toHaveLength(0);
    const { sql, params } = statement.toSQL();
    // id, status, attempts, dates and lease are left to the column defaults.
    expect(normalize(sql)).toBe(
      'insert into "automation_events" ("id", "type", "lead_id", "payload_version", "payload", "status", "attempts", ' +
        '"available_at", "lease_until", "lease_token", "last_error_code", "created_at", "processed_at") ' +
        "values (default, $1, $2, $3, $4, default, default, default, default, default, default, default, default)",
    );
    expect(params).toEqual(["lead.created", payload.leadId, 1, JSON.stringify(payload)]);
  });

  it("can run inside db.batch with the statement that creates the lead", async () => {
    const fake = useFakeDb();
    await fake.db.batch([leadCreatedEventInsert(fake.db, payload)]);

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(1);
  });

  it.each([
    ["a non-UUID leadId", { ...payload, leadId: "lead-1" }],
    ["an invalid tripSlug", { ...payload, tripSlug: "maraton santiago" }],
    ["another source", { ...payload, source: "crm" }],
    ["extra fields", { ...payload, phone: "+56 9 1234 5678" }],
  ])("throws a validation error for %s, without building a statement", (_, invalid) => {
    const fake = useFakeDb();
    expect(() => leadCreatedEventInsert(fake.db, invalid as LeadCreatedPayload)).toThrow();
    expect(fake.queries).toHaveLength(0);
  });
});

describe("claimEvents", () => {
  it("runs one statement that dead-letters exhausted leases and claims with SKIP LOCKED", async () => {
    const fake = useFakeDb();
    await claimEvents(7);

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toMatch(
      /^WITH expired AS \( UPDATE automation_events SET status = 'dead', last_error_code = 'lease_expired', lease_token = NULL, lease_until = NULL WHERE status = 'processing' AND lease_until <= now\(\) AND attempts >= \$1 RETURNING id \)/,
    );
    expect(statement).toContain(
      "candidates AS ( SELECT id FROM automation_events WHERE (status = 'pending' AND available_at <= now()) " +
        "OR (status = 'processing' AND lease_until <= now() AND attempts < $2) ORDER BY available_at, id LIMIT $3 FOR UPDATE SKIP LOCKED )",
    );
    expect(statement).toContain(
      "SET status = 'processing', attempts = events.attempts + 1, lease_token = gen_random_uuid(), lease_until = now() + make_interval(secs => $4)",
    );
    // MAX_ATTEMPTS twice, the received limit and LEASE_SECONDS, always as bound parameters.
    expect(fake.queries[0].params).toEqual([8, 8, 7, 300]);
  });

  it("maps the claimed rows to the API contract", async () => {
    useFakeDb({
      responses: [
        [
          {
            id: EVENT_ID,
            type: "lead.created",
            payload_version: 1,
            payload,
            attempts: 2,
            created_at: new Date("2026-10-18T10:00:00Z"),
            lease_token: LEASE_TOKEN,
            lease_until: "2026-10-18 10:15:00+00",
          },
        ],
      ],
    });

    await expect(claimEvents(10)).resolves.toEqual([
      {
        eventId: EVENT_ID,
        type: "lead.created",
        payloadVersion: 1,
        payload,
        attempt: 2,
        occurredAt: "2026-10-18T10:00:00.000Z",
        leaseToken: LEASE_TOKEN,
        leaseExpiresAt: "2026-10-18T10:15:00.000Z",
      },
    ]);
  });

  it("returns an empty batch when nothing is available", async () => {
    useFakeDb();
    await expect(claimEvents(10)).resolves.toEqual([]);
  });

  it("propagates database errors", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(claimEvents(10)).rejects.toMatchObject({ cause: failure });
  });
});

describe("ackEvent", () => {
  it("marks succeeded only with the current lease, or repeats an ack with the same token", async () => {
    const fake = useFakeDb({ responses: [[[EVENT_ID]]] });

    await expect(ackEvent(EVENT_ID, LEASE_TOKEN)).resolves.toBe("ok");

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "automation_events" set "status" = $1, "processed_at" = coalesce("automation_events"."processed_at", now()) ' +
        'where (("automation_events"."id" = $2 and "automation_events"."status" = $3 and "automation_events"."lease_token" = $4 and "automation_events"."lease_until" > now()) or ' +
        '("automation_events"."id" = $5 and "automation_events"."status" = $6 and "automation_events"."lease_token" = $7)) ' +
        'returning "id"',
    );
    expect(fake.queries[0].params).toEqual([
      "succeeded",
      EVENT_ID,
      "processing",
      LEASE_TOKEN,
      EVENT_ID,
      "succeeded",
      LEASE_TOKEN,
    ]);
  });

  it("keeps the lease token (only status and processed_at change)", async () => {
    const fake = useFakeDb({ responses: [[[EVENT_ID]]] });
    await ackEvent(EVENT_ID, LEASE_TOKEN);

    expect(normalize(fake.queries[0].sql).split(" where ")[0]).not.toContain("lease_token");
  });

  it("returns conflict when no row matches (old token, expired lease or missing event)", async () => {
    useFakeDb({ responses: [[]] });
    await expect(ackEvent(EVENT_ID, LEASE_TOKEN)).resolves.toBe("conflict");
  });
});

describe("failEvent", () => {
  it("returns to pending with this attempt's backoff, or dead with no attempts left, and clears the lease", async () => {
    const fake = useFakeDb({ responses: [[["pending", "2026-10-18 10:00:30+00"]]] });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(failEvent(EVENT_ID, LEASE_TOKEN, "timeout")).resolves.toEqual({
      status: "retry",
      retryAt: "2026-10-18T10:00:30.000Z",
    });

    random.mockRestore();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "automation_events" set ' +
        `"status" = CASE WHEN "automation_events"."attempts" >= $1 THEN 'dead' ELSE 'pending' END::automation_event_status, ` +
        '"available_at" = CASE WHEN "automation_events"."attempts" >= $2 THEN "automation_events"."available_at" ' +
        'ELSE now() + make_interval(secs => (ARRAY[$3, $4, $5, $6, $7, $8, $9, $10]::integer[])["automation_events"."attempts"]) END, ' +
        '"lease_until" = $11, "lease_token" = $12, "last_error_code" = $13 ' +
        'where ("automation_events"."id" = $14 and "automation_events"."status" = $15 and "automation_events"."lease_token" = $16 and "automation_events"."lease_until" > now()) ' +
        'returning "status", "available_at"',
    );
    // Lower bound of each attempt's delay (random = 0): retryDelaySeconds(1..8).
    expect(fake.queries[0].params).toEqual([
      8,
      8,
      15,
      30,
      60,
      120,
      240,
      480,
      960,
      1800,
      null,
      null,
      "timeout",
      EVENT_ID,
      "processing",
      LEASE_TOKEN,
    ]);
  });

  it("returns dead when the database moved the event to dead (attempt 8)", async () => {
    useFakeDb({ responses: [[["dead", "2026-10-18 09:00:00+00"]]] });
    await expect(failEvent(EVENT_ID, LEASE_TOKEN, "provider_error")).resolves.toEqual({ status: "dead" });
  });

  it("returns conflict when no row matches (old or expired lease)", async () => {
    useFakeDb({ responses: [[]] });
    await expect(failEvent(EVENT_ID, LEASE_TOKEN, "timeout")).resolves.toEqual({ status: "conflict" });
  });
});
