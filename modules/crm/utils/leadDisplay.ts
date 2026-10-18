// No server-only: client components import these labels. Type-only imports keep the bundle small.
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { LeadSource, LeadStage } from "../types/leads.types";

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

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  whatsapp: "WhatsApp",
  web_form: "Formulario web",
  other: "Otro",
};

export const LEAD_STAGE_BADGE_VARIANTS: Record<LeadStage, BadgeVariant> = {
  new: "secondary",
  contacted: "secondary",
  quoted: "secondary",
  reserved: "secondary",
  paid: "default",
  lost: "outline",
};

// Closed stages: no next action. Every other stage is open.
export const CLOSED_LEAD_STAGES: readonly LeadStage[] = ["paid", "lost"];
