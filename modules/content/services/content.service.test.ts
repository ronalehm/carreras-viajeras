// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { createContentDraft, getManagedPostById, getPublishedPostBySlug, listPublishedPosts, saveContentDraft, transitionContent } from "./content.service";
import type { ContentDraft } from "../types/content.types";

const ID = "7f095834-fb2a-44d0-89b7-072674a5ce92";
const input: ContentDraft = { slug: "nueva-carrera", category: "news", title: "Nueva carrera", summary: "Una noticia importante.", body: "Contenido completo de la nueva publicación.", imageUrl: null, imageAlt: null };
function fakeDb(responses: unknown[][] = [], failure?: Error) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => { queries.push({ sql, params }); if (failure) throw failure; return { rows: responses[queries.length - 1] ?? [] }; });
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction: vi.fn((work: Promise<unknown>[]) => Promise.all(work)) }) as never) as ReturnType<typeof getDb>);
  return queries;
}
beforeEach(() => vi.resetAllMocks());

describe("public reads", () => {
  it("filters published revision of its own post and never selects internal author ids", async () => {
    const queries = fakeDb();
    await listPublishedPosts({ page: 2, category: "news", limit: 3 });
    expect(connection).toHaveBeenCalledOnce();
    expect(queries[0].sql).toContain('"content_revisions"."id" = "content_posts"."published_revision_id"');
    expect(queries[0].sql).toContain('"content_revisions"."post_id" = "content_posts"."id"');
    expect(queries[0].params).toEqual(["published", "news", 4, 3]);
    expect(queries[0].sql).not.toMatch(/created_by|published_by|draft_revision_id/);
  });
  it("caps lists and reports the extra row only as hasMore", async () => {
    fakeDb([Array.from({ length: 4 }, (_, i) => ({ slug: `post-${i}` }))]);
    const result = await listPublishedPosts({ limit: 3 });
    expect(result.posts).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });
  it("invalid or noncanonical slugs never query the database", async () => {
    const queries = fakeDb();
    await expect(getPublishedPostBySlug("../draft")).resolves.toBeNull();
    await expect(getPublishedPostBySlug("Mayusculas")).resolves.toBeNull();
    expect(queries).toHaveLength(0);
  });
  it("valid missing/draft/archived slugs use the same published-only query", async () => {
    const queries = fakeDb();
    await expect(getPublishedPostBySlug("nueva-carrera")).resolves.toBeNull();
    expect(queries[0].params).toEqual(["published", "nueva-carrera", 1]);
  });
  it("sanitizes failures instead of returning an empty list/404", async () => {
    fakeDb([], new Error("private SQL params"));
    const error = await listPublishedPosts().catch((error: unknown) => error);
    expect(error).toMatchObject({ message: "content: read failed" });
    expect(error).not.toHaveProperty("cause");
  });
});

describe("atomic editorial writes", () => {
  it("creates the draft and immutable revision in one statement, with a server actor", async () => {
    const queries = fakeDb([[{ id: ID }]]);
    await expect(createContentDraft(input, "user_admin")).resolves.toEqual({ id: ID });
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("WITH post AS");
    expect(queries[0].sql).toContain("INSERT INTO content_revisions");
    expect(queries[0].params).toContain("user_admin");
    expect(queries[0].sql).not.toContain("'published'");
  });
  it("returns duplicate slug without creating another publication", async () => {
    fakeDb([[]]);
    await expect(createContentDraft(input, "user_admin")).resolves.toBe("slug_taken");
  });
  it.each([
    [{ changed: false, status: null, current_version: null, locked: false }, "not_found"],
    [{ changed: false, status: "published", current_version: 4, locked: false }, "conflict"],
    [{ changed: false, status: "draft", current_version: 3, locked: true }, "slug_locked"],
    [{ changed: false, status: "archived", current_version: 3, locked: false }, "archived"],
    [{ changed: true, status: "published", current_version: 3, locked: false }, "saved"],
  ] as const)("maps save result %j to %s", async (row, expected) => {
    const queries = fakeDb([[row]]);
    await expect(saveContentDraft(ID, 3, input, "user_admin")).resolves.toBe(expected);
    expect(queries[0].sql).toContain("FOR UPDATE");
    expect(queries[0].sql).toContain("target.version =");
    expect(queries[0].sql).toContain("target.published_at IS NULL OR target.slug =");
    expect(queries[0].sql).not.toMatch(/SET[\s\S]*published_revision_id/);
  });
  it.each(["publish", "unpublish", "archive"] as const)("%s requires matching version and preserves the first publication audit", async (operation) => {
    const queries = fakeDb([[{ changed: true, status: "draft", current_version: 2 }]]);
    await expect(transitionContent(ID, 2, operation, "user_admin")).resolves.toBe("saved");
    expect(queries[0].sql).toContain("target.version =");
    expect(queries[0].sql).toContain("coalesce(post.published_at, now())");
    expect(queries[0].sql).toContain("r.post_id = target.id");
  });
  it("rejects stale publication rather than publishing an old revision", async () => {
    fakeDb([[{ changed: false, status: "published", current_version: 6 }]]);
    await expect(transitionContent(ID, 5, "publish", "user_admin")).resolves.toBe("conflict");
  });
  it("sanitizes write failures and causes", async () => {
    fakeDb([], new Error("private editorial text"));
    const result = await saveContentDraft(ID, 1, input, "user_admin").catch((error: unknown) => error);
    expect(result).toMatchObject({ message: "content: write failed" });
    expect(result).not.toHaveProperty("cause");
  });
  it("rejects invalid admin ids before querying", async () => {
    const queries = fakeDb();
    await expect(getManagedPostById("not-an-id")).resolves.toBeNull();
    expect(queries).toHaveLength(0);
  });
});
