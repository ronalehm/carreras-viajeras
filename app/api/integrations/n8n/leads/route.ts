import {
  createIntegrationLead,
  createIntegrationLeadSchema,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

// n8n registers a Google Forms answer or a row of the one-off import. Responses never repeat the
// submitted data: only the status and the lead id.
export async function POST(request: Request) {
  return handleIntegrationRequest(request, async () => {
    const body = await readJsonBody(request, createIntegrationLeadSchema);
    if (!body) return integrationJson({ error: "invalid_request" }, 400);
    const result = await createIntegrationLead(body);
    switch (result.status) {
      case "created":
        return integrationJson(result, 201);
      case "conflict":
        return integrationJson({ error: "conflict" }, 409);
      case "unknown_trip":
        return integrationJson({ error: "unknown_trip" }, 422);
      default:
        return integrationJson(result);
    }
  });
}
