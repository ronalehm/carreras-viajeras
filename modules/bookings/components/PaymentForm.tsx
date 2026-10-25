"use client";

import type { HTMLInputTypeAttribute } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPaymentAction } from "../actions/payments.actions";
import { useBookingActionForm } from "../hooks/useBookingActionForm";
import type { PaymentInput } from "../types/bookings.types";
import { fieldControlProps, FormField, FormStatus } from "./FormField";

type PaymentField = {
  name: Exclude<keyof PaymentInput, "bookingId">;
  label: string;
  type: HTMLInputTypeAttribute;
  hint?: string;
  min?: number;
  max?: number;
  maxLength?: number;
};

const FIELDS: PaymentField[] = [
  { name: "amountUsd", label: "Importe", type: "number", min: 1, max: 1_000_000, hint: "USD, sin decimales." },
  { name: "paidOn", label: "Fecha del pago", type: "date" },
  { name: "concept", label: "Concepto", type: "text", maxLength: 80, hint: "Ejemplo: Reserva o Cuota 2." },
];

export function PaymentForm({ bookingId }: { bookingId: string }) {
  const { formRef, onSubmit, state, pending, errors, values } = useBookingActionForm(addPaymentAction, {
    resetOnSuccess: true,
  });

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <FormStatus state={state} />
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-3">
        <legend className="mb-3 font-medium">Registrar un pago</legend>
        {FIELDS.map(({ name, label, hint, type, ...constraints }) => {
          const id = `payment-${name}`;
          const error = errors?.[name]?.[0];
          return (
            <FormField key={name} id={id} label={label} required hint={hint} error={error}>
              <Input
                {...fieldControlProps(id, { hint, error })} name={name} type={type} required
                defaultValue={values?.[name]} step={type === "number" ? 1 : undefined} {...constraints}
              />
            </FormField>
          );
        })}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar pago"}</Button>
      </div>
    </form>
  );
}
