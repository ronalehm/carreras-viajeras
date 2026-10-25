// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The public API of @/modules/trips also exports CRM components and actions (Neon Auth, next/headers):
// expose only the schema the automation schemas reuse.
vi.mock("@/modules/trips", async () => ({
  tripSlugSchema: (await import("@/modules/trips/schemas/trips.schema")).tripSlugSchema,
}));

import { ackRequestSchema, claimRequestSchema } from "../schemas/automation.schema";
import {
  automationResponse,
  handleAutomationRequest,
  isAuthorizedAutomationRequest,
} from "./automationAuth";

const TOKEN = "a".repeat(40);

function requestWith(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("Authorization", authorization);
  return new Request("https://example.test/api/automation/events/claim", { method: "POST", headers });
}

// Rule: the scheme must be exactly "Bearer" (case-sensitive) followed by one space and a non-empty value.
describe("isAuthorizedAutomationRequest", () => {
  it("accepts a matching bearer token", async () => {
    await expect(isAuthorizedAutomationRequest(requestWith(`Bearer ${TOKEN}`), TOKEN)).resolves.toBe(true);
  });

  it("rejects a different value of the same length", async () => {
    const other = `${"a".repeat(39)}b`;
    await expect(isAuthorizedAutomationRequest(requestWith(`Bearer ${other}`), TOKEN)).resolves.toBe(false);
  });

  it.each([TOKEN.slice(0, -1), `${TOKEN}a`])("rejects a value of different length", async (value) => {
    await expect(isAuthorizedAutomationRequest(requestWith(`Bearer ${value}`), TOKEN)).resolves.toBe(false);
  });

  it.each([`Basic ${TOKEN}`, `bearer ${TOKEN}`, `BEARER ${TOKEN}`, `Bearer  ${TOKEN}`, TOKEN])(
    "rejects a different scheme or format: %s",
    async (authorization) => {
      await expect(isAuthorizedAutomationRequest(requestWith(authorization), TOKEN)).resolves.toBe(false);
    },
  );

  it("rejects a missing Authorization header", async () => {
    await expect(isAuthorizedAutomationRequest(requestWith(), TOKEN)).resolves.toBe(false);
  });

  it.each(["Bearer ", "Bearer"])("rejects an empty bearer value: %j", async (authorization) => {
    await expect(isAuthorizedAutomationRequest(requestWith(authorization), TOKEN)).resolves.toBe(false);
  });
});

const EVENT_ID = "0b6f1f0e-4a8e-4f53-9d2c-8f4a1c2d3e4f";
const LEASE_TOKEN = "5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function postWith(body?: BodyInit, authorization: string | null = `Bearer ${TOKEN}`): Request {
  const headers = new Headers();
  if (authorization !== null) headers.set("Authorization", authorization);
  return new Request("https://example.test/api/automation/events/claim", { method: "POST", headers, body });
}

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

describe("automationResponse", () => {
  it("returns JSON with no-store and the given status", async () => {
    await expectResponse(automationResponse({ error: "lease_conflict" }, 409), 409, { error: "lease_conflict" });
    await expectResponse(automationResponse({ status: "dead" }), 200, { status: "dead" });
  });
});

describe("handleAutomationRequest", () => {
  const handle = vi.fn(async (body: unknown) => automationResponse({ received: body }));
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.stubEnv("AUTOMATION_API_TOKEN", TOKEN);
    handle.mockClear();
    consoleError.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "short"])("returns 503 without naming the variable when the secret is %s", async (value) => {
    vi.stubEnv("AUTOMATION_API_TOKEN", value);
    const response = await handleAutomationRequest(postWith("{}"), { schema: claimRequestSchema }, handle);
    const text = await response.clone().text();
    await expectResponse(response, 503, { error: "unavailable" });
    expect(text).not.toContain("AUTOMATION_API_TOKEN");
    expect(consoleError).toHaveBeenCalledWith("Automation API unavailable: secret not configured");
    expect(handle).not.toHaveBeenCalled();
  });

  it.each([null, `Bearer ${"b".repeat(40)}`])("returns 401 for a missing or wrong bearer: %s", async (authorization) => {
    const response = await handleAutomationRequest(
      postWith("{}", authorization),
      { schema: ackRequestSchema, eventId: "not-a-uuid" },
      handle,
    );
    await expectResponse(response, 401, { error: "unauthorized" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("returns 404 for an event id that is not a UUID, before reading the body", async () => {
    const response = await handleAutomationRequest(
      postWith("x".repeat(5000)),
      { schema: ackRequestSchema, eventId: "123" },
      handle,
    );
    await expectResponse(response, 404, { error: "not_found" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("passes a valid event id and body to the handler", async () => {
    const response = await handleAutomationRequest(
      postWith(JSON.stringify({ leaseToken: LEASE_TOKEN })),
      { schema: ackRequestSchema, eventId: EVENT_ID },
      handle,
    );
    await expectResponse(response, 200, { received: { leaseToken: LEASE_TOKEN } });
  });

  it("returns 413 for a body over 4096 bytes, counting bytes and not characters", async () => {
    // 2049 two-byte characters: 4098 bytes plus quotes, under 4096 characters.
    const response = await handleAutomationRequest(
      postWith(JSON.stringify("ñ".repeat(2049))),
      { schema: claimRequestSchema },
      handle,
    );
    await expectResponse(response, 413, { error: "payload_too_large" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("accepts a body of exactly 4096 bytes", async () => {
    const json = JSON.stringify({ limit: 5 });
    const body = json + " ".repeat(4096 - json.length);
    const response = await handleAutomationRequest(postWith(body), { schema: claimRequestSchema }, handle);
    await expectResponse(response, 200, { received: { limit: 5 } });
  });

  it.each(["{", "not json", JSON.stringify({ limit: 26 }), JSON.stringify({ limit: 5, extra: true })])(
    "returns 400 for invalid JSON or an invalid body: %s",
    async (body) => {
      const response = await handleAutomationRequest(postWith(body), { schema: claimRequestSchema }, handle);
      await expectResponse(response, 400, { error: "invalid_request" });
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, ""])("treats an empty body as {}: %j", async (body) => {
    const claim = await handleAutomationRequest(postWith(body), { schema: claimRequestSchema }, handle);
    await expectResponse(claim, 200, { received: { limit: 10 } });

    const ack = await handleAutomationRequest(
      postWith(body),
      { schema: ackRequestSchema, eventId: EVENT_ID },
      handle,
    );
    await expectResponse(ack, 400, { error: "invalid_request" });
  });

  it("returns 503 with a fixed log when the handler throws, without the original error", async () => {
    const failing = vi.fn(async () => {
      throw new Error("relation automation_events SELECT secret-detail");
    });
    const response = await handleAutomationRequest(postWith("{}"), { schema: claimRequestSchema }, failing);
    const text = await response.clone().text();
    await expectResponse(response, 503, { error: "unavailable" });
    expect(text).not.toContain("secret-detail");
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("Automation API unavailable: unexpected error");
  });
});
