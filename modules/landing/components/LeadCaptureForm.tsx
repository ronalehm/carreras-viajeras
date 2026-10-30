"use client";

import type { FormEvent, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { REGISTRATION_CONSENT } from "@/lib/registrationConsent";
import { cn } from "@/lib/utils";
import type { WebLeadFormState } from "@/modules/crm";
import { useLeadCapture, type LeadCaptureAction } from "../hooks/useLeadCapture";
import type { LeadAttributionParams } from "../utils/inquiry";
import { TurnstileWidget } from "./TurnstileWidget";

export type { LeadCaptureAction };
type ErrorCode = Extract<WebLeadFormState, { status: "error" }>["code"];
type FieldName = "name" | "phone" | "email" | "destination" | "consent" | "marketing";

// Fixed: the race comes from the URL (registration page). Select: /contacto chooses it.
export type LeadCaptureDestination =
  | { kind: "fixed"; value: string }
  | { kind: "select"; options: { value: string; label: string }[]; defaultValue: string };

type LeadCaptureFormProps = {
  action: LeadCaptureAction;
  // Which section mounts it (webLeadFormSchema validates it): only chooses the email text.
  form: "registration" | "contact";
  destination: LeadCaptureDestination;
  attribution: LeadAttributionParams;
  standMode: boolean;
  turnstileSiteKey: string | null;
  whatsAppUrl: string | null;
};

// Errors where the person may prefer to write directly: the alternative never carries their data.
const WHATSAPP_FALLBACK_CODES = new Set<ErrorCode>(["unavailable", "verification_failed", "trip_unavailable"]);
const PHONE_HINT = "Incluye el código de país; Perú es +51.";

/** "Escríbenos por WhatsApp" with the fixed text built by the section (no personal data). */
export function WhatsAppLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold underline decoration-highlight decoration-2 underline-offset-[6px]"
    >
      {children} <ArrowUpRight aria-hidden className="size-4" />
    </a>
  );
}

/** Shown instead of the form while the legal text is the P-L placeholder in production. */
export function RegistrationClosedNotice({ whatsAppUrl }: { whatsAppUrl: string | null }) {
  return (
    <div className="flex flex-col items-start gap-3 text-base leading-relaxed">
      <p>El registro en línea abrirá pronto. Mientras tanto, escríbenos por WhatsApp.</p>
      {whatsAppUrl && <WhatsAppLink href={whatsAppUrl}>Escríbenos por WhatsApp</WhatsAppLink>}
    </div>
  );
}

/**
 * Public lead form of the race registration and /contacto. The state lives in useLeadCapture; the
 * server validates everything again (attribution included). Stand mode: no autocomplete and, after
 * a success, a new empty form for the next person.
 */
