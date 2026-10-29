// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { getLeadReport } from "./leadReport.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (as in leads.service.test.ts): records every statement and answers each
// one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][] } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
const STAGE_PARAMS = ["new", "contacted", "quoted", "reserved", "paid", "lost"];
const STAGE_COUNTS = STAGE_PARAMS.map(
  (_, index) => `count(*) filter (where "leads"."stage" = $${index + 1})`,
).join(", ");

// Count row in select order (array mode): channel, total, new, contacted, quoted, reserved, paid,
// lost, opted out, unassigned. Neon returns count(*) (bigint) as a string.
function countRow(channel: string, counts: number[]) {
  return [channel, ...counts.map(String)];
}

const zeroStages = { new: 0, contacted: 0, quoted: 0, reserved: 0, paid: 0, lost: 0 };

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getLeadReport", () => {
  it("reads the counts, the cohort months and the trips in one batch", async () => {
    const fake = useFakeDb();
    await getLeadReport({ cohort: "2026-10", onlyImported: false });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(3);
    const [counts, cohorts, trips] = fake.queries;

    expect(normalize(counts.sql)).toBe(
      `select "channel", count(*), ${STAGE_COUNTS}, count(*) filter (where "leads"."contact_opt_out_at" is not null), count(*) filter (where "leads"."owner_user_id" is null) from "leads" where ("leads"."archived_at" is null and ("leads"."created_at" >= $7::timestamp at time zone 'America/Lima' and "leads"."created_at" < $8::timestamp at time zone 'America/Lima') and "leads"."source" <> $9) group by "leads"."channel"`,
    );
    expect(counts.params).toEqual([...STAGE_PARAMS, "2026-10-01", "2026-11-01", "import"]);

    expect(normalize(cohorts.sql)).toBe(
      `select to_char("created_at" at time zone 'America/Lima', 'YYYY-MM') from "leads" where "leads"."archived_at" is null group by to_char("leads"."created_at" at time zone 'America/Lima', 'YYYY-MM') order by to_char("leads"."created_at" at time zone 'America/Lima', 'YYYY-MM') desc limit $1`,
    );
    expect(cohorts.params).toEqual([24]);

    expect(normalize(trips.sql)).toBe(
      'select "id", "title", "status" from "trips" where "trips"."status" <> $1 order by "trips"."race_date" asc, "trips"."title" asc',
    );
    expect(trips.params).toEqual(["archived"]);
  });

  it("never selects personal data", async () => {
    const fake = useFakeDb();
    await getLeadReport({ cohort: "2026-10", onlyImported: false });
    expect(fake.queries[0].sql).not.toMatch(/full_name|phone|email|origin_detail|referred_by|utm_/);
  });

  it("ends December's cohort on the first day of January of the next year", async () => {
    const fake = useFakeDb();
    await getLeadReport({ cohort: "2026-12", onlyImported: false });
    expect(fake.queries[0].params.slice(6, 8)).toEqual(["2026-12-01", "2027-01-01"]);
  });

  it("filters by trip and selects only the imported leads", async () => {
    const fake = useFakeDb();
    await getLeadReport({ cohort: "2026-10", tripId: TRIP_ID, onlyImported: true });

    const [counts] = fake.queries;
    expect(normalize(counts.sql)).toContain(
      `"leads"."created_at" < $8::timestamp at time zone 'America/Lima') and "leads"."trip_id" = $9 and "leads"."source" = $10) group by "leads"."channel"`,
    );
    expect(counts.params.slice(6)).toEqual(["2026-10-01", "2026-11-01", TRIP_ID, "import"]);
  });

  it("maps the counts to numbers, follows the origin order and sums the Total row", async () => {
    useFakeDb({
      responses: [
        [
          countRow("unknown", [1, 1, 0, 0, 0, 0, 0, 0, 1]),
          countRow("instagram", [3, 0, 0, 1, 0, 0, 2, 1, 1]),
          countRow("event", [2, 1, 1, 0, 0, 0, 0, 0, 0]),
        ],
        [["2026-10"], ["2026-09"]],
        [[TRIP_ID, "Maratón de Santiago 2027", "published"]],
      ],
    });
    const report = await getLeadReport({ cohort: "2026-10", onlyImported: false });

    expect(report.rows).toEqual([
      { channel: "event", total: 2, stages: { ...zeroStages, new: 1, contacted: 1 }, optedOut: 0, unassigned: 0 },
      { channel: "instagram", total: 3, stages: { ...zeroStages, quoted: 1, lost: 2 }, optedOut: 1, unassigned: 1 },
      { channel: "unknown", total: 1, stages: { ...zeroStages, new: 1 }, optedOut: 0, unassigned: 1 },
    ]);
    expect(report.totals).toEqual({
      total: 6,
      stages: { new: 2, contacted: 1, quoted: 1, reserved: 0, paid: 0, lost: 2 },
      optedOut: 1,
      unassigned: 2,
    });
    expect(report.cohort).toBe("2026-10");
    expect(report.cohorts).toEqual(["2026-10", "2026-09"]);
    expect(report.tripOptions).toEqual([{ id: TRIP_ID, title: "Maratón de Santiago 2027", status: "published" }]);
  });

  it("returns no rows and zero totals for an empty cohort, still offering that month", async () => {
    useFakeDb({ responses: [[], [["2026-09"], ["2026-07"]], []] });
    const report = await getLeadReport({ cohort: "2026-10", onlyImported: false });

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ total: 0, stages: zeroStages, optedOut: 0, unassigned: 0 });
    expect(report.cohorts).toEqual(["2026-10", "2026-09", "2026-07"]);
    expect(report.tripOptions).toEqual([]);
  });

  it("offers an older selected cohort after the available months", async () => {
    useFakeDb({ responses: [[], [["2026-10"]], []] });
    const report = await getLeadReport({ cohort: "2024-01", onlyImported: true });
    expect(report.cohorts).toEqual(["2026-10", "2024-01"]);
  });
});
