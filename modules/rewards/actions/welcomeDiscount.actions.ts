"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { welcomeDiscountSchema } from "../schemas/rewards.schema";
import { createWelcomeDiscountVersion } from "../services/welcomeDiscount.service";
import type { RewardActionState } from "../types/rewards.types";

const MESSAGES = {
  unauthorized: "Vuelve a iniciar sesión para continuar.",
  forbidden: "Necesitas una cuenta verificada y el permiso correspondiente.",
  invalid_input: "Revisa los datos del formulario.",
  unavailable: "No se pudo guardar el descuento de bienvenida. Inténtalo de nuevo.",
} as const;

const FIELD_MESSAGES: Record<string, string> = {
  amountUsd: "Introduce el importe en US$ como un entero entre 1 y 10 000.",
  validityDays: "Introduce la vigencia en días, entre 1 y 365.",
};

function failure(code: keyof typeof MESSAGES, fieldErrors?: Record<string, string[]>): RewardActionState {
  return { status: "error", code, message: MESSAGES[code], ...(fieldErrors && { fieldErrors }) };
}

export async function saveWelcomeDiscountAction(_prev: RewardActionState, formData: FormData): Promise<RewardActionState> {
  let actor: CurrentUser;
  try {
    actor = await requirePermission("rewards.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    return failure("unavailable");
  }
  // The actor always comes from Clerk; Zod keeps only amount, validity and the active checkbox.
  const parsed = welcomeDiscountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return failure("invalid_input", Object.fromEntries(fields.map((field) => [field, [FIELD_MESSAGES[field] ?? "El valor no es válido."]])));
  }
  try {
    const result = await createWelcomeDiscountVersion(actor.id, parsed.data);
    if (result.status === "error") return failure("unavailable");
    revalidatePath("/crm/recompensas");
    return {
      status: "success",
      message: parsed.data.active
        ? "Descuento de bienvenida guardado. Los nuevos códigos usarán esta configuración."
        : "Descuento de bienvenida desactivado. No se emitirán códigos nuevos.",
    };
  } catch {
    // Never send SQL errors, form values or identities to the browser or logs.
    return failure("unavailable");
  }
}
