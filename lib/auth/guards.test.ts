// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadSponsorId: vi.fn(),
  loadStaffRoles: vi.fn(),
}));

import {
  acceptInvitationAndLoadStaffRoles,
  loadSponsorId,
  loadStaffRoles,
} from "@/lib/auth/access.service";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import type { StaffRole } from "@/lib/auth/permissions";
import { InvalidEnvironmentError } from "@/lib/env";
import {
  getCurrentUser,
  requireCrmUser,
  requirePermission,
  requireSponsor,
  requireUser,
  requireVerifiedEmail,
} from "@/lib/auth/guards";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);
const loadSponsor = vi.mocked(loadSponsorId);

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
  loadSponsor.mockReset();
});

describe("Clerk display name", () => {
  it("uses the trusted display fields without treating them as authorization", async () => {
    signedInAs(clerkUser({ firstName: "Ana", lastName: "Pérez", publicMetadata: { role: "admin" } }));
    accept.mockResolvedValue([]);

    await expect(getCurrentUser()).resolves.toMatchObject({ name: "Ana Pérez", staffRoles: [] });
    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps a valid identity usable when the optional display fields are malformed", async () => {
    signedInAs(clerkUser({ firstName: { role: "admin" }, lastName: 123 }));
    accept.mockResolvedValue([]);

    const user = await getCurrentUser();
    expect(user?.id).toBe(USER_ID);
    expect(user).not.toHaveProperty("name");
  });
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
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(clerkUser());
    accept.mockRejectedValue(new Error("password authentication failed for user app"));

    const error = await requireCrmUser().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).cause).toBeUndefined();
    expect((error as ForbiddenError).message).toBe("forbidden");
    expect(String((error as ForbiddenError).stack)).not.toContain("password");
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("auth: role lookup failed");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("password");
    logError.mockRestore();
  });

  it("names the misconfigured environment field, never its value", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(clerkUser());
    accept.mockRejectedValue(new InvalidEnvironmentError("Invalid environment fields: CLERK_SECRET_KEY"));

    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "auth: role lookup failed (Invalid environment fields: CLERK_SECRET_KEY)",
    );
    logError.mockRestore();
  });

  it("reports only the SQLSTATE of a wrapped database error", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(clerkUser());
    const pgError = Object.assign(new Error('column "sponsor_id" does not exist'), { code: "42703" });
    accept.mockRejectedValue(Object.assign(new Error("Failed query: select secret"), { cause: pgError }));

    const error = await requireCrmUser().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).reason).toBe("role_lookup_failed");
    expect((error as ForbiddenError).detail).toBe("42703");
    expect(logError).toHaveBeenCalledWith("auth: role lookup failed (SQLSTATE 42703)");
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(/sponsor_id|secret/);
    logError.mockRestore();
  });

  it("ignores a code that is not a SQLSTATE", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(clerkUser());
    accept.mockRejectedValue(Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }));

    const error = await requireCrmUser().catch((caught: unknown) => caught);
    expect((error as ForbiddenError).detail).toBeUndefined();
    expect(logError).toHaveBeenCalledWith("auth: role lookup failed");
    logError.mockRestore();
  });

  it("maps database errors to ForbiddenError for unverified accounts too", async () => {
    signedInAs(clerkUser({ emailAddresses: [emailAddress("idn_primary", "ana@example.com", "unverified")] }));
    load.mockRejectedValue(new Error("connection refused"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(requireUser()).rejects.toBeInstanceOf(ForbiddenError);
    expect(logError).toHaveBeenCalledWith("auth: role lookup failed");
    logError.mockRestore();
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

describe("requireSponsor", () => {
  const sponsorId = "6f1c2b9e-4a8d-4f3e-9b7a-2c5d8e1f0a3b";

  it("without a session → UnauthorizedError without loading the brand", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(requireSponsor()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(loadSponsor).not.toHaveBeenCalled();
  });

  it("with an unverified email → ForbiddenError without loading the brand", async () => {
    signedInAs(clerkUser({ emailAddresses: [emailAddress("idn_primary", "ana@example.com", "unverified")] }));
    load.mockResolvedValue(["sponsor"]);

    await expect(requireSponsor()).rejects.toBeInstanceOf(ForbiddenError);
    expect(loadSponsor).not.toHaveBeenCalled();
  });

  it.each<[StaffRole[]]>([[["commercial"]], [["organizer"]], [[]]])(
    "roles %j → ForbiddenError without loading the brand",
    async (roles) => {
      signedInAs(clerkUser());
      accept.mockResolvedValue(roles);

      await expect(requireSponsor()).rejects.toBeInstanceOf(ForbiddenError);
      expect(loadSponsor).not.toHaveBeenCalled();
    },
  );

  it.each<[StaffRole[]]>([[["admin"]], [["super_admin"]], [["sponsor"]]])(
    "roles %j without a brand assignment → ForbiddenError",
    async (roles) => {
      signedInAs(clerkUser());
      accept.mockResolvedValue(roles);
      loadSponsor.mockResolvedValue(null);

      await expect(requireSponsor()).rejects.toBeInstanceOf(ForbiddenError);
      expect(loadSponsor).toHaveBeenCalledWith(USER_ID);
    },
  );

  it("returns the current user with the brand of a sponsor", async () => {
    signedInAs(clerkUser({ emailAddresses: [emailAddress("idn_primary", " Ana@Example.com ", "verified")] }));
    accept.mockResolvedValue(["sponsor"]);
    loadSponsor.mockResolvedValue(sponsorId);

    await expect(requireSponsor()).resolves.toEqual({
      id: USER_ID,
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: ["sponsor"],
      sponsorId,
    });
    expect(loadSponsor).toHaveBeenCalledTimes(1);
    expect(loadSponsor).toHaveBeenCalledWith(USER_ID);
  });

  it("maps a brand lookup failure to ForbiddenError without cause or original message", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValue(["sponsor"]);
    loadSponsor.mockRejectedValue(new Error("password authentication failed for user app"));

    const error = await requireSponsor().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).cause).toBeUndefined();
    expect((error as ForbiddenError).message).toBe("forbidden");
    expect(String((error as ForbiddenError).stack)).not.toContain("password");
  });

  it("keeps sponsor out of the CRM and of every existing permission", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValue(["sponsor"]);

    await expect(requireCrmUser()).rejects.toBeInstanceOf(ForbiddenError);
    for (const permission of [
      "staff.manage",
      "trips.manage",
      "trips.manage_all",
      "offers.manage",
      "offers.view",
      "leads.manage",
      "bookings.manage",
      "sponsors.manage",
    ] as const) {
      await expect(requirePermission(permission)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
