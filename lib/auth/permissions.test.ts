// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authErrorResponse, ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  can,
  canManageRole,
  canRemoveAccounts,
  manageableRoles,
  type Permission,
  type StaffRole,
} from "@/lib/auth/permissions";
import { staffRoleEnum } from "@/lib/db-schema";

const ALL_ROLES = staffRoleEnum.enumValues;
const ALL_PERMISSIONS = [
  "crm.access",
  "staff.manage",
  "trips.manage",
  "trips.manage_all",
  "leads.manage",
  "bookings.manage",
  "offers.manage",
  "offers.view",
  "sponsors.manage",
  "sponsor.portal",
  "content.manage",
  "rewards.manage",
  "rewards.apply",
] as const satisfies readonly Permission[];

// Expected matrix from docs/specs/accounts-clerk-rbac.md ("Diseño técnico").
const EXPECTED_MATRIX: Record<Permission, Record<StaffRole, boolean>> = {
  "crm.access": { commercial: true, organizer: true, admin: true, super_admin: true, sponsor: false },
  "staff.manage": { commercial: false, organizer: false, admin: true, super_admin: true, sponsor: false },
  "trips.manage": { commercial: true, organizer: true, admin: true, super_admin: true, sponsor: false },
  "trips.manage_all": { commercial: true, organizer: false, admin: true, super_admin: true, sponsor: false },
  "leads.manage": { commercial: true, organizer: false, admin: true, super_admin: true, sponsor: false },
  "bookings.manage": { commercial: true, organizer: false, admin: true, super_admin: true, sponsor: false },
  "offers.manage": { commercial: false, organizer: false, admin: true, super_admin: true, sponsor: false },
  "offers.view": { commercial: true, organizer: false, admin: true, super_admin: true, sponsor: false },
  "sponsors.manage": { commercial: false, organizer: false, admin: true, super_admin: true, sponsor: false },
  "sponsor.portal": { commercial: false, organizer: false, admin: true, super_admin: true, sponsor: true },
  "content.manage": { commercial: false, organizer: false, admin: true, super_admin: true, sponsor: false },
  "rewards.manage": { commercial: false, organizer: false, admin: true, super_admin: true, sponsor: false },
  "rewards.apply": { commercial: true, organizer: false, admin: true, super_admin: true, sponsor: false },
};

const MATRIX_CELLS = ALL_PERMISSIONS.flatMap((permission) =>
  ALL_ROLES.map(
    (role) => [role, permission, EXPECTED_MATRIX[permission][role]] as [StaffRole, Permission, boolean],
  ),
);

// Every non-empty combination of the current database roles.
const ROLE_COMBINATIONS: StaffRole[][] = Array.from(
  { length: 2 ** ALL_ROLES.length - 1 },
  (_, index) => ALL_ROLES.filter((_, bit) => ((index + 1) >> bit) & 1),
);

describe("can", () => {
  it("covers every staff_role enum value", () => {
    expect(ALL_ROLES).toEqual(["commercial", "admin", "super_admin", "organizer", "sponsor"]);
  });

  it.each(MATRIX_CELLS)("role %s with %s → %s", (role, permission, expected) => {
    expect(can([role], permission)).toBe(expected);
  });

  it.each(ROLE_COMBINATIONS)("roles %j get the union of their permissions", (...roles) => {
    for (const permission of ALL_PERMISSIONS) {
      const expected = roles.some((role) => EXPECTED_MATRIX[permission][role]);
      expect(can(roles, permission)).toBe(expected);
    }
  });

  it.each<StaffRole>(["admin", "super_admin"])("grants %s every permission", (role) => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can([role], permission)).toBe(true);
    }
  });

  it("limits organizer to crm.access and trips.manage", () => {
    expect(ALL_PERMISSIONS.filter((permission) => can(["organizer"], permission))).toEqual([
      "crm.access",
      "trips.manage",
    ]);
  });

  it("denies everything without roles", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can([], permission)).toBe(false);
    }
  });

  it.each(["unknown.permission", "trips.publish", "toString", "constructor", "__proto__"])(
    "denies unknown permission %s to every role",
    (permission) => {
      const unknown = permission as Permission;
      for (const role of ALL_ROLES) {
        expect(can([role], unknown)).toBe(false);
      }
      expect(can([...ALL_ROLES], unknown)).toBe(false);
      expect(can([], unknown)).toBe(false);
    },
  );

  it("gives commercial offers.view but not offers.manage", () => {
    expect(can(["commercial"], "offers.view")).toBe(true);
    expect(can(["commercial"], "offers.manage")).toBe(false);
  });

  it("denies an unknown role", () => {
    const unknown = ["owner"] as unknown as StaffRole[];
    for (const permission of ALL_PERMISSIONS) {
      expect(can(unknown, permission)).toBe(false);
    }
  });
});

// Expected actor × target role table from docs/specs/accounts-role-requests.md (R19), which
// amends the one in accounts-clerk-rbac.md.
const EXPECTED_MANAGEABLE: Record<StaffRole, StaffRole[]> = {
  super_admin: ["commercial", "organizer", "sponsor", "admin"],
  admin: ["commercial", "organizer", "sponsor"],
  commercial: [],
  organizer: [],
  sponsor: [],
};

