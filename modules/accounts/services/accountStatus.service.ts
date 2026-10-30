import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { AccountStatus, DeleteAccountInput } from "../types/accountStatus.types";

// Disable, reactivate and delete accounts (accounts-role-requests R13–R15). Only super_admin calls
// these, after the action's guard; the actor never comes from the form. No statement selects or
// returns contact or sensitive data: only flags.

// Active super_admin assignment of the profile `p`: such accounts are never touched (protected).
const IS_PROTECTED = sql`EXISTS (
  SELECT 1 FROM staff_assignments sa
  WHERE sa.user_id = p.user_id AND sa.role = 'super_admin' AND sa.revoked_at IS NULL
)`;

// Same lock as revokeStaffRole: every active admin row, FOR UPDATE in a fixed order, before the
// count. A concurrent revocation or disabling waits and re-reads, so the last admin always stays.
const LOCKED_ADMINS = sql`admins AS MATERIALIZED (
  SELECT id, user_id FROM staff_assignments
  WHERE role = 'admin' AND revoked_at IS NULL
  ORDER BY id
  FOR UPDATE
)`;

// The profile `p` holds the only active admin assignment.
const IS_LAST_ADMIN = sql`(
  EXISTS (SELECT 1 FROM admins WHERE admins.user_id = p.user_id)
  AND NOT EXISTS (SELECT 1 FROM admins WHERE admins.user_id <> p.user_id)
)`;

type Diagnosis = {
  done: boolean;
  found: boolean;
  is_protected: boolean;
  is_last_admin: boolean;
};

export type DisableAccountResult = "disabled" | "not_found" | "protected" | "last_admin";
export type ReactivateAccountResult = "reactivated" | "not_found" | "protected";
export type DeleteAccountResult =
  | "deleted"
  | "not_found"
  | "protected"
  | "last_admin"
  | "email_mismatch";

export type AccountState = { status: AccountStatus; protected: boolean };

// What "Reintentar en Clerk" must repeat. null = the account has no profiles row.
export async function getAccountState(userId: string): Promise<AccountState | null> {
  const result = await getDb().execute<{ status: AccountStatus; is_protected: boolean }>(sql`
    SELECT
      CASE
        WHEN p.deleted_at IS NOT NULL THEN 'deleted'
        WHEN p.disabled_at IS NOT NULL THEN 'disabled'
        ELSE 'active'
      END AS status,
      ${IS_PROTECTED} AS is_protected
    FROM profiles p
    WHERE p.user_id = ${userId}
  `);
  const [row] = result.rows;
  return row ? { status: row.status, protected: row.is_protected } : null;
}

// One statement: sets disabled_* and revokes every active assignment and rejects the pending role
// requests (revoked_by / decided_by = actor). It does
// nothing when the account is missing, already disabled or deleted (not_found), holds super_admin
// (protected) or holds the last active admin assignment (last_admin).
export async function disableAccount(
  userId: string,
  actorUserId: string,
): Promise<DisableAccountResult> {
  const result = await getDb().execute<Diagnosis>(sql`
    WITH ${LOCKED_ADMINS},
    target AS (
      SELECT p.user_id, ${IS_PROTECTED} AS is_protected, ${IS_LAST_ADMIN} AS is_last_admin
      FROM profiles p
      WHERE p.user_id = ${userId} AND p.disabled_at IS NULL AND p.deleted_at IS NULL
    ),
    disabled AS (
      UPDATE profiles
      SET disabled_at = now(), disabled_by = ${actorUserId}
      FROM target
      WHERE profiles.user_id = target.user_id
        AND profiles.disabled_at IS NULL
        AND profiles.deleted_at IS NULL
        AND NOT target.is_protected
        AND NOT target.is_last_admin
      RETURNING profiles.user_id
    ),
    revoked AS (
      UPDATE staff_assignments
      SET revoked_at = now(), revoked_by = ${actorUserId}
      WHERE user_id IN (SELECT user_id FROM disabled) AND revoked_at IS NULL
      RETURNING id
    ),
    rejected AS (
      UPDATE role_requests
      SET status = 'rejected', decided_at = now(), decided_by = ${actorUserId}
      WHERE user_id IN (SELECT user_id FROM disabled) AND status = 'pending'
      RETURNING id
    )
    SELECT
      EXISTS (SELECT 1 FROM disabled) AS done,
      EXISTS (SELECT 1 FROM target) AS found,
      coalesce((SELECT is_protected FROM target), false) AS is_protected,
      coalesce((SELECT is_last_admin FROM target), false) AS is_last_admin
  `);
  const [row] = result.rows;
  if (row?.done) return "disabled";
  if (row?.is_protected) return "protected";
  if (row?.is_last_admin) return "last_admin";
  return "not_found";
}

