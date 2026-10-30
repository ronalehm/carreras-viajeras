import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { runnerProfiles } from "@/lib/db-schema";
import type { RunnerProfile, RunnerProfileInput } from "../types/runnerProfile.types";
import { RUNNER_PROFILE_CONSENT } from "../utils/runnerProfileDisplay";

// Only the caller's own profile: `userId` and `email` always come from the session.
// Errors propagate unwrapped and unlogged: a Postgres error carries the row values, so the
// caller decides what to report (never its message).

const profileColumns = {
  email: runnerProfiles.email,
  fullName: runnerProfiles.fullName,
  phone: runnerProfiles.phone,
  country: runnerProfiles.country,
  city: runnerProfiles.city,
  birthDate: runnerProfiles.birthDate,
  documentType: runnerProfiles.documentType,
  documentNumber: runnerProfiles.documentNumber,
  documentExpiresOn: runnerProfiles.documentExpiresOn,
  shirtSize: runnerProfiles.shirtSize,
  preferredDistance: runnerProfiles.preferredDistance,
  personalBest: runnerProfiles.personalBest,
  club: runnerProfiles.club,
  emergencyContactName: runnerProfiles.emergencyContactName,
  emergencyContactPhone: runnerProfiles.emergencyContactPhone,
  medicalNotes: runnerProfiles.medicalNotes,
  consentVersion: runnerProfiles.consentVersion,
  consentedAt: runnerProfiles.consentedAt,
  updatedAt: runnerProfiles.updatedAt,
};

export async function getRunnerProfile(userId: string): Promise<RunnerProfile | null> {
  const [row] = await getDb()
    .select(profileColumns)
    .from(runnerProfiles)
    .where(eq(runnerProfiles.userId, userId));
  return row ?? null;
}

// Activity added to an existing lead when its person completes the profile. re_registered is the
// only activity type that needs no author nor outbox event (lead_activities_actor_chk and
// lead_activities_event_chk): a runner has no `profiles` row to sign a note with.
const PROFILE_COMPLETED_BODY = "Completó su perfil en la web";

// One statement (atomic by construction; Neon HTTP has no interactive transactions):
// - saved: INSERT … ON CONFLICT (user_id) DO UPDATE. The fields are picked one by one so that no
//   extra key of `input` (e.g. userId) can reach the row; user_id and created_at never change on
//   update. `xmax = 0` is true only for the inserted row: under concurrency ON CONFLICT lets a
//   single first save insert, the other one updates.
// - first save only: if a non-archived lead has the same email, a re_registered activity on the
//   most recent one (no event, no email); otherwise a runner_account lead (no owner, no author),
//   its 'created' activity and its 'lead.created' event { source }. Later saves never touch leads.
// The lead gets only name, phone, email and consent version: never documents, birth date,
// emergency contact or medical notes. runner_profiles has the same name, phone (E.164) and
// lowercase email CHECKs as leads, so a saved profile always fits a lead.
// Under concurrency, a web form submission of the same email at the same time can also create
// its own lead: there is no unique index on email (same rule as createWebLead).
export async function saveRunnerProfile(
  userId: string,
  email: string,
  input: RunnerProfileInput,
): Promise<void> {
  await getDb().execute(sql`
    WITH saved AS (
      INSERT INTO runner_profiles (
        user_id, email, full_name, phone, country, city, birth_date, document_type, document_number,
        document_expires_on, shirt_size, preferred_distance, personal_best, club,
        emergency_contact_name, emergency_contact_phone, medical_notes, consent_version, consented_at
      )
      VALUES (
        ${userId}, ${email}, ${input.fullName}, ${input.phone}, ${input.country}, ${input.city},
        ${input.birthDate}, ${input.documentType}, ${input.documentNumber}, ${input.documentExpiresOn},
        ${input.shirtSize}, ${input.preferredDistance}, ${input.personalBest}, ${input.club},
        ${input.emergencyContactName}, ${input.emergencyContactPhone}, ${input.medicalNotes},
        ${RUNNER_PROFILE_CONSENT.version}, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email = excluded.email,
        full_name = excluded.full_name,
        phone = excluded.phone,
        country = excluded.country,
        city = excluded.city,
        birth_date = excluded.birth_date,
        document_type = excluded.document_type,
        document_number = excluded.document_number,
        document_expires_on = excluded.document_expires_on,
        shirt_size = excluded.shirt_size,
        preferred_distance = excluded.preferred_distance,
        personal_best = excluded.personal_best,
        club = excluded.club,
        emergency_contact_name = excluded.emergency_contact_name,
        emergency_contact_phone = excluded.emergency_contact_phone,
        medical_notes = excluded.medical_notes,
        consent_version = excluded.consent_version,
        consented_at = now(),
        updated_at = now()
      RETURNING full_name, phone, email, consent_version, (xmax = 0) AS inserted
    ),
    first_save AS (
      SELECT full_name, phone, lower(email) AS email, consent_version FROM saved WHERE inserted
    ),
    existing AS (
      SELECT leads.id FROM leads, first_save
      WHERE lower(leads.email) = first_save.email AND leads.archived_at IS NULL
      ORDER BY leads.created_at DESC, leads.id DESC
      LIMIT 1
    ),
    new_lead AS (
      INSERT INTO leads (full_name, phone, email, source, channel, consent_version)
      SELECT full_name, phone, email, 'runner_account'::lead_source, 'web'::lead_channel, consent_version
      FROM first_save
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id, source
    ),
    activity AS (
      INSERT INTO lead_activities (lead_id, type) SELECT id, 'created' FROM new_lead
    ),
    event AS (
      INSERT INTO outbox_events (type, lead_id, payload)
      SELECT 'lead.created', id, jsonb_build_object('source', source) FROM new_lead
    ),
    completed AS (
      INSERT INTO lead_activities (lead_id, type, body, submission_id)
      SELECT id, 're_registered', ${PROFILE_COMPLETED_BODY}::text, gen_random_uuid() FROM existing
    )
    SELECT 1
  `);
}
