import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { leads, profiles, staffAssignments, staffRoleEnum, trips } from "@/lib/db-schema";
import { leadStageSchema } from "../schemas/leads.schema";
import type {
  CreateLeadInput,
  LeadDetail,
  LeadList,
  LeadListFilters,
  LeadOwnerChangeInput,
  LeadOwnerOption,
  LeadSourceChangeInput,
  LeadStage,
  LeadStageChangeInput,
  LeadTripOption,
  NextActionInput,
  UpdateLeadInput,
} from "../types/leads.types";
import { CLOSED_LEAD_STAGES } from "../utils/leadDisplay";

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

// "mine" is the session user and "unassigned" the leads without owner (web form).
function ownerCondition(owner: LeadListFilters["owner"], currentUserId: string) {
  if (owner === undefined) return undefined;
  if (owner === "unassigned") return isNull(leads.ownerUserId);
  return eq(leads.ownerUserId, owner === "mine" ? currentUserId : owner);
}

// Open leads with a next action before today ("overdue") or up to today ("pending"). today is the
// CRM calendar date (YYYY-MM-DD): date columns compare in calendar order.
function followUpCondition(followUp: LeadListFilters["followUp"], today: string) {
  if (followUp === undefined) return undefined;
  const due = followUp === "overdue" ? lt(leads.nextActionDate, today) : lte(leads.nextActionDate, today);
  return and(notInArray(leads.stage, [...CLOSED_LEAD_STAGES]), due);
}

// One batch (one round-trip): the page plus one extra row (hasNextPage, no COUNT),
// the funnel counts (every filter but the stage: owner, follow-up and source; never archived
// leads) and the owner options.
// The "archived" stage filter lists only archived leads, of any stage.
// LEFT JOIN profiles: a lead without owner is listed with owner = null.
// With a follow-up filter the most urgent next action comes first.
export async function getLeadList(
  filters: LeadListFilters,
  currentUserId: string,
  today: string,
): Promise<LeadList> {
  const db = getDb();
  const byOwner = ownerCondition(filters.owner, currentUserId);
  const byFollowUp = followUpCondition(filters.followUp, today);
  const bySource = filters.source === undefined ? undefined : eq(leads.source, filters.source);
  const visible = and(isNull(leads.archivedAt), byOwner, byFollowUp, bySource);
  const listed =
    filters.stage === "archived"
      ? and(isNotNull(leads.archivedAt), byOwner, byFollowUp, bySource)
      : and(visible, filters.stage === undefined ? undefined : eq(leads.stage, filters.stage));
  const newestFirst = [desc(leads.createdAt), desc(leads.id)];
  const order = filters.followUp ? [asc(leads.nextActionDate), ...newestFirst] : newestFirst;

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
        nextActionDate: leads.nextActionDate,
        nextActionNote: leads.nextActionNote,
        sourceDetail: leads.sourceDetail,
      })
      .from(leads)
      .leftJoin(profiles, eq(profiles.userId, leads.ownerUserId))
      .leftJoin(trips, eq(trips.id, leads.tripId))
      .where(listed)
      .orderBy(...order)
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
// archived; its 'created' activity and its 'lead.created' outbox event (payload { source } only:
// the source detail never reaches n8n) are inserted from the same RETURNING. stage takes the column default ('new'); the author
// and the consent version never come from the input.
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
        source, source_detail, owner_user_id, consent_version, created_by
      )
      SELECT
        ${input.fullName}, ${input.phone}, ${input.email}, ${input.location}, ${input.tripId}::uuid,
        ${input.destinationText}, ${input.source}::lead_source, ${input.sourceDetail}, ${input.ownerUserId},
        ${MANUAL_CONSENT_VERSION}, ${actorUserId}
      FROM checks
      WHERE owner_ok AND trip_ok
      RETURNING id, source
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, body, actor_user_id)
      SELECT id, 'created', ${input.note}, ${actorUserId} FROM inserted
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.created', id, jsonb_build_object('source', source) FROM inserted
    )
    SELECT (SELECT id FROM inserted) AS id, owner_ok, trip_ok FROM checks
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  return row?.owner_ok ? "invalid_trip" : "invalid_owner";
}

const owner = alias(profiles, "owner");
const creator = alias(profiles, "creator");
const archiver = alias(profiles, "archiver");

