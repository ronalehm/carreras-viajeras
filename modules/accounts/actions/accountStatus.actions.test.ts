// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { auth, currentUser, clerkClient, clerkUsers } = vi.hoisted(() => {
  const clerkUsers = { banUser: vi.fn(), unbanUser: vi.fn(), deleteUser: vi.fn() };
  return {
    auth: vi.fn(),
    currentUser: vi.fn(),
    clerkUsers,
    clerkClient: vi.fn(async () => ({ users: clerkUsers })),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser, clerkClient }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(),
  loadStaffRoles: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../services/accountStatus.service", () => ({
  disableAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  getAccountState: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import type { StaffRole } from "@/lib/auth/permissions";
import {
  deleteAccount,
  disableAccount,
  getAccountState,
  reactivateAccount,
} from "../services/accountStatus.service";
import type { AccountStatusActionState } from "../types/accountStatus.types";
import {
  deleteAccountAction,
  disableAccountAction,
  reactivateAccountAction,
  retryClerkSyncAction,
} from "./accountStatus.actions";

const accept = vi.mocked(acceptInvitationAndLoadStaffRoles);
const load = vi.mocked(loadStaffRoles);
const revalidate = vi.mocked(revalidatePath);
const services = {
  disableAccount: vi.mocked(disableAccount),
  reactivateAccount: vi.mocked(reactivateAccount),
  deleteAccount: vi.mocked(deleteAccount),
  getAccountState: vi.mocked(getAccountState),
};

const IDLE: AccountStatusActionState = { status: "idle" };
const ACTOR = "user_super";
const TARGET = "user_target";
// Clerk errors may carry the email of the account: it must never reach logs or responses.
const CLERK_ERROR = Object.assign(new Error("ana@correo.com could not be banned (sk_live_x)"), {
  status: 500,
});

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

function signedIn(roles: StaffRole[], { emailVerified = true, blocked = false } = {}) {
  auth.mockResolvedValue({ userId: ACTOR });
  currentUser.mockResolvedValue({
    id: ACTOR,
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [
      {
        id: "idn_primary",
        emailAddress: "super@example.com",
        verification: { status: emailVerified ? "verified" : "unverified" },
      },
    ],
  });
  accept.mockResolvedValue({ staffRoles: roles, blocked });
  load.mockResolvedValue({ staffRoles: roles, blocked });
}

const ACTIONS = [
  ["disableAccountAction", disableAccountAction, { userId: TARGET }],
  ["reactivateAccountAction", reactivateAccountAction, { userId: TARGET }],
  ["deleteAccountAction", deleteAccountAction, { userId: TARGET, confirmEmail: "ana@correo.com" }],
  ["retryClerkSyncAction", retryClerkSyncAction, { userId: TARGET }],
] as const;

function expectNoEffects() {
  for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
  expect(clerkClient).not.toHaveBeenCalled();
  expect(revalidate).not.toHaveBeenCalled();
}

let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReset();
  currentUser.mockReset();
  for (const call of Object.values(clerkUsers)) call.mockResolvedValue({});
  services.disableAccount.mockResolvedValue("disabled");
  services.reactivateAccount.mockResolvedValue("reactivated");
  services.deleteAccount.mockResolvedValue("deleted");
  services.getAccountState.mockResolvedValue({ status: "disabled", protected: false });
  logError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => logError.mockRestore());

