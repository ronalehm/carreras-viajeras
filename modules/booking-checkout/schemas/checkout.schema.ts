import { z } from "zod";

const uuid = z.uuid();
const campaignCode = z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const paymentChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("full") }).strict(),
  z.object({ kind: z.literal("deposit"), index: z.number().int().min(0).max(2) }).strict(),
]);

export const prepareCheckoutSchema = z.object({
  tripId: uuid,
  campaignCode: campaignCode.optional(),
  paymentChoice: paymentChoiceSchema,
  requestId: uuid,
}).strict();

export const contractAcceptanceSchema = z.object({
  accepted: z.literal(true),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const createCheckoutSessionSchema = z.object({
  requestId: uuid,
  kind: z.enum(["initial", "balance"]),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

// Route segments are validated before any lookup, so a malformed id is a plain 404.
export const bookingRouteParamsSchema = z.object({ bookingId: uuid });
export const attemptRouteParamsSchema = z.object({ bookingId: uuid, attemptId: uuid });

export type PrepareCheckoutInput = z.output<typeof prepareCheckoutSchema>;
export type PaymentChoice = z.output<typeof paymentChoiceSchema>;
export type ContractAcceptanceInput = z.output<typeof contractAcceptanceSchema>;
export type CreateCheckoutSessionInput = z.output<typeof createCheckoutSessionSchema>;
