// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
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

const USER_ID = "user_2abc";

function emailAddress(id: string, address: string, status: string | null) {
  return { id, emailAddress: address, verification: status === null ? null : { status } };
}

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [emailAddress("idn_primary", "ana@example.com", "verified")],
    publicMetadata: {},
    unsafeMetadata: {},
    ...overrides,
  };
}

function signedInAs(user: unknown) {
  auth.mockResolvedValue({ userId: USER_ID });
  currentUser.mockResolvedValue(user);
}

function expectNoServiceCalls() {
  expect(accept).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
}

beforeEach(() => {
  auth.mockReset();
  currentUser.mockReset();
  accept.mockReset();
  load.mockReset();
});

describe("session (auth)", () => {
  it("without a session → UnauthorizedError without calling currentUser or the service", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockResolvedValue({ userId: null });

    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireCrmUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(currentUser).not.toHaveBeenCalled();
    expectNoServiceCalls();
    expect(logError).not.toHaveBeenCalled();
    logError.mockRestore();
  });

  it("treats a thrown auth() as no session and logs only a fixed message", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockRejectedValue(new Error("Missing CLERK_SECRET_KEY: sk_test_secret detail"));

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("auth: session lookup failed");
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(/CLERK_SECRET_KEY|sk_test|secret detail/);
    expect(currentUser).not.toHaveBeenCalled();
    expectNoServiceCalls();
    logError.mockRestore();
  });
});

describe("user lookup (currentUser)", () => {
  it("maps a thrown currentUser() to ForbiddenError without cause or original message", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockResolvedValue({ userId: USER_ID });
    currentUser.mockRejectedValue(new Error("Clerk API rate limit exceeded for sk_live_secret"));

    const error = await requireUser().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).cause).toBeUndefined();
    expect((error as ForbiddenError).message).toBe("forbidden");
    expect(String((error as ForbiddenError).stack)).not.toMatch(/rate limit|sk_live/);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("auth: user lookup failed");
    expectNoServiceCalls();
    logError.mockRestore();
  });

  it.each([
    ["null user", null],
    ["a different id", clerkUser({ id: "user_other" })],
    ["an empty id", clerkUser({ id: "" })],
    ["an id that is too long", clerkUser({ id: "x".repeat(256) })],
    ["missing emailAddresses", clerkUser({ emailAddresses: undefined })],
    ["malformed email address", clerkUser({ emailAddresses: [{ id: "idn_primary" }] })],
  ])("%s → UnauthorizedError without calling the service", async (_, user) => {
    signedInAs(user);

    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireCrmUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expectNoServiceCalls();
  });
});

describe("primary email", () => {
  it("accepts invitations with the trimmed, lowercased verified primary email", async () => {
    signedInAs(
      clerkUser({
        emailAddresses: [
          emailAddress("idn_other", "other@example.com", "verified"),
          emailAddress("idn_primary", "  Ana@Example.COM ", "verified"),
        ],
      }),
    );
    accept.mockResolvedValue(["commercial"]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: USER_ID,
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: ["commercial"],
    });
    expect(accept).toHaveBeenCalledWith(USER_ID, "ana@example.com");
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ["unverified primary with a verified secondary", clerkUser({
      emailAddresses: [
        emailAddress("idn_primary", "ana@example.com", "unverified"),
        emailAddress("idn_secondary", "ana@work.example", "verified"),
      ],
    })],
    ["primary without verification", clerkUser({
      emailAddresses: [emailAddress("idn_primary", "ana@example.com", null)],
    })],
  ])("%s → only loads roles and denies permissions even for admin", async (_, user) => {
    signedInAs(user);
    load.mockResolvedValue(["admin"]);

    await expect(requireUser()).resolves.toMatchObject({
      id: USER_ID,
      email: "ana@example.com",
      emailVerified: false,
    });
    await expect(requireVerifiedEmail()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(load).toHaveBeenCalledWith(USER_ID);
    expect(accept).not.toHaveBeenCalled();
  });

  it.each([
    ["no primaryEmailAddressId", clerkUser({ primaryEmailAddressId: null })],
    ["a primaryEmailAddressId that matches no address", clerkUser({ primaryEmailAddressId: "idn_gone" })],
  ])("%s → empty, unverified email", async (_, user) => {
    signedInAs(user);
    load.mockResolvedValue(["admin"]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: USER_ID,
      email: "",
      emailVerified: false,
      staffRoles: ["admin"],
    });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(load).toHaveBeenCalledWith(USER_ID);
    expect(accept).not.toHaveBeenCalled();
  });
});

