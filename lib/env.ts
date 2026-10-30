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

const environmentSchema = z.object({
  DATABASE_URL: databaseUrl,
  // Server-only Clerk key (Cloudflare Secret). The publishable key is consumed by Clerk itself.
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_\S+$/),
  APP_ORIGIN: z.string().refine((value) =>
    value === "https://carreras-viajeras.mentec.dev"
    || (process.env.NODE_ENV === "development"
      && ["http://localhost:3000", "http://localhost:8787"].includes(value))),
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
