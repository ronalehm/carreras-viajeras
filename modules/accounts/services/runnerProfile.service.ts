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

// One statement: INSERT … ON CONFLICT (user_id) DO UPDATE. The fields are picked one by one so
// that no extra key of `input` (e.g. userId) can reach the row; user_id and created_at never
// change on update.
export async function saveRunnerProfile(
  userId: string,
  email: string,
  input: RunnerProfileInput,
): Promise<void> {
  const fields = {
    email,
    fullName: input.fullName,
    phone: input.phone,
    country: input.country,
    city: input.city,
    birthDate: input.birthDate,
    documentType: input.documentType,
    documentNumber: input.documentNumber,
    documentExpiresOn: input.documentExpiresOn,
    shirtSize: input.shirtSize,
    preferredDistance: input.preferredDistance,
    personalBest: input.personalBest,
    club: input.club,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    medicalNotes: input.medicalNotes,
    consentVersion: RUNNER_PROFILE_CONSENT.version,
    consentedAt: sql`now()`,
  };
  await getDb()
    .insert(runnerProfiles)
    .values({ userId, ...fields })
    .onConflictDoUpdate({
      target: runnerProfiles.userId,
      set: { ...fields, updatedAt: sql`now()` },
    });
}
