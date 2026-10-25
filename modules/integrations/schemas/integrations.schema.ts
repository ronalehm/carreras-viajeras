import { z } from "zod";

export const CLAIM_DEFAULT_LIMIT = 10;
export const CLAIM_MAX_LIMIT = 25;

export const claimRequestSchema = z.object({
  limit: z.number().int().min(1).max(CLAIM_MAX_LIMIT).default(CLAIM_DEFAULT_LIMIT),
});

export const ackRequestSchema = z.object({ leaseToken: z.uuid() });

// Short code only (it is stored in last_error_code): never provider text.
export const failRequestSchema = z.object({
  leaseToken: z.uuid(),
  errorCode: z.string().regex(/^[a-z0-9_]{1,40}$/),
});

export const eventIdSchema = z.uuid();
export const leadIdSchema = z.uuid();
