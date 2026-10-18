import type { z } from "zod";
import type { tripStatusEnum } from "@/lib/db-schema";
import type {
  createLeadSchema,
  leadOwnerChangeSchema,
  leadSourceSchema,
  leadStageChangeSchema,
  leadStageSchema,
  updateLeadSchema,
} from "../schemas/leads.schema";

export type LeadStage = z.infer<typeof leadStageSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type CreateLeadInput = z.output<typeof createLeadSchema>;
export type UpdateLeadInput = z.output<typeof updateLeadSchema>;
export type LeadStageChangeInput = z.output<typeof leadStageChangeSchema>;
export type LeadOwnerChangeInput = z.output<typeof leadOwnerChangeSchema>;

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

// Lead detail page. createdBy is null for web form leads (no author); archivedBy is null while
// the lead is not archived.
export type LeadDetail = Omit<LeadListItem, "trip"> & {
  email: string | null;
  location: string | null;
  lostReason: string | null;
  trip: { id: string; title: string; status: LeadTripOption["status"] } | null;
  consentVersion: string;
  consentedAt: Date;
  createdBy: { email: string } | null;
  createdAt: Date;
  nextActionDate: string | null;
  nextActionNote: string | null;
  archivedAt: Date | null;
  archivedBy: { email: string } | null;
};

// Compatible with useActionState. values only echoes the action's known form fields, to restore
// the same user's form; messages never repeat what was typed.
export type LeadActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code:
        | "unauthorized"
        | "forbidden"
        | "invalid_input"
        | "invalid_owner"
        | "invalid_trip"
        | "not_found"
        | "no_change";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
