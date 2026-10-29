import {
  eventIdSchema,
  failEvent,
  failRequestSchema,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

// n8n reports a failed event with a short error code: retried later (backoff) or dead after 8 attempts.
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/n8n/events/[id]/fail">) {
  return handleIntegrationRequest(request, async () => {
    const { id } = await ctx.params;
    const body = await readJsonBody(request, failRequestSchema);
    if (!eventIdSchema.safeParse(id).success || !body) {
      return integrationJson({ error: "invalid_request" }, 400);
    }
    const result = await failEvent(id, body.leaseToken, body.errorCode);
    if (result === "lease_lost") return integrationJson({ error: "lease_lost" }, 409);
    return integrationJson(result);
  });
}
