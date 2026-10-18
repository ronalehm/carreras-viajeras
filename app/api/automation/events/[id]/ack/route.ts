import {
  ackEvent,
  ackRequestSchema,
  automationResponse,
  handleAutomationRequest,
} from "@/modules/automation";

// Private API for n8n: confirms an event with its current lease token.
export async function POST(request: Request, ctx: RouteContext<"/api/automation/events/[id]/ack">) {
  const { id } = await ctx.params;
  return handleAutomationRequest(request, { schema: ackRequestSchema, eventId: id }, async ({ leaseToken }) => {
    const result = await ackEvent(id, leaseToken);
    return result === "ok"
      ? automationResponse({ status: "succeeded" })
      : automationResponse({ error: "lease_conflict" }, 409);
  });
}
