// No server-only: client components import these labels. Type-only import keeps the guard out of the bundle.
import type { StaffRole } from "@/lib/auth/permissions";
import type { UserRoleFilter } from "../types/userDirectory.types";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  commercial: "Comercial",
  admin: "Admin",
  super_admin: "Super admin",
  organizer: "Organizador",
  sponsor: "Patrocinador",
};


// Directory filters include assignment roles and the derived runner classification.
export const USER_ROLE_FILTER_LABELS: Record<UserRoleFilter, string> = {
  ...STAFF_ROLE_LABELS,
  runner: "Runner",
};

export function formatAssignmentLabel(role: StaffRole, sponsorName: string | null): string {
  const label = STAFF_ROLE_LABELS[role];
  return role === "sponsor" && sponsorName ? `${label} · ${sponsorName}` : label;
}

// The CRM time zone and its date formatting live in lib/dates.ts (shared with the crm module).
export { CRM_TIME_ZONE, formatDateTime as formatStaffDateTime } from "@/lib/dates";
