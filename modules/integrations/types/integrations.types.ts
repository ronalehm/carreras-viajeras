import type { z } from "zod";
import type {
  clientEmailKindEnum,
  contactPreferenceEnum,
  leadChannelEnum,
  leadSourceEnum,
  leadStageEnum,
  outboxEventTypeEnum,
} from "@/lib/db-schema";
import type { createIntegrationLeadSchema } from "../schemas/integrations.schema";

type LeadStage = (typeof leadStageEnum.enumValues)[number];
type LeadSource = (typeof leadSourceEnum.enumValues)[number];
type LeadChannel = (typeof leadChannelEnum.enumValues)[number];
type ContactPreference = (typeof contactPreferenceEnum.enumValues)[number];

export type OutboxEventType = (typeof outboxEventTypeEnum.enumValues)[number];
export type ClientEmailKind = (typeof clientEmailKindEnum.enumValues)[number];

// Fixed codes stored in client_emails.last_error_code when a message is skipped (client_emails_error_chk:
// ^[a-z0-9_]{1,40}$). ineligible: generic result of the recheck just before SMTP.
export type ClientEmailSkipReason =
  | "opted_out"
  | "archived"
  | "bulk_import"
  | "obsolete_event"
  | "missing_email"
  | "missing_team_address"
  | "owner_changed"
  | "ineligible";

// Only open sales stages get an automatic reminder (decision P2): from reserved on, follow-up is personal.
export type FollowUpStage = Extract<LeadStage, "new" | "contacted" | "quoted">;

// Payload version 1: minimal, never personal data.
export type OutboxEventPayload =
  | { source: LeadSource; bulk?: boolean; form?: "registration" | "contact" } // lead.created (bulk: one-off import, from F3; form: web form that captured it)
  | { stageFrom: LeadStage; stageTo: LeadStage; trigger?: "booking" } // lead.stage_changed (trigger: confirmed booking, from F5)
  | { stage: FollowUpStage; dueOn: string } // lead.follow_up_due (dueOn: YYYY-MM-DD next action date)
  | { stageFrom: LeadStage } // lead.opted_out (stage before the opt-out)
  | Record<string, never>; // lead.owner_assigned (the owner is read from the lead, never the payload)

// Contract of POST /api/integrations/n8n/events/claim.
export type ClaimedEvent = {
  id: string; // event_id: n8n deduplicates on it
  type: OutboxEventType;
  leadId: string;
  payloadVersion: number;
  payload: OutboxEventPayload;
  attempts: number; // 1–8, includes this claim
  leaseToken: string;
  leaseUntil: string; // ISO 8601
  createdAt: string;
};

export type FailEventResult = { status: "pending"; availableAt: Date } | { status: "dead" } | "lease_lost";

// Contract of GET /api/integrations/n8n/leads/{id}: only what n8n needs for the email to the user
// and the draft. firstName is the only name that may be sent to Gemini.
export type IntegrationLead = {
  id: string;
  fullName: string;
  firstName: string;
  email: string | null;
  phone: string;
  stage: LeadStage;
  source: LeadSource;
  trip: { slug: string; title: string } | null;
  destinationText: string | null;
  owner: { email: string } | null;
  archived: boolean;
  createdAt: string;
  channel: LeadChannel; // never sent to Gemini
  originDetail: string | null; // never sent to Gemini
  contactPreference: ContactPreference | null;
  nextActionDate: string | null; // YYYY-MM-DD
  doNotContact: boolean; // true: the lead opted out, discard any draft
};

// Validated body of POST /api/integrations/n8n/leads.
export type CreateIntegrationLeadInput = z.infer<typeof createIntegrationLeadSchema>;

// duplicate: same key and data (leadId null when a concurrent request won the key); existing: a
// lead with the same phone (not archived, or archived with opt-out) already exists.
export type CreateIntegrationLeadResult =
  | { status: "created"; leadId: string }
  | { status: "duplicate"; leadId: string | null }
  | { status: "existing"; leadId: string }
  | { status: "conflict" }
  | { status: "unknown_trip" };
