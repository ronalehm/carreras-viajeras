import type { z } from "zod";
import type { StaffRole } from "@/lib/auth/permissions";
import type { userRoleFilterSchema } from "../schemas/userDirectory.schema";
import type { StaffMember } from "./staff.types";

// "runner" is every account of the directory, never a staff_role value: filtering by it lists everyone.
export type UserRoleFilter = z.infer<typeof userRoleFilterSchema>;

export type UserListFilter = { q?: string; role?: UserRoleFilter };

export type UserListItem = {
  userId: string;
  // Display copies only (runner profile, then the latest linked booking): they never authorize.
  name: string | null;
  email: string;
  // Active assignments, in enum order.
  roles: StaffRole[];
  // Brand of the active sponsor assignment.
  sponsorName: string | null;
  // Always true: every listed account is a Runner (accounts-role-requests R3). Kept for the components.
  isRunner: boolean;
  // Linked bookings that are not cancelled.
  activeBookings: number;
};

export type UserDetail = {
  userId: string;
  name: string | null;
  email: string;
  // Has a row in profiles.
  hasRoleProfile: boolean;
  // Active roles with grantedAt (for StaffTable); null without active roles.
  member: StaffMember | null;
  sponsor: { id: string; name: string } | null;
  // Always true, as in UserListItem.
  isRunner: boolean;
};
