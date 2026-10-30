import "server-only";
import { z } from "zod";

const databaseUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && Boolean(url.hostname && url.username && url.password && url.pathname.length > 1)
      && ["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? "");
  } catch { return false; }
});

// Production HTTPS origin; exact localhost origins only under `next dev`.
const appOrigin = z.string().refine((value) =>
  value === "https://carreras-viajeras.mentec.dev"
  || (process.env.NODE_ENV === "development"
    && ["http://localhost:3000", "http://localhost:3001", "http://localhost:8787"].includes(value)));

const environmentSchema = z.object({
  DATABASE_URL: databaseUrl,
  // Server-only Clerk key (Cloudflare Secret). The publishable key is consumed by Clerk itself.
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_\S+$/),
  APP_ORIGIN: appOrigin,
});

// Its message carries field names only, so callers may log it. Recognised by name, so modules
// that mock @/lib/env in tests keep working.
export class InvalidEnvironmentError extends Error {
  override name = "InvalidEnvironmentError";
}

// Never attach Zod issues or input to the error: field names only.
function invalidEnvironment(error: z.ZodError): InvalidEnvironmentError {
  const fields = [...new Set(error.issues.map((issue) => issue.path[0]))];
  return new InvalidEnvironmentError(`Invalid environment fields: ${fields.join(", ")}`);
}

// Validate only at request time. Never attach Zod issues or input to the error.
export function getEnv() {
  const result = environmentSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    APP_ORIGIN: process.env.APP_ORIGIN,
  });
  if (!result.success) throw invalidEnvironment(result.error);
  return result.data;
}

// Optional integrations: validated lazily and independently, so the CRM and auth keep working
// without them. A blank value (as left by the .env templates) counts as missing.
function readOptional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

// Bearer token shared with n8n (Cloudflare Secret). Never DATABASE_URL.
const integrationSchema = z.object({ N8N_API_TOKEN: z.string().min(32) });

export function getIntegrationEnv(): { N8N_API_TOKEN: string } | null {
  const token = readOptional("N8N_API_TOKEN");
  if (token === undefined) return null;
  const result = integrationSchema.safeParse({ N8N_API_TOKEN: token });
  if (!result.success) throw invalidEnvironment(result.error);
  return result.data;
}

const clientEmailEnvSchema = z.object({
  CRM_EMAIL_FROM: z.email().max(254),
  CRM_EMAIL_AUTOMATION_START_AT: z.iso.datetime({ offset: true }),
  // Team inbox notified of every new lead. Optional: without it the team alert is skipped.
  CRM_TEAM_ALERT_EMAIL: z.email().max(254).optional(),
});

// Deliberately off unless explicitly enabled. SMTP credentials live only in n8n.
export function getClientEmailEnv(): { from: string; startAt: Date; teamAlertEmail: string | null } | null {
  const enabled = readOptional("CRM_EMAIL_AUTOMATION_ENABLED");
  if (enabled === undefined || enabled === "false") return null;
  if (enabled !== "true") throw new Error("Invalid environment fields: CRM_EMAIL_AUTOMATION_ENABLED");
  const result = clientEmailEnvSchema.safeParse({
    CRM_EMAIL_FROM: readOptional("CRM_EMAIL_FROM"),
    CRM_EMAIL_AUTOMATION_START_AT: readOptional("CRM_EMAIL_AUTOMATION_START_AT"),
    CRM_TEAM_ALERT_EMAIL: readOptional("CRM_TEAM_ALERT_EMAIL"),
  });
  if (!result.success) throw invalidEnvironment(result.error);
  return {
    from: result.data.CRM_EMAIL_FROM,
    startAt: new Date(result.data.CRM_EMAIL_AUTOMATION_START_AT),
    teamAlertEmail: result.data.CRM_TEAM_ALERT_EMAIL?.toLowerCase() ?? null,
  };
}

// Sales cadence switch (crm-sales-cadence.md, open question 3). Off unless exactly "true": the
// cadence emails need the unsubscribe link of Phase 2, so it is turned on only once Phase 2 is
// deployed. It only adds to CRM_EMAIL_AUTOMATION_ENABLED, which must also be on to send anything.
export function isSalesCadenceEnabled(): boolean {
  const enabled = readOptional("CRM_SALES_CADENCE_ENABLED");
  if (enabled === undefined || enabled === "false") return false;
  if (enabled !== "true") throw new InvalidEnvironmentError("Invalid environment fields: CRM_SALES_CADENCE_ENABLED");
  return true;
}

// Test secrets documented by Cloudflare (always pass, always fail, already spent).
// Their responses carry no real hostname or action, so they are allowed only in development.
const TURNSTILE_TEST_SECRETS: readonly string[] = [
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
];

