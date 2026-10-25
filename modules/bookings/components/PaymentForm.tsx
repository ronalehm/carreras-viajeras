"use client";

import { startTransition, useActionState, useRef, type FormEvent, type HTMLInputTypeAttribute } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPaymentAction } from "../actions/payments.actions";
import type { BookingActionState, PaymentInput } from "../types/bookings.types";

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

const INITIAL_STATE: BookingActionState = { status: "idle" };

export function PaymentForm({ bookingId }: { bookingId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: BookingActionState, formData: FormData) => {
      const next = await addPaymentAction(prev, formData);
      // Only clear the fields on success: on error what was typed stays.
      if (next.status === "success") formRef.current?.reset();
      return next;
    },
    INITIAL_STATE,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  // Submitting through onSubmit avoids React's automatic reset of <form action={…}>.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-muted-foreground">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-3">
        <legend className="mb-3 font-medium">Registrar un pago</legend>
        {FIELDS.map(({ name, label, hint, type, ...constraints }) => {
          const id = `payment-${name}`;
          const error = errors?.[name]?.[0];
          return (
            <div key={name} className="flex flex-col gap-2">
              <Label htmlFor={id}>{label} *</Label>
              <Input
                id={id} name={name} type={type} required defaultValue={values?.[name]}
                step={type === "number" ? 1 : undefined} {...constraints}
                aria-invalid={error ? true : undefined}
                aria-describedby={[hint && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
              />
              {hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{hint}</p>}
              {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          );
        })}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar pago"}</Button>
      </div>
    </form>
  );
}
