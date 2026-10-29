import type { z } from "zod";
import type { StaffRole } from "@/lib/auth/permissions";
import type { userRoleFilterSchema } from "../schemas/userDirectory.schema";
import type { StaffMember } from "./staff.types";

// "runner" is derived (runner profile or a linked booking), never a staff_role value.
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
  // Has a runner profile or at least one linked booking (cancelled ones included).
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
  isRunner: boolean;
};
