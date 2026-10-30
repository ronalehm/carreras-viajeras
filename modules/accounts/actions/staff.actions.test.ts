// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("server-only", () => ({}));

const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
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
import type { StaffRole } from "@/lib/auth/permissions";
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
const SPONSOR_ID = "8a6b2c1d-4e5f-4a7b-9c8d-1e2f3a4b5c6d";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

function mockSession(emailVerified = true, userId = "admin-1") {
  auth.mockResolvedValue({ userId });
  currentUser.mockResolvedValue({
    id: userId,
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [
      {
        id: "idn_primary",
        emailAddress: "boss@example.com",
        verification: { status: emailVerified ? "verified" : "unverified" },
      },
    ],
  });
}

function signedIn({
  roles,
  emailVerified = true,
  userId = "admin-1",
}: {
  roles: StaffRole[];
  emailVerified?: boolean;
  userId?: string;
}) {
  mockSession(emailVerified, userId);
  accept.mockResolvedValue({ staffRoles: roles, blocked: false });
  load.mockResolvedValue({ staffRoles: roles, blocked: false });
}

const signedInAdmin = () => signedIn({ roles: ["admin"] });
const signedInSuperAdmin = () => signedIn({ roles: ["super_admin"], userId: "super-1" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReset();
  currentUser.mockReset();
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
    valid: { userId: "user-2", role: "commercial" },
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
    auth.mockResolvedValue({ userId: null });

    await expect(action(IDLE, form(valid))).resolves.toMatchObject({ status: "error", code: "unauthorized" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["a verified commercial", { roles: ["commercial"] as const }],
    ["a verified organizer", { roles: ["organizer"] as const }],
    ["a verified commercial and organizer", { roles: ["commercial", "organizer"] as const }],
    ["a verified account without roles", { roles: [] }],
    ["an admin with an unverified email", { roles: ["admin"] as const, emailVerified: false }],
  ])("returns forbidden for %s and does not call the service", async (_, session) => {
    signedIn({ ...session, roles: [...session.roles] });

    await expect(action(IDLE, form(valid))).resolves.toMatchObject({ status: "error", code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns forbidden when the role lookup fails, without calling the service", async () => {
    mockSession();
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
      ["/crm/(protected)/admin/usuarios/[id]", "page"],
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

    await expect(inviteStaffAction(IDLE, form({ email: "luis@example.com", role: "commercial" }))).resolves.toMatchObject({
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
    expect(services.revokeInvitation).toHaveBeenCalledExactlyOnceWith(INVITATION_ID, "admin-1", [
      "commercial",
      "organizer",
      "sponsor",
    ]);
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

    await grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "commercial", grantedBy: "attacker" }));
    expect(services.grantStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "user-2", role: "commercial" }, "admin-1");
  });

  it("maps no insert to no_change", async () => {
    signedInAdmin();
    services.grantStaffRole.mockResolvedValue(false);

    await expect(grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "commercial" }))).resolves.toMatchObject({
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

  it.each([undefined, "", "not-a-uuid"])(
    "rejects sponsor without a valid brand (%j) with the brand field message",
    async (sponsorId) => {
      signedInAdmin();
      const fields: Record<string, string> = { userId: "user-2", role: "sponsor" };
      if (sponsorId !== undefined) fields.sponsorId = sponsorId;

      await expect(grantStaffRoleAction(IDLE, form(fields))).resolves.toEqual({
        status: "error",
        code: "invalid_input",
        message: "Revisa los datos del formulario.",
        fieldErrors: { sponsorId: ["Elige la marca del patrocinador."] },
      });
      expect(services.grantStaffRole).not.toHaveBeenCalled();
      expect(revalidate).not.toHaveBeenCalled();
    },
  );

  it("grants sponsor with its brand, using the session actor", async () => {
    signedInAdmin();

    await expect(
      grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "sponsor", sponsorId: SPONSOR_ID, grantedBy: "attacker" })),
    ).resolves.toEqual({ status: "success", message: "Rol asignado." });
    expect(services.grantStaffRole).toHaveBeenCalledExactlyOnceWith(
      { userId: "user-2", role: "sponsor", sponsorId: SPONSOR_ID },
      "admin-1",
    );
  });

  it("maps an unknown brand (no insert) to no_change", async () => {
    signedInAdmin();
    services.grantStaffRole.mockResolvedValue(false);

    await expect(
      grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "sponsor", sponsorId: SPONSOR_ID })),
    ).resolves.toMatchObject({ status: "error", code: "no_change" });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("drops a brand sent with a team role", async () => {
    signedInAdmin();

    await grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "organizer", sponsorId: SPONSOR_ID }));
    expect(services.grantStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "user-2", role: "organizer" }, "admin-1");
  });
});