// One statement: clears disabled_* only while deleted_at IS NULL. Roles are not restored: they are
// granted again from the detail page.
export async function reactivateAccount(userId: string): Promise<ReactivateAccountResult> {
  const result = await getDb().execute<Omit<Diagnosis, "is_last_admin">>(sql`
    WITH target AS (
      SELECT p.user_id, ${IS_PROTECTED} AS is_protected
      FROM profiles p
      WHERE p.user_id = ${userId} AND p.disabled_at IS NOT NULL AND p.deleted_at IS NULL
    ),
    reactivated AS (
      UPDATE profiles
      SET disabled_at = NULL, disabled_by = NULL
      FROM target
      WHERE profiles.user_id = target.user_id
        AND profiles.disabled_at IS NOT NULL
        AND profiles.deleted_at IS NULL
        AND NOT target.is_protected
      RETURNING profiles.user_id
    )
    SELECT
      EXISTS (SELECT 1 FROM reactivated) AS done,
      EXISTS (SELECT 1 FROM target) AS found,
      coalesce((SELECT is_protected FROM target), false) AS is_protected
  `);
  const [row] = result.rows;
  if (row?.done) return "reactivated";
  if (row?.is_protected) return "protected";
  return "not_found";
}

// One db.batch (one transaction). The first statement is the gate: it checks the typed email
// against profiles.email, super_admin and the last admin, anonymizes the email and sets disabled_*
// (if unset) and deleted_*. Every following statement only acts when this transaction deleted the
// profile (deleted_at = now(), constant within the transaction), so a refused gate changes nothing.
export async function deleteAccount(
  input: DeleteAccountInput,
  actorUserId: string,
): Promise<DeleteAccountResult> {
  const { userId, confirmEmail } = input;
  const db = getDb();
  const deletedHere = sql`EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = ${userId} AND deleted_by = ${actorUserId} AND deleted_at = now()
  )`;

  const [gate] = await db.batch([
    db.execute<Diagnosis & { email_matches: boolean }>(sql`
      WITH ${LOCKED_ADMINS},
      target AS (
        SELECT p.user_id,
               p.email = ${confirmEmail} AS email_matches,
               ${IS_PROTECTED} AS is_protected,
               ${IS_LAST_ADMIN} AS is_last_admin
        FROM profiles p
        WHERE p.user_id = ${userId} AND p.deleted_at IS NULL
      ),
      deleted AS (
        UPDATE profiles
        SET email = 'deleted-' || md5(profiles.user_id) || '@invalid',
            disabled_at = coalesce(profiles.disabled_at, now()),
            disabled_by = CASE WHEN profiles.disabled_at IS NULL THEN ${actorUserId} ELSE profiles.disabled_by END,
            deleted_at = now(),
            deleted_by = ${actorUserId}
        FROM target
        WHERE profiles.user_id = target.user_id
          AND profiles.deleted_at IS NULL
          AND target.email_matches
          AND NOT target.is_protected
          AND NOT target.is_last_admin
        RETURNING profiles.user_id
      )
      SELECT
        EXISTS (SELECT 1 FROM deleted) AS done,
        EXISTS (SELECT 1 FROM target) AS found,
        coalesce((SELECT email_matches FROM target), false) AS email_matches,
        coalesce((SELECT is_protected FROM target), false) AS is_protected,
        coalesce((SELECT is_last_admin FROM target), false) AS is_last_admin
    `),
    // Revoke every active assignment (the gate already enforced the last admin rule).
    db.execute(sql`
      UPDATE staff_assignments
      SET revoked_at = now(), revoked_by = ${actorUserId}
      WHERE user_id = ${userId} AND revoked_at IS NULL AND ${deletedHere}
    `),
    // Reject pending role requests.
    db.execute(sql`
      UPDATE role_requests
      SET status = 'rejected', decided_at = now(), decided_by = ${actorUserId}
      WHERE user_id = ${userId} AND status = 'pending' AND ${deletedHere}
    `),
    // Own personal data: the runner profile.
    db.execute(sql`
      DELETE FROM runner_profiles
      WHERE user_id = ${userId} AND ${deletedHere}
    `),
    // The referral code, unless runner_referrals still references it (FK restrict, kept for its
    // accounting value): then it is only deactivated, so its link stops crediting referrals.
    db.execute(sql`
      DELETE FROM referral_codes
      WHERE user_id = ${userId}
        AND NOT EXISTS (SELECT 1 FROM runner_referrals WHERE referrer_user_id = ${userId})
        AND ${deletedHere}
    `),
    db.execute(sql`
      UPDATE referral_codes
      SET active = false
      WHERE user_id = ${userId} AND active AND ${deletedHere}
    `),
    // Bookings keep their participant data (commercial record) but are no longer linked.
    db.execute(sql`
      UPDATE bookings
      SET runner_user_id = NULL, updated_at = now()
      WHERE runner_user_id = ${userId} AND ${deletedHere}
    `),
  ]);

  const [row] = gate.rows;
  if (row?.done) return "deleted";
  if (!row?.found) return "not_found";
  if (row.is_protected) return "protected";
  if (!row.email_matches) return "email_mismatch";
  if (row.is_last_admin) return "last_admin";
  return "not_found";
}
