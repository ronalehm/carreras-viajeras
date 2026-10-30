import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { INQUIRY_DESTINATIONS, INQUIRY_DESTINATION_IDS } from "@/lib/inquiryDestinations";
import { REGISTRATION_CONSENT } from "@/lib/registrationConsent";
import type { WebLeadInput } from "../types/webLeads.types";
import { reRegistrationNote } from "../utils/leadAttribution";

const WEB_FORM_SOURCE = "web_form";

type WebLeadSubmission = Omit<WebLeadInput, "turnstileToken">;

type CaptureRow = {
  created: boolean;
  existing_hash: string | null;
  repeated_before: boolean;
  repeated: boolean;
  trip_ok: boolean;
};

// leads.submission_hash: SHA-256 hex of the visible submission (Web Crypto: Node and Workers).
// The attribution (?c=, UTM, ref) is not part of it: the same person and data are the same submission.
async function hashSubmission(input: WebLeadSubmission): Promise<string> {
  const data = new TextEncoder().encode(
    JSON.stringify([input.fullName, input.email, input.phone, input.destination, input.marketingOptIn]),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// rio/roma have no catalog trip: destination_text keeps their name. Any other value is the slug of
// a published catalog trip (resolved by the statement).
function resolveDestination(destination: string): { tripSlug: string | null; destinationText: string | null } {
  const inquiryId = INQUIRY_DESTINATION_IDS.find((id) => id === destination);
  return inquiryId
    ? { tripSlug: null, destinationText: INQUIRY_DESTINATIONS[inquiryId].name }
    : { tripSlug: destination, destinationText: null };
}

// One statement (atomic by construction; Neon HTTP has no interactive transactions):
// - campaign: only an active campaign of the published trip of the slug applies (channel and
//   origin_detail come from its row, never from the browser); otherwise channel = 'web'.
// - same_person: a non-archived lead with the same normalized email and the same race (trip_id, or
//   destination_text for rio/roma). Never by phone. In that case the lead is not touched: only a
//   're_registered' activity with the submission key (unique: a retry inserts nothing) and a note.
// - new lead: the lead, its 'created' activity and its 'lead.created' event { source, form } (form
//   only chooses the email text; no personal data). The repeated registration emits no event.
// Never written here: stage (default 'new'), owner and author (NULL: assigned in the CRM),
// referral_permission (default false) and consented_at (default now()).
// Under concurrency, two simultaneous submissions of the same person with different keys can both
// insert: there is no unique index on email and race (requirement 11). Only the keys are unique.
export async function createWebLead(
  input: WebLeadSubmission,
): Promise<"created" | "existing" | "duplicate" | "conflict" | "unknown_trip"> {
  const submissionHash = await hashSubmission(input);
  const { tripSlug, destinationText } = resolveDestination(input.destination);
  const note = reRegistrationNote({
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    referredBy: input.referredBy,
    consentVersion: REGISTRATION_CONSENT.version,
    marketingOptIn: input.marketingOptIn,
  });
  const sameRace =
    tripSlug === null
      ? sql`trip_id IS NULL AND destination_text = ${destinationText}::text`
      : sql`trip_id = (SELECT id FROM trip)`;

  const result = await getDb().execute<CaptureRow>(sql`
    WITH existing AS (
      SELECT submission_hash FROM leads WHERE idempotency_key = ${input.submissionId}::uuid
    ),
    repeated_before AS (
      SELECT 1 FROM lead_activities WHERE submission_id = ${input.submissionId}::uuid
    ),
    trip AS (
      SELECT id FROM trips WHERE slug = ${tripSlug}::text AND status = 'published'
    ),
    checks AS (
      SELECT (${tripSlug}::text IS NULL OR EXISTS (SELECT 1 FROM trip)) AS trip_ok
    ),
    campaign AS (
      SELECT id, code, name, channel, coalesce(event_name, name) AS detail FROM campaigns
      WHERE code = ${input.campaignCode}::text AND status = 'active' AND trip_id = (SELECT id FROM trip)
    ),
    same_person AS (
      SELECT id FROM leads
      WHERE email = ${input.email}::text AND archived_at IS NULL AND ${sameRace}
      ORDER BY created_at, id
      LIMIT 1
    ),
    fresh AS (
      SELECT 1 FROM checks
      WHERE trip_ok AND NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM repeated_before)
    ),
    new_lead AS (
      INSERT INTO leads (
        full_name, phone, email, trip_id, destination_text, source, channel, origin_detail,
        campaign_id, utm_source, utm_medium, utm_campaign, referred_by, consent_version,
        marketing_opt_in_at, idempotency_key, submission_hash
      )
      SELECT
        ${input.fullName}, ${input.phone}, ${input.email}, (SELECT id FROM trip), ${destinationText}::text,
        ${WEB_FORM_SOURCE}::lead_source, coalesce((SELECT channel FROM campaign), 'web'::lead_channel),
        (SELECT detail FROM campaign), (SELECT id FROM campaign),
        ${input.utmSource}::text, ${input.utmMedium}::text, ${input.utmCampaign}::text, ${input.referredBy}::text,
        ${REGISTRATION_CONSENT.version}, CASE WHEN ${input.marketingOptIn}::boolean THEN now() END,
        ${input.submissionId}::uuid, ${submissionHash}
      FROM fresh
      WHERE NOT EXISTS (SELECT 1 FROM same_person)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, source
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.created', id, jsonb_build_object('source', source, 'form', ${input.form}::text) FROM new_lead
    ),
    repeat AS (
      INSERT INTO lead_activities (lead_id, type, body, submission_id)
      SELECT
        same_person.id, 're_registered',
        left(concat_ws(' · ', 'Volvió a registrarse desde la web',
          'Campaña: ' || (SELECT name || ' (' || code || ')' FROM campaign), ${note}::text), 500),
        ${input.submissionId}::uuid
      FROM same_person, fresh
      ON CONFLICT (submission_id) DO NOTHING
      RETURNING lead_id
    )
    SELECT
      EXISTS (SELECT 1 FROM new_lead) AS created,
      (SELECT submission_hash FROM existing) AS existing_hash,
      EXISTS (SELECT 1 FROM repeated_before) AS repeated_before,
      EXISTS (SELECT 1 FROM repeat) AS repeated,
      (SELECT trip_ok FROM checks) AS trip_ok
  `);
  const [row] = result.rows;
  if (row?.created) return "created";
  if (row?.existing_hash) return row.existing_hash === submissionHash ? "duplicate" : "conflict";
  if (row?.repeated) return "existing";
  if (row?.repeated_before) return "duplicate";
  if (row && !row.trip_ok) return "unknown_trip";
  // A concurrent insert won the key (ON CONFLICT DO NOTHING).
  return "duplicate";
}
