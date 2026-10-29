// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { getCurrentExchangeRate, listExchangeRates, setExchangeRate } from "./exchangeRates.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (same pattern as campaigns.service.test.ts): records every statement and
// answers each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
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

const RATE_ID = "3c9f2a1b-7d4e-4f6a-8b2c-9e0d1f2a3b4c";
const OLDER_RATE_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ORDER = 'order by "exchange_rates"."created_at" desc, "exchange_rates"."id" desc';

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getCurrentExchangeRate", () => {
  it("reads the latest row in one query (created_at DESC, id DESC, LIMIT 1)", async () => {
    // numeric(10,4) arrives from Neon as text.
    const fake = useFakeDb({ responses: [[["3.7512", "2026-10-28 14:00:00+00"]]] });

    await expect(getCurrentExchangeRate()).resolves.toEqual({
      usdPen: "3.7512",
      effectiveFrom: new Date("2026-10-28T14:00:00Z"),
    });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select "usd_pen", "created_at" from "exchange_rates" ${ORDER} limit $1`,
    );
    expect(fake.queries[0].params).toEqual([1]);
  });

  it("returns the canonical 4-decimal text, exact to the ten-thousandth", async () => {
    useFakeDb({ responses: [[["10", "2026-10-28 14:00:00+00"]]] });
    await expect(getCurrentExchangeRate()).resolves.toMatchObject({ usdPen: "10.0000" });

    useFakeDb({ responses: [[["99.9999", "2026-10-28 14:00:00+00"]]] });
    await expect(getCurrentExchangeRate()).resolves.toMatchObject({ usdPen: "99.9999" });

    useFakeDb({ responses: [[["0.0001", "2026-10-28 14:00:00+00"]]] });
    await expect(getCurrentExchangeRate()).resolves.toMatchObject({ usdPen: "0.0001" });
  });

  it("returns null when no rate has been set yet", async () => {
    useFakeDb({ responses: [[]] });
    await expect(getCurrentExchangeRate()).resolves.toBeNull();
  });

  it("fails instead of returning a value outside the column's range", async () => {
    useFakeDb({ responses: [[["100.0000", "2026-10-28 14:00:00+00"]]] });
    await expect(getCurrentExchangeRate()).rejects.toThrow("invalid exchange rate row");
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(getCurrentExchangeRate()).rejects.toMatchObject({ cause: failure });
  });
});

describe("listExchangeRates", () => {
  it("reads the last 20 rates with who set them, newest first, in one query", async () => {
    const fake = useFakeDb({
      responses: [
        [
          [RATE_ID, "3.7512", "2026-10-28 14:00:00+00", "admin@example.com"],
          [OLDER_RATE_ID, "3.7500", "2026-10-01 09:30:00+00", "other-admin@example.com"],
        ],
      ],
    });

    await expect(listExchangeRates()).resolves.toEqual([
      {
        id: RATE_ID,
        usdPen: "3.7512",
        effectiveFrom: new Date("2026-10-28T14:00:00Z"),
        createdBy: { email: "admin@example.com" },
      },
      {
        id: OLDER_RATE_ID,
        usdPen: "3.7500",
        effectiveFrom: new Date("2026-10-01T09:30:00Z"),
        createdBy: { email: "other-admin@example.com" },
      },
    ]);

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select "exchange_rates"."id", "exchange_rates"."usd_pen", "exchange_rates"."created_at", "profiles"."email" from "exchange_rates" inner join "profiles" on "profiles"."user_id" = "exchange_rates"."created_by" ${ORDER} limit $1`,
    );
    expect(fake.queries[0].params).toEqual([20]);
  });

  it("returns an empty list when no rate has been set yet", async () => {
    useFakeDb({ responses: [[]] });
    await expect(listExchangeRates()).resolves.toEqual([]);
  });
});

describe("setExchangeRate", () => {
  it("inserts one row with the actor as author and returns its id", async () => {
    const fake = useFakeDb({ responses: [[[RATE_ID]]] });

    await expect(setExchangeRate("3.7512", "user-1")).resolves.toEqual({ id: RATE_ID });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'insert into "exchange_rates" ("id", "usd_pen", "created_by", "created_at") values (default, $1, $2, default) returning "id"',
    );
    expect(fake.queries[0].params).toEqual(["3.7512", "user-1"]);
  });

  it("never updates or deletes: each change is a new row", async () => {
    const fake = useFakeDb({ responses: [[[RATE_ID]], [[OLDER_RATE_ID]]] });

    await setExchangeRate("3.7500", "user-1");
    await setExchangeRate("3.7600", "user-2");

    expect(fake.queries).toHaveLength(2);
    for (const { sql } of fake.queries) {
      expect(normalize(sql)).toMatch(/^insert into "exchange_rates"/);
      expect(sql).not.toMatch(/\b(update|delete|on conflict)\b/i);
    }
    expect(fake.queries.map(({ params }) => params)).toEqual([
      ["3.7500", "user-1"],
      ["3.7600", "user-2"],
    ]);
  });

  it("propagates database rejections (e.g. the range CHECK)", async () => {
    const failure = new Error('violates check constraint "exchange_rates_usd_pen_chk"');
    useFakeDb({ failWith: failure });
    await expect(setExchangeRate("3.7500", "user-1")).rejects.toMatchObject({ cause: failure });
  });
});
