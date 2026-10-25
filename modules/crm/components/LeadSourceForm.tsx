"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { changeLeadSourceAction } from "../actions/leads.actions";
import { manualLeadSourceSchema } from "../schemas/leads.schema";
import type { LeadActionState, LeadSource } from "../types/leads.types";
import { LEAD_SOURCE_LABELS, SOURCE_DETAIL_HINT } from "../utils/leadDisplay";

type LeadSourceFormProps = {
  leadId: string;
  source: LeadSource;
  sourceDetail: string | null;
};

const INITIAL_STATE: LeadActionState = { status: "idle" };

// Only for non-archived leads. A web_form lead keeps its source (sent as a fixed hidden value)
// and only its detail can be edited; a manual lead chooses among the manual sources.
export function LeadSourceForm({ leadId, source, sourceDetail }: LeadSourceFormProps) {
  const [state, formAction, pending] = useActionState(changeLeadSourceAction, INITIAL_STATE);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const isWebForm = source === "web_form";
  // A web_form lead has no source field to show the error under: the general message covers it.
  const sourceError = isWebForm ? undefined : fieldErrors?.source?.[0];
  const detailError = fieldErrors?.sourceDetail?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the chosen source and typed detail after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="leadId" value={leadId} />
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <legend className="sr-only">Cambiar origen</legend>
        {isWebForm ? (
          <div className="flex flex-col gap-2">
            <input type="hidden" name="source" value="web_form" />
            <span className="text-sm font-medium">Origen</span>
            <p>{LEAD_SOURCE_LABELS.web_form}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-source">Origen</Label>
            <NativeSelect
              id="lead-source"
              name="source"
              defaultValue={source}
              aria-invalid={sourceError ? true : undefined}
              aria-describedby={sourceError ? "lead-source-error" : undefined}
            >
              {manualLeadSourceSchema.options.map((option) => (
                <NativeSelectOption key={option} value={option}>{LEAD_SOURCE_LABELS[option]}</NativeSelectOption>
              ))}
            </NativeSelect>
            {sourceError && (
              <p id="lead-source-error" role="alert" className="text-sm text-destructive">{sourceError}</p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-source-detail">Detalle del origen</Label>
          <Input
            id="lead-source-detail"
            name="sourceDetail"
            maxLength={120}
            autoComplete="off"
            defaultValue={sourceDetail ?? ""}
            aria-invalid={detailError ? true : undefined}
            aria-describedby={detailError ? "lead-source-help lead-source-detail-error" : "lead-source-help"}
          />
          <p id="lead-source-help" className="text-sm text-muted-foreground">
            {SOURCE_DETAIL_HINT}
          </p>
          {detailError && (
            <p id="lead-source-detail-error" role="alert" className="text-sm text-destructive">{detailError}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Guardando…" : "Guardar origen"}
        </Button>
      </fieldset>
      {state.status === "error" && !sourceError && !detailError && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && <p role="status" className="text-sm">{state.message}</p>}
    </form>
  );
}
