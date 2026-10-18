"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createLeadAction } from "../actions/leads.actions";
import { manualLeadSourceSchema } from "../schemas/leads.schema";
import type { CreateLeadInput, LeadActionState, LeadOwnerOption, LeadTripOption } from "../types/leads.types";
import { LEAD_SOURCE_LABELS } from "../utils/leadDisplay";

type LeadFormProps = {
  ownerOptions: LeadOwnerOption[];
  tripOptions: LeadTripOption[];
  defaultOwnerId: string;
};

type FieldName = keyof CreateLeadInput;

const INITIAL_STATE: LeadActionState = { status: "idle" };

export function LeadForm({ ownerOptions, tripOptions, defaultOwnerId }: LeadFormProps) {
  const [state, formAction, pending] = useActionState(createLeadAction, INITIAL_STATE);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the user's fields after a rejected submission.
    startTransition(() => formAction(data));
  }

  // id, name, restored value and error wiring shared by every field.
  function fieldProps(name: FieldName, hint?: string) {
    const id = `lead-${name}`;
    return {
      id,
      name,
      "aria-invalid": errors?.[name] ? true : undefined,
      "aria-describedby":
        [hint && `${id}-help`, errors?.[name] && `${id}-error`].filter(Boolean).join(" ") || undefined,
    };
  }

  function field(name: FieldName, label: string, control: ReactNode, hint?: string, className?: string) {
    const id = `lead-${name}`;
    return (
      <div className={className ?? "flex flex-col gap-2"}>
        <Label htmlFor={id}>{label}</Label>
        {control}
        {hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{hint}</p>}
        {errors?.[name] && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{errors[name][0]}</p>
        )}
      </div>
    );
  }

  const phoneHint = "Con código de país, p. ej. +51 938 127 170.";

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos del lead</legend>
        {field("fullName", "Nombre *",
          <Input {...fieldProps("fullName")} required maxLength={120} autoComplete="off"
            defaultValue={values?.fullName} />)}
        {field("phone", "WhatsApp o teléfono *",
          <Input {...fieldProps("phone", phoneHint)} type="tel" required autoComplete="off"
            defaultValue={values?.phone} />,
          phoneHint)}
        {field("email", "Email",
          <Input {...fieldProps("email")} type="email" maxLength={254} autoComplete="off"
            defaultValue={values?.email} />)}
        {field("location", "Ciudad o país",
          <Input {...fieldProps("location")} maxLength={80} autoComplete="off" defaultValue={values?.location} />)}
        {field("tripId", "Viaje del catálogo",
          <NativeSelect {...fieldProps("tripId")} className="w-full" defaultValue={values?.tripId ?? ""}>
            <NativeSelectOption value="">Sin viaje del catálogo</NativeSelectOption>
            {tripOptions.map((trip) => (
              <NativeSelectOption key={trip.id} value={trip.id}>
                {trip.status === "draft" ? `${trip.title} (borrador)` : trip.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>)}
        {field("destinationText", "Destino (texto libre)",
          <Input {...fieldProps("destinationText")} maxLength={120} autoComplete="off"
            defaultValue={values?.destinationText} />)}
        {field("source", "Origen *",
          <NativeSelect {...fieldProps("source")} className="w-full" defaultValue={values?.source ?? "whatsapp"}>
            {manualLeadSourceSchema.options.map((source) => (
              <NativeSelectOption key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</NativeSelectOption>
            ))}
          </NativeSelect>)}
        {field("ownerUserId", "Responsable *",
          <NativeSelect {...fieldProps("ownerUserId")} className="w-full"
            defaultValue={values?.ownerUserId ?? defaultOwnerId}>
            {ownerOptions.map((owner) => (
              <NativeSelectOption key={owner.userId} value={owner.userId}>{owner.email}</NativeSelectOption>
            ))}
          </NativeSelect>)}
        {field("note", "Nota inicial",
          <Textarea {...fieldProps("note")} rows={4} maxLength={2000} defaultValue={values?.note} />,
          undefined, "flex flex-col gap-2 sm:col-span-2")}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="flex items-start gap-3">
            <Checkbox {...fieldProps("consent")} required defaultChecked={values?.consent === "on"}
              className="mt-0.5" />
            <Label htmlFor="lead-consent" className="leading-snug">
              El contacto aceptó que guardemos sus datos para atender su consulta. *
            </Label>
          </div>
          {errors?.consent && (
            <p id="lead-consent-error" role="alert" className="text-sm text-destructive">{errors.consent[0]}</p>
          )}
        </div>
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar lead"}</Button>
      </div>
    </form>
  );
}
