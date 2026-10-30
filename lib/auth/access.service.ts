import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, staffAssignments } from "@/lib/db-schema";
import type { StaffRole } from "@/lib/auth/permissions";

type Db = ReturnType<typeof getDb>;

// blocked = the account was disabled (or deleted) from the CRM: the guards drop every role.
export type StaffAccess = { staffRoles: StaffRole[]; blocked: boolean };

function activeRolesQuery(db: Db, userId: string) {
  return db
    .select({ role: staffAssignments.role })
    .from(staffAssignments)
    .where(and(eq(staffAssignments.userId, userId), isNull(staffAssignments.revokedAt)));
}

// At most one row; an account without profiles (never registered) is not blocked.
function blockedQuery(db: Db, userId: string) {
  return db
    .select({ blocked: sql<boolean>`${profiles.disabledAt} IS NOT NULL` })
    .from(profiles)
    .where(eq(profiles.userId, userId));
}

function toStaffAccess(
  roleRows: { role: StaffRole }[],
  blockedRows: { blocked: boolean }[],
): StaffAccess {
  const blocked = blockedRows[0]?.blocked === true;
  return { staffRoles: roleRows.map((row) => row.role), blocked };
}

// One statement: if the UPDATE matches no pending, unexpired invitation, nothing is inserted.
// Its row lock prevents double acceptance; ON CONFLICT keeps already-active roles idempotent
// (an account that already sponsors a brand keeps it). sponsor_id travels with the invitation.
// A blocked account (disabled_at set) accepts nothing: the invitation stays pending, no assignment.
function acceptInvitationStatement(db: Db, userId: string, email: string) {
  return db.execute(sql`
    WITH accepted AS (
      UPDATE staff_invitations
      SET accepted_at = now(), accepted_user_id = ${userId}
      WHERE email = ${email}
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM profiles WHERE user_id = ${userId} AND disabled_at IS NOT NULL
        )
      RETURNING id, email, role, invited_by, sponsor_id
    ),
    new_profile AS (
      INSERT INTO profiles (user_id, email)
      SELECT ${userId}, accepted.email FROM accepted
      ON CONFLICT (user_id) DO NOTHING
    )
    INSERT INTO staff_assignments (user_id, role, reason, granted_by, sponsor_id)
    SELECT ${userId}, accepted.role, 'invitation:' || accepted.id::text, accepted.invited_by, accepted.sponsor_id
    FROM accepted
    ON CONFLICT DO NOTHING
  `);
}

// Every account with a verified primary email is known: insert it, or refresh a changed email.
// Touches only (user_id, email), never disabled_* nor deleted_*; the WHERE skips the write when
// nothing changed, and never restores the anonymized email of a deleted account.
function registerProfileStatement(db: Db, userId: string, email: string) {
  return db.execute(sql`
    INSERT INTO profiles (user_id, email)
    VALUES (${userId}, ${email})
    ON CONFLICT (user_id) DO UPDATE SET email = excluded.email
    WHERE profiles.email <> excluded.email AND profiles.deleted_at IS NULL
  `);
}

// email must already be trimmed and lowercased; errors propagate (the guard decides).
// One batch (one HTTP round trip, one transaction): register, accept invitations, load roles and
// whether the account is blocked.
export async function acceptInvitationAndLoadStaffRoles(
  userId: string,
  email: string,
): Promise<StaffAccess> {
  const db = getDb();
  const [, , roleRows, blockedRows] = await db.batch([
    registerProfileStatement(db, userId, email),
    acceptInvitationStatement(db, userId, email),
    activeRolesQuery(db, userId),
    blockedQuery(db, userId),
  ]);
  return toStaffAccess(roleRows, blockedRows);
}

// Unverified accounts: read only (no registration, no invitations), one batch.
export async function loadStaffRoles(userId: string): Promise<StaffAccess> {
  const db = getDb();
  const [roleRows, blockedRows] = await db.batch([
    activeRolesQuery(db, userId),
    blockedQuery(db, userId),
  ]);
  return toStaffAccess(roleRows, blockedRows);
}

// Brand of the active sponsor assignment (at most one per account), or null; errors propagate.
export async function loadSponsorId(userId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ sponsorId: staffAssignments.sponsorId })
    .from(staffAssignments)
    .where(
      and(
        eq(staffAssignments.userId, userId),
        eq(staffAssignments.role, "sponsor"),
        isNull(staffAssignments.revokedAt),
      ),
    )
    .limit(1);
  return rows[0]?.sponsorId ?? null;
}
