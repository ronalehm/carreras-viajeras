// No server-only: client components import these labels. Type-only import keeps the guard out of the bundle.
import type { StaffRole } from "@/lib/auth/permissions";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  commercial: "Comercial",
  admin: "Admin",
};

// The CRM time zone and its date formatting live in lib/dates.ts (shared with the crm module).
export { CRM_TIME_ZONE, formatDateTime as formatStaffDateTime } from "@/lib/dates";
