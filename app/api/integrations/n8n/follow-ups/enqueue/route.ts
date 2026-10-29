import { getTodayDate } from "@/lib/dates";
import {
  enqueueFollowUps,
  enqueueRequestSchema,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

// n8n calls it once a day: queues at most one reminder per stage episode for open leads whose next
// action is due today (America/Lima, computed here) or overdue. Without a body: up to 20.
export async function POST(request: Request) {
  return handleIntegrationRequest(request, async () => {
    const body = await readJsonBody(request, enqueueRequestSchema);
    if (!body) return integrationJson({ error: "invalid_request" }, 400);
    return integrationJson({ enqueued: await enqueueFollowUps(getTodayDate(), body.limit) });
  });
}
