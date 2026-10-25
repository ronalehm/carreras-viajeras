// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { CreateIntegrationLeadInput } from "../types/integrations.types";
import { deriveIdempotencyKey, hashSubmission } from "../utils/leadKeys";
import { createIntegrationLead, getIntegrationLead } from "./integrationLeads.service";

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
  return { queries };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const LEAD_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

// Lead row in select order (array mode): id, full_name, email, phone, stage, source, trip slug/title,
// destination_text, owner email, archived_at, created_at, channel, origin_detail, contact_preference,
// next_action_date, contact_opt_out_at.
function leadRow(overrides: unknown[] = []) {
  const row: unknown[] = [
    LEAD_ID,
    "Ana María Pérez",
    "ana@example.com",
    "+51938127170",
    "quoted",
    "web_form",
    "maraton-santiago-2027",
    "Maratón de Santiago 42K 2027",
    null,
    "comercial@example.com",
    null,
    "2026-10-18 17:00:00+00",
    "event",
    "Media Maratón de Lima 2026",
    "email",
    "2026-10-20",
    null,
  ];
  overrides.forEach((value, position) => {
    if (value !== undefined) row[position] = value;
  });
  return row;
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getIntegrationLead", () => {
  it("selects only the contract columns, with LEFT JOINs to trips and the owner profile", async () => {
    const fake = useFakeDb();
    await getIntegrationLead(LEAD_ID);

    expect(normalize(fake.queries[0].sql)).toBe(
      'select "leads"."id", "leads"."full_name", "leads"."email", "leads"."phone", "leads"."stage", "leads"."source", "trips"."slug", "trips"."title", "leads"."destination_text", "profiles"."email", "leads"."archived_at", "leads"."created_at", "leads"."channel", "leads"."origin_detail", "leads"."contact_preference", "leads"."next_action_date", "leads"."contact_opt_out_at" from "leads" left join "trips" on "trips"."id" = "leads"."trip_id" left join "profiles" on "profiles"."user_id" = "leads"."owner_user_id" where "leads"."id" = $1 limit $2',
    );
    expect(fake.queries[0].params).toEqual([LEAD_ID, 1]);
    const selectList = normalize(fake.queries[0].sql).split(" from ")[0];
    for (const hidden of [
      "location",
      "next_action_note",
      "consent",
      "created_by",
      "user_id",
      "archived_by",
      "lost_reason",
      "referred_by",
      "referral_permission",
      "utm_",
      "idempotency_key",
      "submission_hash",
    ]) {
      expect(selectList).not.toContain(hidden);
    }
    expect(fake.queries[0].sql).not.toContain("lead_activities");
  });

  it("returns exactly the contract fields", async () => {
    useFakeDb({ responses: [[leadRow()]] });
    const lead = await getIntegrationLead(LEAD_ID);

    expect(lead).toEqual({
      id: LEAD_ID,
      fullName: "Ana María Pérez",
      firstName: "Ana",
      email: "ana@example.com",
      phone: "+51938127170",
      stage: "quoted",
      source: "web_form",
      trip: { slug: "maraton-santiago-2027", title: "Maratón de Santiago 42K 2027" },
      destinationText: null,
      owner: { email: "comercial@example.com" },
      archived: false,
      createdAt: "2026-10-18T17:00:00.000Z",
      channel: "event",
      originDetail: "Media Maratón de Lima 2026",
      contactPreference: "email",
      nextActionDate: "2026-10-20",
      doNotContact: false,
    });
    expect(Object.keys(lead ?? {}).sort()).toEqual([
      "archived",
      "channel",
      "contactPreference",
      "createdAt",
      "destinationText",
      "doNotContact",
      "email",
      "firstName",
      "fullName",
      "id",
      "nextActionDate",
      "originDetail",
      "owner",
      "phone",
      "source",
      "stage",
      "trip",
    ]);
  });

  it("marks an opted-out lead as doNotContact and maps a missing origin detail, preference and next action to null", async () => {
    useFakeDb({
      responses: [
        [
          leadRow([
            ...Array(11).fill(undefined),
            "2026-10-18 17:30:00+00",
            "unknown",
            null,
            null,
            null,
            "2026-10-19 15:00:00+00",
          ]),
        ],
      ],
    });
    await expect(getIntegrationLead(LEAD_ID)).resolves.toMatchObject({
      channel: "unknown",
      originDetail: null,
      contactPreference: null,
      nextActionDate: null,
      doNotContact: true,
    });
  });

  it.each([
    ["Luis", "Luis"],
    ["Ana María Pérez", "Ana"],
    ["  José   Luis\tGarcía ", "José"],
  ])("firstName of %j is %j", async (fullName, firstName) => {
    useFakeDb({ responses: [[leadRow([undefined, fullName])]] });
    await expect(getIntegrationLead(LEAD_ID)).resolves.toMatchObject({ fullName, firstName });
  });

  it("maps a missing email, trip and owner to null, and an archived lead to archived: true", async () => {
    useFakeDb({
      responses: [[leadRow([undefined, undefined, null, undefined, "lost", "whatsapp", null, null, "Panamá", null, "2026-10-18 17:30:00+00"])]],
    });
    await expect(getIntegrationLead(LEAD_ID)).resolves.toMatchObject({
      email: null,
      trip: null,
      destinationText: "Panamá",
      owner: null,
      archived: true,
      stage: "lost",
      source: "whatsapp",
    });
  });

  it("returns null without rows", async () => {
    useFakeDb({ responses: [[]] });
    await expect(getIntegrationLead(LEAD_ID)).resolves.toBeNull();
  });
});

