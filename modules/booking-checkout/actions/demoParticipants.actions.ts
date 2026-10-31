"use server";

import { revalidatePath } from "next/cache";
import type { ConfirmActionState } from "@/components/shared/ConfirmActionButton";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import {
  grantDemoParticipant, grantDemoParticipantSchema, revokeDemoParticipant, revokeDemoParticipantSchema,
  type GrantDemoParticipantResult,
} from "../services/demoParticipants.service";

export type DemoParticipantActionState = ConfirmActionState;

const GRANT_MESSAGES: Record<GrantDemoParticipantResult, ConfirmActionState> = {
  granted: { status: "success", message: "Participante dado de alta." },
  restored: { status: "success", message: "Participante dado de alta de nuevo." },
  already_active: { status: "error", message: "Esa cuenta ya es participante activa de la demo." },
  account_not_found: { status: "error", message: "No hay ninguna cuenta activa con ese correo verificado. La persona debe iniciar sesión una vez en el sitio." },
  ambiguous_account: { status: "error", message: "Hay más de una cuenta con ese correo. Revísalo en Usuarios antes de darla de alta." },
};
// The demo list lives in /crm/contratos and in the Checkout column of /crm/admin/usuarios.
function revalidateDemoPages() {
  revalidatePath("/crm/contratos");
  revalidatePath("/crm/admin/usuarios");
}
const failure = (message: string): ConfirmActionState => ({ status: "error", message });
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

// Every call rechecks offers.manage on the server; the actor comes from the session, never the form.
async function authorize(): Promise<{ actorId: string } | ConfirmActionState> {
  try {
    return { actorId: (await requirePermission("offers.manage")).id };
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("Vuelve a iniciar sesión.");
    if (error instanceof ForbiddenError) return failure("No tienes permiso para gestionar la demo de checkout.");
    return failure("No pudimos verificar tu acceso.");
  }
}

export async function grantDemoParticipantAction(_previous: ConfirmActionState, formData: FormData): Promise<ConfirmActionState> {
  const access = await authorize();
  if (!("actorId" in access)) return access;
  const parsed = grantDemoParticipantSchema.safeParse({ email: text(formData.get("email")), note: text(formData.get("note")) });
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Revisa el correo.");
  try {
    const result = await grantDemoParticipant(parsed.data, access.actorId);
    if (GRANT_MESSAGES[result].status === "success") revalidateDemoPages();
    return GRANT_MESSAGES[result];
  } catch {
    // Driver errors carry statements and parameters; never send their cause to the browser.
    return failure("No pudimos guardar el alta. Inténtalo de nuevo.");
  }
}

export async function revokeDemoParticipantAction(_previous: ConfirmActionState, formData: FormData): Promise<ConfirmActionState> {
  const access = await authorize();
  if (!("actorId" in access)) return access;
  const parsed = revokeDemoParticipantSchema.safeParse({ userId: text(formData.get("userId")) });
  if (!parsed.success) return failure("El participante no existe. Recarga la página.");
  try {
    if (await revokeDemoParticipant(parsed.data) === "not_active") return failure("El participante ya estaba dado de baja. Recarga la página.");
    revalidateDemoPages();
    return { status: "success", message: "Participante dado de baja." };
  } catch {
    return failure("No pudimos guardar la baja. Inténtalo de nuevo.");
  }
}
