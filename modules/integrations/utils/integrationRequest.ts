import "server-only";
import type { z } from "zod";
import { getIntegrationEnv } from "@/lib/env";

const MAX_BODY_BYTES = 4096;
const BEARER = /^Bearer (.+)$/i;

// JSON response for the n8n API: never cached, no CORS headers.
export function integrationJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// Constant time: both values are hashed (same length, length not leaked) and every byte is
// compared with an XOR accumulator, without short-circuit.
export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

// Every n8n route goes through here: token configured (503), Bearer token (401, before any database
// access), then the handler. Any error becomes a fixed 500: never the token, the headers or the
// original (database) message.
export async function handleIntegrationRequest(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    const env = getIntegrationEnv();
    if (!env) return integrationJson({ error: "not_configured" }, 503);

    const provided = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
    if (provided === undefined || !(await tokensMatch(provided, env.N8N_API_TOKEN))) {
      const response = integrationJson({ error: "unauthorized" }, 401);
      response.headers.set("WWW-Authenticate", "Bearer");
      return response;
    }

    const response = await handler();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("integrations: request failed");
    return integrationJson({ error: "internal_error" }, 500);
  }
}

// Reads at most 4 KiB of UTF-8, stopping as soon as the limit is passed. An empty body is "".
async function readLimitedText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// JSON body validated with the schema; an empty body is read as {}. null if it is larger than
// 4 KiB, not JSON or not valid for the schema (the caller answers 400).
export async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  const text = await readLimitedText(request);
  if (text === null) return null;
  let value: unknown;
  try {
    value = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return null;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
