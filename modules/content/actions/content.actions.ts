"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { contentDraftSchema, contentVersionSchema } from "../schemas/content.schema";
import { createContentDraft, saveContentDraft, transitionContent } from "../services/content.service";
import type { ContentActionState, ContentMutationResult } from "../types/content.types";

const MESSAGES: Record<string, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar contenidos.",
  invalid_input: "Revisa los campos marcados.",
  not_found: "La publicación ya no existe.", conflict: "Otra persona cambió la publicación. Recarga antes de guardar.",
  archived: "La publicación está archivada.", slug_locked: "El identificador queda fijo desde la primera publicación.",
  slug_taken: "Ya existe una publicación con ese identificador.", unavailable: "No pudimos guardar el contenido. Inténtalo de nuevo.",
};
function failure(code: string, values?: Record<string, string>, fieldErrors?: Record<string, string[]>): ContentActionState {
  return { status: "error", code, message: MESSAGES[code] ?? MESSAGES.unavailable, ...(values && { values }), ...(fieldErrors && { fieldErrors }) };
}
async function actor(): Promise<string | ContentActionState> {
  try { return (await requirePermission("content.manage")).id; }
  catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    throw new Error("content: authorization failed");
  }
}
function refresh() {
  revalidatePath("/"); revalidatePath("/noticias"); revalidatePath("/noticias/[slug]", "page");
  revalidatePath("/crm/contenidos"); revalidatePath("/crm/(protected)/contenidos/[id]", "page");
}

export async function saveContentAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const actorId = await actor();
  if (typeof actorId !== "string") return actorId;
  const raw = Object.fromEntries(formData);
  const fields = ["slug", "category", "title", "summary", "body", "imageUrl", "imageAlt"];
  const values = Object.fromEntries(fields.flatMap((field) => typeof raw[field] === "string" ? [[field, raw[field] as string]] : []));
  const parsed = contentDraftSchema.safeParse(raw);
  if (!parsed.success) return failure("invalid_input", values, parsed.error.flatten().fieldErrors as Record<string, string[]>);
  const existing = raw.id !== undefined && raw.id !== "";
  const target = existing ? contentVersionSchema.safeParse(raw) : null;
  if (target && !target.success) return failure("invalid_input", values);
  let id: string;
  try {
    if (target?.success) {
      const result = await saveContentDraft(target.data.id, target.data.version, parsed.data, actorId);
      if (result !== "saved") return failure(result, values);
      id = target.data.id;
    } else {
      const result = await createContentDraft(parsed.data, actorId);
      if (result === "slug_taken") return failure(result, values, { slug: [MESSAGES.slug_taken] });
      id = result.id;
    }
  } catch { return failure("unavailable", values); }
  refresh();
  redirect(`/crm/contenidos/${id}`);
}

async function transition(formData: FormData, operation: "publish" | "unpublish" | "archive"): Promise<ContentActionState> {
  const actorId = await actor();
  if (typeof actorId !== "string") return actorId;
  const parsed = contentVersionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input");
  let result: ContentMutationResult;
  try { result = await transitionContent(parsed.data.id, parsed.data.version, operation, actorId); }
  catch { return failure("unavailable"); }
  if (result !== "saved") return failure(result);
  refresh();
  return { status: "success", message: operation === "publish" ? "Contenido publicado." : operation === "unpublish" ? "Contenido retirado de la web pública." : "Contenido archivado." };
}
export async function publishContentAction(_previous: ContentActionState, data: FormData) { return transition(data, "publish"); }
export async function unpublishContentAction(_previous: ContentActionState, data: FormData) { return transition(data, "unpublish"); }
export async function archiveContentAction(_previous: ContentActionState, data: FormData) { return transition(data, "archive"); }
