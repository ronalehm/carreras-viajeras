import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BookingActionState } from "../types/bookings.types";

type FieldMessages = { hint?: string; error?: string };

// Props for the control inside a FormField: links it to its hint and error.
export function fieldControlProps(id: string, { hint, error }: FieldMessages) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [hint && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined,
  };
}

type FormFieldProps = FieldMessages & {
  id: string;
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

// Label, control, hint and the first error under it. The control spreads fieldControlProps(id, …).
export function FormField({ id, label, required, hint, error, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
      {children}
      {hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// The action's message above the fields: an alert on error, a status line on success.
export function FormStatus({ state }: { state: BookingActionState }) {
  if (state.status === "error") return <p role="alert" className="text-sm text-destructive">{state.message}</p>;
  if (state.status === "success") return <p role="status" className="text-sm text-muted-foreground">{state.message}</p>;
  return null;
}
