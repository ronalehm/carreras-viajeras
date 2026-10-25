import { z } from "zod";
import { phoneSchema } from "@/lib/phone";
import { contactPreferenceEnum, leadChannelEnum } from "@/lib/db-schema";

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

// Consent text versions accepted per entry path (closed list; Ley 29733 texts confirmed by the user).
export const INTEGRATION_CONSENT_VERSIONS = {
  google_form: ["google-form-v1"],
  import: ["import-mml-v1"],
} as const satisfies Record<"google_form" | "import", readonly string[]>;

const CONSENT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// A blank cell ("" or only spaces), null or a missing key becomes null.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === undefined || (typeof value === "string" && value.trim() === "") ? null : value),
    schema.nullable(),
  );

// POST /api/integrations/n8n/leads (Google Forms answer or one-off import row). Unknown keys such
// as ownerUserId, stage, bulk or createdBy are dropped: owner, author, stage and bulk are decided by
// the server.
export const createIntegrationLeadSchema = z
  .object({
    source: z.enum(["google_form", "import"]),
    externalId: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/),
    consentVersion: z.string().max(40),
    consentedAt: z.iso
      .datetime({ offset: true })
      .refine((value) => Date.parse(value) <= Date.now() + CONSENT_FUTURE_TOLERANCE_MS),
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    email: optional(z.string().trim().toLowerCase().pipe(z.email().max(254))),
    tripSlug: optional(z.string().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)),
    destinationText: optional(z.string().trim().min(1).max(120)),
    channel: z.enum(leadChannelEnum.enumValues).default("unknown"),
    originDetail: optional(z.string().trim().min(2).max(120)),
    referredBy: optional(z.string().trim().min(2).max(120)),
    contactPreference: optional(z.enum(contactPreferenceEnum.enumValues)),
  })
  .superRefine((value, ctx) => {
    const accepted: readonly string[] = INTEGRATION_CONSENT_VERSIONS[value.source];
    if (!accepted.includes(value.consentVersion)) {
      ctx.addIssue({ code: "custom", path: ["consentVersion"], message: "Unknown consent version." });
    }
  });
