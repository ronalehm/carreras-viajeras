import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, roleRequests } from "@/lib/db-schema";
import type { OwnPendingRoleRequest, PendingRoleRequest } from "../types/roleRequest.types";

// The only role that can be requested today (spec accounts-role-requests, Requirement 8).
const REQUESTED_ROLE = "admin";

const pendingRequest = eq(roleRequests.status, "pending");

export async function getPendingRoleRequest(userId: string): Promise<OwnPendingRoleRequest | null> {
  const [row] = await getDb()
    .select({ createdAt: roleRequests.createdAt })
    .from(roleRequests)
    .where(and(eq(roleRequests.userId, userId), pendingRequest))
    .limit(1);
  return row ?? null;
}

// Idempotent: the role_requests_pending_user_uq partial index turns a second pending request of
// the same account into a no-op, so repeating it is the same success.
export async function createAdminRoleRequest(userId: string): Promise<void> {
  await getDb()
    .insert(roleRequests)
    .values({ userId, role: REQUESTED_ROLE })
    .onConflictDoNothing();
}

// Id, email and date only (minimization).
export async function listPendingRoleRequests(): Promise<PendingRoleRequest[]> {
  return getDb()
    .select({ id: roleRequests.id, email: profiles.email, createdAt: roleRequests.createdAt })
    .from(roleRequests)
    .innerJoin(profiles, eq(profiles.userId, roleRequests.userId))
    .where(pendingRequest)
    .orderBy(asc(roleRequests.createdAt));
}

// One statement: the UPDATE only matches a pending request (a concurrent decision waits on the row
// lock and then matches nothing), and the INSERT only grants what that UPDATE returned.
// Data-modifying CTEs always run to completion. false = not_found (missing, already decided, or the
// account is disabled or deleted: the request stays pending and nothing is granted).
export async function approveRoleRequest(requestId: string, actorUserId: string): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    WITH approved AS (
      UPDATE role_requests
      SET status = 'approved', decided_at = now(), decided_by = ${actorUserId}
      WHERE id = ${requestId}
        AND status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.user_id = role_requests.user_id AND p.disabled_at IS NOT NULL
        )
      RETURNING id, user_id, role
    ),
    granted AS (
      INSERT INTO staff_assignments (user_id, role, reason, granted_by)
      SELECT user_id, role, 'role_request:' || id::text, ${actorUserId}
      FROM approved
      ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING
      RETURNING id
    )
    SELECT id FROM approved
  `);
  return result.rows.length > 0;
}

// false = not_found (missing or already decided). No assignment: the account may request again.
export async function rejectRoleRequest(requestId: string, actorUserId: string): Promise<boolean> {
  const rows = await getDb()
    .update(roleRequests)
    .set({ status: "rejected", decidedAt: sql`now()`, decidedBy: actorUserId })
    .where(and(eq(roleRequests.id, requestId), pendingRequest))
    .returning({ id: roleRequests.id });
  return rows.length > 0;
}
