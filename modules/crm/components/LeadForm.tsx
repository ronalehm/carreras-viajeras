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
import { createLeadAction, updateLeadAction } from "../actions/leads.actions";
import {
  contactPreferenceSchema,
  leadChannelSchema,
  manualLeadSourceSchema,
} from "../schemas/leads.schema";
import type {
  CreateLeadInput,
  LeadActionState,
  LeadDetail,
  LeadOwnerOption,
  LeadTripOption,
} from "../types/leads.types";
import {
  CONTACT_PREFERENCE_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  leadTripLabel,
} from "../utils/leadDisplay";
import { LEAD_LIST_PATH } from "../utils/leadListQuery";

type EditableLead = Pick<
  LeadDetail,
  | "id"
  | "fullName"
  | "phone"
  | "email"
  | "location"
  | "trip"
  | "destinationText"
  | "channel"
  | "originDetail"
  | "referredBy"
  | "referralPermission"
  | "contactPreference"
>;

// Without lead: manual creation (every field). With lead: contact and origin data edit only.
type LeadFormProps =
  | { tripOptions: LeadTripOption[]; ownerOptions: LeadOwnerOption[]; defaultOwnerId: string; lead?: undefined }
  | { tripOptions: LeadTripOption[]; lead: EditableLead };

type FieldName = keyof CreateLeadInput;

const INITIAL_STATE: LeadActionState = { status: "idle" };

