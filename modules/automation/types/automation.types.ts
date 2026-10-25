import type { z } from "zod";
import type { leadCreatedPayloadSchema } from "../schemas/automation.schema";

export type LeadCreatedPayload = z.output<typeof leadCreatedPayloadSchema>;

// One claimed event, as the private API returns it to n8n.
export type ClaimedEvent = {
  eventId: string; // uuid; n8n deduplicates by it
  type: "lead.created";
  payloadVersion: 1;
  payload: LeadCreatedPayload;
  attempt: number; // 1–8, already incremented by the claim
  occurredAt: string; // ISO 8601 (created_at)
  leaseToken: string; // uuid, valid for this attempt only
  leaseExpiresAt: string; // ISO 8601
};

export type AckResult = "ok" | "conflict";

// retry carries the next available_at (ISO 8601) so the API can return it as retryAt.
export type FailResult =
  | { status: "retry"; retryAt: string }
  | { status: "dead" }
  | { status: "conflict" };
