// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { getIntegrationLead } from "./integrationLeads.service";

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
// destination_text, owner email, archived_at, created_at.
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
      'select "leads"."id", "leads"."full_name", "leads"."email", "leads"."phone", "leads"."stage", "leads"."source", "trips"."slug", "trips"."title", "leads"."destination_text", "profiles"."email", "leads"."archived_at", "leads"."created_at" from "leads" left join "trips" on "trips"."id" = "leads"."trip_id" left join "profiles" on "profiles"."user_id" = "leads"."owner_user_id" where "leads"."id" = $1 limit $2',
    );
    expect(fake.queries[0].params).toEqual([LEAD_ID, 1]);
    const selectList = normalize(fake.queries[0].sql).split(" from ")[0];
    for (const hidden of ["location", "next_action", "consent", "created_by", "user_id", "archived_by", "lost_reason"]) {
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
    });
    expect(Object.keys(lead ?? {}).sort()).toEqual(
      ["archived", "createdAt", "destinationText", "email", "firstName", "fullName", "id", "owner", "phone", "source", "stage", "trip"],
    );
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
