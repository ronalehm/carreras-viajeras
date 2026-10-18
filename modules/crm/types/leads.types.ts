import type { z } from "zod";
import type { tripStatusEnum } from "@/lib/db-schema";
import type { createLeadSchema, leadSourceSchema, leadStageSchema } from "../schemas/leads.schema";

export type LeadStage = z.infer<typeof leadStageSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type CreateLeadInput = z.output<typeof createLeadSchema>;

// owner: "mine" is the session user, "unassigned" the leads without owner;
// any other value is a staff user id.
export type LeadListFilters = {
  stage?: LeadStage;
  owner?: "mine" | "unassigned" | string;
  page: number;
};

export type LeadOwnerOption = { userId: string; email: string };

export type LeadTripOption = {
  id: string;
  title: string;
  status: (typeof tripStatusEnum.enumValues)[number];
};

export type LeadListItem = {
  id: string;
  fullName: string;
  phone: string;
  stage: LeadStage;
  source: LeadSource;
  trip: { id: string; title: string } | null;
  destinationText: string | null;
  // null: unassigned (web form leads). active = false: the owner lost every role with
  // leads.manage ("(sin acceso)").
  owner: { userId: string; email: string; active: boolean } | null;
};

export type LeadList = {
  leads: LeadListItem[];
  hasNextPage: boolean;
  stageCounts: Record<LeadStage, number>;
  ownerOptions: LeadOwnerOption[];
};
