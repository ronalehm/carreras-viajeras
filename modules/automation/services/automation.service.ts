import "server-only";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationEvents } from "@/lib/db-schema";
import {
  LEASE_SECONDS,
  leadCreatedPayloadSchema,
  MAX_ATTEMPTS,
} from "../schemas/automation.schema";
import type {
  AckResult,
  ClaimedEvent,
  FailResult,
  LeadCreatedPayload,
} from "../types/automation.types";
import { retryDelaySeconds } from "../utils/retryDelay";

type Db = ReturnType<typeof getDb>;

// Raw row of the claim statement. type, payload_version and payload are guaranteed by the
// table checks and by validating the payload before insert (lead.created v1 is the only event).
type ClaimedRow = {
  id: string;
  type: "lead.created";
  payload_version: 1;
  payload: LeadCreatedPayload;
  attempts: number;
  created_at: Date | string;
  lease_token: string;
  lease_until: Date | string;
};

const toIso = (value: Date | string) => new Date(value).toISOString();

// Returns the INSERT without running it, to go in the same db.batch([...]) as the lead insert.
export function leadCreatedEventInsert(db: Db, payload: LeadCreatedPayload) {
  const data = leadCreatedPayloadSchema.parse(payload);
  return db.insert(automationEvents).values({
    type: "lead.created",
    leadId: data.leadId,
    payloadVersion: 1,
    payload: data,
  });
}

// One atomic statement: dead-letters expired leases with no attempts left, then claims up to
// `limit` available events (pending and due, or expired leases with attempts left).
// SKIP LOCKED keeps concurrent claims from taking the same rows.
export async function claimEvents(limit: number): Promise<ClaimedEvent[]> {
  const result = await getDb().execute<ClaimedRow>(sql`
    WITH expired AS (
      UPDATE automation_events
      SET status = 'dead', last_error_code = 'lease_expired', lease_token = NULL, lease_until = NULL
      WHERE status = 'processing' AND lease_until <= now() AND attempts >= ${MAX_ATTEMPTS}
      RETURNING id
    ),
    candidates AS (
      SELECT id FROM automation_events
      WHERE (status = 'pending' AND available_at <= now())
        OR (status = 'processing' AND lease_until <= now() AND attempts < ${MAX_ATTEMPTS})
      ORDER BY available_at, id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
      UPDATE automation_events AS events
      SET status = 'processing',
        attempts = events.attempts + 1,
        lease_token = gen_random_uuid(),
        lease_until = now() + make_interval(secs => ${LEASE_SECONDS})
      FROM candidates
      WHERE events.id = candidates.id
      RETURNING events.id, events.type, events.payload_version, events.payload, events.attempts,
        events.created_at, events.lease_token, events.lease_until, events.available_at
    )
    SELECT id, type, payload_version, payload, attempts, created_at, lease_token, lease_until
    FROM claimed
    ORDER BY available_at, id
  `);
  return result.rows.map((row) => ({
    eventId: row.id,
    type: row.type,
    payloadVersion: row.payload_version,
    payload: row.payload,
    attempt: row.attempts,
    occurredAt: toIso(row.created_at),
    leaseToken: row.lease_token,
    leaseExpiresAt: toIso(row.lease_until),
  }));
}

// Current lease only: processing, same token and not expired.
const currentLease = (id: string, leaseToken: string) =>
  and(
    eq(automationEvents.id, id),
    eq(automationEvents.status, "processing"),
    eq(automationEvents.leaseToken, leaseToken),
    gt(automationEvents.leaseUntil, sql`now()`),
  );

// A repeated ack with the same token on a succeeded event is ok (processed_at is kept).
// Old token, expired lease or missing event → conflict.
export async function ackEvent(id: string, leaseToken: string): Promise<AckResult> {
  const rows = await getDb()
    .update(automationEvents)
    .set({
      status: "succeeded",
      processedAt: sql`coalesce(${automationEvents.processedAt}, now())`,
    })
    .where(
      or(
        currentLease(id, leaseToken),
        and(
          eq(automationEvents.id, id),
          eq(automationEvents.status, "succeeded"),
          eq(automationEvents.leaseToken, leaseToken),
        ),
      ),
    )
    .returning({ id: automationEvents.id });
  return rows.length > 0 ? "ok" : "conflict";
}

// With the current lease: attempts left → pending after the backoff of this attempt; none → dead.
// The delays of every attempt are computed here (retryDelaySeconds) and the row picks its own.
export async function failEvent(
  id: string,
  leaseToken: string,
  errorCode: string,
): Promise<FailResult> {
  const delays = Array.from({ length: MAX_ATTEMPTS }, (_, index) =>
    sql`${retryDelaySeconds(index + 1)}`,
  );
  const exhausted = sql`${automationEvents.attempts} >= ${MAX_ATTEMPTS}`;
  const [row] = await getDb()
    .update(automationEvents)
    .set({
      status: sql`CASE WHEN ${exhausted} THEN 'dead' ELSE 'pending' END::automation_event_status`,
      availableAt: sql`CASE WHEN ${exhausted} THEN ${automationEvents.availableAt}
        ELSE now() + make_interval(secs => (ARRAY[${sql.join(delays, sql`, `)}]::integer[])[${automationEvents.attempts}]) END`,
      lastErrorCode: errorCode,
      leaseToken: null,
      leaseUntil: null,
    })
    .where(currentLease(id, leaseToken))
    .returning({ status: automationEvents.status, availableAt: automationEvents.availableAt });

  if (!row) return { status: "conflict" };
  if (row.status === "dead") return { status: "dead" };
  return { status: "retry", retryAt: row.availableAt.toISOString() };
}
