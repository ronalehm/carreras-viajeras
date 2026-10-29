import {
  claimClientEmails,
  emailClaimSchema,
  handleIntegrationRequest,
  integrationJson,
  readJsonBody,
} from "@/modules/integrations";

export async function POST(request: Request) {
  return handleIntegrationRequest(request, async () => {
    const body = await readJsonBody(request, emailClaimSchema);
    if (!body) return integrationJson({ error: "invalid_request" }, 400);
    return integrationJson(await claimClientEmails(body));
  });
}
