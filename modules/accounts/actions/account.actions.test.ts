// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireVerifiedEmail, type CurrentUser } from "@/lib/auth/guards";
import type { StaffRole } from "@/lib/auth/permissions";
import { registerAccountAction } from "./account.actions";

const guard = vi.mocked(requireVerifiedEmail);

function signedInWith(staffRoles: StaffRole[]): CurrentUser {
  return { id: "user-1", email: "ana@correo.com", emailVerified: true, staffRoles };
}

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.clearAllMocks();
  consoleSpies = (["error", "warn", "log", "info"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

describe("registerAccountAction", () => {
  it.each<[string, StaffRole[]]>([
    ["commercial", ["commercial"]],
    ["admin", ["admin"]],
    ["super_admin", ["super_admin"]],
    ["organizer", ["organizer"]],
  ])("%s → canAccessCrm true and nothing else", async (_, roles) => {
    guard.mockResolvedValue(signedInWith(roles));

    await expect(registerAccountAction()).resolves.toStrictEqual({ canAccessCrm: true });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledWith();
  });

  it.each<[string, StaffRole[]]>([
    ["a runner without roles", []],
    ["a sponsor", ["sponsor"]],
  ])("%s → canAccessCrm false", async (_, roles) => {
    guard.mockResolvedValue(signedInWith(roles));

    await expect(registerAccountAction()).resolves.toStrictEqual({ canAccessCrm: false });
  });

  it.each([
    ["401 without a session", new UnauthorizedError()],
    ["403 for an unverified email", new ForbiddenError("email_unverified")],
    ["403 for a failed role lookup", new ForbiddenError("role_lookup_failed")],
    ["a database error", new Error("insert into profiles failed: ana@correo.com")],
  ])("%s → canAccessCrm false without logging", async (_, error) => {
    guard.mockRejectedValue(error);

    await expect(registerAccountAction()).resolves.toStrictEqual({ canAccessCrm: false });
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
