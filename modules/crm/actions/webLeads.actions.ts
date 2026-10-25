"use server";

import { headers } from "next/headers";
import type { z } from "zod";
import { webLeadFormSchema } from "../schemas/webLeads.schema";
import { verifyTurnstileToken } from "../services/turnstile.service";
import { createWebLead } from "../services/webLeads.service";
import type { WebLeadFormState } from "../types/webLeads.types";

type WebLeadErrorCode = Extract<WebLeadFormState, { status: "error" }>["code"];
type WebLeadFieldErrors = NonNullable<Extract<WebLeadFormState, { status: "error" }>["fieldErrors"]>;

const MAX_INPUT_BYTES = 16 * 1024;
const FORM_FIELDS: readonly (keyof WebLeadFieldErrors)[] = ["name", "email", "phone", "destination", "consent"];

const SUCCESS: WebLeadFormState = {
  status: "success",
  message: "¡Listo! Recibimos tu consulta. Te escribiremos por WhatsApp.",
};

const ERROR_MESSAGES: Record<WebLeadErrorCode, string> = {
  invalid_input: "Revisa los datos del formulario.",
  verification_failed: "No pudimos verificar el envío. Inténtalo de nuevo.",
  conflict: "Ya recibimos una consulta desde este formulario. Recarga la página para enviar otra.",
  unavailable: "No pudimos enviar tu consulta en este momento. Puedes escribirnos por WhatsApp.",
};

function failure(code: WebLeadErrorCode, fieldErrors?: WebLeadFieldErrors): WebLeadFormState {
  return {
    status: "error",
    code,
    message: ERROR_MESSAGES[code],
    ...(fieldErrors && Object.keys(fieldErrors).length > 0 && { fieldErrors }),
  };
}

// Strings only (no files) and at most 16 KiB in total, keys included.
function isWithinLimits(formData: FormData): boolean {
  const encoder = new TextEncoder();
  let size = 0;
  for (const [key, value] of formData) {
    if (typeof value !== "string") return false;
    size += encoder.encode(key).byteLength + encoder.encode(value).byteLength;
    if (size > MAX_INPUT_BYTES) return false;
  }
  return true;
}

// Only the visible form fields; the schema messages are fixed Spanish texts that never repeat
// what was typed.
function toFieldErrors(error: z.ZodError): WebLeadFieldErrors {
  const result: WebLeadFieldErrors = {};
  for (const issue of error.issues) {
    const field = FORM_FIELDS.find((name) => name === issue.path[0]);
    if (field) (result[field] ??= []).push(issue.message);
  }
  return result;
}

// Public action of the landing form (no session). Order: size and types → honeypot → schema →
// Turnstile → one atomic write. The response never echoes the input, and neither the original
// error, the token, the IP nor any personal data is returned or logged.
export async function submitWebLeadAction(
  _prev: WebLeadFormState,
  formData: FormData,
): Promise<WebLeadFormState> {
  if (!isWithinLimits(formData)) return failure("invalid_input");

  // Honeypot hidden from people and screen readers: a bot that fills it gets a success.
  const website = formData.get("website");
  if (typeof website === "string" && website.length > 0) return SUCCESS;

  const parsed = webLeadFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", toFieldErrors(parsed.error));
  const { turnstileToken, ...lead } = parsed.data;

  try {
    const verification = await verifyTurnstileToken({
      token: turnstileToken,
      remoteIp: (await headers()).get("cf-connecting-ip"),
      idempotencyKey: lead.submissionId,
    });
    if (verification === "invalid") return failure("verification_failed");
    if (verification === "unavailable") return failure("unavailable");

    const result = await createWebLead(lead);
    return result === "conflict" ? failure("conflict") : SUCCESS;
  } catch {
    console.error("web lead: capture failed");
    return failure("unavailable");
  }
}
