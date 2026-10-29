"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { StaffRole } from "@/lib/auth/permissions";
import { inviteStaffAction } from "../actions/staff.actions";
import type { StaffActionState } from "../types/staff.types";
import { STAFF_ROLE_LABELS } from "../utils/staffDisplay";

const INITIAL_STATE: StaffActionState = { status: "idle" };

type CopyStatus = "idle" | "copied" | "failed";

type InviteStaffFormProps = {
  // Roles the actor may invite, computed on the server; the action still validates each one.
  roles: readonly StaffRole[];
};

export function InviteStaffForm({ roles }: InviteStaffFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [state, formAction, pending] = useActionState(
    async (prev: StaffActionState, formData: FormData) => {
      const next = await inviteStaffAction(prev, formData);
      // Only clear the fields on success: on error the typed email and chosen role stay.
      if (next.status === "success") formRef.current?.reset();
      return next;
    },
    INITIAL_STATE,
  );

  // Submitting through onSubmit avoids React's automatic reset of <form action={…}>.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setCopyStatus("idle");
    startTransition(() => formAction(formData));
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const formError = state.status === "error" && !fieldErrors ? state.message : null;
  const acceptUrl = state.status === "success" ? state.acceptUrl : undefined;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Invitar a una persona</h2>

      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 sm:flex-row sm:items-start"
      >
        <div className="flex flex-col gap-2 sm:w-72">
          <Label htmlFor="invite-staff-email">Correo</Label>
          <Input
            id="invite-staff-email"
            name="email"
            type="email"
            autoComplete="off"
            aria-invalid={fieldErrors?.email ? true : undefined}
            aria-describedby={fieldErrors?.email ? "invite-staff-email-error" : undefined}
          />
          {fieldErrors?.email && (
            <p id="invite-staff-email-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.email[0]}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-staff-role">Rol</Label>
          <NativeSelect
            id="invite-staff-role"
            name="role"
            defaultValue={roles[0]}
            aria-invalid={fieldErrors?.role ? true : undefined}
            aria-describedby={fieldErrors?.role ? "invite-staff-role-error" : undefined}
          >
            {roles.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {STAFF_ROLE_LABELS[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldErrors?.role && (
            <p id="invite-staff-role-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.role[0]}
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending ? "Invitando…" : "Invitar"}
        </Button>
      </form>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm">
            {state.message}
          </p>
          {acceptUrl && (
            <>
              <Label htmlFor="invite-staff-accept-url">Enlace para compartir</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="invite-staff-accept-url"
                  readOnly
                  value={acceptUrl}
                  className="sm:w-96"
                />
                <Button type="button" variant="outline" onClick={() => copyLink(acceptUrl)}>
                  Copiar enlace
                </Button>
              </div>
              {copyStatus === "copied" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Enlace copiado.
                </p>
              )}
              {copyStatus === "failed" && (
                <p role="alert" className="text-sm text-destructive">
                  No se pudo copiar. Selecciona el enlace y cópialo a mano.
                </p>
              )}
            </>
          )}
          <p className="text-sm text-muted-foreground">
            Envíalo tú (por WhatsApp o correo). La persona debe crear su cuenta con el correo
            invitado y verificarlo con el código que recibirá.
          </p>
        </div>
      )}
    </section>
  );
}
