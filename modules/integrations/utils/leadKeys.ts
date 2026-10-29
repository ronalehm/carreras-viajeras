import "server-only";
import { sha256 } from "./integrationRequest";

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

// Stable leads.idempotency_key for an n8n record: SHA-256 of "<source>:<externalId>", first 16
// bytes as a UUID version 8 (custom) with the RFC 9562 variant. n8n never generates UUIDs.
export async function deriveIdempotencyKey(source: "google_form" | "import", externalId: string): Promise<string> {
  const bytes = (await sha256(`${source}:${externalId}`)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// leads.submission_hash: SHA-256 hex of the normalized fields, in a fixed order.
export async function hashSubmission(fields: readonly unknown[]): Promise<string> {
  return toHex(await sha256(JSON.stringify(fields)));
}
