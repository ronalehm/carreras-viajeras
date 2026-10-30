// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(), getTurnstileEnv: vi.fn() }));

import { getEnv, getTurnstileEnv } from "@/lib/env";
import { verifyTurnstileToken } from "./turnstile.service";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SECRET = "0x4AAAAAAAreal-secret-value-for-tests";
const TOKEN = "token-abc.123";
const IP = "203.0.113.7";
const KEY = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const INPUT = { token: TOKEN, remoteIp: IP, idempotencyKey: KEY };

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const passed = (overrides: Record<string, unknown> = {}) =>
  json({ success: true, action: "lead_submit", hostname: "carreras-viajeras.mentec.dev", "error-codes": [], ...overrides });

function sentBodies() {
  return fetchMock.mock.calls.map(([, init]) => new URLSearchParams(String(init?.body)));
}

function configure({ secret = SECRET as string | null, isTestSecret = false } = {}) {
  vi.mocked(getTurnstileEnv).mockReturnValue(secret === null ? null : { TURNSTILE_SECRET_KEY: secret, isTestSecret });
  vi.mocked(getEnv).mockReturnValue({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" } as ReturnType<typeof getEnv>);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  configure();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstileToken", () => {
  it("valid with success, the lead_submit action and the APP_ORIGIN host", async () => {
    fetchMock.mockResolvedValueOnce(passed());

    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("valid");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(sentBodies()[0])).toEqual({
      secret: SECRET,
      response: TOKEN,
      remoteip: IP,
      idempotency_key: KEY,
    });
  });

  it("compares the hostname without the port of a development origin", async () => {
    vi.mocked(getEnv).mockReturnValue({ APP_ORIGIN: "http://localhost:3000" } as ReturnType<typeof getEnv>);
    fetchMock.mockResolvedValueOnce(passed({ hostname: "localhost" }));
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("valid");
  });

  it.each([
    ["another hostname", passed({ hostname: "evil.example.com" })],
    ["a missing hostname", passed({ hostname: undefined })],
    ["a null hostname", passed({ hostname: null })],
    ["another action", passed({ action: "login" })],
    ["a null action", passed({ action: null })],
    ["success: false (timeout-or-duplicate)", json({ success: false, "error-codes": ["timeout-or-duplicate"] })],
  ])("invalid with %s, without retrying", async (_case, response) => {
    fetchMock.mockResolvedValueOnce(response);
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("invalid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("with the development test secret only success is required", async () => {
    configure({ secret: "1x0000000000000000000000000000000AA", isTestSecret: true });
    fetchMock.mockResolvedValueOnce(json({ success: true, hostname: "example.com", action: "" }));
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("valid");

    fetchMock.mockResolvedValueOnce(json({ success: true, hostname: null, action: null }));
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("valid");

    fetchMock.mockResolvedValueOnce(json({ success: false, "error-codes": ["invalid-input-response"] }));
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("invalid");
  });

  it.each([
    ["a 5xx", () => fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 }))],
    ["a network error", () => fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))],
    ["a timeout", () => fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))],
  ])("%s followed by success → valid with 2 calls and the same idempotency_key", async (_case, fail) => {
    fail();
    fetchMock.mockResolvedValueOnce(passed());

    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("valid");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBodies().map((body) => body.get("idempotency_key"))).toEqual([KEY, KEY]);
  });

  it.each([
    ["a 5xx before retrying", 503],
    ["a 4xx before failing", 400],
  ])("cancels the unread body of %s", async (_case, status) => {
    const failed = new Response("oops", { status });
    const cancel = vi.spyOn(failed.body!, "cancel");
    fetchMock.mockResolvedValueOnce(failed).mockResolvedValueOnce(passed());

    await verifyTurnstileToken(INPUT);

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("two failures in a row → unavailable, never a third attempt", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 })).mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("unavailable");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("turnstile: verification unavailable");
  });

  it.each([
    ["a 4xx", () => new Response("bad request", { status: 400 })],
    ["a malformed body", () => json({ ok: "yes" })],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("%s → unavailable without retrying (fails closed)", async (_case, response) => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("without a configured secret → unavailable without calling fetch", async () => {
    configure({ secret: null });
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("turnstile: verification unavailable");
  });

  it("with an invalid environment → unavailable without calling fetch nor logging the error", async () => {
    vi.mocked(getTurnstileEnv).mockImplementation(() => {
      throw new Error("Invalid environment fields: TURNSTILE_SECRET_KEY");
    });
    await expect(verifyTurnstileToken(INPUT)).resolves.toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("turnstile: verification unavailable");
  });

  it.each([
    ["empty", ""],
    ["over 2048 characters", "t".repeat(2049)],
  ])("an %s token → invalid without calling fetch", async (_case, token) => {
    await expect(verifyTurnstileToken({ ...INPUT, token })).resolves.toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTurnstileEnv).not.toHaveBeenCalled();
  });

  it("an empty token logs that the widget did not render (missing build-time site key)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(verifyTurnstileToken({ ...INPUT, token: "" })).resolves.toBe("invalid");
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("NEXT_PUBLIC_TURNSTILE_SITE_KEY"));
  });

  it("sends remoteip only when it receives one", async () => {
    fetchMock.mockResolvedValueOnce(passed());
    await verifyTurnstileToken({ ...INPUT, remoteIp: null });
    expect(sentBodies()[0].has("remoteip")).toBe(false);
  });

  it("never logs the token, the IP or the secret", async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${TOKEN} from ${IP}`));
    await verifyTurnstileToken(INPUT);

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(IP);
    expect(logged).not.toContain(SECRET);
  });
});
