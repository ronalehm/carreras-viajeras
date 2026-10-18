import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

let auth: NeonAuth | undefined;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

// Lazy: createNeonAuth throws without env vars, and `next build` imports
// route modules before any request (and before Workers populate process.env).
export function getAuth() {
  auth ??= createNeonAuth({
    baseUrl: requireEnv("NEON_AUTH_BASE_URL"),
    cookies: { secret: requireEnv("NEON_AUTH_COOKIE_SECRET") },
  });
  return auth;
}
