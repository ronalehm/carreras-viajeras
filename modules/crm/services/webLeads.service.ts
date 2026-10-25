import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { INQUIRY_DESTINATIONS } from "@/lib/inquiryDestinations";
import type { WebLeadInput } from "../types/webLeads.types";

const WEB_FORM_SOURCE = "web_form";
const WEB_FORM_CONSENT_VERSION = "web-form-v1";

// SHA-256 hex of the normalized data: the same submissionId with other data is a conflict.
async function submissionHash(input: Omit<WebLeadInput, "turnstileToken" | "submissionId">): Promise<string> {
  const data = new TextEncoder().encode(
    JSON.stringify([input.fullName, input.email, input.phone, input.destination]),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// One statement (atomic by construction; neon-http has no interactive transactions):
// - existing: a lead with the same idempotency key (submissionId);
// - recent: a web form lead with the same phone in the last 10 minutes (duplicate window);
// - trip: the catalog trip of the destination, only while it is published;
// - new_lead: inserted only without existing/recent; ON CONFLICT covers a concurrent submission
//   with the same key. stage takes its default ('new'); no owner and no author (web form);
// - its 'created' activity (no note, no author) and its 'lead.created' outbox event, FROM new_lead.
// Published trip → trip_id and destination_text NULL; otherwise trip_id NULL and the visible name.
export async function createWebLead(
  input: Omit<WebLeadInput, "turnstileToken">,
): Promise<"created" | "duplicate" | "conflict"> {
  const destination = INQUIRY_DESTINATIONS[input.destination];
  const hash = await submissionHash(input);
  const db = getDb();
  const result = await db.execute<{ created: number | string; existing_hash: string | null }>(sql`
    WITH existing AS (
      SELECT submission_hash FROM leads WHERE idempotency_key = ${input.submissionId}::uuid
    ),
    recent AS (
      SELECT 1 FROM leads
      WHERE source = 'web_form' AND phone = ${input.phone}
        AND created_at > now() - interval '10 minutes'
      LIMIT 1
    ),
    trip AS (
      SELECT id FROM trips WHERE slug = ${destination.tripSlug}::text AND status = 'published'
    ),
    new_lead AS (
      INSERT INTO leads (
        full_name, phone, email, trip_id, destination_text,
        source, consent_version, idempotency_key, submission_hash
      )
      SELECT
        ${input.fullName}, ${input.phone}, ${input.email}, (SELECT id FROM trip),
        CASE WHEN EXISTS (SELECT 1 FROM trip) THEN NULL ELSE ${destination.name}::text END,
        ${WEB_FORM_SOURCE}::lead_source, ${WEB_FORM_CONSENT_VERSION}, ${input.submissionId}::uuid, ${hash}
      WHERE NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM recent)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, source
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type)
      SELECT id, 'created' FROM new_lead
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.created', id, jsonb_build_object('source', source) FROM new_lead
    )
    SELECT
      (SELECT count(*) FROM new_lead)::int AS created,
      (SELECT submission_hash FROM existing) AS existing_hash
  `);
  const [row] = result.rows;
  if (Number(row?.created) === 1) return "created";
  // Same key with other data; same key and data, the duplicate window or a concurrent submission
  // are a duplicate (the previous result: success, without revealing whether the phone exists).
  if (row?.existing_hash && row.existing_hash !== hash) return "conflict";
  return "duplicate";
}
