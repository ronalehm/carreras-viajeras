// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { createEmbeddedDb } from "@/lib/testing/embeddedDb";
import type { RunnerProfileInput } from "../types/runnerProfile.types";
import { RUNNER_PROFILE_CONSENT } from "../utils/runnerProfileDisplay";
import { getRunnerProfile, saveRunnerProfile } from "./runnerProfile.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (pattern of staff.service.test.ts): records every statement and answers
// each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction }) as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const USER = "user-a";
const EMAIL = "ana@example.com";

const input: RunnerProfileInput = {
  fullName: "Ana Pérez",
  phone: "+51938127170",
  country: "Perú",
  city: "Lima",
  birthDate: "1990-04-12",
  documentType: "passport",
  documentNumber: "AB123456",
  documentExpiresOn: "2030-01-31",
  shirtSize: "m",
  preferredDistance: "42k",
  personalBest: "42K en 3:45:10",
  club: "Lima Runners",
  emergencyContactName: "Luis Pérez",
  emergencyContactPhone: "+51999888777",
  medicalNotes: "Alergia a la penicilina.",
};

// Row in select order; Postgres sends timestamps as text.
const ROW = [
  EMAIL, "Ana Pérez", "+51938127170", "Perú", "Lima", "1990-04-12", "passport", "AB123456", "2030-01-31",
  "m", "42k", "42K en 3:45:10", "Lima Runners", "Luis Pérez", "+51999888777", "Alergia a la penicilina.",
  RUNNER_PROFILE_CONSENT.version, "2026-10-20 15:00:00+00", "2026-10-25 15:00:00+00",
];

beforeEach(() => vi.mocked(getDb).mockReset());
afterEach(() => vi.restoreAllMocks());

describe("getRunnerProfile", () => {
  it("selects only this user's row", async () => {
    const fake = useFakeDb({ responses: [[ROW]] });
    await getRunnerProfile(USER);

    expect(fake.queries).toHaveLength(1);
    expect(fake.transaction).not.toHaveBeenCalled();
    const [select] = fake.queries;
    expect(normalize(select.sql)).toMatch(/^select .* from "runner_profiles" where "runner_profiles"\."user_id" = \$1$/);
    expect(select.params).toEqual([USER]);
  });

  it("maps the row to a RunnerProfile", async () => {
    useFakeDb({ responses: [[ROW]] });
    await expect(getRunnerProfile(USER)).resolves.toEqual({
      email: EMAIL,
      ...input,
      consentVersion: RUNNER_PROFILE_CONSENT.version,
      consentedAt: new Date("2026-10-20T15:00:00Z"),
      updatedAt: new Date("2026-10-25T15:00:00Z"),
    });
  });

  it("returns null when the user has no profile yet", async () => {
    useFakeDb();
    await expect(getRunnerProfile(USER)).resolves.toBeNull();
  });
});

