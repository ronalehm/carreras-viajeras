import type { z } from "zod";
import type { tripStatusEnum } from "@/lib/db-schema";
import type {
  contactPreferenceSchema,
  createLeadSchema,
  leadActivityFormSchema,
  leadActivityTypeSchema,
  leadChannelSchema,
  leadOwnerChangeSchema,
  leadSourceSchema,
  leadStageChangeSchema,
  leadStageSchema,
  nextActionSchema,
  updateLeadSchema,
} from "../schemas/leads.schema";

export type LeadStage = z.infer<typeof leadStageSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadChannel = z.infer<typeof leadChannelSchema>;
export type ContactPreference = z.infer<typeof contactPreferenceSchema>;
export type CreateLeadInput = z.output<typeof createLeadSchema>;
export type UpdateLeadInput = z.output<typeof updateLeadSchema>;
export type LeadStageChangeInput = z.output<typeof leadStageChangeSchema>;
export type LeadOwnerChangeInput = z.output<typeof leadOwnerChangeSchema>;
export type LeadActivityType = z.infer<typeof leadActivityTypeSchema>;
export type LeadActivityInput = z.output<typeof leadActivityFormSchema>;
export type NextActionInput = z.output<typeof nextActionSchema>;

// stage: a lead stage (non-archived leads in it) or "archived" (archived leads only, any stage).
// owner: "mine" is the session user, "unassigned" the leads without owner;
// any other value is a staff user id. followUp: open leads with a next action before today
// ("overdue") or up to today ("pending"). channel: the lead origin (list and funnel counts).
export type LeadListFilters = {
  stage?: LeadStage | "archived";
  owner?: "mine" | "unassigned" | string;
  followUp?: "overdue" | "pending";
  channel?: LeadChannel;
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
  channel: LeadChannel;
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

// Lead detail page. createdBy is null for system leads (web form, Google Forms, import: no
// author); archivedBy is null while the lead is not archived. The UTM fields are only written by
// the web capture; contactOptOutAt is set when the contact asked not to be followed up.
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
  originDetail: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referredBy: string | null;
  referralPermission: boolean;
  contactPreference: ContactPreference | null;
  contactOptOutAt: Date | null;
};

// Origin × stage report of /crm. cohort: signup month (YYYY-MM, America/Lima). Imported leads are
// either excluded (default) or shown alone; archived leads never count.
export type LeadReportFilters = { cohort: string; tripId?: string; onlyImported: boolean };

// Counts of the current stage of the cohort's leads: no rates, no mixed bases.
export type LeadReportRow = {
  channel: LeadChannel;
  total: number;
  stages: Record<LeadStage, number>;
  optedOut: number;
  unassigned: number;
};

// rows: one per origin with leads, in leadChannelSchema order; totals: their sum. cohorts: the
// months with leads, newest first (always including cohort); tripOptions: the non-archived trips.
export type LeadReport = {
  cohort: string;
  rows: LeadReportRow[];
  totals: Omit<LeadReportRow, "channel">;
  cohorts: string[];
  tripOptions: LeadTripOption[];
};

// History entry. actor is null only for system activities: created of a system lead (web form,
// Google Forms, import) and automation (n8n). ownerFrom is null when the first owner is assigned
// (system lead). channelFrom and channelTo are only set on channel_changed.
export type LeadActivity = {
  id: string;
  type: LeadActivityType;
  body: string | null;
  stageFrom: LeadStage | null;
  stageTo: LeadStage | null;
  ownerFrom: { email: string } | null;
  ownerTo: { email: string } | null;
  channelFrom: LeadChannel | null;
  channelTo: LeadChannel | null;
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
        | "closed"
        | "opted_out";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