export function LeadForm(props: LeadFormProps) {
  const { lead, tripOptions } = props;
  const [state, formAction, pending] = useActionState(
    lead ? updateLeadAction : createLeadAction, INITIAL_STATE,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  // A trip linked before being archived is not among the options: keep it selectable so the lead
  // can be saved without changing it.
  const linkedTrip = lead?.trip && !tripOptions.some((trip) => trip.id === lead.trip?.id) ? lead.trip : null;
  const trips = linkedTrip ? [...tripOptions, linkedTrip] : tripOptions;

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

  function fieldError(name: FieldName) {
    return errors?.[name] && (
      <p id={`lead-${name}-error`} role="alert" className="text-sm text-destructive">{errors[name][0]}</p>
    );
  }

  function field(name: FieldName, label: string, control: ReactNode, hint?: string, className?: string) {
    const id = `lead-${name}`;
    return (
      <div className={className ?? "flex flex-col gap-2"}>
        <Label htmlFor={id}>{label}</Label>
        {control}
        {hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{hint}</p>}
        {fieldError(name)}
      </div>
    );
  }

  // The checkbox sends "on" only when checked.
  function checkboxField(
    name: FieldName,
    label: string,
    options: { defaultChecked: boolean; required?: boolean; className?: string },
  ) {
    return (
      <div className={cn("flex flex-col gap-2", options.className)}>
        <div className="flex items-start gap-3">
          <Checkbox {...fieldProps(name)} required={options.required}
            defaultChecked={options.defaultChecked} className="mt-0.5" />
          <Label htmlFor={`lead-${name}`} className="leading-snug">{label}</Label>
        </div>
        {fieldError(name)}
      </div>
    );
  }

  const phoneHint = "Con código de país, p. ej. +51 938 127 170.";
  const originDetailHint =
    "Nombre del evento, aliado, campaña o publicación. No escribas datos personales de otras personas.";
  const submitLabel = lead
    ? { idle: "Guardar cambios", pending: "Guardando…" }
    : { idle: "Registrar lead", pending: "Registrando…" };

  // Entry path and owner only exist when the lead is created.
  const creationFields = !props.lead && (
    <>
      {field("source", "Vía de entrada *",
        <NativeSelect {...fieldProps("source")} className="w-full" defaultValue={values?.source ?? "whatsapp"}>
          {manualLeadSourceSchema.options.map((source) => (
            <NativeSelectOption key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</NativeSelectOption>
          ))}
        </NativeSelect>)}
      {field("ownerUserId", "Responsable *",
        <NativeSelect {...fieldProps("ownerUserId")} className="w-full"
          defaultValue={values?.ownerUserId ?? props.defaultOwnerId}>
          {props.ownerOptions.map((owner) => (
            <NativeSelectOption key={owner.userId} value={owner.userId}>{owner.email}</NativeSelectOption>
          ))}
        </NativeSelect>)}
    </>
  );

  // Origin (how the person found us): no default on creation, so WhatsApp is never recorded by
  // inertia; on edit it starts on the lead's current values.
  const originFields = (
    <>
      {field("channel", "Origen *",
        <NativeSelect {...fieldProps("channel")} className="w-full" required
          defaultValue={values?.channel ?? lead?.channel ?? ""}>
          {!lead && <NativeSelectOption value="">Elige el origen</NativeSelectOption>}
          {leadChannelSchema.options.map((channel) => (
            <NativeSelectOption key={channel} value={channel}>{LEAD_CHANNEL_LABELS[channel]}</NativeSelectOption>
          ))}
        </NativeSelect>)}
      {field("originDetail", "Detalle del origen",
        <Input {...fieldProps("originDetail", originDetailHint)} maxLength={120} autoComplete="off"
          defaultValue={values?.originDetail ?? lead?.originDetail ?? undefined} />,
        originDetailHint)}
      <div className="flex flex-col gap-3">
        {field("referredBy", "Referido por",
          <Input {...fieldProps("referredBy")} maxLength={120} autoComplete="off"
            defaultValue={values?.referredBy ?? lead?.referredBy ?? undefined} />)}
        {checkboxField("referralPermission", "El referente autorizó que lo mencionemos", {
          defaultChecked: values ? values.referralPermission === "on" : (lead?.referralPermission ?? false),
        })}
      </div>
      {field("contactPreference", "Prefiere que lo contactemos por",
        <NativeSelect {...fieldProps("contactPreference")} className="w-full"
          defaultValue={values?.contactPreference ?? lead?.contactPreference ?? ""}>
          <NativeSelectOption value="">Sin preferencia</NativeSelectOption>
          {contactPreferenceSchema.options.map((preference) => (
            <NativeSelectOption key={preference} value={preference}>
              {CONTACT_PREFERENCE_LABELS[preference]}
            </NativeSelectOption>
          ))}
        </NativeSelect>)}
    </>
  );

  // Initial note and consent only exist when the lead is created.
  const creationNoteFields = !props.lead && (
    <>
      {field("note", "Nota inicial",
        <Textarea {...fieldProps("note")} rows={4} maxLength={2000} defaultValue={values?.note} />,
        undefined, "flex flex-col gap-2 sm:col-span-2")}
      {checkboxField("consent", "El contacto aceptó que guardemos sus datos para atender su consulta. *", {
        defaultChecked: values?.consent === "on",
        required: true,
        className: "sm:col-span-2",
      })}
    </>
  );

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      {lead && <input type="hidden" name="leadId" value={lead.id} />}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos del lead</legend>
        {field("fullName", "Nombre *",
          <Input {...fieldProps("fullName")} required maxLength={120} autoComplete="off"
            defaultValue={values?.fullName ?? lead?.fullName} />)}
        {field("phone", "WhatsApp o teléfono *",
          <Input {...fieldProps("phone", phoneHint)} type="tel" required autoComplete="off"
            defaultValue={values?.phone ?? lead?.phone} />,
          phoneHint)}
        {field("email", "Email",
          <Input {...fieldProps("email")} type="email" maxLength={254} autoComplete="off"
            defaultValue={values?.email ?? lead?.email ?? undefined} />)}
        {field("location", "Ciudad o país",
          <Input {...fieldProps("location")} maxLength={80} autoComplete="off"
            defaultValue={values?.location ?? lead?.location ?? undefined} />)}
        {field("tripId", "Viaje del catálogo",
          <NativeSelect {...fieldProps("tripId")} className="w-full"
            defaultValue={values?.tripId ?? lead?.trip?.id ?? ""}>
            <NativeSelectOption value="">Sin viaje del catálogo</NativeSelectOption>
            {trips.map((trip) => (
              <NativeSelectOption key={trip.id} value={trip.id}>{leadTripLabel(trip)}</NativeSelectOption>
            ))}
          </NativeSelect>)}
        {field("destinationText", "Destino (texto libre)",
          <Input {...fieldProps("destinationText")} maxLength={120} autoComplete="off"
            defaultValue={values?.destinationText ?? lead?.destinationText ?? undefined} />)}
        {creationFields}
        {originFields}
        {creationNoteFields}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>{pending ? submitLabel.pending : submitLabel.idle}</Button>
        {lead && (
          <Link href={`${LEAD_LIST_PATH}/${lead.id}`} className={buttonVariants({ variant: "outline" })}>
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
