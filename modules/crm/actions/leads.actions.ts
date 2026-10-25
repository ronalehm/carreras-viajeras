"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import {
  createLeadSchema,
  leadActivityFormSchema,
  leadIdSchema,
  leadOwnerChangeSchema,
  leadStageChangeSchema,
  nextActionSchema,
  updateLeadSchema,
} from "../schemas/leads.schema";
import { addLeadActivity } from "../services/activities.service";
import {
  archiveLead,
  changeLeadOwner,
  changeLeadStage,
  createLead,
  setNextAction,
  updateLead,
} from "../services/leads.service";
import type { LeadActionState } from "../types/leads.types";
import { LEAD_LIST_PATH } from "../utils/leadListQuery";

const leadDetailPath = (id: string) => `${LEAD_LIST_PATH}/${id}`;

type LeadActionErrorCode = Extract<LeadActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<LeadActionErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar leads.",
  invalid_input: "Revisa los campos marcados.",
  invalid_owner: "Ese responsable ya no tiene acceso. Elige otro.",
  invalid_trip: "Ese viaje ya no está disponible.",
  not_found: "El lead ya no existe o está archivado. Recarga la página.",
  no_change: "No hay cambios.",
  closed: "El lead está cerrado o archivado.",
};

const CREATE_LEAD_FIELDS = Object.keys(createLeadSchema.shape);
const UPDATE_LEAD_FIELDS = Object.keys(updateLeadSchema.shape);
const STAGE_CHANGE_FIELDS = Object.keys(leadStageChangeSchema.in.shape);
const OWNER_CHANGE_FIELDS = Object.keys(leadOwnerChangeSchema.shape);
const ACTIVITY_FIELDS = Object.keys(leadActivityFormSchema.shape);
const NEXT_ACTION_FIELDS = Object.keys(nextActionSchema.shape);
const LEAD_ID_FIELDS = Object.keys(leadIdSchema.shape);

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

  const result = await runService(() => createLead(parsed.data, actor.id));
  if (result === "invalid_owner") {
    return failure(result, values, { ownerUserId: [ERROR_MESSAGES.invalid_owner] });
  }
  if (result === "invalid_trip") {
    return failure(result, values, { tripId: [ERROR_MESSAGES.invalid_trip] });
  }

  revalidatePath(LEAD_LIST_PATH);
  // Next's redirect throws: it stays outside the service's try/catch.
  redirect(leadDetailPath(result.id));
}

// Calls the service and replaces any failure with the fixed error (see actionFailed).
async function runService<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    return actionFailed();
  }
}

// After a change the list and the lead's detail page show the new data.
function revalidateLead(leadId: string) {
  revalidatePath(LEAD_LIST_PATH);
  revalidatePath(leadDetailPath(leadId));
}

// Contact and origin data: the session user is the author of the 'channel_changed' activity.
// Source, stage, owner, author, the UTM fields, contactOptOutAt or any other submitted key are
// dropped by the schema.
export async function updateLeadAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, UPDATE_LEAD_FIELDS);
  const parsed = updateLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => updateLead(parsed.data, actor.id));
  if (result === "not_found") return failure(result, values);
  if (result === "invalid_trip") {
    return failure(result, values, { tripId: [ERROR_MESSAGES.invalid_trip] });
  }

  revalidateLead(parsed.data.leadId);
  redirect(leadDetailPath(parsed.data.leadId));
}

export async function changeLeadStageAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, STAGE_CHANGE_FIELDS);
  const parsed = leadStageChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => changeLeadStage(parsed.data, actor.id));
  if (result !== "changed") return failure(result, values);

  revalidateLead(parsed.data.leadId);
  return { status: "success", message: "Etapa actualizada." };
}

export async function changeLeadOwnerAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, OWNER_CHANGE_FIELDS);
  const parsed = leadOwnerChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => changeLeadOwner(parsed.data, actor.id));
  if (result === "invalid_owner") {
    return failure(result, values, { ownerUserId: [ERROR_MESSAGES.invalid_owner] });
  }
  if (result !== "changed") return failure(result, values);

  revalidateLead(parsed.data.leadId);
  return { status: "success", message: "Responsable actualizado." };
}

// Manual follow-up (note, call or message). The schema rejects system types; the author is the
// session user. Only the lead's detail page shows the history.
export async function addLeadActivityAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, ACTIVITY_FIELDS);
  const parsed = leadActivityFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => addLeadActivity(parsed.data, actor.id));
  if (result === "not_found") return failure(result, values);

  revalidatePath(leadDetailPath(parsed.data.leadId));
  return { status: "success", message: "Seguimiento registrado." };
}

// Date and note of the next action; both blank clear it. The list shows it too.
export async function setNextActionAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, NEXT_ACTION_FIELDS);
  const parsed = nextActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => setNextAction(parsed.data));
  if (result !== "saved") return failure(result, values);

  revalidateLead(parsed.data.leadId);
  return {
    status: "success",
    message: parsed.data.nextActionDate ? "Próxima acción guardada." : "Próxima acción quitada.",
  };
}

// Archiving is final (no restore in the MVP): the list hides the lead and its detail page becomes
// read-only. The archiver is the session user. Its state fits ConfirmActionState.
export async function archiveLeadAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, LEAD_ID_FIELDS);
  const parsed = leadIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => archiveLead(parsed.data.leadId, actor.id));
  if (result === "not_found") return failure(result, values);

  revalidateLead(parsed.data.leadId);
  return { status: "success", message: "Lead archivado." };
}
