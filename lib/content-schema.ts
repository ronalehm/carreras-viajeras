import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "@/lib/db-schema";

export const contentCategoryEnum = pgEnum("content_category", ["news", "update", "article"]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "published", "archived"]);

// Revisions are immutable. The lazy references allow both tables to reference each other.
export const contentRevisions = pgTable("content_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references((): AnyPgColumn => contentPosts.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  category: contentCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  imageAlt: text("image_alt"),
  createdBy: text("created_by").notNull().references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("content_revisions_id_post_uq").on(table.id, table.postId),
  uniqueIndex("content_revisions_version_uq").on(table.postId, table.version),
  check("content_revisions_version_chk", sql`${table.version} > 0`),
  check("content_revisions_title_chk", sql`char_length(${table.title}) BETWEEN 3 AND 160`),
  check("content_revisions_summary_chk", sql`char_length(${table.summary}) BETWEEN 10 AND 400`),
  check("content_revisions_body_chk", sql`char_length(${table.body}) BETWEEN 20 AND 30000`),
  check("content_revisions_image_chk", sql`(${table.imageUrl} IS NULL AND ${table.imageAlt} IS NULL) OR (${table.imageUrl} IS NOT NULL AND ${table.imageAlt} IS NOT NULL AND ${table.imageUrl} LIKE 'https://%' AND char_length(${table.imageUrl}) <= 2048 AND char_length(${table.imageAlt}) BETWEEN 3 AND 200)`),
]);

export const contentPosts = pgTable("content_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  draftRevisionId: uuid("draft_revision_id"),
  publishedRevisionId: uuid("published_revision_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: text("published_by").references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  createdBy: text("created_by").notNull().references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("content_posts_slug_uq").on(table.slug),
  index("content_posts_public_idx").on(table.status, table.publishedAt),
  foreignKey({ name: "content_posts_draft_revision_fk", columns: [table.draftRevisionId, table.id], foreignColumns: [contentRevisions.id, contentRevisions.postId] }).onDelete("restrict"),
  foreignKey({ name: "content_posts_published_revision_fk", columns: [table.publishedRevisionId, table.id], foreignColumns: [contentRevisions.id, contentRevisions.postId] }).onDelete("restrict"),
  check("content_posts_slug_chk", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.slug}) BETWEEN 3 AND 100`),
  check("content_posts_version_chk", sql`${table.version} > 0`),
  check("content_posts_publication_chk", sql`(${table.publishedAt} IS NULL) = (${table.publishedBy} IS NULL) AND (${table.status} <> 'published' OR (${table.publishedRevisionId} IS NOT NULL AND ${table.publishedAt} IS NOT NULL))`),
]);
