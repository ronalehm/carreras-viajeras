import { claimEvents, claimRequestSchema, handleIntegrationRequest, integrationJson, readJsonBody } from "@/modules/integrations";

// n8n claims a batch of ready events (lease of 5 minutes). Without a body: batch of 10.
export async function POST(request: Request) {
  return handleIntegrationRequest(request, async () => {
    const body = await readJsonBody(request, claimRequestSchema);
    if (!body) return integrationJson({ error: "invalid_request" }, 400);
    return integrationJson({ events: await claimEvents(body.limit) });
  });
}
