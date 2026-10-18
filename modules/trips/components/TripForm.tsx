"use client";

import { startTransition, useActionState, type FormEvent, type HTMLInputTypeAttribute } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTripAction, updateTripAction } from "../actions/trips.actions";
import type { Trip, TripActionState, TripInput } from "../types/trips.types";

type TripField = {
  name: keyof TripInput;
  label: string;
  type?: HTMLInputTypeAttribute;
  rows?: number;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};

const FIELDS: TripField[] = [
  { name: "title", label: "Título", required: true, maxLength: 120 },
  { name: "slug", label: "Identificador", required: true, maxLength: 80,
    hint: "Minúsculas, números y guiones. Ejemplo: maraton-santiago-2027." },
  { name: "city", label: "Ciudad", required: true, maxLength: 80 },
  { name: "country", label: "País", required: true, maxLength: 80 },
  { name: "raceDate", label: "Fecha de la carrera", type: "date", required: true },
  { name: "startDate", label: "Inicio del viaje", type: "date" },
  { name: "endDate", label: "Fin del viaje", type: "date" },
  { name: "distances", label: "Distancias", required: true, hint: "Separadas por comas. Ejemplo: 42K, 21K, 10K." },
  { name: "summary", label: "Resumen", rows: 3, required: true, maxLength: 300, hint: "Entre 10 y 300 caracteres." },
  { name: "includes", label: "Qué incluye", rows: 5, hint: "Un elemento por línea, hasta 20 elementos." },
  { name: "priceUsd", label: "Precio desde (USD)", type: "number", min: 0, max: 1_000_000,
    hint: "Sin decimales. Déjalo vacío para mostrar «Precio a consultar»." },
  { name: "capacity", label: "Cupos totales", type: "number", min: 1, max: 10_000,
    hint: "Cantidad informativa; no calcula disponibilidad." },
  { name: "imageUrl", label: "URL de la imagen", type: "url", maxLength: 2048,
    hint: "Enlace externo que empiece por https://." },
];

const INITIAL_STATE: TripActionState = { status: "idle" };

export function TripForm({ trip }: { trip?: Trip }) {
  const [state, formAction, pending] = useActionState(
    trip ? updateTripAction : createTripAction, INITIAL_STATE,
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
      {trip && <input type="hidden" name="id" value={trip.id} />}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos del viaje</legend>
        {FIELDS.map(({ name, label, hint, rows, type = "text", ...constraints }) => {
          const id = `trip-${name}`;
          const locked = name === "slug" && !!trip && trip.status !== "draft";
          const help = locked ? "Solo se puede cambiar en borrador." : hint;
          const original = trip?.[name];
          const initial = Array.isArray(original)
            ? original.join(name === "includes" ? "\n" : ", ") : String(original ?? "");
          const props = {
            id, name, defaultValue: values?.[name] ?? initial, ...constraints,
            "aria-invalid": errors?.[name] ? true : undefined,
            "aria-describedby": [help && `${id}-help`, errors?.[name] && `${id}-error`]
              .filter(Boolean).join(" ") || undefined,
          };
          return (
            <div key={name} className={cn("flex flex-col gap-2", (rows || name === "imageUrl") && "sm:col-span-2")}>
              <Label htmlFor={id}>{label}{constraints.required ? " *" : ""}</Label>
              {rows ? <Textarea {...props} rows={rows} />
                : <Input {...props} type={type} step={type === "number" ? 1 : undefined} readOnly={locked} />}
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
          {pending ? "Guardando…" : trip ? "Guardar cambios" : "Crear viaje"}
        </Button>
        <Link href="/crm/viajes" className={buttonVariants({ variant: "outline" })}>Volver a viajes</Link>
      </div>
    </form>
  );
}
