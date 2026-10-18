import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads, profiles, trips } from "@/lib/db-schema";
import type { IntegrationLead } from "../types/integrations.types";

// First word of the full name: the only name n8n may send to Gemini.
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}

// Explicit columns only: never city, notes, consent, activities or user ids. Archived leads are
// returned too (n8n acks their events). LEFT JOINs: no trip or no owner (unassigned) → null.
export async function getIntegrationLead(id: string): Promise<IntegrationLead | null> {
  const [row] = await getDb()
    .select({
      id: leads.id,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      stage: leads.stage,
      source: leads.source,
      trip: { slug: trips.slug, title: trips.title },
      destinationText: leads.destinationText,
      owner: { email: profiles.email },
      archivedAt: leads.archivedAt,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(trips, eq(trips.id, leads.tripId))
    .leftJoin(profiles, eq(profiles.userId, leads.ownerUserId))
    .where(eq(leads.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    firstName: firstNameOf(row.fullName),
    email: row.email,
    phone: row.phone,
    stage: row.stage,
    source: row.source,
    trip: row.trip,
    destinationText: row.destinationText,
    owner: row.owner,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
