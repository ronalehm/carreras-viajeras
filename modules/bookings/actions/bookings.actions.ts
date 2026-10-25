"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { bookingFormSchema, bookingStatusChangeSchema, updateBookingSchema } from "../schemas/bookings.schema";
import { createBooking, setBookingStatus, updateBooking } from "../services/bookings.service";
import type { BookingActionState } from "../types/bookings.types";

const BOOKINGS_PATH = "/crm/reservas";
const LEADS_PATH = "/crm/leads";
type ErrorState = Extract<BookingActionState, { status: "error" }>;
type ErrorCode = ErrorState["code"];
// A successful mutation names the booking it touched, to revalidate (and, on create, open) it, and
// the lead it is linked to, whose page shows it.
type Mutation = { bookingId: string; message: string; leadId?: string | null } | ErrorState;

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar reservas.",
  invalid_input: "Revisa los campos marcados.",
  invalid_trip: "Ese viaje ya no está disponible.",
  duplicate: "Ese correo ya tiene una reserva activa en este viaje.",
  email_locked: "La cuenta ya está vinculada; el correo no se puede cambiar.",
  not_found: "La reserva ya no existe o está cancelada. Recarga la página.",
  invalid_transition: "La reserva ya no está en ese estado. Recarga la página.",
  invalid_lead: "El lead ya no existe o está archivado. Crea la reserva sin vincular o recarga la página.",
  lead_taken: "Ese lead ya tiene una reserva activa.",
};

// Field that shows each service result under its input.
const RESULT_FIELDS: Partial<Record<ErrorCode, string>> = {
  invalid_trip: "tripId",
  duplicate: "participantEmail",
  email_locked: "participantEmail",
};

function failure(code: ErrorCode, values?: Record<string, string>): ErrorState {
  const field = RESULT_FIELDS[code];
  return {
    status: "error", code, message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(field && { fieldErrors: { [field]: [ERROR_MESSAGES[code]] } }),
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
  for (const issue of error.issues) (result[String(issue.path[0])] ??= []).push(issue.message);
  return result;
}

// requirePermission → zod → service → revalidatePath on success. The actor is always the session's user.
async function runBookingAction<Input>(
  formData: FormData,
  schema: z.ZodObject & z.ZodType<Input>,
  mutate: (input: Input, values: Record<string, string>, actorUserId: string) => Promise<Mutation>,
): Promise<{ state: BookingActionState; bookingId?: string }> {
  let actorUserId: string;
  try {
    ({ id: actorUserId } = await requirePermission("bookings.manage"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return { state: failure("unauthorized") };
    if (error instanceof ForbiddenError) return { state: failure("forbidden") };
    throw error;
  }

  const values = formValues(formData, Object.keys(schema.shape));
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { state: { ...failure("invalid_input", values), fieldErrors: fieldErrors(parsed.error) } };
  }

  let result: Mutation;
  try {
    result = await mutate(parsed.data, values, actorUserId);
  } catch {
    // No original message or cause: database details must not leave this boundary.
    throw new Error("booking action failed");
  }
  if (!("bookingId" in result)) return { state: result };

  revalidatePath(BOOKINGS_PATH);
  revalidatePath(`${BOOKINGS_PATH}/${result.bookingId}`);
  if (result.leadId) revalidatePath(`${LEADS_PATH}/${result.leadId}`);
  return { state: { status: "success", message: result.message }, bookingId: result.bookingId };
}

export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const { state, bookingId } = await runBookingAction(formData, bookingFormSchema,
    async (input, values, actorUserId) => {
      const result = await createBooking(input, actorUserId);
      if (typeof result === "string") return failure(result, values);
      return { bookingId: result.id, message: "Reserva creada.", leadId: input.leadId };
    });
  // Next's redirect throws; it must stay outside the mutation's catch.
  if (bookingId) redirect(`${BOOKINGS_PATH}/${bookingId}`);
  return state;
}

export async function updateBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const { state } = await runBookingAction(formData, updateBookingSchema, async (input, values) => {
    const result = await updateBooking(input);
    if (result === "updated") return { bookingId: input.bookingId, message: "Reserva actualizada." };
    return failure(result === "cancelled" ? "not_found" : result, values);
  });
  return state;
}

export async function changeBookingStatusAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const { state } = await runBookingAction(formData, bookingStatusChangeSchema,
    async ({ bookingId, status }, _values, actorUserId) => {
      const result = await setBookingStatus(bookingId, status, actorUserId);
      if (result !== "changed") return failure(result);
      return { bookingId, message: status === "confirmed" ? "Reserva confirmada." : "Reserva cancelada." };
    });
  // setBookingStatus does not say which lead (if any) is linked: confirming may move it to reserved
  // and either change updates its "Ver reserva", so the list and every lead page refresh.
  if (state.status === "success") {
    revalidatePath(LEADS_PATH);
    revalidatePath(`${LEADS_PATH}/[id]`, "page");
  }
  return state;
}
