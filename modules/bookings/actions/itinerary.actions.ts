"use server";

import {
  itemIdSchema,
  itineraryItemFormSchema,
  tripUpdateFormSchema,
  tripUpdateIdSchema,
  updateItineraryItemSchema,
} from "../schemas/bookings.schema";
import {
  createItineraryItem,
  createTripUpdate,
  deleteItineraryItem,
  deleteTripUpdate,
  updateItineraryItem,
} from "../services/itinerary.service";
import type { BookingActionState } from "../types/bookings.types";
import { itineraryOriginPath } from "../utils/bookingDisplay";
import { failure, runBookingAction } from "./runBookingAction";

const MESSAGES = { not_found: "El elemento ya no existe. Recarga la página." };
const tripItineraryPath = (tripId: string) => itineraryOriginPath({ tripId, bookingId: null });

// /mis-carreras is not revalidated: it is dynamic per request.
export async function createItineraryItemAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, itineraryItemFormSchema, async (input, values) => {
    const result = await createItineraryItem(input);
    if (result === "not_found") return failure("not_found", values);
    return { revalidate: [itineraryOriginPath(result)], message: "Hito añadido." };
  }, MESSAGES);
}

export async function updateItineraryItemAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, updateItineraryItemSchema, async (input, values) => {
    const result = await updateItineraryItem(input);
    if (result === "not_found") return failure("not_found", values);
    const origin = itineraryOriginPath(result);
    return { revalidate: [origin, `/crm/itinerario/${input.itemId}`], redirectTo: origin, message: "Hito actualizado." };
  }, MESSAGES);
}

export async function deleteItineraryItemAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, itemIdSchema, async ({ itemId }) => {
    const result = await deleteItineraryItem(itemId);
    if (result === "not_found") return failure("not_found");
    return { revalidate: [itineraryOriginPath(result)], message: "Hito eliminado." };
  }, MESSAGES);
}

export async function createTripUpdateAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, tripUpdateFormSchema, async (input, values, actorUserId) => {
    const result = await createTripUpdate(input, actorUserId);
    if (result === "not_found") return failure("not_found", values);
    return { revalidate: [tripItineraryPath(input.tripId)], message: "Aviso publicado." };
  }, MESSAGES);
}

export async function deleteTripUpdateAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return runBookingAction(formData, tripUpdateIdSchema, async ({ updateId }) => {
    const result = await deleteTripUpdate(updateId);
    if (result === "not_found") return failure("not_found");
    return { revalidate: [tripItineraryPath(result.tripId)], message: "Aviso eliminado." };
  }, MESSAGES);
}