describe("createIntegrationLead", () => {
  const input: CreateIntegrationLeadInput = {
    source: "google_form",
    externalId: "sheet-1:42",
    consentVersion: "google-form-v1",
    consentedAt: "2026-09-14T08:12:00-05:00",
    fullName: "Ana Pérez",
    phone: "+51938127170",
    email: "ana@example.com",
    tripSlug: "maraton-santiago-2027",
    destinationText: null,
    channel: "instagram",
    originDetail: "Historia de Instagram",
    referredBy: null,
    contactPreference: "whatsapp",
  };
  const NEW_ID = "9b2d7c1e-4a5f-4e3d-8c2b-1a0f9e8d7c6b";
  const OTHER_ID = "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b";

  async function expectedHash(value: CreateIntegrationLeadInput) {
    return hashSubmission([
      value.consentVersion,
      new Date(value.consentedAt).toISOString(),
      value.fullName,
      value.phone,
      value.email,
      value.tripSlug,
      value.destinationText,
      value.channel,
      value.originDetail,
      value.referredBy,
      value.contactPreference,
    ]);
  }

  const resultRow = (overrides: Record<string, unknown> = {}) => ({
    created_id: null,
    existing_id: null,
    existing_hash: null,
    phone_id: null,
    trip_ok: true,
    ...overrides,
  });

  it("inserts the lead, its created activity and its lead.created event in a single statement", async () => {
    const fake = useFakeDb({ responses: [[resultRow({ created_id: NEW_ID })]] });

    await expect(createIntegrationLead(input)).resolves.toEqual({ status: "created", leadId: NEW_ID });

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toMatch(
      /^WITH existing AS \( SELECT id, submission_hash FROM leads WHERE idempotency_key = \$1::uuid \), same_phone AS \( SELECT id FROM leads WHERE phone = \$2 AND \(archived_at IS NULL OR contact_opt_out_at IS NOT NULL\) ORDER BY created_at, id LIMIT 1 \), trip AS \( SELECT id FROM trips WHERE slug = \$3 AND status <> 'archived' \), checks AS \( SELECT \(\$4::text IS NULL OR EXISTS \(SELECT 1 FROM trip\)\) AS trip_ok \),/,
    );
    // No owner, no author and no stage (default 'new'): system lead.
    expect(statement).toContain(
      "new_lead AS ( INSERT INTO leads ( full_name, phone, email, trip_id, destination_text, source, channel, origin_detail, referred_by, contact_preference, consent_version, consented_at, idempotency_key, submission_hash ) SELECT $5, $6, $7, (SELECT id FROM trip), $8, $9::lead_source, $10::lead_channel, $11, $12, $13::contact_preference, $14, $15::timestamptz, $16::uuid, $17 FROM checks WHERE trip_ok AND NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM same_phone) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, source )",
    );
    const insertedColumns = statement.split("INSERT INTO leads (")[1].split(")")[0];
    for (const column of ["owner_user_id", "created_by", "stage", "utm_", "referral_permission", "contact_opt_out_at"]) {
      expect(insertedColumns).not.toContain(column);
    }
    expect(statement).toContain(
      "activity AS ( INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead )",
    );
    expect(statement).toContain(
      "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.created', id, jsonb_build_object('source', source, 'bulk', $18::boolean) FROM new_lead )",
    );
    expect(statement).toMatch(
      /SELECT \(SELECT id FROM new_lead\) AS created_id, \(SELECT id FROM existing\) AS existing_id, \(SELECT submission_hash FROM existing\) AS existing_hash, \(SELECT id FROM same_phone\) AS phone_id, trip_ok FROM checks$/,
    );

    const key = await deriveIdempotencyKey("google_form", "sheet-1:42");
    expect(fake.queries[0].params).toEqual([
      key,
      "+51938127170",
      "maraton-santiago-2027",
      "maraton-santiago-2027",
      "Ana Pérez",
      "+51938127170",
      "ana@example.com",
      null,
      "google_form",
      "instagram",
      "Historia de Instagram",
      null,
      "whatsapp",
      "google-form-v1",
      "2026-09-14T08:12:00-05:00",
      key,
      await expectedHash(input),
      false,
    ]);
  });

  it("sends bulk true only for the one-off import, with its own derived key", async () => {
    const fake = useFakeDb({ responses: [[resultRow({ created_id: NEW_ID })]] });
    const row: CreateIntegrationLeadInput = {
      ...input,
      source: "import",
      externalId: "mml-2026:17",
      consentVersion: "import-mml-v1",
      channel: "event",
    };

    await createIntegrationLead(row);

    const params = fake.queries[0].params;
    expect(params[8]).toBe("import");
    expect(params[17]).toBe(true);
    expect(params[0]).toBe(await deriveIdempotencyKey("import", "mml-2026:17"));
    expect(params[0]).not.toBe(await deriveIdempotencyKey("google_form", "mml-2026:17"));
  });

  it("passes a null trip slug when the record has no trip", async () => {
    const fake = useFakeDb({ responses: [[resultRow({ created_id: NEW_ID })]] });

    await createIntegrationLead({ ...input, tripSlug: null, destinationText: "Santiago" });

    expect(fake.queries[0].params.slice(2, 4)).toEqual([null, null]);
    expect(fake.queries[0].params[7]).toBe("Santiago");
  });

  it("returns duplicate with the lead id for the same key and the same data", async () => {
    useFakeDb({ responses: [[resultRow({ existing_id: OTHER_ID, existing_hash: await expectedHash(input), phone_id: OTHER_ID })]] });
    await expect(createIntegrationLead(input)).resolves.toEqual({ status: "duplicate", leadId: OTHER_ID });
  });

  it("returns conflict for the same key with different data", async () => {
    useFakeDb({ responses: [[resultRow({ existing_id: OTHER_ID, existing_hash: "0".repeat(64), phone_id: OTHER_ID })]] });
    await expect(createIntegrationLead({ ...input, fullName: "Ana María Pérez" })).resolves.toEqual({ status: "conflict" });
  });

  it("returns existing with the lead that already has the phone", async () => {
    useFakeDb({ responses: [[resultRow({ phone_id: OTHER_ID, trip_ok: false })]] });
    await expect(createIntegrationLead(input)).resolves.toEqual({ status: "existing", leadId: OTHER_ID });
  });

  it("returns unknown_trip when the slug is not a non-archived trip", async () => {
    useFakeDb({ responses: [[resultRow({ trip_ok: false })]] });
    await expect(createIntegrationLead({ ...input, tripSlug: "no-existe" })).resolves.toEqual({ status: "unknown_trip" });
  });

  it("returns duplicate without lead id when a concurrent request won the key", async () => {
    useFakeDb({ responses: [[resultRow()]] });
    await expect(createIntegrationLead(input)).resolves.toEqual({ status: "duplicate", leadId: null });
  });

  it("hashes the same consent instant the same way whatever its offset, and changes with the data", async () => {
    const fake = useFakeDb({ responses: [[resultRow()], [resultRow()], [resultRow()]] });
    await createIntegrationLead(input);
    await createIntegrationLead({ ...input, consentedAt: "2026-09-14T13:12:00Z" });
    await createIntegrationLead({ ...input, originDetail: "Reel de Instagram" });

    // params[14] is consented_at as received; params[16] is submission_hash.
    expect(fake.queries[0].params[14]).toBe("2026-09-14T08:12:00-05:00");
    expect(fake.queries[1].params[14]).toBe("2026-09-14T13:12:00Z");
    expect(fake.queries[1].params[16]).toBe(fake.queries[0].params[16]);
    expect(fake.queries[2].params[16]).not.toBe(fake.queries[0].params[16]);
  });
});
