import "server-only";
import { and, asc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { trips } from "@/lib/db-schema";
import { tripSlugSchema } from "../schemas/trips.schema";
import type { PublicTrip, Trip, TripInput, TripStatus } from "../types/trips.types";

// Target status → allowed source statuses (Requirement 2). archived is final.
const STATUS_SOURCES: Record<TripStatus, TripStatus[]> = {
  published: ["draft"],
  draft: ["published"],
  archived: ["draft", "published"],
};

// Only these columns leave the database for the landing: no id, status or audit dates.
const publicColumns = {
  slug: trips.slug,
  title: trips.title,
  city: trips.city,
  country: trips.country,
  raceDate: trips.raceDate,
  startDate: trips.startDate,
  endDate: trips.endDate,
  distances: trips.distances,
  summary: trips.summary,
  includes: trips.includes,
  priceUsd: trips.priceUsd,
  capacity: trips.capacity,
  imageUrl: trips.imageUrl,
} satisfies Record<keyof PublicTrip, unknown>;

const tripIdSchema = z.uuid();

// Explicit editable columns: status, id and audit dates never come from the input.
function editableColumns(input: TripInput) {
  return {
    slug: input.slug,
    title: input.title,
    city: input.city,
    country: input.country,
    raceDate: input.raceDate,
    startDate: input.startDate,
    endDate: input.endDate,
    distances: input.distances,
    summary: input.summary,
    includes: input.includes,
    priceUsd: input.priceUsd,
    capacity: input.capacity,
    imageUrl: input.imageUrl,
  };
}

// Public reads run per request (connection()): never prerendered at build, where there is no DATABASE_URL.
export async function listPublishedTrips(): Promise<PublicTrip[]> {
  await connection();
  return getDb()
    .select(publicColumns)
    .from(trips)
    .where(eq(trips.status, "published"))
    .orderBy(asc(trips.raceDate), asc(trips.slug));
}

export async function getPublishedTripBySlug(slug: string): Promise<PublicTrip | null> {
  await connection();
  // Only the canonical form (already lowercase and trimmed) is a public URL; anything else is a 404.
  const parsed = tripSlugSchema.safeParse(slug);
  if (!parsed.success || parsed.data !== slug) return null;

  const [trip] = await getDb()
    .select(publicColumns)
    .from(trips)
    .where(and(eq(trips.slug, slug), eq(trips.status, "published")))
    .limit(1);
  return trip ?? null;
}

// CRM list: archived trips last, then by race date and slug.
export async function listTrips(): Promise<Trip[]> {
  return getDb()
    .select()
    .from(trips)
    .orderBy(sql`${trips.status} = 'archived'`, asc(trips.raceDate), asc(trips.slug));
}

export async function getTripById(id: string): Promise<Trip | null> {
  if (!tripIdSchema.safeParse(id).success) return null;
  const [trip] = await getDb().select().from(trips).where(eq(trips.id, id)).limit(1);
  return trip ?? null;
}

// New trips are always draft (column default). A used slug turns the insert into a no-op.
export async function createTrip(input: TripInput): Promise<{ id: string } | "slug_taken"> {
  const [created] = await getDb()
    .insert(trips)
    .values(editableColumns(input))
    .onConflictDoNothing({ target: trips.slug })
    .returning({ id: trips.id });
  return created ?? "slug_taken";
}

// One batch (one transaction, one round-trip). The UPDATE decides with its WHERE (not archived,
// slug unchanged unless draft, slug free); the SELECT explains why nothing was updated.
export async function updateTrip(
  id: string,
  input: TripInput,
): Promise<"updated" | "not_found" | "archived" | "slug_locked" | "slug_taken"> {
  const db = getDb();
  const other = alias(trips, "other");
  const [updated, current] = await db.batch([
    db
      .update(trips)
      .set({ ...editableColumns(input), updatedAt: sql`now()` })
      .where(
        and(
          eq(trips.id, id),
          ne(trips.status, "archived"),
          or(eq(trips.status, "draft"), eq(trips.slug, input.slug)),
          notExists(
            db
              .select({ one: sql`1` })
              .from(other)
              .where(and(eq(other.slug, input.slug), ne(other.id, id))),
          ),
        ),
      )
      .returning({ id: trips.id }),
    db
      .select({ status: trips.status, slug: trips.slug })
      .from(trips)
      .where(eq(trips.id, id)),
  ]);

  if (updated.length > 0) return "updated";
  const [trip] = current;
  if (!trip) return "not_found";
  if (trip.status === "archived") return "archived";
  if (trip.status !== "draft" && trip.slug !== input.slug) return "slug_locked";
  return "slug_taken";
}

// Missing trip or a source status that does not allow this transition → invalid_transition.
export async function setTripStatus(
  id: string,
  status: TripStatus,
): Promise<"changed" | "invalid_transition"> {
  const rows = await getDb()
    .update(trips)
    .set({ status, updatedAt: sql`now()` })
    .where(and(eq(trips.id, id), inArray(trips.status, STATUS_SOURCES[status])))
    .returning({ id: trips.id });
  return rows.length > 0 ? "changed" : "invalid_transition";
}
