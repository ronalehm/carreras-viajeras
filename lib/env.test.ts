// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const valid = {
  DATABASE_URL: "postgresql://app:synthetic@db.example.test/neondb?sslmode=require",
  CLERK_SECRET_KEY: "sk_test_synthetic0clerk0secret0for0tests",
  APP_ORIGIN: "https://carreras-viajeras.mentec.dev",
};

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("client email environment", () => {
  it.each([undefined, "", "false"])("defaults off with %j and does not require SMTP settings", async (enabled) => {
    setEnv({ CRM_EMAIL_AUTOMATION_ENABLED: enabled, CRM_EMAIL_FROM: undefined, CRM_EMAIL_AUTOMATION_START_AT: undefined });
    const { getClientEmailEnv } = await import("./env");
    expect(getClientEmailEnv()).toBeNull();
  });
  it("requires an explicit sender and activation cutoff when enabled", async () => {
    setEnv({ CRM_EMAIL_AUTOMATION_ENABLED: "true", CRM_EMAIL_FROM: "sender@example.test", CRM_EMAIL_AUTOMATION_START_AT: "2026-10-29T18:00:00Z" });
    const { getClientEmailEnv } = await import("./env");
    expect(getClientEmailEnv()).toEqual({ from: "sender@example.test", startAt: new Date("2026-10-29T18:00:00Z"), teamAlertEmail: null });
    vi.stubEnv("CRM_EMAIL_AUTOMATION_START_AT", undefined);
    expect(() => getClientEmailEnv()).toThrow("Invalid environment fields: CRM_EMAIL_AUTOMATION_START_AT");
    vi.stubEnv("CRM_EMAIL_AUTOMATION_ENABLED", "yes");
    expect(() => getClientEmailEnv()).toThrow("Invalid environment fields: CRM_EMAIL_AUTOMATION_ENABLED");
  });
  it("rejects sender header injection and invalid cutoff without repeating the values", async () => {
    setEnv({ CRM_EMAIL_AUTOMATION_ENABLED: "true", CRM_EMAIL_FROM: "a@example.test\r\nBcc: x@example.test", CRM_EMAIL_AUTOMATION_START_AT: "yesterday" });
    const { getClientEmailEnv } = await import("./env");
    expect(() => getClientEmailEnv()).toThrow("Invalid environment fields: CRM_EMAIL_FROM, CRM_EMAIL_AUTOMATION_START_AT");
  });

  const enabledEmail = {
    CRM_EMAIL_AUTOMATION_ENABLED: "true",
    CRM_EMAIL_FROM: "sender@example.test",
    CRM_EMAIL_AUTOMATION_START_AT: "2026-10-29T18:00:00Z",
  };

  it.each([undefined, ""])("leaves the team alert address null when CRM_TEAM_ALERT_EMAIL is %j", async (address) => {
    setEnv({ ...enabledEmail, CRM_TEAM_ALERT_EMAIL: address });
    const { getClientEmailEnv } = await import("./env");
    expect(getClientEmailEnv()?.teamAlertEmail).toBeNull();
  });

  it("reads the team alert address in lower case", async () => {
    setEnv({ ...enabledEmail, CRM_TEAM_ALERT_EMAIL: "Equipo.Ventas@Example.TEST" });
    const { getClientEmailEnv } = await import("./env");
    expect(getClientEmailEnv()).toEqual({
      from: "sender@example.test",
      startAt: new Date("2026-10-29T18:00:00Z"),
      teamAlertEmail: "equipo.ventas@example.test",
    });
  });

  it.each([
    "not-an-email",
    "team@example.test\r\nBcc: x@example.test",
    `${"a".repeat(245)}@example.test`,
  ])("rejects the team alert address %j naming only the field", async (address) => {
    setEnv({ ...enabledEmail, CRM_TEAM_ALERT_EMAIL: address });
    const { getClientEmailEnv } = await import("./env");
    let error: unknown;
    try { getClientEmailEnv(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Invalid environment fields: CRM_TEAM_ALERT_EMAIL");
    expect(JSON.stringify(error)).not.toContain(address);
    expect((error as Error).message).not.toContain(address);
    expect((error as Error).cause).toBeUndefined();
  });

  it.each([undefined, "false"])("ignores an invalid team alert address while automation is %j", async (enabled) => {
    setEnv({ ...enabledEmail, CRM_EMAIL_AUTOMATION_ENABLED: enabled, CRM_TEAM_ALERT_EMAIL: "not-an-email" });
    const { getClientEmailEnv } = await import("./env");
    expect(getClientEmailEnv()).toBeNull();
  });
});

describe("sales cadence switch", () => {
  it.each([undefined, "", "false"])("defaults off with %j", async (enabled) => {
    setEnv({ CRM_SALES_CADENCE_ENABLED: enabled });
    const { isSalesCadenceEnabled } = await import("./env");
    expect(isSalesCadenceEnabled()).toBe(false);
  });
  it("turns on only with the exact value true", async () => {
    setEnv({ CRM_SALES_CADENCE_ENABLED: "true" });
    const { isSalesCadenceEnabled } = await import("./env");
    expect(isSalesCadenceEnabled()).toBe(true);
  });
  it.each(["TRUE", "1", "yes", " true"])("rejects %j naming only the field", async (enabled) => {
    setEnv({ CRM_SALES_CADENCE_ENABLED: enabled });
    const { isSalesCadenceEnabled } = await import("./env");
    expect(() => isSalesCadenceEnabled()).toThrow(/^Invalid environment fields: CRM_SALES_CADENCE_ENABLED$/);
  });
});

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
    ["CLERK_SECRET_KEY", "pk_test_synthetic0publishable0key"],
    ["CLERK_SECRET_KEY", "sk_prod_synthetic0clerk0secret"],
    ["CLERK_SECRET_KEY", "sk_test_"],
    ["CLERK_SECRET_KEY", "sk_live_synthetic clerk secret"],
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

  it.each(["sk_test_synthetic0clerk0secret", "sk_live_synthetic0clerk0secret"])(
    "accepts the Clerk secret key format %s",
    async (key) => {
      setEnv({ ...valid, CLERK_SECRET_KEY: key });
      const { getEnv } = await import("@/lib/env");
      expect(getEnv().CLERK_SECRET_KEY).toBe(key);
    },
  );

  it.each([undefined, ""])("rejects a missing CLERK_SECRET_KEY (%j) with the field name only", async (key) => {
    setEnv({ ...valid, CLERK_SECRET_KEY: key });
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/^Invalid environment fields: CLERK_SECRET_KEY$/);
  });

  it("no longer reads or requires the Neon Auth variables", async () => {
    setEnv({
      ...valid,
      NEON_AUTH_BASE_URL: undefined,
      NEON_AUTH_COOKIE_SECRET: undefined,
    });
    const { getEnv } = await import("@/lib/env");
    expect(getEnv()).toEqual(valid);
    setEnv({ NEON_AUTH_BASE_URL: "not-a-url", NEON_AUTH_COOKIE_SECRET: "short" });
    expect(getEnv()).toEqual(valid);
  });

  it("does not validate the environment on import", async () => {
    setEnv({ ...valid, CLERK_SECRET_KEY: "invalid" });
    await expect(import("@/lib/env")).resolves.toHaveProperty("getEnv");
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

describe("Stripe Checkout configuration", () => {
  const TEST_KEY = "sk_test_synthetic0stripe0key";
  const LIVE_KEY = "sk_live_synthetic0stripe0key";
  const WEBHOOK = "whsec_synthetic0webhook0secret";
  const production = {
    NODE_ENV: "production",
    APP_ORIGIN: "https://carreras-viajeras.mentec.dev",
    STRIPE_SECRET_KEY: LIVE_KEY,
    STRIPE_WEBHOOK_SECRET: WEBHOOK,
    STRIPE_CHECKOUT_ENABLED: "true",
    STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: undefined,
    STRIPE_DEMO_MODE: undefined,
  };
  const development = {
    NODE_ENV: "development",
    APP_ORIGIN: "http://localhost:3001",
    STRIPE_SECRET_KEY: TEST_KEY,
    STRIPE_WEBHOOK_SECRET: WEBHOOK,
    STRIPE_CHECKOUT_ENABLED: "true",
    STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: undefined,
    STRIPE_DEMO_MODE: undefined,
  };

  async function config(values: Record<string, string | undefined>) {
    setEnv(values);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getStripeCheckoutConfig } = await import("./env");
    const result = getStripeCheckoutConfig();
    const logged = JSON.stringify(warn.mock.calls);
    warn.mockRestore();
    return { result, logged };
  }

  it("enables live mode in production with every requirement met", async () => {
    const { result } = await config(production);
    expect(result).toEqual({
      enabled: true, mode: "live", secretKey: LIVE_KEY, webhookSecret: WEBHOOK,
      allowDraftContracts: false, disabledReason: null,
    });
  });

  it("enables test mode outside production, with restricted keys too", async () => {
    expect((await config(development)).result).toMatchObject({ enabled: true, mode: "test", secretKey: TEST_KEY });
    vi.resetModules();
    const restricted = await config({ ...development, STRIPE_SECRET_KEY: "rk_test_synthetic0restricted" });
    expect(restricted.result).toMatchObject({ enabled: true, mode: "test" });
    vi.resetModules();
    const live = await config({ ...production, STRIPE_SECRET_KEY: "rk_live_synthetic0restricted" });
    expect(live.result).toMatchObject({ enabled: true, mode: "live" });
  });

  it.each([undefined, "", "false"])("is off by default (%j) but keeps the webhook credentials", async (flag) => {
    const { result, logged } = await config({ ...production, STRIPE_CHECKOUT_ENABLED: flag });
    expect(result).toEqual({
      enabled: false, mode: "live", secretKey: LIVE_KEY, webhookSecret: WEBHOOK,
      allowDraftContracts: false, disabledReason: "not_enabled",
    });
    expect(logged).toBe("[]");
  });

  it.each([
    ["a test key in production", { STRIPE_SECRET_KEY: TEST_KEY }, "mode_not_allowed"],
    ["a missing key", { STRIPE_SECRET_KEY: undefined }, "missing_secret_key"],
    ["a missing webhook secret", { STRIPE_WEBHOOK_SECRET: undefined }, "missing_webhook_secret"],
    ["a localhost origin", { APP_ORIGIN: "http://localhost:3001" }, "invalid_app_origin"],
    ["a non-production HTTPS origin", { APP_ORIGIN: "https://preview.example.test" }, "invalid_app_origin"],
    ["a missing origin", { APP_ORIGIN: undefined }, "invalid_app_origin"],
    ["the draft contracts bypass", { STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: "true" }, "draft_contracts_bypass"],
  ])("fails closed in production with %s", async (_label, override, reason) => {
    const { result, logged } = await config({ ...production, ...override });
    expect(result.enabled).toBe(false);
    expect(result.disabledReason).toBe(reason);
    expect(result.allowDraftContracts).toBe(false);
    expect(logged).toContain(reason);
    for (const secret of [LIVE_KEY, TEST_KEY, WEBHOOK]) expect(logged).not.toContain(secret);
  });

  it("does not expose a test key or its webhook secret in production", async () => {
    const { result } = await config({ ...production, STRIPE_SECRET_KEY: TEST_KEY });
    expect(result).toMatchObject({ mode: null, secretKey: null, webhookSecret: null });
  });

  it("requires test mode outside production", async () => {
    const { result } = await config({ ...development, STRIPE_SECRET_KEY: LIVE_KEY });
    expect(result).toEqual({
      enabled: false, mode: null, secretKey: null, webhookSecret: null,
      allowDraftContracts: false, disabledReason: "mode_not_allowed",
    });
  });

  it("allows draft contracts only in test mode with the explicit flag", async () => {
    expect((await config({ ...development, STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: "true" })).result)
      .toMatchObject({ enabled: true, mode: "test", allowDraftContracts: true });
    vi.resetModules();
    expect((await config({ ...development, STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: "false" })).result.allowDraftContracts).toBe(false);
    vi.resetModules();
    expect((await config({ ...development, STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: undefined })).result.allowDraftContracts).toBe(false);
  });

  it.each([
    ["STRIPE_CHECKOUT_ENABLED", "TRUE"],
    ["STRIPE_CHECKOUT_ENABLED", "1"],
    ["STRIPE_SECRET_KEY", "pk_live_synthetic0publishable"],
    ["STRIPE_SECRET_KEY", "sk_prod_synthetic0stripe0key"],
    ["STRIPE_WEBHOOK_SECRET", "synthetic0webhook0secret"],
    ["STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS", "yes"],
    ["STRIPE_DEMO_MODE", "TRUE"],
    ["STRIPE_DEMO_MODE", "1"],
  ])("fails closed on an invalid %s, logging the field name only", async (name, value) => {
    const { result, logged } = await config({ ...production, [name]: value });
    expect(result).toEqual({
      enabled: false, mode: null, secretKey: null, webhookSecret: null,
      allowDraftContracts: false, disabledReason: "invalid_configuration",
    });
    expect(logged).toContain(name);
    expect(logged).not.toContain(value);
    expect(logged).not.toContain(WEBHOOK);
  });

  describe("demo mode (production with a test key)", () => {
    const demo = { ...production, STRIPE_SECRET_KEY: TEST_KEY, STRIPE_DEMO_MODE: "true" };

    it.each([TEST_KEY, "rk_test_synthetic0restricted"])("enables demo mode with every requirement met (%s)", async (key) => {
      const { result, logged } = await config({ ...demo, STRIPE_SECRET_KEY: key });
      expect(result).toEqual({
        enabled: true, mode: "demo", secretKey: key, webhookSecret: WEBHOOK,
        allowDraftContracts: false, disabledReason: null,
      });
      expect(logged).toBe("[]");
    });

    it.each([LIVE_KEY, "rk_live_synthetic0restricted"])("never accepts a live key, not even for the webhook (%s)", async (key) => {
      for (const flag of ["true", "false", undefined]) {
        vi.resetModules();
        const { result, logged } = await config({ ...demo, STRIPE_SECRET_KEY: key, STRIPE_CHECKOUT_ENABLED: flag });
        expect(result).toEqual({
          enabled: false, mode: null, secretKey: null, webhookSecret: null,
          allowDraftContracts: false, disabledReason: "demo_requires_test_key",
        });
        expect(logged).toContain("demo_requires_test_key");
        expect(logged).not.toContain(key);
        expect(logged).not.toContain(WEBHOOK);
      }
    });

    it.each([undefined, "", "false"])("keeps a test key off in production without the demo flag (%j)", async (flag) => {
      const { result } = await config({ ...demo, STRIPE_DEMO_MODE: flag });
      expect(result).toEqual({
        enabled: false, mode: null, secretKey: null, webhookSecret: null,
        allowDraftContracts: false, disabledReason: "mode_not_allowed",
      });
    });

    it("keeps live mode as before when the demo flag is off", async () => {
      expect((await config({ ...production, STRIPE_DEMO_MODE: "false" })).result).toMatchObject({ enabled: true, mode: "live" });
    });

    it.each([undefined, "", "false"])("is off without the Checkout flag (%j) but keeps the demo webhook credentials", async (flag) => {
      const { result, logged } = await config({ ...demo, STRIPE_CHECKOUT_ENABLED: flag });
      expect(result).toEqual({
        enabled: false, mode: "demo", secretKey: TEST_KEY, webhookSecret: WEBHOOK,
        allowDraftContracts: false, disabledReason: "not_enabled",
      });
      expect(logged).toBe("[]");
    });

    it.each([
      ["a missing webhook secret", { STRIPE_WEBHOOK_SECRET: undefined }, "missing_webhook_secret"],
      ["a localhost origin", { APP_ORIGIN: "http://localhost:3001" }, "invalid_app_origin"],
      ["a non-production HTTPS origin", { APP_ORIGIN: "https://preview.example.test" }, "invalid_app_origin"],
      ["a missing origin", { APP_ORIGIN: undefined }, "invalid_app_origin"],
      ["a missing key", { STRIPE_SECRET_KEY: undefined }, "missing_secret_key"],
    ])("fails closed with %s", async (_label, override, reason) => {
      const { result, logged } = await config({ ...demo, ...override });
      expect(result.enabled).toBe(false);
      expect(result.disabledReason).toBe(reason);
      expect(logged).toContain(reason);
      for (const secret of [LIVE_KEY, TEST_KEY, WEBHOOK]) expect(logged).not.toContain(secret);
    });

    it("allows draft contracts in demo mode only with the explicit flag", async () => {
      expect((await config({ ...demo, STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: "true" })).result)
        .toMatchObject({ enabled: true, mode: "demo", allowDraftContracts: true, disabledReason: null });
      vi.resetModules();
      expect((await config({ ...demo, STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: "false" })).result.allowDraftContracts).toBe(false);
    });

    it("ignores the demo flag outside production", async () => {
      expect((await config({ ...development, STRIPE_DEMO_MODE: "true" })).result)
        .toMatchObject({ enabled: true, mode: "test", secretKey: TEST_KEY });
      vi.resetModules();
      expect((await config({ ...development, STRIPE_DEMO_MODE: "true", STRIPE_SECRET_KEY: LIVE_KEY })).result)
        .toMatchObject({ enabled: false, mode: null, secretKey: null, disabledReason: "mode_not_allowed" });
    });
  });

  it("maps each mode to the livemode Stripe must report", async () => {
    const { stripeLivemodeFor } = await import("./env");
    expect(stripeLivemodeFor("live")).toBe(true);
    expect(stripeLivemodeFor("test")).toBe(false);
    expect(stripeLivemodeFor("demo")).toBe(false);
  });

  it("is read on each invocation and not validated on import", async () => {
    setEnv({ ...production, STRIPE_SECRET_KEY: "invalid" });
    const { getStripeCheckoutConfig } = await import("./env");
    vi.stubEnv("STRIPE_SECRET_KEY", LIVE_KEY);
    expect(getStripeCheckoutConfig().enabled).toBe(true);
    vi.stubEnv("STRIPE_CHECKOUT_ENABLED", "false");
    expect(getStripeCheckoutConfig().enabled).toBe(false);
  });

  it("logs each disabled reason once per process, not on every request", async () => {
    setEnv({ ...production, STRIPE_SECRET_KEY: TEST_KEY });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getStripeCheckoutConfig } = await import("./env");
    for (let request = 0; request < 3; request++) expect(getStripeCheckoutConfig().enabled).toBe(false);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
    vi.stubEnv("STRIPE_SECRET_KEY", LIVE_KEY);
    getStripeCheckoutConfig();
    getStripeCheckoutConfig();
    const reasons = warn.mock.calls.map(([, details]) => (details as { reason: string }).reason);
    warn.mockRestore();
    expect(reasons).toEqual(["mode_not_allowed", "missing_webhook_secret"]);
  });
});
