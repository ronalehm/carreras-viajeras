"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { createLeadSchema } from "../schemas/leads.schema";
import { createLead } from "../services/leads.service";
import type { LeadActionState } from "../types/leads.types";

const LEADS_PATH = "/crm/leads";
type ErrorState = Extract<LeadActionState, { status: "error" }>;
type ErrorCode = ErrorState["code"];

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar leads.",
  invalid_input: "Revisa los campos marcados.",
  invalid_owner: "Ese responsable ya no tiene acceso. Elige otro.",
  invalid_trip: "Ese viaje ya no está disponible.",
  not_found: "El lead ya no existe o está archivado. Recarga la página.",
  no_change: "No hay cambios.",
  closed: "El lead está cerrado o archivado.",
};

// Field that shows each service result under its input.
const RESULT_FIELDS: Partial<Record<ErrorCode, string>> = {
  invalid_owner: "ownerUserId",
  invalid_trip: "tripId",
};

function failure(code: ErrorCode, values?: Record<string, string>): ErrorState {
  const field = RESULT_FIELDS[code];
  return {
    status: "error", code, message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(field && { fieldErrors: { [field]: [ERROR_MESSAGES[code]] } }),
  };
}

// Echo only this action's known string fields, never files or arbitrary submitted keys.
function formValues(formData: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = formData.get(field);
    return typeof value === "string" ? [[field, value]] : [];
  }));
}

// Schema messages are fixed texts: they never repeat what was typed.
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[String(issue.path[0])] ??= []).push(issue.message);
  return result;
}

// requirePermission → zod → service → revalidatePath on success. The actor is always the session's user.
async function runLeadAction<Input>(
  formData: FormData,
  schema: z.ZodObject & z.ZodType<Input>,
  mutate: (input: Input, values: Record<string, string>, actorUserId: string) => Promise<LeadActionState>,
): Promise<LeadActionState> {
  let actorUserId: string;
  try {
    ({ id: actorUserId } = await requirePermission("leads.manage"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }

  const values = formValues(formData, Object.keys(schema.shape));
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ...failure("invalid_input", values), fieldErrors: fieldErrors(parsed.error) };
  }

  let state: LeadActionState;
  try {
    state = await mutate(parsed.data, values, actorUserId);
  } catch {
    // Fixed text, no cause and no console output: personal data and database details stay here.
    throw new Error("lead action failed");
  }
  if (state.status === "success") revalidatePath(LEADS_PATH);
  return state;
}

export async function createLeadAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const state = await runLeadAction(formData, createLeadSchema, async (input, values, actorUserId) => {
    const result = await createLead(input, actorUserId);
    return typeof result === "string"
      ? failure(result, values)
      : { status: "success", message: "Lead registrado." };
  });
  // Next's redirect throws; it must stay outside the mutation's catch.
  if (state.status === "success") redirect(LEADS_PATH);
  return state;
}
