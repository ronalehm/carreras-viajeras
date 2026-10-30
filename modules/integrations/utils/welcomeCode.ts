import { randomBytes } from "node:crypto";

// Welcome discount code (docs/specs/crm-welcome-discount.md, requirement 2): «CV-» plus 6 characters
// of a 32-symbol alphabet without 0, O, 1 or I. Same format as welcome_discount_codes_code_chk
// (migration 0019). Uniqueness is enforced by the unique index on code: the caller retries on conflict.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export const WELCOME_CODE_PATTERN = /^CV-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export function generateWelcomeCode(): string {
  // 256 is a multiple of 32, so the low 5 bits of a random byte are uniform (no modulo bias).
  const suffix = Array.from(randomBytes(CODE_LENGTH), (byte) => ALPHABET[byte & 31]).join("");
  return `CV-${suffix}`;
}
