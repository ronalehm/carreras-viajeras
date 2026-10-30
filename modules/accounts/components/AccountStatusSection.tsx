"use client";

import { useState } from "react";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import {
  deleteAccountAction,
  disableAccountAction,
  reactivateAccountAction,
  retryClerkSyncAction,
} from "../actions/accountStatus.actions";
import type { AccountStatus, AccountStatusActionState } from "../types/accountStatus.types";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

type AccountStatusSectionProps = {
  userId: string;
  email: string;
  status: AccountStatus;
};

type Action = (prev: AccountStatusActionState, formData: FormData) => Promise<AccountStatusActionState>;

const RETRY_DESCRIPTIONS: Record<AccountStatus, string> = {
  active: "Se repetirá solo el desbloqueo de la cuenta en Clerk.",
  disabled: "Se repetirá solo el bloqueo de la cuenta en Clerk.",
  deleted: "Se repetirá solo el borrado de la cuenta en Clerk.",
};

// Rendered only for super_admin on another account without super_admin (R17); every action checks
// it again. Neon has no record of a pending Clerk call, so "Reintentar en Clerk" (idempotent) stays
// available on disabled and deleted accounts, and on an active one after a failed reactivation.
export function AccountStatusSection({ userId, email, status }: AccountStatusSectionProps) {
  // A partial failure (Neon changed, Clerk did not) re-renders the page with the new status, which
  // unmounts the dialog that showed it: the section keeps the message.
  const [clerkNotice, setClerkNotice] = useState<string | null>(null);

  function track(action: Action): Action {
    return async (prev, formData) => {
      const next = await action(prev, formData);
      if (next.status === "error" && next.code === "clerk_failed") setClerkNotice(next.message);
      else if (next.status === "success") setClerkNotice(null);
      return next;
    };
  }

  const fields = { userId };
  const showRetry = status !== "active" || clerkNotice !== null;

  return (
    <div className="flex flex-col gap-4">
      {status === "deleted" ? (
        <p className="text-sm text-muted-foreground">
          La cuenta está eliminada. Si su usuario sigue en Clerk, reintenta el borrado.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {status === "disabled"
            ? "Cuenta desactivada: no puede iniciar sesión ni tiene roles."
            : "Cuenta activa."}
        </p>
      )}

      {clerkNotice ? (
        <p role="alert" className="text-sm text-destructive">
          {clerkNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <ConfirmActionButton
            action={track(disableAccountAction)}
            fields={fields}
            label="Desactivar"
            title={`¿Desactivar la cuenta de ${email}?`}
            description="Perderá todos sus roles y no podrá iniciar sesión. Podrás reactivarla."
            confirmLabel="Desactivar"
            variant="destructive"
          />
        ) : null}
        {status === "disabled" ? (
          <ConfirmActionButton
            action={track(reactivateAccountAction)}
            fields={fields}
            label="Reactivar"
            title={`¿Reactivar la cuenta de ${email}?`}
            description="Podrá volver a iniciar sesión, sin roles: asígnalos de nuevo desde esta ficha."
            confirmLabel="Reactivar"
            variant="outline"
          />
        ) : null}
        {status !== "deleted" ? (
          <DeleteAccountDialog userId={userId} email={email} action={track(deleteAccountAction)} />
        ) : null}
        {showRetry ? (
          <ConfirmActionButton
            action={track(retryClerkSyncAction)}
            fields={fields}
            label="Reintentar en Clerk"
            title="¿Reintentar en Clerk?"
            description={RETRY_DESCRIPTIONS[status]}
            confirmLabel="Reintentar"
            variant="outline"
          />
        ) : null}
      </div>
    </div>
  );
}
