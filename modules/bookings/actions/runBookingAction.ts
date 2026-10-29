import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { formValues } from "@/lib/formValues";
import type { BookingActionState } from "../types/bookings.types";
import { BOOKINGS_PATH, LEADS_PATH } from "../utils/bookingDisplay";

// Shared by the bookings, payments and itinerary Server Actions. Not a "use server" file: its exports must
// not become callable actions.
type ErrorState = Extract<BookingActionState, { status: "error" }>;
type ErrorCode = ErrorState["code"];
type ErrorMessages = Partial<Record<ErrorCode, string>>;
// A successful mutation names the pages it changed and, optionally, where to go next.
type Mutation = { message: string; revalidate: string[]; redirectTo?: string } | ErrorState;

// The list, the booking's own page and, when linked, its lead's page (which shows it).
export function bookingPaths(bookingId: string, leadId?: string | null): string[] {
  return [BOOKINGS_PATH, `${BOOKINGS_PATH}/${bookingId}`, ...(leadId ? [`${LEADS_PATH}/${leadId}`] : [])];
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar reservas.",
  invalid_input: "Revisa los campos marcados.",
  invalid_trip: "Ese viaje ya no está disponible.",
  duplicate: "Ese correo ya tiene una reserva activa en este viaje.",
  email_locked: "La cuenta ya está vinculada; el correo no se puede cambiar.",
  not_found: "La reserva ya no existe o está cancelada. Recarga la página.",
  invalid_transition: "La reserva ya no está en ese estado. Recarga la página.",
  trip_archived: "El viaje está archivado: la reserva solo se puede cancelar. Recarga la página.",
  invalid_lead: "El lead ya no existe o está archivado. Crea la reserva sin vincular o recarga la página.",
  lead_taken: "Ese lead ya tiene una reserva activa.",
};

// Field that shows each service result under its input.
const RESULT_FIELDS: Partial<Record<ErrorCode, string>> = {
  invalid_trip: "tripId",
  duplicate: "participantEmail",
  email_locked: "participantEmail",
};

export function failure(
  code: ErrorCode,
  values?: Record<string, string>,
  messages: ErrorMessages = {},
): ErrorState {
  const field = RESULT_FIELDS[code];
  const message = messages[code] ?? ERROR_MESSAGES[code];
  return {
    status: "error", code, message,
    ...(values && { values }),
    ...(field && { fieldErrors: { [field]: [message] } }),
  };
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[String(issue.path[0])] ??= []).push(issue.message);
  return result;
}

// requirePermission → zod → service → revalidatePath (and redirect) on success. The actor is always
// the session's user. `messages` replace the default texts, including those of the errors `mutate` returns.
export async function runBookingAction<Input>(
  formData: FormData,
  schema: z.ZodObject & z.ZodType<Input>,
  mutate: (input: Input, values: Record<string, string>, actorUserId: string) => Promise<Mutation>,
  messages: ErrorMessages = {},
): Promise<BookingActionState> {
  let actorUserId: string;
  try {
    ({ id: actorUserId } = await requirePermission("bookings.manage"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized", undefined, messages);
    if (error instanceof ForbiddenError) return failure("forbidden", undefined, messages);
    throw error;
  }

  const values = formValues(formData, Object.keys(schema.shape));
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ...failure("invalid_input", values, messages), fieldErrors: fieldErrors(parsed.error) };
  }

  let result: Mutation;
  try {
    result = await mutate(parsed.data, values, actorUserId);
  } catch {
    // No original message or cause: database details must not leave this boundary.
    throw new Error("booking action failed");
  }
  if ("status" in result) return failure(result.code, result.values, messages);

  for (const path of result.revalidate) revalidatePath(path);
  // Next's redirect throws; it must stay outside the mutation's catch.
  if (result.redirectTo) redirect(result.redirectTo);
  return { status: "success", message: result.message };
}
