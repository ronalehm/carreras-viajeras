// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { REGISTRATION_CONSENT } from "@/lib/registrationConsent";
import type { WebLeadInput } from "../types/webLeads.types";
import { createWebLead } from "./webLeads.service";

type Query = { sql: string; params: unknown[] };
type Submission = Omit<WebLeadInput, "turnstileToken">;

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
const INPUT: Submission = {
  fullName: "Ana María Pérez",
  email: "ana@example.com",
  phone: "+51938127170",
  destination: "maraton-santiago-2027",
  marketingOptIn: false,
  form: "contact",
  submissionId: SUBMISSION_ID,
  campaignCode: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referredBy: null,
};
const ATTRIBUTED: Submission = {
  ...INPUT,
  marketingOptIn: true,
  campaignCode: "mml26",
  utmSource: "instagram",
  utmMedium: "social",
  utmCampaign: "preventa",
  referredBy: "club-lima",
};

const expectedHash = (input: Submission) =>
  createHash("sha256")
    .update(JSON.stringify([input.fullName, input.email, input.phone, input.destination, input.marketingOptIn]))
    .digest("hex");

const row = (overrides: Record<string, unknown> = {}) => ({
  created: false,
  existing_hash: null,
  repeated_before: false,
  repeated: false,
  trip_ok: true,
  ...overrides,
});

// Parameter positions for a catalog slug (rio/roma add the destination_text of same_person at 6).
const P = {
  existingKey: 0,
  repeatedKey: 1,
  tripSlug: 2,
  checksSlug: 3,
  campaignCode: 4,
  personEmail: 5,
  fullName: 6,
  phone: 7,
  email: 8,
  destinationText: 9,
  source: 10,
  utmSource: 11,
  utmMedium: 12,
  utmCampaign: 13,
  referredBy: 14,
  consentVersion: 15,
  marketingOptIn: 16,
  idempotencyKey: 17,
  submissionHash: 18,
  eventForm: 19,
  note: 20,
  activityKey: 21,
} as const;

