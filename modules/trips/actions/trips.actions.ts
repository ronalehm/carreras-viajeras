"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { tripFormSchema, tripStatusChangeSchema, updateTripSchema } from "../schemas/trips.schema";
import { createTrip, setTripStatus, updateTrip } from "../services/trips.service";
import type { TripActionState, TripStatus } from "../types/trips.types";

const TRIPS_PATH = "/crm/viajes";

// Only the known form fields are echoed back to restore the form after an error.
const FORM_FIELDS = Object.keys(tripFormSchema.shape);

type TripActionErrorCode = Extract<TripActionState, { status: "error" }>["code"];

const ERROR_MESSAGES: Record<TripActionErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar viajes.",
  invalid_input: "Revisa los campos marcados.",
  slug_taken: "Revisa los campos marcados.",
  slug_locked: "Revisa los campos marcados.",
  not_found: "El viaje ya no existe. Recarga la página.",
  archived: "Este viaje está archivado y no se puede editar.",
  invalid_transition: "El viaje ya no está en ese estado. Recarga la página.",
};

const SLUG_FIELD_ERRORS = {
  slug_taken: { slug: ["Ese identificador ya está en uso."] },
  slug_locked: { slug: ["Solo se puede cambiar en borrador."] },
};

const STATUS_MESSAGES: Record<TripStatus, string> = {
  published: "Viaje publicado. Ya aparece en la web.",
  draft: "Viaje despublicado. Ya no aparece en la web.",
  archived: "Viaje archivado.",
};

function failure(
  code: TripActionErrorCode,
  extra?: { fieldErrors?: Record<string, string[]>; values?: Record<string, string> },
): TripActionState {
  return { status: "error", code, message: ERROR_MESSAGES[code], ...extra };
}

function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    FORM_FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  );
}

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// requirePermission rejects accounts without a staff role (e.g. landing runners) with ForbiddenError.
async function authorize(): Promise<TripActionState | null> {
  try {
    await requirePermission("trips.manage");
    return null;
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw error;
  }
}

// Fixed text, no cause: the original database message never reaches responses or logs.
async function runService<Result>(call: () => Promise<Result>): Promise<Result> {
  try {
    return await call();
  } catch {
    throw new Error("trip action failed");
  }
}

// Order: guard → validation → service → revalidate (and redirect) on success.
// The schemas drop unknown fields, so status or createdAt sent by the form are ignored.
export async function createTripAction(
  _prev: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const denied = await authorize();
  if (denied) return denied;

  const parsed = tripFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure("invalid_input", { fieldErrors: toFieldErrors(parsed.error), values: formValues(formData) });
  }

  const result = await runService(() => createTrip(parsed.data));
  if (result === "slug_taken") {
    return failure(result, { fieldErrors: SLUG_FIELD_ERRORS[result], values: formValues(formData) });
  }

  revalidatePath(TRIPS_PATH);
  redirect(TRIPS_PATH);
}

export async function updateTripAction(
  _prev: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const denied = await authorize();
  if (denied) return denied;

  const parsed = updateTripSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure("invalid_input", { fieldErrors: toFieldErrors(parsed.error), values: formValues(formData) });
  }

  const { id, ...input } = parsed.data;
  const result = await runService(() => updateTrip(id, input));
  if (result === "slug_taken" || result === "slug_locked") {
    return failure(result, { fieldErrors: SLUG_FIELD_ERRORS[result], values: formValues(formData) });
  }
  if (result !== "updated") return failure(result, { values: formValues(formData) });

  revalidatePath(TRIPS_PATH);
  redirect(TRIPS_PATH);
}

export async function changeTripStatusAction(
  _prev: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const denied = await authorize();
  if (denied) return denied;

  const parsed = tripStatusChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", { fieldErrors: toFieldErrors(parsed.error) });

  const { id, status } = parsed.data;
  const result = await runService(() => setTripStatus(id, status));
  if (result === "invalid_transition") return failure(result);

  revalidatePath(TRIPS_PATH);
  return { status: "success", message: STATUS_MESSAGES[status] };
}
