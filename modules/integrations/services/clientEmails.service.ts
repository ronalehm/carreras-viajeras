import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { getTodayDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { clientEmails, staffRoleEnum, type leadSourceEnum } from "@/lib/db-schema";
import { getClientEmailEnv, getEnv } from "@/lib/env";
import { emailStageSchema, internalEmailKindSchema } from "../schemas/email.schema";
import type {
  ClientEmailKind,
  ClientEmailSkipReason,
  OutboxEventType,
} from "../types/integrations.types";
import {
  firstName,
  lifecycleEmailTemplate,
  raceLabel,
} from "../utils/lifecycleEmailTemplates";

type Stage = z.infer<typeof emailStageSchema>;
type LeadSource = (typeof leadSourceEnum.enumValues)[number];
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
  return {
    subject: "Tu viaje con Carreras Viajeras",
    body: `Hola ${firstName(fullName)}, ${TEXTS[stage]}\n\nEquipo de Carreras Viajeras`,
    templateVersion: 1,
  };
}

// Labels of internal alerts. Local on purpose: modules/crm imports this module (retry action), so
// importing its leadDisplay labels through @/modules/crm would create an import cycle. Keep them in
// line with LEAD_SOURCE_LABELS and LEAD_STAGE_LABELS of modules/crm/utils/leadDisplay.ts.
const SOURCE_LABELS: Record<LeadSource, string> = {
  whatsapp: "WhatsApp",
  web_form: "Formulario web",
  google_form: "Google Forms",
  import: "Importación",
  other: "Otro",
  runner_account: "Cuenta web",
};
const STAGE_LABELS: Record<Stage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  quoted: "Cotizado",
  reserved: "Reservado",
  paid: "Pagado",
  lost: "Perdido",
};

const STAGE_VALUES = sql.join(
  emailStageSchema.options.map((stage) => sql`${stage}`),
  sql`, `,
);

// Sequence is allocated after the lead lock, unlike transaction-start timestamps. This also
// excludes an old stage event when a contact leaves that stage and later comes back to it.
const latestEvent = sql`NOT EXISTS (
  SELECT 1 FROM outbox_events newer
  WHERE newer.lead_id = e.lead_id
    AND newer.type IN ('lead.created', 'lead.stage_changed', 'lead.opted_out')
    AND newer.sequence > e.sequence
)`;

// Only "later event" rule of internal alerts: an owner_alert is stale once the same lead has a later
// lead.owner_assigned, so two quick reassignments never send two alerts to the last owner.
const latestOwnerAssignment = sql`NOT EXISTS (
  SELECT 1 FROM outbox_events newer
  WHERE newer.lead_id = e.lead_id
    AND newer.type = 'lead.owner_assigned'
    AND newer.sequence > e.sequence
)`;

// Current owner's address, only while the owner holds an active role with leads.manage. Same
// criterion as isActiveOwner in modules/crm/services/leads.service.ts, replicated here as SQL
// because importing modules/crm from this module would create an import cycle.
const LEAD_OWNER_ROLES = staffRoleEnum.enumValues.filter((role) => can([role], "leads.manage"));
const activeOwnerEmail = sql`(SELECT p.email FROM profiles p WHERE p.user_id = l.owner_user_id
  AND EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = p.user_id AND s.revoked_at IS NULL
    AND s.role::text IN (${sql.join(LEAD_OWNER_ROLES.map((role) => sql`${role}`), sql`, `)})))`;

