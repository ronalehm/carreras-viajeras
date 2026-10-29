import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { contentPosts, contentRevisions } from "@/lib/content-schema";
import { contentSlugSchema } from "../schemas/content.schema";
import type { ContentCategory, ContentDraft, ContentMutationResult, ManagedPost, ManagedPostListItem, PublicPost } from "../types/content.types";

const publicColumns = {
  slug: contentPosts.slug, category: contentRevisions.category, title: contentRevisions.title,
  summary: contentRevisions.summary, body: contentRevisions.body, imageUrl: contentRevisions.imageUrl,
  imageAlt: contentRevisions.imageAlt, publishedAt: contentPosts.publishedAt,
};
const published = and(eq(contentPosts.status, "published"), eq(contentRevisions.postId, contentPosts.id));
const uuid = z.uuid();

async function safeRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch { throw new Error("content: read failed"); }
}

// Request-only reads: no credentials or database queries during import/build.
export async function listPublishedPosts({ page = 1, category, limit = 12 }: { page?: number; category?: ContentCategory; limit?: number } = {}) {
  await connection();
  const safePage = Number.isInteger(page) && page > 0 && page <= 10000 ? page : 1;
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 12) : 12;
  return safeRead(async () => {
    const rows = await getDb().select(publicColumns).from(contentPosts)
      .innerJoin(contentRevisions, eq(contentRevisions.id, contentPosts.publishedRevisionId))
      .where(and(published, category ? eq(contentRevisions.category, category) : undefined))
      .orderBy(desc(contentPosts.publishedAt), contentPosts.slug).limit(safeLimit + 1).offset((safePage - 1) * safeLimit);
    return { posts: rows.slice(0, safeLimit) as PublicPost[], page: safePage, hasMore: rows.length > safeLimit };
  });
}

// React cache is request-local and deduplicates metadata + article reads, never publication state between requests.
export const getPublishedPostBySlug = cache(async (slug: string): Promise<PublicPost | null> => {
  await connection();
  if (!contentSlugSchema.safeParse(slug).success) return null;
  return safeRead(async () => {
    const [row] = await getDb().select(publicColumns).from(contentPosts)
      .innerJoin(contentRevisions, eq(contentRevisions.id, contentPosts.publishedRevisionId))
      .where(and(published, eq(contentPosts.slug, slug))).limit(1);
    return row ? row as PublicPost : null;
  });
});

const managedColumns = {
  id: contentPosts.id, slug: contentPosts.slug, status: contentPosts.status, version: contentPosts.version,
  title: contentRevisions.title, category: contentRevisions.category, publishedAt: contentPosts.publishedAt,
  updatedAt: contentPosts.updatedAt,
  hasPendingChanges: sql<boolean>`${contentPosts.status} = 'published' AND ${contentPosts.draftRevisionId} IS DISTINCT FROM ${contentPosts.publishedRevisionId}`,
};

export function listManagedPosts(): Promise<ManagedPostListItem[]> {
  return safeRead(() => getDb().select(managedColumns).from(contentPosts)
    .innerJoin(contentRevisions, eq(contentRevisions.id, contentPosts.draftRevisionId))
    .orderBy(desc(contentPosts.updatedAt), contentPosts.slug).limit(200));
}

export async function getManagedPostById(id: string): Promise<ManagedPost | null> {
  if (!uuid.safeParse(id).success) return null;
  return safeRead(async () => {
    const [row] = await getDb().select({ ...managedColumns, draft: {
      slug: contentPosts.slug, title: contentRevisions.title, category: contentRevisions.category,
      summary: contentRevisions.summary, body: contentRevisions.body, imageUrl: contentRevisions.imageUrl, imageAlt: contentRevisions.imageAlt,
    } }).from(contentPosts).innerJoin(contentRevisions, eq(contentRevisions.id, contentPosts.draftRevisionId))
      .where(eq(contentPosts.id, id)).limit(1);
    return row ?? null;
  });
}

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && !!error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "23505";
}

