import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

type EnqueueFollowUpsRow = { enqueued: number | string };

// Daily reminders (n8n calls it once a day), in a single statement. A lead is due when it is open
// (not archived, no opt-out), in a sales stage (new, contacted, quoted) and its next action is today
// or overdue (`today` is the CRM date, YYYY-MM-DD). At most one reminder per stage episode: the
// dedupe_key names the lead and its last stage_changed activity (or 'created' without one), so a
// stage change opens a new episode and rescheduling within the same stage does not. NOT EXISTS keeps
// already reminded leads out of the limit; the partial unique index settles concurrent calls (ON
// CONFLICT DO NOTHING). Most overdue first. Returns how many events were inserted.
export async function enqueueFollowUps(today: string, limit: number): Promise<number> {
  const result = await getDb().execute<EnqueueFollowUpsRow>(sql`
    WITH due AS (
      SELECT
        id, stage, next_action_date, created_at,
        'follow_up:' || id || ':' || coalesce(
          (
            SELECT a.id::text FROM lead_activities a
            WHERE a.lead_id = leads.id AND a.type = 'stage_changed'
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT 1
          ),
          'created'
        ) AS dedupe_key
      FROM leads
      WHERE archived_at IS NULL
        AND contact_opt_out_at IS NULL
        AND stage IN ('new', 'contacted', 'quoted')
        AND next_action_date <= ${today}::date
    ),
    ready AS (
      SELECT id, stage, next_action_date, dedupe_key FROM due
      WHERE NOT EXISTS (SELECT 1 FROM outbox_events e WHERE e.dedupe_key = due.dedupe_key)
      ORDER BY next_action_date, created_at, id
      LIMIT ${limit}::int
    ),
    inserted AS (
      INSERT INTO outbox_events (type, lead_id, payload, dedupe_key)
      SELECT 'lead.follow_up_due', id, jsonb_build_object('stage', stage, 'dueOn', next_action_date), dedupe_key
      FROM ready
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id
    )
    SELECT count(*)::int AS enqueued FROM inserted
  `);
  return Number(result.rows[0]?.enqueued ?? 0);
}
