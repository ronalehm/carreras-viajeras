// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ getSession }) }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadStaffRoles: vi.fn(),
}));

import { GET } from "@/app/api/crm/me/route";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);

const verifiedUser = { id: "user-1", email: "ana@example.com", emailVerified: true };

function sessionWith(user: Record<string, unknown>) {
  getSession.mockResolvedValue({ data: { session: { id: "session-1" }, user }, error: null });
}

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

const FORBIDDEN = { error: "forbidden" };

beforeEach(() => {
  getSession.mockReset();
  accept.mockReset();
  load.mockReset();
});

describe("GET /api/crm/me", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    await expectResponse(await GET(), 401, { error: "unauthorized" });
    expect(accept).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("returns 403 for an unverified email without consuming invitations", async () => {
    sessionWith({ ...verifiedUser, emailVerified: false });
    load.mockResolvedValue(["admin"]);

    await expectResponse(await GET(), 403, FORBIDDEN);
    expect(load).toHaveBeenCalledWith("user-1");
    expect(accept).not.toHaveBeenCalled();
  });

  it("returns 403 for a free sign-up without roles", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValue([]);

    await expectResponse(await GET(), 403, FORBIDDEN);
    expect(accept).toHaveBeenCalledWith("user-1", "ana@example.com");
  });

  it("returns 403 when the invitation is expired or revoked (acceptance yields no roles)", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValue([]);

    await expectResponse(await GET(), 403, FORBIDDEN);
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it.each([["commercial"], ["admin"]] as const)("returns 200 for %s", async (role) => {
    sessionWith(verifiedUser);
    accept.mockResolvedValue([role]);

    await expectResponse(await GET(), 200, { userId: "user-1", staffRoles: [role] });
  });

  it("returns 403 on the next call after the role is revoked", async () => {
    sessionWith(verifiedUser);
    accept.mockResolvedValueOnce(["commercial"]).mockResolvedValueOnce([]);

    await expectResponse(await GET(), 200, { userId: "user-1", staffRoles: ["commercial"] });
    await expectResponse(await GET(), 403, FORBIDDEN);
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it("returns 403 on a database error without leaking the original message", async () => {
    sessionWith(verifiedUser);
    accept.mockRejectedValue(new Error("password authentication failed for user app"));

    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).toBe(JSON.stringify(FORBIDDEN));
    expect(text).not.toContain("password");
  });

  it("returns 403 when role=admin arrives via query, cookie, body or session user.role", async () => {
    // GET() takes no request: this one only documents the attempted elevation, it is never read.
    const forged = new Request("https://carreras-viajeras.mentec.dev/api/crm/me?role=admin", {
      method: "POST",
      headers: { cookie: "role=admin; staffRoles=admin" },
      body: JSON.stringify({ role: "admin", staffRoles: ["admin"] }),
    });
    expect(new URL(forged.url).searchParams.get("role")).toBe("admin");

    sessionWith({ ...verifiedUser, role: "admin", staffRoles: ["admin"] });
    accept.mockResolvedValue([]);

    await expectResponse(await GET(), 403, FORBIDDEN);
    expect(GET).toHaveLength(0);
  });
});
