"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCalendarDate } from "@/lib/dates";
import { setNextActionAction } from "../actions/leads.actions";
import type { LeadActionState } from "../types/leads.types";
import { NextActionBadge } from "./NextActionBadge";

type NextActionFormProps = {
  leadId: string;
  nextActionDate: string | null;
  nextActionNote: string | null;
  // Today's CRM calendar date (YYYY-MM-DD), from the server.
  today: string;
};

const INITIAL_STATE: LeadActionState = { status: "idle" };

// Only for open leads: the page shows a closed-lead notice instead.
export function NextActionForm({ leadId, nextActionDate, nextActionNote, today }: NextActionFormProps) {
  const [state, formAction, pending] = useActionState(setNextActionAction, INITIAL_STATE);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const dateError = fieldErrors?.nextActionDate?.[0];
  const noteError = fieldErrors?.nextActionNote?.[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the typed note after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <div className="flex flex-col gap-4">
      {nextActionDate ? (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{formatCalendarDate(nextActionDate)}</span>
            <NextActionBadge date={nextActionDate} today={today} />
          </p>
          {nextActionNote && <p className="break-words">{nextActionNote}</p>}
        </div>
      ) : (
        <p className="text-muted-foreground">Sin próxima acción.</p>
      )}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="leadId" value={leadId} />
        <fieldset disabled={pending} className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <legend className="sr-only">Próxima acción</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="next-action-date">Fecha</Label>
            <Input
              id="next-action-date"
              name="nextActionDate"
              type="date"
              defaultValue={nextActionDate ?? ""}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "next-action-help next-action-date-error" : "next-action-help"}
            />
            {dateError && (
              <p id="next-action-date-error" role="alert" className="text-sm text-destructive">{dateError}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:w-80">
            <Label htmlFor="next-action-note">Nota</Label>
            <Input
              id="next-action-note"
              name="nextActionNote"
              maxLength={200}
              autoComplete="off"
              defaultValue={nextActionNote ?? ""}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? "next-action-help next-action-note-error" : "next-action-help"}
            />
            {noteError && (
              <p id="next-action-note-error" role="alert" className="text-sm text-destructive">{noteError}</p>
            )}
          </div>
          <Button type="submit" disabled={pending} className="sm:mt-6">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </fieldset>
        <p id="next-action-help" className="text-sm text-muted-foreground">Deja ambos vacíos para quitarla.</p>
      </form>
      {state.status === "error" && !fieldErrors && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && <p role="status" className="text-sm">{state.message}</p>}
    </div>
  );
}
