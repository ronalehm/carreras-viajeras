import "server-only";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { campaigns, leads, profiles, trips } from "@/lib/db-schema";
import { campaignIdSchema } from "../schemas/campaigns.schema";
import type { CampaignDetail, CampaignInput, CampaignListItem } from "../types/campaigns.types";

type Db = ReturnType<typeof getDb>;

const creator = alias(profiles, "creator");
const closer = alias(profiles, "closer");

// New leads per campaign (registrations, not visits). Only web leads carry a campaign
// (leads_campaign_chk); archived ones still count, because they did register. Drizzle renders the
// aliased count unqualified in the outer select, hence a name no joined table uses.
function leadCountsSubquery(db: Db) {
  return db
    .select({ campaignId: leads.campaignId, total: count().as("lead_count") })
    .from(leads)
    .where(isNotNull(leads.campaignId))
    .groupBy(leads.campaignId)
    .as("lead_counts");
}

function listColumns(leadCounts: ReturnType<typeof leadCountsSubquery>) {
  return {
    id: campaigns.id,
    code: campaigns.code,
    name: campaigns.name,
    channel: campaigns.channel,
    eventName: campaigns.eventName,
    status: campaigns.status,
    trip: { slug: trips.slug, title: trips.title },
    createdAt: campaigns.createdAt,
    leadCount: sql<number>`coalesce(${leadCounts.total}, 0)`.mapWith(Number),
  } satisfies Record<keyof CampaignListItem, unknown>;
}

// One query (one round-trip): campaigns with their trip and lead count, active ones first,
// newest first. The trip is never missing (trip_id is NOT NULL with ON DELETE RESTRICT).
export async function listCampaigns(): Promise<CampaignListItem[]> {
  const db = getDb();
  const leadCounts = leadCountsSubquery(db);
  return db
    .select(listColumns(leadCounts))
    .from(campaigns)
    .innerJoin(trips, eq(trips.id, campaigns.tripId))
    .leftJoin(leadCounts, eq(leadCounts.campaignId, campaigns.id))
    .orderBy(sql`${campaigns.status} = 'closed'`, desc(campaigns.createdAt));
}

// Closed campaigns are returned too (read-only detail). A non-UUID id never reaches the database.
// LEFT JOIN closer: an active campaign has no closed_by (campaigns_closed_chk), so closedBy is null.
export async function getCampaignById(id: string): Promise<CampaignDetail | null> {
  if (!campaignIdSchema.safeParse(id).success) return null;
  const db = getDb();
  const leadCounts = leadCountsSubquery(db);
  const [campaign] = await db
    .select({
      ...listColumns(leadCounts),
      createdBy: { email: creator.email },
      closedAt: campaigns.closedAt,
      closedBy: { email: closer.email },
    })
    .from(campaigns)
    .innerJoin(trips, eq(trips.id, campaigns.tripId))
    .innerJoin(creator, eq(creator.userId, campaigns.createdBy))
    .leftJoin(closer, eq(closer.userId, campaigns.closedBy))
    .leftJoin(leadCounts, eq(leadCounts.campaignId, campaigns.id))
    .where(eq(campaigns.id, id))
    .limit(1);
  return campaign ?? null;
}

// One statement: the campaign is inserted only if its trip exists and is not archived; a used
// code turns the insert into a no-op (campaigns_code_uq). status takes the column default
// ('active') and the author is always the session user, never the input. trip_ok tells
// "invalid_trip" from "code_taken".
export async function createCampaign(
  input: CampaignInput,
  actorUserId: string,
): Promise<{ id: string } | "code_taken" | "invalid_trip"> {
  const result = await getDb().execute<{ id: string | null; trip_ok: boolean }>(sql`
    WITH trip AS (
      SELECT id FROM trips WHERE id = ${input.tripId}::uuid AND status <> 'archived'
    ),
    inserted AS (
      INSERT INTO campaigns (code, trip_id, channel, name, event_name, created_by)
      SELECT ${input.code}, id, ${input.channel}::lead_channel, ${input.name}, ${input.eventName}, ${actorUserId}
      FROM trip
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    )
    SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM trip) AS trip_ok
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  return row?.trip_ok ? "code_taken" : "invalid_trip";
}

// One statement. Closing is final and idempotent: only an active campaign changes, and status,
// closed_at and closed_by are set together (campaigns_closed_chk). A missing or already closed
// campaign is "not_found". Its leads keep their campaign_id.
export async function closeCampaign(id: string, actorUserId: string): Promise<"closed" | "not_found"> {
  const rows = await getDb()
    .update(campaigns)
    .set({ status: "closed", closedAt: sql`now()`, closedBy: actorUserId })
    .where(and(eq(campaigns.id, id), eq(campaigns.status, "active")))
    .returning({ id: campaigns.id });
  return rows.length > 0 ? "closed" : "not_found";
}
