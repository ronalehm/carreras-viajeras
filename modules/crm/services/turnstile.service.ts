import "server-only";
import { z } from "zod";
import { getEnv, getTurnstileEnv } from "@/lib/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "lead_submit";
const MAX_TOKEN_LENGTH = 2048;
const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 3000;

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

type TurnstileVerification = "valid" | "invalid" | "unavailable";

// Fixed text only: never the token, the IP, the secret or the provider's message.
function unavailable(): "unavailable" {
  console.error("turnstile: verification unavailable");
  return "unavailable";
}

// Valid only with success, the form's action and the APP_ORIGIN hostname. The documented test
// secrets (development only, see getTurnstileEnv) answer without the real hostname or action,
// so with them only success is required.
function isValid(data: z.infer<typeof siteverifyResponseSchema>, isTestSecret: boolean): boolean {
  if (!data.success) return false;
  if (isTestSecret) return true;
  return data.action === TURNSTILE_ACTION && data.hostname === new URL(getEnv().APP_ORIGIN).hostname;
}

// Siteverify fails closed: missing or invalid secret, network errors, timeouts and 5xx after the
// second attempt are "unavailable" (nothing is saved). Retries (network error, timeout or 5xx only)
// reuse the same idempotency_key, so Cloudflare does not reject them as an already spent token.
// Waiting on the network does not consume Worker CPU.
export async function verifyTurnstileToken(input: {
  token: string;
  remoteIp: string | null;
  idempotencyKey: string;
}): Promise<TurnstileVerification> {
  if (input.token.length === 0 || input.token.length > MAX_TOKEN_LENGTH) return "invalid";

  let env: ReturnType<typeof getTurnstileEnv>;
  try {
    env = getTurnstileEnv();
  } catch {
    return unavailable();
  }
  if (!env) return unavailable();

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: input.token,
    idempotency_key: input.idempotencyKey,
  });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(SITEVERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    if (response.status >= 500) continue;
    if (!response.ok) return unavailable();

    try {
      const data = siteverifyResponseSchema.parse(await response.json());
      return isValid(data, env.isTestSecret) ? "valid" : "invalid";
    } catch {
      return unavailable();
    }
  }
  return unavailable();
}
