import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { z } from "zod";
import {
  acceptInvitationAndLoadStaffRoles,
  loadSponsorId,
  loadStaffRoles,
} from "@/lib/auth/access.service";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { can, type Permission, type StaffRole } from "@/lib/auth/permissions";

export type CurrentUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  staffRoles: StaffRole[];
  name?: string;
  // Only present on an account disabled or deleted from the CRM: staffRoles is then always empty
  // and requireUser (so every guard built on it) throws ForbiddenError("account_disabled").
  blocked?: true;
};

export type SponsorUser = CurrentUser & { sponsorId: string };

// Minimal trusted shape of the Clerk Backend User; z.object drops every other field
// (publicMetadata, unsafeMetadata, …), so nothing in Clerk can grant roles.
const clerkUserSchema = z.object({
  id: z.string().min(1).max(255),
  primaryEmailAddressId: z.string().nullable(),
  firstName: z.string().nullable().optional().catch(undefined),
  lastName: z.string().nullable().optional().catch(undefined),
  emailAddresses: z.array(
    z.object({
      id: z.string(),
      emailAddress: z.string(),
      verification: z.object({ status: z.string() }).nullable(),
    }),
  ),
});

// Verifies the session token (no database). Pending sessions count as signed out (Clerk default).
async function readSessionUserId(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId;
  } catch {
    // Fail closed (401) but leave a trace, e.g. a missing CLERK_SECRET_KEY or a route outside
    // the middleware matcher. Fixed text only: the original error may contain secrets or data.
    console.error("auth: session lookup failed");
    return null;
  }
}

async function readClerkUser() {
  try {
    return await currentUser();
  } catch {
    // 403, not 401: a signed-in user must not bounce between /crm/acceso and /crm.
    console.error("auth: user lookup failed");
    throw new ForbiddenError("user_lookup_failed");
  }
}

async function readSessionUser() {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const parsed = clerkUserSchema.safeParse(await readClerkUser());
  if (!parsed.success || parsed.data.id !== userId) return null;
  const { primaryEmailAddressId, emailAddresses } = parsed.data;
  const primary = emailAddresses.find((address) => address.id === primaryEmailAddressId);
  const name = [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ").trim();
  return {
    id: userId,
    email: primary?.emailAddress.trim().toLowerCase() ?? "",
    emailVerified: primary?.verification?.status === "verified",
    ...(name ? { name } : {}),
  };
}

async function loadRoles(id: string, email: string, emailVerified: boolean) {
  try {
    return emailVerified
      ? await acceptInvitationAndLoadStaffRoles(id, email)
      : await loadStaffRoles(id);
  } catch (error) {
    // Fail closed without exposing the original database message, but leave a trace. A
    // misconfigured secret (e.g. pasted with spaces) names the field, never its value.
    if (error instanceof Error && error.name === "InvalidEnvironmentError") {
      console.error(`auth: role lookup failed (${error.message})`);
      throw new ForbiddenError("role_lookup_failed", "configuration");
    }
    const sqlState = findSqlState(error);
    console.error(sqlState ? `auth: role lookup failed (SQLSTATE ${sqlState})` : "auth: role lookup failed");
    throw new ForbiddenError("role_lookup_failed", sqlState);
  }
}

// PostgreSQL error class (e.g. 42703 undefined column, 28P01 bad password) from the Neon error,
// which Drizzle wraps in `cause`. Only the 5-character code, never the message.
function findSqlState(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

// cache() only memoizes within one RSC render; route handlers and actions query every call.
// A blocked account keeps its identity (so pages can explain the denial) but never any role.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await readSessionUser();
  if (!user) return null;
  const { staffRoles, blocked } = await loadRoles(user.id, user.email, user.emailVerified);
  return blocked ? { ...user, staffRoles: [], blocked: true } : { ...user, staffRoles };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (user.blocked) throw new ForbiddenError("account_disabled");
  return user;
}

export async function requireVerifiedEmail(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.emailVerified) throw new ForbiddenError("email_unverified");
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireVerifiedEmail();
  if (!can(user.staffRoles, permission)) throw new ForbiddenError("missing_permission");
  return user;
}

export function requireCrmUser(): Promise<CurrentUser> {
  return requirePermission("crm.access");
}

async function loadUserSponsorId(userId: string) {
  try {
    return await loadSponsorId(userId);
  } catch {
    // Fail closed without exposing the original database message.
    throw new ForbiddenError();
  }
}

// The portal always needs an active brand assignment, including full-access staff roles.
export async function requireSponsor(): Promise<SponsorUser> {
  const user = await requirePermission("sponsor.portal");
  const sponsorId = await loadUserSponsorId(user.id);
  if (!sponsorId) throw new ForbiddenError();
  return { ...user, sponsorId };
}
