// Outbox and private automation API for n8n. Server only: the services are server-only.
export {
  ackEvent,
  claimEvents,
  failEvent,
  leadCreatedEventInsert,
} from "./services/automation.service";
export {
  ackRequestSchema,
  claimRequestSchema,
  eventIdSchema,
  failRequestSchema,
} from "./schemas/automation.schema";
export type {
  AckResult,
  ClaimedEvent,
  FailResult,
  LeadCreatedPayload,
} from "./types/automation.types";
