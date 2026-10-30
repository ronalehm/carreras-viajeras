import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { CRM_TIME_ZONE, getTodayDate } from "@/lib/dates";
import { getClientEmailEnv, isSalesCadenceEnabled } from "@/lib/env";

type EnqueueCadenceRow = { enqueued: number | string };

// Sending window of the sales cadence (crm-sales-cadence.md, requirement 1): [09:00, 19:00) in Lima.
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 19;

const limaHourFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: CRM_TIME_ZONE,
});

function isInsideSendingWindow(now: Date): boolean {
  const hour = Number(limaHourFormat.format(now));
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

// Steps per open stage, counted from the start of the stage episode (ord = order within the stage).
// "new" has the proposal 2 hours after the welcome; contacted/quoted already get their stage email on
// day 0. Fixed SQL, no input.
const STEPS = sql.raw(`(VALUES
  ('new', 'proposal', 0, interval '2 hours'),
  ('new', 'r3', 1, interval '72 hours'),
  ('new', 'r5', 2, interval '120 hours'),
  ('new', 'r7', 3, interval '168 hours'),
  ('contacted', 'r3', 1, interval '72 hours'),
  ('contacted', 'r5', 2, interval '120 hours'),
  ('contacted', 'r7', 3, interval '168 hours'),
  ('quoted', 'r3', 1, interval '72 hours'),
  ('quoted', 'r5', 2, interval '120 hours'),
  ('quoted', 'r7', 3, interval '168 hours')
) AS s(stage, step, ord, delay)`);

// Hourly (n8n). Queues the due steps of the sales cadence as lead.cadence_due events, only inside the
// Lima sending window, with the client email automation on and the sales cadence switch
// (CRM_SALES_CADENCE_ENABLED) on. The switch stays off until Phase 2 (unsubscribe link) is deployed;
// while it is off nothing is queried.
// - Episode: an open lead (not archived, no opt-out, with email, not imported) in new, contacted or
//   quoted. It starts at the last stage_changed activity into the current stage or, for "new", at the
//   'created' activity when there is no later one; that activity's id is the episode id, so reopening
//   a stage starts a new sequence. Episodes that started before CRM_EMAIL_AUTOMATION_START_AT or with
//   a 'responded' activity since their start get nothing.
// - At most one step per episode and Lima day: an episode with a lead.cadence_due created today is
//   left for tomorrow. Of the due steps not yet queued, only the latest is queued; the earlier ones
//   are inserted too, marked superseded, so they are never sent (the email engine skips them).
// - Idempotent: dedupe_key 'cadence:<lead>:<episode>:<step>' with the partial unique index
//   (ON CONFLICT DO NOTHING) settles repeated calls for the same step.
// - Concurrent calls are serialized by a transaction-level advisory lock with a constant key, taken
//   by a first statement of the same transaction (neon-http batch). The insert runs as a second
//   statement on purpose: in READ COMMITTED its snapshot is taken after the lock is granted, so it
//   sees what the previous call committed and cannot queue a second live step of the same episode
//   the same day (a lock inside the same statement would keep the older snapshot).
// - At most `limit` episodes per call, oldest episode first. The payload holds no personal data.
// Returns how many live (not superseded) events were inserted.
export async function enqueueCadence(now: Date, limit: number): Promise<{ enqueued: number }> {
  const env = getClientEmailEnv();
  if (!env || !isSalesCadenceEnabled() || !isInsideSendingWindow(now)) return { enqueued: 0 };

  const nowAt = now.toISOString();
  const db = getDb();
  const [, result] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cv-sales-cadence-enqueue'))`),
    db.execute<EnqueueCadenceRow>(sql`
      WITH episodes AS (
        SELECT l.id AS lead_id, l.stage, ep.id AS episode_id, ep.created_at AS started_at,
          'cadence:' || l.id || ':' || ep.id || ':' AS key_prefix
        FROM leads l
        CROSS JOIN LATERAL (
          SELECT a.id, a.created_at FROM lead_activities a
          WHERE a.lead_id = l.id
            AND ((a.type = 'stage_changed' AND a.stage_to = l.stage) OR (l.stage = 'new' AND a.type = 'created'))
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 1
        ) ep
        WHERE l.archived_at IS NULL
          AND l.contact_opt_out_at IS NULL
          AND l.email IS NOT NULL
          AND l.source <> 'import'
          AND l.stage IN ('new', 'contacted', 'quoted')
          AND ep.created_at >= ${env.startAt.toISOString()}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM lead_activities r
            WHERE r.lead_id = l.id AND r.type = 'responded' AND r.created_at >= ep.created_at
          )
      ),
      pending AS (
        SELECT e.lead_id, e.stage, e.episode_id, e.started_at, s.step, s.ord, e.key_prefix || s.step AS dedupe_key
        FROM episodes e
        JOIN ${STEPS} ON s.stage = e.stage::text
        WHERE e.started_at + s.delay <= ${nowAt}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM outbox_events o WHERE o.dedupe_key = e.key_prefix || s.step)
          AND NOT EXISTS (
            SELECT 1 FROM outbox_events o
            WHERE o.lead_id = e.lead_id AND o.type = 'lead.cadence_due'
              AND starts_with(o.dedupe_key, e.key_prefix)
              AND (o.created_at AT TIME ZONE ${CRM_TIME_ZONE})::date = ${getTodayDate(now)}::date
          )
      ),
      ready AS (
        SELECT episode_id, started_at FROM pending
        GROUP BY episode_id, started_at
        ORDER BY started_at, episode_id
        LIMIT ${limit}::int
      ),
      batch AS (
        SELECT p.*, p.ord = max(p.ord) OVER (PARTITION BY p.episode_id) AS live
        FROM pending p JOIN ready r ON r.episode_id = p.episode_id
      ),
      inserted AS (
        INSERT INTO outbox_events (type, lead_id, payload, dedupe_key, created_at)
        SELECT 'lead.cadence_due', lead_id,
          jsonb_build_object('stage', stage, 'step', step, 'episodeId', episode_id)
            || CASE WHEN live THEN '{}'::jsonb ELSE '{"superseded": true}'::jsonb END,
          dedupe_key, ${nowAt}::timestamptz
        FROM batch
        ORDER BY started_at, episode_id, ord
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        RETURNING payload
      )
      SELECT count(*) FILTER (WHERE inserted.payload->'superseded' IS NULL)::int AS enqueued FROM inserted
    `),
  ]);
  return { enqueued: Number(result.rows[0]?.enqueued ?? 0) };
}
