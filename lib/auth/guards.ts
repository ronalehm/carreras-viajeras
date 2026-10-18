import "server-only";
import { cache } from "react";
import { z } from "zod";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { can, type Permission, type StaffRole } from "@/lib/auth/permissions";
import { getAuth } from "@/lib/auth/server";

export type CurrentUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  staffRoles: StaffRole[];
};

// Minimal trusted shape; z.object drops any extra user field (role, staffRoles, …).
const sessionSchema = z.object({
  user: z.object({
    id: z.string().min(1).max(255),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
});

async function readSessionUser() {
  try {
    const { data, error } = await getAuth().getSession();
    if (error || !data) return null;
    const parsed = sessionSchema.safeParse(data);
    return parsed.success ? parsed.data.user : null;
  } catch {
    return null;
  }
}

async function loadRoles(id: string, email: string, emailVerified: boolean) {
  try {
    return emailVerified
      ? await acceptInvitationAndLoadStaffRoles(id, email)
      : await loadStaffRoles(id);
  } catch {
    // Fail closed without exposing the original database message.
    throw new ForbiddenError();
  }
}

// cache() only memoizes within one RSC render; route handlers and actions query every call.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await readSessionUser();
  if (!user) return null;
  const email = user.email.trim().toLowerCase();
  const staffRoles = await loadRoles(user.id, email, user.emailVerified);
  return { id: user.id, email, emailVerified: user.emailVerified, staffRoles };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireVerifiedEmail(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.emailVerified) throw new ForbiddenError();
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireVerifiedEmail();
  if (!can(user.staffRoles, permission)) throw new ForbiddenError();
  return user;
}

export function requireCrmUser(): Promise<CurrentUser> {
  return requirePermission("crm.access");
}
