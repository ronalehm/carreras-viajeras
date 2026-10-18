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

const httpsUrl = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.search;
  } catch { return false; }
});
const environmentSchema = z.object({
  DATABASE_URL: databaseUrl,
  NEON_AUTH_BASE_URL: httpsUrl,
  NEON_AUTH_COOKIE_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().refine((value) =>
    value === "https://carreras-viajeras.mentec.dev"
    || (process.env.NODE_ENV === "development"
      && ["http://localhost:3000", "http://localhost:8787"].includes(value))),
});

// Validate only at request time. Never attach Zod issues or input to the error.
export function getEnv() {
  const result = environmentSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    APP_ORIGIN: process.env.APP_ORIGIN,
  });
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid environment fields: ${fields.join(", ")}`);
  }
  return result.data;
}

const automationApiTokenSchema = z.string().min(32);

// Separate from getEnv() so a missing token only affects the private automation API.
export function getAutomationApiToken() {
  const result = automationApiTokenSchema.safeParse(process.env.AUTOMATION_API_TOKEN);
  if (!result.success) throw new Error("Invalid environment fields: AUTOMATION_API_TOKEN");
  return result.data;
}
