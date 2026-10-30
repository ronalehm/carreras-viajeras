"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { canRemoveAccounts } from "@/lib/auth/permissions";
import { accountTargetSchema, deleteAccountSchema } from "../schemas/accountStatus.schema";
import {
  deleteAccount,
  disableAccount,
  getAccountState,
  reactivateAccount,
} from "../services/accountStatus.service";
import type { AccountStatus, AccountStatusActionState } from "../types/accountStatus.types";

const USER_LIST_PATH = "/crm/admin/usuarios";
// Route pattern: refreshes every user detail page (no layout.tsx in that segment, so "page").
const USER_DETAIL_ROUTE = "/crm/(protected)/admin/usuarios/[id]";

type ErrorCode = Extract<AccountStatusActionState, { status: "error" }>["code"];
type ServiceErrorCode = Exclude<ErrorCode, "unauthorized" | "forbidden" | "invalid_input" | "self" | "clerk_failed">;

const ERROR_MESSAGES: Record<Exclude<ErrorCode, "clerk_failed">, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para realizar esta acción.",
  invalid_input: "Revisa los datos del formulario.",
  self: "No puedes desactivar ni eliminar tu propia cuenta.",
  protected: "No se puede modificar la cuenta de un super administrador.",
  not_found: "La cuenta ya cambió o no está registrada. Recarga la página.",
  last_admin: "No se puede revocar el rol del último admin activo.",
  email_mismatch: "El correo no coincide.",
};

function failure(code: Exclude<ErrorCode, "clerk_failed">): AccountStatusActionState {
  return { status: "error", code, message: ERROR_MESSAGES[code] };
}

// Neon already changed; only Clerk is pending, and "Reintentar en Clerk" repeats just that call.
function clerkFailure(message: string): AccountStatusActionState {
  return { status: "error", code: "clerk_failed", message };
}

// Guard: staff.manage plus canRemoveAccounts (super_admin only, outside the matrix).
async function authorize(): Promise<CurrentUser | AccountStatusActionState> {
  try {
    const actor = await requirePermission("staff.manage");
    return canRemoveAccounts(actor.staffRoles) ? actor : failure("forbidden");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }
}

// Order: guard → validation → never on the own account. Extra form fields are dropped by the schema.
async function authorizeTarget<Input extends { userId: string }>(
  formData: FormData,
  schema: z.ZodType<Input>,
): Promise<{ actor: CurrentUser; input: Input } | AccountStatusActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input");
  if (parsed.data.userId === actor.id) return failure("self");
  return { actor, input: parsed.data };
}

// Fixed text, no cause: the original database message never reaches responses or logs.
async function runService<Result>(call: () => Promise<Result>): Promise<Result> {
  try {
    return await call();
  } catch {
    throw new Error("account status action failed");
  }
}

type ClerkCall = "ban" | "unban" | "delete";

// A user that no longer exists in Clerk is already banned or deleted for our purposes.
function isClerkNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

// Only after the guard (R18). true = done. The original Clerk error may contain the email: it is
// never logged nor returned, only a fixed text.
async function updateClerk(call: ClerkCall, userId: string): Promise<boolean> {
  try {
    const { users } = await clerkClient();
    if (call === "ban") await users.banUser(userId);
    else if (call === "unban") await users.unbanUser(userId);
    else await users.deleteUser(userId);
    return true;
  } catch (error) {
    if (call !== "unban" && isClerkNotFound(error)) return true;
    console.error(`accounts: clerk ${call} failed`);
    return false;
  }
}

function revalidateUsers() {
  revalidatePath(USER_LIST_PATH);
  revalidatePath(USER_DETAIL_ROUTE, "page");
}

// Neon first (fail closed), then Clerk (Decision 8).
async function runStatusChange<Input extends { userId: string }>(
  formData: FormData,
  schema: z.ZodType<Input>,
  change: (input: Input, actorUserId: string) => Promise<"done" | ServiceErrorCode>,
  clerk: { call: ClerkCall; success: string; partial: string },
): Promise<AccountStatusActionState> {
  const target = await authorizeTarget(formData, schema);
  if ("status" in target) return target;

  const result = await runService(() => change(target.input, target.actor.id));
  if (result !== "done") return failure(result);
  revalidateUsers();

  const synced = await updateClerk(clerk.call, target.input.userId);
  return synced ? { status: "success", message: clerk.success } : clerkFailure(clerk.partial);
}

export async function disableAccountAction(
  _prev: AccountStatusActionState,
  formData: FormData,
): Promise<AccountStatusActionState> {
  return runStatusChange(
    formData,
    accountTargetSchema,
    async ({ userId }, actorUserId) => {
      const result = await disableAccount(userId, actorUserId);
      return result === "disabled" ? "done" : result;
    },
    {
      call: "ban",
      success: "Cuenta desactivada.",
      partial: "Cuenta desactivada en la aplicación, pero no se pudo bloquear en Clerk. Reintenta.",
    },
  );
}

export async function reactivateAccountAction(
  _prev: AccountStatusActionState,
  formData: FormData,
): Promise<AccountStatusActionState> {
  return runStatusChange(
    formData,
    accountTargetSchema,
    async ({ userId }) => {
      const result = await reactivateAccount(userId);
      return result === "reactivated" ? "done" : result;
    },
    {
      call: "unban",
      success: "Cuenta reactivada. No tiene roles: asígnalos desde esta ficha.",
      partial: "Cuenta reactivada en la aplicación, pero no se pudo desbloquear en Clerk. Reintenta.",
    },
  );
}

// The typed email is compared with profiles.email inside the deletion batch (R15).
export async function deleteAccountAction(
  _prev: AccountStatusActionState,
  formData: FormData,
): Promise<AccountStatusActionState> {
  return runStatusChange(
    formData,
    deleteAccountSchema,
    async (input, actorUserId) => {
      const result = await deleteAccount(input, actorUserId);
      return result === "deleted" ? "done" : result;
    },
    {
      call: "delete",
      success: "Cuenta eliminada.",
      partial: "Cuenta eliminada en la aplicación, pero no se pudo borrar en Clerk. Reintenta.",
    },
  );
}

const CLERK_CALL_FOR: Record<AccountStatus, ClerkCall> = {
  active: "unban",
  disabled: "ban",
  deleted: "delete",
};

// "Reintentar en Clerk": repeats only the Clerk call that matches the account's state in Neon.
// Idempotent; it never changes Neon.
export async function retryClerkSyncAction(
  _prev: AccountStatusActionState,
  formData: FormData,
): Promise<AccountStatusActionState> {
  const target = await authorizeTarget(formData, accountTargetSchema);
  if ("status" in target) return target;

  const state = await runService(() => getAccountState(target.input.userId));
  if (!state) return failure("not_found");
  if (state.protected) return failure("protected");

  const synced = await updateClerk(CLERK_CALL_FOR[state.status], target.input.userId);
  return synced
    ? { status: "success", message: "Cuenta actualizada en Clerk." }
    : clerkFailure("No se pudo actualizar la cuenta en Clerk. Reintenta.");
}
