"use server";

import { paymentFormSchema, paymentVoidSchema } from "../schemas/bookings.schema";
import { addPayment, voidPayment } from "../services/payments.service";
import type { BookingActionState } from "../types/bookings.types";
import { reconcileBookingAfterCommit } from "./rewardReconciliation";
import { bookingPaths, failure, runBookingAction } from "./runBookingAction";

const MESSAGES = { not_found: "La reserva o el pago ya no admiten cambios. Recarga la página." };

export async function addPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, paymentFormSchema, async (input, values, actorUserId) => {
    const result = await addPayment(input, actorUserId);
    if (result !== "added") return failure(result, values);
    await reconcileBookingAfterCommit(input.bookingId);
    return { revalidate: bookingPaths(input.bookingId), message: "Pago registrado." };
  }, MESSAGES);
}

export async function voidPaymentAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, paymentVoidSchema, async ({ paymentId }, _values, actorUserId) => {
    const result = await voidPayment(paymentId, actorUserId);
    if (result === "not_found") return failure("not_found");
    await reconcileBookingAfterCommit(result.bookingId);
    return { revalidate: bookingPaths(result.bookingId), message: "Pago anulado." };
  }, MESSAGES);
}
