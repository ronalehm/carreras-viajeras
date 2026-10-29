"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { sponsorFormSchema, updateSponsorSchema } from "../schemas/sponsors.schema";
import { createSponsor, updateSponsor } from "../services/sponsors.service";
import type { SponsorActionState } from "../types/sponsors.types";

const SPONSORS_PATH = "/crm/admin/patrocinadores";
type ErrorCode = Extract<SponsorActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar patrocinadores.",
  invalid_input: "Revisa los campos marcados.",
  slug_taken: "Ese identificador ya está en uso.",
  not_found: "El patrocinador ya no existe. Recarga la página.",
};

function failure(
  code: ErrorCode,
  values?: Record<string, string>,
  fieldErrors?: Record<string, string[]>,
): SponsorActionState {
  return {
    status: "error", code, message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(fieldErrors && { fieldErrors }),
  };
}

// Echo only this action's known string fields, never files or arbitrary submitted keys.
function formValues(formData: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = formData.get(field);
    return typeof value === "string" ? [[field, value]] : [];
  }));
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    (result[field] ??= []).push(field === "id" ? "El patrocinador no es válido." : issue.message);
  }
  return result;
}

// Order: guard → validation → service with the session user as actor → revalidate on success.
async function runSponsorAction<Schema extends z.ZodObject>(
  formData: FormData,
  schema: Schema,
  mutate: (
    input: z.output<Schema>, values: Record<string, string>, actorUserId: string,
  ) => Promise<SponsorActionState>,
): Promise<SponsorActionState> {
  let actorUserId: string;
  try {
    ({ id: actorUserId } = await requirePermission("sponsors.manage"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }

  const values = formValues(formData, Object.keys(schema.shape));
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, fieldErrors(parsed.error));

  let state: SponsorActionState;
  try {
    state = await mutate(parsed.data, values, actorUserId);
  } catch {
    // No original message or cause: database details must not leave this boundary.
    throw new Error("sponsor action failed");
  }
  if (state.status === "success") revalidatePath(SPONSORS_PATH);
  return state;
}

export async function createSponsorAction(
  _prev: SponsorActionState,
  formData: FormData,
): Promise<SponsorActionState> {
  let createdId: string | undefined;
  const state = await runSponsorAction(formData, sponsorFormSchema, async (input, values, actorUserId) => {
    const result = await createSponsor(input, actorUserId);
    if (result === "slug_taken") return failure(result, values, { slug: [ERROR_MESSAGES[result]] });
    createdId = result.id;
    return { status: "success", message: "Patrocinador creado." };
  });
  // Next's redirect throws; it must stay outside the mutation's catch.
  if (state.status === "success" && createdId) redirect(`${SPONSORS_PATH}/${createdId}`);
  return state;
}

export async function updateSponsorAction(
  _prev: SponsorActionState,
  formData: FormData,
): Promise<SponsorActionState> {
  return runSponsorAction(formData, updateSponsorSchema, async ({ id, ...input }, values) => {
    const result = await updateSponsor(id, input);
    return result === "updated"
      ? { status: "success", message: "Patrocinador actualizado." }
      : failure(result, values);
  });
}
