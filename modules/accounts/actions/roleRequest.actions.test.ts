// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("server-only", () => ({}));

const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadStaffRoles: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../services/roleRequest.service", () => ({
  createAdminRoleRequest: vi.fn(),
  approveRoleRequest: vi.fn(),
  rejectRoleRequest: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import type { StaffRole } from "@/lib/auth/permissions";
import {
  approveRoleRequest,
  createAdminRoleRequest,
  rejectRoleRequest,
} from "../services/roleRequest.service";
import type { RoleRequestActionState } from "../types/roleRequest.types";
import {
  approveRoleRequestAction,
  rejectRoleRequestAction,
  requestAdminRoleAction,
} from "./roleRequest.actions";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);
const revalidate = vi.mocked(revalidatePath);
const services = {
  createAdminRoleRequest: vi.mocked(createAdminRoleRequest),
  approveRoleRequest: vi.mocked(approveRoleRequest),
  rejectRoleRequest: vi.mocked(rejectRoleRequest),
};

const IDLE: RoleRequestActionState = { status: "idle" };
const REQUEST_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

function signedIn({
  roles,
  emailVerified = true,
  userId = "user-1",
}: {
  roles: StaffRole[];
  emailVerified?: boolean;
  userId?: string;
}) {
  auth.mockResolvedValue({ userId });
  currentUser.mockResolvedValue({
    id: userId,
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [
      {
        id: "idn_primary",
        emailAddress: "ana@example.com",
        verification: { status: emailVerified ? "verified" : "unverified" },
      },
    ],
  });
  accept.mockResolvedValue({ staffRoles: roles, blocked: false });
  load.mockResolvedValue({ staffRoles: roles, blocked: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReset();
  currentUser.mockReset();
  services.createAdminRoleRequest.mockResolvedValue(undefined);
  services.approveRoleRequest.mockResolvedValue(true);
  services.rejectRoleRequest.mockResolvedValue(true);
});

describe("requestAdminRoleAction", () => {
  it("creates the request for the session account, ignoring forged fields, and revalidates /crm", async () => {
    signedIn({ roles: [] });

    const state = await requestAdminRoleAction(
      IDLE,
      form({ userId: "other-user", role: "super_admin", status: "approved" }),
    );

    expect(state).toEqual({
      status: "success",
      message: "Solicitud enviada. Un super administrador la revisará.",
    });
    expect(services.createAdminRoleRequest).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(revalidate.mock.calls).toEqual([["/crm", "layout"]]);
  });

  it("returns the same success when sent twice (the service is idempotent)", async () => {
    signedIn({ roles: [] });

    const first = await requestAdminRoleAction(IDLE, form({}));
    const second = await requestAdminRoleAction(first, form({}));

    expect(second).toEqual(first);
    expect(services.createAdminRoleRequest.mock.calls).toEqual([["user-1"], ["user-1"]]);
  });

  it("lets a sponsor without CRM access request the role", async () => {
    signedIn({ roles: ["sponsor"] });

    await expect(requestAdminRoleAction(IDLE, form({}))).resolves.toMatchObject({ status: "success" });
  });

  it.each<StaffRole[]>([["commercial"], ["organizer"], ["admin"], ["super_admin"]])(
    "answers 'already has access' for %s without creating a request",
    async (role) => {
      signedIn({ roles: [role] });

      await expect(requestAdminRoleAction(IDLE, form({}))).resolves.toEqual({
        status: "error",
        code: "already_has_access",
        message: "Tu cuenta ya tiene acceso al CRM. Recarga la página.",
      });
      expect(services.createAdminRoleRequest).not.toHaveBeenCalled();
      expect(revalidate).not.toHaveBeenCalled();
    },
  );

  it("returns unauthorized without a session", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(requestAdminRoleAction(IDLE, form({}))).resolves.toMatchObject({
      status: "error",
      code: "unauthorized",
    });
    expect(services.createAdminRoleRequest).not.toHaveBeenCalled();
  });

  it("refuses an unverified email without creating a request", async () => {
    signedIn({ roles: [], emailVerified: false });

    await expect(requestAdminRoleAction(IDLE, form({}))).resolves.toMatchObject({
      status: "error",
      code: "email_unverified",
    });
    expect(services.createAdminRoleRequest).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns forbidden when the role lookup fails", async () => {
    signedIn({ roles: [] });
    accept.mockRejectedValue(new Error("password authentication failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(requestAdminRoleAction(IDLE, form({}))).resolves.toMatchObject({
      status: "error",
      code: "forbidden",
    });
    expect(services.createAdminRoleRequest).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rethrows service failures without the original message", async () => {
    signedIn({ roles: [] });
    services.createAdminRoleRequest.mockRejectedValue(new Error("insert failed: ana@example.com"));

    const error = await requestAdminRoleAction(IDLE, form({})).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("role request action failed");
    expect((error as Error).cause).toBeUndefined();
    expect(revalidate).not.toHaveBeenCalled();
  });
});

