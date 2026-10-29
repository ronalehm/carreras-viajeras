import { getEnv } from "@/lib/env";
import { campaignVisitSchema, recordCampaignVisit } from "@/modules/crm";

const MAX_BODY_BYTES = 1024;

function emptyResponse(status: 204 | 403 | 413): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

// Public visit beacon of /viajes/<slug>/registro?c=<code>. No session, cookies or request logs.
// Always 204 once the origin and size pass, so it never reveals whether a campaign code exists.
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== getEnv().APP_ORIGIN) return emptyResponse(403);

  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return emptyResponse(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return emptyResponse(413);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return emptyResponse(204);
  }
  const result = campaignVisitSchema.safeParse(value);
  if (!result.success) return emptyResponse(204);

  try {
    await recordCampaignVisit(result.data);
  } catch {
    // Fixed text: never the cause or the request data.
    console.error("campaign visit: record failed");
  }
  return emptyResponse(204);
}
