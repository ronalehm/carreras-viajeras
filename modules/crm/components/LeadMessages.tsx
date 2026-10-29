"use client";

import { useActionState } from "react";
import { Check, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { retryLeadEmailAction } from "../actions/leads.actions";
import type {
  LeadActionState,
  LeadEmail,
  LeadMessagesData,
} from "../types/leads.types";
import { LEAD_STAGE_LABELS } from "../utils/leadDisplay";
import {
  LEAD_EMAIL_STATUS_LABELS,
  leadEmailErrorText,
} from "../utils/leadGuidance";

function RetryEmail({ id, canRetry }: { id: string; canRetry: boolean }) {
  const [state, action, pending] = useActionState(retryLeadEmailAction, {
    status: "idle",
  } as LeadActionState);
  // Keep this component mounted across revalidation so its result can be announced even
  // after the successful retry changes the message to Pending and removes the button.
  if (!canRetry && state.status === "idle" && !pending) return null;
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="messageId" value={id} />
      {canRetry && (
        <Button
          variant="outline"
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl"
        >
          {pending ? "Programando…" : "Reintentar correo"}
        </Button>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-primary">
          {state.message}
        </p>
      )}
    </form>
  );
}
function Message({ message }: { message: LeadEmail }) {
  const warning = message.status === "failed" || message.status === "unknown";
  const Icon = warning
    ? TriangleAlert
    : message.status === "sent"
      ? Check
      : Mail;
  const errorText = leadEmailErrorText(message.lastErrorCode);
  return (
    <li className="min-w-0 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Correo · {LEAD_STAGE_LABELS[message.stage]}
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            warning
              ? "bg-destructive/8 text-destructive"
              : "bg-primary/7 text-primary",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {LEAD_EMAIL_STATUS_LABELS[message.status]}
        </span>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        Registrado{" "}
        <time dateTime={message.createdAt.toISOString()}>
          {formatDateTime(message.createdAt)}
        </time>
        {message.sentAt && (
          <>
            {" "}
            · Aceptado por SMTP{" "}
            <time dateTime={message.sentAt.toISOString()}>
              {formatDateTime(message.sentAt)}
            </time>
          </>
        )}
      </p>
      <p className="mt-1 text-sm break-all">
        Para: {message.recipient ?? "Sin correo válido"}
      </p>
      {errorText && (
        <p
          className={cn(
            "mt-3 text-sm leading-6",
            warning ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {errorText}
        </p>
      )}
      {message.executionId && (
        <p className="mt-2 text-xs break-all text-muted-foreground">
          Ejecución de n8n: {message.executionId}
        </p>
      )}
      <details className="mt-4 rounded-xl border border-border/60">
        <summary className="cursor-pointer rounded-xl p-3 text-sm font-medium">
          Ver contenido del correo
        </summary>
        <div className="space-y-3 border-t p-4">
          <p className="text-xs break-all text-muted-foreground">
            De: {message.sender} · Plantilla v{message.templateVersion}
          </p>
          <p className="text-sm font-semibold break-words">{message.subject}</p>
          <p className="text-sm leading-7 break-words whitespace-pre-line">
            {message.body}
          </p>
        </div>
      </details>
      <RetryEmail id={message.id} canRetry={message.canRetry} />
    </li>
  );
}
export function LeadMessages({ data }: { data: LeadMessagesData }) {
  return (
    <section aria-label="Correos del contacto" className="min-w-0 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Mail aria-hidden="true" className="size-5 text-primary" />
          Correos del contacto
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Historial por etapa. «Enviado» significa que SMTP aceptó el mensaje;
          esta conexión no confirma la entrega al destinatario.
        </p>
      </div>
      {data.automation !== "enabled" && (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          {data.automation === "invalid"
            ? "Revisa la configuración de correo de la aplicación. Los envíos no están disponibles."
            : "Los correos automáticos están desactivados. El historial se conserva."}
        </p>
      )}
      {data.messages.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          No hay correos registrados para este contacto. Los eventos históricos
          anteriores a la activación no generan envíos.
        </p>
      ) : (
        <ol className="grid min-w-0 gap-4 lg:grid-cols-2">
          {data.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </ol>
      )}
    </section>
  );
}
