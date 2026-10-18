import "server-only";
import type { staffRoleEnum } from "@/lib/db-schema";

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type Permission = "crm.access" | "staff.manage" | "trips.manage";

// Roles granted each permission besides admin, which has every known permission.
const PERMISSION_MATRIX: Readonly<Record<Permission, readonly StaffRole[]>> = {
  "crm.access": ["commercial"],
  "staff.manage": [],
  "trips.manage": ["commercial"],
};

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  if (!Object.hasOwn(PERMISSION_MATRIX, permission)) return false;
  if (roles.includes("admin")) return true;
  return roles.some((role) => PERMISSION_MATRIX[permission].includes(role));
}
