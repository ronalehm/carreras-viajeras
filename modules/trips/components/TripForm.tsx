"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTripAction, updateTripAction } from "../actions/trips.actions";
import type { Trip, TripActionState, TripInput } from "../types/trips.types";

type FieldName = keyof TripInput;
type FormValues = Record<FieldName, string>;

const INITIAL_STATE: TripActionState = { status: "idle" };

// Values shown in the inputs: lists joined as typed, numbers as text, null as "".
function toFormValues(trip?: Trip): FormValues {
  return {
    title: trip?.title ?? "",
    slug: trip?.slug ?? "",
    city: trip?.city ?? "",
    country: trip?.country ?? "",
    raceDate: trip?.raceDate ?? "",
    startDate: trip?.startDate ?? "",
    endDate: trip?.endDate ?? "",
    distances: trip?.distances.join(", ") ?? "",
    summary: trip?.summary ?? "",
    includes: trip?.includes.join("\n") ?? "",
    priceUsd: trip?.priceUsd?.toString() ?? "",
    capacity: trip?.capacity?.toString() ?? "",
    imageUrl: trip?.imageUrl ?? "",
  };
}

type TripFormProps = {
  trip?: Trip;
};

export function TripForm({ trip }: TripFormProps) {
  const [state, formAction, pending] = useActionState(
    trip ? updateTripAction : createTripAction,
    INITIAL_STATE,
  );

  // Submitting through onSubmit avoids React's automatic reset of <form action={…}>,
  // so everything typed stays in the inputs after an error. Success redirects to the list.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const error = state.status === "error" ? state : null;
  const values = error?.values ? { ...toFormValues(trip), ...error.values } : toFormValues(trip);
  const slugLocked = trip !== undefined && trip.status !== "draft";

  // Shared props of every control: id, name, initial value and its error wiring.
  function control(name: FieldName, hint?: boolean) {
    const invalid = Boolean(error?.fieldErrors?.[name]);
    const describedBy = [hint && `trip-${name}-hint`, invalid && `trip-${name}-error`]
      .filter(Boolean)
      .join(" ");
    return {
      id: `trip-${name}`,
      name,
      defaultValue: values[name],
      "aria-invalid": invalid || undefined,
      "aria-describedby": describedBy || undefined,
    };
  }

  function field(name: FieldName, label: string, input: ReactNode, hint?: string) {
    const message = error?.fieldErrors?.[name]?.[0];
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`trip-${name}`}>{label}</Label>
        {input}
        {hint && (
          <p id={`trip-${name}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
        {message && (
          <p id={`trip-${name}-error`} role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}

      {trip && <input type="hidden" name="id" value={trip.id} />}

      {field("title", "Título", <Input {...control("title")} />)}
      {field(
        "slug",
        "Identificador",
        <Input
          {...control("slug", slugLocked)}
          readOnly={slugLocked}
          placeholder="maraton-santiago-2027"
          autoComplete="off"
        />,
        slugLocked ? "Solo se puede cambiar en borrador." : undefined,
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field("city", "Ciudad", <Input {...control("city")} />)}
        {field("country", "País", <Input {...control("country")} />)}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {field("raceDate", "Fecha de la carrera", <Input type="date" {...control("raceDate")} />)}
        {field("startDate", "Inicio del viaje", <Input type="date" {...control("startDate")} />)}
        {field("endDate", "Fin del viaje", <Input type="date" {...control("endDate")} />)}
      </div>

      {field(
        "distances",
        "Distancias",
        <Input {...control("distances", true)} placeholder="42K, 21K, 10K" />,
        "Separadas por comas.",
      )}
      {field("summary", "Resumen", <Textarea {...control("summary")} />)}
      {field("includes", "Qué incluye", <Textarea {...control("includes", true)} />, "Uno por línea.")}

      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "priceUsd",
          "Precio desde (USD)",
          <Input type="number" min={0} step={1} inputMode="numeric" {...control("priceUsd")} />,
        )}
        {field(
          "capacity",
          "Cupos totales",
          <Input type="number" min={1} step={1} inputMode="numeric" {...control("capacity")} />,
        )}
      </div>

      {field("imageUrl", "URL de la imagen", <Input type="url" {...control("imageUrl")} />)}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : trip ? "Guardar cambios" : "Crear viaje"}
      </Button>
    </form>
  );
}
