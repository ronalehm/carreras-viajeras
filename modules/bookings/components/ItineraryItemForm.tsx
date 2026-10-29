"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createItineraryItemAction, updateItineraryItemAction } from "../actions/itinerary.actions";
import { useBookingActionForm } from "../hooks/useBookingActionForm";
import type { CrmItineraryItem, ItineraryKind, ItineraryStatus } from "../types/bookings.types";
import {
  ITINERARY_KIND_LABELS,
  ITINERARY_STATUS_LABELS,
  itineraryOriginPath,
  SCHEDULE_EDGE_LABELS,
} from "../utils/bookingDisplay";
import { fieldControlProps, FormField, FormStatus } from "./FormField";

const TIME_ZONES = [
  "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Panama",
  "America/Mexico_City", "America/New_York", "Europe/Madrid", "Europe/Berlin", "Asia/Tokyo",
];
const KINDS = Object.entries(ITINERARY_KIND_LABELS) as [ItineraryKind, string][];
const STATUSES = Object.entries(ITINERARY_STATUS_LABELS) as [ItineraryStatus, string][];
const TRIP_ITEM_HINT = "Lo verán todos los participantes del viaje. No incluyas datos de un participante concreto.";
const ZONE_HINT = "Hora local del lugar. Ejemplo: America/Santiago.";
const DETAILS_HINT = "Los ve el corredor: localizador, punto de encuentro, qué llevar…";

type TextField = "title" | "location" | "details";
type EdgeField = "Date" | "Time" | "TimeZone";

type ItineraryItemFormProps =
  | { owner: { tripId: string } | { bookingId: string }; item?: never }
  | { item: CrmItineraryItem; owner?: never };

// Create (for a trip or a booking) or edit (where the item belongs never changes). Times are the
// wall-clock time at the place, with its zone.
export function ItineraryItemForm({ owner, item }: ItineraryItemFormProps) {
  const { formRef, onSubmit, state, pending, errors, values } = useBookingActionForm(
    item ? updateItineraryItemAction : createItineraryItemAction,
    { resetOnSuccess: !item },
  );
  const initialKind = item?.kind ?? "flight";
  // The schedule labels follow the kind: "Sale/Llega" for a flight, "Entrada/Salida" for a hotel…
  const [kind, setKind] = useState<ItineraryKind>(initialKind);
  const tripItem = item ? item.bookingId === null : "tripId" in owner;
  const prefix = item ? `item-${item.id}` : "item-new";

  const text = (name: TextField) => values?.[name] ?? item?.[name] ?? "";
  const edge = (side: "start" | "end", field: EdgeField) => {
    const name = `${side}${field}` as const;
    return values?.[name] ?? item?.[name] ?? "";
  };

  function scheduleFields(side: "start" | "end") {
    const label = SCHEDULE_EDGE_LABELS[kind][side];
    return (
      <fieldset className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
        <legend className="mb-3 font-medium">{label}</legend>
        {(["Date", "Time", "TimeZone"] as const).map((field) => {
          const name = `${side}${field}` as const;
          const id = `${prefix}-${name}`;
          const error = errors?.[name]?.[0];
          const hint = field === "TimeZone" ? ZONE_HINT : undefined;
          const fieldLabel = { Date: "Fecha", Time: "Hora", TimeZone: "Zona horaria" }[field];
          return (
            <FormField key={name} id={id} label={`${fieldLabel} (${label.toLowerCase()})`} hint={hint} error={error}>
              <Input
                {...fieldControlProps(id, { hint, error })} name={name} defaultValue={edge(side, field)}
                type={{ Date: "date", Time: "time", TimeZone: "text" }[field]}
                {...(field === "TimeZone" && { list: `${prefix}-zones`, maxLength: 64, autoComplete: "off" })}
              />
            </FormField>
          );
        })}
      </fieldset>
    );
  }

  const textError = (name: TextField) => errors?.[name]?.[0];

  return (
    <form
      ref={formRef} noValidate onSubmit={onSubmit} onReset={() => setKind(initialKind)}
      className="flex max-w-3xl flex-col gap-4"
    >
      {owner && "tripId" in owner && <input type="hidden" name="tripId" value={owner.tripId} />}
      {owner && "bookingId" in owner && <input type="hidden" name="bookingId" value={owner.bookingId} />}
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <FormStatus state={state} />
      {tripItem && <p className="text-sm text-muted-foreground">{TRIP_ITEM_HINT}</p>}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 font-medium">{item ? "Datos del hito" : "Añadir hito"}</legend>
        <FormField id={`${prefix}-kind`} label="Tipo" required error={errors?.kind?.[0]}>
          <NativeSelect
            {...fieldControlProps(`${prefix}-kind`, { error: errors?.kind?.[0] })} name="kind" className="w-full"
            value={kind} onChange={(event) => setKind(event.target.value as ItineraryKind)}
          >
            {KINDS.map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id={`${prefix}-status`} label="Estado" required error={errors?.status?.[0]}>
          <NativeSelect
            {...fieldControlProps(`${prefix}-status`, { error: errors?.status?.[0] })} name="status" className="w-full"
            defaultValue={values?.status ?? item?.status ?? "pending"}
          >
            {STATUSES.map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id={`${prefix}-title`} label="Título" required error={textError("title")}>
          <Input
            {...fieldControlProps(`${prefix}-title`, { error: textError("title") })} name="title" required
            maxLength={120} defaultValue={text("title")}
          />
        </FormField>
        <FormField id={`${prefix}-location`} label="Ubicación" error={textError("location")}>
          <Input
            {...fieldControlProps(`${prefix}-location`, { error: textError("location") })} name="location"
            maxLength={160} defaultValue={text("location")}
          />
        </FormField>
        <FormField
          id={`${prefix}-details`} label="Detalles" className="sm:col-span-2" error={textError("details")}
          hint={DETAILS_HINT}
        >
          <Textarea
            {...fieldControlProps(`${prefix}-details`, { hint: DETAILS_HINT, error: textError("details") })}
            name="details" rows={3} maxLength={1000} defaultValue={text("details")}
          />
        </FormField>
        {scheduleFields("start")}
        {scheduleFields("end")}
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="runnerVisible" defaultChecked={item?.runnerVisible ?? true} className="size-4" />
          Visible para el corredor
        </label>
      </fieldset>
      <datalist id={`${prefix}-zones`}>
        {TIME_ZONES.map((zone) => <option key={zone} value={zone} />)}
      </datalist>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : item ? "Guardar cambios" : "Añadir hito"}
        </Button>
        {item && (
          <Link href={itineraryOriginPath(item)} className={buttonVariants({ variant: "outline" })}>Volver</Link>
        )}
      </div>
    </form>
  );
}
