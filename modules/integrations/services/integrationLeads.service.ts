import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads, profiles, trips } from "@/lib/db-schema";
import type {
  CreateIntegrationLeadInput,
  CreateIntegrationLeadResult,
  IntegrationLead,
} from "../types/integrations.types";
import { deriveIdempotencyKey, hashSubmission } from "../utils/leadKeys";

// First word of the full name: the only name n8n may send to Gemini.
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}

// Explicit columns only: never city, notes, consent, referrer, UTM, activities or user ids. Archived leads are
// returned too (n8n acks their events). LEFT JOINs: no trip or no owner (unassigned) → null.
export async function getIntegrationLead(id: string): Promise<IntegrationLead | null> {
  const [row] = await getDb()
    .select({
      id: leads.id,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      stage: leads.stage,
      source: leads.source,
      trip: { slug: trips.slug, title: trips.title },
      destinationText: leads.destinationText,
      owner: { email: profiles.email },
      archivedAt: leads.archivedAt,
      createdAt: leads.createdAt,
      channel: leads.channel,
      originDetail: leads.originDetail,
      contactPreference: leads.contactPreference,
      nextActionDate: leads.nextActionDate,
      contactOptOutAt: leads.contactOptOutAt,
    })
    .from(leads)
    .leftJoin(trips, eq(trips.id, leads.tripId))
    .leftJoin(profiles, eq(profiles.userId, leads.ownerUserId))
    .where(eq(leads.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    firstName: firstNameOf(row.fullName),
    email: row.email,
    phone: row.phone,
    stage: row.stage,
    source: row.source,
    trip: row.trip,
    destinationText: row.destinationText,
    owner: row.owner,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    channel: row.channel,
    originDetail: row.originDetail,
    contactPreference: row.contactPreference,
    nextActionDate: row.nextActionDate,
    doNotContact: row.contactOptOutAt !== null,
  };
}

type CreateIntegrationLeadRow = {
  created_id: string | null;
  existing_id: string | null;
  existing_hash: string | null;
  phone_id: string | null;
  trip_ok: boolean;
};

// Lead from Google Forms or the one-off import (n8n), in a single statement: lead (no owner, no
// author, stage by default 'new'), its 'created' activity and the lead.created event. The
// idempotency key comes from "<source>:<externalId>"; a lead with the same phone (not archived, or
// archived with opt-out) is never duplicated. bulk is decided here, never by the request.
export async function createIntegrationLead(input: CreateIntegrationLeadInput): Promise<CreateIntegrationLeadResult> {
  const idempotencyKey = await deriveIdempotencyKey(input.source, input.externalId);
  const submissionHash = await hashSubmission([
    input.consentVersion,
    new Date(input.consentedAt).toISOString(),
    input.fullName,
    input.phone,
    input.email,
    input.tripSlug,
    input.destinationText,
    input.channel,
    input.originDetail,
    input.referredBy,
    input.contactPreference,
  ]);
  const bulk = input.source === "import";

  const result = await getDb().execute<CreateIntegrationLeadRow>(sql`
    WITH existing AS (
      SELECT id, submission_hash FROM leads WHERE idempotency_key = ${idempotencyKey}::uuid
    ),
    same_phone AS (
      SELECT id FROM leads
      WHERE phone = ${input.phone} AND (archived_at IS NULL OR contact_opt_out_at IS NOT NULL)
      ORDER BY created_at, id
      LIMIT 1
    ),
    trip AS (
      SELECT id FROM trips WHERE slug = ${input.tripSlug} AND status <> 'archived'
    ),
    checks AS (
      SELECT (${input.tripSlug}::text IS NULL OR EXISTS (SELECT 1 FROM trip)) AS trip_ok
    ),
    new_lead AS (
      INSERT INTO leads (
        full_name, phone, email, trip_id, destination_text, source,
        channel, origin_detail, referred_by, contact_preference,
        consent_version, consented_at, idempotency_key, submission_hash
      )
      SELECT
        ${input.fullName}, ${input.phone}, ${input.email}, (SELECT id FROM trip), ${input.destinationText},
        ${input.source}::lead_source, ${input.channel}::lead_channel, ${input.originDetail}, ${input.referredBy},
        ${input.contactPreference}::contact_preference, ${input.consentVersion}, ${input.consentedAt}::timestamptz,
        ${idempotencyKey}::uuid, ${submissionHash}
      FROM checks
      WHERE trip_ok AND NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM same_phone)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, source
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.created', id, jsonb_build_object('source', source, 'bulk', ${bulk}::boolean) FROM new_lead
    )
    SELECT
      (SELECT id FROM new_lead) AS created_id,
      (SELECT id FROM existing) AS existing_id,
      (SELECT submission_hash FROM existing) AS existing_hash,
      (SELECT id FROM same_phone) AS phone_id,
      trip_ok
    FROM checks
  `);
  const [row] = result.rows;
  if (row?.created_id) return { status: "created", leadId: row.created_id };
  if (row?.existing_id) {
    return row.existing_hash === submissionHash
      ? { status: "duplicate", leadId: row.existing_id }
      : { status: "conflict" };
  }
  if (row?.phone_id) return { status: "existing", leadId: row.phone_id };
  if (row && !row.trip_ok) return { status: "unknown_trip" };
  // A concurrent request inserted the same key first (ON CONFLICT DO NOTHING).
  return { status: "duplicate", leadId: null };
}
