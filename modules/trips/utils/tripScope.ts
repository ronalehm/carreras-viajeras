import "server-only";
import { can, type StaffRole } from "@/lib/auth/permissions";
import type { TripScope } from "../types/trips.types";

// Deny by default: only trips.manage_all widens the scope to every trip; anyone else is limited
// to the trips they organize.
export function tripScopeFor(user: { id: string; staffRoles: readonly StaffRole[] }): TripScope {
  if (can(user.staffRoles, "trips.manage_all")) return { kind: "all" };
  return { kind: "own", organizerId: user.id };
}
