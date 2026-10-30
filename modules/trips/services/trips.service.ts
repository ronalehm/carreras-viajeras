import "server-only";
import { and, asc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { trips } from "@/lib/db-schema";
import { tripSlugSchema } from "../schemas/trips.schema";
import type { PublicTrip, Trip, TripInput, TripScope, TripStatus } from "../types/trips.types";

// Target status → allowed source statuses (Requirement 2). archived is final.
const STATUS_SOURCES: Record<TripStatus, TripStatus[]> = {
  published: ["draft"],
  draft: ["published"],
  archived: ["draft", "published"],
};

// Only these columns leave the database for the landing: no id, status, audit dates or the old price
// columns (prices live in the trip offers).
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
  capacity: trips.capacity,
  imageUrl: trips.imageUrl,
  officialUrl: trips.officialUrl,
  excludes: trips.excludes,
  notes: trips.notes,
} satisfies Record<keyof PublicTrip, unknown>;

const tripIdSchema = z.uuid();

// Explicit editable columns: status, id and audit dates never come from the input. The old price columns
// are never written, so an update keeps their stored values (reference only).
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
    capacity: input.capacity,
    imageUrl: input.imageUrl,
    officialUrl: input.officialUrl,
    excludes: input.excludes,
    notes: input.notes,
  };
}

// CRM scope filter, in the same statement as the read or write (no check-then-act). Only an explicit
// "all" lifts it; a trip outside an "own" scope behaves as missing, so its existence is not revealed.
function scopeFilter(scope: TripScope) {
  return scope.kind === "all" ? undefined : eq(trips.organizerId, scope.organizerId);
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

// Checkout needs the trip's internal id in its authenticated server request. Keep it out of the
// public catalog DTO and resolve it separately on the server-rendered checkout page.
export async function getPublishedTripIdBySlug(slug: string): Promise<string | null> {
  await connection();
  const parsed = tripSlugSchema.safeParse(slug);
  if (!parsed.success || parsed.data !== slug) return null;
  const [trip] = await getDb().select({ id: trips.id }).from(trips)
    .where(and(eq(trips.slug, slug), eq(trips.status, "published"))).limit(1);
  return trip?.id ?? null;
}

// CRM list: archived trips last, then by race date and slug.
export async function listTrips(scope: TripScope): Promise<Trip[]> {
  return getDb()
    .select()
    .from(trips)
    .where(scopeFilter(scope))
    .orderBy(sql`${trips.status} = 'archived'`, asc(trips.raceDate), asc(trips.slug));
}

export async function getTripById(id: string, scope: TripScope): Promise<Trip | null> {
  if (!tripIdSchema.safeParse(id).success) return null;
  const [trip] = await getDb()
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), scopeFilter(scope)))
    .limit(1);
  return trip ?? null;
}

// New trips are always draft (column default). The organizer comes only from the scope, never from the
// input. A used slug turns the insert into a no-op.
export async function createTrip(input: TripInput, scope: TripScope): Promise<{ id: string } | "slug_taken"> {
  const [created] = await getDb()
    .insert(trips)
    .values({ ...editableColumns(input), organizerId: scope.kind === "all" ? null : scope.organizerId })
    .onConflictDoNothing({ target: trips.slug })
    .returning({ id: trips.id });
  return created ?? "slug_taken";
}

// One batch (one transaction, one round-trip). The UPDATE decides with its WHERE (not archived,
// slug unchanged unless draft, slug free); the SELECT explains why nothing was updated. Both carry the
// scope, so a trip outside it reads as not_found. Slug uniqueness is global, not scoped.
export async function updateTrip(
  id: string,
  input: TripInput,
  scope: TripScope,
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
          scopeFilter(scope),
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
      .where(and(eq(trips.id, id), scopeFilter(scope))),
  ]);

  if (updated.length > 0) return "updated";
  const [trip] = current;
  if (!trip) return "not_found";
  if (trip.status === "archived") return "archived";
  if (trip.status !== "draft" && trip.slug !== input.slug) return "slug_locked";
  return "slug_taken";
}

// Missing trip, a trip outside the scope or a source status that does not allow this transition
// → invalid_transition.
export async function setTripStatus(
  id: string,
  status: TripStatus,
  scope: TripScope,
): Promise<"changed" | "invalid_transition"> {
  const rows = await getDb()
    .update(trips)
    .set({ status, updatedAt: sql`now()` })
    .where(and(eq(trips.id, id), scopeFilter(scope), inArray(trips.status, STATUS_SOURCES[status])))
    .returning({ id: trips.id });
  return rows.length > 0 ? "changed" : "invalid_transition";
}
