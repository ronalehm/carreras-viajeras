import {
  enqueueCadence,
  enqueueRequestSchema,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

// n8n calls it every hour: queues the due steps of the sales cadence (crm-sales-cadence.md) inside
// the Lima sending window, at most one per stage episode and day. Without a body: up to 20 episodes.
export async function POST(request: Request) {
  return handleIntegrationRequest(request, async () => {
    const body = await readJsonBody(request, enqueueRequestSchema);
    if (!body) return integrationJson({ error: "invalid_request" }, 400);
    return integrationJson(await enqueueCadence(new Date(), body.limit));
  });
}
