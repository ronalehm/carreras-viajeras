// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("server-only", () => ({}));

const getSession = vi.fn();
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ getSession }) }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadStaffRoles: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../services/staff.service", () => ({
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  grantStaffRole: vi.fn(),
  revokeStaffRole: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import {
  createInvitation,
  grantStaffRole,
  revokeInvitation,
  revokeStaffRole,
} from "../services/staff.service";
import type { StaffActionState } from "../types/staff.types";
import {
  grantStaffRoleAction,
  inviteStaffAction,
  revokeInvitationAction,
  revokeStaffRoleAction,
} from "./staff.actions";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);
const revalidate = vi.mocked(revalidatePath);
const services = {
  createInvitation: vi.mocked(createInvitation),
  revokeInvitation: vi.mocked(revokeInvitation),
  grantStaffRole: vi.mocked(grantStaffRole),
  revokeStaffRole: vi.mocked(revokeStaffRole),
};

const IDLE: StaffActionState = { status: "idle" };
const INVITATION_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

function signedIn({ roles, emailVerified = true }: { roles: ("commercial" | "admin")[]; emailVerified?: boolean }) {
  getSession.mockResolvedValue({
    data: { session: { id: "session-1" }, user: { id: "admin-1", email: "boss@example.com", emailVerified } },
    error: null,
  });
  accept.mockResolvedValue(roles);
  load.mockResolvedValue(roles);
}

const signedInAdmin = () => signedIn({ roles: ["admin"] });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockReset();
  services.createInvitation.mockResolvedValue({ id: INVITATION_ID, expiresAt: new Date("2026-10-25T12:00:00Z") });
  services.revokeInvitation.mockResolvedValue(true);
  services.grantStaffRole.mockResolvedValue(true);
  services.revokeStaffRole.mockResolvedValue("revoked");
});

