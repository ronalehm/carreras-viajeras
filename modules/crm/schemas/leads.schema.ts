import { z } from "zod";

// Same values as the lead_* enums in lib/db-schema.ts (kept in sync by leads.schema.test.ts).
export const leadStageSchema = z.enum(["new", "contacted", "quoted", "reserved", "paid", "lost"]);
// The UI order of forms, filters and lists (Requirement 1); the database enum only has the same set.
export const leadSourceSchema = z.enum([
  "event",
  "partner",
  "referral",
  "whatsapp",
  "whatsapp_status",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "google_ads",
  "luma",
  "web_form",
  "other",
  "unknown",
]);
export const leadActivityTypeSchema = z.enum([
  "created",
  "stage_changed",
  "owner_changed",
  "archived",
  "note",
  "call",
  "message",
  "automation",
  "source_changed",
]);

// web_form is assigned only by the automatic capture: the manual form never offers or accepts it.
export const manualLeadSourceSchema = leadSourceSchema.exclude(["web_form"], {
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

const SOURCE_DETAIL_LENGTH = "El detalle debe tener entre 2 y 120 caracteres.";

// Event, partner, campaign or piece name: optional, trimmed, blank = null. Shared by the manual
// form and the source change.
export const sourceDetailSchema = blankToNull(
  z.string().min(2, SOURCE_DETAIL_LENGTH).max(120, SOURCE_DETAIL_LENGTH),
);

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
  sourceDetail: sourceDetailSchema,
  ownerUserId: ownerUserIdSchema,
  note: blankToNull(z.string().max(2000, "La nota puede tener hasta 2000 caracteres.")),
  consent: z.literal("on", { error: CONSENT_MESSAGE }),
});

const leadUuidSchema = z.uuid({ error: "El lead no es válido." });

// Contact data edit: the contact fields of the manual form plus the lead id. Source, owner,
// note and consent are not editable; any other key (stage, actorUserId…) is dropped.
export const updateLeadSchema = createLeadSchema
  .pick({
    fullName: true,
    phone: true,
    email: true,
    location: true,
    tripId: true,
    destinationText: true,
  })
  .extend({ leadId: leadUuidSchema });

// Actions on the lead as a whole (archive): only its id; any other submitted key is dropped.
export const leadIdSchema = z.object({ leadId: leadUuidSchema });

const LOST_REASON_REQUIRED = "Indica el motivo de la pérdida.";
const LOST_REASON_LENGTH = "El motivo debe tener entre 3 y 200 caracteres.";

// The lost reason only applies to "lost": it is required there and forced to null elsewhere
// (leaving "lost" clears it).
export const leadStageChangeSchema = z
  .object({
    leadId: leadUuidSchema,
    stage: z.enum(leadStageSchema.options, { error: "Elige una etapa." }),
    lostReason: z
      .string()
      .optional()
      .transform((value) => value?.trim() || null),
  })
  .transform(({ leadId, stage, lostReason }, ctx) => {
    if (stage !== "lost") return { leadId, stage, lostReason: null };
    if (!lostReason || lostReason.length < 3 || lostReason.length > 200) {
      ctx.addIssue({
        code: "custom",
        path: ["lostReason"],
        message: lostReason ? LOST_REASON_LENGTH : LOST_REASON_REQUIRED,
      });
      return z.NEVER;
    }
    return { leadId, stage, lostReason };
  });

// The CRM never leaves a lead without owner: an owner id is always required.
export const leadOwnerChangeSchema = z.object({
  leadId: leadUuidSchema,
  ownerUserId: ownerUserIdSchema,
});

// Source change from the lead detail: any of the 14 sources (web_form included, so a web_form lead
// can edit its detail) and its detail. The web_form <-> manual rule lives in the service
// ("source_locked"). Any other key (actorUserId, stage…) is dropped: the author is always the session user.
export const leadSourceChangeSchema = z.object({
  leadId: leadUuidSchema,
  source: z.enum(leadSourceSchema.options, { error: "Elige el origen del lead." }),
  sourceDetail: sourceDetailSchema,
});

const ACTIVITY_BODY_REQUIRED = "Escribe el texto del seguimiento.";
const ACTIVITY_BODY_LENGTH = "El texto puede tener hasta 2000 caracteres.";

// Manual follow-up only: system types (created, stage_changed, owner_changed, archived and the
// n8n automation) are never accepted from the form. The author is always the session user.
export const leadActivityFormSchema = z.object({
  leadId: leadUuidSchema,
  type: z.enum(["note", "call", "message"], { error: "Elige el tipo de seguimiento." }),
  body: z
    .string({ error: ACTIVITY_BODY_REQUIRED })
    .trim()
    .min(1, ACTIVITY_BODY_REQUIRED)
    .max(2000, ACTIVITY_BODY_LENGTH),
});

const NEXT_ACTION_DATE_REQUIRED = "Indica la fecha.";

// Next action: a calendar date (YYYY-MM-DD, no time) and an optional note. Both blank clear it;
// a note always needs a date.
export const nextActionSchema = z
  .object({
    leadId: leadUuidSchema,
    nextActionDate: blankToNull(z.iso.date({ error: "Indica una fecha válida." })),
    nextActionNote: blankToNull(z.string().max(200, "La nota puede tener hasta 200 caracteres.")),
  })
  .refine((value) => value.nextActionNote === null || value.nextActionDate !== null, {
    path: ["nextActionDate"],
    message: NEXT_ACTION_DATE_REQUIRED,
  });

// URL values of the follow-up filter (overdue, pending).
export const followUpParamSchema = z.enum(["vencidos", "pendientes"]);

// URL values of the stage filter: each lead stage plus "archivados" (archived leads only).
const stageParamSchema = z.enum([...leadStageSchema.options, "archivados"]);

// List filters from the URL. Each key falls back to its default on any invalid value,
// including a repeated parameter (an array), so parsing never throws.
export const leadListQuerySchema = z.object({
  etapa: stageParamSchema.optional().catch(undefined),
  responsable: z.string().min(1).max(255).optional().catch(undefined),
  seguimiento: followUpParamSchema.optional().catch(undefined),
  origen: leadSourceSchema.optional().catch(undefined),
  pagina: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(1000))
    .catch(1),
});
