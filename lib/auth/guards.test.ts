// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ getSession }) }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadStaffRoles: vi.fn(),
}));

import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  getCurrentUser,
  requireCrmUser,
  requirePermission,
  requireUser,
  requireVerifiedEmail,
} from "@/lib/auth/guards";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);

function sessionWith(user: Record<string, unknown>) {
  getSession.mockResolvedValue({ data: { session: { id: "session-1" }, user }, error: null });
}

const verifiedUser = { id: "user-1", email: "ana@example.com", emailVerified: true };

beforeEach(() => {
  getSession.mockReset();
  accept.mockReset();
  load.mockReset();
});

describe("missing or invalid session", () => {
  it.each([
    ["no data", { data: null, error: null }],
    ["empty session", { data: { session: null, user: null }, error: null }],
    ["Neon Auth error", { data: null, error: { message: "upstream down", status: 500 } }],
    ["empty user.id", { data: { session: {}, user: { ...verifiedUser, id: "" } }, error: null }],
    ["user.id too long", { data: { session: {}, user: { ...verifiedUser, id: "x".repeat(256) } }, error: null }],
    ["missing emailVerified", { data: { session: {}, user: { id: "user-1", email: "a@b.c" } }, error: null }],
  ])("%s → UnauthorizedError without calling the service", async (_, result) => {
    getSession.mockResolvedValue(result);

    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireCrmUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(accept).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("treats a thrown Neon Auth call as no session and logs only a fixed message", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSession.mockRejectedValue(new Error("Missing NEON_AUTH_COOKIE_SECRET: secret detail"));

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("auth: session lookup failed");
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(/NEON_AUTH|secret detail/);
    expect(accept).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    logError.mockRestore();
  });

  it("does not log when there is simply no session", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSession.mockResolvedValue({ data: null, error: null });

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(logError).not.toHaveBeenCalled();
    logError.mockRestore();
  });
});

describe("unverified email", () => {
  it("only loads roles, never accepts invitations, and denies permissions even for admin", async () => {
    sessionWith({ ...verifiedUser, emailVerified: false });
    load.mockResolvedValue(["admin"]);

    await expect(requireUser()).resolves.toMatchObject({ id: "user-1", emailVerified: false });
    await expect(requireVerifiedEmail()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(load).toHaveBeenCalledWith("user-1");
    expect(accept).not.toHaveBeenCalled();
  });
});

describe("verified email", () => {
  it("accepts invitations with the trimmed, lowercased email", async () => {
    sessionWith({ ...verifiedUser, email: "  Ana@Example.COM " });
    accept.mockResolvedValue(["commercial"]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: ["commercial"],
    });
    expect(accept).toHaveBeenCalledWith("user-1", "ana@example.com");
    expect(load).not.toHaveBeenCalled();
  });

  it("denies an account without roles", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValue([]);

    await expect(requireVerifiedEmail()).resolves.toMatchObject({ staffRoles: [] });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets commercial into the CRM but not manage staff", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValue(["commercial"]);

    await expect(requireCrmUser()).resolves.toMatchObject({ id: "user-1", staffRoles: ["commercial"] });
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets admin into the CRM and manage staff", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValue(["admin"]);

    await expect(requireCrmUser()).resolves.toMatchObject({ staffRoles: ["admin"] });
    await expect(requirePermission("staff.manage")).resolves.toMatchObject({ staffRoles: ["admin"] });
  });

  it("re-reads roles on every call, so a revocation applies to the next one", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValueOnce(["commercial"]).mockResolvedValueOnce([]);

    await expect(requireCrmUser()).resolves.toMatchObject({ staffRoles: ["commercial"] });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it("maps database errors to ForbiddenError without cause or original message", async () => {
    sessionWith(verifiedUser);
    accept.mockRejectedValue(new Error("password authentication failed for user app"));

    const error = await requireCrmUser().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).cause).toBeUndefined();
    expect((error as ForbiddenError).message).toBe("forbidden");
    expect(String((error as ForbiddenError).stack)).not.toContain("password");
  });

  it("maps database errors to ForbiddenError for unverified accounts too", async () => {
    sessionWith({ ...verifiedUser, emailVerified: false });
    load.mockRejectedValue(new Error("connection refused"));

    await expect(requireUser()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("exposes the trimmed session name", async () => {
    sessionWith({ ...verifiedUser, name: "  Ana Pérez " });
    accept.mockResolvedValue([]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: [],
      name: "Ana Pérez",
    });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["null", null],
  ])("omits a %s name without invalidating the session", async (_, name) => {
    sessionWith({ ...verifiedUser, name });
    accept.mockResolvedValue([]);

    const user = await getCurrentUser();
    expect(user).toEqual({ id: "user-1", email: "ana@example.com", emailVerified: true, staffRoles: [] });
    expect(user).not.toHaveProperty("name");
  });

  it("ignores extra session fields such as user.role", async () => {
    sessionWith({ ...verifiedUser, role: "admin", staffRoles: ["admin"], invitedBy: "x", userId: "other" });
    accept.mockResolvedValue([]);

    const user = await getCurrentUser();
    expect(user).toEqual({ id: "user-1", email: "ana@example.com", emailVerified: true, staffRoles: [] });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
