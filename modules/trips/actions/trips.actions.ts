"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { formValues } from "@/lib/formValues";
import { tripFormSchema, tripStatusChangeSchema, updateTripSchema } from "../schemas/trips.schema";
import { createTrip, setTripStatus, updateTrip } from "../services/trips.service";
import type { TripActionState, TripStatus } from "../types/trips.types";

const TRIPS_PATH = "/crm/viajes";
type ErrorCode = Extract<TripActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar viajes.",
  invalid_input: "Revisa los campos marcados.",
  slug_taken: "Ese identificador ya está en uso.",
  slug_locked: "Solo se puede cambiar en borrador.",
  not_found: "El viaje ya no existe. Recarga la página.",
  archived: "Este viaje está archivado y no se puede editar.",
  invalid_transition: "El viaje ya no está en ese estado. Recarga la página.",
};

const STATUS_MESSAGES: Record<TripStatus, string> = {
  published: "Viaje publicado. Ya aparece en la web.",
  draft: "Viaje despublicado. Ya no aparece en la web.",
  archived: "Viaje archivado.",
};

function failure(
  code: ErrorCode,
  values?: Record<string, string>,
  fieldErrors?: Record<string, string[]>,
): TripActionState {
  return {
    status: "error", code, message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(fieldErrors && { fieldErrors }),
  };
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    const message = field === "id" ? "El viaje no es válido."
      : field === "status" ? "El estado no es válido." : issue.message;
    (result[field] ??= []).push(message);
  }
  return result;
}

async function runTripAction<Input>(
  formData: FormData,
  schema: z.ZodType<Input>,
  fields: readonly string[],
  mutate: (input: Input, values: Record<string, string>) => Promise<TripActionState>,
): Promise<TripActionState> {
  try {
    await requirePermission("trips.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }

  const values = formValues(formData, fields);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, fieldErrors(parsed.error));

  let state: TripActionState;
  try {
    state = await mutate(parsed.data, values);
  } catch {
    // No original message or cause: database details must not leave this boundary.
    throw new Error("trip action failed");
  }
  if (state.status === "success") revalidatePath(TRIPS_PATH);
  return state;
}

export async function createTripAction(
  _prev: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const state = await runTripAction(formData, tripFormSchema, Object.keys(tripFormSchema.shape),
    async (input, values) => {
      const result = await createTrip(input);
      return result === "slug_taken"
        ? failure(result, values, { slug: [ERROR_MESSAGES[result]] })
        : { status: "success", message: "Viaje creado." };
    });
  // Next's redirect throws; it must stay outside the mutation's catch.
  if (state.status === "success") redirect(TRIPS_PATH);
  return state;
}

export async function updateTripAction(
  _prev: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const state = await runTripAction(formData, updateTripSchema, Object.keys(updateTripSchema.shape),
    async ({ id, ...input }, values) => {
      const result = await updateTrip(id, input);
      if (result === "updated") return { status: "success", message: "Viaje actualizado." };
      return failure(result, values,
        result === "slug_taken" || result === "slug_locked"
          ? { slug: [ERROR_MESSAGES[result]] } : undefined);
    });
  if (state.status === "success") redirect(TRIPS_PATH);
  return state;
}

export async function changeTripStatusAction(
  _prev: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  return runTripAction(formData, tripStatusChangeSchema, Object.keys(tripStatusChangeSchema.shape),
    async ({ id, status }) => {
      const result = await setTripStatus(id, status);
      return result === "changed"
        ? { status: "success", message: STATUS_MESSAGES[status] }
        : failure(result);
    });
}
