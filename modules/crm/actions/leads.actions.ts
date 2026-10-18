"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { createLeadSchema } from "../schemas/leads.schema";
import { createLead } from "../services/leads.service";
import type { LeadActionState } from "../types/leads.types";

const LEADS_PATH = "/crm/leads";

type LeadActionErrorCode = Extract<LeadActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<LeadActionErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar leads.",
  invalid_input: "Revisa los campos marcados.",
  invalid_owner: "Ese responsable ya no tiene acceso. Elige otro.",
  invalid_trip: "Ese viaje ya no está disponible.",
};

const CREATE_LEAD_FIELDS = Object.keys(createLeadSchema.shape);

function failure(
  code: LeadActionErrorCode,
  values?: Record<string, string>,
  fieldErrors?: Record<string, string[]>,
): LeadActionState {
  return {
    status: "error",
    code,
    message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(fieldErrors && { fieldErrors }),
  };
}

// Echo only this action's known string fields, never files or arbitrary submitted keys.
function formValues(formData: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = formData.get(field);
      return typeof value === "string" ? [[field, value]] : [];
    }),
  );
}

// The schema messages are fixed Spanish texts: they never repeat what was typed.
function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[String(issue.path[0])] ??= []).push(issue.message);
  return result;
}

// Fixed text, no cause and no console output: Drizzle/Neon errors carry the statement and its
// parameters (personal data), so the original error never leaves this module.
function actionFailed(): never {
  throw new Error("lead action failed");
}

async function authorize(): Promise<CurrentUser | LeadActionState> {
  try {
    return await requirePermission("leads.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    return actionFailed();
  }
}

// Order: guard → validation → service with the session user as author → revalidate → redirect.
export async function createLeadAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, CREATE_LEAD_FIELDS);
  const parsed = createLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  let result: Awaited<ReturnType<typeof createLead>>;
  try {
    result = await createLead(parsed.data, actor.id);
  } catch {
    return actionFailed();
  }
  if (result === "invalid_owner") {
    return failure(result, values, { ownerUserId: [ERROR_MESSAGES.invalid_owner] });
  }
  if (result === "invalid_trip") {
    return failure(result, values, { tripId: [ERROR_MESSAGES.invalid_trip] });
  }

  revalidatePath(LEADS_PATH);
  // Next's redirect throws: it stays outside the service's try/catch.
  redirect(LEADS_PATH);
}
