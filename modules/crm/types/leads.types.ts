import type { z } from "zod";
import type { tripStatusEnum } from "@/lib/db-schema";
import type {
  createLeadSchema,
  leadActivityFormSchema,
  leadActivityTypeSchema,
  leadOwnerChangeSchema,
  leadSourceChangeSchema,
  leadSourceSchema,
  leadStageChangeSchema,
  leadStageSchema,
  nextActionSchema,
  updateLeadSchema,
} from "../schemas/leads.schema";

export type LeadStage = z.infer<typeof leadStageSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type CreateLeadInput = z.output<typeof createLeadSchema>;
export type UpdateLeadInput = z.output<typeof updateLeadSchema>;
export type LeadStageChangeInput = z.output<typeof leadStageChangeSchema>;
export type LeadOwnerChangeInput = z.output<typeof leadOwnerChangeSchema>;
// changeLeadSource input: the validated form plus the session user. source admits every value
// (web_form included): a web_form lead keeps its source and only its detail changes.
export type LeadSourceChangeInput = Omit<z.output<typeof leadSourceChangeSchema>, "source"> & {
  source: LeadSource;
  actorUserId: string;
};
export type LeadActivityType = z.infer<typeof leadActivityTypeSchema>;
export type LeadActivityInput = z.output<typeof leadActivityFormSchema>;
export type NextActionInput = z.output<typeof nextActionSchema>;

// stage: a lead stage (non-archived leads in it) or "archived" (archived leads only, any stage).
// owner: "mine" is the session user, "unassigned" the leads without owner;
// any other value is a staff user id. followUp: open leads with a next action before today
// ("overdue") or up to today ("pending"). source: leads with that source only.
export type LeadListFilters = {
  stage?: LeadStage | "archived";
  owner?: "mine" | "unassigned" | string;
  followUp?: "overdue" | "pending";
  source?: LeadSource;
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
  sourceDetail: string | null;
  trip: { id: string; title: string } | null;
  destinationText: string | null;
  // null: unassigned (web form leads). active = false: the owner lost every role with
  // leads.manage ("(sin acceso)").
  owner: { userId: string; email: string; active: boolean } | null;
  // Calendar date (YYYY-MM-DD) and optional note; only open, non-archived leads have one.
  nextActionDate: string | null;
  nextActionNote: string | null;
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
  archivedAt: Date | null;
  archivedBy: { email: string } | null;
};

// History entry. actor is null only for system activities: created of a web form lead and
// automation (n8n). ownerFrom is null when the first owner is assigned (web form lead).
// sourceFrom/sourceTo are set only on source_changed.
export type LeadActivity = {
  id: string;
  type: LeadActivityType;
  body: string | null;
  stageFrom: LeadStage | null;
  stageTo: LeadStage | null;
  sourceFrom: LeadSource | null;
  sourceTo: LeadSource | null;
  ownerFrom: { email: string } | null;
  ownerTo: { email: string } | null;
  actor: { email: string } | null;
  createdAt: Date;
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
        | "no_change"
        | "closed";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
