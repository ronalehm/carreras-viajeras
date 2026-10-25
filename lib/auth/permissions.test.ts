// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authErrorResponse, ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { can, type Permission, type StaffRole } from "@/lib/auth/permissions";

const ALL_PERMISSIONS = [
  "crm.access",
  "staff.manage",
  "trips.manage",
  "leads.manage",
  "bookings.manage",
  "sponsors.manage",
  "sponsor.portal",
] as const satisfies readonly Permission[];

describe("can", () => {
  it.each<[StaffRole[], Permission, boolean]>([
    [["commercial"], "crm.access", true],
    [["commercial"], "staff.manage", false],
    [["admin"], "crm.access", true],
    [["admin"], "staff.manage", true],
    [["commercial", "admin"], "crm.access", true],
    [["commercial", "admin"], "staff.manage", true],
    [[], "crm.access", false],
    [[], "staff.manage", false],
    [["commercial"], "trips.manage", true],
    [["admin"], "trips.manage", true],
    [["commercial", "admin"], "trips.manage", true],
    [[], "trips.manage", false],
    [["commercial"], "leads.manage", true],
    [["admin"], "leads.manage", true],
    [["commercial", "admin"], "leads.manage", true],
    [[], "leads.manage", false],
    [["commercial"], "bookings.manage", true],
    [["admin"], "bookings.manage", true],
    [["commercial", "admin"], "bookings.manage", true],
    [[], "bookings.manage", false],
    [["sponsor"], "sponsors.manage", false],
    [["commercial"], "sponsors.manage", false],
    [["admin"], "sponsors.manage", true],
    [["commercial", "admin"], "sponsors.manage", true],
    [[], "sponsors.manage", false],
    [["sponsor"], "sponsor.portal", true],
    [["commercial"], "sponsor.portal", false],
    [["admin"], "sponsor.portal", true],
    [["commercial", "admin"], "sponsor.portal", true],
    [[], "sponsor.portal", false],
  ])("roles %j with %s → %s", (roles, permission, expected) => {
    expect(can(roles, permission)).toBe(expected);
  });

  it("grants admin every permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(["admin"], permission)).toBe(true);
    }
  });

  it("denies everything without roles", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can([], permission)).toBe(false);
    }
  });

  it("gives sponsor only sponsor.portal", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(["sponsor"], permission)).toBe(permission === "sponsor.portal");
    }
  });

  it("keeps commercial's four permissions without the sponsor ones", () => {
    expect(ALL_PERMISSIONS.filter((permission) => can(["commercial"], permission))).toEqual([
      "crm.access",
      "trips.manage",
      "leads.manage",
      "bookings.manage",
    ]);
  });

  it.each(["unknown.permission", "toString", "constructor", "__proto__"])(
    "denies unknown permission %s to every role",
    (permission) => {
      const unknown = permission as Permission;
      expect(can(["commercial"], unknown)).toBe(false);
      expect(can(["admin"], unknown)).toBe(false);
      expect(can([], unknown)).toBe(false);
    },
  );

  it("gives commercial crm.access but not staff.manage", () => {
    expect(can(["commercial"], "crm.access")).toBe(true);
    expect(can(["commercial"], "staff.manage")).toBe(false);
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
