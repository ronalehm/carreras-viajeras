import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { staffAssignments } from "@/lib/db-schema";
import type { StaffRole } from "@/lib/auth/permissions";

type Db = ReturnType<typeof getDb>;

function activeRolesQuery(db: Db, userId: string) {
  return db
    .select({ role: staffAssignments.role })
    .from(staffAssignments)
    .where(and(eq(staffAssignments.userId, userId), isNull(staffAssignments.revokedAt)));
}

// One statement: if the UPDATE matches no pending, unexpired invitation, nothing is inserted.
// Its row lock prevents double acceptance; ON CONFLICT keeps already-active roles idempotent
// (an account that already sponsors a brand keeps it). sponsor_id travels with the invitation.
function acceptInvitationStatement(db: Db, userId: string, email: string) {
  return db.execute(sql`
    WITH accepted AS (
      UPDATE staff_invitations
      SET accepted_at = now(), accepted_user_id = ${userId}
      WHERE email = ${email}
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
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

// email must already be trimmed and lowercased; errors propagate (the guard decides).
export async function acceptInvitationAndLoadStaffRoles(
  userId: string,
  email: string,
): Promise<StaffRole[]> {
  const db = getDb();
  const [, rows] = await db.batch([
    acceptInvitationStatement(db, userId, email),
    activeRolesQuery(db, userId),
  ]);
  return rows.map((row) => row.role);
}

export async function loadStaffRoles(userId: string): Promise<StaffRole[]> {
  const rows = await activeRolesQuery(getDb(), userId);
  return rows.map((row) => row.role);
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
