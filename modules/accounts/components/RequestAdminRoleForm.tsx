"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { requestAdminRoleAction } from "../actions/roleRequest.actions";
import type { RoleRequestActionState } from "../types/roleRequest.types";

const INITIAL_STATE: RoleRequestActionState = { status: "idle" };

// No fields: the action takes the account from the session and always requests admin.
export function RequestAdminRoleForm() {
  const [state, formAction, pending] = useActionState(requestAdminRoleAction, INITIAL_STATE);

  // Submitting through onSubmit avoids React's automatic reset of <form action={…}>.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (state.status === "success") {
    return (
      <p role="status" className="text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Solicitar rol de administrador"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
