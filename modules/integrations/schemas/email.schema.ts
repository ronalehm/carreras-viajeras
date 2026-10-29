import { z } from "zod";
import { clientEmailKindEnum, leadStageEnum } from "@/lib/db-schema";

export const emailStageSchema = z.enum(leadStageEnum.enumValues);
// What each client_emails row is for (crm-lifecycle-emails.md, requirement 2).
export const clientEmailKindSchema = z.enum(clientEmailKindEnum.enumValues);
// Internal alerts to the team or the lead's owner: never a client email (no opt-out rule, never
// counted as the funnel card's client email).
export const internalEmailKindSchema = clientEmailKindSchema.extract(["team_alert", "owner_alert"]);
export const emailClaimSchema = z
  .object({
    executionId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
    limit: z.number().int().min(1).max(10).default(1),
  })
  .strict();
export const emailAttemptSchema = z.object({ attemptToken: z.uuid() }).strict();
export const emailAckSchema = emailAttemptSchema
  .extend({
    smtpMessageId: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .regex(/^[^\r\n\x00-\x1f\x7f]+$/)
      .optional(),
  })
  .strict();
export const emailFailSchema = emailAttemptSchema
  .extend({
    kind: z.enum(["before_send", "smtp_unknown"]).default("smtp_unknown"),
  })
  .strict();
export const emailOperationSchema = z.enum(["authorize", "ack", "fail"]);
