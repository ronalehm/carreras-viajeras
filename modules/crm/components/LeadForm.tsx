"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createLeadAction } from "../actions/leads.actions";
import { manualLeadSourceSchema } from "../schemas/leads.schema";
import type { CreateLeadInput, LeadActionState, LeadOwnerOption, LeadTripOption } from "../types/leads.types";
import { LEAD_SOURCE_LABELS } from "../utils/leadDisplay";

type LeadField = keyof CreateLeadInput;

const HINTS: Partial<Record<LeadField, string>> = {
  phone: "Con código de país, p. ej. +51 938 127 170.",
  destinationText: "Si el viaje aún no está en el catálogo.",
};

// Required controls: marked with * and aria-required. Validation stays in the action (noValidate).
const REQUIRED_FIELDS: ReadonlySet<LeadField> = new Set(["fullName", "phone", "source", "ownerUserId", "consent"]);

const CONSENT_TEXT = "El contacto aceptó que guardemos sus datos para atender su consulta.";

const INITIAL_STATE: LeadActionState = { status: "idle" };

type LeadFormProps = {
  ownerOptions: LeadOwnerOption[];
  tripOptions: LeadTripOption[];
  defaultOwnerId: string;
};

// Manual lead registration. On error the typed values stay (manual dispatch, no form reset);
// on success the action redirects to the list.
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

  // id, name and the accessibility links of one control (hint and error below it).
  function control(name: LeadField) {
    const id = `lead-${name}`;
    return {
      id,
      name,
      "aria-required": REQUIRED_FIELDS.has(name) ? true : undefined,
      "aria-invalid": errors?.[name] ? true : undefined,
      "aria-describedby": [HINTS[name] && `${id}-help`, errors?.[name] && `${id}-error`]
        .filter(Boolean).join(" ") || undefined,
    };
  }

  function field(name: LeadField, label: string, input: ReactNode, options: { wide?: boolean } = {}) {
    const id = `lead-${name}`;
    return (
      <div className={cn("flex flex-col gap-2", options.wide && "sm:col-span-2")}>
        <Label htmlFor={id}>{label}{REQUIRED_FIELDS.has(name) ? " *" : ""}</Label>
        {input}
        {HINTS[name] && <p id={`${id}-help`} className="text-sm text-muted-foreground">{HINTS[name]}</p>}
        {errors?.[name] && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{errors[name][0]}</p>
        )}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">Los campos con * son obligatorios.</p>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos del lead</legend>
        {field("fullName", "Nombre", (
          <Input {...control("fullName")} defaultValue={values?.fullName ?? ""} maxLength={120} autoComplete="off" />
        ))}
        {field("phone", "WhatsApp o teléfono", (
          <Input {...control("phone")} type="tel" defaultValue={values?.phone ?? ""} autoComplete="off" />
        ))}
        {field("email", "Email", (
          <Input {...control("email")} type="email" defaultValue={values?.email ?? ""} maxLength={254} autoComplete="off" />
        ))}
        {field("location", "Ciudad o país", (
          <Input {...control("location")} defaultValue={values?.location ?? ""} maxLength={80} autoComplete="off" />
        ))}
        {field("tripId", "Viaje del catálogo", (
          <NativeSelect {...control("tripId")} defaultValue={values?.tripId ?? ""} className="w-full">
            <NativeSelectOption value="">Sin viaje del catálogo</NativeSelectOption>
            {tripOptions.map((trip) => (
              <NativeSelectOption key={trip.id} value={trip.id}>
                {trip.status === "draft" ? `${trip.title} (borrador)` : trip.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ))}
        {field("destinationText", "Destino (texto libre)", (
          <Input {...control("destinationText")} defaultValue={values?.destinationText ?? ""} maxLength={120} />
        ))}
        {field("source", "Origen", (
          <NativeSelect {...control("source")} defaultValue={values?.source ?? "whatsapp"} className="w-full">
            {manualLeadSourceSchema.options.map((source) => (
              <NativeSelectOption key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</NativeSelectOption>
            ))}
          </NativeSelect>
        ))}
        {field("ownerUserId", "Responsable", (
          <NativeSelect {...control("ownerUserId")} defaultValue={values?.ownerUserId ?? defaultOwnerId} className="w-full">
            {ownerOptions.map((owner) => (
              <NativeSelectOption key={owner.userId} value={owner.userId}>{owner.email}</NativeSelectOption>
            ))}
          </NativeSelect>
        ))}
        {field("note", "Nota inicial", (
          <Textarea {...control("note")} defaultValue={values?.note ?? ""} rows={4} maxLength={2000} />
        ), { wide: true })}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="flex items-start gap-3">
            {/* Base UI renders a native checkbox named "consent": checked, it submits "on". */}
            <Checkbox {...control("consent")} defaultChecked={values?.consent === "on"} className="mt-0.5" />
            <Label htmlFor="lead-consent" className="leading-snug">{CONSENT_TEXT} *</Label>
          </div>
          {errors?.consent && (
            <p id="lead-consent-error" role="alert" className="text-sm text-destructive">{errors.consent[0]}</p>
          )}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar lead"}</Button>
        <Link href="/crm/leads" className={buttonVariants({ variant: "outline" })}>Volver a leads</Link>
      </div>
    </form>
  );
}
