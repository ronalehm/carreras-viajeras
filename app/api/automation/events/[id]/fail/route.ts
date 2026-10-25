import {
  automationResponse,
  failEvent,
  failRequestSchema,
  handleAutomationRequest,
} from "@/modules/automation";

// Private API for n8n: reports a failed attempt; the event is retried with backoff or dead-lettered.
export async function POST(request: Request, ctx: RouteContext<"/api/automation/events/[id]/fail">) {
  const { id } = await ctx.params;
  return handleAutomationRequest(
    request,
    { schema: failRequestSchema, eventId: id },
    async ({ leaseToken, errorCode }) => {
      const result = await failEvent(id, leaseToken, errorCode);
      if (result.status === "retry") return automationResponse({ status: "pending", retryAt: result.retryAt });
      if (result.status === "dead") return automationResponse({ status: "dead" });
      return automationResponse({ error: "lease_conflict" }, 409);
    },
  );
}
