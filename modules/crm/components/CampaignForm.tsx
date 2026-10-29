"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createCampaignAction } from "../actions/campaigns.actions";
import { campaignChannelSchema } from "../schemas/campaigns.schema";
import type { CampaignActionState, CampaignInput } from "../types/campaigns.types";
import type { LeadTripOption } from "../types/leads.types";
import { LEAD_CHANNEL_LABELS, leadTripLabel } from "../utils/leadDisplay";

type CampaignFormProps = {
  // Trips that are not archived (getLeadFormOptions().tripOptions).
  tripOptions: LeadTripOption[];
};

type FieldName = keyof CampaignInput;

const INITIAL_STATE: CampaignActionState = { status: "idle" };

const CODE_HINT = "De 3 a 32 caracteres: minúsculas, números y guiones. Va en el enlace y en el QR (?c=).";
const EVENT_HINT = "Opcional. Si lo indicas, es el detalle del origen de los leads; si no, se usa el nombre.";

// New campaign. On success the action redirects to the campaign detail.
export function CampaignForm({ tripOptions }: CampaignFormProps) {
  const [state, formAction, pending] = useActionState(createCampaignAction, INITIAL_STATE);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the user's fields after a rejected submission.
    startTransition(() => formAction(data));
  }

  // id, name and error wiring shared by every field.
  function fieldProps(name: FieldName, hint?: string) {
    const id = `campaign-${name}`;
    return {
      id,
      name,
      "aria-invalid": errors?.[name] ? true : undefined,
      "aria-describedby":
        [hint && `${id}-help`, errors?.[name] && `${id}-error`].filter(Boolean).join(" ") || undefined,
    };
  }

  function field(name: FieldName, label: string, control: ReactNode, hint?: string) {
    const id = `campaign-${name}`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        {control}
        {hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{hint}</p>}
        {errors?.[name] && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{errors[name][0]}</p>
        )}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-labelledby="campaign-form-title"
      className="flex max-w-3xl flex-col gap-6">
      <h2 id="campaign-form-title" className="text-lg font-semibold">Nueva campaña</h2>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos de la campaña</legend>
        {field("code", "Código *",
          <Input {...fieldProps("code", CODE_HINT)} required minLength={3} maxLength={32} autoComplete="off"
            autoCapitalize="none" spellCheck={false} defaultValue={values?.code} />,
          CODE_HINT)}
        {field("name", "Nombre *",
          <Input {...fieldProps("name")} required minLength={2} maxLength={80} autoComplete="off"
            defaultValue={values?.name} />)}
        {field("tripId", "Viaje *",
          <NativeSelect {...fieldProps("tripId")} className="w-full" required defaultValue={values?.tripId ?? ""}>
            <NativeSelectOption value="">Elige el viaje</NativeSelectOption>
            {tripOptions.map((trip) => (
              <NativeSelectOption key={trip.id} value={trip.id}>{leadTripLabel(trip)}</NativeSelectOption>
            ))}
          </NativeSelect>)}
        {field("channel", "Canal *",
          <NativeSelect {...fieldProps("channel")} className="w-full" required defaultValue={values?.channel ?? ""}>
            <NativeSelectOption value="">Elige el canal</NativeSelectOption>
            {campaignChannelSchema.options.map((channel) => (
              <NativeSelectOption key={channel} value={channel}>{LEAD_CHANNEL_LABELS[channel]}</NativeSelectOption>
            ))}
          </NativeSelect>)}
        {field("eventName", "Evento o stand",
          <Input {...fieldProps("eventName", EVENT_HINT)} maxLength={120} autoComplete="off"
            defaultValue={values?.eventName} />,
          EVENT_HINT)}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear campaña"}</Button>
      </div>
    </form>
  );
}
