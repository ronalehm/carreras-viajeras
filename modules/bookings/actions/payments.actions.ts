"use server";

import { paymentFormSchema, paymentVoidSchema } from "../schemas/bookings.schema";
import { addPayment, voidPayment } from "../services/payments.service";
import type { BookingActionState } from "../types/bookings.types";
import { bookingPaths, failure, runBookingAction } from "./runBookingAction";
import { reconcileBookingAfterCommit } from "./rewardReconciliation";

const NOT_FOUND_MESSAGE = "La reserva o el pago ya no admiten cambios. Recarga la página.";

export async function addPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, paymentFormSchema, async (input, values, actorUserId) => {
    const result = await addPayment(input, actorUserId);
    if (result !== "added") return failure(result, values, result === "not_found" ? NOT_FOUND_MESSAGE : undefined);
    await reconcileBookingAfterCommit(input.bookingId);
    return { revalidate: bookingPaths(input.bookingId), message: "Pago registrado." };
  });
}

export async function voidPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, paymentVoidSchema, async ({ paymentId }, _values, actorUserId) => {
    const result = await voidPayment(paymentId, actorUserId);
    if (result === "not_found") return failure("not_found", undefined, NOT_FOUND_MESSAGE);
    await reconcileBookingAfterCommit(result.bookingId);
    return { revalidate: bookingPaths(result.bookingId), message: "Pago anulado." };
  });
}
