// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(), getTurnstileEnv: vi.fn() }));

import { getEnv, getTurnstileEnv } from "@/lib/env";
import { verifyTurnstileToken } from "./turnstile.service";

const SECRET = "0x4AAAAAAAsyntheticTurnstileSecret";
const TOKEN = "synthetic.turnstile.token";
const IP = "203.0.113.7";
const KEY = "6f9a1c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const fetchMock = vi.fn<typeof fetch>();

function siteverify(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const VALID_RESPONSE = { success: true, action: "lead_submit", hostname: "carreras-viajeras.mentec.dev" };

function sentForm(call = 0): URLSearchParams {
  const init = fetchMock.mock.calls[call][1];
  return new URLSearchParams(String(init?.body));
}

const verify = (overrides: Partial<Parameters<typeof verifyTurnstileToken>[0]> = {}) =>
  verifyTurnstileToken({ token: TOKEN, remoteIp: IP, idempotencyKey: KEY, ...overrides });

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getTurnstileEnv).mockReturnValue({ TURNSTILE_SECRET_KEY: SECRET, isTestSecret: false });
  vi.mocked(getEnv).mockReturnValue({
    DATABASE_URL: "postgresql://app:synthetic@db.example.test/neondb?sslmode=require",
    NEON_AUTH_BASE_URL: "https://auth.example.test/neondb/auth",
    NEON_AUTH_COOKIE_SECRET: "synthetic-random-test-secret-at-least-32",
    APP_ORIGIN: "https://carreras-viajeras.mentec.dev",
  });
  consoleSpies = (["error", "warn", "log", "info"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});

afterEach(() => {
  // Nothing logged ever contains the token, the IP or the secret.
  const logged = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
  for (const secret of [TOKEN, IP, SECRET]) expect(logged).not.toContain(secret);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstileToken", () => {
  it("is valid with success, the lead_submit action and the APP_ORIGIN hostname", async () => {
    fetchMock.mockResolvedValueOnce(siteverify(VALID_RESPONSE));

    await expect(verify()).resolves.toBe("valid");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SITEVERIFY);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(sentForm())).toEqual({
      secret: SECRET,
      response: TOKEN,
      remoteip: IP,
      idempotency_key: KEY,
    });
  });

  it("sends remoteip only when it receives one", async () => {
    fetchMock.mockResolvedValueOnce(siteverify(VALID_RESPONSE));
    await expect(verify({ remoteIp: null })).resolves.toBe("valid");
    expect(sentForm().has("remoteip")).toBe(false);
  });

  it.each([
    ["another hostname", { ...VALID_RESPONSE, hostname: "evil.example.test" }],
    ["another action", { ...VALID_RESPONSE, action: "login" }],
    ["no action or hostname", { success: true }],
    ["success false (timeout-or-duplicate)", { success: false, "error-codes": ["timeout-or-duplicate"] }],
  ])("is invalid with %s, without retrying", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(siteverify(body));
    await expect(verify()).resolves.toBe("invalid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a 5xx with the same idempotency_key", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(siteverify(VALID_RESPONSE));

    await expect(verify()).resolves.toBe("valid");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentForm(0).get("idempotency_key")).toBe(KEY);
    expect(sentForm(1).get("idempotency_key")).toBe(KEY);
  });

  it("retries once after a network error or a timeout", async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"))
      .mockResolvedValueOnce(siteverify(VALID_RESPONSE));

    await expect(verify()).resolves.toBe("valid");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentForm(1).get("idempotency_key")).toBe(KEY);
  });

  it("is unavailable after two failures in a row, with a fixed log", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError(`fetch failed for ${TOKEN} from ${IP}`))
      .mockResolvedValueOnce(new Response("Service unavailable", { status: 503 }));

    await expect(verify()).resolves.toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledExactlyOnceWith("turnstile: verification unavailable");
  });

  it("is unavailable without retrying when the response is not a Siteverify result", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(verify()).resolves.toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is unavailable without calling fetch when the secret is not configured", async () => {
    vi.mocked(getTurnstileEnv).mockReturnValue(null);
    await expect(verify()).resolves.toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("turnstile: verification unavailable");
  });

  it("is unavailable without calling fetch when the secret is invalid (e.g. a test secret in production)", async () => {
    vi.mocked(getTurnstileEnv).mockImplementation(() => {
      throw new Error("Invalid environment fields: TURNSTILE_SECRET_KEY");
    });
    await expect(verify()).resolves.toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["longer than 2048 characters", "t".repeat(2049)],
  ])("is invalid without calling fetch with a token %s", async (_label, token) => {
    await expect(verify({ token })).resolves.toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTurnstileEnv).not.toHaveBeenCalled();
  });

  it("with the development test secret only requires success", async () => {
    vi.mocked(getTurnstileEnv).mockReturnValue({
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      isTestSecret: true,
    });
    fetchMock.mockResolvedValueOnce(siteverify({ success: true, hostname: "example.com", action: "" }));

    await expect(verify()).resolves.toBe("valid");
    expect(getEnv).not.toHaveBeenCalled();
  });

  it("with the test secret still rejects success false", async () => {
    vi.mocked(getTurnstileEnv).mockReturnValue({
      TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA",
      isTestSecret: true,
    });
    fetchMock.mockResolvedValueOnce(siteverify({ success: false, "error-codes": ["invalid-input-response"] }));
    await expect(verify()).resolves.toBe("invalid");
  });
});
