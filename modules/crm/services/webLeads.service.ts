import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { INQUIRY_DESTINATIONS } from "@/lib/inquiryDestinations";
import type { WebLeadInput } from "../types/webLeads.types";

const WEB_FORM_SOURCE = "web_form";
const WEB_FORM_CONSENT_VERSION = "web-form-v1";

// leads.submission_hash: SHA-256 hex of the normalized submission (Web Crypto: Node and Workers).
async function hashSubmission(input: Omit<WebLeadInput, "turnstileToken">): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([input.fullName, input.email, input.phone, input.destination]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// One statement (atomic by construction): the lead, its 'created' activity and its 'lead.created'
// event are inserted only if no lead has this idempotency key and no web form lead with the same
// phone was created in the last 10 minutes. The destination resolves to trip_id only if its
// catalog trip is published; otherwise destination_text keeps its visible name.
// Never written here: stage (column default 'new'), owner and author (NULL: assigned by hand in
// the CRM), channel (column default 'unknown') and consented_at (default now()).
// "duplicate" covers the same key and hash, the 10-minute phone window and a concurrent insert of
// the same key (ON CONFLICT DO NOTHING); "conflict" is the same key with other data.
export async function createWebLead(
  input: Omit<WebLeadInput, "turnstileToken">,
): Promise<"created" | "duplicate" | "conflict"> {
  const submissionHash = await hashSubmission(input);
  const destination = INQUIRY_DESTINATIONS[input.destination];

  // recent: the 10-minute phone window is not guaranteed under concurrency. There is no lock and no
  // unique index on phone (decision 8 of crm-leads-pipeline), so two simultaneous submissions with
  // the same phone and a different submissionId can both insert. Only the idempotency key is unique.
  const result = await getDb().execute<{ created: boolean; existing_hash: string | null }>(sql`
    WITH existing AS (
      SELECT submission_hash FROM leads WHERE idempotency_key = ${input.submissionId}::uuid
    ),
    recent AS (
      SELECT 1 FROM leads
      WHERE source = ${WEB_FORM_SOURCE}::lead_source AND phone = ${input.phone}
        AND created_at > now() - interval '10 minutes'
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
        CASE WHEN EXISTS (SELECT 1 FROM trip) THEN NULL ELSE ${destination.name} END,
        ${WEB_FORM_SOURCE}::lead_source, ${WEB_FORM_CONSENT_VERSION}, ${input.submissionId}::uuid, ${submissionHash}
      WHERE NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM recent)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, source
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.created', id, jsonb_build_object('source', source) FROM new_lead
    )
    SELECT EXISTS (SELECT 1 FROM new_lead) AS created, (SELECT submission_hash FROM existing) AS existing_hash
  `);
  const [row] = result.rows;
  if (row?.created) return "created";
  if (row?.existing_hash && row.existing_hash !== submissionHash) return "conflict";
  return "duplicate";
}