describe("revokeStaffRoleAction", () => {
  it("passes the role change and the session actor", async () => {
    signedInSuperAdmin();

    await expect(
      revokeStaffRoleAction(IDLE, form({ userId: "admin-1", role: "admin", revokedBy: "attacker" })),
    ).resolves.toMatchObject({ status: "success" });
    expect(services.revokeStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "admin-1", role: "admin" }, "super-1");
  });

  it("revokes sponsor without a brand", async () => {
    signedInAdmin();

    await expect(
      revokeStaffRoleAction(IDLE, form({ userId: "user-2", role: "sponsor", sponsorId: SPONSOR_ID })),
    ).resolves.toEqual({ status: "success", message: "Rol revocado." });
    expect(services.revokeStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "user-2", role: "sponsor" }, "admin-1");
  });

  it.each(["not_found", "last_admin"] as const)("maps %s and does not revalidate", async (code) => {
    signedInSuperAdmin();
    services.revokeStaffRole.mockResolvedValue(code);

    await expect(revokeStaffRoleAction(IDLE, form({ userId: "admin-1", role: "admin" }))).resolves.toMatchObject({
      status: "error",
      code,
      message: expect.any(String),
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});

// Role management matrix (actor × target role). Expected outcomes are written out by hand, not
// derived from canManageRole, so the test pins the rules of the spec.
type Outcome = "success" | "forbidden" | "invalid_input";
const TARGET_ROLES: readonly StaffRole[] = ["commercial", "organizer", "admin", "super_admin", "sponsor"];

const ALL_FORBIDDEN: Record<StaffRole, Outcome> = {
  commercial: "forbidden",
  organizer: "forbidden",
  admin: "forbidden",
  super_admin: "forbidden",
  sponsor: "forbidden",
};
// accounts-role-requests R19: admin manages commercial, organizer and sponsor; super_admin also admin.
const AS_SUPER_ADMIN: Record<StaffRole, Outcome> = {
  commercial: "success",
  organizer: "success",
  admin: "success",
  super_admin: "invalid_input",
  sponsor: "success",
};
const AS_ADMIN: Record<StaffRole, Outcome> = {
  commercial: "success",
  organizer: "success",
  admin: "forbidden",
  super_admin: "invalid_input",
  sponsor: "success",
};

const ACTORS: { label: string; roles: StaffRole[]; outcomes: Record<StaffRole, Outcome> }[] = [
  { label: "super_admin", roles: ["super_admin"], outcomes: AS_SUPER_ADMIN },
  { label: "admin", roles: ["admin"], outcomes: AS_ADMIN },
  { label: "commercial", roles: ["commercial"], outcomes: ALL_FORBIDDEN },
  { label: "organizer", roles: ["organizer"], outcomes: ALL_FORBIDDEN },
  { label: "sponsor", roles: ["sponsor"], outcomes: ALL_FORBIDDEN },
  { label: "super_admin + admin", roles: ["super_admin", "admin"], outcomes: AS_SUPER_ADMIN },
  { label: "admin + commercial", roles: ["admin", "commercial"], outcomes: AS_ADMIN },
  { label: "admin + organizer", roles: ["admin", "organizer"], outcomes: AS_ADMIN },
  { label: "commercial + organizer", roles: ["commercial", "organizer"], outcomes: ALL_FORBIDDEN },
];

type RoleActionCase = {
  name: string;
  action: (prev: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  service: MockInstance;
  fields: (role: StaffRole) => Record<string, string>;
  serviceInput: (role: StaffRole) => unknown;
  // Outcome when the actor may manage the role but this action does not accept it.
  unsupported?: StaffRole[];
};

const roleActions: RoleActionCase[] = [
  {
    name: "inviteStaffAction",
    action: inviteStaffAction,
    service: services.createInvitation,
    fields: (role) => ({ email: "luis@example.com", role }),
    serviceInput: (role) => ({ email: "luis@example.com", role }),
    // Inviting a sponsor needs a brand (accounts-user-management F2): inviteStaffSchema rejects it.
    unsupported: ["sponsor"],
  },
  {
    name: "grantStaffRoleAction",
    action: grantStaffRoleAction,
    service: services.grantStaffRole,
    fields: (role) => ({ userId: "user-2", role, ...(role === "sponsor" && { sponsorId: SPONSOR_ID }) }),
    serviceInput: (role) => ({ userId: "user-2", role, ...(role === "sponsor" && { sponsorId: SPONSOR_ID }) }),
  },
  {
    name: "revokeStaffRoleAction",
    action: revokeStaffRoleAction,
    service: services.revokeStaffRole,
    fields: (role) => ({ userId: "user-2", role }),
    serviceInput: (role) => ({ userId: "user-2", role }),
  },
];

const matrix = roleActions.flatMap((roleAction) =>
  ACTORS.flatMap((actor) =>
    TARGET_ROLES.map((role) => {
      const outcome = actor.outcomes[role];
      const expected: Outcome =
        outcome === "success" && roleAction.unsupported?.includes(role) ? "invalid_input" : outcome;
      return { ...roleAction, actor, role, expected };
    }),
  ),
);

describe("role management matrix", () => {
  it.each(matrix)(
    "$name: $actor.label on $role → $expected",
    async ({ action, service, fields, serviceInput, actor, role, expected }) => {
      signedIn({ roles: actor.roles });

      const state = await action(IDLE, form(fields(role)));

      if (expected === "success") {
        expect(state).toMatchObject({ status: "success" });
        expect(service).toHaveBeenCalledExactlyOnceWith(serviceInput(role), "admin-1");
        expect(revalidate.mock.calls).toEqual([
          ["/crm/admin/usuarios"], ["/crm/(protected)/admin/usuarios/[id]", "page"],
        ]);
      } else {
        expect(state).toMatchObject({ status: "error", code: expected });
        expect(service).not.toHaveBeenCalled();
        expect(revalidate).not.toHaveBeenCalled();
      }
    },
  );

  it("rejects inviting a sponsor on the role field, even for an actor that manages sponsor", async () => {
    signedInAdmin();

    await expect(inviteStaffAction(IDLE, form({ email: "luis@example.com", role: "sponsor" }))).resolves.toMatchObject({
      status: "error",
      code: "invalid_input",
      fieldErrors: { role: ["Elige un rol válido."] },
    });
    expect(services.createInvitation).not.toHaveBeenCalled();
  });

  it("returns the fixed forbidden message when the role is not manageable", async () => {
    signedInAdmin();

    await expect(inviteStaffAction(IDLE, form({ email: "luis@example.com", role: "admin" }))).resolves.toEqual({
      status: "error",
      code: "forbidden",
      message: "No tienes permiso para gestionar el equipo.",
    });
  });

  it("flags super_admin on the role field as invalid_input", async () => {
    signedInSuperAdmin();

    await expect(grantStaffRoleAction(IDLE, form({ userId: "user-2", role: "super_admin" }))).resolves.toMatchObject({
      code: "invalid_input",
      fieldErrors: { role: ["Elige un rol válido."] },
    });
    expect(services.grantStaffRole).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", ["admin"], "admin", "forbidden"],
    ["admin", ["admin"], "super_admin", "invalid_input"],
    ["admin + commercial", ["admin", "commercial"], "admin", "forbidden"],
    ["super_admin", ["super_admin"], "super_admin", "invalid_input"],
  ] as [string, StaffRole[], StaffRole, Outcome][])(
    "%s cannot grant itself %s (%s)",
    async (_, roles, target, code) => {
      signedIn({ roles });

      await expect(grantStaffRoleAction(IDLE, form({ userId: "admin-1", role: target }))).resolves.toMatchObject({
        status: "error",
        code,
      });
      expect(services.grantStaffRole).not.toHaveBeenCalled();
    },
  );

  it("lets an admin revoke commercial from someone who is also admin (management is per role)", async () => {
    signedInAdmin();

    await expect(revokeStaffRoleAction(IDLE, form({ userId: "admin-2", role: "commercial" }))).resolves.toMatchObject({
      status: "success",
    });
    expect(services.revokeStaffRole).toHaveBeenCalledExactlyOnceWith({ userId: "admin-2", role: "commercial" }, "admin-1");
  });

  it("keeps the last admin protection when a super_admin revokes admin", async () => {
    signedInSuperAdmin();
    services.revokeStaffRole.mockResolvedValue("last_admin");

    await expect(revokeStaffRoleAction(IDLE, form({ userId: "admin-1", role: "admin" }))).resolves.toEqual({
      status: "error",
      code: "last_admin",
      message: "No se puede revocar el rol del último admin activo.",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("revokeInvitationAction by actor", () => {
  it.each([
    ["super_admin", ["super_admin"], ["commercial", "organizer", "sponsor", "admin"]],
    ["admin", ["admin"], ["commercial", "organizer", "sponsor"]],
    ["super_admin + admin", ["super_admin", "admin"], ["commercial", "organizer", "sponsor", "admin"]],
    ["admin + commercial", ["admin", "commercial"], ["commercial", "organizer", "sponsor"]],
    ["admin + organizer", ["admin", "organizer"], ["commercial", "organizer", "sponsor"]],
  ] as [string, StaffRole[], StaffRole[]][])(
    "%s passes its manageable roles to the service",
    async (_, roles, manageable) => {
      signedIn({ roles });

      await expect(revokeInvitationAction(IDLE, form({ invitationId: INVITATION_ID }))).resolves.toMatchObject({
        status: "success",
      });
      expect(services.revokeInvitation).toHaveBeenCalledExactlyOnceWith(INVITATION_ID, "admin-1", manageable);
    },
  );

  it.each([
    ["commercial", ["commercial"]],
    ["organizer", ["organizer"]],
    ["commercial + organizer", ["commercial", "organizer"]],
  ] as [string, StaffRole[]][])("%s gets forbidden without calling the service", async (_, roles) => {
    signedIn({ roles });

    await expect(revokeInvitationAction(IDLE, form({ invitationId: INVITATION_ID }))).resolves.toMatchObject({
      status: "error",
      code: "forbidden",
    });
    expect(services.revokeInvitation).not.toHaveBeenCalled();
  });

  describe("given a pending admin invitation", () => {
    // Fake service honoring the role filter of the UPDATE: only revoked when "admin" is manageable.
    beforeEach(() => {
      services.revokeInvitation.mockImplementation(async (_id, _actor, roles) => roles.includes("admin"));
    });

    it("an admin gets not_found and nothing is revalidated", async () => {
      signedInAdmin();

      await expect(revokeInvitationAction(IDLE, form({ invitationId: INVITATION_ID }))).resolves.toMatchObject({
        status: "error",
        code: "not_found",
      });
      expect(services.revokeInvitation).toHaveBeenCalledExactlyOnceWith(INVITATION_ID, "admin-1", [
        "commercial",
        "organizer",
        "sponsor",
      ]);
      expect(revalidate).not.toHaveBeenCalled();
    });

    it("a super_admin revokes it", async () => {
      signedInSuperAdmin();

      await expect(revokeInvitationAction(IDLE, form({ invitationId: INVITATION_ID }))).resolves.toMatchObject({
        status: "success",
      });
      expect(services.revokeInvitation).toHaveBeenCalledExactlyOnceWith(INVITATION_ID, "super-1", [
        "commercial",
        "organizer",
        "sponsor",
        "admin",
      ]);
      expect(revalidate.mock.calls).toEqual([
        ["/crm/admin/usuarios"], ["/crm/(protected)/admin/usuarios/[id]", "page"],
      ]);
    });
  });
});
