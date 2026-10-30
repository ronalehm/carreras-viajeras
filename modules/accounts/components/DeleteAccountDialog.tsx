"use client";

import { useActionState, useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountStatusActionState } from "../types/accountStatus.types";

type DeleteAccountAction = (
  prev: AccountStatusActionState,
  formData: FormData,
) => Promise<AccountStatusActionState>;

type DeleteAccountDialogProps = {
  userId: string;
  email: string;
  action: DeleteAccountAction;
};

const LABEL = "Eliminar definitivamente";

// The typed email is only a confirmation: the action compares it with profiles.email (R15).
export function DeleteAccountDialog({ userId, email, action }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>{LABEL}</AlertDialogTrigger>
      <AlertDialogContent>
        {/* The popup unmounts when closed, so each opening starts idle and with an empty field. */}
        <DeleteAccountForm
          userId={userId}
          email={email}
          action={action}
          onSuccess={() => setOpen(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountForm({
  userId,
  email,
  action,
  onSuccess,
}: DeleteAccountDialogProps & { onSuccess: () => void }) {
  const inputId = useId();
  const [state, formAction, pending] = useActionState<AccountStatusActionState, FormData>(
    async (prev, formData) => {
      const next = await action(prev, formData);
      if (next.status === "success") onSuccess();
      return next;
    },
    { status: "idle" },
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="userId" value={userId} />

      <AlertDialogHeader>
        <AlertDialogTitle>¿Eliminar definitivamente la cuenta de {email}?</AlertDialogTitle>
        <AlertDialogDescription>
          Se borrarán su perfil de runner y su cuenta de Clerk, y sus reservas quedarán sin vincular.
          No se puede deshacer.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={inputId}>Escribe el correo de la cuenta para confirmar</Label>
        <Input
          id={inputId}
          name="confirmEmail"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={320}
          disabled={pending}
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
          {pending ? "Procesando…" : LABEL}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  );
}
