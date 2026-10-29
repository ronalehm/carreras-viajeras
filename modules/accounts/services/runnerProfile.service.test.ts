// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
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

// Column list of the INSERT, the SET clause of the ON CONFLICT, and both parameter lists.
function splitUpsert({ sql, params }: Query) {
  const statement = normalize(sql);
  const match = statement.match(
    /^insert into "runner_profiles" \((.+?)\) values \((.+?)\) on conflict \("user_id"\) do update set (.+)$/,
  );
  expect(match).not.toBeNull();
  const [, columns, values, set] = match!;
  const insertColumns = columns.split(", ").map((column) => column.replaceAll('"', ""));
  const insertValues = values.split(", ");
  const setPairs = Object.fromEntries(
    set.split(", ").map((pair) => {
      const [column, value] = pair.split(" = ");
      return [column.replaceAll('"', ""), value];
    }),
  );
  const param = (placeholder: string) => params[Number(placeholder.slice(1)) - 1];
  return { insertColumns, insertValues, setPairs, param };
}

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
  it("runs a single upsert keyed by the user_id parameter", async () => {
    const fake = useFakeDb();
    await saveRunnerProfile(USER, EMAIL, input);

    expect(fake.queries).toHaveLength(1);
    expect(fake.transaction).not.toHaveBeenCalled();
    const { insertColumns, insertValues, param } = splitUpsert(fake.queries[0]);
    expect(insertColumns[0]).toBe("user_id");
    expect(param(insertValues[0])).toBe(USER);
    expect(param(insertValues[insertColumns.indexOf("email")])).toBe(EMAIL);
  });

  it("inserts every field, the consent version and consented_at = now()", async () => {
    const fake = useFakeDb();
    await saveRunnerProfile(USER, EMAIL, input);

    const { insertColumns, insertValues, param } = splitUpsert(fake.queries[0]);
    const inserted = Object.fromEntries(
      insertColumns.map((column, index) => {
        const value = insertValues[index];
        return [column, value.startsWith("$") ? param(value) : value];
      }),
    );
    expect(inserted).toEqual({
      user_id: USER,
      email: EMAIL,
      full_name: "Ana Pérez",
      phone: "+51938127170",
      country: "Perú",
      city: "Lima",
      birth_date: "1990-04-12",
      document_type: "passport",
      document_number: "AB123456",
      document_expires_on: "2030-01-31",
      shirt_size: "m",
      preferred_distance: "42k",
      personal_best: "42K en 3:45:10",
      club: "Lima Runners",
      emergency_contact_name: "Luis Pérez",
      emergency_contact_phone: "+51999888777",
      medical_notes: "Alergia a la penicilina.",
      consent_version: RUNNER_PROFILE_CONSENT.version,
      consented_at: "now()",
      created_at: "default",
      updated_at: "default",
    });
  });

  it("updates the fields, email, consent and timestamps but never user_id or created_at", async () => {
    const fake = useFakeDb();
    await saveRunnerProfile(USER, EMAIL, input);

    const { setPairs, param } = splitUpsert(fake.queries[0]);
    expect(setPairs).not.toHaveProperty("user_id");
    expect(setPairs).not.toHaveProperty("created_at");
    expect(setPairs.consented_at).toBe("now()");
    expect(setPairs.updated_at).toBe("now()");
    expect(param(setPairs.email)).toBe(EMAIL);
    expect(param(setPairs.consent_version)).toBe(RUNNER_PROFILE_CONSENT.version);
    expect(param(setPairs.document_number)).toBe("AB123456");
    expect(Object.keys(setPairs).sort()).toEqual(
      [
        "email", "full_name", "phone", "country", "city", "birth_date", "document_type", "document_number",
        "document_expires_on", "shirt_size", "preferred_distance", "personal_best", "club",
        "emergency_contact_name", "emergency_contact_phone", "medical_notes", "consent_version",
        "consented_at", "updated_at",
      ].sort(),
    );
  });

  it("writes nulls for the empty optional fields", async () => {
    const fake = useFakeDb();
    const minimal: RunnerProfileInput = {
      ...input,
      country: null, city: null, birthDate: null, documentType: null, documentNumber: null,
      documentExpiresOn: null, shirtSize: null, preferredDistance: null, personalBest: null, club: null,
      emergencyContactName: null, emergencyContactPhone: null, medicalNotes: null,
    };
    await saveRunnerProfile(USER, EMAIL, minimal);

    const { setPairs, param } = splitUpsert(fake.queries[0]);
    expect(param(setPairs.medical_notes)).toBeNull();
    expect(param(setPairs.document_type)).toBeNull();
  });

  it("ignores extra keys of the input such as userId, email or consentVersion", async () => {
    const fake = useFakeDb();
    const tampered = {
      ...input,
      userId: "user-b",
      email: "other@example.com",
      consentVersion: "forged",
      createdAt: new Date("2020-01-01T00:00:00Z"),
    } as RunnerProfileInput;
    await saveRunnerProfile(USER, EMAIL, tampered);

    const [upsert] = fake.queries;
    expect(upsert.params).not.toContain("user-b");
    expect(upsert.params).not.toContain("other@example.com");
    expect(upsert.params).not.toContain("forged");
    const { insertColumns, insertValues, param } = splitUpsert(upsert);
    expect(param(insertValues[insertColumns.indexOf("user_id")])).toBe(USER);
    expect(insertValues[insertColumns.indexOf("created_at")]).toBe("default");
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
