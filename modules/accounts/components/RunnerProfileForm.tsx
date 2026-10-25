"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveRunnerProfileAction } from "../actions/runnerProfile.actions";
import type {
  ProfileSection,
  RunnerProfile,
  RunnerProfileActionState,
  RunnerProfileInput,
} from "../types/runnerProfile.types";
import {
  DOCUMENT_TYPE_LABELS,
  PROFILE_SECTION_LABELS,
  RACE_DISTANCE_LABELS,
  RUNNER_PROFILE_CONSENT,
  SENSITIVE_DATA_NOTICE,
  SHIRT_SIZE_LABELS,
} from "../utils/runnerProfileDisplay";

type ProfileField = {
  name: keyof RunnerProfileInput;
  label: string;
  type?: "text" | "tel" | "date";
  hint?: string;
  required?: boolean;
  // Single-line inputs only: a textarea counts a newline as 1 but multipart sends CRLF (2),
  // so its length limit is left to the schema.
  maxLength?: number;
  autoComplete?: string;
  // Native date limit set to `today`: "max" (not in the future) or "min" (not expired).
  todayLimit?: "max" | "min";
  options?: Record<string, string>;
  rows?: number;
};

type ProfileGroup = {
  section: ProfileSection;
  fields: ProfileField[];
  // Where the sensitive data notice goes inside the group (wireframe).
  notice?: "start" | "end";
};

const GROUPS: ProfileGroup[] = [
  {
    section: "personal",
    fields: [
      { name: "fullName", label: "Nombre completo", required: true, maxLength: 120, autoComplete: "name" },
      { name: "phone", label: "Teléfono o WhatsApp", type: "tel", required: true, autoComplete: "tel",
        hint: "Con código de país, p. ej. +51 938 127 170." },
      { name: "country", label: "País", maxLength: 80, autoComplete: "country-name" },
      { name: "city", label: "Ciudad", maxLength: 80, autoComplete: "address-level2" },
      { name: "birthDate", label: "Fecha de nacimiento", type: "date", todayLimit: "max", autoComplete: "bday" },
    ],
  },
  {
    section: "document",
    notice: "start",
    fields: [
      { name: "documentType", label: "Tipo", options: DOCUMENT_TYPE_LABELS },
      { name: "documentNumber", label: "Número", autoComplete: "off" },
      { name: "documentExpiresOn", label: "Vencimiento", type: "date", todayLimit: "min" },
    ],
  },
  {
    section: "race",
    fields: [
      { name: "shirtSize", label: "Talla de polo", options: SHIRT_SIZE_LABELS },
      { name: "preferredDistance", label: "Distancia preferida", options: RACE_DISTANCE_LABELS },
      { name: "personalBest", label: "Mejor marca", maxLength: 60, hint: "Ejemplo: 42K en 3:45:10." },
      { name: "club", label: "Club o equipo", maxLength: 80 },
    ],
  },
  {
    section: "emergency",
    notice: "end",
    fields: [
      { name: "emergencyContactName", label: "Nombre", maxLength: 120 },
      { name: "emergencyContactPhone", label: "Teléfono", type: "tel" },
      { name: "medicalNotes", label: "Alergias o condiciones médicas", rows: 3 },
    ],
  },
];

const INITIAL_STATE: RunnerProfileActionState = { status: "idle" };
const CONSENT_ID = "runner-profile-consent";

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages) return null;
  return (
    <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function SensitiveNotice({ id }: { id: string }) {
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {SENSITIVE_DATA_NOTICE}
    </p>
  );
}

type RunnerProfileFormProps = {
  profile: RunnerProfile | null;
  today: string;
};

// The action never returns `values` (Decision 8): submitting through onSubmit + startTransition
// keeps React from resetting the fields, so what was typed stays after an error.
// Consent is asked again on every save (Decision 9): the box is unchecked after each success
// and keeps its state after an error.
export function RunnerProfileForm({ profile, today }: RunnerProfileFormProps) {
  const [state, formAction, pending] = useActionState(saveRunnerProfileAction, INITIAL_STATE);
  const [consented, setConsented] = useState(false);
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setConsented(false);
  }
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-8">
      {GROUPS.map(({ section, fields, notice }) => {
        const noticeId = `runner-profile-${section}-notice`;
        return (
          <fieldset
            key={section}
            disabled={pending}
            aria-describedby={notice ? noticeId : undefined}
            className="flex flex-col gap-4"
          >
            <legend className="mb-4 font-heading text-sm font-bold tracking-[0.2em] uppercase">
              {PROFILE_SECTION_LABELS[section]}
            </legend>
            {notice === "start" && <SensitiveNotice id={noticeId} />}
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map(({ name, label, hint, type = "text", todayLimit, options, rows, ...constraints }) => {
                const id = `runner-profile-${name}`;
                const error = errors?.[name];
                const props = {
                  id,
                  name,
                  defaultValue: profile?.[name] ?? "",
                  ...constraints,
                  "aria-invalid": error ? true : undefined,
                  "aria-describedby": describedBy(hint && `${id}-help`, error && `${id}-error`),
                };
                return (
                  <div key={name} className={cn("flex flex-col gap-2", rows && "sm:col-span-2")}>
                    <Label htmlFor={id}>{label}{constraints.required ? " *" : ""}</Label>
                    {options ? (
                      <NativeSelect {...props} className="w-full">
                        <NativeSelectOption value="">Sin indicar</NativeSelectOption>
                        {Object.entries(options).map(([value, optionLabel]) => (
                          <NativeSelectOption key={value} value={value}>{optionLabel}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : rows ? (
                      <Textarea {...props} rows={rows} />
                    ) : (
                      <Input
                        {...props}
                        type={type}
                        min={todayLimit === "min" ? today : undefined}
                        max={todayLimit === "max" ? today : undefined}
                      />
                    )}
                    {hint && <p id={`${id}-help`} className="text-sm text-muted-foreground">{hint}</p>}
                    <FieldError id={id} messages={error} />
                  </div>
                );
              })}
            </div>
            {notice === "end" && <SensitiveNotice id={noticeId} />}
          </fieldset>
        );
      })}

      <div className="flex flex-col gap-2">
        <label htmlFor={CONSENT_ID} className="flex items-start gap-3 text-sm">
          <input
            id={CONSENT_ID}
            type="checkbox"
            name="consent"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
            disabled={pending}
            aria-invalid={errors?.consent ? true : undefined}
            aria-describedby={describedBy(errors?.consent && `${CONSENT_ID}-error`)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>{RUNNER_PROFILE_CONSENT.text}</span>
        </label>
        <FieldError id={CONSENT_ID} messages={errors?.consent} />
      </div>

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}
      {state.status === "success" && (
        <Alert role="status">
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar perfil"}
        </Button>
        <Link href="/cuenta" className={buttonVariants({ variant: "outline" })}>
          Volver a mi cuenta
        </Link>
      </div>
    </form>
  );
}