type ActionCase = {
  name: string;
  action: (prev: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  service: MockInstance;
  valid: Record<string, string>;
};

const actions: ActionCase[] = [
  {
    name: "inviteStaffAction",
    action: inviteStaffAction,
    service: services.createInvitation,
    valid: { email: "luis@example.com", role: "commercial" },
  },
  {
    name: "revokeInvitationAction",
    action: revokeInvitationAction,
    service: services.revokeInvitation,
    valid: { invitationId: INVITATION_ID },
  },
  {
    name: "grantStaffRoleAction",
    action: grantStaffRoleAction,
    service: services.grantStaffRole,
    valid: { userId: "user-2", role: "admin" },
  },
  {
    name: "revokeStaffRoleAction",
    action: revokeStaffRoleAction,
    service: services.revokeStaffRole,
    valid: { userId: "user-2", role: "commercial" },
  },
];

describe.each(actions)("$name called directly", ({ action, service, valid }) => {
  it("returns unauthorized without a session and does not call the service", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    await expect(action(IDLE, form(valid))).resolves.toMatchObject({ status: "error", code: "unauthorized" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["a verified commercial", { roles: ["commercial"] as const }],
    ["a verified account without roles", { roles: [] }],
    ["an admin with an unverified email", { roles: ["admin"] as const, emailVerified: false }],
  ])("returns forbidden for %s and does not call the service", async (_, session) => {
    signedIn({ ...session, roles: [...session.roles] });

    await expect(action(IDLE, form(valid))).resolves.toMatchObject({ status: "error", code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns forbidden when the role lookup fails, without calling the service", async () => {
    getSession.mockResolvedValue({
      data: { session: {}, user: { id: "admin-1", email: "boss@example.com", emailVerified: true } },
      error: null,
    });
    accept.mockRejectedValue(new Error("password authentication failed"));

    await expect(action(IDLE, form(valid))).resolves.toMatchObject({ status: "error", code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("succeeds for a verified admin with valid data and revalidates the user list and every user page", async () => {
    signedInAdmin();

    await expect(action(IDLE, form(valid))).resolves.toMatchObject({ status: "success" });
    expect(service).toHaveBeenCalledTimes(1);
    expect(service.mock.calls[0][1]).toBe("admin-1");
    expect(revalidate.mock.calls).toEqual([
      ["/crm/admin/usuarios"],
      ["/crm/admin/usuarios/[id]", "page"],
    ]);
  });

  it("returns invalid_input with fieldErrors for an empty form, without calling the service", async () => {
    signedInAdmin();

    const state = await action(IDLE, form({}));
    expect(state).toMatchObject({ status: "error", code: "invalid_input" });
    expect(state.status === "error" && Object.keys(state.fieldErrors ?? {}).sort()).toEqual(Object.keys(valid).sort());
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rethrows service failures without the original message", async () => {
    signedInAdmin();
    service.mockRejectedValue(new Error("duplicate key value violates unique constraint"));

    const error = await action(IDLE, form(valid)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("staff action failed");
    expect((error as Error).cause).toBeUndefined();
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("inviteStaffAction", () => {
  it("normalizes the email, uses the session user as actor and ignores extra fields", async () => {
    signedInAdmin();

    const state = await inviteStaffAction(
      IDLE,
      form({ email: "  Luis@Example.com ", role: "commercial", invitedBy: "attacker", expiresAt: "2099-01-01" }),
    );

    expect(services.createInvitation).toHaveBeenCalledExactlyOnceWith(
      { email: "luis@example.com", role: "commercial" },
      "admin-1",
    );
    expect(state).toMatchObject({ status: "success", acceptUrl: "https://carreras-viajeras.mentec.dev/crm/acceso" });
  });

  it("maps pending_invitation_exists and does not revalidate", async () => {
    signedInAdmin();
    services.createInvitation.mockResolvedValue("pending_invitation_exists");

    await expect(inviteStaffAction(IDLE, form({ email: "luis@example.com", role: "admin" }))).resolves.toMatchObject({
      status: "error",
      code: "pending_invitation_exists",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: "not-an-email", role: "commercial" }, ["email"]],
    [{ email: "luis@example.com", role: "operations" }, ["role"]],
    [{ email: "luis@example.com", role: "moderator" }, ["role"]],
    [{ email: "", role: "" }, ["email", "role"]],
  ])("rejects %o as invalid_input on the fields %o", async (fields, invalid) => {
    signedInAdmin();

    const state = await inviteStaffAction(IDLE, form(fields));
    expect(state).toMatchObject({ status: "error", code: "invalid_input" });
    expect(state.status === "error" && Object.keys(state.fieldErrors ?? {})).toEqual(invalid);
    expect(services.createInvitation).not.toHaveBeenCalled();
  });

  it("returns Spanish field messages", async () => {
    signedInAdmin();

    await expect(inviteStaffAction(IDLE, form({ email: "x", role: "x" }))).resolves.toMatchObject({
      fieldErrors: { email: ["Introduce un correo válido."], role: ["Elige un rol válido."] },
    });
  });
});

describe("revokeInvitationAction", () => {
  it("passes the invitation id and the session actor", async () => {
    signedInAdmin();

    await expect(
      revokeInvitationAction(IDLE, form({ invitationId: INVITATION_ID, revokedBy: "attacker" })),
    ).resolves.toMatchObject({ status: "success" });
    expect(services.revokeInvitation).toHaveBeenCalledExactlyOnceWith(INVITATION_ID, "admin-1");
  });

  it("rejects a malformed invitation id", async () => {
    signedInAdmin();

    await expect(revokeInvitationAction(IDLE, form({ invitationId: "123" }))).resolves.toMatchObject({
      code: "invalid_input",
      fieldErrors: { invitationId: [expect.any(String)] },
    });
    expect(services.revokeInvitation).not.toHaveBeenCalled();
  });

  it("maps a missing, accepted or revoked invitation to not_found", async () => {
    signedInAdmin();
    services.revokeInvitation.mockResolvedValue(false);

    await expect(revokeInvitationAction(IDLE, form({ invitationId: INVITATION_ID }))).resolves.toMatchObject({
      status: "error",
      code: "not_found",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("grantStaffRoleAction", () => {
  it("uses the session user as actor even when the form sends grantedBy", async () => {
    signedInAdmin();

    await grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "admin", grantedBy: "attacker" }));
    expect(services.grantStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "user-2", role: "admin" }, "admin-1");
  });

  it("maps no insert to no_change", async () => {
    signedInAdmin();
    services.grantStaffRole.mockResolvedValue(false);

    await expect(grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "admin" }))).resolves.toMatchObject({
      status: "error",
      code: "no_change",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rejects an overlong user id and an unknown role", async () => {
    signedInAdmin();

    await expect(
      grantStaffRoleAction(IDLE, form({ userId: "x".repeat(256), role: "moderator" })),
    ).resolves.toMatchObject({ code: "invalid_input", fieldErrors: { userId: [expect.any(String)], role: [expect.any(String)] } });
    expect(services.grantStaffRole).not.toHaveBeenCalled();
  });
});

describe("revokeStaffRoleAction", () => {
  it("passes the role change and the session actor", async () => {
    signedInAdmin();

    await expect(
      revokeStaffRoleAction(IDLE, form({ userId: "admin-1", role: "admin", revokedBy: "attacker" })),
    ).resolves.toMatchObject({ status: "success" });
    expect(services.revokeStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "admin-1", role: "admin" }, "admin-1");
  });

  it.each(["not_found", "last_admin"] as const)("maps %s and does not revalidate", async (code) => {
    signedInAdmin();
    services.revokeStaffRole.mockResolvedValue(code);

    await expect(revokeStaffRoleAction(IDLE, form({ userId: "admin-1", role: "admin" }))).resolves.toMatchObject({
      status: "error",
      code,
      message: expect.any(String),
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});
