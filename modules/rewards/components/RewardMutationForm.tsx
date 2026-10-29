"use client";

import { startTransition, useActionState, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { RewardActionState } from "../types/rewards.types";

export type RewardFormField = {
  name: string; label: string; type?: "text" | "number" | "date" | "textarea" | "checkbox" | "select";
  hint?: string; required?: boolean; options?: { value: string; label: string }[];
};

type Props = {
  action: (prev: RewardActionState, formData: FormData) => Promise<RewardActionState>;
  fields?: RewardFormField[]; hidden?: Record<string, string>; label: string;
  disabled?: boolean; idempotent?: boolean;
};

export function RewardMutationForm(props: Props) {
  const [intent, setIntent] = useState(0);
  return <RewardMutationFormAttempt key={intent} {...props} onNewIntent={() => setIntent((value) => value + 1)} />;
}

function RewardMutationFormAttempt({ action, fields = [], hidden = {}, label, disabled = false, idempotent = false, onNewIntent }: Props & { onNewIntent: () => void }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const requestKey = useRef<string | null>(null);
  const [state, submit, pending] = useActionState<RewardActionState, FormData>(async (previous, data) => {
    try {
      const next = await action(previous, data);
      if (next.status === "success") {
        formRef.current?.reset();
        // A retry keeps this key. A deliberate new canje starts a fresh attempt below.
      }
      return next;
    } catch {
      return { status: "error", code: "unavailable", message: "No se pudo completar la operación. Inténtalo de nuevo." };
    }
  }, { status: "idle" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending || (idempotent && state.status === "success")) return;
    const data = new FormData(event.currentTarget);
    if (idempotent) {
      requestKey.current ??= crypto.randomUUID();
      data.set("requestKey", requestKey.current);
    }
    startTransition(() => submit(data));
  }
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-4">
    {Object.entries(hidden).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
    {fields.map((field) => {
      const fieldId = `${id}-${field.name}`;
      const describedBy = [field.hint && `${fieldId}-hint`, errors?.[field.name] && `${fieldId}-error`].filter(Boolean).join(" ") || undefined;
      const common = { id: fieldId, name: field.name, required: field.required, disabled: pending || disabled, "aria-invalid": errors?.[field.name] ? true as const : undefined, "aria-describedby": describedBy };
      return <div key={field.name} className="grid gap-2">
        <Label htmlFor={fieldId}>{field.label}</Label>
        {field.type === "textarea" ? <Textarea {...common} rows={4} /> : field.type === "select" ? <NativeSelect {...common} defaultValue="" className="w-full"><NativeSelectOption value="">Selecciona una opción</NativeSelectOption>{field.options?.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect> : field.type === "checkbox" ? <input {...common} type="checkbox" value="on" className="size-5 accent-primary" /> : <Input {...common} type={field.type ?? "text"} min={field.type === "number" ? 1 : undefined} step={field.type === "number" ? 1 : undefined} autoComplete="off" />}
        {field.hint && <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">{field.hint}</p>}
        {errors?.[field.name] && <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">{errors[field.name][0]}</p>}
      </div>;
    })}
    <Button type="submit" disabled={pending || disabled || (idempotent && state.status === "success")} className="w-fit">{pending ? "Procesando…" : label}</Button>
    {state.status !== "idle" && <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-destructive" : "text-sm"}>{state.message}</p>}
    {idempotent && state.status === "success" && <Button type="button" variant="outline" className="w-fit" disabled={disabled} onClick={onNewIntent}>Solicitar otro canje</Button>}
  </form>;
}
