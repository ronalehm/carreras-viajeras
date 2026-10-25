// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { createWebLead } from "./webLeads.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (same pattern as leads.service.test.ts): records every statement and
// answers each one, in order, with the given rows.
function installFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
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

type Input = Parameters<typeof createWebLead>[0];

const SUBMISSION_ID = "6f9a1c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b";
const INPUT: Input = {
  fullName: "Ana María Pérez",
  email: "ana@example.com",
  phone: "+51938127170",
  destination: "maraton-santiago-2027",
  submissionId: SUBMISSION_ID,
};

// Parameter order: submissionId, phone, slug, fullName, phone, email, visible name, source,
// consent version, submissionId, hash.
const HASH_PARAM = 10;

async function hashFor(input: Input) {
  const fake = installFakeDb({ responses: [[{ created: 1, existing_hash: null }]] });
  await createWebLead(input);
  return fake.queries[0].params[HASH_PARAM] as string;
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("createWebLead", () => {
  it("inserts the lead, its created activity and its lead.created event in a single statement", async () => {
    const fake = installFakeDb({ responses: [[{ created: 1, existing_hash: null }]] });

    await expect(createWebLead(INPUT)).resolves.toBe("created");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toMatch(
      /^WITH existing AS \( SELECT submission_hash FROM leads WHERE idempotency_key = \$1::uuid \),/,
    );
    expect(statement).toContain(
      "recent AS ( SELECT 1 FROM leads WHERE source = 'web_form' AND phone = $2 AND created_at > now() - interval '10 minutes' LIMIT 1 )",
    );
    expect(statement).toContain(
      "trip AS ( SELECT id FROM trips WHERE slug = $3::text AND status = 'published' )",
    );
    // No owner, no author and never the stage (column default 'new').
    expect(statement).toContain(
      "INSERT INTO leads ( full_name, phone, email, trip_id, destination_text, source, consent_version, idempotency_key, submission_hash ) SELECT $4, $5, $6, (SELECT id FROM trip), CASE WHEN EXISTS (SELECT 1 FROM trip) THEN NULL ELSE $7::text END, $8::lead_source, $9, $10::uuid, $11 WHERE NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM recent) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, source",
    );
    expect(statement).not.toMatch(/owner_user_id|created_by|stage/);
    expect(statement).toContain(
      "activity AS ( INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead )",
    );
    expect(statement).toContain(
      "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.created', id, jsonb_build_object('source', source) FROM new_lead )",
    );
    expect(statement).toMatch(
      /SELECT \(SELECT count\(\*\) FROM new_lead\)::int AS created, \(SELECT submission_hash FROM existing\) AS existing_hash$/,
    );

    const params = fake.queries[0].params;
    expect(params.slice(0, HASH_PARAM)).toEqual([
      SUBMISSION_ID,
      "+51938127170",
      "maraton-santiago-2027",
      "Ana María Pérez",
      "+51938127170",
      "ana@example.com",
      "Maratón de Santiago 42K 2027",
      "web_form",
      "web-form-v1",
      SUBMISSION_ID,
    ]);
    expect(params[HASH_PARAM]).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["rio", "Río de Janeiro"],
    ["roma", "Roma"],
  ] as const)("for %s sends the visible name and no slug", async (destination, name) => {
    const fake = installFakeDb({ responses: [[{ created: 1, existing_hash: null }]] });
    await createWebLead({ ...INPUT, destination });
    const params = fake.queries[0].params;
    expect(params[2]).toBeNull();
    expect(params[6]).toBe(name);
  });

  it.each([
    ["the same key and data, or the duplicate window", [{ created: 0, existing_hash: null }]],
    ["a concurrent submission (bigint as string)", [{ created: "0", existing_hash: null }]],
  ])("returns duplicate for %s", async (_label, rows) => {
    installFakeDb({ responses: [rows] });
    await expect(createWebLead(INPUT)).resolves.toBe("duplicate");
  });

  it("returns duplicate when the key exists with the same hash", async () => {
    const hash = await hashFor(INPUT);
    installFakeDb({ responses: [[{ created: 0, existing_hash: hash }]] });
    await expect(createWebLead(INPUT)).resolves.toBe("duplicate");
  });

  it("returns conflict when the key exists with another hash", async () => {
    installFakeDb({ responses: [[{ created: 0, existing_hash: "a".repeat(64) }]] });
    await expect(createWebLead(INPUT)).resolves.toBe("conflict");
  });

  it("accepts created as a bigint string", async () => {
    installFakeDb({ responses: [[{ created: "1", existing_hash: null }]] });
    await expect(createWebLead(INPUT)).resolves.toBe("created");
  });

  it("keeps the hash stable for the same data and changes it when any field changes", async () => {
    const base = await hashFor(INPUT);
    expect(await hashFor({ ...INPUT })).toBe(base);
    // The submissionId is the key, not part of the hash.
    expect(await hashFor({ ...INPUT, submissionId: "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e" })).toBe(base);
    const changes: Partial<Input>[] = [
      { fullName: "Ana Pérez" },
      { email: "otra@example.com" },
      { phone: "+51938127171" },
      { destination: "rio" },
    ];
    for (const change of changes) {
      expect(await hashFor({ ...INPUT, ...change })).not.toBe(base);
    }
  });

  it("propagates a database error (the action replaces it with a fixed message)", async () => {
    installFakeDb({ failWith: new Error("connection refused") });
    await expect(createWebLead(INPUT)).rejects.toThrow();
  });
});
