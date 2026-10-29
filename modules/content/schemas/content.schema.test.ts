// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentDraftSchema, contentQuerySchema, contentSlugSchema, contentVersionSchema } from "./content.schema";

const valid = { slug: "nueva-carrera", category: "news", title: " Nueva carrera ", summary: " Una noticia importante. ", body: " Primer párrafo de nuestra publicación. ", imageUrl: "", imageAlt: "" };
describe("editorial boundary", () => {
  it("normalizes text, drops actor/state fields and treats empty images as absent", () => {
    const result = contentDraftSchema.parse({ ...valid, createdBy: "attacker", status: "published", publishedAt: "tomorrow" });
    expect(result).toEqual({ slug: valid.slug, category: "news", title: "Nueva carrera", summary: "Una noticia importante.", body: "Primer párrafo de nuestra publicación.", imageUrl: null, imageAlt: null });
  });
  it.each(["Mayuscula", "con espacios", "../draft", "a", "a".repeat(101)])("rejects noncanonical slug %s", (slug) => {
    expect(contentSlugSchema.safeParse(slug).success).toBe(false);
  });
  it("requires alt for a HTTPS image, and rejects non-HTTPS URLs", () => {
    expect(contentDraftSchema.safeParse({ ...valid, imageUrl: "https://example.com/photo.webp", imageAlt: "" }).success).toBe(false);
    expect(contentDraftSchema.safeParse({ ...valid, imageUrl: "http://example.com/photo.webp", imageAlt: "Una carrera" }).success).toBe(false);
    expect(contentDraftSchema.safeParse({ ...valid, imageUrl: "javascript:alert(1)", imageAlt: "Una carrera" }).success).toBe(false);
    expect(contentDraftSchema.safeParse({ ...valid, imageUrl: "https://user:secret@example.com/photo.webp", imageAlt: "Una carrera" }).success).toBe(false);
    expect(contentDraftSchema.safeParse({ ...valid, imageUrl: "https://example.com/photo.webp", imageAlt: "Una carrera" }).success).toBe(true);
  });
  it.each(["title", "summary", "body"])("rejects blank %s", (field) => {
    expect(contentDraftSchema.safeParse({ ...valid, [field]: "  " }).success).toBe(false);
  });
  it("treats HTML as text data rather than allowing a renderer format", () => {
    expect(contentDraftSchema.parse({ ...valid, body: "<script>alert('not executed')</script>", format: "html" }).body).toContain("<script>");
  });
  it("validates optimistic versions and drops invalid public filters", () => {
    expect(contentVersionSchema.safeParse({ id: "fake", version: 1 }).success).toBe(false);
    expect(contentVersionSchema.safeParse({ id: "7f095834-fb2a-44d0-89b7-072674a5ce92", version: 0 }).success).toBe(false);
    expect(contentQuerySchema.parse({ page: "-1", category: "private" })).toEqual({ page: undefined, category: undefined });
    expect(contentQuerySchema.parse({ page: "2", category: "update" })).toEqual({ page: 2, category: "update" });
    expect(contentQuerySchema.parse({ page: ["2"], category: ["news"] })).toEqual({ page: undefined, category: undefined });
  });
});
