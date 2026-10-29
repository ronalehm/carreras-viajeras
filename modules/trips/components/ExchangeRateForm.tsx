"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setExchangeRateAction } from "../actions/exchangeRates.actions";
import type { ExchangeRateActionState } from "../types/offers.types";

const INITIAL_STATE: ExchangeRateActionState = { status: "idle" };

const FIELD_ID = "exchange-rate-usdPen";
const HINT_ID = `${FIELD_ID}-help`;
const ERROR_ID = `${FIELD_ID}-error`;

// Sets a new USD→PEN rate (offers.manage only; the page decides whether to render it).
// Each save is a new row in force from that moment; the history lives in ExchangeRateTable.
export function ExchangeRateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ExchangeRateActionState, formData: FormData) => {
      const next = await setExchangeRateAction(prev, formData);
      // Only clear the field on success: after an error the typed rate stays for correction.
      if (next.status === "success") formRef.current?.reset();
      return next;
    },
    INITIAL_STATE,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const rateError = fieldErrors?.usdPen?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the typed rate after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <legend className="sr-only">Nuevo tipo de cambio</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_ID}>Soles por 1 USD</Label>
          <Input
            id={FIELD_ID}
            name="usdPen"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={7}
            placeholder="3.7500"
            aria-invalid={rateError ? true : undefined}
            aria-describedby={[HINT_ID, rateError && ERROR_ID].filter(Boolean).join(" ")}
          />
          <p id={HINT_ID} className="text-sm text-muted-foreground">
            Con punto decimal y hasta 4 decimales. Rige desde que lo guardas y no se puede editar.
          </p>
          {rateError && (
            <p id={ERROR_ID} role="alert" className="text-sm text-destructive">{rateError}</p>
          )}
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar tipo de cambio"}
          </Button>
        </div>
      </fieldset>
      {state.status === "error" && !fieldErrors && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && <p role="status" className="text-sm">{state.message}</p>}
    </form>
  );
}
