"use server";

import { paymentFormSchema, paymentVoidSchema } from "../schemas/bookings.schema";
import { addPayment, voidPayment } from "../services/payments.service";
import type { BookingActionState } from "../types/bookings.types";
import { bookingPaths, failure, runBookingAction } from "./runBookingAction";

const NOT_FOUND_MESSAGE = "La reserva o el pago ya no admiten cambios. Recarga la página.";

export async function addPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, paymentFormSchema, async (input, values, actorUserId) => {
    const result = await addPayment(input, actorUserId);
    return result === "added"
      ? { revalidate: bookingPaths(input.bookingId), message: "Pago registrado." }
      : failure("not_found", values, NOT_FOUND_MESSAGE);
  });
}

export async function voidPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, paymentVoidSchema, async ({ paymentId }, _values, actorUserId) => {
    const result = await voidPayment(paymentId, actorUserId);
    return result === "not_found"
      ? failure("not_found", undefined, NOT_FOUND_MESSAGE)
      : { revalidate: bookingPaths(result.bookingId), message: "Pago anulado." };
  });
}
