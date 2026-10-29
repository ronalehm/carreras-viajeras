// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { enqueueFollowUps } from "./followUps.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][] }: { responses?: unknown[][] } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const client = Object.assign(query, { transaction: vi.fn() });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, client };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

beforeEach(() => vi.mocked(getDb).mockReset());

describe("enqueueFollowUps", () => {
  it("runs a single statement, outside any batch, with today and the limit as parameters", async () => {
    const fake = useFakeDb({ responses: [[{ enqueued: 1 }]] });

    await enqueueFollowUps("2026-10-25", 20);

    expect(fake.queries).toHaveLength(1);
    expect(fake.client.transaction).not.toHaveBeenCalled();
    expect(fake.queries[0].params).toEqual(["2026-10-25", 20]);
  });

  it("selects open, not opted-out leads in a sales stage whose next action is today or overdue", async () => {
    const fake = useFakeDb({ responses: [[{ enqueued: 0 }]] });
    await enqueueFollowUps("2026-10-25", 20);

    const statement = normalize(fake.queries[0].sql);
    const due = statement.split("ready AS (")[0];
    expect(due).toMatch(/^WITH due AS \(/);
    expect(due).toContain("FROM leads");
    expect(due).toContain(
      "WHERE archived_at IS NULL AND contact_opt_out_at IS NULL AND stage IN ('new', 'contacted', 'quoted') AND next_action_date <= $1::date",
    );
  });

  it("keys each reminder by stage episode: the last stage_changed activity, or 'created' without one", async () => {
    const fake = useFakeDb({ responses: [[{ enqueued: 0 }]] });
    await enqueueFollowUps("2026-10-25", 20);

    expect(normalize(fake.queries[0].sql)).toContain(
      "'follow_up:' || id || ':' || coalesce( ( SELECT a.id::text FROM lead_activities a WHERE a.lead_id = leads.id AND a.type = 'stage_changed' ORDER BY a.created_at DESC, a.id DESC LIMIT 1 ), 'created' ) AS dedupe_key",
    );
  });

  it("skips episodes that already have an event, then orders by next action and creation and applies the limit", async () => {
    const fake = useFakeDb({ responses: [[{ enqueued: 0 }]] });
    await enqueueFollowUps("2026-10-25", 7);

    const ready = normalize(fake.queries[0].sql).split("ready AS (")[1].split("inserted AS (")[0];
    expect(ready).toContain(
      "FROM due WHERE NOT EXISTS (SELECT 1 FROM outbox_events e WHERE e.dedupe_key = due.dedupe_key)",
    );
    expect(ready).toContain("ORDER BY next_action_date, created_at, id LIMIT $2::int");
    expect(fake.queries[0].params[1]).toBe(7);
  });

  it("inserts lead.follow_up_due with { stage, dueOn } and its dedupe_key, doing nothing on a dedupe conflict", async () => {
    const fake = useFakeDb({ responses: [[{ enqueued: 0 }]] });
    await enqueueFollowUps("2026-10-25", 20);

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(
      "INSERT INTO outbox_events (type, lead_id, payload, dedupe_key) SELECT 'lead.follow_up_due', id, jsonb_build_object('stage', stage, 'dueOn', next_action_date), dedupe_key FROM ready ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id",
    );
    expect(statement).toMatch(/SELECT count\(\*\)::int AS enqueued FROM inserted$/);
    // Only the follow-up event: no lead update, no activity.
    expect(statement).not.toMatch(/UPDATE|INSERT INTO lead_activities|INSERT INTO leads/);
  });

  it("returns the inserted count as a number", async () => {
    useFakeDb({ responses: [[{ enqueued: 3 }]] });
    await expect(enqueueFollowUps("2026-10-25", 20)).resolves.toBe(3);

    useFakeDb({ responses: [[{ enqueued: "2" }]] });
    await expect(enqueueFollowUps("2026-10-25", 20)).resolves.toBe(2);
  });

  it("returns 0 when nothing was inserted", async () => {
    useFakeDb({ responses: [[{ enqueued: 0 }]] });
    await expect(enqueueFollowUps("2026-10-25", 20)).resolves.toBe(0);

    useFakeDb({ responses: [[]] });
    await expect(enqueueFollowUps("2026-10-25", 20)).resolves.toBe(0);
  });
});
