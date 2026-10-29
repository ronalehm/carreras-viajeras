import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { sponsors } from "@/lib/db-schema";
import { sponsorSlugSchema } from "../schemas/sponsors.schema";
import type { PublicSponsor, Sponsor, SponsorInput, SponsorUpdateInput } from "../types/sponsors.types";

// Only these columns leave the database for public pages: no id, created_by or audit dates.
const publicColumns = {
  slug: sponsors.slug,
  name: sponsors.name,
  logoUrl: sponsors.logoUrl,
  websiteUrl: sponsors.websiteUrl,
  description: sponsors.description,
} satisfies Record<keyof PublicSponsor, unknown>;

const sponsorIdSchema = z.uuid();

// CRM list, by name and slug.
export async function listSponsors(): Promise<Sponsor[]> {
  return getDb().select().from(sponsors).orderBy(asc(sponsors.name), asc(sponsors.slug));
}

export async function getSponsorById(id: string): Promise<Sponsor | null> {
  if (!sponsorIdSchema.safeParse(id).success) return null;
  const [sponsor] = await getDb().select().from(sponsors).where(eq(sponsors.id, id)).limit(1);
  return sponsor ?? null;
}

// A used slug turns the insert into a no-op. The actor always comes from the session.
export async function createSponsor(
  input: SponsorInput,
  actorUserId: string,
): Promise<{ id: string } | "slug_taken"> {
  const [created] = await getDb()
    .insert(sponsors)
    .values({
      slug: input.slug,
      name: input.name,
      logoUrl: input.logoUrl,
      websiteUrl: input.websiteUrl,
      description: input.description,
      createdBy: actorUserId,
    })
    .onConflictDoNothing({ target: sponsors.slug })
    .returning({ id: sponsors.id });
  return created ?? "slug_taken";
}

// Explicit columns: the slug (fixed at creation) and created_by are never updated.
export async function updateSponsor(
  id: string,
  input: SponsorUpdateInput,
): Promise<"updated" | "not_found"> {
  const rows = await getDb()
    .update(sponsors)
    .set({
      name: input.name,
      logoUrl: input.logoUrl,
      websiteUrl: input.websiteUrl,
      description: input.description,
      updatedAt: sql`now()`,
    })
    .where(eq(sponsors.id, id))
    .returning({ id: sponsors.id });
  return rows.length > 0 ? "updated" : "not_found";
}

// Public read per request (connection()): never prerendered at build, where there is no DATABASE_URL.
export async function getPublicSponsorBySlug(slug: string): Promise<PublicSponsor | null> {
  await connection();
  // Only the canonical form (already lowercase and trimmed) is a public URL; anything else is a 404.
  const parsed = sponsorSlugSchema.safeParse(slug);
  if (!parsed.success || parsed.data !== slug) return null;

  const [sponsor] = await getDb()
    .select(publicColumns)
    .from(sponsors)
    .where(eq(sponsors.slug, slug))
    .limit(1);
  return sponsor ?? null;
}
