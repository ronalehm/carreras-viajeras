"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, requireVerifiedEmail, type CurrentUser } from "@/lib/auth/guards";
import { applyRewardSchema, bookingBenefitFormSchema, redemptionRequestSchema, referralClaimSchema, rewardCatalogFormSchema, rewardIdSchema, rewardRuleFormSchema } from "../schemas/rewards.schema";
import { applyRewardToBooking, assignBookingBenefit, cancelOwnRedemption, claimReferral, createCatalogVersion, createRewardRule, deactivateCatalogVersion, deactivateRewardRule, fulfillReward, requestRedemption } from "../services/rewards.service";
import type { RewardActionState, RewardOperationResult } from "../types/rewards.types";

const MESSAGES: Record<string, string> = {
  unauthorized: "Vuelve a iniciar sesión para continuar.",
  forbidden: "Necesitas una cuenta verificada y el permiso correspondiente.",
  invalid_input: "Revisa los datos del formulario.",
  unavailable: "No se pudo completar la operación. Inténtalo de nuevo.",
  invalid_code: "El código no está disponible.",
  self_referral: "No puedes utilizar tu propio código.",
  already_attributed: "Tu cuenta ya tiene un referido registrado.",
  not_eligible: "Tu cuenta no cumple las condiciones de esta atribución.",
  referral_limit: "Se alcanzó el límite de referidos de esta regla.",
  terms_required: "Acepta las condiciones de la atribución.",
  program_unavailable: "La regla cambió o no está disponible. Recarga la página y revisa las condiciones antes de aceptar.",
  reward_unavailable: "La recompensa ya no está disponible.",
  insufficient_stars: "No tienes suficientes estrellas disponibles.",
  review_required: "Hay un ajuste de estrellas pendiente de revisión. Contacta con el equipo.",
  out_of_stock: "Este premio no tiene unidades disponibles.",
  redemption_limit: "Alcanzaste el límite de canjes de este premio.",
  idempotency_conflict: "Esta solicitud ya se utilizó. Recarga la página antes de elegir otro premio.",
  invalid_transition: "El estado actual ya no permite esta operación.",
  not_found: "El registro no está disponible para esta operación.",
  booking_not_eligible: "La reserva no cumple las condiciones para esta operación.",
  discount_already_applied: "La reserva ya tiene un descuento aplicado.",
  discount_exceeds_total: "El descuento debe ser menor que el total de la reserva.",
};

const FIELD_MESSAGES: Record<string, string> = {
  code: "Introduce un código válido.", consent: "Acepta las condiciones de la atribución.",
  pointsPerReferral: "Introduce las estrellas por referido como un entero positivo.",
  maxReferralsPerRunner: "Introduce un límite positivo o deja el campo vacío.",
  validFrom: "Introduce una fecha inicial válida.", validUntil: "Revisa la fecha final y el orden de las fechas.",
  terms: "Escribe entre 10 y 4000 caracteres de condiciones.",
  catalogKey: "Selecciona un premio válido.", title: "Escribe un título de 2 a 120 caracteres.",
  description: "Escribe las condiciones, entre 10 y 4000 caracteres.",
  kind: "Selecciona el tipo de premio.", costStars: "Introduce un coste entero positivo en estrellas.",
  discountUsd: "Indica USD enteros positivos solo para un descuento.",
  stock: "Introduce unidades positivas o deja el campo vacío.",
  maxPerRunner: "Introduce un máximo entero positivo por runner.",
  redemptionDays: "Introduce la vigencia en días, entre 1 y 3650.",
};

function failure(code: string, fieldErrors?: Record<string, string[]>): RewardActionState {
  const safeCode = Object.hasOwn(MESSAGES, code) ? code : "unavailable";
  return { status: "error", code: safeCode, message: MESSAGES[safeCode], ...(fieldErrors && { fieldErrors }) };
}

type Access = "own" | "rewards.manage" | "rewards.apply";

async function run<Input>(access: Access, formData: FormData, schema: z.ZodType<Input>, mutate: (actor: CurrentUser, input: Input) => Promise<RewardOperationResult>, message: string): Promise<RewardActionState> {
  let actor: CurrentUser;
  try {
    actor = await (access === "own" ? requireVerifiedEmail() : requirePermission(access));
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    return failure("unavailable");
  }
  // The actor always comes from Clerk. Zod drops spoofed ids, balances and amounts.
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return failure("invalid_input", Object.fromEntries(fields.map((field) => [field, [FIELD_MESSAGES[field] ?? "El registro no es válido. Recarga la página."]])));
  }
  try {
    const result = await mutate(actor, parsed.data);
    if (result.status === "error") return failure(result.code);
    revalidatePath("/cuenta/perfil");
    revalidatePath("/crm/recompensas");
    revalidatePath("/crm/(protected)/reservas/[id]", "page");
    revalidatePath("/mis-carreras");
    return { status: "success", message };
  } catch {
    // Never send SQL errors, form values or identities to the browser or logs.
    return failure("unavailable");
  }
}

export async function claimReferralAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("own", formData, referralClaimSchema, (actor, input) => claimReferral(actor.id, input.code, input.consent === "on", input.ruleVersionId), "Código aceptado. Las estrellas se acreditan al cumplirse la reserva confirmada y el primer pago válido.");
}
export async function requestRedemptionAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("own", formData, redemptionRequestSchema, (actor, input) => requestRedemption(actor.id, input.catalogVersionId, input.requestKey), "Canje reservado. Consulta su vigencia y condiciones en tus recompensas.");
}
export async function cancelRedemptionAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("own", formData, rewardIdSchema, (actor, input) => cancelOwnRedemption(actor.id, input.id), "Canje cancelado. Se liberaron las estrellas correspondientes.");
}
export async function createRewardRuleAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.manage", formData, rewardRuleFormSchema, (actor, input) => createRewardRule(actor.id, input), "Versión de regla creada.");
}
export async function createCatalogVersionAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.manage", formData, rewardCatalogFormSchema, (actor, input) => createCatalogVersion(actor.id, input), "Versión del premio creada.");
}
export async function deactivateRewardRuleAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.manage", formData, rewardIdSchema, (actor, input) => deactivateRewardRule(actor.id, input.id), "Regla desactivada.");
}
export async function deactivateCatalogVersionAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.manage", formData, rewardIdSchema, (actor, input) => deactivateCatalogVersion(actor.id, input.id), "Versión del premio desactivada.");
}
export async function applyRewardAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.apply", formData, applyRewardSchema, (actor, input) => applyRewardToBooking(actor.id, input.redemptionId, input.bookingId), "Descuento aplicado a la reserva.");
}
export async function assignBookingBenefitAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.manage", formData, bookingBenefitFormSchema, (actor, input) => assignBookingBenefit(actor.id, input), "Beneficio contractual registrado.");
}
export async function fulfillRewardAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  return run("rewards.apply", formData, rewardIdSchema, (actor, input) => fulfillReward(actor.id, input.id), "Entrega del beneficio registrada.");
}
