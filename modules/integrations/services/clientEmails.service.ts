import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { clientEmails } from "@/lib/db-schema";
import { getClientEmailEnv } from "@/lib/env";
import { emailStageSchema } from "../schemas/email.schema";

type Stage = z.infer<typeof emailStageSchema>;
type EmailEnv = NonNullable<ReturnType<typeof getClientEmailEnv>>;
const TEXTS: Record<Stage, string> = {
  new: "gracias por tu interés en Carreras Viajeras. ¿Qué te gustaría conocer sobre tu próximo viaje? Puedes responder este correo.",
  contacted:
    "queremos ayudarte a organizar tu próxima carrera. ¿Qué información necesitas para avanzar?",
  quoted:
    "¿te gustaría que revisemos juntos la propuesta de tu viaje? Puedes responder este correo con tus dudas.",
  reserved:
    "estamos a tu disposición para coordinar los siguientes pasos de tu viaje.",
  paid: "gracias por tu confianza en Carreras Viajeras. Puedes responder este correo si necesitas ayuda con las coordinaciones de tu viaje.",
  lost: "gracias por tu interés en Carreras Viajeras. Si tienes alguna consulta pendiente, puedes responder este correo.",
};

export function clientEmailTemplate(stage: Stage, fullName: string) {
  const name = fullName.trim().split(/\s+/)[0] || "viajero";
  return {
    subject: "Tu viaje con Carreras Viajeras",
    body: `Hola ${name}, ${TEXTS[stage]}\n\nEquipo de Carreras Viajeras`,
    templateVersion: 1,
  };
}

// Sequence is allocated after the lead lock, unlike transaction-start timestamps. This also
// excludes an old stage event when a contact leaves that stage and later comes back to it.
const latestEvent = sql`NOT EXISTS (
  SELECT 1 FROM outbox_events newer
  WHERE newer.lead_id = e.lead_id
    AND newer.type IN ('lead.created', 'lead.stage_changed', 'lead.opted_out')
    AND newer.sequence > e.sequence
)`;

// Aliases m/e/l are fixed internal SQL identifiers. No recipient/content comes from a request.
function eligible(env: EmailEnv) {
  return sql`l.archived_at IS NULL AND l.contact_opt_out_at IS NULL
    AND l.source <> 'import' AND COALESCE(e.payload->>'bulk', 'false') <> 'true'
    AND e.payload_version = 1 AND e.type IN ('lead.created', 'lead.stage_changed')
    AND e.created_at >= ${env.startAt.toISOString()}::timestamptz
    AND l.stage = m.stage AND m.recipient IS NOT NULL AND m.recipient = l.email
    AND m.sender = ${env.from} AND ${latestEvent}`;
}

type Candidate = {
  eventId: string;
  leadId: string;
  type: string;
  payload: Record<string, unknown>;
  fullName: string;
  email: string | null;
  currentStage: Stage;
  source: string;
  archived: boolean;
  optedOut: boolean;
  current: boolean;
};

