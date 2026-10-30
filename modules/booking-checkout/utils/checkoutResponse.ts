import "server-only";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";

const NO_STORE = { "Cache-Control": "no-store" };

export type CheckoutRoute = "prepare" | "session" | "state" | "contract_acceptance";

export function checkoutJson(body: unknown): Response {
  return Response.json(body, { headers: NO_STORE });
}

// The error's name when it is a plain identifier ("NeonDbError", "TypeError"), else "Error". Never
// the message or stack: driver and Stripe messages can carry SQL, credentials or customer data.
export function safeErrorName(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z]{1,80}$/.test(name) ? name : "Error";
}

// Every error body is `{ code, requestId }`. The log line carries the same requestId, the code and,
// for internal errors, the sanitized error name only: never the cause, stack, SQL, secrets or
// personal data.
export function checkoutError(route: CheckoutRoute, code: string, status: number, errorName?: string): Response {
  const requestId = crypto.randomUUID();
  const entry = { route, requestId, code, status, ...(errorName && { errorName }) };
  if (status >= 500) console.error("booking checkout: request failed", entry);
  else console.warn("booking checkout: request rejected", entry);
  return Response.json({ code, requestId }, { status, headers: NO_STORE });
}

// Auth errors keep their 401/403 semantics; anything else is an opaque internal error.
export function checkoutFailure(route: CheckoutRoute, error: unknown): Response {
  if (error instanceof UnauthorizedError) return checkoutError(route, "unauthorized", 401);
  if (error instanceof ForbiddenError) return checkoutError(route, "forbidden", 403);
  return checkoutError(route, "internal", 500, safeErrorName(error));
}

// CSRF: a state-changing request must come from the application's own origin.
export function hasAppOrigin(request: Request, appOrigin: string): boolean {
  return request.headers.get("origin") === new URL(appOrigin).origin;
}
