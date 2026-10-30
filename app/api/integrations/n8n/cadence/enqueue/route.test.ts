// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getIntegrationEnv: vi.fn(),
  getClientEmailEnv: vi.fn(),
}));
vi.mock("@/modules/integrations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/integrations")>()),
  enqueueCadence: vi.fn(),
}));
import { getIntegrationEnv } from "@/lib/env";
import { enqueueCadence } from "@/modules/integrations";
import { POST } from "./route";

const token = "synthetic-private-token-for-cadence-tests-0";
function request(body?: unknown, bearer = token) {
  return new Request("https://crm.example.test/api/integrations/n8n/cadence/enqueue", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIntegrationEnv).mockReturnValue({ N8N_API_TOKEN: token });
  vi.mocked(enqueueCadence).mockResolvedValue({ enqueued: 3 });
});

describe("POST /api/integrations/n8n/cadence/enqueue", () => {
  it("requires the configured Bearer token before queuing anything", async () => {
    vi.mocked(getIntegrationEnv).mockReturnValue(null);
    expect((await POST(request())).status).toBe(503);
    vi.mocked(getIntegrationEnv).mockReturnValue({ N8N_API_TOKEN: token });
    const response = await POST(request(undefined, "wrong"));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(enqueueCadence).not.toHaveBeenCalled();
  });

  it("queues up to 20 episodes without a body and answers the count, not cached", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ enqueued: 3 });
    expect(enqueueCadence).toHaveBeenCalledWith(expect.any(Date), 20);
  });

  it("accepts a limit between 1 and 50 and rejects anything else", async () => {
    expect((await POST(request({ limit: 50 }))).status).toBe(200);
    expect(enqueueCadence).toHaveBeenLastCalledWith(expect.any(Date), 50);
    vi.mocked(enqueueCadence).mockClear();
    for (const body of [{ limit: 0 }, { limit: 51 }, { limit: 2.5 }, { limit: "5" }]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(enqueueCadence).not.toHaveBeenCalled();
  });

  it("hides internal errors behind a fixed 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(enqueueCadence).mockRejectedValue(new Error("database detail"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
  });
});
