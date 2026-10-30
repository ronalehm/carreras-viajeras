"use server";

import { requireVerifiedEmail } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

// No arguments: the account comes from the session. requireVerifiedEmail registers it in
// profiles (accounts-role-requests R1). Presentation only: the /crm layout stays the guard.
// 401, 403 and any other error answer false; the guards already leave fixed-text traces, and
// nothing about the account is logged here.
export async function registerAccountAction(): Promise<{ canAccessCrm: boolean }> {
  try {
    const user = await requireVerifiedEmail();
    return { canAccessCrm: can(user.staffRoles, "crm.access") };
  } catch {
    return { canAccessCrm: false };
  }
}
