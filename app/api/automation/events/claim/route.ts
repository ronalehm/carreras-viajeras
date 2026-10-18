import {
  automationResponse,
  claimEvents,
  claimRequestSchema,
  handleAutomationRequest,
} from "@/modules/automation";

// Private API for n8n: claims up to `limit` events with a lease.
export async function POST(request: Request) {
  return handleAutomationRequest(request, { schema: claimRequestSchema }, async ({ limit }) =>
    automationResponse({ events: await claimEvents(limit) }),
  );
}
