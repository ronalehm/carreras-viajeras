// No server-only: client components import these labels. Type-only imports keep the bundle small.
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type {
  LeadActivityType,
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

// In the order of leadSourceSchema (Requirement 1).
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
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
  web_form: "Formulario web",
  other: "Otro",
  unknown: "Desconocido",
};

export const LEAD_STAGE_BADGE_VARIANTS: Record<LeadStage, BadgeVariant> = {
  new: "secondary",
  contacted: "secondary",
  quoted: "secondary",
  reserved: "secondary",
  paid: "default",
  lost: "outline",
};

// History labels. Stage, owner and source changes add "A → B" after the label.
export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  created: "Lead creado",
  stage_changed: "Etapa",
  owner_changed: "Responsable",
  archived: "Archivado",
  note: "Nota",
  call: "Llamada",
  message: "Mensaje",
  automation: "Automatización (n8n)",
  source_changed: "Cambió el origen",
};

// Author of the activities without one: the web form (created) and n8n (automation).
export const SYSTEM_ACTOR_LABELS = {
  created: "Formulario web",
  automation: "n8n",
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

// Source as shown in the detail: "Label · detail", or the label alone without a detail.
export function leadSourceLabel(source: LeadSource, detail: string | null): string {
  const label = LEAD_SOURCE_LABELS[source];
  return detail ? `${label} · ${detail}` : label;
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
