"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import {
  contractFormSchema, contractEditSchema, contractApprovalSchema,
  type ContractActionState,
} from "../schemas/contracts.schema";
import {
  createContractDraft, updateContractDraft, approveContractVersion,
} from "../services/contracts.service";

const MESSAGES: Record<string, string> = {
  version_exists: "Ese identificador de versión ya existe. Usa uno nuevo.",
  not_draft: "La versión ya está aprobada y no se puede editar.",
  not_found: "El contrato no existe. Recarga la página.",
  changed: "El documento cambió. Recarga y vuelve a revisar el texto antes de aprobarlo.",
};
const failure = (message: string): ContractActionState => ({ status: "error", message });

async function mutate<Input>(
  formData: FormData,
  schema: z.ZodType<Input>,
  fields: readonly string[],
  service: (input: Input, actorId: string) => Promise<{ id: string } | string>,
  success: string,
): Promise<ContractActionState> {
  let actor;
  try {
    actor = await requirePermission("offers.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("Vuelve a iniciar sesión.");
    if (error instanceof ForbiddenError) return failure("No tienes permiso para gestionar contratos.");
    return failure("No pudimos verificar tu acceso.");
  }
  const values = Object.fromEntries(fields.map(field => [field, formData.get(field)]));
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
    return { status: "error", message: "Revisa los campos del contrato.", fieldErrors };
  }
  try {
    const result = await service(parsed.data, actor.id);
    if (typeof result === "string" && result !== "updated" && result !== "approved") {
      return failure(MESSAGES[result] ?? "No pudimos guardar el contrato.");
    }
    revalidatePath("/crm/contratos");
    return { status: "success", message: success };
  } catch {
    // Driver errors carry statements and parameters; never send their cause to the browser.
    return failure("No pudimos guardar el contrato. Inténtalo de nuevo.");
  }
}

export async function createContractAction(_previous: ContractActionState, formData: FormData): Promise<ContractActionState> {
  return mutate(formData, contractFormSchema, Object.keys(contractFormSchema.shape), createContractDraft, "Borrador creado.");
}
export async function updateContractAction(_previous: ContractActionState, formData: FormData): Promise<ContractActionState> {
  return mutate(formData, contractEditSchema, Object.keys(contractEditSchema.shape), updateContractDraft, "Borrador guardado.");
}
export async function approveContractAction(_previous: ContractActionState, formData: FormData): Promise<ContractActionState> {
  return mutate(formData, contractApprovalSchema, Object.keys(contractApprovalSchema.shape), approveContractVersion, "Versión aprobada.");
}