describe("guard (every action)", () => {
  it.each(ACTIONS)("%s: without a session → unauthorized", async (_, action, fields) => {
    auth.mockResolvedValue({ userId: null });

    await expect(action(IDLE, form(fields))).resolves.toMatchObject({ code: "unauthorized" });
    expectNoEffects();
  });

  it.each(ACTIONS)("%s: an admin (staff.manage but not super_admin) → forbidden", async (_, action, fields) => {
    signedIn(["admin"]);

    await expect(action(IDLE, form(fields))).resolves.toEqual({
      status: "error",
      code: "forbidden",
      message: "No tienes permiso para realizar esta acción.",
    });
    expectNoEffects();
  });

  it.each(ACTIONS)("%s: commercial or an unverified super_admin → forbidden", async (_, action, fields) => {
    signedIn(["commercial"]);
    await expect(action(IDLE, form(fields))).resolves.toMatchObject({ code: "forbidden" });

    signedIn(["super_admin"], { emailVerified: false });
    await expect(action(IDLE, form(fields))).resolves.toMatchObject({ code: "forbidden" });
    expectNoEffects();
  });

  it.each(ACTIONS)("%s: a blocked super_admin → forbidden", async (_, action, fields) => {
    signedIn(["super_admin"], { blocked: true });

    await expect(action(IDLE, form(fields))).resolves.toMatchObject({ code: "forbidden" });
    expectNoEffects();
  });

  it.each(ACTIONS)("%s: on the own account → self", async (_, action, fields) => {
    signedIn(["super_admin"]);

    await expect(action(IDLE, form({ ...fields, userId: ACTOR }))).resolves.toEqual({
      status: "error",
      code: "self",
      message: "No puedes desactivar ni eliminar tu propia cuenta.",
    });
    expectNoEffects();
  });

  it.each(ACTIONS)("%s: without a valid userId → invalid_input", async (_, action, fields) => {
    signedIn(["super_admin"]);

    await expect(action(IDLE, form({ ...fields, userId: "" }))).resolves.toMatchObject({
      code: "invalid_input",
    });
    expectNoEffects();
  });
});

