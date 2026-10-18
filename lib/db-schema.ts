// Application schema (public only). Never model or manage the neon_auth schema here.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const staffRoleEnum = pgEnum("staff_role", ["commercial", "admin"]);

// Staff accounts only. user_id is the stable Neon Auth id (no cross-schema FK).
// email is lowercase and display-only: never used for authorization.
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("profiles_email_lowercase_chk", sql`${table.email} = lower(${table.email})`),
  ],
);

// Active assignment = revoked_at IS NULL. granted_by NULL = bootstrap script.
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    role: staffRoleEnum("role").notNull(),
    reason: text("reason").notNull(),
    grantedBy: text("granted_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    uniqueIndex("staff_assignments_active_uq")
      .on(table.userId, table.role)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

// Pending invitation = accepted_at IS NULL AND revoked_at IS NULL (expiry checked at query time).
export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: staffRoleEnum("role").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: text("accepted_user_id").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check(
      "staff_invitations_email_lowercase_chk",
      sql`${table.email} = lower(${table.email})`,
    ),
    uniqueIndex("staff_invitations_pending_email_uq")
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);

export const tripStatusEnum = pgEnum("trip_status", ["draft", "published", "archived"]);

// Trips are archived, never deleted, so a future leads.trip_id FK never dangles.
// Dates are calendar dates (YYYY-MM-DD); price_usd is an integer "from" price, always USD.
// updated_at is set by the service on every UPDATE (no trigger).
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    raceDate: date("race_date", { mode: "string" }).notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    distances: text("distances").array().notNull(),
    summary: text("summary").notNull(),
    includes: text("includes").array().notNull().default([]),
    priceUsd: integer("price_usd"),
    capacity: integer("capacity"),
    imageUrl: text("image_url"),
    status: tripStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trips_slug_uq").on(table.slug),
    check(
      "trips_slug_format_chk",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.slug}) BETWEEN 3 AND 80`,
    ),
    check(
      "trips_travel_dates_chk",
      sql`(${table.startDate} IS NULL) = (${table.endDate} IS NULL) AND (${table.startDate} IS NULL OR (${table.startDate} <= ${table.raceDate} AND ${table.raceDate} <= ${table.endDate}))`,
    ),
    check("trips_distances_chk", sql`cardinality(${table.distances}) BETWEEN 1 AND 10`),
    check("trips_includes_chk", sql`cardinality(${table.includes}) <= 20`),
    check("trips_price_usd_chk", sql`${table.priceUsd} IS NULL OR ${table.priceUsd} >= 0`),
    check("trips_capacity_chk", sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
    check("trips_image_url_chk", sql`${table.imageUrl} IS NULL OR ${table.imageUrl} LIKE 'https://%'`),
  ],
);

export const leadStageEnum = pgEnum("lead_stage", [
  "new",
  "contacted",
  "quoted",
  "reserved",
  "paid",
  "lost",
]);
export const leadSourceEnum = pgEnum("lead_source", ["whatsapp", "web_form", "other"]);
export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "created",
  "stage_changed",
  "owner_changed",
  "archived",
  "note",
  "call",
  "message",
]);

// Leads are archived, never deleted. paid and lost are closed stages: no next action there.
// phone is E.164 (normalized by the schema); email is lowercase. updated_at is set by the service.
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    location: text("location"),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "restrict" }),
    destinationText: text("destination_text"),
    source: leadSourceEnum("source").notNull(),
    stage: leadStageEnum("stage").notNull().default("new"),
    lostReason: text("lost_reason"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    nextActionDate: date("next_action_date", { mode: "string" }),
    nextActionNote: text("next_action_note"),
    consentVersion: text("consent_version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check("leads_full_name_chk", sql`char_length(${table.fullName}) BETWEEN 2 AND 120`),
    check("leads_phone_chk", sql`${table.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check(
      "leads_email_chk",
      sql`${table.email} IS NULL OR (${table.email} = lower(${table.email}) AND char_length(${table.email}) <= 254)`,
    ),
    check("leads_location_chk", sql`${table.location} IS NULL OR char_length(${table.location}) <= 80`),
    check(
      "leads_destination_text_chk",
      sql`${table.destinationText} IS NULL OR char_length(${table.destinationText}) <= 120`,
    ),
    check(
      "leads_lost_reason_chk",
      sql`(${table.stage} = 'lost') = (${table.lostReason} IS NOT NULL) AND (${table.lostReason} IS NULL OR char_length(${table.lostReason}) <= 200)`,
    ),
    check(
      "leads_next_action_chk",
      sql`(${table.nextActionNote} IS NULL OR (${table.nextActionDate} IS NOT NULL AND char_length(${table.nextActionNote}) <= 200)) AND (${table.nextActionDate} IS NULL OR (${table.stage} NOT IN ('paid', 'lost') AND ${table.archivedAt} IS NULL))`,
    ),
    check(
      "leads_consent_version_chk",
      sql`char_length(${table.consentVersion}) BETWEEN 1 AND 40`,
    ),
    check("leads_archived_chk", sql`(${table.archivedAt} IS NULL) = (${table.archivedBy} IS NULL)`),
  ],
);

