import { z } from "zod";

// Same values as the lead_* enums in lib/db-schema.ts (kept in sync by leads.schema.test.ts).
export const leadStageSchema = z.enum(["new", "contacted", "quoted", "reserved", "paid", "lost"]);
export const leadSourceSchema = z.enum(["whatsapp", "web_form", "other"]);
export const leadActivityTypeSchema = z.enum([
  "created",
  "stage_changed",
  "owner_changed",
  "archived",
  "note",
  "call",
  "message",
  "automation",
]);

// web_form is reserved for the future automatic capture: the manual form never offers it.
export const manualLeadSourceSchema = z.enum(["whatsapp", "other"], {
  error: "Elige el origen del lead.",
});

const PHONE_MESSAGE = "Escribe el número con código de país, p. ej. +51 938 127 170.";
const CONSENT_MESSAGE = "Confirma que el contacto aceptó que guardemos sus datos.";

const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Optional form inputs arrive as "" when left blank and are missing when the field is not sent:
// both become null (a missing key never yields a zod message in English).
const blankToNull = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() || null)
    .pipe(schema.nullable());

// E.164: drop spaces, parentheses, dashes and dots, then "+" and 8 to 15 digits.
// Shared with the web form schema (same normalization as the manual form).
export const phoneSchema = z
  .string({ error: PHONE_MESSAGE })
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, PHONE_MESSAGE));

const ownerUserIdSchema = z
  .string({ error: "Elige un responsable." })
  .min(1, "Elige un responsable.")
  .max(255, "Elige un responsable.");

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as
// stage, createdBy or consentVersion: they never come from the form.
export const createLeadSchema = z.object({
  fullName: requiredText(2, 120, "El nombre debe tener entre 2 y 120 caracteres."),
  phone: phoneSchema,
  email: blankToNull(
    z
      .string()
      .toLowerCase()
      .pipe(z.email({ error: "Introduce un correo válido." }).max(254, "Introduce un correo válido.")),
  ),
  location: blankToNull(z.string().max(80, "La ciudad o país puede tener hasta 80 caracteres.")),
  tripId: blankToNull(z.uuid({ error: "Elige un viaje del catálogo." })),
  destinationText: blankToNull(z.string().max(120, "El destino puede tener hasta 120 caracteres.")),
  source: manualLeadSourceSchema,
  ownerUserId: ownerUserIdSchema,
  note: blankToNull(z.string().max(2000, "La nota puede tener hasta 2000 caracteres.")),
  consent: z.literal("on", { error: CONSENT_MESSAGE }),
});

// List filters from the URL. Each key falls back to its default on any invalid value,
// including a repeated parameter (an array), so parsing never throws.
export const leadListQuerySchema = z.object({
  etapa: leadStageSchema.optional().catch(undefined),
  responsable: z.string().min(1).max(255).optional().catch(undefined),
  pagina: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(1000))
    .catch(1),
});
