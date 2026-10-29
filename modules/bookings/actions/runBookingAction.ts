import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { formValues } from "@/lib/formValues";
import type { BookingActionState } from "../types/bookings.types";

// Internal helpers of the booking actions. Not "use server": every export of such a file would be
// a public endpoint.

export const BOOKINGS_PATH = "/crm/reservas";
type ErrorState = Extract<BookingActionState, { status: "error" }>;
type ErrorCode = ErrorState["code"];
type ErrorMessages = Partial<Record<ErrorCode, string>>;
// A successful mutation names the booking it touched, to revalidate (and, on create, open) it.
type Mutation = { bookingId: string; message: string } | ErrorState;

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

// requirePermission → zod → service → revalidatePath on success. The actor is always the session's user.
// `messages` replace the default texts, including those of the errors `mutate` returns.
export async function runBookingAction<Input>(
  formData: FormData,
  schema: z.ZodObject & z.ZodType<Input>,
  mutate: (input: Input, values: Record<string, string>, actorUserId: string) => Promise<Mutation>,
  messages: ErrorMessages = {},
): Promise<{ state: BookingActionState; bookingId?: string }> {
  let actorUserId: string;
  try {
    ({ id: actorUserId } = await requirePermission("bookings.manage"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return { state: failure("unauthorized", undefined, messages) };
    if (error instanceof ForbiddenError) return { state: failure("forbidden", undefined, messages) };
    throw error;
  }

  const values = formValues(formData, Object.keys(schema.shape));
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { state: { ...failure("invalid_input", values, messages), fieldErrors: fieldErrors(parsed.error) } };
  }

  let result: Mutation;
  try {
    result = await mutate(parsed.data, values, actorUserId);
  } catch {
    // No original message or cause: database details must not leave this boundary.
    throw new Error("booking action failed");
  }
  if (!("bookingId" in result)) return { state: failure(result.code, result.values, messages) };

  revalidatePath(BOOKINGS_PATH);
  revalidatePath(`${BOOKINGS_PATH}/${result.bookingId}`);
  return { state: { status: "success", message: result.message }, bookingId: result.bookingId };
}
