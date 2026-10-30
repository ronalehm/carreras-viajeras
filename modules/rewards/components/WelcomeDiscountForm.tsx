"use client";

import { startTransition, useActionState, useId, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActiveWelcomeDiscount } from "../services/welcomeDiscount.service";
import type { RewardActionState } from "../types/rewards.types";

type Props = {
  action: (prev: RewardActionState, formData: FormData) => Promise<RewardActionState>;
  current: ActiveWelcomeDiscount | null;
};

const NUMBER_FIELDS = [
  { name: "amountUsd", label: "Importe en US$", min: 1, max: 10000, hint: "Entero entre 1 y 10 000." },
  { name: "validityDays", label: "Vigencia en días", min: 1, max: 365, hint: "Entre 1 y 365 días desde la emisión del código." },
] as const;

// Preloaded with the active version. It never resets on success: the saved values are the ones shown.
export function WelcomeDiscountForm({ action, current }: Props) {
  const id = useId();
  const [state, submit, pending] = useActionState<RewardActionState, FormData>(async (previous, data) => {
    try {
      return await action(previous, data);
    } catch {
      return { status: "error", code: "unavailable", message: "No se pudo guardar el descuento de bienvenida. Inténtalo de nuevo." };
    }
  }, { status: "idle" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => submit(data));
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const helpId = `${id}-help`;
  return <form onSubmit={handleSubmit} noValidate className="grid gap-4" aria-describedby={helpId}>
    <p id={helpId} className="text-sm text-muted-foreground">Cada cambio crea una versión nueva; los códigos ya emitidos conservan su importe y caducidad.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {NUMBER_FIELDS.map((field) => {
        const fieldId = `${id}-${field.name}`;
        const error = errors?.[field.name]?.[0];
        const describedBy = [`${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(" ");
        return <div key={field.name} className="grid gap-2">
          <Label htmlFor={fieldId}>{field.label}</Label>
          <Input id={fieldId} name={field.name} type="number" inputMode="numeric" min={field.min} max={field.max} step={1} required
            defaultValue={current?.[field.name] ?? ""} disabled={pending} autoComplete="off"
            aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
          <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">{field.hint}</p>
          {error && <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
        </div>;
      })}
    </div>
    <div className="flex items-center gap-3">
      <input id={`${id}-active`} name="active" type="checkbox" value="on" defaultChecked={current !== null} disabled={pending}
        aria-describedby={`${id}-active-hint`} className="size-5 accent-primary" />
      <Label htmlFor={`${id}-active`}>Activo</Label>
    </div>
    <p id={`${id}-active-hint`} className="-mt-2 text-sm text-muted-foreground">Sin marcar, no se emiten códigos nuevos y la bienvenida sale con su texto normal.</p>
    <Button type="submit" disabled={pending} className="w-fit">{pending ? "Guardando…" : "Guardar"}</Button>
    {/* The status region stays mounted so screen readers announce the success message. */}
    <p role="status" aria-live="polite" className="text-sm empty:hidden">{state.status === "success" ? state.message : ""}</p>
    {state.status === "error" && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </form>;
}
