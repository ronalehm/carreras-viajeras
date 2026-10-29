"use client";

import { startTransition, useActionState, type FormEvent, type HTMLInputTypeAttribute } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createSponsorAction, updateSponsorAction } from "../actions/sponsors.actions";
import type { Sponsor, SponsorActionState, SponsorInput } from "../types/sponsors.types";

type SponsorField = {
  name: keyof SponsorInput;
  label: string;
  type?: HTMLInputTypeAttribute;
  rows?: number;
  hint?: string;
  required?: boolean;
  maxLength?: number;
};

const FIELDS: SponsorField[] = [
  { name: "name", label: "Nombre", required: true, maxLength: 80 },
  { name: "slug", label: "Identificador", required: true, maxLength: 80,
    hint: "Minúsculas, números y guiones. Ejemplo: marca-deportiva. Forma parte de su página pública." },
  { name: "logoUrl", label: "URL del logo", type: "url", maxLength: 2048,
    hint: "Enlace externo que empiece por https://." },
  { name: "websiteUrl", label: "Sitio web", type: "url", maxLength: 2048,
    hint: "Enlace externo que empiece por https://." },
  { name: "description", label: "Descripción", rows: 4, maxLength: 500, hint: "Entre 10 y 500 caracteres." },
];

const INITIAL_STATE: SponsorActionState = { status: "idle" };

export function SponsorForm({ sponsor }: { sponsor?: Sponsor }) {
  const [state, formAction, pending] = useActionState(
    sponsor ? updateSponsorAction : createSponsorAction, INITIAL_STATE,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the user's fields after a rejected submission.
    startTransition(() => formAction(data));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      {sponsor && <input type="hidden" name="id" value={sponsor.id} />}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-muted-foreground">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos del patrocinador</legend>
        {FIELDS.map(({ name, label, hint, rows, type = "text", ...constraints }) => {
          const id = `sponsor-${name}`;
          // The slug is fixed at creation: shown read-only and never submitted when editing.
          const locked = name === "slug" && !!sponsor;
          const help = locked ? "El identificador no se puede cambiar." : hint;
          const props = {
            id, name: locked ? undefined : name, defaultValue: values?.[name] ?? sponsor?.[name] ?? "", ...constraints,
            "aria-invalid": errors?.[name] ? true : undefined,
            "aria-describedby": [help && `${id}-help`, errors?.[name] && `${id}-error`]
              .filter(Boolean).join(" ") || undefined,
          };
          return (
            <div key={name} className={cn("flex flex-col gap-2", (rows || type === "url") && "sm:col-span-2")}>
              <Label htmlFor={id}>{label}{constraints.required ? " *" : ""}</Label>
              {rows ? <Textarea {...props} rows={rows} /> : <Input {...props} type={type} readOnly={locked} />}
              {help && <p id={`${id}-help`} className="text-sm text-muted-foreground">{help}</p>}
              {errors?.[name] && (
                <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{errors[name][0]}</p>
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : sponsor ? "Guardar cambios" : "Crear patrocinador"}
        </Button>
        <Link href="/crm/admin/patrocinadores" className={buttonVariants({ variant: "outline" })}>
          Volver a patrocinadores
        </Link>
      </div>
    </form>
  );
}
