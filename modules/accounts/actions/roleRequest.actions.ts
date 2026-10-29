"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, requireVerifiedEmail, type CurrentUser } from "@/lib/auth/guards";
import { can, canManageRole } from "@/lib/auth/permissions";
import { roleRequestIdSchema } from "../schemas/roleRequest.schema";
import {
  approveRoleRequest,
  createAdminRoleRequest,
  rejectRoleRequest,
} from "../services/roleRequest.service";
import type { RoleRequestActionState } from "../types/roleRequest.types";

const USER_LIST_PATH = "/crm/admin/usuarios";
// Route pattern: refreshes every user detail page (no layout.tsx in that segment, so "page").
const USER_DETAIL_ROUTE = "/crm/(protected)/admin/usuarios/[id]";

type RoleRequestErrorCode = Extract<RoleRequestActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<RoleRequestErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para realizar esta acción.",
  email_unverified: "Verifica tu correo para poder solicitar acceso.",
  invalid_input: "La solicitud no es válida.",
  already_has_access: "Tu cuenta ya tiene acceso al CRM. Recarga la página.",
  not_found: "Ya no está pendiente. Recarga la página.",
};

function failure(code: RoleRequestErrorCode): RoleRequestActionState {
  return { status: "error", code, message: ERROR_MESSAGES[code] };
}

// Maps the guard's errors to fixed states; anything else (a bug) propagates.
async function authorize(
  guard: () => Promise<CurrentUser>,
): Promise<CurrentUser | RoleRequestActionState> {
  try {
    return await guard();
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) {
      return failure(error.reason === "email_unverified" ? "email_unverified" : "forbidden");
    }
    throw error;
  }
}

// Fixed text, no cause: the original database message never reaches responses or logs.
async function runService<Result>(call: () => Promise<Result>): Promise<Result> {
  try {
    return await call();
  } catch {
    throw new Error("role request action failed");
  }
}

// The form data is ignored: the account comes from the session and the role is always admin.
// Both parameters exist only for the useActionState signature.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function requestAdminRoleAction(
  _prev: RoleRequestActionState,
  _formData: FormData,
): Promise<RoleRequestActionState> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const user = await authorize(requireVerifiedEmail);
  if ("status" in user) return user;
  if (can(user.staffRoles, "crm.access")) return failure("already_has_access");

  await runService(() => createAdminRoleRequest(user.id));
  revalidatePath("/crm", "layout");
  return { status: "success", message: "Solicitud enviada. Un super administrador la revisará." };
}

// Order: guard (staff.manage + may manage admin, i.e. super_admin) → validation → service with the
// session user as actor → revalidate on success. Extra form fields are dropped by the schema.
async function runDecision(
  formData: FormData,
  decide: (requestId: string, actorUserId: string) => Promise<boolean>,
  successMessage: string,
): Promise<RoleRequestActionState> {
  const actor = await authorize(() => requirePermission("staff.manage"));
  if ("status" in actor) return actor;
  if (!canManageRole(actor.staffRoles, "admin")) return failure("forbidden");

  const parsed = roleRequestIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input");

  const decided = await runService(() => decide(parsed.data.requestId, actor.id));
  if (!decided) return failure("not_found");

  revalidatePath(USER_LIST_PATH);
  revalidatePath(USER_DETAIL_ROUTE, "page");
  return { status: "success", message: successMessage };
}

export async function approveRoleRequestAction(
  _prev: RoleRequestActionState,
  formData: FormData,
): Promise<RoleRequestActionState> {
  return runDecision(formData, approveRoleRequest, "Solicitud aprobada. La cuenta ya es Admin.");
}

export async function rejectRoleRequestAction(
  _prev: RoleRequestActionState,
  formData: FormData,
): Promise<RoleRequestActionState> {
  return runDecision(formData, rejectRoleRequest, "Solicitud rechazada.");
}
