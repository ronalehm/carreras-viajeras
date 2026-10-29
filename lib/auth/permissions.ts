import "server-only";
import type { staffRoleEnum } from "@/lib/db-schema";

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type Permission =
  | "crm.access"
  | "staff.manage"
  | "trips.manage"
  | "trips.manage_all"
  | "leads.manage"
  | "bookings.manage"
  | "offers.manage"
  | "offers.view"
  | "sponsors.manage"
  | "sponsor.portal"
  | "content.manage"
  | "rewards.manage"
  | "rewards.apply";

// Roles that hold every known permission.
const FULL_ACCESS_ROLES: readonly StaffRole[] = ["admin", "super_admin"];

// Roles granted each permission besides the full-access roles.
// organizer's trips.manage is limited to its own trips (see tripScopeFor).
const PERMISSION_MATRIX: Readonly<Record<Permission, readonly StaffRole[]>> = {
  "crm.access": ["commercial", "organizer"],
  "staff.manage": [],
  "trips.manage": ["commercial", "organizer"],
  "trips.manage_all": ["commercial"],
  "leads.manage": ["commercial"],
  "bookings.manage": ["commercial"],
  // Offers and exchange rate: commercial reads them (CRM pages without forms); only admin manages.
  "offers.manage": [],
  "offers.view": ["commercial"],
  "sponsors.manage": [],
  // Access also requires an active brand assignment in requireSponsor().
  "sponsor.portal": ["sponsor"],
  "content.manage": [],
  "rewards.manage": [],
  "rewards.apply": ["commercial"],
};

// Roles each actor role may invite, grant or revoke from the CRM.
// super_admin is never manageable from the CRM.
const ROLE_MANAGEMENT: Readonly<Record<StaffRole, readonly StaffRole[]>> = {
  super_admin: ["commercial", "organizer", "admin"],
  admin: ["commercial"],
  commercial: [],
  organizer: [],
  // Sponsor role management is introduced in a later phase, never through team forms.
  sponsor: [],
};

const MANAGEABLE_ROLE_ORDER: readonly StaffRole[] = ["commercial", "organizer", "admin"];

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  if (!Object.hasOwn(PERMISSION_MATRIX, permission)) return false;
  if (roles.some((role) => FULL_ACCESS_ROLES.includes(role))) return true;
  return roles.some((role) => PERMISSION_MATRIX[permission].includes(role));
}

export function manageableRoles(roles: readonly StaffRole[]): StaffRole[] {
  const granted = roles.flatMap((role) =>
    Object.hasOwn(ROLE_MANAGEMENT, role) ? ROLE_MANAGEMENT[role] : [],
  );
  return MANAGEABLE_ROLE_ORDER.filter((role) => granted.includes(role));
}

export function canManageRole(roles: readonly StaffRole[], role: StaffRole): boolean {
  return manageableRoles(roles).includes(role);
}

// Disabling and deleting accounts belongs to super_admin only. Kept out of the matrix on purpose:
// FULL_ACCESS_ROLES would grant any matrix permission to admin (accounts-role-requests, Decision 7).
export function canRemoveAccounts(roles: readonly StaffRole[]): boolean {
  return roles.includes("super_admin");
}
