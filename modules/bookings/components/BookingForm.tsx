"use client";

import { startTransition, useActionState, type FormEvent, type HTMLInputTypeAttribute } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createBookingAction, updateBookingAction } from "../actions/bookings.actions";
import type { BookingActionState, BookingInput, CrmBooking } from "../types/bookings.types";

type BookingField = {
  name: Exclude<keyof BookingInput, "tripId">;
  label: string;
  type?: HTMLInputTypeAttribute;
  rows?: number;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};

const EMAIL_HINT = "Debe ser el correo con el que esta persona se registra en la web; se usa para vincular "
  + "su cuenta. Cada acompañante necesita su propia reserva.";
const EMAIL_LOCKED_HINT = "La cuenta ya está vinculada; el correo no se puede cambiar.";

const FIELDS: BookingField[] = [
  { name: "participantName", label: "Nombre del participante", required: true, maxLength: 120 },
  { name: "participantEmail", label: "Correo del participante", type: "email", required: true, maxLength: 254,
    hint: EMAIL_HINT },
  { name: "packageLabel", label: "Paquete", required: true, maxLength: 80,
    hint: "Ejemplo: Paquete corredor o Paquete acompañante." },
  { name: "distance", label: "Distancia", maxLength: 20, hint: "Ejemplo: 42K." },
  { name: "totalUsd", label: "Total acordado", type: "number", required: true, min: 0, max: 1_000_000,
    hint: "USD, sin decimales." },
  { name: "balanceDueOn", label: "Fecha límite del saldo", type: "date" },
  { name: "internalNote", label: "Nota interna", rows: 3, maxLength: 2000, hint: "Solo la ve el equipo." },
];

const INITIAL_STATE: BookingActionState = { status: "idle" };

// "Crear reserva" from a lead's page: initial values and the hidden link to the lead.
type BookingPrefill = {
  leadId: string;
  leadName: string;
  participantName: string;
  participantEmail: string | null;
  tripId: string | null;
};

type BookingFormProps =
  | { booking: CrmBooking; tripOptions?: never; prefill?: never }
  | { booking?: never; tripOptions: { id: string; title: string }[]; prefill?: BookingPrefill };

// Create (with the trip selector, optionally linked to a lead) or edit (the trip and the lead are
// fixed; the email locks once linked).
export function BookingForm({ booking, tripOptions, prefill, priceLocked = false }: BookingFormProps & { priceLocked?: boolean }) {
  const [state, formAction, pending] = useActionState(
    booking ? updateBookingAction : createBookingAction, INITIAL_STATE,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const initial: Partial<Record<BookingField["name"], string | number | null>> = booking ?? {
    participantName: prefill?.participantName,
    participantEmail: prefill?.participantEmail,
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the user's fields after a rejected submission.
    startTransition(() => formAction(data));
  }

  function describedBy(id: string, help: boolean, error: boolean) {
    return [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  }

  function fieldError(id: string, messages?: string[]) {
    return messages && (
      <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{messages[0]}</p>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      {booking && <input type="hidden" name="bookingId" value={booking.id} />}
      {prefill && (
        <>
          <input type="hidden" name="leadId" value={prefill.leadId} />
          <p className="text-sm text-muted-foreground">
            Esta reserva quedará vinculada al lead «{prefill.leadName}». Al confirmarla, el lead pasará a Reservado.
          </p>
        </>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-muted-foreground">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos de la reserva</legend>
        {tripOptions && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="booking-tripId">Viaje *</Label>
            <NativeSelect
              id="booking-tripId" name="tripId" defaultValue={values?.tripId ?? prefill?.tripId ?? ""} className="w-full"
              aria-invalid={errors?.tripId ? true : undefined}
              aria-describedby={describedBy("booking-tripId", false, !!errors?.tripId)}
            >
              <NativeSelectOption value="" disabled>Elige un viaje</NativeSelectOption>
              {tripOptions.map((trip) => (
                <NativeSelectOption key={trip.id} value={trip.id}>{trip.title}</NativeSelectOption>
              ))}
            </NativeSelect>
            {fieldError("booking-tripId", errors?.tripId)}
          </div>
        )}
        {FIELDS.map(({ name, label, hint, rows, type = "text", ...constraints }) => {
          const id = `booking-${name}`;
          const emailLocked = name === "participantEmail" && !!booking?.linked;
          const totalLocked = name === "totalUsd" && priceLocked;
          const locked = emailLocked || totalLocked;
          const help = totalLocked ? "Este total incluye una recompensa aplicada y no se puede editar." : emailLocked ? EMAIL_LOCKED_HINT : hint;
          const props = {
            id, name, defaultValue: values?.[name] ?? String(initial[name] ?? ""), ...constraints,
            "aria-invalid": errors?.[name] ? true : undefined,
            "aria-describedby": describedBy(id, !!help, !!errors?.[name]),
          };
          return (
            <div key={name} className={cn("flex flex-col gap-2", rows && "sm:col-span-2")}>
              <Label htmlFor={id}>{label}{constraints.required ? " *" : ""}</Label>
              {rows ? <Textarea {...props} rows={rows} />
                : <Input {...props} type={type} step={type === "number" ? 1 : undefined} readOnly={locked} />}
              {help && <p id={`${id}-help`} className="text-sm text-muted-foreground">{help}</p>}
              {fieldError(id, errors?.[name])}
            </div>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : booking ? "Guardar cambios" : "Crear reserva"}
        </Button>
        <Link href="/crm/reservas" className={buttonVariants({ variant: "outline" })}>Volver a reservas</Link>
      </div>
    </form>
  );
}
