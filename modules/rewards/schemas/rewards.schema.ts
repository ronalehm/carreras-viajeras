import { z } from "zod";

const integerText = (min: number, max: number) => z.string().trim().regex(/^\d+$/, "Introduce un número entero.").transform(Number).pipe(z.number().int().min(min).max(max));
const optionalInteger = (max: number) => z.string().optional().transform((value) => value?.trim() || null).pipe(integerText(1, max).nullable());
const text = (min: number, max: number) => z.string().trim().min(min, `Escribe al menos ${min} caracteres.`).max(max, `Máximo ${max} caracteres.`);
const optionalDate = z.string().optional().transform((value) => value?.trim() || null).pipe(z.iso.date().nullable());
const active = z.string().optional().transform((value) => value === "on");
const dates = { validFrom: z.iso.date({ error: "Indica una fecha válida." }), validUntil: optionalDate };

export const rewardRuleFormSchema = z.object({
  pointsPerReferral: integerText(1, 1000000),
  maxReferralsPerRunner: optionalInteger(1000000),
  ...dates,
  terms: text(10, 4000),
  active,
}).refine((value) => value.validUntil === null || value.validUntil >= value.validFrom, { path: ["validUntil"], error: "La fecha final debe ser posterior o igual a la inicial." });

export const rewardCatalogFormSchema = z.object({
  catalogKey: z.string().optional().transform((value) => value?.trim() || null).pipe(z.uuid().nullable()),
  title: text(2, 120),
  description: text(10, 4000),
  kind: z.enum(["discount", "benefit"]),
  costStars: integerText(1, 1000000),
  discountUsd: optionalInteger(1000000),
  stock: optionalInteger(1000000),
  maxPerRunner: integerText(1, 10000),
  redemptionDays: integerText(1, 3650),
  ...dates,
  active,
}).superRefine((value, ctx) => {
  if ((value.kind === "discount") !== (value.discountUsd !== null)) ctx.addIssue({ code: "custom", path: ["discountUsd"], message: value.kind === "discount" ? "Indica el descuento en USD enteros." : "Un beneficio no monetario no lleva descuento." });
  if (value.validUntil !== null && value.validUntil < value.validFrom) ctx.addIssue({ code: "custom", path: ["validUntil"], message: "Revisa las fechas de vigencia." });
});

export const referralClaimSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{24,64}$/, "El código no es válido."),
  consent: z.literal("on", { error: "Confirma que aceptas las condiciones del referido." }),
  ruleVersionId: z.uuid(),
});
export const rewardIdSchema = z.object({ id: z.uuid() });
export const redemptionRequestSchema = z.object({ catalogVersionId: z.uuid(), requestKey: z.uuid() });
export const applyRewardSchema = z.object({ redemptionId: z.uuid(), bookingId: z.uuid() });
export const bookingBenefitFormSchema = z.object({ bookingId: z.uuid(), title: text(2, 120), description: text(10, 4000) });

// Welcome discount configuration. Only the form fields; the actor comes from the session.
export const welcomeDiscountSchema = z.object({
  amountUsd: integerText(1, 10000),
  validityDays: integerText(1, 365),
  active,
});