type DecisionCase = {
  name: string;
  action: (prev: RoleRequestActionState, formData: FormData) => Promise<RoleRequestActionState>;
  service: MockInstance;
  successMessage: string;
};

const decisions: DecisionCase[] = [
  {
    name: "approveRoleRequestAction",
    action: approveRoleRequestAction,
    service: services.approveRoleRequest,
    successMessage: "Solicitud aprobada. La cuenta ya es Admin.",
  },
  {
    name: "rejectRoleRequestAction",
    action: rejectRoleRequestAction,
    service: services.rejectRoleRequest,
    successMessage: "Solicitud rechazada.",
  },
];

describe.each(decisions)("$name", ({ action, service, successMessage }) => {
  it("decides as the session super_admin, ignoring forged fields, and revalidates the list and the detail", async () => {
    signedIn({ roles: ["super_admin"], userId: "super-1" });

    const state = await action(
      IDLE,
      form({ requestId: REQUEST_ID, decidedBy: "attacker", userId: "other-user", role: "super_admin" }),
    );

    expect(state).toEqual({ status: "success", message: successMessage });
    expect(service).toHaveBeenCalledExactlyOnceWith(REQUEST_ID, "super-1");
    expect(revalidate.mock.calls).toEqual([
      ["/crm/admin/usuarios"],
      ["/crm/(protected)/admin/usuarios/[id]", "page"],
    ]);
  });

  it("returns not_found when the request is no longer pending", async () => {
    signedIn({ roles: ["super_admin"], userId: "super-1" });
    service.mockResolvedValue(false);

    await expect(action(IDLE, form({ requestId: REQUEST_ID }))).resolves.toEqual({
      status: "error",
      code: "not_found",
      message: "Ya no está pendiente. Recarga la página.",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["an admin", { roles: ["admin"] as StaffRole[] }],
    ["an admin and commercial", { roles: ["admin", "commercial"] as StaffRole[] }],
    ["a commercial", { roles: ["commercial"] as StaffRole[] }],
    ["an organizer", { roles: ["organizer"] as StaffRole[] }],
    ["a sponsor", { roles: ["sponsor"] as StaffRole[] }],
    ["an account without roles", { roles: [] as StaffRole[] }],
  ])("returns forbidden for %s without calling the service", async (_, session) => {
    signedIn(session);

    await expect(action(IDLE, form({ requestId: REQUEST_ID }))).resolves.toMatchObject({
      status: "error",
      code: "forbidden",
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("refuses a super_admin with an unverified email", async () => {
    signedIn({ roles: ["super_admin"], emailVerified: false });

    await expect(action(IDLE, form({ requestId: REQUEST_ID }))).resolves.toMatchObject({ code: "email_unverified" });
    expect(service).not.toHaveBeenCalled();
  });

  it("returns unauthorized without a session", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(action(IDLE, form({ requestId: REQUEST_ID }))).resolves.toMatchObject({ code: "unauthorized" });
    expect(service).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{}, { requestId: "" }, { requestId: "123" }, { requestId: "' OR 1=1 --" }])(
    "rejects %o as invalid_input",
    async (fields) => {
      signedIn({ roles: ["super_admin"], userId: "super-1" });

      await expect(action(IDLE, form(fields))).resolves.toMatchObject({ code: "invalid_input" });
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("rethrows service failures without the original message", async () => {
    signedIn({ roles: ["super_admin"], userId: "super-1" });
    service.mockRejectedValue(new Error("deadlock detected"));

    const error = await action(IDLE, form({ requestId: REQUEST_ID })).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("role request action failed");
    expect((error as Error).cause).toBeUndefined();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("never includes other accounts' emails or ids in the response", async () => {
    signedIn({ roles: ["super_admin"], userId: "super-1" });

    const state = await action(IDLE, form({ requestId: REQUEST_ID }));
    expect(JSON.stringify(state)).not.toMatch(/@|user-|super-1|3f1c2a6e/);
  });
});