// Archived leads are returned too (read-only detail). A non-UUID id never reaches the database.
// LEFT JOINs: web form leads have no owner and no author (owner and createdBy are null).
export async function getLeadById(id: string): Promise<LeadDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const db = getDb();
  const [lead] = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      phone: leads.phone,
      email: leads.email,
      location: leads.location,
      stage: leads.stage,
      lostReason: leads.lostReason,
      source: leads.source,
      trip: { id: trips.id, title: trips.title, status: trips.status },
      destinationText: leads.destinationText,
      owner: {
        userId: owner.userId,
        email: owner.email,
        active: sql<boolean>`${isActiveOwner(db, leads.ownerUserId)}`,
      },
      consentVersion: leads.consentVersion,
      consentedAt: leads.consentedAt,
      createdBy: { email: creator.email },
      createdAt: leads.createdAt,
      nextActionDate: leads.nextActionDate,
      nextActionNote: leads.nextActionNote,
      archivedAt: leads.archivedAt,
      archivedBy: { email: archiver.email },
      sourceDetail: leads.sourceDetail,
    })
    .from(leads)
    .leftJoin(owner, eq(owner.userId, leads.ownerUserId))
    .leftJoin(creator, eq(creator.userId, leads.createdBy))
    .leftJoin(archiver, eq(archiver.userId, leads.archivedBy))
    .leftJoin(trips, eq(trips.id, leads.tripId))
    .where(eq(leads.id, id))
    .limit(1);
  return lead ?? null;
}

// One batch (one transaction, one round-trip). The UPDATE decides with its WHERE: the lead exists,
// is not archived and the trip is none, the one already linked (even if archived since) or a
// trip that is not archived. The SELECT tells "not_found" from "invalid_trip".
export async function updateLead(input: UpdateLeadInput): Promise<"updated" | "not_found" | "invalid_trip"> {
  const db = getDb();
  const editable = and(eq(leads.id, input.leadId), isNull(leads.archivedAt));
  const [updated, found] = await db.batch([
    db
      .update(leads)
      .set({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        location: input.location,
        tripId: input.tripId,
        destinationText: input.destinationText,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          editable,
          input.tripId === null
            ? undefined
            : or(
                eq(leads.tripId, input.tripId),
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(trips)
                    .where(and(eq(trips.id, input.tripId), ne(trips.status, "archived"))),
                ),
              ),
        ),
      )
      .returning({ id: leads.id }),
    db.select({ id: leads.id }).from(leads).where(editable),
  ]);
  if (updated.length > 0) return "updated";
  return found.length > 0 ? "invalid_trip" : "not_found";
}

type ChangeResult = { found: boolean; changed: boolean };

// One statement. The target CTE locks the lead (FOR UPDATE) so the previous stage written in the
// activity is the one the UPDATE replaced, even under concurrent changes. A closed stage clears
// the next action; lost_reason is set for "lost" and cleared otherwise (schema forces null).
export async function changeLeadStage(
  input: LeadStageChangeInput,
  actorUserId: string,
): Promise<"changed" | "not_found" | "no_change"> {
  const clearNextAction = CLOSED_LEAD_STAGES.includes(input.stage)
    ? sql`, next_action_date = NULL, next_action_note = NULL`
    : sql``;
  const result = await getDb().execute<ChangeResult>(sql`
    WITH target AS (
      SELECT id, stage FROM leads
      WHERE id = ${input.leadId}::uuid AND archived_at IS NULL
      FOR UPDATE
    ),
    updated AS (
      UPDATE leads
      SET stage = ${input.stage}::lead_stage, lost_reason = ${input.lostReason}, updated_at = now()${clearNextAction}
      FROM target
      WHERE leads.id = target.id AND target.stage <> ${input.stage}::lead_stage
      RETURNING leads.id, target.stage AS stage_from
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, body, stage_from, stage_to, actor_user_id)
      SELECT id, 'stage_changed', ${input.lostReason}, stage_from, ${input.stage}::lead_stage, ${actorUserId}
      FROM updated
    )
    SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM updated) AS changed
  `);
  return changeOutcome(result.rows[0]);
}

// One statement, same locking as changeLeadStage. IS DISTINCT FROM: a lead without owner (web
// form) gets its first owner, and the activity records owner_from = NULL. The new owner must
// have an active role with leads.manage.
export async function changeLeadOwner(
  input: LeadOwnerChangeInput,
  actorUserId: string,
): Promise<"changed" | "not_found" | "no_change" | "invalid_owner"> {
  const db = getDb();
  const result = await db.execute<ChangeResult & { owner_ok: boolean }>(sql`
    WITH checks AS (
      SELECT ${isActiveOwner(db, input.ownerUserId)} AS owner_ok
    ),
    target AS (
      SELECT id, owner_user_id FROM leads
      WHERE id = ${input.leadId}::uuid AND archived_at IS NULL
      FOR UPDATE
    ),
    updated AS (
      UPDATE leads
      SET owner_user_id = ${input.ownerUserId}, updated_at = now()
      FROM target, checks
      WHERE leads.id = target.id AND checks.owner_ok
        AND target.owner_user_id IS DISTINCT FROM ${input.ownerUserId}
      RETURNING leads.id, target.owner_user_id AS owner_from
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, owner_from, owner_to, actor_user_id)
      SELECT id, 'owner_changed', owner_from, ${input.ownerUserId}, ${actorUserId}
      FROM updated
    )
    SELECT
      EXISTS (SELECT 1 FROM target) AS found,
      EXISTS (SELECT 1 FROM updated) AS changed,
      owner_ok
    FROM checks
  `);
  const row = result.rows[0];
  if (row?.found && !row.changed && !row.owner_ok) return "invalid_owner";
  return changeOutcome(row);
}