const turnstileSchema = z.object({
  TURNSTILE_SECRET_KEY: z
    .string()
    .max(512)
    .refine(
      (value) => !TURNSTILE_TEST_SECRETS.includes(value) || process.env.NODE_ENV === "development",
    ),
});

export function getTurnstileEnv(): { TURNSTILE_SECRET_KEY: string; isTestSecret: boolean } | null {
  const secret = readOptional("TURNSTILE_SECRET_KEY");
  if (secret === undefined) return null;
  const result = turnstileSchema.safeParse({ TURNSTILE_SECRET_KEY: secret });
  if (!result.success) throw invalidEnvironment(result.error);
  return {
    TURNSTILE_SECRET_KEY: result.data.TURNSTILE_SECRET_KEY,
    isTestSecret: TURNSTILE_TEST_SECRETS.includes(result.data.TURNSTILE_SECRET_KEY),
  };
}

export type StripeMode = "test" | "live";
export type StripeCheckoutDisabledReason =
  | "not_enabled" | "invalid_configuration" | "missing_secret_key" | "mode_not_allowed"
  | "missing_webhook_secret" | "invalid_app_origin" | "draft_contracts_bypass";
export type StripeCheckoutConfig = {
  enabled: boolean;
  // Mode of the secret key, set only when this environment allows it: live in production, test elsewhere.
  mode: StripeMode | null;
  secretKey: string | null;
  webhookSecret: string | null;
  // Draft contracts for sandbox payments: test mode only, with the explicit flag.
  allowDraftContracts: boolean;
  // Never carries values, so callers may log it.
  disabledReason: StripeCheckoutDisabledReason | null;
};

const stripeFlag = z.enum(["true", "false"]).optional();
const stripeCheckoutSchema = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9_]+$/).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9_]+$/).optional(),
  STRIPE_CHECKOUT_ENABLED: stripeFlag,
  STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: stripeFlag,
});

// Configuration is read on every request; each distinct reason is logged once per process.
const loggedStripeWarnings = new Set<string>();
function warnStripeCheckoutDisabled(details: { reason: StripeCheckoutDisabledReason; fields?: string }) {
  const key = details.reason + (details.fields ?? "");
  if (loggedStripeWarnings.has(key)) return;
  loggedStripeWarnings.add(key);
  console.warn("stripe-checkout: disabled", details);
}

// Fails closed: any missing or invalid value leaves Checkout off. The key and webhook secret are
// still returned when their mode is allowed, so the webhook works while Checkout is switched off.
export function getStripeCheckoutConfig(): StripeCheckoutConfig {
  const production = process.env.NODE_ENV === "production";
  const result = stripeCheckoutSchema.safeParse({
    STRIPE_SECRET_KEY: readOptional("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: readOptional("STRIPE_WEBHOOK_SECRET"),
    STRIPE_CHECKOUT_ENABLED: readOptional("STRIPE_CHECKOUT_ENABLED"),
    STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS: readOptional("STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS"),
  });
  if (!result.success) {
    warnStripeCheckoutDisabled({ reason: "invalid_configuration", fields: invalidEnvironment(result.error).message });
    return { enabled: false, mode: null, secretKey: null, webhookSecret: null, allowDraftContracts: false, disabledReason: "invalid_configuration" };
  }
  const env = result.data;
  const keyMode: StripeMode | null = env.STRIPE_SECRET_KEY
    ? (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? "live" : "test") : null;
  const mode = keyMode === (production ? "live" : "test") ? keyMode : null;
  const webhookSecret = mode ? env.STRIPE_WEBHOOK_SECRET ?? null : null;
  const draftBypass = env.STRIPE_CHECKOUT_SANDBOX_DRAFT_CONTRACTS === "true";
  const disabledReason: StripeCheckoutDisabledReason | null =
    env.STRIPE_CHECKOUT_ENABLED !== "true" ? "not_enabled"
      : !keyMode ? "missing_secret_key"
        : !mode ? "mode_not_allowed"
          : production && !webhookSecret ? "missing_webhook_secret"
            : production && !appOrigin.safeParse(process.env.APP_ORIGIN).success ? "invalid_app_origin"
              : production && draftBypass ? "draft_contracts_bypass"
                : null;
  if (disabledReason && disabledReason !== "not_enabled") warnStripeCheckoutDisabled({ reason: disabledReason });
  return {
    enabled: disabledReason === null,
    mode,
    secretKey: mode ? env.STRIPE_SECRET_KEY! : null,
    webhookSecret,
    allowDraftContracts: mode === "test" && draftBypass,
    disabledReason,
  };
}
