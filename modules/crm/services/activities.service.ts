import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { leadActivities, profiles } from "@/lib/db-schema";
import type { LeadActivity, LeadActivityInput } from "../types/leads.types";

const actor = alias(profiles, "actor");
const previousOwner = alias(profiles, "previous_owner");
const newOwner = alias(profiles, "new_owner");

// History of a lead, newest first. LEFT JOINs: system activities have no author (created of a
// web form lead, automation) and the first owner change has no previous owner. A non-UUID id
// never reaches the database.
export async function listLeadActivities(leadId: string): Promise<LeadActivity[]> {
  if (!z.uuid().safeParse(leadId).success) return [];
  return getDb()
    .select({
      id: leadActivities.id,
      type: leadActivities.type,
      body: leadActivities.body,
      stageFrom: leadActivities.stageFrom,
      stageTo: leadActivities.stageTo,
      ownerFrom: { email: previousOwner.email },
      ownerTo: { email: newOwner.email },
      actor: { email: actor.email },
      createdAt: leadActivities.createdAt,
    })
    .from(leadActivities)
    .leftJoin(actor, eq(actor.userId, leadActivities.actorUserId))
    .leftJoin(previousOwner, eq(previousOwner.userId, leadActivities.ownerFrom))
    .leftJoin(newOwner, eq(newOwner.userId, leadActivities.ownerTo))
    .where(eq(leadActivities.leadId, leadId))
    .orderBy(desc(leadActivities.createdAt), desc(leadActivities.id));
}

// One statement: the activity is inserted only if the lead exists and is not archived. FOR SHARE
// waits for a concurrent archive and then re-checks archived_at. The author is the session user;
// the type is a manual one (the schema rejects every system type).
export async function addLeadActivity(
  input: LeadActivityInput,
  actorUserId: string,
): Promise<"added" | "not_found"> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO lead_activities (lead_id, type, body, actor_user_id)
    SELECT id, ${input.type}::lead_activity_type, ${input.body}, ${actorUserId}
    FROM leads
    WHERE id = ${input.leadId}::uuid AND archived_at IS NULL
    FOR SHARE
    RETURNING id
  `);
  return result.rows.length > 0 ? "added" : "not_found";
}
