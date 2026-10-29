// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getIntegrationEnv: vi.fn(),
  getClientEmailEnv: vi.fn(),
}));
vi.mock("@/modules/integrations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/integrations")>()),
  claimClientEmails: vi.fn(),
  authorizeClientEmail: vi.fn(),
  ackClientEmail: vi.fn(),
  failClientEmail: vi.fn(),
}));
import { getIntegrationEnv } from "@/lib/env";
import {
  ackClientEmail,
  authorizeClientEmail,
  claimClientEmails,
  failClientEmail,
} from "@/modules/integrations";
import { revalidatePath } from "next/cache";
import { POST as claim } from "./claim/route";
import { POST as operation } from "@/app/api/integrations/n8n/email/[id]/[operation]/route";
const token = "synthetic-private-token-for-email-tests-000";
const id = "a0000000-0000-4000-8000-000000000001";
const attemptToken = "b0000000-0000-4000-8000-000000000001";
function request(body: unknown, bearer = token) {
  return new Request("https://crm.example.test/api/integrations/n8n/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
const context = (op: string, messageId = id) => ({
  params: Promise.resolve({ id: messageId, operation: op }),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIntegrationEnv).mockReturnValue({ N8N_API_TOKEN: token });
});
describe("private email endpoints", () => {
  it("requires configured authentication before reading or processing a claim", async () => {
    vi.mocked(getIntegrationEnv).mockReturnValue(null);
    expect((await claim(request({ executionId: "run" }))).status).toBe(503);
    vi.mocked(getIntegrationEnv).mockReturnValue({ N8N_API_TOKEN: token });
    const response = await claim(request({ executionId: "run" }, "wrong"));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(claimClientEmails).not.toHaveBeenCalled();
  });
  it("rejects a client-selected recipient or body and accepts a bounded traced claim", async () => {
    expect(
      (
        await claim(
          request({ executionId: "run", to: "injected@example.test" }),
        )
      ).status,
    ).toBe(400);
    expect(claimClientEmails).not.toHaveBeenCalled();
    vi.mocked(claimClientEmails).mockResolvedValue({
      enabled: true,
      messages: [{ id, attemptToken }],
    });
    const response = await claim(request({ executionId: "run", limit: 1 }));
    expect(response.status).toBe(200);
    expect(claimClientEmails).toHaveBeenCalledWith({
      executionId: "run",
      limit: 1,
    });
  });
  it("validates operation, IDs and attempt token before authorization", async () => {
    expect(
      (await operation(request({ attemptToken }), context("send"))).status,
    ).toBe(400);
    expect(
      (
        await operation(
          request({ attemptToken }),
          context("authorize", "invalid"),
        )
      ).status,
    ).toBe(400);
    expect(authorizeClientEmail).not.toHaveBeenCalled();
    vi.mocked(authorizeClientEmail).mockResolvedValue({
      status: "attempt_conflict",
    });
    expect(
      (await operation(request({ attemptToken }), context("authorize"))).status,
    ).toBe(409);
  });
  it("does not trust submitted lead IDs and invalidates the contact derived from the callback", async () => {
    expect(
      (
        await operation(
          request({ attemptToken, leadId: "tampered" }),
          context("ack"),
        )
      ).status,
    ).toBe(400);
    expect(ackClientEmail).not.toHaveBeenCalled();
    vi.mocked(ackClientEmail).mockResolvedValue({ status: "sent", leadId: id });
    const response = await operation(
      request({ attemptToken, smtpMessageId: "smtp-id" }),
      context("ack"),
    );
    expect(await response.json()).toEqual({ status: "sent" });
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${id}`);
  });
  it("defaults unspecified failures to an uncertain SMTP outcome", async () => {
    vi.mocked(failClientEmail).mockResolvedValue({
      status: "unknown",
      leadId: id,
    });
    expect(
      (await operation(request({ attemptToken }), context("fail"))).status,
    ).toBe(200);
    expect(failClientEmail).toHaveBeenCalledWith(
      id,
      attemptToken,
      "smtp_unknown",
    );
  });
});
