"use client";

import { useActionState, useState } from "react";
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
import type { StaffActionState } from "../types/staff.types";

type StaffAction = (prev: StaffActionState, formData: FormData) => Promise<StaffActionState>;

type ConfirmActionButtonProps = {
  action: StaffAction;
  fields: Record<string, string>;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "outline" | "destructive";
};

const INITIAL_STATE: StaffActionState = { status: "idle" };

export function ConfirmActionButton({
  action,
  fields,
  label,
  title,
  description,
  confirmLabel,
  variant,
}: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant={variant} size="sm" />}>{label}</AlertDialogTrigger>
      <AlertDialogContent>
        {/* The popup unmounts when closed, so each opening starts from an idle state. */}
        <ConfirmActionForm
          action={action}
          fields={fields}
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          confirmVariant={variant === "destructive" ? "destructive" : "default"}
          onSuccess={() => setOpen(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ConfirmActionFormProps = Pick<
  ConfirmActionButtonProps,
  "action" | "fields" | "title" | "description" | "confirmLabel"
> & {
  confirmVariant: "default" | "destructive";
  onSuccess: () => void;
};

function ConfirmActionForm({
  action,
  fields,
  title,
  description,
  confirmLabel,
  confirmVariant,
  onSuccess,
}: ConfirmActionFormProps) {
  const [state, formAction, pending] = useActionState(
    async (prev: StaffActionState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.status === "success") onSuccess();
      return next;
    },
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="grid gap-4">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <AlertDialogAction type="submit" variant={confirmVariant} disabled={pending}>
          {pending ? "Procesando…" : confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  );
}
