import "server-only";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { CRM_TIME_ZONE } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { leads, trips } from "@/lib/db-schema";
import { leadChannelSchema, leadStageSchema } from "../schemas/leads.schema";
import type { LeadReport, LeadReportFilters, LeadReportRow, LeadStage } from "../types/leads.types";

// Months offered by the cohort filter.
const COHORT_MONTHS = 24;

// Constant literal (never user input): the same expression in SELECT, GROUP BY and ORDER BY
// must not carry parameters, or PostgreSQL would not match them.
const crmTimeZone = sql.raw(`'${CRM_TIME_ZONE}'`);
const cohortOfLead = sql<string>`to_char(${leads.createdAt} at time zone ${crmTimeZone}, 'YYYY-MM')`;

// First day of the month after a YYYY-MM cohort (YYYY-MM-01).
function nextMonthStart(cohort: string): string {
  const [year, month] = cohort.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

// Leads created in the cohort month of the CRM time zone: [first day, first day of the next
// month) as local midnights. Bounds on created_at itself, not a function of it.
function cohortCondition(cohort: string) {
  return and(
    gte(leads.createdAt, sql`${`${cohort}-01`}::timestamp at time zone ${crmTimeZone}`),
    lt(leads.createdAt, sql`${nextMonthStart(cohort)}::timestamp at time zone ${crmTimeZone}`),
  );
}

const countWhere = (condition: SQL) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

const stageCounts = Object.fromEntries(
  leadStageSchema.options.map((stage) => [stage, countWhere(eq(leads.stage, stage))]),
) as Record<LeadStage, ReturnType<typeof countWhere>>;

const emptyCounts = (): Omit<LeadReportRow, "channel"> => ({
  total: 0,
  stages: Object.fromEntries(leadStageSchema.options.map((stage) => [stage, 0])) as Record<LeadStage, number>,
  optedOut: 0,
  unassigned: 0,
});

// Origin × stage counts of one signup cohort (Decision 15): only aggregated counts, never personal
// data. One batch (one round-trip): (1) counts per origin of the non-archived leads of the cohort,
// optionally of one trip, with the imported leads excluded or alone; (2) the latest cohort months
// with non-archived leads; (3) the non-archived trips. Rows follow the leadChannelSchema order and
// the "Total" row is summed here.
export async function getLeadReport(filters: LeadReportFilters): Promise<LeadReport> {
  const db = getDb();
  const [counts, cohortRows, tripOptions] = await db.batch([
    db
      .select({
        channel: leads.channel,
        total: count(),
        ...stageCounts,
        optedOut: countWhere(isNotNull(leads.contactOptOutAt)),
        unassigned: countWhere(isNull(leads.ownerUserId)),
      })
      .from(leads)
      .where(
        and(
          isNull(leads.archivedAt),
          cohortCondition(filters.cohort),
          filters.tripId === undefined ? undefined : eq(leads.tripId, filters.tripId),
          filters.onlyImported ? eq(leads.source, "import") : ne(leads.source, "import"),
        ),
      )
      .groupBy(leads.channel),
    db
      .select({ cohort: cohortOfLead })
      .from(leads)
      .where(isNull(leads.archivedAt))
      .groupBy(cohortOfLead)
      .orderBy(desc(cohortOfLead))
      .limit(COHORT_MONTHS),
    db
      .select({ id: trips.id, title: trips.title, status: trips.status })
      .from(trips)
      .where(ne(trips.status, "archived"))
      .orderBy(asc(trips.raceDate), asc(trips.title)),
  ]);

  const byChannel = new Map(counts.map((row) => [row.channel, row]));
  const rows: LeadReportRow[] = [];
  const totals = emptyCounts();
  for (const channel of leadChannelSchema.options) {
    const found = byChannel.get(channel);
    if (!found) continue;
    const row: LeadReportRow = {
      channel,
      total: found.total,
      stages: Object.fromEntries(leadStageSchema.options.map((stage) => [stage, found[stage]])) as Record<
        LeadStage,
        number
      >,
      optedOut: found.optedOut,
      unassigned: found.unassigned,
    };
    rows.push(row);
    totals.total += row.total;
    totals.optedOut += row.optedOut;
    totals.unassigned += row.unassigned;
    for (const stage of leadStageSchema.options) totals.stages[stage] += row.stages[stage];
  }

  // The selected cohort is always offered, even without leads (the current month, by default).
  const cohorts = cohortRows.map((row) => row.cohort);
  if (!cohorts.includes(filters.cohort)) cohorts.push(filters.cohort);
  cohorts.sort().reverse();

  return { cohort: filters.cohort, rows, totals, cohorts, tripOptions };
}
