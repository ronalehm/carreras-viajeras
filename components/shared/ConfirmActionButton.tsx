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

type IdleState = { status: "idle" };

// Minimum shape the dialog reads; module states (staff, trips) may add codes, field errors, etc.
export type ConfirmActionState =
  | IdleState
  | { status: "success"; message: string }
  | { status: "error"; message: string };

// prev also accepts the idle state: the dialog starts from it on every opening.
// NoInfer: State comes from the action's return type, idle included or not.
type ConfirmAction<State extends ConfirmActionState> = (
  prev: NoInfer<State> | IdleState,
  formData: FormData,
) => Promise<State>;

type ConfirmActionButtonProps<State extends ConfirmActionState> = {
  action: ConfirmAction<State>;
  fields: Record<string, string>;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "outline" | "destructive";
};

const INITIAL_STATE: IdleState = { status: "idle" };

export function ConfirmActionButton<State extends ConfirmActionState>({
  action,
  fields,
  label,
  title,
  description,
  confirmLabel,
  variant,
}: ConfirmActionButtonProps<State>) {
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

type ConfirmActionFormProps<State extends ConfirmActionState> = Pick<
  ConfirmActionButtonProps<State>,
  "action" | "fields" | "title" | "description" | "confirmLabel"
> & {
  confirmVariant: "default" | "destructive";
  onSuccess: () => void;
};

function ConfirmActionForm<State extends ConfirmActionState>({
  action,
  fields,
  title,
  description,
  confirmLabel,
  confirmVariant,
  onSuccess,
}: ConfirmActionFormProps<State>) {
  const [state, formAction, pending] = useActionState<State | IdleState, FormData>(
    async (prev, formData) => {
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