export function LeadCaptureForm({
  action,
  form,
  destination,
  attribution,
  standMode,
  turnstileSiteKey,
  whatsAppUrl,
}: LeadCaptureFormProps) {
  const { state, pending, formKey, turnstileResetSignal, submit, startOver } = useLeadCapture({ action });
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const autoComplete = (value: string) => (standMode ? "off" : value);
  const fieldClass = cn("border-primary/25 bg-background", standMode ? "h-14 text-lg md:text-lg" : "h-12");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(event.currentTarget);
  }

  // id, name and error wiring shared by every field.
  function fieldProps(name: FieldName, hint?: boolean) {
    const id = `lead-capture-${name}`;
    return {
      id,
      name,
      "aria-invalid": errors?.[name] ? true : undefined,
      "aria-describedby":
        [hint && `${id}-help`, errors?.[name] && `${id}-error`].filter(Boolean).join(" ") || undefined,
    };
  }

  function fieldError(name: FieldName) {
    return (
      errors?.[name] && (
        <p id={`lead-capture-${name}-error`} className="text-sm font-medium text-destructive">
          {errors[name][0]}
        </p>
      )
    );
  }

  function field(name: FieldName, label: string, control: ReactNode, hint?: string) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`lead-capture-${name}`} className={cn("font-semibold", standMode && "text-lg")}>
          {label}
        </Label>
        {control}
        {hint && (
          <p id={`lead-capture-${name}-help`} className="text-sm text-asphalt">
            {hint}
          </p>
        )}
        {fieldError(name)}
      </div>
    );
  }

  // The checkbox sends "on" only when checked; never prechecked.
  function checkboxField(name: FieldName, label: string, required: boolean) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Checkbox {...fieldProps(name)} required={required} className="mt-0.5 size-5" />
          <Label htmlFor={`lead-capture-${name}`} className="text-sm leading-snug font-normal">
            {label}
          </Label>
        </div>
        {fieldError(name)}
      </div>
    );
  }

  const success =
    state.status === "success" &&
    (standMode ? (
      <div className="flex flex-col items-start gap-6">
        <p className="text-2xl font-bold">Registro guardado. ¡Gracias!</p>
        <Button
          type="button"
          autoFocus
          onClick={startOver}
          className="h-14 w-full rounded-full text-lg font-semibold"
        >
          Registrar a otra persona
        </Button>
      </div>
    ) : (
      <p className="text-lg font-semibold">{state.message}</p>
    ));

  return (
    <div>
      {state.status !== "success" && (
        <form
          key={formKey}
          onSubmit={handleSubmit}
          noValidate
          autoComplete={standMode ? "off" : undefined}
          className="flex flex-col gap-5"
        >
          {field(
            "name",
            "Nombre y apellido",
            <Input
              {...fieldProps("name")}
              required
              minLength={2}
              maxLength={80}
              autoComplete={autoComplete("name")}
              className={fieldClass}
            />,
          )}
          {field(
            "phone",
            "WhatsApp con código de país",
            <Input
              {...fieldProps("phone", true)}
              type="tel"
              inputMode="tel"
              required
              maxLength={24}
              defaultValue="+51 "
              autoComplete={autoComplete("tel")}
              className={fieldClass}
            />,
            PHONE_HINT,
          )}
          {field(
            "email",
            "Correo electrónico",
            <Input
              {...fieldProps("email")}
              type="email"
              inputMode="email"
              required
              maxLength={150}
              autoComplete={autoComplete("email")}
              className={fieldClass}
            />,
          )}

          {destination.kind === "fixed" ? (
            <input type="hidden" name="destination" value={destination.value} />
          ) : (
            field(
              "destination",
              "Carrera",
              <NativeSelect
                {...fieldProps("destination")}
                required
                defaultValue={destination.defaultValue}
                autoComplete={standMode ? "off" : undefined}
                className={cn(
                  "w-full [&_select]:border-primary/25 [&_select]:bg-background",
                  standMode ? "[&_select]:h-14 [&_select]:text-lg" : "[&_select]:h-12",
                )}
              >
                <NativeSelectOption value="">Elige la carrera</NativeSelectOption>
                {destination.options.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>,
            )
          )}

          <input type="hidden" name="form" value={form} />

          {Object.entries(attribution).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          {checkboxField("consent", REGISTRATION_CONSENT.privacyText, true)}
          {checkboxField("marketing", REGISTRATION_CONSENT.marketingText, false)}

          {/* Honeypot: people never see or reach it; bots that fill it get a success without saving. */}
          <div aria-hidden className="absolute -left-2500 size-px overflow-hidden">
            <label>
              Sitio web
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>

          {turnstileSiteKey ? (
            <TurnstileWidget siteKey={turnstileSiteKey} action="lead_submit" resetSignal={turnstileResetSignal} />
          ) : (
            process.env.NODE_ENV === "production" && (
              // Without the site key at build time the server rejects every submission: say so instead of failing silently.
              <p role="alert" className="text-sm font-medium text-destructive">
                La verificación antispam no está configurada en este sitio (falta NEXT_PUBLIC_TURNSTILE_SITE_KEY al
                compilar), así que no podremos recibir tus datos. Escríbenos por WhatsApp mientras lo solucionamos.
              </p>
            )
          )}

          <Button
            type="submit"
            disabled={pending}
            className={cn("w-full rounded-full font-semibold", standMode ? "h-14 text-lg" : "h-12 text-base")}
          >
            {pending ? "Enviando…" : "Enviar mis datos"}
          </Button>

          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm">
              <p className="font-medium text-destructive">{state.message}</p>
              {whatsAppUrl && WHATSAPP_FALLBACK_CODES.has(state.code) && (
                <WhatsAppLink href={whatsAppUrl}>Escríbenos por WhatsApp</WhatsAppLink>
              )}
            </div>
          )}
        </form>
      )}

      {/* Present before the answer arrives so screen readers announce the success. */}
      <div role="status">{success}</div>
    </div>
  );
}
