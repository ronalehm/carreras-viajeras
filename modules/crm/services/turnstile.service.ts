import "server-only";
import { z } from "zod";
import { getEnv, getTurnstileEnv } from "@/lib/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Must match the action the widget renders with (landing ContactForm).
const LEAD_SUBMIT_ACTION = "lead_submit";
const MAX_TOKEN_LENGTH = 2048;
const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 3000;

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  // nullish: Siteverify may answer null; a null action or hostname is then invalid, not unavailable.
  hostname: z.string().nullish(),
  action: z.string().nullish(),
  "error-codes": z.array(z.string()).optional(),
});

type SiteverifyResponse = z.infer<typeof siteverifyResponseSchema>;
export type TurnstileResult = "valid" | "invalid" | "unavailable";

// Fixed text only: never the token, the IP, the secret or Cloudflare's message.
function unavailable(): "unavailable" {
  console.error("turnstile: verification unavailable");
  return "unavailable";
}

// One Siteverify call. null = retryable failure (network error, timeout or 5xx); any other
// unexpected answer (4xx, malformed body) is final and fails closed.
async function siteverify(body: URLSearchParams): Promise<SiteverifyResponse | "failed" | null> {
  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
  if (!response.ok) {
    // Release the connection (Workers) before retrying or failing: the body is never read.
    await response.body?.cancel().catch(() => {});
    return response.status >= 500 ? null : "failed";
  }
  const parsed = siteverifyResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data : "failed";
}

// Server-side Turnstile check (fails closed). Valid only with success, the lead_submit action and
// the APP_ORIGIN hostname. Cloudflare's test secret (development only, see getTurnstileEnv)
// answers without the real hostname or action, so with it only success is required.
// At most 2 attempts, with the same idempotency_key, and only on network error, timeout or 5xx.
export async function verifyTurnstileToken(input: {
  token: string;
  remoteIp: string | null;
  idempotencyKey: string;
}): Promise<TurnstileResult> {
  if (input.token === "" || input.token.length > MAX_TOKEN_LENGTH) return "invalid";

  let secret: string;
  let isTestSecret: boolean;
  let expectedHostname: string;
  try {
    const env = getTurnstileEnv();
    if (env === null) return unavailable();
    secret = env.TURNSTILE_SECRET_KEY;
    isTestSecret = env.isTestSecret;
    expectedHostname = new URL(getEnv().APP_ORIGIN).hostname;
  } catch {
    return unavailable();
  }

  const body = new URLSearchParams({ secret, response: input.token });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);
  body.set("idempotency_key", input.idempotencyKey);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await siteverify(body);
    if (result === null) continue;
    if (result === "failed") return unavailable();
    if (!result.success) return "invalid";
    if (isTestSecret) return "valid";
    return result.action === LEAD_SUBMIT_ACTION && result.hostname === expectedHostname ? "valid" : "invalid";
  }
  return unavailable();
}
