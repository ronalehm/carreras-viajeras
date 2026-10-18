import "server-only";
import { and, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { outboxEvents } from "@/lib/db-schema";
import type { ClaimedEvent, FailEventResult, OutboxEventPayload } from "../types/integrations.types";

// Contract of platform-neon-foundation.md: at most 8 attempts, 5-minute lease.
const MAX_ATTEMPTS = 8;

const leaseExpired = and(eq(outboxEvents.status, "processing"), lte(outboxEvents.leaseUntil, sql`now()`));

// One db.batch (one transaction, one round-trip):
// (1) expired leases that already used their 8 attempts become dead ('lease_expired');
// (2) one statement claims up to `limit` ready events, oldest first: pending ones whose time has
//     come, or processing ones whose lease expired. FOR UPDATE SKIP LOCKED: two concurrent claims
//     never get the same event. Each one gets a new lease token, a 5-minute lease and attempts + 1.
//     attempts < 8 also guards the attempts CHECK if (1) skipped a row locked by another claim.
export async function claimEvents(limit: number): Promise<ClaimedEvent[]> {
  const db = getDb();
  const ready = db.$with("ready").as(
    db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          or(
            and(eq(outboxEvents.status, "pending"), lte(outboxEvents.availableAt, sql`now()`)),
            leaseExpired,
          ),
          lt(outboxEvents.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(outboxEvents.availableAt, outboxEvents.id)
      .limit(limit)
      .for("update", { skipLocked: true }),
  );

  const [, claimed] = await db.batch([
    db
      .update(outboxEvents)
      .set({
        status: "dead",
        processedAt: sql`now()`,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: "lease_expired",
      })
      .where(
        inArray(
          outboxEvents.id,
          db
            .select({ id: outboxEvents.id })
            .from(outboxEvents)
            .where(and(leaseExpired, gte(outboxEvents.attempts, MAX_ATTEMPTS)))
            .for("update", { skipLocked: true }),
        ),
      ),
    db
      .with(ready)
      .update(outboxEvents)
      .set({
        status: "processing",
        attempts: sql`${outboxEvents.attempts} + 1`,
        leaseToken: sql`gen_random_uuid()`,
        leaseUntil: sql`now() + interval '5 minutes'`,
      })
      .from(ready)
      .where(eq(outboxEvents.id, ready.id))
      .returning({
        id: outboxEvents.id,
        type: outboxEvents.type,
        leadId: outboxEvents.leadId,
        payloadVersion: outboxEvents.payloadVersion,
        payload: outboxEvents.payload,
        attempts: outboxEvents.attempts,
        leaseToken: outboxEvents.leaseToken,
        leaseUntil: outboxEvents.leaseUntil,
        createdAt: outboxEvents.createdAt,
        availableAt: outboxEvents.availableAt,
      }),
  ]);

  // RETURNING has no order: oldest first, as claimed.
  return claimed
    .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime() || a.id.localeCompare(b.id))
    .map((event) => ({
      id: event.id,
      type: event.type,
      leadId: event.leadId,
      payloadVersion: event.payloadVersion,
      payload: event.payload as OutboxEventPayload,
      attempts: event.attempts,
      leaseToken: event.leaseToken as string,
      leaseUntil: (event.leaseUntil as Date).toISOString(),
      createdAt: event.createdAt.toISOString(),
    }));
}

// Only the current lease: same token, still processing and not expired.
function currentLease(id: string, leaseToken: string) {
  return and(
    eq(outboxEvents.id, id),
    eq(outboxEvents.leaseToken, leaseToken),
    eq(outboxEvents.status, "processing"),
    gt(outboxEvents.leaseUntil, sql`now()`),
  );
}

export async function ackEvent(id: string, leaseToken: string): Promise<"succeeded" | "lease_lost"> {
  const rows = await getDb()
    .update(outboxEvents)
    .set({ status: "succeeded", processedAt: sql`now()`, leaseToken: null, leaseUntil: null })
    .where(currentLease(id, leaseToken))
    .returning({ id: outboxEvents.id });
  return rows.length > 0 ? "succeeded" : "lease_lost";
}

// One statement with the current lease. The SET expressions read the attempts before the update:
// with 8 the event is dead; otherwise it goes back to pending after
// least(3600, 30 · 2^(attempts − 1)) seconds × random [0.8, 1.2] (30 s, 1 min, 2 min… with jitter).
export async function failEvent(id: string, leaseToken: string, errorCode: string): Promise<FailEventResult> {
  const exhausted = sql`${outboxEvents.attempts} >= ${MAX_ATTEMPTS}`;
  const [row] = await getDb()
    .update(outboxEvents)
    .set({
      status: sql`CASE WHEN ${exhausted} THEN 'dead' ELSE 'pending' END::outbox_status`,
      processedAt: sql`CASE WHEN ${exhausted} THEN now() END`,
      availableAt: sql`CASE WHEN ${exhausted} THEN ${outboxEvents.availableAt} ELSE now() + least(3600, 30 * power(2, ${outboxEvents.attempts} - 1)) * (0.8 + random() * 0.4) * interval '1 second' END`,
      leaseToken: null,
      leaseUntil: null,
      lastErrorCode: errorCode,
    })
    .where(currentLease(id, leaseToken))
    .returning({ status: outboxEvents.status, availableAt: outboxEvents.availableAt });
  if (!row) return "lease_lost";
  return row.status === "dead" ? { status: "dead" } : { status: "pending", availableAt: row.availableAt };
}
