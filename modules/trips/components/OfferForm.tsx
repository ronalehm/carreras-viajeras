"use client";

import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
  type HTMLInputTypeAttribute,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MAX_USD_AMOUNT } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { createOfferAction, updateOfferAction } from "../actions/offers.actions";
import type { OfferActionState, OfferDetail, OfferInput } from "../types/offers.types";

type OfferFormProps = {
  // Without offer: a new offer (trip and scope are chosen here). With offer: edit that draft.
  offer?: OfferDetail;
  // Trips that are not archived.
  tripOptions?: { id: string; title: string }[];
  // Active campaigns; only those of the chosen trip are offered.
  campaignOptions?: { id: string; label: string; tripId: string }[];
};

type OfferField = {
  name: keyof OfferInput;
  label: string;
  type?: HTMLInputTypeAttribute;
  rows?: number;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  autoCapitalize?: string;
  spellCheck?: boolean;
};

// Requirement 1 fields. Status, version, final price and audit are never form fields.
const FIELDS: OfferField[] = [
  { name: "name", label: "Nombre interno", required: true, maxLength: 80, hint: "Solo se ve en el CRM." },
  { name: "totalPriceUsd", label: "Precio total (USD)", type: "number", required: true, min: 1,
    max: MAX_USD_AMOUNT, hint: "Sin decimales." },
  { name: "discountUsd", label: "Descuento (USD)", type: "number", min: 0, max: MAX_USD_AMOUNT,
    hint: "Sin decimales. Vacío = sin descuento. El precio final se calcula solo." },
  { name: "depositOptionsUsd", label: "Anticipos permitidos (USD)",
    hint: "Hasta 3 importes en USD separados por comas. Vacío = pago único." },
  { name: "balanceDueOn", label: "Fecha límite del saldo", type: "date",
    hint: "Fechas en hora de Lima. Obligatoria si hay anticipos; vacía si no los hay." },
  { name: "bonusDescription", label: "Bono", maxLength: 200, hint: "Sin importes: un beneficio no monetario." },
  { name: "validFrom", label: "Válido desde", type: "date", required: true, hint: "Fechas en hora de Lima." },
  { name: "validUntil", label: "Válido hasta", type: "date",
    hint: "Fechas en hora de Lima. Vacío = sin fecha de fin." },
  { name: "capacityLimit", label: "Cupos de la oferta", type: "number", min: 1, max: 10_000,
    hint: "Opcional. Se guardan con la versión; la web no los muestra." },
  { name: "termsVersion", label: "Versión de las condiciones", required: true, maxLength: 60,
    autoCapitalize: "none", spellCheck: false,
    hint: "Minúsculas, números y guiones. Ejemplo: santiago-2027-v1." },
  { name: "conditions", label: "Condiciones de pago y cancelación", rows: 6, required: true, maxLength: 2000,
    hint: "Un párrafo por línea. Entre 10 y 2000 caracteres." },
];

const INITIAL_STATE: OfferActionState = { status: "idle" };

const CAMPAIGN_HINT = "Solo las campañas activas del viaje elegido. El ámbito no se cambia después.";

function initialValue(offer: OfferDetail | undefined, name: keyof OfferInput): string {
  const original = offer?.[name];
  return Array.isArray(original) ? original.join(", ") : String(original ?? "");
}

export function OfferForm({ offer, tripOptions = [], campaignOptions = [] }: OfferFormProps) {
  const [state, formAction, pending] = useActionState(
    offer ? updateOfferAction : createOfferAction, INITIAL_STATE,
  );
  const [tripId, setTripId] = useState("");
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const tripCampaigns = campaignOptions.filter((campaign) => campaign.tripId === tripId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    // Dispatch manually so React does not reset the user's fields after a rejected submission.
    startTransition(() => formAction(data));
  }

  // id, name and error wiring shared by every field.
  function wiring(name: string, hint?: string) {
    const id = `offer-${name}`;
    return {
      id,
      name,
      "aria-invalid": errors?.[name] ? true : undefined,
      "aria-describedby":
        [hint && `${id}-help`, errors?.[name] && `${id}-error`].filter(Boolean).join(" ") || undefined,
    };
  }

  function field(name: string, label: string, control: ReactNode, options: {
    hint?: string; required?: boolean; wide?: boolean;
  } = {}) {
    const id = `offer-${name}`;
    return (
      <div key={name} className={cn("flex flex-col gap-2", options.wide && "sm:col-span-2")}>
        <Label htmlFor={id}>{label}{options.required ? " *" : ""}</Label>
        {control}
        {options.hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{options.hint}</p>}
        {errors?.[name] && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{errors[name][0]}</p>
        )}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-labelledby={offer ? "offer-form-title" : undefined}
      className="flex max-w-3xl flex-col gap-6">
      {offer && <h2 id="offer-form-title" className="text-lg font-semibold">Editar borrador</h2>}
      {offer && <input type="hidden" name="id" value={offer.id} />}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && <p role="status" className="text-sm">{state.message}</p>}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos de la oferta</legend>
        {!offer && field("tripId", "Viaje",
          <NativeSelect {...wiring("tripId")} className="w-full" required defaultValue={values?.tripId ?? ""}
            onChange={(event) => setTripId(event.target.value)}>
            <NativeSelectOption value="">Elige el viaje</NativeSelectOption>
            {tripOptions.map((trip) => (
              <NativeSelectOption key={trip.id} value={trip.id}>{trip.title}</NativeSelectOption>
            ))}
          </NativeSelect>,
          { required: true })}
        {!offer && field("campaignId", "Ámbito",
          <NativeSelect {...wiring("campaignId", CAMPAIGN_HINT)} className="w-full"
            defaultValue={values?.campaignId ?? ""}>
            <NativeSelectOption value="">General (sin campaña)</NativeSelectOption>
            {tripCampaigns.map((campaign) => (
              <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.label}</NativeSelectOption>
            ))}
          </NativeSelect>,
          { hint: CAMPAIGN_HINT })}
        {FIELDS.map(({ name, label, hint, rows, required, type = "text", ...constraints }) => {
          const props = {
            ...wiring(name, hint),
            defaultValue: values?.[name] ?? initialValue(offer, name),
            required,
            ...constraints,
          };
          return field(name, label,
            rows ? <Textarea {...props} rows={rows} />
              : <Input {...props} type={type} step={type === "number" ? 1 : undefined} autoComplete="off" />,
            { hint, required, wide: !!rows });
        })}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : offer ? "Guardar borrador" : "Crear oferta"}
        </Button>
        <Link href="/crm/ofertas" className={buttonVariants({ variant: "outline" })}>Volver a ofertas</Link>
      </div>
    </form>
  );
}
