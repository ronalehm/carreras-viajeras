import "server-only";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, profiles, runnerProfiles, sponsors, staffAssignments } from "@/lib/db-schema";
import type { StaffRole } from "@/lib/auth/permissions";
import type { UserDetail, UserListFilter, UserListItem } from "../types/userDirectory.types";

// Admin-only reads (the pages call them after getCrmAccess("staff.manage") returns ok).
// Errors propagate unwrapped and unlogged: a Postgres error may carry row values.

export const USER_LIST_LIMIT = 200;

// Same bound as the userId of staffRoleChangeSchema; anything else cannot be an account id.
const MAX_USER_ID_LENGTH = 255;

type UserListRow = {
  user_id: string;
  name: string | null;
  email: string;
  roles: StaffRole[];
  sponsor_name: string | null;
  is_runner: boolean;
  // count(*) is bigint: text on the wire.
  active_bookings: string | number;
};

function listConditions({ q, role }: UserListFilter): SQL {
  const conditions: SQL[] = [];
  // strpos is a literal substring match: % and _ are not wildcards.
  if (q !== undefined) {
    conditions.push(
      sql`(strpos(lower(coalesce(name, '')), lower(${q})) > 0 OR strpos(lower(email), lower(${q})) > 0)`,
    );
  }
  if (role === "runner") conditions.push(sql`is_runner`);
  else if (role !== undefined) conditions.push(sql`${role}::text = ANY (roles)`);
  return conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

// One statement: everyone with a role profile, a runner profile or a linked booking.
// Only presentation columns: no phone, birth date, document, emergency contact, medical notes,
// internal notes or amounts. One extra row tells whether the list was cut at the limit.
export async function listUsers(
  filter: UserListFilter,
): Promise<{ users: UserListItem[]; truncated: boolean }> {
  const result = await getDb().execute<UserListRow>(sql`
    WITH ids AS (
      SELECT user_id FROM profiles
      UNION SELECT user_id FROM runner_profiles
      UNION SELECT runner_user_id FROM bookings WHERE runner_user_id IS NOT NULL
    ),
    directory AS (
      SELECT ids.user_id,
             coalesce(rp.full_name, lb.participant_name) AS name,
             coalesce(p.email, rp.email, lb.participant_email) AS email,
             coalesce(a.roles, '{}') AS roles,
             a.sponsor_name,
             (rp.user_id IS NOT NULL OR lb.participant_email IS NOT NULL) AS is_runner,
             coalesce(bk.active, 0) AS active_bookings
      FROM ids
      LEFT JOIN profiles p ON p.user_id = ids.user_id
      LEFT JOIN runner_profiles rp ON rp.user_id = ids.user_id
      LEFT JOIN LATERAL (
        SELECT array_agg(sa.role::text ORDER BY sa.role) AS roles, max(s.name) AS sponsor_name
        FROM staff_assignments sa
        LEFT JOIN sponsors s ON s.id = sa.sponsor_id
        WHERE sa.user_id = ids.user_id AND sa.revoked_at IS NULL
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE b.status <> 'cancelled') AS active
        FROM bookings b
        WHERE b.runner_user_id = ids.user_id
      ) bk ON true
      LEFT JOIN LATERAL (
        SELECT b.participant_name, b.participant_email
        FROM bookings b
        WHERE b.runner_user_id = ids.user_id
        ORDER BY b.created_at DESC, b.id
        LIMIT 1
      ) lb ON true
    )
    SELECT user_id, name, email, roles, sponsor_name, is_runner, active_bookings
    FROM directory
    ${listConditions(filter)}
    ORDER BY lower(coalesce(name, email)), user_id
    LIMIT ${USER_LIST_LIMIT + 1}
  `);
  const rows = result.rows;
  return {
    users: rows.slice(0, USER_LIST_LIMIT).map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      roles: row.roles,
      sponsorName: row.sponsor_name,
      isRunner: row.is_runner,
      activeBookings: Number(row.active_bookings),
    })),
    truncated: rows.length > USER_LIST_LIMIT,
  };
}

// One batch, every statement filtered by this id. Identity (requirement 5): runner profile name,
// then the latest linked booking; email from profiles, then the runner profile, then that booking.
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  if (userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) return null;

  const db = getDb();
  const [profileRows, assignmentRows, runnerRows, bookingRows] = await db.batch([
    db.select({ email: profiles.email }).from(profiles).where(eq(profiles.userId, userId)),
    db
      .select({
        role: staffAssignments.role,
        grantedAt: staffAssignments.grantedAt,
        sponsorId: staffAssignments.sponsorId,
        sponsorName: sponsors.name,
      })
      .from(staffAssignments)
      .leftJoin(sponsors, eq(sponsors.id, staffAssignments.sponsorId))
      .where(and(eq(staffAssignments.userId, userId), isNull(staffAssignments.revokedAt)))
      .orderBy(asc(staffAssignments.role)),
    db
      .select({ fullName: runnerProfiles.fullName, email: runnerProfiles.email })
      .from(runnerProfiles)
      .where(eq(runnerProfiles.userId, userId)),
    db
      .select({ participantName: bookings.participantName, participantEmail: bookings.participantEmail })
      .from(bookings)
      .where(eq(bookings.runnerUserId, userId))
      .orderBy(desc(bookings.createdAt), asc(bookings.id))
      .limit(1),
  ]);

  const [profile] = profileRows;
  const [runner] = runnerRows;
  const [latestBooking] = bookingRows;
  const email = profile?.email ?? runner?.email ?? latestBooking?.participantEmail;
  if (email === undefined) return null;

  const sponsorAssignment = assignmentRows.find(({ role }) => role === "sponsor");
  return {
    userId,
    name: runner?.fullName ?? latestBooking?.participantName ?? null,
    email,
    hasRoleProfile: profile !== undefined,
    member:
      assignmentRows.length > 0
        ? { userId, email, roles: assignmentRows.map(({ role, grantedAt }) => ({ role, grantedAt })) }
        : null,
    sponsor:
      sponsorAssignment?.sponsorId && sponsorAssignment.sponsorName !== null
        ? { id: sponsorAssignment.sponsorId, name: sponsorAssignment.sponsorName }
        : null,
    isRunner: runner !== undefined || latestBooking !== undefined,
  };
}
