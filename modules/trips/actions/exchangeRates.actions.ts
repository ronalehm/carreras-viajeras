"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { exchangeRateFormSchema } from "../schemas/offers.schema";
import { setExchangeRate } from "../services/exchangeRates.service";
import type { ExchangeRateActionState } from "../types/offers.types";

const OFFERS_PATH = "/crm/ofertas";

type ExchangeRateErrorCode = Extract<ExchangeRateActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<ExchangeRateErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar ofertas.",
  invalid_input: "Revisa los campos marcados.",
};

function failure(
  code: ExchangeRateErrorCode,
  values?: Record<string, string>,
  fieldErrors?: Record<string, string[]>,
): ExchangeRateActionState {
  return {
    status: "error",
    code,
    message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(fieldErrors && { fieldErrors }),
  };
}

// The schema messages are fixed Spanish texts: they never repeat what was typed.
function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[String(issue.path[0])] ??= []).push(issue.message);
  return result;
}

// Fixed text, no cause and no console output: database errors never leave this module.
function actionFailed(): never {
  throw new Error("exchange rate action failed");
}

async function authorize(): Promise<CurrentUser | ExchangeRateActionState> {
  try {
    return await requirePermission("offers.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    return actionFailed();
  }
}

// Each save is a new row in force from now on (insert only); the author is the session user.
// Any submitted key other than usdPen (createdBy, createdAt, id…) is dropped by the schema.
export async function setExchangeRateAction(
  _prev: ExchangeRateActionState,
  formData: FormData,
): Promise<ExchangeRateActionState> {
  const actor = await authorize();
  if ("status" in actor) return actor;

  const raw = formData.get("usdPen");
  // Echo only the typed rate, never files or other submitted keys.
  const values: Record<string, string> = typeof raw === "string" ? { usdPen: raw } : {};
  const parsed = exchangeRateFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));

  try {
    await setExchangeRate(parsed.data.usdPen, actor.id);
  } catch {
    return actionFailed();
  }

  revalidatePath(OFFERS_PATH);
  return { status: "success", message: "Tipo de cambio guardado." };
}