describe("saveRunnerProfile", () => {
  it("runs a single statement, never an interactive transaction", async () => {
    const fake = useFakeDb();
    await saveRunnerProfile(USER, EMAIL, input);

    expect(fake.queries).toHaveLength(1);
    expect(fake.transaction).not.toHaveBeenCalled();
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toMatch(/^WITH saved AS \( INSERT INTO runner_profiles /);
    expect(statement).toContain("ON CONFLICT (user_id) DO UPDATE SET");
    expect(statement).toContain("(xmax = 0) AS inserted");
    expect(fake.queries[0].params[0]).toBe(USER);
  });

  it("never copies documents, birth date, emergency contact or medical notes into the lead", async () => {
    const fake = useFakeDb();
    await saveRunnerProfile(USER, EMAIL, input);

    const statement = normalize(fake.queries[0].sql);
    const leadInsert = statement.match(/INSERT INTO leads \(([^)]+)\) SELECT (.+?) FROM first_save/);
    expect(leadInsert).not.toBeNull();
    expect(leadInsert![1].split(", ")).toEqual(["full_name", "phone", "email", "source", "channel", "consent_version"]);
    const firstSave = statement.match(/first_save AS \( SELECT (.+?) FROM saved WHERE inserted \)/);
    expect(firstSave![1]).toBe("full_name, phone, lower(email) AS email, consent_version");
  });

  it("propagates database errors without wrapping them in its own error and without logging", async () => {
    const consoleSpies = (["error", "warn", "log", "info", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const failure = new Error('new row violates check constraint "runner_profiles_document_chk"');
    useFakeDb({ failWith: failure });

    const saving = saveRunnerProfile(USER, EMAIL, input);
    // Drizzle wraps it in DrizzleQueryError (its message lists the params: sensitive values) with the
    // original as `cause`; the service adds nothing of its own and never logs.
    await expect(saving).rejects.toSatisfy((error: unknown) => error === failure || (error as Error).cause === failure);
    await expect(getRunnerProfile(USER)).rejects.toSatisfy(
      (error: unknown) => error === failure || (error as Error).cause === failure,
    );
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("saveRunnerProfile against PostgreSQL", () => {
  let embedded: Awaited<ReturnType<typeof createEmbeddedDb>>;
  const ADMIN = "user-admin";

  beforeAll(async () => {
    embedded = await createEmbeddedDb();
  }, 30000);
  afterAll(async () => {
    await embedded?.pg.close();
  });
  beforeEach(async () => {
    await embedded.pg.exec("TRUNCATE leads, runner_profiles, profiles RESTART IDENTITY CASCADE");
    await embedded.pg.exec(`INSERT INTO profiles (user_id, email) VALUES ('${ADMIN}', 'admin@example.com')`);
    vi.mocked(getDb).mockReturnValue(embedded.db as ReturnType<typeof getDb>);
  });

  async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await embedded.pg.query<T>(text, params)).rows;
  }

  async function seedLead(email: string, { archived = false, createdAt = "2026-10-01T00:00:00Z" } = {}) {
    const [lead] = await rows<{ id: string }>(
      `INSERT INTO leads (full_name, phone, email, source, consent_version, created_by, created_at, archived_at, archived_by)
       VALUES ('Ana P.', '+51911111111', $1, 'whatsapp', 'test-v1', $2, $3, $4, $5) RETURNING id`,
      [email, ADMIN, createdAt, archived ? "2026-10-02T00:00:00Z" : null, archived ? ADMIN : null],
    );
    return lead.id;
  }

  const activities = () =>
    rows<{ lead_id: string; type: string; body: string | null; actor_user_id: string | null }>(
      "SELECT lead_id, type, body, actor_user_id FROM lead_activities ORDER BY created_at, id",
    );
  const events = () =>
    rows<{ lead_id: string; type: string; payload: unknown }>("SELECT lead_id, type, payload FROM outbox_events");

  it("stores the profile as before: every field, the consent version and the session's ids", async () => {
    const tampered = {
      ...input,
      userId: "user-b",
      email: "other@example.com",
      consentVersion: "forged",
    } as RunnerProfileInput;
    await saveRunnerProfile(USER, EMAIL, tampered);

    const profile = await getRunnerProfile(USER);
    expect(profile).toMatchObject({ email: EMAIL, ...input, consentVersion: RUNNER_PROFILE_CONSENT.version });
    expect(await getRunnerProfile("user-b")).toBeNull();
  });

  it("updates every field on a later save but never user_id or created_at", async () => {
    await saveRunnerProfile(USER, EMAIL, input);
    const [before] = await rows<{ created_at: string; consented_at: string }>(
      "SELECT created_at::text, consented_at::text FROM runner_profiles WHERE user_id = $1",
      [USER],
    );
    const changed: RunnerProfileInput = {
      ...input,
      fullName: "Ana María Pérez",
      phone: "+51900000001",
      country: null, city: null, birthDate: null, documentType: null, documentNumber: null,
      documentExpiresOn: null, shirtSize: null, preferredDistance: null, personalBest: null, club: null,
      emergencyContactName: null, emergencyContactPhone: null, medicalNotes: null,
    };
    await saveRunnerProfile(USER, "ana.maria@example.com", changed);

    expect(await getRunnerProfile(USER)).toMatchObject({
      email: "ana.maria@example.com",
      ...changed,
      consentVersion: RUNNER_PROFILE_CONSENT.version,
    });
    const after = await rows<{ user_id: string; created_at: string; consented_at: string; updated_at: string }>(
      "SELECT user_id, created_at::text, consented_at::text, updated_at::text FROM runner_profiles",
    );
    expect(after).toHaveLength(1);
    expect(after[0].user_id).toBe(USER);
    expect(after[0].created_at).toBe(before.created_at);
    expect(after[0].consented_at >= before.consented_at).toBe(true);
    expect(after[0].updated_at >= before.created_at).toBe(true);
  });

  it("first save without a lead creates a runner_account lead, its created activity and its event", async () => {
    await saveRunnerProfile(USER, EMAIL, input);

    const leads = await rows<Record<string, unknown>>("SELECT * FROM leads");
    expect(leads).toHaveLength(1);
    const [lead] = leads;
    expect(lead).toMatchObject({
      full_name: "Ana Pérez",
      phone: "+51938127170",
      email: EMAIL,
      source: "runner_account",
      channel: "web",
      stage: "new",
      consent_version: RUNNER_PROFILE_CONSENT.version,
      owner_user_id: null,
      created_by: null,
      archived_at: null,
      trip_id: null,
      destination_text: null,
      location: null,
      next_action_note: null,
      idempotency_key: null,
    });

    expect(await activities()).toEqual([{ lead_id: lead.id, type: "created", body: null, actor_user_id: null }]);
    expect(await events()).toEqual([{ lead_id: lead.id, type: "lead.created", payload: { source: "runner_account" } }]);
  });

  it("copies no document, birth date, emergency contact or medical note into the lead, activity or event", async () => {
    await saveRunnerProfile(USER, EMAIL, input);

    const [{ dump }] = await rows<{ dump: string }>(`
      SELECT (SELECT json_agg(leads)::text FROM leads) || (SELECT json_agg(lead_activities)::text FROM lead_activities)
        || (SELECT json_agg(outbox_events)::text FROM outbox_events) AS dump`);
    for (const sensitive of ["AB123456", "passport", "2030-01-31", "1990-04-12", "Luis Pérez", "+51999888777", "penicilina", "Lima Runners", "3:45:10"]) {
      expect(dump).not.toContain(sensitive);
    }
  });

  it("a second save creates no lead, activity or event", async () => {
    await saveRunnerProfile(USER, EMAIL, input);
    await saveRunnerProfile(USER, EMAIL, { ...input, fullName: "Ana María Pérez" });

    expect(await rows("SELECT id FROM leads")).toHaveLength(1);
    expect(await activities()).toHaveLength(1);
    expect(await events()).toHaveLength(1);
    const [lead] = await rows<{ full_name: string }>("SELECT full_name FROM leads");
    expect(lead.full_name).toBe("Ana Pérez");
  });

  it("a later save touches no lead even when the first save found none to create", async () => {
    const existing = await seedLead(EMAIL);
    await saveRunnerProfile(USER, EMAIL, input);
    await saveRunnerProfile(USER, EMAIL, input);

    expect(await activities()).toEqual([
      { lead_id: existing, type: "re_registered", body: "Completó su perfil en la web", actor_user_id: null },
    ]);
  });

  it("first save with a non-archived lead of the same email only adds an activity to the most recent one", async () => {
    const older = await seedLead(EMAIL, { createdAt: "2026-09-01T00:00:00Z" });
    const newest = await seedLead(EMAIL, { createdAt: "2026-10-01T00:00:00Z" });
    await seedLead(EMAIL, { createdAt: "2026-10-15T00:00:00Z", archived: true });
    await seedLead("someone@example.com", { createdAt: "2026-10-20T00:00:00Z" });

    await saveRunnerProfile(USER, EMAIL, input);

    expect(await rows("SELECT id FROM leads")).toHaveLength(4);
    expect(await rows("SELECT id FROM leads WHERE source = 'runner_account'")).toHaveLength(0);
    expect(await activities()).toEqual([
      { lead_id: newest, type: "re_registered", body: "Completó su perfil en la web", actor_user_id: null },
    ]);
    expect(older).not.toBe(newest);
    expect(await events()).toEqual([]);
  });

  it("matches the lead by lowercase email; a mixed-case email never reaches the leads", async () => {
    // Both tables force lowercase emails (CHECK) and the session email is already lowercased, so a
    // lead with another capitalization cannot exist: a mixed-case profile email fails as a whole.
    await seedLead(EMAIL);
    await expect(saveRunnerProfile(USER, "Ana@Example.com", input)).rejects.toThrow();
    expect(await rows("SELECT user_id FROM runner_profiles")).toEqual([]);
    expect(await activities()).toEqual([]);

    await saveRunnerProfile(USER, EMAIL, input);
    expect(await activities()).toHaveLength(1);
    expect(await events()).toEqual([]);
  });

  it("first save with only an archived lead of the same email creates a new lead", async () => {
    const archived = await seedLead(EMAIL, { archived: true });
    await saveRunnerProfile(USER, EMAIL, input);

    const created = await rows<{ id: string }>("SELECT id FROM leads WHERE source = 'runner_account'");
    expect(created).toHaveLength(1);
    expect(created[0].id).not.toBe(archived);
    expect(await activities()).toEqual([
      { lead_id: created[0].id, type: "created", body: null, actor_user_id: null },
    ]);
    expect(await events()).toEqual([
      { lead_id: created[0].id, type: "lead.created", payload: { source: "runner_account" } },
    ]);
  });

  it("a failed profile save writes no lead, activity or event", async () => {
    await expect(saveRunnerProfile(USER, EMAIL, { ...input, documentNumber: "bad number!" })).rejects.toThrow();

    expect(await rows("SELECT user_id FROM runner_profiles")).toEqual([]);
    expect(await rows("SELECT id FROM leads")).toEqual([]);
    expect(await events()).toEqual([]);
  });
});
