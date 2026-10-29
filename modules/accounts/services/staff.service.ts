import "server-only";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { StaffRole } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { staffInvitations } from "@/lib/db-schema";
import type {
  InviteStaffInput,
  PendingInvitation,
  StaffRoleChangeInput,
} from "../types/staff.types";

// Same predicate as the staff_invitations_pending_email_uq partial index (expiry is checked separately).
const pendingInvitation = and(isNull(staffInvitations.acceptedAt), isNull(staffInvitations.revokedAt));

// One SELECT; the expiry flag comes from the database clock, the same one that decides whether
// an invitation can still be accepted.
export async function listPendingInvitations(): Promise<PendingInvitation[]> {
  return getDb()
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      role: staffInvitations.role,
      expiresAt: staffInvitations.expiresAt,
      expired: sql<boolean>`${staffInvitations.expiresAt} <= now()`,
    })
    .from(staffInvitations)
    .where(pendingInvitation)
    .orderBy(asc(staffInvitations.createdAt));
}

// One batch (one transaction): revoke this email's expired pending invitation, then insert.
// The partial unique index turns a still-valid pending invitation into a no-op insert.
export async function createInvitation(
  input: InviteStaffInput,
  actorUserId: string,
): Promise<{ id: string; expiresAt: Date } | "pending_invitation_exists"> {
  const db = getDb();
  const [, inserted] = await db.batch([
    db
      .update(staffInvitations)
      .set({ revokedAt: sql`now()`, revokedBy: actorUserId })
      .where(
        and(
          eq(staffInvitations.email, input.email),
          pendingInvitation,
          lte(staffInvitations.expiresAt, sql`now()`),
        ),
      ),
    db
      .insert(staffInvitations)
      .values({ email: input.email, role: input.role, invitedBy: actorUserId })
      .onConflictDoNothing({ target: staffInvitations.email, where: pendingInvitation })
      .returning({ id: staffInvitations.id, expiresAt: staffInvitations.expiresAt }),
  ]);
  return inserted[0] ?? "pending_invitation_exists";
}

// false = not_found: missing, already accepted, already revoked or its role is not one of `roles`
// (the roles the actor may manage). The role filter lives in the same UPDATE, so there is no TOCTOU.
export async function revokeInvitation(
  invitationId: string,
  actorUserId: string,
  roles: readonly StaffRole[],
): Promise<boolean> {
  if (roles.length === 0) return false;
  const rows = await getDb()
    .update(staffInvitations)
    .set({ revokedAt: sql`now()`, revokedBy: actorUserId })
    .where(
      and(
        eq(staffInvitations.id, invitationId),
        pendingInvitation,
        inArray(staffInvitations.role, roles),
      ),
    )
    .returning({ id: staffInvitations.id });
  return rows.length > 0;
}

// false = no_change: the user has no staff profile or the role is already active.
export async function grantStaffRole(
  input: StaffRoleChangeInput,
  actorUserId: string,
): Promise<boolean> {
  const result = await getDb().execute(sql`
    INSERT INTO staff_assignments (user_id, role, reason, granted_by)
    SELECT profiles.user_id, ${input.role}::staff_role, 'crm-admin', ${actorUserId}
    FROM profiles
    WHERE profiles.user_id = ${input.userId}
    ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING
    RETURNING id
  `);
  return result.rows.length > 0;
}

// One statement. The admins CTE locks every active admin row (FOR UPDATE, fixed order) before
// the UPDATE checks the count: a concurrent revocation waits, re-reads the rows and sees the
// remaining admins, so two revocations can never remove the last two admins.
export async function revokeStaffRole(
  input: StaffRoleChangeInput,
  actorUserId: string,
): Promise<"revoked" | "not_found" | "last_admin"> {
  const result = await getDb().execute<{ revoked: boolean; target_is_active_admin: boolean }>(sql`
    WITH admins AS MATERIALIZED (
      SELECT id, user_id FROM staff_assignments
      WHERE role = 'admin' AND revoked_at IS NULL
      ORDER BY id
      FOR UPDATE
    ),
    revoked AS (
      UPDATE staff_assignments
      SET revoked_at = now(), revoked_by = ${actorUserId}
      WHERE user_id = ${input.userId}
        AND role = ${input.role}::staff_role
        AND revoked_at IS NULL
        AND (${input.role}::staff_role <> 'admin' OR (SELECT count(*) FROM admins) > 1)
      RETURNING id
    )
    SELECT
      EXISTS (SELECT 1 FROM revoked) AS revoked,
      (${input.role}::staff_role = 'admin' AND EXISTS (SELECT 1 FROM admins WHERE user_id = ${input.userId}))
        AS target_is_active_admin
  `);
  const [row] = result.rows;
  if (row?.revoked) return "revoked";
  return row?.target_is_active_admin ? "last_admin" : "not_found";
}
