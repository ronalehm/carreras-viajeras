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
