"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTripUpdateAction } from "../actions/itinerary.actions";
import { useBookingActionForm } from "../hooks/useBookingActionForm";
import { fieldControlProps, FormField, FormStatus } from "./FormField";

const HINT = "Lo verán todos los participantes del viaje. No incluyas datos de un participante concreto.";

export function TripUpdateForm({ tripId }: { tripId: string }) {
  const { formRef, onSubmit, state, pending, errors, values } = useBookingActionForm(createTripUpdateAction, {
    resetOnSuccess: true,
  });
  const titleError = errors?.title?.[0];
  const bodyError = errors?.body?.[0];

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-4">
      <input type="hidden" name="tripId" value={tripId} />
      <FormStatus state={state} />
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <legend className="mb-3 font-medium">Publicar aviso</legend>
        <FormField id="trip-update-title" label="Título" required error={titleError}>
          <Input
            {...fieldControlProps("trip-update-title", { error: titleError })} name="title" required
            minLength={3} maxLength={120} defaultValue={values?.title}
          />
        </FormField>
        <FormField id="trip-update-body" label="Mensaje" required hint={HINT} error={bodyError}>
          <Textarea
            {...fieldControlProps("trip-update-body", { hint: HINT, error: bodyError })} name="body" required
            rows={4} maxLength={2000} defaultValue={values?.body}
          />
        </FormField>
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Publicando…" : "Publicar aviso"}</Button>
      </div>
    </form>
  );
}
