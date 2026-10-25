// No server-only: client components import these labels. Type-only import keeps the guard out of the bundle.
import type { StaffRole } from "@/lib/auth/permissions";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  commercial: "Comercial",
  admin: "Admin",
  sponsor: "Patrocinador",
};

// Provisional CRM time zone (spec accounts-roles-permissions, open question 5).
export const CRM_TIME_ZONE = "America/Lima";

const staffDateTimeFormat = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CRM_TIME_ZONE,
});

export function formatStaffDateTime(date: Date): string {
  return staffDateTimeFormat.format(date);
}
