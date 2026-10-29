"use server";

import { revalidatePath } from "next/cache";
import { bookingFormSchema, bookingStatusChangeSchema, updateBookingSchema } from "../schemas/bookings.schema";
import { createBooking, setBookingStatus, updateBooking } from "../services/bookings.service";
import type { BookingActionState } from "../types/bookings.types";
import { BOOKINGS_PATH, LEADS_PATH } from "../utils/bookingDisplay";
import { bookingPaths, failure, runBookingAction } from "./runBookingAction";

const LEAD_PAGE_ROUTE = "/crm/(protected)/leads/[id]";

export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, bookingFormSchema, async (input, values, actorUserId) => {
    const result = await createBooking(input, actorUserId);
    if (typeof result === "string") return failure(result, values);
    return {
      revalidate: bookingPaths(result.id, input.leadId),
      redirectTo: `${BOOKINGS_PATH}/${result.id}`,
      message: "Reserva creada.",
    };
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
  const state = await runBookingAction(formData, bookingStatusChangeSchema,
    async ({ bookingId, status }, _values, actorUserId) => {
      const result = await setBookingStatus(bookingId, status, actorUserId);
      if (result !== "changed") return failure(result);
      return {
        revalidate: bookingPaths(bookingId),
        message: status === "confirmed" ? "Reserva confirmada." : "Reserva cancelada.",
      };
    });
  // setBookingStatus does not say which lead (if any) is linked: confirming may move it to reserved
  // and either change updates its "Ver reserva", so the list and every lead page refresh. A dynamic
  // pattern must name the page file's route, route group included (Next 16 revalidatePath docs):
  // "/crm/leads/[id]" would match no page and invalidate nothing.
  if (state.status === "success") {
    revalidatePath(LEADS_PATH);
    revalidatePath(LEAD_PAGE_ROUTE, "page");
  }
  return state;
}