// Eligibility per kind (crm-lifecycle-emails.md, requirement 3), rechecked just before SMTP and on
// retry. prepareEmails applies the same rules through skipReason() over the same SQL facts
// (latestEvent, latestOwnerAssignment, activeOwnerEmail, next action due in Lima). Aliases m/e/l
// are fixed internal SQL identifiers. No recipient/content comes from a request.
// - Common: active (env), cutoff, payload version 1, server sender, lead not archived.
// - Internal alerts: opt-out does not block them; recipient is the current team address or the
//   current owner's address (active role), never a stale one. No "latest event" rule, except that an
//   owner_alert yields to a later lead.owner_assigned of the same lead.
// - Client emails: no opt-out, no import/bulk, recipient = leads.email. Welcomes only need the
//   lead.created event; follow_up needs the same stage, a next action still due and no later stage
//   event; booking_confirmed and stage keep the original rules (current event, same stage).
function eligible(env: EmailEnv) {
  const teamRecipient = env.teamAlertEmail
    ? sql`m.recipient = ${env.teamAlertEmail}`
    : sql`FALSE`;
  return sql`e.payload_version = 1
    AND e.created_at >= ${env.startAt.toISOString()}::timestamptz
    AND m.sender = ${env.from} AND l.archived_at IS NULL AND m.recipient IS NOT NULL
    AND CASE m.kind
      WHEN 'team_alert' THEN e.type = 'lead.created' AND ${teamRecipient}
      WHEN 'owner_alert' THEN e.type = 'lead.owner_assigned' AND m.recipient = ${activeOwnerEmail}
        AND ${latestOwnerAssignment}
      ELSE l.contact_opt_out_at IS NULL AND l.source <> 'import'
        AND COALESCE(e.payload->>'bulk', 'false') <> 'true' AND m.recipient = l.email
        AND CASE m.kind
          WHEN 'welcome_registration' THEN e.type = 'lead.created'
          WHEN 'welcome_contact' THEN e.type = 'lead.created'
          WHEN 'welcome_account' THEN e.type = 'lead.created'
          WHEN 'follow_up' THEN e.type = 'lead.follow_up_due' AND l.stage = m.stage
            AND l.next_action_date <= ${getTodayDate()}::date AND ${latestEvent}
          WHEN 'booking_confirmed' THEN e.type = 'lead.stage_changed' AND l.stage = m.stage
            AND ${latestEvent}
          ELSE e.type IN ('lead.created', 'lead.stage_changed') AND l.stage = m.stage
            AND ${latestEvent}
        END
    END`;
}

// Reason stored when the recheck before SMTP fails: the specific internal-alert codes when they
// apply, otherwise the generic "ineligible".
function ineligibleCode(env: EmailEnv) {
  const teamMissing = env.teamAlertEmail ? sql`FALSE` : sql`TRUE`;
  return sql`CASE
    WHEN l.archived_at IS NULL AND m.kind = 'team_alert' AND ${teamMissing} THEN 'missing_team_address'
    WHEN l.archived_at IS NULL AND m.kind = 'owner_alert'
      AND (m.recipient IS DISTINCT FROM ${activeOwnerEmail} OR NOT ${latestOwnerAssignment})
      THEN 'owner_changed'
    ELSE 'ineligible' END`;
}

type Candidate = {
  eventId: string;
  leadId: string;
  type: OutboxEventType;
  payload: Record<string, unknown>;
  fullName: string;
  email: string | null;
  currentStage: Stage;
  source: LeadSource;
  archived: boolean;
  optedOut: boolean;
  current: boolean;
  followUpDue: boolean;
  tripTitle: string | null;
  destinationText: string | null;
  bookingTripTitle: string | null;
  // owner_alert: current owner's address while it holds an active leads.manage role.
  ownerEmail: string | null;
  // owner_alert: no later lead.owner_assigned of the same lead.
  latestOwnerAssignment: boolean;
  // team_alert: current owner's address, informative only (no role required).
  currentOwnerEmail: string | null;
};

const isBulk = (event: Candidate) =>
  event.source === "import" || event.payload.bulk === true;

const isInternal = (kind: ClientEmailKind) =>
  (internalEmailKindSchema.options as readonly string[]).includes(kind);

function welcomeKind(event: Candidate): ClientEmailKind {
  if (event.source === "runner_account") return "welcome_account";
  if (
    event.source === "google_form" ||
    (event.source === "web_form" && event.payload.form === "registration")
  )
    return "welcome_registration";
  // web_form from /contacto or without form, and manual whatsapp/other entries.
  return "welcome_contact";
}