async function capture(input: Submission = INPUT, rows: unknown[] = [row({ created: true })]) {
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
    expect(statement).toContain("repeated_before AS ( SELECT 1 FROM lead_activities WHERE submission_id = $2::uuid )");
    expect(statement).toContain("trip AS ( SELECT id FROM trips WHERE slug = $3::text AND status = 'published' )");
    expect(statement).toContain("checks AS ( SELECT ($4::text IS NULL OR EXISTS (SELECT 1 FROM trip)) AS trip_ok )");
    expect(statement).toContain(
      "fresh AS ( SELECT 1 FROM checks WHERE trip_ok AND NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM repeated_before) )",
    );
    expect(statement).toContain(
      "new_lead AS ( INSERT INTO leads ( full_name, phone, email, trip_id, destination_text, source, channel, origin_detail, campaign_id, utm_source, utm_medium, utm_campaign, referred_by, consent_version, marketing_opt_in_at, idempotency_key, submission_hash ) SELECT $7, $8, $9, (SELECT id FROM trip), $10::text, $11::lead_source, coalesce((SELECT channel FROM campaign), 'web'::lead_channel), (SELECT detail FROM campaign), (SELECT id FROM campaign), $12::text, $13::text, $14::text, $15::text, $16, CASE WHEN $17::boolean THEN now() END, $18::uuid, $19 FROM fresh WHERE NOT EXISTS (SELECT 1 FROM same_person) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, source )",
    );
    // No note and no author on the activity; the event payload is { source, form } only (no personal data).
    expect(statement).toContain(
      "activity AS ( INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead )",
    );
    expect(statement).toContain(
      "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.created', id, jsonb_build_object('source', source, 'form', $20::text) FROM new_lead )",
    );
    expect(statement).toMatch(
      /SELECT EXISTS \(SELECT 1 FROM new_lead\) AS created, \(SELECT submission_hash FROM existing\) AS existing_hash, EXISTS \(SELECT 1 FROM repeated_before\) AS repeated_before, EXISTS \(SELECT 1 FROM repeat\) AS repeated, \(SELECT trip_ok FROM checks\) AS trip_ok$/,
    );
    expect(params).toEqual([
      SUBMISSION_ID,
      SUBMISSION_ID,
      "maraton-santiago-2027",
      "maraton-santiago-2027",
      null,
      "ana@example.com",
      "Ana María Pérez",
      "+51938127170",
      "ana@example.com",
      null,
      "web_form",
      null,
      null,
      null,
      null,
      REGISTRATION_CONSENT.version,
      false,
      SUBMISSION_ID,
      expectedHash(INPUT),
      "contact",
      `Texto legal ${REGISTRATION_CONSENT.version} · Promociones: no`,
      SUBMISSION_ID,
    ]);
  });

  it.each(["registration", "contact"] as const)(
    "adds form %s to the lead.created payload as a SQL parameter, outside the submission hash",
    async (form) => {
      const { statement, params } = await capture({ ...INPUT, form });

      expect(params[P.eventForm]).toBe(form);
      expect(statement).toContain("jsonb_build_object('source', source, 'form', $20::text)");
      expect(statement).not.toContain(`'${form}'`);
      expect(params[P.submissionHash]).toBe(expectedHash(INPUT));
    },
  );

  it("stores the versioned legal text, never the old web-form-v1", async () => {
    const { params } = await capture();
    expect(params[P.consentVersion]).toBe(REGISTRATION_CONSENT.version);
    expect(params).not.toContain("web-form-v1");
  });

  it("passes the UTM values, ref, campaign code and promotions choice of the submission", async () => {
    const { params } = await capture(ATTRIBUTED);

    expect(params[P.campaignCode]).toBe("mml26");
    expect(params[P.utmSource]).toBe("instagram");
    expect(params[P.utmMedium]).toBe("social");
    expect(params[P.utmCampaign]).toBe("preventa");
    expect(params[P.referredBy]).toBe("club-lima");
    expect(params[P.marketingOptIn]).toBe(true);
  });

  it("sets marketing_opt_in_at only when the promotions checkbox was checked", async () => {
    const { statement } = await capture();
    expect(statement).toContain("CASE WHEN $17::boolean THEN now() END");
    expect((await capture({ ...INPUT, marketingOptIn: false })).params[P.marketingOptIn]).toBe(false);
    expect((await capture({ ...INPUT, marketingOptIn: true })).params[P.marketingOptIn]).toBe(true);
  });

  it("applies a campaign only if it is active and belongs to the published trip; otherwise channel = 'web'", async () => {
    const { statement } = await capture(ATTRIBUTED);

    expect(statement).toContain(
      "campaign AS ( SELECT id, code, name, channel, coalesce(event_name, name) AS detail FROM campaigns WHERE code = $5::text AND status = 'active' AND trip_id = (SELECT id FROM trip) )",
    );
    expect(statement).toContain("coalesce((SELECT channel FROM campaign), 'web'::lead_channel)");
  });

  it("never writes the stage, an owner, an author, the referral permission or the consent date", async () => {
    const { statement, params } = await capture({
      ...INPUT,
      stage: "paid",
      ownerUserId: "staff-1",
      channel: "event",
      campaignId: "6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f",
    } as never);

    expect(statement).not.toMatch(/stage|owner_user_id|created_by|actor_user_id|referral_permission|consented_at/);
    expect(params).not.toContain("paid");
    expect(params).not.toContain("staff-1");
    expect(params).not.toContain("event");
    expect(params).not.toContain("6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f");
  });

  it("looks for the same person by email, race and archived_at, never by phone", async () => {
    const { statement, params } = await capture();

    expect(statement).toContain(
      "same_person AS ( SELECT id FROM leads WHERE email = $6::text AND archived_at IS NULL AND trip_id = (SELECT id FROM trip) ORDER BY created_at, id LIMIT 1 )",
    );
    expect(params[P.personEmail]).toBe("ana@example.com");
    expect(statement).not.toMatch(/phone =|interval|10 minutes/);
  });

  it("on the same person, inserts a re_registered activity with the submission key and the note, without touching leads", async () => {
    const { result, statement, params } = await capture(ATTRIBUTED, [row({ repeated: true })]);

    expect(result).toBe("existing");
    expect(statement).toContain(
      "repeat AS ( INSERT INTO lead_activities (lead_id, type, body, submission_id) SELECT same_person.id, 're_registered', left(concat_ws(' · ', 'Volvió a registrarse desde la web', 'Campaña: ' || (SELECT name || ' (' || code || ')' FROM campaign), $21::text), 500), $22::uuid FROM same_person, fresh ON CONFLICT (submission_id) DO NOTHING RETURNING lead_id )",
    );
    expect(params[P.note]).toBe(
      `UTM: instagram / social / preventa · Ref: club-lima · Texto legal ${REGISTRATION_CONSENT.version} · Promociones: sí`,
    );
    expect(params[P.activityKey]).toBe(SUBMISSION_ID);
    // The existing lead is never updated and the repeated registration emits no outbox event.
    expect(statement).not.toMatch(/UPDATE/);
    expect(statement.match(/INSERT INTO outbox_events/g)).toHaveLength(1);
    expect(statement).toContain(
      "SELECT 'lead.created', id, jsonb_build_object('source', source, 'form', $20::text) FROM new_lead",
    );
  });

  it.each([
    ["rio", "Río de Janeiro"],
    ["roma", "Roma"],
  ] as const)("%s has no catalog slug: null slug, destination_text %s and same person by that text", async (destination, name) => {
    const { statement, params } = await capture({ ...INPUT, destination });

    expect(params[P.tripSlug]).toBeNull();
    expect(params[P.checksSlug]).toBeNull();
    expect(statement).toContain(
      "same_person AS ( SELECT id FROM leads WHERE email = $6::text AND archived_at IS NULL AND trip_id IS NULL AND destination_text = $7::text ORDER BY created_at, id LIMIT 1 )",
    );
    expect(params[6]).toBe(name);
    // Shifted by one: destination_text of the new lead.
    expect(params[P.destinationText + 1]).toBe(name);
  });

  it("resolves any other destination as the slug of a published trip, without destination_text", async () => {
    const { params } = await capture({ ...INPUT, destination: "constructor" });

    expect(params[P.tripSlug]).toBe("constructor");
    expect(params[P.destinationText]).toBeNull();
  });

  it("the submission hash is 64 hex characters, stable for the same data", async () => {
    const first = (await capture()).params[P.submissionHash];
    const second = (await capture({ ...INPUT })).params[P.submissionHash];

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(expectedHash(INPUT));
    expect(second).toBe(first);
  });

  it.each([
    ["fullName", { fullName: "Ana Pérez" }],
    ["email", { email: "otra@example.com" }],
    ["phone", { phone: "+51999888777" }],
    ["destination", { destination: "rio" }],
    ["marketingOptIn", { marketingOptIn: true }],
  ])("the submission hash changes when %s changes", async (field, change) => {
    const base = (await capture()).params[P.submissionHash];
    const { params } = await capture({ ...INPUT, ...change });
    const changed = params[field === "destination" ? P.submissionHash + 1 : P.submissionHash];

    expect(changed).not.toBe(base);
    expect(changed).toBe(expectedHash({ ...INPUT, ...change }));
  });

  it("the submission hash ignores the attribution and the submissionId", async () => {
    const base = (await capture()).params[P.submissionHash];
    const attributed = (await capture({ ...ATTRIBUTED, marketingOptIn: false })).params[P.submissionHash];
    const other = (await capture({ ...INPUT, submissionId: "6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f" })).params[
      P.submissionHash
    ];

    expect(attributed).toBe(base);
    expect(other).toBe(base);
  });

  it.each<[string, () => Record<string, unknown>, string]>([
    ["a new lead", () => ({ created: true }), "created"],
    ["the same key with the same data", () => ({ existing_hash: expectedHash(INPUT) }), "duplicate"],
    ["the same key with other data", () => ({ existing_hash: "f".repeat(64) }), "conflict"],
    ["a repeated registration of the same person", () => ({ repeated: true }), "existing"],
    ["a key already used by a repeated registration", () => ({ repeated_before: true }), "duplicate"],
    ["an unpublished trip slug", () => ({ trip_ok: false }), "unknown_trip"],
    ["a concurrent insert of the same key", () => ({}), "duplicate"],
  ])("maps %s to %s", async (_case, overrides, expected) => {
    expect((await capture(INPUT, [row(overrides())])).result).toBe(expected);
  });

  it("checks the key before the trip: a known key on an unpublished trip is still duplicate or conflict", async () => {
    const rows = [row({ existing_hash: expectedHash(INPUT), trip_ok: false })];
    expect((await capture(INPUT, rows)).result).toBe("duplicate");
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    stubDb({ failWith: failure });
    await expect(createWebLead(INPUT)).rejects.toMatchObject({ cause: failure });
  });
});
