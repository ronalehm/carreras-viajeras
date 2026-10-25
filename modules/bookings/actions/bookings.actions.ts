"use server";

import { bookingFormSchema, bookingStatusChangeSchema, updateBookingSchema } from "../schemas/bookings.schema";
import { createBooking, setBookingStatus, updateBooking } from "../services/bookings.service";
import type { BookingActionState } from "../types/bookings.types";
import { BOOKINGS_PATH, bookingPaths, failure, runBookingAction } from "./runBookingAction";

export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, bookingFormSchema, async (input, values, actorUserId) => {
    const result = await createBooking(input, actorUserId);
    if (typeof result === "string") return failure(result, values);
    return { revalidate: bookingPaths(result.id), redirectTo: `${BOOKINGS_PATH}/${result.id}`, message: "Reserva creada." };
  });
}

export async function updateBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, updateBookingSchema, async (input, values) => {
    const result = await updateBooking(input);
    if (result === "updated") return { revalidate: bookingPaths(input.bookingId), message: "Reserva actualizada." };
    return failure(result === "cancelled" ? "not_found" : result, values);
  });
}

export async function changeBookingStatusAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, bookingStatusChangeSchema, async ({ bookingId, status }) => {
    const result = await setBookingStatus(bookingId, status);
    if (result !== "changed") return failure(result);
    return {
      revalidate: bookingPaths(bookingId),
      message: status === "confirmed" ? "Reserva confirmada." : "Reserva cancelada.",
    };
  });
}