// Kinds generated by each event (requirement 2). Welcomes replace the "new" stage email and
// booking_confirmed replaces the "reserved" one when a confirmed booking moved the lead.
function emailKinds(event: Candidate): ClientEmailKind[] {
  switch (event.type) {
    case "lead.created":
      // Imports (source import or bulk): nothing to the client nor the team. A single skipped
      // "stage" row with bulk_import, as before this spec, marks the event as handled so it never
      // returns to the pending batch, and the funnel card keeps showing it as omitted.
      return isBulk(event) ? ["stage"] : [welcomeKind(event), "team_alert"];
    case "lead.stage_changed":
      return event.payload.trigger === "booking" && event.payload.stageTo === "reserved"
        ? ["booking_confirmed"]
        : ["stage"];
    case "lead.follow_up_due":
      return ["follow_up"];
    case "lead.owner_assigned":
      return ["owner_alert"];
    default:
      return [];
  }
}

// Lead stage when the event happened (client_emails.stage).
function eventStage(event: Candidate): unknown {
  switch (event.type) {
    case "lead.created":
      return "new";
    case "lead.stage_changed":
      return event.payload.stageTo;
    case "lead.follow_up_due":
      return event.payload.stage;
    default:
      return event.currentStage;
  }
}

const validEmail = (value: string | null) =>
  value && z.email().max(254).safeParse(value).success ? value : null;

function recipientFor(kind: ClientEmailKind, event: Candidate, env: EmailEnv) {
  if (kind === "team_alert") return env.teamAlertEmail;
  if (kind === "owner_alert") return validEmail(event.ownerEmail);
  return validEmail(event.email);
}

// Same rules as eligible(), evaluated over the facts read by prepareEmails.
function skipReason(
  kind: ClientEmailKind,
  event: Candidate,
  stage: Stage,
  recipient: string | null,
): ClientEmailSkipReason | null {
  if (isInternal(kind)) {
    if (event.archived) return "archived";
    if (kind === "team_alert") return recipient ? null : "missing_team_address";
    return recipient && event.latestOwnerAssignment ? null : "owner_changed";
  }
  if (event.optedOut) return "opted_out";
  if (event.archived) return "archived";
  if (isBulk(event)) return "bulk_import";
  const sameEpisode = event.current && event.currentStage === stage;
  if (kind === "follow_up" && !(sameEpisode && event.followUpDue))
    return "obsolete_event";
  if ((kind === "stage" || kind === "booking_confirmed") && !sameEpisode)
    return "obsolete_event";
  return recipient ? null : "missing_email";
}

function emailContent(
  kind: ClientEmailKind,
  event: Candidate,
  stage: Stage,
  leadUrl: () => string,
) {
  const tripTitle =
    kind === "booking_confirmed"
      ? (event.bookingTripTitle ?? event.tripTitle)
      : event.tripTitle;
  const client = {
    fullName: event.fullName,
    race: raceLabel({ tripTitle, destinationText: event.destinationText }),
  };
  switch (kind) {
    case "stage":
      return clientEmailTemplate(stage, event.fullName);
    // Internal alerts: name, race, entry path or stage and the CRM link only. Never phone,
    // documents, medical or internal notes.
    case "team_alert":
      return lifecycleEmailTemplate(kind, {
        ...client,
        sourceLabel: SOURCE_LABELS[event.source] ?? SOURCE_LABELS.other,
        ownerEmail: validEmail(event.currentOwnerEmail),
        leadUrl: leadUrl(),
      });
    case "owner_alert":
      return lifecycleEmailTemplate(kind, {
        ...client,
        stageLabel: STAGE_LABELS[stage],
        leadUrl: leadUrl(),
      });
    // Sales cadence (crm-sales-cadence.md): emailKinds does not produce these kinds yet; their
    // templates and eligibility arrive with F1-T4.
    case "cadence_proposal":
    case "cadence_reminder":
      throw new Error(`Unsupported email kind: ${kind}`);
    default:
      return lifecycleEmailTemplate(kind, client);
  }
}

