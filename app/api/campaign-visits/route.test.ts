// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordCampaignVisit } = vi.hoisted(() => ({ recordCampaignVisit: vi.fn() }));
// Real schema, simulated service: the route must normalize through campaignVisitSchema.
vi.mock("@/modules/crm", async () => {
  const { campaignVisitSchema } = await import("@/modules/crm/schemas/campaigns.schema");
  return { campaignVisitSchema, recordCampaignVisit };
});
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" }),
}));

import { POST } from "@/app/api/campaign-visits/route";

const ORIGIN = "https://carreras-viajeras.mentec.dev";
const ENDPOINT = `${ORIGIN}/api/campaign-visits`;
const VALID = { slug: "maraton-santiago-2027", c: " MML26 " };

function visitRequest(body: string, headers: Record<string, string> = { origin: ORIGIN }): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function expectEmpty(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.text()).resolves.toBe("");
}

let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  recordCampaignVisit.mockReset();
  recordCampaignVisit.mockResolvedValue(undefined);
  logError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logError.mockRestore();
});

describe("POST /api/campaign-visits", () => {
  it.each([
    ["without Origin", {}],
    ["from another origin", { origin: "https://evil.example" }],
    ["from the origin with a trailing slash", { origin: `${ORIGIN}/` }],
    ["from the opaque null origin", { origin: "null" }],
  ])("returns 403 %s without calling the service", async (_, headers) => {
    await expectEmpty(await POST(visitRequest(JSON.stringify(VALID), headers)), 403);
    expect(recordCampaignVisit).not.toHaveBeenCalled();
  });

  it("returns 403 before reading an oversized body from another origin", async () => {
    const response = await POST(visitRequest("x".repeat(2048), { origin: "https://evil.example" }));
    await expectEmpty(response, 403);
  });

  it("returns 413 when Content-Length declares more than 1 KiB", async () => {
    const response = await POST(
      visitRequest(JSON.stringify(VALID), { origin: ORIGIN, "content-length": "1025" }),
    );
    await expectEmpty(response, 413);
    expect(recordCampaignVisit).not.toHaveBeenCalled();
  });

  it("returns 413 when the body read is larger than 1 KiB", async () => {
    const body = JSON.stringify({ ...VALID, padding: "x".repeat(1024) });
    await expectEmpty(await POST(visitRequest(body)), 413);
    expect(recordCampaignVisit).not.toHaveBeenCalled();
  });

  it("measures the body in bytes, not characters", async () => {
    // 600 characters, 1200 bytes in UTF-8.
    await expectEmpty(await POST(visitRequest(`"${"ñ".repeat(600)}"`)), 413);
    expect(recordCampaignVisit).not.toHaveBeenCalled();
  });

  it("accepts a body of exactly 1 KiB", async () => {
    const body = JSON.stringify(VALID).padEnd(1024, " ");
    await expectEmpty(await POST(visitRequest(body)), 204);
    expect(recordCampaignVisit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["empty", ""],
    ["not JSON", "slug=maraton-santiago-2027&c=mml26"],
    ["truncated JSON", '{"slug":"maraton-santiago-2027",'],
  ])("returns 204 for an invalid JSON body (%s) without calling the service", async (_, body) => {
    await expectEmpty(await POST(visitRequest(body)), 204);
    expect(recordCampaignVisit).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["an array", [VALID]],
    ["an uppercase slug", { ...VALID, slug: "Maraton-Santiago-2027" }],
    ["a slug with --", { ...VALID, slug: "maraton--santiago" }],
    ["an invalid code", { ...VALID, c: "mml 26!" }],
    ["a missing code", { slug: VALID.slug }],
    ["an extra key", { ...VALID, utm_source: "instagram" }],
  ])("returns 204 for %s without calling the service", async (_, value) => {
    await expectEmpty(await POST(visitRequest(JSON.stringify(value))), 204);
    expect(recordCampaignVisit).not.toHaveBeenCalled();
  });

  it("returns 204 and records the visit with the normalized { slug, c }", async () => {
    await expectEmpty(await POST(visitRequest(JSON.stringify(VALID))), 204);
    expect(recordCampaignVisit).toHaveBeenCalledTimes(1);
    expect(recordCampaignVisit).toHaveBeenCalledWith({ slug: "maraton-santiago-2027", c: "mml26" });
    expect(logError).not.toHaveBeenCalled();
  });

  it("returns 204 and logs one fixed message without the cause when the service throws", async () => {
    recordCampaignVisit.mockRejectedValue(new Error("password authentication failed for user app"));

    await expectEmpty(await POST(visitRequest(JSON.stringify(VALID))), 204);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("campaign visit: record failed");
  });
});
