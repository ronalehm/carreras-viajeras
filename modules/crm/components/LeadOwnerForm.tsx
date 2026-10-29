"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { changeLeadOwnerAction } from "../actions/leads.actions";
import type { LeadActionState, LeadOwnerOption } from "../types/leads.types";

type LeadOwnerFormProps = {
  leadId: string;
  // null: unassigned lead (web form).
  ownerUserId: string | null;
  ownerOptions: LeadOwnerOption[];
};

const INITIAL_STATE: LeadActionState = { status: "idle" };

export function LeadOwnerForm({ leadId, ownerUserId, ownerOptions }: LeadOwnerFormProps) {
  const [state, formAction, pending] = useActionState(changeLeadOwnerAction, INITIAL_STATE);
  const ownerError = state.status === "error" ? state.fieldErrors?.ownerUserId?.[0] : undefined;
  // Without owner (or with an owner that lost access, absent from the options) nothing is
  // preselected: the first option is the empty "Elige un responsable".
  const hasCurrentOwner = ownerOptions.some((option) => option.userId === ownerUserId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the chosen owner after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="leadId" value={leadId} />
      <fieldset disabled={pending} className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <legend className="sr-only">Reasignar responsable</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-owner">Responsable</Label>
          <NativeSelect
            id="lead-owner"
            name="ownerUserId"
            defaultValue={hasCurrentOwner ? (ownerUserId ?? "") : ""}
            aria-invalid={ownerError ? true : undefined}
            aria-describedby={ownerError ? "lead-owner-error" : undefined}
          >
            {!hasCurrentOwner && <NativeSelectOption value="">Elige un responsable</NativeSelectOption>}
            {ownerOptions.map((option) => (
              <NativeSelectOption key={option.userId} value={option.userId}>{option.email}</NativeSelectOption>
            ))}
          </NativeSelect>
          {ownerError && (
            <p id="lead-owner-error" role="alert" className="text-sm text-destructive">{ownerError}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending ? "Reasignando…" : "Reasignar"}
        </Button>
      </fieldset>
      {state.status === "error" && !ownerError && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && <p role="status" className="text-sm">{state.message}</p>}
    </form>
  );
}
