"use server";

import { redirect } from "next/navigation";
import { bookingFormSchema, bookingStatusChangeSchema, updateBookingSchema } from "../schemas/bookings.schema";
import { createBooking, setBookingStatus, updateBooking } from "../services/bookings.service";
import type { BookingActionState } from "../types/bookings.types";
import { BOOKINGS_PATH, failure, runBookingAction } from "./runBookingAction";

export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const { state, bookingId } = await runBookingAction(formData, bookingFormSchema,
    async (input, values, actorUserId) => {
      const result = await createBooking(input, actorUserId);
      return typeof result === "string"
        ? failure(result, values)
        : { bookingId: result.id, message: "Reserva creada." };
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
    async ({ bookingId, status }) => {
      const result = await setBookingStatus(bookingId, status);
      if (result !== "changed") return failure(result);
      return { bookingId, message: status === "confirmed" ? "Reserva confirmada." : "Reserva cancelada." };
    });
  return state;
}