async function prepareEmails(env: EmailEnv) {
  const db = getDb();
  const result = await db.execute<Candidate>(sql`
    SELECT e.id AS "eventId", e.lead_id AS "leadId", e.type, e.payload,
      l.full_name AS "fullName", l.email, l.stage AS "currentStage", l.source,
      l.archived_at IS NOT NULL AS archived, l.contact_opt_out_at IS NOT NULL AS "optedOut",
      ${latestEvent} AS current
    FROM outbox_events e JOIN leads l ON l.id = e.lead_id
    WHERE e.type IN ('lead.created', 'lead.stage_changed') AND e.payload_version = 1
      AND (e.type = 'lead.created' OR e.payload->>'stageTo' IN ('new', 'contacted', 'quoted', 'reserved', 'paid', 'lost'))
      AND e.created_at >= ${env.startAt.toISOString()}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM client_emails m WHERE m.source_event_id = e.id)
    ORDER BY e.sequence LIMIT 100
  `);
  const rows = result.rows.flatMap((event) => {
    const parsedStage = emailStageSchema.safeParse(
      event.type === "lead.created" ? "new" : event.payload.stageTo,
    );
    // Unsupported payloads are never cast into a database enum or sent.
    if (!parsedStage.success) return [];
    const stage = parsedStage.data;
    const recipient =
      event.email && z.email().max(254).safeParse(event.email).success
        ? event.email
        : null;
    const reason = event.optedOut
      ? "opted_out"
      : event.archived
        ? "archived"
        : event.source === "import" || event.payload.bulk === true
          ? "bulk_import"
          : !event.current || event.currentStage !== stage
            ? "obsolete_event"
            : !recipient
              ? "missing_email"
              : null;
    return [
      {
        sourceEventId: event.eventId,
        leadId: event.leadId,
        stage,
        recipient,
        sender: env.from,
        ...clientEmailTemplate(stage, event.fullName),
        status: reason ? ("skipped" as const) : ("pending" as const),
        lastErrorCode: reason,
      },
    ];
  });
  if (rows.length)
    await db
      .insert(clientEmails)
      .values(rows)
      .onConflictDoNothing({ target: clientEmails.sourceEventId });
}

export type EmailClaim = { id: string; attemptToken: string };
export async function claimClientEmails(input: {
  limit: number;
  executionId: string;
}): Promise<{ enabled: boolean; messages: EmailClaim[] }> {
  const env = getClientEmailEnv();
  if (!env) return { enabled: false, messages: [] };
  await prepareEmails(env);
  const db = getDb();
  const [, result] = await db.batch([
    db.execute(sql`
      UPDATE client_emails SET
        status = CASE WHEN status = 'sending' THEN 'unknown'::client_email_status
          WHEN attempts >= 3 THEN 'failed'::client_email_status ELSE 'pending'::client_email_status END,
        last_error_code = CASE WHEN status = 'sending' THEN 'smtp_unknown'
          WHEN attempts >= 3 THEN 'attempts_exhausted' ELSE NULL END,
        lease_until = NULL, updated_at = now()
      WHERE id IN (SELECT id FROM client_emails
        WHERE status IN ('claimed', 'sending') AND lease_until <= now()
        ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED)
    `),
    db.execute<EmailClaim>(sql`
      WITH ready AS (
        SELECT id FROM client_emails WHERE status = 'pending' AND attempts < 3
        ORDER BY created_at, id LIMIT ${input.limit} FOR UPDATE SKIP LOCKED
      )
      UPDATE client_emails m SET status = 'claimed', attempts = m.attempts + 1,
        attempt_token = gen_random_uuid(), lease_until = now() + interval '5 minutes',
        execution_id = ${input.executionId}, last_error_code = NULL, updated_at = now()
      FROM ready WHERE m.id = ready.id
      RETURNING m.id, m.attempt_token AS "attemptToken"
    `),
  ]);
  return { enabled: true, messages: result.rows };
}

// Locks the lead before taking a fresh statement snapshot. Concurrent stage/opt-out/archive
// mutations use the same lead lock. Authorizing twice never returns the SMTP payload twice.
function lockLead(id: string) {
  return sql`SELECT l.id FROM leads l JOIN client_emails m ON m.lead_id = l.id
    WHERE m.id = ${id}::uuid FOR UPDATE OF l`;
}
type Authorized = {
  id: string;
  status: "sending" | "skipped";
  from: string;
  to: string;
  subject: string;
  text: string;
};
export async function authorizeClientEmail(id: string, attemptToken: string) {
  const env = getClientEmailEnv();
  if (!env) return { status: "disabled" as const };
  const db = getDb();
  const [, result] = await db.batch([
    db.execute(lockLead(id)),
    db.execute<Authorized>(sql`
      WITH target AS (
        SELECT m.id, (${eligible(env)}) AS allowed FROM client_emails m
        JOIN outbox_events e ON e.id = m.source_event_id JOIN leads l ON l.id = m.lead_id
        WHERE m.id = ${id}::uuid AND m.attempt_token = ${attemptToken}::uuid
          AND m.status = 'claimed' AND m.lease_until > now()
        FOR UPDATE OF m
      )
      UPDATE client_emails m SET
        status = CASE WHEN target.allowed THEN 'sending'::client_email_status ELSE 'skipped'::client_email_status END,
        lease_until = CASE WHEN target.allowed THEN now() + interval '5 minutes' ELSE NULL END,
        last_error_code = CASE WHEN target.allowed THEN NULL ELSE 'ineligible' END, updated_at = now()
      FROM target WHERE m.id = target.id
      RETURNING m.id, m.status, m.sender AS "from", m.recipient AS "to", m.subject, m.body AS text
    `),
  ]);
  const row = result.rows[0];
  if (!row) return { status: "attempt_conflict" as const };
  if (row.status === "skipped") return { status: "skipped" as const };
  return {
    status: "authorized" as const,
    message: {
      id: row.id,
      from: row.from,
      to: row.to,
      subject: row.subject,
      text: row.text,
      attemptToken,
    },
  };
}