// Both mutually-referencing rows are created in one statement; FK triggers see the completed statement.
export async function createContentDraft(input: ContentDraft, actorId: string): Promise<{ id: string } | "slug_taken"> {
  const id = randomUUID(), revisionId = randomUUID();
  try {
    const result = await getDb().execute<{ id: string }>(sql`
      WITH post AS (
        INSERT INTO content_posts (id, slug, draft_revision_id, created_by)
        VALUES (${id}::uuid, ${input.slug}, ${revisionId}::uuid, ${actorId})
        ON CONFLICT (slug) DO NOTHING RETURNING id
      ), revision AS (
        INSERT INTO content_revisions (id, post_id, version, category, title, summary, body, image_url, image_alt, created_by)
        SELECT ${revisionId}::uuid, post.id, 1, ${input.category}::content_category, ${input.title}, ${input.summary},
          ${input.body}, ${input.imageUrl}, ${input.imageAlt}, ${actorId} FROM post RETURNING id
      ) SELECT post.id FROM post, revision
    `);
    return result.rows[0] ?? "slug_taken";
  } catch (error) {
    if (uniqueViolation(error)) return "slug_taken";
    throw new Error("content: write failed");
  }
}

export async function saveContentDraft(id: string, version: number, input: ContentDraft, actorId: string): Promise<ContentMutationResult> {
  const revisionId = randomUUID();
  try {
    const result = await getDb().execute<{ changed: boolean; status: string | null; current_version: number | null; locked: boolean }>(sql`
      WITH target AS MATERIALIZED (
        SELECT id, status, version, slug, published_at FROM content_posts WHERE id = ${id}::uuid FOR UPDATE
      ), changed AS (
        UPDATE content_posts post SET slug = ${input.slug}, version = post.version + 1,
          draft_revision_id = ${revisionId}::uuid, updated_at = now()
        FROM target WHERE post.id = target.id AND target.status <> 'archived' AND target.version = ${version}::integer
          AND (target.published_at IS NULL OR target.slug = ${input.slug})
        RETURNING post.id, post.version
      ), revision AS (
        INSERT INTO content_revisions (id, post_id, version, category, title, summary, body, image_url, image_alt, created_by)
        SELECT ${revisionId}::uuid, changed.id, changed.version, ${input.category}::content_category,
          ${input.title}, ${input.summary}, ${input.body}, ${input.imageUrl}, ${input.imageAlt}, ${actorId}
        FROM changed RETURNING id
      ) SELECT EXISTS (SELECT 1 FROM revision) AS changed,
        (SELECT status FROM target) AS status, (SELECT version FROM target) AS current_version,
        coalesce((SELECT published_at IS NOT NULL AND slug <> ${input.slug} FROM target), false) AS locked
    `);
    const row = result.rows[0];
    if (row?.changed) return "saved";
    if (!row?.status) return "not_found";
    if (row.status === "archived") return "archived";
    if (row.current_version !== version) return "conflict";
    return row.locked ? "slug_locked" : "conflict";
  } catch (error) {
    if (uniqueViolation(error)) return "slug_taken";
    throw new Error("content: write failed");
  }
}

export async function transitionContent(id: string, version: number, transition: "publish" | "unpublish" | "archive", actorId: string): Promise<ContentMutationResult> {
  try {
    const result = await getDb().execute<{ changed: boolean; status: string | null; current_version: number | null }>(sql`
      WITH target AS MATERIALIZED (
        SELECT id, status, version, draft_revision_id FROM content_posts WHERE id = ${id}::uuid FOR UPDATE
      ), changed AS (
        UPDATE content_posts post SET status = ${transition === "publish" ? "published" : transition === "archive" ? "archived" : "draft"}::content_status,
          published_revision_id = CASE WHEN ${transition} = 'publish' THEN target.draft_revision_id ELSE post.published_revision_id END,
          published_at = CASE WHEN ${transition} = 'publish' THEN coalesce(post.published_at, now()) ELSE post.published_at END,
          published_by = CASE WHEN ${transition} = 'publish' THEN coalesce(post.published_by, ${actorId}) ELSE post.published_by END,
          version = post.version + 1, updated_at = now()
        FROM target WHERE post.id = target.id AND target.version = ${version}::integer AND target.status <> 'archived'
          AND (${transition} <> 'unpublish' OR target.status = 'published')
          AND (${transition} <> 'publish' OR EXISTS (SELECT 1 FROM content_revisions r WHERE r.id = target.draft_revision_id AND r.post_id = target.id))
        RETURNING post.id
      ) SELECT EXISTS (SELECT 1 FROM changed) AS changed,
        (SELECT status FROM target) AS status, (SELECT version FROM target) AS current_version
    `);
    const row = result.rows[0];
    if (row?.changed) return "saved";
    if (!row?.status) return "not_found";
    return row.status === "archived" ? "archived" : "conflict";
  } catch { throw new Error("content: write failed"); }
}
