// No server-only: client components import these labels. Type-only imports keep the bundle small.
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type {
  ContactPreference,
  LeadActivityType,
  LeadChannel,
  LeadListItem,
  LeadSource,
  LeadStage,
  LeadTripOption,
} from "../types/leads.types";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// In funnel order (Requirement 1).
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  quoted: "Cotizado",
  reserved: "Reservado",
  paid: "Pagado",
  lost: "Perdido",
};

// Entry path ("Vía de entrada"): how the record entered the CRM.
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  whatsapp: "WhatsApp",
  web_form: "Formulario web",
  google_form: "Google Forms",
  import: "Importación",
  other: "Otro",
};

// Origin ("Origen"): how the person found us, in the order of leadChannelSchema.
export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  event: "Feria, carrera o activación",
  partner: "Club, gimnasio o aliado",
  referral: "Referido",
  whatsapp: "WhatsApp (mensaje directo)",
  whatsapp_status: "Estado de WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_ads: "Google Ads",
  luma: "Luma",
  web: "Web",
  other: "Otro",
  unknown: "Desconocido",
};

export const CONTACT_PREFERENCE_LABELS: Record<ContactPreference, string> = {
  whatsapp: "WhatsApp",
  email: "Correo",
  call: "Llamada",
};

// Origin as shown in the detail: "Etiqueta · detalle", or only the label without detail.
export function leadChannelLabel(channel: LeadChannel, detail: string | null): string {
  const label = LEAD_CHANNEL_LABELS[channel];
  return detail ? `${label} · ${detail}` : label;
}

// Lost reason set when the contact asks not to be followed up.
export const OPT_OUT_LOST_REASON = "Pidió no seguir en contacto.";

export const LEAD_STAGE_BADGE_VARIANTS: Record<LeadStage, BadgeVariant> = {
  new: "secondary",
  contacted: "secondary",
  quoted: "secondary",
  reserved: "secondary",
  paid: "default",
  lost: "outline",
};

// History labels. Stage, owner and origin changes add "A → B" after the label.
export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  created: "Lead creado",
  stage_changed: "Etapa",
  owner_changed: "Responsable",
  archived: "Archivado",
  note: "Nota",
  call: "Llamada",
  message: "Mensaje",
  automation: "Automatización (n8n)",
  channel_changed: "Origen",
  opted_out: "Pidió no seguir",
  re_registered: "Volvió a registrarse",
};

// Authors of the system activities that have none and are not tied to the lead's entry path: n8n
// (automation) and the web form (re_registered, also on a lead created by hand). The created
// activity without an author shows the lead's entry path (LEAD_SOURCE_LABELS), see LeadTimeline.
export const SYSTEM_ACTOR_LABELS = {
  automation: "n8n",
  re_registered: LEAD_SOURCE_LABELS.web_form,
} as const satisfies Partial<Record<LeadActivityType, string>>;

// Closed stages: no next action. Every other stage is open.
export const CLOSED_LEAD_STAGES: readonly LeadStage[] = ["paid", "lost"];

// Owner of a lead without owner (web form): list, filter, detail and history.
export const UNASSIGNED_OWNER_LABEL = "Sin asignar";

// Owner as shown in the list and the detail: "Sin asignar" without owner, "(sin acceso)" when the
// owner lost every role with leads.manage.
export function leadOwnerLabel(owner: LeadListItem["owner"]): string {
  if (!owner) return UNASSIGNED_OWNER_LABEL;
  return owner.active ? owner.email : `${owner.email} (sin acceso)`;
}

const TRIP_STATUS_SUFFIXES: Record<LeadTripOption["status"], string> = {
  draft: " (borrador)",
  published: "",
  archived: " (archivado)",
};

// Catalog trip as shown in the lead form and the detail.
export function leadTripLabel(trip: Pick<LeadTripOption, "title" | "status">): string {
  return `${trip.title}${TRIP_STATUS_SUFFIXES[trip.status]}`;
}

// A cohort month (YYYY-MM) as shown in the report filter and caption: "octubre de 2026". Read in
// UTC so the month never shifts.
const cohortFormat = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" });
export function formatCohort(cohort: string): string {
  return cohortFormat.format(new Date(`${cohort}-01T00:00:00Z`));
}