// One statement, same locking as changeLeadStage. The next action only exists in open,
// non-archived leads: an archived or missing lead is "not_found" (like every other write) and a
// paid or lost one is "closed". Null date and note clear it.
export async function setNextAction(input: NextActionInput): Promise<"saved" | "not_found" | "closed"> {
  const result = await getDb().execute<{ found: boolean; saved: boolean }>(sql`
    WITH target AS (
      SELECT id, stage FROM leads
      WHERE id = ${input.leadId}::uuid AND archived_at IS NULL
      FOR UPDATE
    ),
    updated AS (
      UPDATE leads
      SET next_action_date = ${input.nextActionDate}::date, next_action_note = ${input.nextActionNote}, updated_at = now()
      FROM target
      WHERE leads.id = target.id AND target.stage NOT IN (${sql.join(
        CLOSED_LEAD_STAGES.map((stage) => sql`${stage}::lead_stage`),
        sql`, `,
      )})
      RETURNING leads.id
    )
    SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM updated) AS saved
  `);
  const row = result.rows[0];
  if (!row?.found) return "not_found";
  return row.saved ? "saved" : "closed";
}

// One statement, same locking as changeLeadStage, but target also reads archived leads so that
// "archived" differs from "not_found". locked: the source would change from or to web_form (a
// web form lead keeps its source; a manual lead never becomes web_form, even if the schema already
// rejects it). The UPDATE decides with its WHERE: not archived, not locked and a different source
// or detail. Only a source change inserts 'source_changed' (detail-only edits leave no activity).
export async function changeLeadSource(
  input: LeadSourceChangeInput,
): Promise<"updated" | "unchanged" | "source_locked" | "archived" | "not_found"> {
  const result = await getDb().execute<{ found: boolean; archived: boolean; locked: boolean; updated: boolean }>(sql`
    WITH target AS (
      SELECT
        id, source, source_detail, archived_at IS NOT NULL AS archived,
        source <> ${input.source}::lead_source AND 'web_form'::lead_source IN (source, ${input.source}::lead_source) AS locked
      FROM leads
      WHERE id = ${input.leadId}::uuid
      FOR UPDATE
    ),
    updated AS (
      UPDATE leads
      SET source = ${input.source}::lead_source, source_detail = ${input.sourceDetail}, updated_at = now()
      FROM target
      WHERE leads.id = target.id AND NOT target.archived AND NOT target.locked
        AND (target.source <> ${input.source}::lead_source OR target.source_detail IS DISTINCT FROM ${input.sourceDetail})
      RETURNING leads.id, target.source AS source_from
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, source_from, source_to, actor_user_id)
      SELECT id, 'source_changed', source_from, ${input.source}::lead_source, ${input.actorUserId}
      FROM updated
      WHERE source_from <> ${input.source}::lead_source
    )
    SELECT
      EXISTS (SELECT 1 FROM target) AS found,
      EXISTS (SELECT 1 FROM target WHERE archived) AS archived,
      EXISTS (SELECT 1 FROM target WHERE locked) AS locked,
      EXISTS (SELECT 1 FROM updated) AS updated
  `);
  const row = result.rows[0];
  if (!row?.found) return "not_found";
  if (row.archived) return "archived";
  if (row.updated) return "updated";
  return row.locked ? "source_locked" : "unchanged";
}

function changeOutcome(row: ChangeResult | undefined): "changed" | "not_found" | "no_change" {
  if (!row?.found) return "not_found";
  return row.changed ? "changed" : "no_change";
}

// One statement, same locking as changeLeadStage. Archiving is final: it records who and when,
// clears the next action (only non-archived leads have one) and inserts the 'archived' activity
// (no body, the session user as author). A missing or already archived lead is "not_found".
export async function archiveLead(leadId: string, actorUserId: string): Promise<"archived" | "not_found"> {
  const result = await getDb().execute<{ archived: boolean }>(sql`
    WITH target AS (
      SELECT id FROM leads
      WHERE id = ${leadId}::uuid AND archived_at IS NULL
      FOR UPDATE
    ),
    updated AS (
      UPDATE leads
      SET archived_at = now(), archived_by = ${actorUserId}, next_action_date = NULL, next_action_note = NULL, updated_at = now()
      FROM target
      WHERE leads.id = target.id
      RETURNING leads.id
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type, actor_user_id)
      SELECT id, 'archived', ${actorUserId} FROM updated
    )
    SELECT EXISTS (SELECT 1 FROM updated) AS archived
  `);
  return result.rows[0]?.archived ? "archived" : "not_found";
}
