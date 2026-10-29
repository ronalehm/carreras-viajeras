import {
  activityRequestSchema,
  handleIntegrationRequest,
  integrationJson,
  leadIdSchema,
  readJsonBody,
  recordAutomationActivity,
} from "@/modules/integrations";

// n8n records in the lead's history what it did with an event (idempotent per eventId).
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/n8n/leads/[id]/activities">) {
  return handleIntegrationRequest(request, async () => {
    const { id } = await ctx.params;
    const body = await readJsonBody(request, activityRequestSchema);
    if (!leadIdSchema.safeParse(id).success || !body) {
      return integrationJson({ error: "invalid_request" }, 400);
    }
    const result = await recordAutomationActivity(id, body.eventId, body.body);
    if (result === "not_found") return integrationJson({ error: "not_found" }, 404);
    return integrationJson({ status: result }, result === "recorded" ? 201 : 200);
  });
}
