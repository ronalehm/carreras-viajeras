"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { changeLeadStageAction } from "../actions/leads.actions";
import { leadStageSchema } from "../schemas/leads.schema";
import type { LeadActionState, LeadStage } from "../types/leads.types";
import { LEAD_STAGE_LABELS } from "../utils/leadDisplay";

type LeadStageFormProps = {
  leadId: string;
  stage: LeadStage;
};

const INITIAL_STATE: LeadActionState = { status: "idle" };

export function LeadStageForm({ leadId, stage }: LeadStageFormProps) {
  const [selected, setSelected] = useState<LeadStage>(stage);
  const [state, formAction, pending] = useActionState(changeLeadStageAction, INITIAL_STATE);
  const reasonError = state.status === "error" ? state.fieldErrors?.lostReason?.[0] : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the typed reason after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="leadId" value={leadId} />
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <legend className="sr-only">Cambiar etapa</legend>
        <div className="flex min-w-0 max-w-full flex-col gap-2">
          <Label htmlFor="lead-stage">Etapa</Label>
          <NativeSelect
            id="lead-stage"
            className="max-w-full"
            name="stage"
            value={selected}
            onChange={(event) => setSelected(event.target.value as LeadStage)}
          >
            {leadStageSchema.options.map((option) => (
              <NativeSelectOption key={option} value={option}>{LEAD_STAGE_LABELS[option]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {/* The reason only applies to "lost": hidden (and not sent) for any other stage. */}
        {selected === "lost" && (
          <div className="flex min-w-0 max-w-full flex-col gap-2 sm:w-80">
            <Label htmlFor="lead-lostReason">Motivo de la pérdida *</Label>
            <Input
              id="lead-lostReason"
              name="lostReason"
              maxLength={200}
              autoComplete="off"
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? "lead-lostReason-error" : undefined}
            />
            {reasonError && (
              <p id="lead-lostReason-error" role="alert" className="text-sm text-destructive">{reasonError}</p>
            )}
          </div>
        )}
        <Button type="submit" disabled={pending} className="self-start sm:self-end">
          {pending ? "Cambiando…" : "Cambiar etapa"}
        </Button>
      </fieldset>
      {state.status === "error" && !reasonError && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && <p role="status" className="text-sm">{state.message}</p>}
    </form>
  );
}
