import type { z } from "zod";
import type { contentDraftSchema, contentCategorySchema } from "../schemas/content.schema";

export type ContentCategory = z.infer<typeof contentCategorySchema>;
export type ContentDraft = z.output<typeof contentDraftSchema>;
export type ContentStatus = "draft" | "published" | "archived";
export type PublicPost = Omit<ContentDraft, "slug"> & { slug: string; publishedAt: Date };
export type ManagedPostListItem = {
  id: string; slug: string; status: ContentStatus; version: number; title: string;
  category: ContentCategory; publishedAt: Date | null; updatedAt: Date; hasPendingChanges: boolean;
};
export type ManagedPost = ManagedPostListItem & { draft: ContentDraft };
export type ContentMutationResult = "saved" | "not_found" | "conflict" | "archived" | "slug_locked" | "slug_taken";
export type ContentActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; code: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> };
