import type { z } from "zod";
import { getAutomationApiToken } from "@/lib/env";
import { eventIdSchema } from "../schemas/automation.schema";

const BEARER_PREFIX = "Bearer ";
const MAX_BODY_BYTES = 4096;
const NO_STORE = { "Cache-Control": "no-store" };
const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

// Requires the exact, case-sensitive scheme "Bearer <value>". Both sides are hashed so the comparison
// always runs over 32 bytes without short-circuit, leaking neither content nor length through timing.
export async function isAuthorizedAutomationRequest(request: Request, token: string): Promise<boolean> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith(BEARER_PREFIX)) return false;

  const provided = header.slice(BEARER_PREFIX.length);
  if (provided === "") return false;

  const [providedDigest, expectedDigest] = await Promise.all([sha256(provided), sha256(token)]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index++) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

export function automationResponse(body: object, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

const errorResponse = (error: string, status: number) => automationResponse({ error }, status);

// Reads at most MAX_BODY_BYTES; returns null as soon as the body is larger, without buffering the rest.
async function readBoundedText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

// An empty body counts as {} (claim then uses its default limit; ack/fail fail validation).
function parseBody<T>(text: string, schema: z.ZodType<T>): { success: true; data: T } | { success: false } {
  let json: unknown;
  try {
    json = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return { success: false };
  }
  return schema.safeParse(json);
}

type AutomationRequestOptions<T> = {
  schema: z.ZodType<T>;
  eventId?: string; // route [id]; validated as UUID before the body is read
};

// Common pipeline of the private API: secret → bearer → event id → body (≤ 4 KiB, JSON, schema) → handle.
// Failures never reveal the variable, SQL, input or the original error; logs are fixed text.
export async function handleAutomationRequest<T>(
  request: Request,
  { schema, eventId }: AutomationRequestOptions<T>,
  handle: (body: T) => Promise<Response>,
): Promise<Response> {
  let token: string;
  try {
    token = getAutomationApiToken();
  } catch {
    console.error("Automation API unavailable: secret not configured");
    return errorResponse("unavailable", 503);
  }

  if (!(await isAuthorizedAutomationRequest(request, token))) return errorResponse("unauthorized", 401);
  if (eventId !== undefined && !eventIdSchema.safeParse(eventId).success) {
    return errorResponse("not_found", 404);
  }

  try {
    const text = await readBoundedText(request);
    if (text === null) return errorResponse("payload_too_large", 413);

    const body = parseBody(text, schema);
    if (!body.success) return errorResponse("invalid_request", 400);

    return await handle(body.data);
  } catch {
    console.error("Automation API unavailable: unexpected error");
    return errorResponse("unavailable", 503);
  }
}
