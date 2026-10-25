import type { leadSourceEnum, leadStageEnum, outboxEventTypeEnum } from "@/lib/db-schema";

type LeadStage = (typeof leadStageEnum.enumValues)[number];
type LeadSource = (typeof leadSourceEnum.enumValues)[number];

export type OutboxEventType = (typeof outboxEventTypeEnum.enumValues)[number];

// Payload version 1: minimal, never personal data.
export type OutboxEventPayload =
  | { source: LeadSource } // lead.created
  | { stageFrom: LeadStage; stageTo: LeadStage }; // lead.stage_changed

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
};
