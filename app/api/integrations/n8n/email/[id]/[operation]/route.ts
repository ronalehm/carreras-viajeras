import { revalidatePath } from "next/cache";
import {
  ackClientEmail,
  authorizeClientEmail,
  emailAckSchema,
  emailAttemptSchema,
  emailFailSchema,
  emailOperationSchema,
  eventIdSchema,
  failClientEmail,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/integrations/n8n/email/[id]/[operation]">,
) {
  return handleIntegrationRequest(request, async () => {
    const { id, operation } = await ctx.params;
    if (
      !eventIdSchema.safeParse(id).success ||
      !emailOperationSchema.safeParse(operation).success
    )
      return integrationJson({ error: "invalid_request" }, 400);
    if (operation === "authorize") {
      const body = await readJsonBody(request, emailAttemptSchema);
      if (!body) return integrationJson({ error: "invalid_request" }, 400);
      const result = await authorizeClientEmail(id, body.attemptToken);
      revalidatePath("/crm/leads");
      return integrationJson(
        result,
        result.status === "attempt_conflict" ? 409 : 200,
      );
    }
    const body =
      operation === "ack"
        ? await readJsonBody(request, emailAckSchema)
        : await readJsonBody(request, emailFailSchema);
    if (!body) return integrationJson({ error: "invalid_request" }, 400);
    const result =
      operation === "ack"
        ? await ackClientEmail(
            id,
            body.attemptToken,
            "smtpMessageId" in body ? body.smtpMessageId : undefined,
          )
        : await failClientEmail(
            id,
            body.attemptToken,
            "kind" in body ? body.kind : "smtp_unknown",
          );
    if (!result) return integrationJson({ error: "attempt_conflict" }, 409);
    revalidatePath("/crm/leads");
    revalidatePath(`/crm/leads/${result.leadId}`);
    return integrationJson({ status: result.status });
  });
}
