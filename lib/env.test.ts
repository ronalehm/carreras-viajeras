// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const valid = {
  DATABASE_URL: "postgresql://app:synthetic@db.example.test/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: "https://auth.example.test/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "synthetic-random-test-secret-at-least-32",
  APP_ORIGIN: "https://carreras-viajeras.mentec.dev",
};

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("runtime environment", () => {
  it("imports without runtime secrets, then rejects incomplete configuration", async () => {
    setEnv(Object.fromEntries(Object.keys(valid).map((key) => [key, undefined])));
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow("Invalid environment fields:");
  });

  it("accepts the configured HTTPS origin and TLS database URL", async () => {
    setEnv(valid);
    const { getEnv } = await import("@/lib/env");
    expect(getEnv()).toEqual(valid);
  });

  it.each([
    ["DATABASE_URL", "postgresql://app:synthetic@db.example.test/neondb"],
    ["DATABASE_URL", "postgresql://app:synthetic@db.example.test/neondb?sslmode=disable"],
    ["DATABASE_URL", "https://example.test"],
    ["NEON_AUTH_BASE_URL", "not-a-url"],
    ["NEON_AUTH_BASE_URL", "http://auth.example.test/auth"],
    ["NEON_AUTH_BASE_URL", "https://user:synthetic@auth.example.test/auth"],
    ["NEON_AUTH_COOKIE_SECRET", "short"],
    ["APP_ORIGIN", "https://untrusted.example.test"],
    ["APP_ORIGIN", "https://carreras-viajeras.mentec.dev/path"],
  ])("rejects invalid %s with field names only", async (name, value) => {
    setEnv({ ...valid, [name]: value });
    const { getEnv } = await import("@/lib/env");
    let error: unknown;
    try { getEnv(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`Invalid environment fields: ${name}`);
    expect(JSON.stringify(error)).not.toContain(value);
    expect((error as Error).cause).toBeUndefined();
  });

  it("permits exact localhost origins only in development", async () => {
    setEnv({ ...valid, APP_ORIGIN: "http://localhost:3000", NODE_ENV: "development" });
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().APP_ORIGIN).toBe("http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getEnv()).toThrow("Invalid environment fields: APP_ORIGIN");
  });

  it("reads runtime values on each invocation", async () => {
    setEnv(valid);
    const { getEnv } = await import("@/lib/env");
    getEnv();
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => getEnv()).toThrow("Invalid environment fields: DATABASE_URL");
  });
});

describe("optional integration environment", () => {
  const TOKEN = "synthetic-n8n-token-with-32-char"; // exactly 32: the minimum

  it("does not require the integration secrets in getEnv", async () => {
    setEnv({ ...valid, N8N_API_TOKEN: undefined, TURNSTILE_SECRET_KEY: undefined });
    const { getEnv } = await import("@/lib/env");
    expect(getEnv()).toEqual(valid);
  });

  it.each([undefined, ""])("getIntegrationEnv returns null without a token (%j)", async (token) => {
    setEnv({ N8N_API_TOKEN: token });
    const { getIntegrationEnv } = await import("@/lib/env");
    expect(getIntegrationEnv()).toBeNull();
  });

  it("getIntegrationEnv rejects a 31-character token with the field name only", async () => {
    const short = "x".repeat(31);
    setEnv({ N8N_API_TOKEN: short });
    const { getIntegrationEnv } = await import("@/lib/env");
    let error: unknown;
    try { getIntegrationEnv(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Invalid environment fields: N8N_API_TOKEN");
    expect(JSON.stringify(error)).not.toContain(short);
    expect((error as Error).cause).toBeUndefined();
  });

  it("getIntegrationEnv returns a valid token", async () => {
    expect(TOKEN).toHaveLength(32);
    setEnv({ N8N_API_TOKEN: TOKEN });
    const { getIntegrationEnv } = await import("@/lib/env");
    expect(getIntegrationEnv()).toEqual({ N8N_API_TOKEN: TOKEN });
  });

  it.each([undefined, ""])("getTurnstileEnv returns null without a secret (%j)", async (secret) => {
    setEnv({ TURNSTILE_SECRET_KEY: secret });
    const { getTurnstileEnv } = await import("@/lib/env");
    expect(getTurnstileEnv()).toBeNull();
  });

  it("getTurnstileEnv returns a real secret in production", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "0x-synthetic-turnstile-secret" });
    const { getTurnstileEnv } = await import("@/lib/env");
    expect(getTurnstileEnv()).toEqual({
      TURNSTILE_SECRET_KEY: "0x-synthetic-turnstile-secret",
      isTestSecret: false,
    });
  });

  it.each([
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
    "3x0000000000000000000000000000000AA",
  ])("allows the Cloudflare test secret %s only in development", async (secret) => {
    setEnv({ NODE_ENV: "development", TURNSTILE_SECRET_KEY: secret });
    const { getTurnstileEnv } = await import("@/lib/env");
    expect(getTurnstileEnv()).toEqual({ TURNSTILE_SECRET_KEY: secret, isTestSecret: true });

    for (const nodeEnv of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      let error: unknown;
      try { getTurnstileEnv(); } catch (caught) { error = caught; }
      expect((error as Error).message).toBe("Invalid environment fields: TURNSTILE_SECRET_KEY");
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });
});
