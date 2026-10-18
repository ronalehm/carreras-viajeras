import "server-only";
import { and, asc, count, desc, eq, exists, inArray, isNull, ne, sql, type SQLWrapper } from "drizzle-orm";
import { can } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { leads, profiles, staffAssignments, staffRoleEnum, trips } from "@/lib/db-schema";
import { leadStageSchema } from "../schemas/leads.schema";
import type {
  CreateLeadInput,
  LeadList,
  LeadListFilters,
  LeadOwnerOption,
  LeadStage,
  LeadTripOption,
} from "../types/leads.types";

type Db = ReturnType<typeof getDb>;

const LEAD_PAGE_SIZE = 25;
const MANUAL_CONSENT_VERSION = "crm-manual-v1";

// Roles that may own leads: derived from the permission matrix, the only source of truth.
const LEAD_OWNER_ROLES = staffRoleEnum.enumValues.filter((role) => can([role], "leads.manage"));

const activeOwnerAssignment = and(
  isNull(staffAssignments.revokedAt),
  inArray(staffAssignments.role, LEAD_OWNER_ROLES),
);

// EXISTS: the user has an active staff assignment in a role with leads.manage.
function isActiveOwner(db: Db, userId: SQLWrapper | string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(staffAssignments)
      .where(and(eq(staffAssignments.userId, userId), activeOwnerAssignment)),
  );
}

function ownerOptionsQuery(db: Db) {
  return db
    .selectDistinct({ userId: profiles.userId, email: profiles.email })
    .from(staffAssignments)
    .innerJoin(profiles, eq(profiles.userId, staffAssignments.userId))
    .where(activeOwnerAssignment)
    .orderBy(asc(profiles.email), asc(profiles.userId));
}

// One batch (one round-trip): the page plus one extra row (hasNextPage, no COUNT),
// the funnel counts (every filter but the stage) and the owner options.
export async function getLeadList(filters: LeadListFilters, currentUserId: string): Promise<LeadList> {
  const db = getDb();
  const ownerUserId = filters.owner === "mine" ? currentUserId : filters.owner;
  const visible = and(
    isNull(leads.archivedAt),
    ownerUserId === undefined ? undefined : eq(leads.ownerUserId, ownerUserId),
  );

  const [rows, counts, ownerOptions] = await db.batch([
    db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        phone: leads.phone,
        stage: leads.stage,
        source: leads.source,
        trip: { id: trips.id, title: trips.title },
        destinationText: leads.destinationText,
        owner: {
          userId: profiles.userId,
          email: profiles.email,
          active: sql<boolean>`${isActiveOwner(db, leads.ownerUserId)}`,
        },
      })
      .from(leads)
      .innerJoin(profiles, eq(profiles.userId, leads.ownerUserId))
      .leftJoin(trips, eq(trips.id, leads.tripId))
      .where(and(visible, filters.stage === undefined ? undefined : eq(leads.stage, filters.stage)))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(LEAD_PAGE_SIZE + 1)
      .offset((filters.page - 1) * LEAD_PAGE_SIZE),
    db
      .select({ stage: leads.stage, total: count() })
      .from(leads)
      .where(visible)
      .groupBy(leads.stage),
    ownerOptionsQuery(db),
  ]);

  const stageCounts = Object.fromEntries(leadStageSchema.options.map((stage) => [stage, 0])) as Record<
    LeadStage,
    number
  >;
  for (const { stage, total } of counts) stageCounts[stage] = total;

  return {
    leads: rows.slice(0, LEAD_PAGE_SIZE),
    hasNextPage: rows.length > LEAD_PAGE_SIZE,
    stageCounts,
    ownerOptions,
  };
}

// Options for the lead form: active owners and every trip that is not archived (drafts included).
export async function getLeadFormOptions(): Promise<{
  ownerOptions: LeadOwnerOption[];
  tripOptions: LeadTripOption[];
}> {
  const db = getDb();
  const [ownerOptions, tripOptions] = await db.batch([
    ownerOptionsQuery(db),
    db
      .select({ id: trips.id, title: trips.title, status: trips.status })
      .from(trips)
      .where(ne(trips.status, "archived"))
      .orderBy(asc(trips.raceDate), asc(trips.title)),
  ]);
  return { ownerOptions, tripOptions };
}

// One statement: the lead is inserted only if the owner is active and the trip (if any) is not
// archived, and its 'created' activity is inserted from the same RETURNING. stage takes the
// column default ('new'); the author and the consent version never come from the input.
export async function createLead(
  input: CreateLeadInput,
  actorUserId: string,
): Promise<{ id: string } | "invalid_owner" | "invalid_trip"> {
  const db = getDb();
  const result = await db.execute<{ id: string | null; owner_ok: boolean; trip_ok: boolean }>(sql`
    WITH checks AS (
      SELECT
        ${isActiveOwner(db, input.ownerUserId)} AS owner_ok,
        (${input.tripId}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM trips WHERE trips.id = ${input.tripId}::uuid AND trips.status <> 'archived'
        )) AS trip_ok
    ),
    inserted AS (
      INSERT INTO leads (
        full_name, phone, email, location, trip_id, destination_text,
        source, owner_user_id, consent_version, created_by
      )
      SELECT
        ${input.fullName}, ${input.phone}, ${input.email}, ${input.location}, ${input.tripId}::uuid,
        ${input.destinationText}, ${input.source}::lead_source, ${input.ownerUserId},
        ${MANUAL_CONSENT_VERSION}, ${actorUserId}
      FROM checks
      WHERE owner_ok AND trip_ok
      RETURNING id
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, body, actor_user_id)
      SELECT id, 'created', ${input.note}, ${actorUserId} FROM inserted
    )
    SELECT (SELECT id FROM inserted) AS id, owner_ok, trip_ok FROM checks
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  return row?.owner_ok ? "invalid_trip" : "invalid_owner";
}
