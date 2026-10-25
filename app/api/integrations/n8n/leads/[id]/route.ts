import { getIntegrationLead, handleIntegrationRequest, integrationJson, leadIdSchema } from "@/modules/integrations";

// Minimal lead data for the email to the user and the draft (contract: IntegrationLead).
export async function GET(request: Request, ctx: RouteContext<"/api/integrations/n8n/leads/[id]">) {
  return handleIntegrationRequest(request, async () => {
    const { id } = await ctx.params;
    if (!leadIdSchema.safeParse(id).success) return integrationJson({ error: "invalid_request" }, 400);
    const lead = await getIntegrationLead(id);
    if (!lead) return integrationJson({ error: "not_found" }, 404);
    return integrationJson(lead);
  });
}