describe("disableAccountAction", () => {
  it("disables in Neon with the session actor, revalidates, then bans in Clerk", async () => {
    signedIn(["super_admin"]);

    const state = await disableAccountAction(
      IDLE,
      form({ userId: TARGET, actorUserId: "forged", disabledBy: "forged" }),
    );

    expect(state).toEqual({ status: "success", message: "Cuenta desactivada." });
    expect(services.disableAccount).toHaveBeenCalledExactlyOnceWith(TARGET, ACTOR);
    expect(clerkUsers.banUser).toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(clerkUsers.unbanUser).not.toHaveBeenCalled();
    expect(clerkUsers.deleteUser).not.toHaveBeenCalled();
    // Neon first, Clerk after.
    expect(services.disableAccount.mock.invocationCallOrder[0]).toBeLessThan(
      clerkUsers.banUser.mock.invocationCallOrder[0],
    );
    expect(revalidate.mock.calls).toEqual([
      ["/crm/admin/usuarios"],
      ["/crm/(protected)/admin/usuarios/[id]", "page"],
    ]);
  });

  it.each([
    ["protected", "No se puede modificar la cuenta de un super administrador."],
    ["last_admin", "No se puede revocar el rol del último admin activo."],
    ["not_found", "La cuenta ya cambió o no está registrada. Recarga la página."],
  ] as const)("returns %s without calling Clerk nor revalidating", async (code, message) => {
    signedIn(["super_admin"]);
    services.disableAccount.mockResolvedValue(code);

    await expect(disableAccountAction(IDLE, form({ userId: TARGET }))).resolves.toEqual({
      status: "error",
      code,
      message,
    });
    expect(clerkClient).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("when banUser fails, keeps the account blocked in Neon and says so, logging only a fixed text", async () => {
    signedIn(["super_admin"]);
    clerkUsers.banUser.mockRejectedValue(CLERK_ERROR);

    const state = await disableAccountAction(IDLE, form({ userId: TARGET }));

    expect(state).toEqual({
      status: "error",
      code: "clerk_failed",
      message: "Cuenta desactivada en la aplicación, pero no se pudo bloquear en Clerk. Reintenta.",
    });
    expect(services.disableAccount).toHaveBeenCalledTimes(1);
    // Neon changed: the list and the detail are refreshed anyway.
    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledExactlyOnceWith("accounts: clerk ban failed");
    expect(JSON.stringify([state, logError.mock.calls])).not.toMatch(/ana@correo|sk_live/);
  });

  it("when clerkClient() itself fails, it is the same partial failure", async () => {
    signedIn(["super_admin"]);
    clerkClient.mockRejectedValueOnce(CLERK_ERROR);

    await expect(disableAccountAction(IDLE, form({ userId: TARGET }))).resolves.toMatchObject({
      code: "clerk_failed",
    });
  });

  it("hides database errors behind a fixed error without calling Clerk", async () => {
    signedIn(["super_admin"]);
    services.disableAccount.mockRejectedValue(new Error("deadlock on ana@correo.com"));

    const error = await disableAccountAction(IDLE, form({ userId: TARGET })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("account status action failed");
    expect((error as Error).cause).toBeUndefined();
    expect(clerkClient).not.toHaveBeenCalled();
  });
});

describe("reactivateAccountAction", () => {
  it("reactivates in Neon (without roles) and unbans in Clerk", async () => {
    signedIn(["super_admin"]);

    await expect(reactivateAccountAction(IDLE, form({ userId: TARGET }))).resolves.toEqual({
      status: "success",
      message: "Cuenta reactivada. No tiene roles: asígnalos desde esta ficha.",
    });
    expect(services.reactivateAccount).toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(clerkUsers.unbanUser).toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(clerkUsers.banUser).not.toHaveBeenCalled();
  });

  it("returns protected or not_found without calling Clerk", async () => {
    signedIn(["super_admin"]);
    services.reactivateAccount.mockResolvedValueOnce("protected").mockResolvedValueOnce("not_found");

    await expect(reactivateAccountAction(IDLE, form({ userId: TARGET }))).resolves.toMatchObject({ code: "protected" });
    await expect(reactivateAccountAction(IDLE, form({ userId: TARGET }))).resolves.toMatchObject({ code: "not_found" });
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("reports a failed unbanUser, even a 404", async () => {
    signedIn(["super_admin"]);
    clerkUsers.unbanUser.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));

    await expect(reactivateAccountAction(IDLE, form({ userId: TARGET }))).resolves.toEqual({
      status: "error",
      code: "clerk_failed",
      message: "Cuenta reactivada en la aplicación, pero no se pudo desbloquear en Clerk. Reintenta.",
    });
    expect(logError).toHaveBeenCalledExactlyOnceWith("accounts: clerk unban failed");
  });
});

describe("deleteAccountAction", () => {
  it("passes the normalized confirmation email to the batch, then deletes the Clerk user", async () => {
    signedIn(["super_admin"]);

    const state = await deleteAccountAction(
      IDLE,
      form({ userId: TARGET, confirmEmail: "  Ana@Correo.com ", deletedBy: "forged" }),
    );

    expect(state).toEqual({ status: "success", message: "Cuenta eliminada." });
    expect(services.deleteAccount).toHaveBeenCalledExactlyOnceWith(
      { userId: TARGET, confirmEmail: "ana@correo.com" },
      ACTOR,
    );
    expect(clerkUsers.deleteUser).toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(services.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      clerkUsers.deleteUser.mock.invocationCallOrder[0],
    );
    expect(revalidate).toHaveBeenCalledTimes(2);
  });

  it("with a different email changes nothing and says 'El correo no coincide.'", async () => {
    signedIn(["super_admin"]);
    services.deleteAccount.mockResolvedValue("email_mismatch");

    await expect(
      deleteAccountAction(IDLE, form({ userId: TARGET, confirmEmail: "otra@correo.com" })),
    ).resolves.toEqual({ status: "error", code: "email_mismatch", message: "El correo no coincide." });
    expect(clerkClient).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("without the confirmation email → invalid_input without calling the service", async () => {
    signedIn(["super_admin"]);

    await expect(deleteAccountAction(IDLE, form({ userId: TARGET }))).resolves.toMatchObject({
      code: "invalid_input",
    });
    expect(services.deleteAccount).not.toHaveBeenCalled();
  });

  it.each(["protected", "last_admin", "not_found"] as const)("returns %s without calling Clerk", async (code) => {
    signedIn(["super_admin"]);
    services.deleteAccount.mockResolvedValue(code);

    await expect(
      deleteAccountAction(IDLE, form({ userId: TARGET, confirmEmail: "ana@correo.com" })),
    ).resolves.toMatchObject({ code });
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("when deleteUser fails, the account stays deleted in Neon and the message says so", async () => {
    signedIn(["super_admin"]);
    clerkUsers.deleteUser.mockRejectedValue(CLERK_ERROR);

    const state = await deleteAccountAction(
      IDLE,
      form({ userId: TARGET, confirmEmail: "ana@correo.com" }),
    );
    expect(state).toEqual({
      status: "error",
      code: "clerk_failed",
      message: "Cuenta eliminada en la aplicación, pero no se pudo borrar en Clerk. Reintenta.",
    });
    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledExactlyOnceWith("accounts: clerk delete failed");
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(/ana@correo|sk_live/);
  });

  it("treats a Clerk 404 (user already gone) as done", async () => {
    signedIn(["super_admin"]);
    clerkUsers.deleteUser.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));

    await expect(
      deleteAccountAction(IDLE, form({ userId: TARGET, confirmEmail: "ana@correo.com" })),
    ).resolves.toEqual({ status: "success", message: "Cuenta eliminada." });
    expect(logError).not.toHaveBeenCalled();
  });
});

describe("retryClerkSyncAction", () => {
  it.each([
    ["disabled", "banUser"],
    ["deleted", "deleteUser"],
    ["active", "unbanUser"],
  ] as const)("for a %s account only repeats %s in Clerk", async (status, call) => {
    signedIn(["super_admin"]);
    services.getAccountState.mockResolvedValue({ status, protected: false });

    await expect(retryClerkSyncAction(IDLE, form({ userId: TARGET }))).resolves.toEqual({
      status: "success",
      message: "Cuenta actualizada en Clerk.",
    });
    expect(services.getAccountState).toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(clerkUsers[call]).toHaveBeenCalledExactlyOnceWith(TARGET);
    for (const other of Object.keys(clerkUsers).filter((name) => name !== call)) {
      expect(clerkUsers[other as keyof typeof clerkUsers]).not.toHaveBeenCalled();
    }
    // Neon is never written by the retry.
    expect(services.disableAccount).not.toHaveBeenCalled();
    expect(services.reactivateAccount).not.toHaveBeenCalled();
    expect(services.deleteAccount).not.toHaveBeenCalled();
  });

  it("returns protected for a super_admin and not_found without a profile, without calling Clerk", async () => {
    signedIn(["super_admin"]);
    services.getAccountState
      .mockResolvedValueOnce({ status: "active", protected: true })
      .mockResolvedValueOnce(null);

    await expect(retryClerkSyncAction(IDLE, form({ userId: TARGET }))).resolves.toMatchObject({ code: "protected" });
    await expect(retryClerkSyncAction(IDLE, form({ userId: TARGET }))).resolves.toMatchObject({ code: "not_found" });
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("reports a new Clerk failure with a fixed message", async () => {
    signedIn(["super_admin"]);
    clerkUsers.banUser.mockRejectedValue(CLERK_ERROR);

    const state = await retryClerkSyncAction(IDLE, form({ userId: TARGET }));
    expect(state).toEqual({
      status: "error",
      code: "clerk_failed",
      message: "No se pudo actualizar la cuenta en Clerk. Reintenta.",
    });
    expect(JSON.stringify([state, logError.mock.calls])).not.toMatch(/ana@correo|sk_live/);
  });
});
