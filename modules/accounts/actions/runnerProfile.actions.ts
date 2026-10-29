"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireVerifiedEmail, type CurrentUser } from "@/lib/auth/guards";
import { runnerProfileFormSchema } from "../schemas/runnerProfile.schema";
import { saveRunnerProfile } from "../services/runnerProfile.service";
import type { RunnerProfileActionState } from "../types/runnerProfile.types";

const PROFILE_PATH = "/cuenta/perfil";

type ErrorCode = Extract<RunnerProfileActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "Verifica tu correo para guardar tu perfil.",
  invalid_input: "Revisa los campos marcados.",
  save_failed: "No pudimos guardar tu perfil. Inténtalo de nuevo en unos minutos.",
};

function failure(code: ErrorCode, fieldErrors?: Record<string, string[]>): RunnerProfileActionState {
  return { status: "error", code, message: ERROR_MESSAGES[code], ...(fieldErrors && { fieldErrors }) };
}

// First message per field. zod messages are fixed texts: none echoes the submitted value.
function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) result[String(issue.path[0])] ??= [issue.message];
  return result;
}

async function authorizeRunner(): Promise<CurrentUser | RunnerProfileActionState> {
  try {
    return await requireVerifiedEmail();
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }
}

// requireVerifiedEmail → zod → one upsert of the session's own row → revalidatePath.
// user_id and email always come from the session; extra form fields are dropped by the schema.
// The state never carries `values` (Decision 8): the form keeps what was typed client-side.
export async function saveRunnerProfileAction(
  _prev: RunnerProfileActionState,
  formData: FormData,
): Promise<RunnerProfileActionState> {
  const user = await authorizeRunner();
  if ("status" in user) return user;

  // UTC day (Decision 15).
  const today = new Date().toISOString().slice(0, 10);
  const parsed = runnerProfileFormSchema(today).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", toFieldErrors(parsed.error));

  // The box is required on every save but never stored: the service saves the consent version.
  const { consent, ...input } = parsed.data;
  void consent;
  try {
    await saveRunnerProfile(user.id, user.email, input);
  } catch {
    // Fixed text only: a Postgres/Drizzle error carries the row values in its message, cause and
    // params, so the error itself is never logged nor returned.
    console.error("runner-profile: save failed");
    return failure("save_failed");
  }

  revalidatePath(PROFILE_PATH);
  return { status: "success", message: "Perfil guardado." };
}
