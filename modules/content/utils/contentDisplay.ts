import type { ContentCategory, ContentStatus } from "../types/content.types";
export const CONTENT_CATEGORY_LABELS: Record<ContentCategory, string> = { news: "Noticia", update: "Actualización", article: "Artículo" };
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = { draft: "Borrador", published: "Publicado", archived: "Archivado" };
const formatter = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" });
export function formatContentDate(date: Date): string { return formatter.format(date); }
