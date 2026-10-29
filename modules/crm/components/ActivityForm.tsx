"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addLeadActivityAction } from "../actions/leads.actions";
import { leadActivityFormSchema } from "../schemas/leads.schema";
import type { LeadActionState } from "../types/leads.types";
import { LEAD_ACTIVITY_LABELS } from "../utils/leadDisplay";

type ActivityFormProps = {
  leadId: string;
};

const INITIAL_STATE: LeadActionState = { status: "idle" };

export function ActivityForm({ leadId }: ActivityFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: LeadActionState, formData: FormData) => {
      const next = await addLeadActivityAction(prev, formData);
      // Only clear the form on success: on error the chosen type and the typed text stay.
      if (next.status === "success") formRef.current?.reset();
      return next;
    },
    INITIAL_STATE,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const typeError = fieldErrors?.type?.[0];
  const bodyError = fieldErrors?.body?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the typed text after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="leadId" value={leadId} />
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <legend className="sr-only">Registrar seguimiento</legend>
        <div className="flex flex-col gap-2 sm:w-60">
          <Label htmlFor="activity-type">Tipo</Label>
          <NativeSelect
            id="activity-type"
            name="type"
            defaultValue="note"
            aria-invalid={typeError ? true : undefined}
            aria-describedby={typeError ? "activity-type-error" : undefined}
          >
            {leadActivityFormSchema.shape.type.options.map((type) => (
              <NativeSelectOption key={type} value={type}>{LEAD_ACTIVITY_LABELS[type]}</NativeSelectOption>
            ))}
          </NativeSelect>
          {typeError && (
            <p id="activity-type-error" role="alert" className="text-sm text-destructive">{typeError}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="activity-body">Texto</Label>
          <Textarea
            id="activity-body"
            name="body"
            rows={3}
            maxLength={2000}
            aria-invalid={bodyError ? true : undefined}
            aria-describedby={bodyError ? "activity-body-error" : undefined}
          />
          {bodyError && (
            <p id="activity-body-error" role="alert" className="text-sm text-destructive">{bodyError}</p>
          )}
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Registrando…" : "Registrar"}
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
