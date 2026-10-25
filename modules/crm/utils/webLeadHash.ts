export type WebLeadHashInput = {
  fullName: string;
  phone: string;
  email: string;
  tripSlug: string;
  destinationName: string;
  consentVersion: string;
};

const encoder = new TextEncoder();

// leads.request_hash: SHA-256 (lowercase hex, 64 chars) of the normalized fields. It tells a retry
// with the same idempotency key apart from a different submission; the key and the Turnstile
// token are not part of it. Web Crypto, so it runs the same in Workers and Node.
export async function webLeadRequestHash(input: WebLeadHashInput): Promise<string> {
  const payload = JSON.stringify([
    input.fullName,
    input.phone,
    input.email,
    input.tripSlug,
    input.destinationName,
    input.consentVersion,
  ]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(payload)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
