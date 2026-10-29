import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getClientEmailEnv } from "@/lib/env";
import type { LeadEmail, LeadMessagesData } from "../types/leads.types";

type MessageRow = Omit<LeadEmail, "createdAt" | "updatedAt" | "sentAt"> & {
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

export async function getLeadMessages(
  leadId: string,
): Promise<LeadMessagesData> {
  if (!z.uuid().safeParse(leadId).success)
    return { messages: [], automation: "disabled" };
  let env: ReturnType<typeof getClientEmailEnv> = null;
  let automation: LeadMessagesData["automation"] = "disabled";
  try {
    env = getClientEmailEnv();
    if (env) automation = "enabled";
  } catch {
    automation = "invalid";
  }
  // Display is independent from activation: disabling automation preserves its real history.
  const canRetry = env
    ? sql`m.status = 'failed' AND m.last_error_code = 'pre_send_failed'
    AND m.attempts < 3 AND l.archived_at IS NULL AND l.contact_opt_out_at IS NULL
    AND l.source <> 'import' AND l.stage = m.stage AND l.email = m.recipient
    AND m.sender = ${env.from} AND e.created_at >= ${env.startAt.toISOString()}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM outbox_events newer WHERE newer.lead_id = m.lead_id
      AND newer.type IN ('lead.created', 'lead.stage_changed', 'lead.opted_out') AND newer.sequence > e.sequence)`
    : sql`false`;
  const result = await getDb().execute<MessageRow>(sql`
    SELECT m.id, m.stage, m.status, m.last_error_code AS "lastErrorCode", m.recipient, m.sender,
      m.subject, m.body, m.template_version AS "templateVersion", m.attempts,
      m.execution_id AS "executionId", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
      m.sent_at AS "sentAt", COALESCE((${canRetry}), false) AS "canRetry",
      (m.stage = l.stage AND NOT EXISTS (SELECT 1 FROM outbox_events newer
        WHERE newer.lead_id = m.lead_id AND newer.type IN ('lead.created', 'lead.stage_changed', 'lead.opted_out')
        AND newer.sequence > e.sequence)) AS "currentEpisode"
    FROM client_emails m JOIN leads l ON l.id = m.lead_id JOIN outbox_events e ON e.id = m.source_event_id
    WHERE m.lead_id = ${leadId}::uuid ORDER BY e.sequence DESC, m.id DESC
  `);
  return {
    automation,
    messages: result.rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
    })),
  };
}
