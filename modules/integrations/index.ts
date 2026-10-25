// Private API for n8n (server-only): request helper, request schemas and services.
export { handleIntegrationRequest, integrationJson, readJsonBody } from "./utils/integrationRequest";
export {
  ackRequestSchema,
  claimRequestSchema,
  eventIdSchema,
  failRequestSchema,
  leadIdSchema,
} from "./schemas/integrations.schema";
export { ackEvent, claimEvents, failEvent } from "./services/outbox.service";
export { getIntegrationLead } from "./services/integrationLeads.service";
export type { ClaimedEvent, IntegrationLead, OutboxEventType } from "./types/integrations.types";
