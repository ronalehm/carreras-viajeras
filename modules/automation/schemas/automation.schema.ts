import { z } from "zod";
import { tripSlugSchema } from "@/modules/trips";

// 8 is also hard-coded in the automation_events attempts check (lib/db-schema.ts).
export const MAX_ATTEMPTS = 8;
export const LEASE_SECONDS = 300;
export const MAX_CLAIM_LIMIT = 25;
export const DEFAULT_CLAIM_LIMIT = 10;

// lead.created v1: minimum data, no contact details. tripSlug is normalized like trips.slug.
export const leadCreatedPayloadSchema = z.strictObject({
  leadId: z.uuid(),
  tripSlug: tripSlugSchema.nullable(),
  source: z.literal("landing_contact"),
});

export const eventIdSchema = z.uuid();

export const claimRequestSchema = z.strictObject({
  limit: z.int().min(1).max(MAX_CLAIM_LIMIT).default(DEFAULT_CLAIM_LIMIT),
});

export const ackRequestSchema = z.strictObject({
  leaseToken: z.uuid(),
});

// Own error codes only, never provider text.
export const failRequestSchema = z.strictObject({
  leaseToken: z.uuid(),
  errorCode: z.string().regex(/^[a-z0-9_]{1,64}$/),
});
