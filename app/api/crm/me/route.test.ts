// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadStaffRoles: vi.fn(),
}));

import { GET } from "@/app/api/crm/me/route";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);

const USER_ID = "user_2abc";

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [
      { id: "idn_primary", emailAddress: "ana@example.com", verification: { status: "verified" } },
    ],
    publicMetadata: {},
    unsafeMetadata: {},
    ...overrides,
  };
}

function signedInAs(user: unknown) {
  auth.mockResolvedValue({ userId: USER_ID });
  currentUser.mockResolvedValue(user);
}

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

const UNAUTHORIZED = { error: "unauthorized" };
const forbidden = (reason: string) => ({ error: "forbidden", reason });

beforeEach(() => {
  auth.mockReset();
  currentUser.mockReset();
  accept.mockReset();
  load.mockReset();
});

describe("GET /api/crm/me", () => {
  it("returns 401 without a session, without calling currentUser or the database", async () => {
    auth.mockResolvedValue({ userId: null });

    await expectResponse(await GET(), 401, UNAUTHORIZED);
    expect(currentUser).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("returns 401 and logs one fixed message when auth() throws", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockRejectedValue(new Error("Missing CLERK_SECRET_KEY: secret detail"));

    await expectResponse(await GET(), 401, UNAUTHORIZED);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("auth: session lookup failed");
    expect(currentUser).not.toHaveBeenCalled();
    logError.mockRestore();
  });

  it("returns 403 without querying the database or leaking the text when currentUser() throws", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockResolvedValue({ userId: USER_ID });
    currentUser.mockRejectedValue(new Error("Clerk API unavailable: sk_live_secret"));

    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).toBe(JSON.stringify(forbidden("user_lookup_failed")));
    expect(text).not.toMatch(/Clerk API|sk_live/);
    expect(accept).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    logError.mockRestore();
  });

  it.each([
    ["currentUser() returns null", null],
    ["currentUser() returns another id", clerkUser({ id: "user_other" })],
  ])("returns 401 when %s", async (_, user) => {
    signedInAs(user);

    await expectResponse(await GET(), 401, UNAUTHORIZED);
    expect(accept).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("accepts a pending invitation with the lowercased verified primary email", async () => {
    signedInAs(
      clerkUser({
        emailAddresses: [
          { id: "idn_primary", emailAddress: "Ana@Example.COM", verification: { status: "verified" } },
        ],
      }),
    );
    accept.mockResolvedValue(["commercial"]);

    await expectResponse(await GET(), 200, { userId: USER_ID, staffRoles: ["commercial"] });
    expect(accept).toHaveBeenCalledWith(USER_ID, "ana@example.com");
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ["an unverified primary email with a verified secondary", clerkUser({
      emailAddresses: [
        { id: "idn_primary", emailAddress: "ana@example.com", verification: { status: "unverified" } },
        { id: "idn_secondary", emailAddress: "ana@work.example", verification: { status: "verified" } },
      ],
    })],
    ["no primary email", clerkUser({ primaryEmailAddressId: null })],
  ])("returns 403 for %s without consuming invitations, even for admin", async (_, user) => {
    signedInAs(user);
    load.mockResolvedValue(["admin"]);

    await expectResponse(await GET(), 403, forbidden("email_unverified"));
    expect(load).toHaveBeenCalledWith(USER_ID);
    expect(accept).not.toHaveBeenCalled();
  });

  it.each([
    ["a free sign-up without roles"],
    ["an expired or revoked invitation (acceptance yields no roles)"],
  ])("returns 403 for %s", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValue([]);

    await expectResponse(await GET(), 403, forbidden("missing_permission"));
    expect(accept).toHaveBeenCalledWith(USER_ID, "ana@example.com");
  });

  it.each([["commercial"], ["admin"]] as const)("returns 200 for %s", async (role) => {
    signedInAs(clerkUser());
    accept.mockResolvedValue([role]);

    await expectResponse(await GET(), 200, { userId: USER_ID, staffRoles: [role] });
  });

  it("returns 403 on the next call after the role is revoked", async () => {
    signedInAs(clerkUser());
    accept.mockResolvedValueOnce(["commercial"]).mockResolvedValueOnce([]);

    await expectResponse(await GET(), 200, { userId: USER_ID, staffRoles: ["commercial"] });
    await expectResponse(await GET(), 403, forbidden("missing_permission"));
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it("returns 403 on a database error without leaking the original message", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(clerkUser());
    accept.mockRejectedValue(new Error("password authentication failed for user app"));

    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).toBe(JSON.stringify(forbidden("role_lookup_failed")));
    expect(text).not.toContain("password");
    expect(logError).toHaveBeenCalledWith("auth: role lookup failed");
    logError.mockRestore();
  });

  it("returns the SQLSTATE of a database error as detail, never its message", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(clerkUser());
    accept.mockRejectedValue(
      Object.assign(new Error("Failed query"), {
        cause: Object.assign(new Error("password authentication failed"), { code: "28P01" }),
      }),
    );

    const response = await GET();
    const text = await response.text();
    expect(response.status).toBe(403);
    expect(text).toBe(JSON.stringify({ ...forbidden("role_lookup_failed"), detail: "28P01" }));
    expect(text).not.toContain("password");
    logError.mockRestore();
  });

  it("returns 403 when role=admin arrives via query, cookie, body or Clerk metadata", async () => {
    // GET() takes no request: this one only documents the attempted elevation, it is never read.
    const forged = new Request("https://carreras-viajeras.mentec.dev/api/crm/me?role=admin", {
      method: "POST",
      headers: { cookie: "role=admin; staffRoles=admin" },
      body: JSON.stringify({ role: "admin", staffRoles: ["admin"] }),
    });
    expect(new URL(forged.url).searchParams.get("role")).toBe("admin");

    signedInAs(
      clerkUser({ publicMetadata: { role: "admin" }, unsafeMetadata: { staffRoles: ["admin"] } }),
    );
    accept.mockResolvedValue([]);

    await expectResponse(await GET(), 403, forbidden("missing_permission"));
    expect(GET).toHaveLength(0);
  });
});
