import "server-only";
import type { staffRoleEnum } from "@/lib/db-schema";

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type Permission =
  | "crm.access"
  | "staff.manage"
  | "trips.manage"
  | "leads.manage"
  | "bookings.manage"
  | "offers.manage"
  | "offers.view";

// Roles granted each permission besides admin, which has every known permission.
const PERMISSION_MATRIX: Readonly<Record<Permission, readonly StaffRole[]>> = {
  "crm.access": ["commercial"],
  "staff.manage": [],
  "trips.manage": ["commercial"],
  "leads.manage": ["commercial"],
  "bookings.manage": ["commercial"],
  // Offers and exchange rate: commercial reads them (CRM pages without forms); only admin manages.
  "offers.manage": [],
  "offers.view": ["commercial"],
};

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  if (!Object.hasOwn(PERMISSION_MATRIX, permission)) return false;
  if (roles.includes("admin")) return true;
  return roles.some((role) => PERMISSION_MATRIX[permission].includes(role));
}
