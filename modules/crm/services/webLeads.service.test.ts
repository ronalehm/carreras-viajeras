// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { WebLeadInput } from "../types/webLeads.types";
import { createWebLead } from "./webLeads.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (same pattern as leads.service.test.ts): records every statement and
// answers each one, in order, with the given rows.
function stubDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
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

const SUBMISSION_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const INPUT: Omit<WebLeadInput, "turnstileToken"> = {
  fullName: "Ana María Pérez",
  email: "ana@example.com",
  phone: "+51938127170",
  destination: "maraton-santiago-2027",
  submissionId: SUBMISSION_ID,
};

const expectedHash = (input: Omit<WebLeadInput, "turnstileToken">) =>
  createHash("sha256")
    .update(JSON.stringify([input.fullName, input.email, input.phone, input.destination]))
    .digest("hex");

const CREATED = [{ created: true, existing_hash: null }];

async function capture(input = INPUT, rows: unknown[] = CREATED) {
  const fake = stubDb({ responses: [rows] });
  const result = await createWebLead(input);
  return { result, statement: normalize(fake.queries[0].sql), params: fake.queries[0].params, fake };
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("createWebLead", () => {
  it("inserts the lead, its created activity and its lead.created event in a single statement", async () => {
    const { result, statement, params, fake } = await capture();

    expect(result).toBe("created");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toMatch(
      /^WITH existing AS \( SELECT submission_hash FROM leads WHERE idempotency_key = \$1::uuid \),/,
    );
    expect(statement).toContain(
      "recent AS ( SELECT 1 FROM leads WHERE source = $2::lead_source AND phone = $3 AND created_at > now() - interval '10 minutes' )",
    );
    expect(statement).toContain("trip AS ( SELECT id FROM trips WHERE slug = $4::text AND status = 'published' )");
    expect(statement).toContain(
      "new_lead AS ( INSERT INTO leads ( full_name, phone, email, trip_id, destination_text, source, consent_version, idempotency_key, submission_hash ) SELECT $5, $6, $7, (SELECT id FROM trip), CASE WHEN EXISTS (SELECT 1 FROM trip) THEN NULL ELSE $8 END, $9::lead_source, $10, $11::uuid, $12 WHERE NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM recent) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, source )",
    );
    // No note and no author on the activity; the event payload is { source } only (no personal data).
    expect(statement).toContain(
      "activity AS ( INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead )",
    );
    expect(statement).toContain(
      "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.created', id, jsonb_build_object('source', source) FROM new_lead )",
    );
    expect(statement).toMatch(
      /SELECT EXISTS \(SELECT 1 FROM new_lead\) AS created, \(SELECT submission_hash FROM existing\) AS existing_hash$/,
    );
    expect(params).toEqual([
      SUBMISSION_ID,
      "web_form",
      "+51938127170",
      "maraton-santiago-2027",
      "Ana María Pérez",
      "+51938127170",
      "ana@example.com",
      "Maratón de Santiago 42K 2027",
      "web_form",
      "web-form-v1",
      SUBMISSION_ID,
      expectedHash(INPUT),
    ]);
  });

  it("never writes the stage, an owner, an author, the channel or the consent date: the defaults apply", async () => {
    const { statement, params } = await capture({ ...INPUT, stage: "paid", ownerUserId: "staff-1" } as never);

    expect(statement).not.toMatch(/stage|owner_user_id|created_by|actor_user_id|channel|consented_at|utm_/);
    expect(params).not.toContain("paid");
    expect(params).not.toContain("staff-1");
  });

  it.each([
    ["rio", "Río de Janeiro"],
    ["roma", "Roma"],
  ] as const)("%s has no catalog slug: sends a null slug and destination_text %s", async (destination, name) => {
    const { params } = await capture({ ...INPUT, destination });

    expect(params[3]).toBeNull();
    expect(params[7]).toBe(name);
  });

  it("the submission hash is 64 hex characters, stable for the same data", async () => {
    const first = (await capture()).params[11];
    const second = (await capture({ ...INPUT })).params[11];

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it.each([
    ["fullName", { fullName: "Ana Pérez" }],
    ["email", { email: "otra@example.com" }],
    ["phone", { phone: "+51999888777" }],
    ["destination", { destination: "rio" as const }],
  ])("the submission hash changes when %s changes", async (_field, change) => {
    const base = (await capture()).params[11];
    const changed = (await capture({ ...INPUT, ...change })).params[11];

    expect(changed).not.toBe(base);
    expect(changed).toBe(expectedHash({ ...INPUT, ...change }));
  });

  it("the submission hash ignores the submissionId", async () => {
    const base = (await capture()).params[11];
    const other = (await capture({ ...INPUT, submissionId: "6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f" })).params[11];
    expect(other).toBe(base);
  });

  it.each([
    ["the same key with the same data", "duplicate", () => expectedHash(INPUT)],
    ["the 10-minute phone window", "duplicate", () => null],
    ["a concurrent insert of the same key", "duplicate", () => null],
    ["the same key with other data", "conflict", () => "f".repeat(64)],
  ])("maps %s to %s", async (_case, expected, existingHash) => {
    const rows = [{ created: false, existing_hash: existingHash() }];
    expect((await capture(INPUT, rows)).result).toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    stubDb({ failWith: failure });
    await expect(createWebLead(INPUT)).rejects.toMatchObject({ cause: failure });
  });
});
