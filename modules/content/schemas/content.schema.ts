import { z } from "zod";

export const contentCategorySchema = z.enum(["news", "update", "article"]);
export const contentSlugSchema = z.string().min(3).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/,
  "Usa minúsculas, números y guiones.");
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
export const contentDraftSchema = z.object({
  slug: contentSlugSchema,
  category: contentCategorySchema,
  title: z.string().trim().min(3, "El título necesita al menos 3 caracteres.").max(160),
  summary: z.string().trim().min(10, "El resumen necesita al menos 10 caracteres.").max(400),
  body: z.string().trim().min(20, "El contenido necesita al menos 20 caracteres.").max(30000),
  imageUrl: optionalText(2048).refine((v) => v === null || (() => { try { const url = new URL(v); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } })(), "La imagen debe usar una URL HTTPS sin credenciales."),
  imageAlt: optionalText(200),
}).superRefine((data, ctx) => {
  if (data.imageUrl && (!data.imageAlt || data.imageAlt.length < 3))
    ctx.addIssue({ code: "custom", path: ["imageAlt"], message: "Describe la imagen con al menos 3 caracteres." });
  if (!data.imageUrl && data.imageAlt)
    ctx.addIssue({ code: "custom", path: ["imageUrl"], message: "Añade la URL de la imagen o elimina su descripción." });
});
export const contentVersionSchema = z.object({ id: z.uuid(), version: z.coerce.number().int().min(1).max(2147483646) });
export const contentQuerySchema = z.object({
  page: z.preprocess((value) => Array.isArray(value) ? undefined : value, z.coerce.number().int().min(1).max(10000).optional().catch(undefined)),
  category: contentCategorySchema.optional().catch(undefined),
});
