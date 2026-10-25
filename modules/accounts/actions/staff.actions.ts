"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import {
  invitationIdSchema,
  inviteStaffSchema,
  staffRoleChangeSchema,
} from "../schemas/staff.schema";
import {
  createInvitation,
  grantStaffRole,
  revokeInvitation,
  revokeStaffRole,
} from "../services/staff.service";
import type { StaffActionState } from "../types/staff.types";

const USER_LIST_PATH = "/crm/admin/usuarios";
// Route pattern: refreshes every user detail page (no layout.tsx in that segment, so "page").
const USER_DETAIL_ROUTE = "/crm/admin/usuarios/[id]";

type StaffActionErrorCode = Extract<StaffActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<StaffActionErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar el equipo.",
  invalid_input: "Revisa los datos del formulario.",
  pending_invitation_exists: "Ya hay una invitación pendiente y vigente para ese correo.",
  not_found: "Ya no está pendiente o activo. Recarga la página.",
  no_change: "No hay cambios: el usuario no tiene perfil de staff o ya tiene ese rol.",
  last_admin: "No se puede revocar el rol del último admin activo.",
};

const FIELD_MESSAGES: Record<string, string> = {
  email: "Introduce un correo válido.",
  role: "Elige un rol válido.",
  invitationId: "La invitación no es válida.",
  userId: "El usuario no es válido.",
};

function failure(
  code: StaffActionErrorCode,
  fieldErrors?: Record<string, string[]>,
): StaffActionState {
  return { status: "error", code, message: ERROR_MESSAGES[code], ...(fieldErrors && { fieldErrors }) };
}

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields = new Set(error.issues.map((issue) => String(issue.path[0])));
  return Object.fromEntries([...fields].map((field) => [field, [FIELD_MESSAGES[field]]]));
}

async function authorizeAdmin(): Promise<CurrentUser | StaffActionState> {
  try {
    return await requirePermission("staff.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }
}

// Order: guard → validation → service with the session user as actor → revalidate on success.
// Only the session decides the actor; extra form fields are dropped by the schema.
async function runAdminAction<Input>(
  formData: FormData,
  schema: z.ZodType<Input>,
  mutate: (input: Input, actorUserId: string) => Promise<StaffActionState>,
): Promise<StaffActionState> {
  const actor = await authorizeAdmin();
  if ("status" in actor) return actor;

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", toFieldErrors(parsed.error));

  let state: StaffActionState;
  try {
    state = await mutate(parsed.data, actor.id);
  } catch {
    // Fixed text, no cause: the original database message never reaches responses or logs.
    throw new Error("staff action failed");
  }
  if (state.status === "success") {
    revalidatePath(USER_LIST_PATH);
    revalidatePath(USER_DETAIL_ROUTE, "page");
  }
  return state;
}

export async function inviteStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return runAdminAction(formData, inviteStaffSchema, async (input, actorUserId) => {
    const result = await createInvitation(input, actorUserId);
    if (result === "pending_invitation_exists") return failure(result);
    return {
      status: "success",
      message: `Invitación creada para ${input.email}. Comparte el enlace de acceso.`,
      acceptUrl: new URL("/crm/acceso", getEnv().APP_ORIGIN).toString(),
    };
  });
}

export async function revokeInvitationAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return runAdminAction(formData, invitationIdSchema, async ({ invitationId }, actorUserId) => {
    const revoked = await revokeInvitation(invitationId, actorUserId);
    return revoked ? { status: "success", message: "Invitación revocada." } : failure("not_found");
  });
}

export async function grantStaffRoleAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return runAdminAction(formData, staffRoleChangeSchema, async (input, actorUserId) => {
    const granted = await grantStaffRole(input, actorUserId);
    return granted ? { status: "success", message: "Rol asignado." } : failure("no_change");
  });
}

export async function revokeStaffRoleAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return runAdminAction(formData, staffRoleChangeSchema, async (input, actorUserId) => {
    const result = await revokeStaffRole(input, actorUserId);
    return result === "revoked" ? { status: "success", message: "Rol revocado." } : failure(result);
  });
}
