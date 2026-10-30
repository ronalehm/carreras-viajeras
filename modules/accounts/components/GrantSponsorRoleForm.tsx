"use client";

import { startTransition, useActionState, useId, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { grantStaffRoleAction } from "../actions/staff.actions";
import type { StaffActionState } from "../types/staff.types";

const INITIAL_STATE: StaffActionState = { status: "idle" };

type GrantSponsorRoleFormProps = {
  userId: string;
  // Only id and name reach the client; the action checks again that the brand exists.
  sponsors: readonly { id: string; name: string }[];
};

// Granting sponsor needs a brand (accounts-role-requests R20), so it is a form instead of a button.
export function GrantSponsorRoleForm({ userId, sponsors }: GrantSponsorRoleFormProps) {
  const selectId = useId();
  const errorId = `${selectId}-error`;
  const [state, formAction, pending] = useActionState(grantStaffRoleAction, INITIAL_STATE);

  // Submitting through onSubmit avoids React's automatic reset of <form action={…}>.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const sponsorError = state.status === "error" ? state.fieldErrors?.sponsorId?.[0] : undefined;
  const formError = state.status === "error" && !sponsorError ? state.message : null;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value="sponsor" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor={selectId}>Marca</Label>
          <NativeSelect
            id={selectId}
            name="sponsorId"
            size="sm"
            defaultValue=""
            aria-invalid={sponsorError ? true : undefined}
            aria-describedby={sponsorError ? errorId : undefined}
          >
            <NativeSelectOption value="">Elige una marca</NativeSelectOption>
            {sponsors.map((sponsor) => (
              <NativeSelectOption key={sponsor.id} value={sponsor.id}>
                {sponsor.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Asignando…" : "Asignar Patrocinador"}
        </Button>
      </div>
      {sponsorError && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {sponsorError}
        </p>
      )}
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