describe("roles from the database", () => {
  it("denies an account without roles", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValue([]);

    await expect(requireVerifiedEmail()).resolves.toMatchObject({ staffRoles: [] });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets commercial into the CRM but not manage staff", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValue(["commercial"]);

    await expect(requireCrmUser()).resolves.toMatchObject({ id: USER_ID, staffRoles: ["commercial"] });
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets admin into the CRM and manage staff", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValue(["admin"]);

    await expect(requireCrmUser()).resolves.toMatchObject({ staffRoles: ["admin"] });
    await expect(requirePermission("staff.manage")).resolves.toMatchObject({ staffRoles: ["admin"] });
  });

  it("re-reads roles on every call, so a revocation applies to the next one", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValueOnce(["commercial"]).mockResolvedValueOnce([]);

    await expect(requireCrmUser()).resolves.toMatchObject({ staffRoles: ["commercial"] });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it("maps database errors to ForbiddenError without cause or original message", async () => {
    signedInAs(clerkUser());
    accept.mockRejectedValue(new Error("password authentication failed for user app"));

    const error = await requireCrmUser().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).cause).toBeUndefined();
    expect((error as ForbiddenError).message).toBe("forbidden");
    expect(String((error as ForbiddenError).stack)).not.toContain("password");
  });

  it("maps database errors to ForbiddenError for unverified accounts too", async () => {
    signedInAs(clerkUser({ emailAddresses: [emailAddress("idn_primary", "ana@example.com", "unverified")] }));
    load.mockRejectedValue(new Error("connection refused"));

    await expect(requireUser()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ignores publicMetadata, unsafeMetadata and other extra Clerk user fields", async () => {
    signedInAs(
      clerkUser({
        publicMetadata: { role: "admin" },
        unsafeMetadata: { staffRoles: ["admin"] },
        privateMetadata: { role: "admin" },
        role: "admin",
        staffRoles: ["admin"],
      }),
    );
    accept.mockResolvedValue([]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: USER_ID,
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: [],
    });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("staff.manage")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("display name (firstName/lastName)", () => {
  it("joins the trimmed firstName and lastName", async () => {
    signedInAs(clerkUser({ firstName: " Ana ", lastName: "Pérez " }));
    accept.mockResolvedValue([]);

    await expect(getCurrentUser()).resolves.toEqual({
      id: USER_ID,
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: [],
      name: "Ana Pérez",
    });
  });

  it.each([
    ["only firstName", { firstName: " Ana ", lastName: null }, "Ana"],
    ["only lastName", { lastName: "Pérez " }, "Pérez"],
  ])("%s → that name", async (_, names, expected) => {
    signedInAs(clerkUser(names));
    accept.mockResolvedValue([]);

    await expect(getCurrentUser()).resolves.toMatchObject({ name: expected });
  });

  it.each([
    ["both missing", {}],
    ["both null", { firstName: null, lastName: null }],
    ["both empty", { firstName: "", lastName: "" }],
    ["both blank", { firstName: "   ", lastName: "   " }],
    ["a number and an object", { firstName: 42, lastName: { value: "Pérez" } }],
  ])("%s → no name and a valid session", async (_, names) => {
    signedInAs(clerkUser(names));
    accept.mockResolvedValue(["commercial"]);

    const user = await getCurrentUser();
    expect(user).toEqual({
      id: USER_ID,
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: ["commercial"],
    });
    expect(user).not.toHaveProperty("name");
  });
});
