// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StaffRole } from "@/lib/auth/permissions";
import { tripScopeFor } from "./tripScope";

const USER_ID = "user_2abcOrganizer";

function scopeOf(staffRoles: readonly StaffRole[]) {
  return tripScopeFor({ id: USER_ID, staffRoles });
}

describe("tripScopeFor", () => {
  it.each<StaffRole>(["commercial", "admin", "super_admin"])(
    "gives %s access to every trip",
    (role) => {
      expect(scopeOf([role])).toEqual({ kind: "all" });
    },
  );

  it("limits an organizer to their own trips", () => {
    expect(scopeOf(["organizer"])).toEqual({ kind: "own", organizerId: USER_ID });
  });

  it("uses the organizer's own id as organizerId", () => {
    expect(tripScopeFor({ id: "user_other", staffRoles: ["organizer"] })).toEqual({
      kind: "own",
      organizerId: "user_other",
    });
  });

  it.each<[string, StaffRole[]]>([
    ["organizer + commercial", ["organizer", "commercial"]],
    ["commercial + organizer", ["commercial", "organizer"]],
    ["organizer + admin", ["organizer", "admin"]],
    ["organizer + super_admin", ["organizer", "super_admin"]],
  ])("widens %s to every trip", (_label, roles) => {
    expect(scopeOf(roles)).toEqual({ kind: "all" });
  });

  it("never grants every trip without roles (deny by default)", () => {
    expect(scopeOf([])).toEqual({ kind: "own", organizerId: USER_ID });
  });

  it("does not widen the scope for an unknown role", () => {
    expect(scopeOf(["unknown" as StaffRole])).toEqual({ kind: "own", organizerId: USER_ID });
  });
});
