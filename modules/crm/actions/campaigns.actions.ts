"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { campaignFormSchema, campaignIdSchema } from "../schemas/campaigns.schema";
import { closeCampaign, createCampaign } from "../services/campaigns.service";
import type { CampaignActionState } from "../types/campaigns.types";

const CAMPAIGNS_PATH = "/crm/campanas";
// Literal paths: revalidatePath only needs the route file (route group included) for patterns.
const campaignDetailPath = (id: string) => `${CAMPAIGNS_PATH}/${id}`;

type CampaignActionErrorCode = Extract<CampaignActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<CampaignActionErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar campañas.",
  invalid_input: "Revisa los campos marcados.",
  code_taken: "Ese código ya está en uso.",
  invalid_trip: "Elige un viaje del catálogo.",
  not_found: "La campaña ya estaba cerrada o no existe. Recarga la página.",
};

const closeCampaignSchema = z.object({ campaignId: campaignIdSchema });

const CREATE_FIELDS = Object.keys(campaignFormSchema.shape);
const CLOSE_FIELDS = Object.keys(closeCampaignSchema.shape);

function failure(
  code: CampaignActionErrorCode,
  values?: Record<string, string>,
  fieldErrors?: Record<string, string[]>,
): CampaignActionState {
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
// parameters, so the original error never leaves this module.
function actionFailed(): never {
  throw new Error("campaign action failed");
}

async function runService<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    return actionFailed();
  }
}

async function authorize(): Promise<CurrentUser | CampaignActionState> {
  try {
    return await requirePermission("leads.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    return actionFailed();
  }
}

// Order: guard → validation → service with the session user as author → revalidate → redirect.
// status, createdBy, closedAt or any other submitted key are dropped by the schema.
export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, CREATE_FIELDS);
  const parsed = campaignFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const result = await runService(() => createCampaign(parsed.data, actor.id));
  if (result === "code_taken") return failure(result, values, { code: [ERROR_MESSAGES.code_taken] });
  if (result === "invalid_trip") {
    return failure(result, values, { tripId: [ERROR_MESSAGES.invalid_trip] });
  }

  revalidatePath(CAMPAIGNS_PATH);
  // Next's redirect throws: it stays outside the service's try/catch.
  redirect(campaignDetailPath(result.id));
}

// Closing is final (no reopen): new registrations stop being attributed, the QR keeps working.
// The closer is the session user. Its state fits ConfirmActionState.
export async function closeCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const values = formValues(formData, CLOSE_FIELDS);
  const parsed = closeCampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  const { campaignId } = parsed.data;
  const result = await runService(() => closeCampaign(campaignId, actor.id));
  if (result === "not_found") return failure(result, values);

  revalidatePath(CAMPAIGNS_PATH);
  revalidatePath(campaignDetailPath(campaignId));
  return { status: "success", message: "Campaña cerrada." };
}
