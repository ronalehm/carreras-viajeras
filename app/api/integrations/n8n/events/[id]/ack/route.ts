import {
  ackEvent,
  ackRequestSchema,
  eventIdSchema,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

// n8n confirms a processed event with its current lease token.
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/n8n/events/[id]/ack">) {
  return handleIntegrationRequest(request, async () => {
    const { id } = await ctx.params;
    const body = await readJsonBody(request, ackRequestSchema);
    if (!eventIdSchema.safeParse(id).success || !body) {
      return integrationJson({ error: "invalid_request" }, 400);
    }
    const result = await ackEvent(id, body.leaseToken);
    if (result === "lease_lost") return integrationJson({ error: "lease_lost" }, 409);
    return integrationJson({ status: "succeeded" });
  });
}