type Callback = { leadId: string; status: string };
// A late acknowledgment can resolve an unknown result. It can never acknowledge a newer token.
export async function ackClientEmail(
  id: string,
  attemptToken: string,
  smtpMessageId?: string,
) {
  const result = await getDb().execute<Callback>(sql`
    UPDATE client_emails SET status = 'sent', sent_at = COALESCE(sent_at, now()),
      smtp_message_id = COALESCE(smtp_message_id, ${smtpMessageId ?? null}),
      lease_until = NULL, last_error_code = NULL, updated_at = now()
    WHERE id = ${id}::uuid AND attempt_token = ${attemptToken}::uuid
      AND status IN ('sending', 'unknown', 'sent')
    RETURNING lead_id AS "leadId", status
  `);
  return result.rows[0] ?? null;
}

// Only an attempt that was never authorized can be a definite pre-send failure. Any SMTP
// error after authorization is uncertain. A delayed failure never regresses an accepted email.
export async function failClientEmail(
  id: string,
  attemptToken: string,
  kind: "before_send" | "smtp_unknown",
) {
  const result = await getDb().execute<Callback>(sql`
    UPDATE client_emails SET
      status = CASE WHEN status IN ('sent', 'failed') THEN status
        WHEN status = 'claimed' AND ${kind} = 'before_send' THEN 'failed'::client_email_status
        ELSE 'unknown'::client_email_status END,
      last_error_code = CASE WHEN status = 'sent' THEN NULL
        WHEN status = 'failed' THEN last_error_code
        WHEN status = 'claimed' AND ${kind} = 'before_send' THEN 'pre_send_failed' ELSE 'smtp_unknown' END,
      lease_until = NULL, updated_at = now()
    WHERE id = ${id}::uuid AND attempt_token = ${attemptToken}::uuid
      AND status IN ('claimed', 'sending', 'unknown', 'sent', 'failed')
    RETURNING lead_id AS "leadId", status
  `);
  return result.rows[0] ?? null;
}

// Called only by the CRM action after its permission guard; the lead id is derived server-side.
export async function retryClientEmail(
  id: string,
  actorUserId: string,
): Promise<string | null> {
  const env = getClientEmailEnv();
  if (!env) return null;
  const db = getDb();
  const [, result] = await db.batch([
    db.execute(lockLead(id)),
    db.execute<{ leadId: string }>(sql`
      UPDATE client_emails m SET status = 'pending', attempt_token = NULL, lease_until = NULL,
        execution_id = NULL, last_error_code = NULL, retry_requested_by = ${actorUserId},
        retry_requested_at = now(), updated_at = now()
      FROM outbox_events e, leads l
      WHERE m.id = ${id}::uuid AND e.id = m.source_event_id AND l.id = m.lead_id
        AND m.status = 'failed' AND m.attempts < 3 AND m.last_error_code = 'pre_send_failed'
        AND ${eligible(env)}
      RETURNING m.lead_id AS "leadId"
    `),
  ]);
  return result.rows[0]?.leadId ?? null;
}
