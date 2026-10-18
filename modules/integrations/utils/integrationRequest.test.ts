// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { handleIntegrationRequest, integrationJson, readJsonBody, tokensMatch } from "./integrationRequest";

const TOKEN = "t".repeat(40);
const URL = "https://carreras-viajeras.mentec.dev/api/integrations/n8n/events/claim";

function requestWith(headers: Record<string, string> = {}, body?: BodyInit) {
  return new Request(URL, { method: "POST", headers, body });
}

async function expectJson(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  await expect(response.json()).resolves.toEqual(body);
}

describe("tokensMatch", () => {
  it("accepts the same token", async () => {
    await expect(tokensMatch(TOKEN, TOKEN)).resolves.toBe(true);
  });

  it.each([
    ["a different token of the same length", "u".repeat(40)],
    ["a token of a different length", TOKEN.slice(0, 39)],
    ["a longer token", `${TOKEN}x`],
    ["an empty token", ""],
  ])("rejects %s", async (_case, provided) => {
    await expect(tokensMatch(provided, TOKEN)).resolves.toBe(false);
  });
});

describe("integrationJson", () => {
  it("returns JSON with no-store and the given status", async () => {
    await expectJson(integrationJson({ status: "ok" }, 201), 201, { status: "ok" });
    expect(integrationJson({}).status).toBe(200);
  });
});

describe("handleIntegrationRequest", () => {
  const handler = vi.fn(async () => integrationJson({ events: [] }));
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handler.mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("N8N_API_TOKEN", TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    errorSpy.mockRestore();
  });

  it("returns 503 not_configured without a token configured, without calling the handler", async () => {
    vi.stubEnv("N8N_API_TOKEN", "");
    const response = await handleIntegrationRequest(requestWith({ Authorization: `Bearer ${TOKEN}` }), handler);

    await expectJson(response, 503, { error: "not_configured" });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["no Authorization header", {}],
    ["another scheme", { Authorization: `Basic ${TOKEN}` }],
    ["a wrong token", { Authorization: `Bearer ${"x".repeat(40)}` }],
    ["an empty Bearer", { Authorization: "Bearer " }],
  ])("returns 401 with %s, without calling the handler", async (_case, headers) => {
    const response = await handleIntegrationRequest(requestWith(headers), handler);

    await expectJson(response, 401, { error: "unauthorized" });
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler with the right token", async () => {
    const response = await handleIntegrationRequest(requestWith({ Authorization: `Bearer ${TOKEN}` }), handler);

    await expectJson(response, 200, { events: [] });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("forces no-store on the handler response", async () => {
    const response = await handleIntegrationRequest(
      requestWith({ Authorization: `Bearer ${TOKEN}` }),
      async () => Response.json({ ok: true }),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 with a fixed log when the handler throws, without the original message", async () => {
    const failing = vi.fn(async (): Promise<Response> => {
      throw new Error(`relation "outbox_events" does not exist ${TOKEN}`);
    });
    const response = await handleIntegrationRequest(requestWith({ Authorization: `Bearer ${TOKEN}` }), failing);

    await expectJson(response, 500, { error: "internal_error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("integrations: request failed");
  });

  it("returns 500 with a fixed log when the configured token is invalid (too short)", async () => {
    vi.stubEnv("N8N_API_TOKEN", "short");
    const response = await handleIntegrationRequest(requestWith({ Authorization: "Bearer short" }), handler);

    await expectJson(response, 500, { error: "internal_error" });
    expect(errorSpy).toHaveBeenCalledWith("integrations: request failed");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("readJsonBody", () => {
  const schema = z.object({ limit: z.number().default(10) });

  it("parses a valid JSON body", async () => {
    await expect(readJsonBody(requestWith({}, '{"limit":2}'), schema)).resolves.toEqual({ limit: 2 });
  });

  it("reads an empty or missing body as {}", async () => {
    await expect(readJsonBody(requestWith(), schema)).resolves.toEqual({ limit: 10 });
    await expect(readJsonBody(requestWith({}, ""), schema)).resolves.toEqual({ limit: 10 });
  });

  it("accepts a body of exactly 4 KiB", async () => {
    const body = JSON.stringify({ limit: 1, pad: "a".repeat(4096 - 20) });
    expect(new TextEncoder().encode(body).byteLength).toBe(4096);
    await expect(readJsonBody(requestWith({}, body), schema)).resolves.toEqual({ limit: 1 });
  });

  it.each([
    ["larger than 4 KiB", JSON.stringify({ limit: 1, pad: "a".repeat(4096) })],
    ["invalid JSON", "{limit:"],
    ["invalid for the schema", '{"limit":"abc"}'],
  ])("returns null for a body %s", async (_case, body) => {
    await expect(readJsonBody(requestWith({}, body), schema)).resolves.toBeNull();
  });
});