describe("manageableRoles", () => {
  it.each<[StaffRole[], StaffRole[]]>([
    [["super_admin"], ["commercial", "organizer", "sponsor", "admin"]],
    [["admin"], ["commercial", "organizer", "sponsor"]],
    [["admin", "super_admin"], ["commercial", "organizer", "sponsor", "admin"]],
    [["super_admin", "admin"], ["commercial", "organizer", "sponsor", "admin"]],
    [["commercial"], []],
    [["organizer"], []],
    [["sponsor"], []],
    [["commercial", "organizer"], []],
    [["commercial", "admin"], ["commercial", "organizer", "sponsor"]],
    [["sponsor", "admin"], ["commercial", "organizer", "sponsor"]],
    [["organizer", "super_admin"], ["commercial", "organizer", "sponsor", "admin"]],
    [[], []],
  ])("roles %j → %j", (roles, expected) => {
    expect(manageableRoles(roles)).toEqual(expected);
  });

  it.each(ROLE_COMBINATIONS)(
    "roles %j get the union, in order, without duplicates or super_admin",
    (...roles) => {
      const result = manageableRoles(roles);
      const union = new Set(roles.flatMap((role) => EXPECTED_MANAGEABLE[role]));
      expect(result).toEqual(
        (["commercial", "organizer", "sponsor", "admin"] as const).filter((role) => union.has(role)),
      );
      expect(new Set(result).size).toBe(result.length);
      expect(result).not.toContain("super_admin");
    },
  );

  it("never includes super_admin, even for every role at once", () => {
    expect(manageableRoles([...ALL_ROLES])).toEqual(["commercial", "organizer", "sponsor", "admin"]);
  });

  it("ignores unknown roles", () => {
    expect(manageableRoles(["owner", "toString"] as unknown as StaffRole[])).toEqual([]);
  });

  it("returns a new array each call", () => {
    const first = manageableRoles(["super_admin"]);
    first.push("super_admin");
    expect(manageableRoles(["super_admin"])).toEqual(["commercial", "organizer", "sponsor", "admin"]);
  });

  it("gives admin commercial, organizer and sponsor, and super_admin also admin (accounts-role-requests F4)", () => {
    expect(manageableRoles(["admin"])).toEqual(["commercial", "organizer", "sponsor"]);
    expect(manageableRoles(["super_admin"])).toEqual(["commercial", "organizer", "sponsor", "admin"]);
  });
});

describe("canManageRole", () => {
  const ACTOR_TARGET_CELLS = ALL_ROLES.flatMap((actor) =>
    ALL_ROLES.map(
      (target) =>
        [actor, target, EXPECTED_MANAGEABLE[actor].includes(target)] as [
          StaffRole,
          StaffRole,
          boolean,
        ],
    ),
  );

  it.each(ACTOR_TARGET_CELLS)("actor %s managing %s → %s", (actor, target, expected) => {
    expect(canManageRole([actor], target)).toBe(expected);
  });

  it.each(ROLE_COMBINATIONS)("roles %j match manageableRoles for every target", (...roles) => {
    for (const target of ALL_ROLES) {
      expect(canManageRole(roles, target)).toBe(manageableRoles(roles).includes(target));
    }
  });

  it("denies every target without roles", () => {
    for (const target of ALL_ROLES) {
      expect(canManageRole([], target)).toBe(false);
    }
  });

  it("lets admin and super_admin manage sponsor, and no other role", () => {
    expect(canManageRole(["admin"], "sponsor")).toBe(true);
    expect(canManageRole(["super_admin"], "sponsor")).toBe(true);
    expect(canManageRole(["commercial", "organizer", "sponsor"], "sponsor")).toBe(false);
  });

  it("never lets admin manage admin nor super_admin", () => {
    expect(canManageRole(["admin"], "admin")).toBe(false);
    expect(canManageRole(["admin"], "super_admin")).toBe(false);
    expect(canManageRole(["admin", "commercial", "organizer", "sponsor"], "admin")).toBe(false);
  });

  it("never allows managing super_admin", () => {
    expect(canManageRole([...ALL_ROLES], "super_admin")).toBe(false);
  });
});

describe("canRemoveAccounts", () => {
  it.each(ALL_ROLES.map((role) => [role, role === "super_admin"] as [StaffRole, boolean]))(
    "role %s → %s",
    (role, expected) => {
      expect(canRemoveAccounts([role])).toBe(expected);
    },
  );

  it("is false without roles and for admin, even though admin holds every matrix permission", () => {
    expect(canRemoveAccounts([])).toBe(false);
    expect(canRemoveAccounts(["admin", "commercial", "organizer", "sponsor"])).toBe(false);
    expect(can(["admin"], "staff.manage")).toBe(true);
  });

  it("is true whenever super_admin is among several roles", () => {
    expect(canRemoveAccounts(["commercial", "super_admin"])).toBe(true);
  });
});

describe("authErrorResponse", () => {
  it("maps UnauthorizedError to 401 without caching", async () => {
    const response = authErrorResponse(new UnauthorizedError());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("maps ForbiddenError to 403 without caching", async () => {
    const response = authErrorResponse(new ForbiddenError());
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("does not carry a cause", () => {
    expect(new UnauthorizedError().cause).toBeUndefined();
    expect(new ForbiddenError().cause).toBeUndefined();
  });

  it("rethrows any other error unchanged", () => {
    const error = new Error("database down");
    expect(() => authErrorResponse(error)).toThrow(error);
    expect(() => authErrorResponse("boom")).toThrow("boom");
  });
});
