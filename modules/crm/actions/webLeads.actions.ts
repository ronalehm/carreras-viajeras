"use server";

import { headers } from "next/headers";
import type { z } from "zod";
import { webLeadFormSchema } from "../schemas/webLeads.schema";
import { verifyTurnstileToken } from "../services/turnstile.service";
import { createWebLead } from "../services/webLeads.service";
import type { WebLeadField, WebLeadFormState } from "../types/webLeads.types";

type WebLeadErrorCode = Extract<WebLeadFormState, { status: "error" }>["code"];

const MAX_INPUT_BYTES = 16 * 1024;
const HONEYPOT_FIELD = "website";
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

type FieldErrors = Partial<Record<WebLeadField, string[]>>;

const VISIBLE_FIELDS = new Set<string>(["name", "email", "phone", "destination", "consent"] satisfies WebLeadField[]);

function failure(code: WebLeadErrorCode, fieldErrors?: FieldErrors): WebLeadFormState {
  return { status: "error", code, message: ERROR_MESSAGES[code], ...(fieldErrors && { fieldErrors }) };
}

// Text fields only and at most 16 KiB in total (keys and values, UTF-8). Any file is rejected.
function withinLimits(formData: FormData): boolean {
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const [key, value] of formData) {
    if (typeof value !== "string") return false;
    bytes += encoder.encode(key).length + encoder.encode(value).length;
    if (bytes > MAX_INPUT_BYTES) return false;
  }
  return true;
}

// Messages of the visible fields only: they are fixed Spanish texts and never repeat what was typed.
function toFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    if (VISIBLE_FIELDS.has(field)) (result[field as WebLeadField] ??= []).push(issue.message);
  }
  return result;
}

// Public action of the landing contact form (no session). Order: size and types → honeypot →
// schema → Turnstile → createWebLead. Responses never echo the input. No revalidatePath: the CRM
// pages are dynamic.
export async function submitWebLeadAction(
  _prev: WebLeadFormState,
  formData: FormData,
): Promise<WebLeadFormState> {
  if (!withinLimits(formData)) return failure("invalid_input");

  // Bots fill the hidden field: they get the success message and nothing is verified or saved.
  const honeypot = formData.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot !== "") return SUCCESS;

  const parsed = webLeadFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", toFieldErrors(parsed.error));
  const { turnstileToken, ...submission } = parsed.data;

  try {
    const verification = await verifyTurnstileToken({
      token: turnstileToken,
      remoteIp: (await headers()).get("cf-connecting-ip"),
      idempotencyKey: submission.submissionId,
    });
    if (verification === "invalid") return failure("verification_failed");
    if (verification === "unavailable") return failure("unavailable");

    const result = await createWebLead(submission);
    return result === "conflict" ? failure("conflict") : SUCCESS;
  } catch {
    // Fixed text only: Drizzle/Neon errors carry the statement and its parameters (personal data).
    console.error("web lead: capture failed");
    return failure("unavailable");
  }
}
