import { z } from "zod";
import { phoneSchema } from "@/lib/phone";

// Shared E.164 phone schema (lib/phone.ts), re-exported for the CRM forms (manual and web).
export { phoneSchema };

// Same values as the lead_* enums in lib/db-schema.ts (kept in sync by leads.schema.test.ts).
export const leadStageSchema = z.enum(["new", "contacted", "quoted", "reserved", "paid", "lost"]);
// Entry path (source): how the record entered the CRM. Never edited.
export const leadSourceSchema = z.enum(["whatsapp", "web_form", "other", "google_form", "import"]);
// Origin (channel): how the person found us, in the order of forms, filters and tables.
export const leadChannelSchema = z.enum(
  [
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
    "web",
    "other",
    "unknown",
  ],
  { error: "Elige el origen del lead." },
);
export const contactPreferenceSchema = z.enum(["whatsapp", "email", "call"]);
export const leadActivityTypeSchema = z.enum([
  "created",
  "stage_changed",
  "owner_changed",
  "archived",
  "note",
  "call",
  "message",
  "automation",
  "channel_changed",
  "opted_out",
  "re_registered",
]);

// web_form, google_form and import are system entry paths (web capture and n8n): the manual form
// never offers them.
export const manualLeadSourceSchema = z.enum(["whatsapp", "other"], {
  error: "Elige la vía de entrada del lead.",
});

const CONSENT_MESSAGE = "Confirma que el contacto aceptó que guardemos sus datos.";

const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Optional form inputs arrive as "" when left blank and are missing when the field is not sent:
// both become null (a missing key never yields a zod message in English). Exported for the web
// capture schemas.
export const blankToNull = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() || null)
    .pipe(schema.nullable());

const ownerUserIdSchema = z
  .string({ error: "Elige un responsable." })
  .min(1, "Elige un responsable.")
  .max(255, "Elige un responsable.");

const ORIGIN_DETAIL_MESSAGE = "El detalle del origen debe tener entre 2 y 120 caracteres.";
const REFERRED_BY_MESSAGE = "El referente debe tener entre 2 y 120 caracteres.";

// Origin fields shared by the manual form and the edit. channel has no default: the form starts
// on "Elige el origen" so WhatsApp is never recorded by inertia. The checkbox sends "on" only
// when checked.
const leadOriginFields = {
  channel: leadChannelSchema,
  originDetail: blankToNull(z.string().min(2, ORIGIN_DETAIL_MESSAGE).max(120, ORIGIN_DETAIL_MESSAGE)),
  referredBy: blankToNull(z.string().min(2, REFERRED_BY_MESSAGE).max(120, REFERRED_BY_MESSAGE)),
  referralPermission: z
    .string()
    .optional()
    .transform((value) => value === "on"),
  contactPreference: blankToNull(
    z.enum(contactPreferenceSchema.options, { error: "Elige una preferencia de contacto." }),
  ),
};

// The referral permission needs a referrer (same rule as leads_referral_permission_chk).
function refineReferral(
  value: { referralPermission: boolean; referredBy: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.referralPermission && !value.referredBy) {
    ctx.addIssue({ code: "custom", path: ["referredBy"], message: "Indica quién lo refirió." });
  }
}

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as
// stage, createdBy, consentVersion, the UTM fields or contactOptOutAt: they never come from the
// form. Unrefined base: .pick() does not accept objects with refinements.
const createLeadBaseSchema = z.object({
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
  ...leadOriginFields,
});

export const createLeadSchema = createLeadBaseSchema.superRefine(refineReferral);

const leadUuidSchema = z.uuid({ error: "El lead no es válido." });

// Contact and origin edit: the contact and origin fields of the manual form plus the lead id.
// Source, owner, note, consent and the UTM fields are not editable; any other key (stage,
// actorUserId…) is dropped.
export const updateLeadSchema = createLeadBaseSchema
  .pick({
    fullName: true,
    phone: true,
    email: true,
    location: true,
    tripId: true,
    destinationText: true,
    channel: true,
    originDetail: true,
    referredBy: true,
    referralPermission: true,
    contactPreference: true,
  })
  .extend({ leadId: leadUuidSchema })
  .superRefine(refineReferral);

// Actions on the lead as a whole (archive): only its id; any other submitted key is dropped.
export const leadIdSchema = z.object({ leadId: leadUuidSchema });
export const leadEmailRetrySchema = z.object({ messageId: z.uuid({ error: "El mensaje no es válido." }) });

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
  vista: z.literal("lista").optional().catch(undefined),
  etapa: stageParamSchema.optional().catch(undefined),
  responsable: z.string().min(1).max(255).optional().catch(undefined),
  seguimiento: followUpParamSchema.optional().catch(undefined),
  origen: leadChannelSchema.optional().catch(undefined),
  pagina: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(1000))
    .catch(1),
});

// Report filters from the URL of /crm (origin × stage counts of one cohort). Each key is dropped on
// any invalid value, including a repeated parameter, so parsing never throws. cohorte is a lead
// signup month (YYYY-MM, America/Lima); without it the page uses the current month. Imported leads
// are excluded unless importados=solo, which shows them alone (never mixed with new capture).
export const leadReportQuerySchema = z
  .object({
    cohorte: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .catch(undefined),
    viaje: z.uuid().optional().catch(undefined),
    importados: z.literal("solo").optional().catch(undefined),
  })
  .transform(({ cohorte, viaje, importados }) => ({
    cohort: cohorte,
    tripId: viaje,
    onlyImported: importados === "solo",
  }));
