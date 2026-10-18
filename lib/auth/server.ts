import "server-only";
import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { getEnv } from "@/lib/env";

let auth: NeonAuth | undefined;

// Workers populate runtime secrets after build; initialize on first request.
export function getAuth() {
  if (!auth) {
    const env = getEnv();
    auth = createNeonAuth({
      baseUrl: env.NEON_AUTH_BASE_URL,
      cookies: { secret: env.NEON_AUTH_COOKIE_SECRET },
      logLevel: "silent",
    });
  }
  return auth;
}