async function prepareEmails(env: EmailEnv) {
  const db = getDb();
  // Pending: an event without any client_emails row. Every kind of an event is inserted by the
  // same statement and the kinds depend only on the event (type, payload, immutable source), so an
  // event either has all its rows or none; concurrent preparations settle on (event, kind).
  // Events already handled before kinds existed (one "stage" row) are never prepared again.
  const result = await db.execute<Candidate>(sql`
    SELECT e.id AS "eventId", e.lead_id AS "leadId", e.type, e.payload,
      l.full_name AS "fullName", l.email, l.stage AS "currentStage", l.source,
      l.archived_at IS NOT NULL AS archived, l.contact_opt_out_at IS NOT NULL AS "optedOut",
      ${latestEvent} AS current,
      COALESCE(l.next_action_date <= ${getTodayDate()}::date, false) AS "followUpDue",
      t.title AS "tripTitle", l.destination_text AS "destinationText",
      CASE WHEN e.type = 'lead.stage_changed' AND e.payload->>'trigger' = 'booking' THEN (
        SELECT bt.title FROM bookings b JOIN trips bt ON bt.id = b.trip_id
        WHERE b.lead_id = l.id AND b.status <> 'cancelled' LIMIT 1
      ) END AS "bookingTripTitle",
      CASE WHEN e.type = 'lead.owner_assigned' THEN ${activeOwnerEmail} END AS "ownerEmail",
      ${latestOwnerAssignment} AS "latestOwnerAssignment",
      CASE WHEN e.type = 'lead.created' THEN (
        SELECT p.email FROM profiles p WHERE p.user_id = l.owner_user_id
      ) END AS "currentOwnerEmail"
    FROM outbox_events e JOIN leads l ON l.id = e.lead_id LEFT JOIN trips t ON t.id = l.trip_id
    WHERE e.type IN ('lead.created', 'lead.stage_changed', 'lead.follow_up_due', 'lead.owner_assigned')
      AND e.payload_version = 1
      AND CASE e.type
        WHEN 'lead.stage_changed' THEN COALESCE(e.payload->>'stageTo' IN (${STAGE_VALUES}), false)
        WHEN 'lead.follow_up_due' THEN COALESCE(e.payload->>'stage' IN (${STAGE_VALUES}), false)
        ELSE TRUE END
      AND e.created_at >= ${env.startAt.toISOString()}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM client_emails m WHERE m.source_event_id = e.id)
    ORDER BY e.sequence LIMIT 100
  `);
  let origin: string | undefined;
  const rows = result.rows.flatMap((event) => {
    const parsedStage = emailStageSchema.safeParse(eventStage(event));
    // Unsupported payloads are never cast into a database enum or sent.
    if (!parsedStage.success) return [];
    const stage = parsedStage.data;
    // Built on the server only, and only when an internal alert needs it.
    const leadUrl = () =>
      `${(origin ??= getEnv().APP_ORIGIN)}/crm/leads/${event.leadId}`;
    return emailKinds(event).map((kind) => {
      const recipient = recipientFor(kind, event, env);
      const reason = skipReason(kind, event, stage, recipient);
      return {
        sourceEventId: event.eventId,
        leadId: event.leadId,
        kind,
        stage,
        recipient,
        sender: env.from,
        ...emailContent(kind, event, stage, leadUrl),
        status: reason ? ("skipped" as const) : ("pending" as const),
        lastErrorCode: reason,
      };
    });
  });
  if (rows.length)
    await db
      .insert(clientEmails)
      .values(rows)
      .onConflictDoNothing({
        target: [clientEmails.sourceEventId, clientEmails.kind],
      });
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
        SELECT m.id, (${eligible(env)}) AS allowed, ${ineligibleCode(env)} AS code
        FROM client_emails m
        JOIN outbox_events e ON e.id = m.source_event_id JOIN leads l ON l.id = m.lead_id
        WHERE m.id = ${id}::uuid AND m.attempt_token = ${attemptToken}::uuid
          AND m.status = 'claimed' AND m.lease_until > now()
        FOR UPDATE OF m
      )
      UPDATE client_emails m SET
        status = CASE WHEN target.allowed THEN 'sending'::client_email_status ELSE 'skipped'::client_email_status END,
        lease_until = CASE WHEN target.allowed THEN now() + interval '5 minutes' ELSE NULL END,
        last_error_code = CASE WHEN target.allowed THEN NULL ELSE target.code END, updated_at = now()
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