// Append-only history: never updated or deleted. Typed columns per activity type (no JSON).
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    type: leadActivityTypeEnum("type").notNull(),
    body: text("body"),
    stageFrom: leadStageEnum("stage_from"),
    stageTo: leadStageEnum("stage_to"),
    ownerFrom: text("owner_from").references(() => profiles.userId, { onDelete: "restrict" }),
    ownerTo: text("owner_to").references(() => profiles.userId, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // body: required for manual follow-up, optional on created/stage_changed, forbidden otherwise.
    check(
      "lead_activities_body_chk",
      sql`(${table.body} IS NULL OR char_length(${table.body}) BETWEEN 1 AND 2000) AND CASE WHEN ${table.type} IN ('note', 'call', 'message') THEN ${table.body} IS NOT NULL WHEN ${table.type} IN ('created', 'stage_changed') THEN true ELSE ${table.body} IS NULL END`,
    ),
    check(
      "lead_activities_stage_chk",
      sql`CASE WHEN ${table.type} = 'stage_changed' THEN ${table.stageFrom} IS NOT NULL AND ${table.stageTo} IS NOT NULL AND ${table.stageFrom} <> ${table.stageTo} ELSE ${table.stageFrom} IS NULL AND ${table.stageTo} IS NULL END`,
    ),
    check(
      "lead_activities_owner_chk",
      sql`CASE WHEN ${table.type} = 'owner_changed' THEN ${table.ownerFrom} IS NOT NULL AND ${table.ownerTo} IS NOT NULL AND ${table.ownerFrom} <> ${table.ownerTo} ELSE ${table.ownerFrom} IS NULL AND ${table.ownerTo} IS NULL END`,
    ),
    index("lead_activities_lead_created_idx").on(table.leadId, table.createdAt),
  ],
);

export const automationEventStatusEnum = pgEnum("automation_event_status", [
  "pending",
  "processing",
  "succeeded",
  "dead",
]);

// Outbox for n8n (at-least-once delivery; id is the eventId n8n deduplicates by).
// lead_id has no FK in this phase (automation-outbox F1); the lead capture spec adds it.
// payload is validated with zod before insert. 8 = MAX_ATTEMPTS of modules/automation.
// lease_token is kept on succeeded so a repeated ack with the same token stays idempotent.
export const automationEvents = pgTable(
  "automation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    leadId: uuid("lead_id").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    payload: jsonb("payload").notNull(),
    status: automationEventStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    check("automation_events_type_chk", sql`${table.type} IN ('lead.created')`),
    check("automation_events_payload_version_chk", sql`${table.payloadVersion} > 0`),
    check("automation_events_attempts_chk", sql`${table.attempts} BETWEEN 0 AND 8`),
    check(
      "automation_events_last_error_code_chk",
      sql`${table.lastErrorCode} IS NULL OR ${table.lastErrorCode} ~ '^[a-z0-9_]{1,64}$'`,
    ),
    check(
      "automation_events_processing_lease_chk",
      sql`${table.status} <> 'processing' OR (${table.leaseToken} IS NOT NULL AND ${table.leaseUntil} IS NOT NULL)`,
    ),
    check(
      "automation_events_processed_at_chk",
      sql`(${table.status} = 'succeeded') = (${table.processedAt} IS NOT NULL)`,
    ),
    uniqueIndex("automation_events_type_lead_uq").on(table.type, table.leadId),
    index("automation_events_pending_idx")
      .on(table.availableAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("automation_events_lease_idx")
      .on(table.leaseUntil)
      .where(sql`${table.status} = 'processing'`),
  ],
);

// Audit of manual redrives (dead → pending). Written only by scripts/sql with the migration role.
export const automationEventRedrives = pgTable(
  "automation_event_redrives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => automationEvents.id, { onDelete: "restrict" }),
    performedBy: text("performed_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "automation_event_redrives_reason_chk",
      sql`char_length(${table.reason}) BETWEEN 1 AND 500`,
    ),
  ],
);
