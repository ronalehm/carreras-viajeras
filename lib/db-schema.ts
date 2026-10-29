// Application schema (public only). Never model or manage the neon_auth schema here.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
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
    officialUrl: text("official_url"),
    installmentsPriceUsd: integer("installments_price_usd"),
    depositUsd: integer("deposit_usd"),
    companionPriceUsd: integer("companion_price_usd"),
    paymentTerms: text("payment_terms"),
    excludes: text("excludes").array().notNull().default([]),
    notes: text("notes"),
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
    check(
      "trips_official_url_chk",
      sql`${table.officialUrl} IS NULL OR ${table.officialUrl} LIKE 'https://%'`,
    ),
    check(
      "trips_installments_price_usd_chk",
      sql`${table.installmentsPriceUsd} IS NULL OR ${table.installmentsPriceUsd} >= 0`,
    ),
    check("trips_deposit_usd_chk", sql`${table.depositUsd} IS NULL OR ${table.depositUsd} >= 0`),
    check(
      "trips_companion_price_usd_chk",
      sql`${table.companionPriceUsd} IS NULL OR ${table.companionPriceUsd} >= 0`,
    ),
    check("trips_excludes_chk", sql`cardinality(${table.excludes}) <= 20`),
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
// source = how the record entered the CRM (never edited); channel = how the person found us
// (editable, every change logged as channel_changed). New enum values always go last.
export const leadSourceEnum = pgEnum("lead_source", [
  "whatsapp",
  "web_form",
  "other",
  "google_form",
  "import",
]);
export const leadChannelEnum = pgEnum("lead_channel", [
  "event",
  "partner",
  "referral",
  "whatsapp",
  "whatsapp_status",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "google_ads",
  "luma",
  "web",
  "other",
  "unknown",
]);
export const contactPreferenceEnum = pgEnum("contact_preference", ["whatsapp", "email", "call"]);
export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "created",
  "stage_changed",
  "owner_changed",
  "archived",
  "note",
  "call",
  "message",
  "automation",
  "channel_changed",
  "opted_out",
  "re_registered",
]);

export const campaignStatusEnum = pgEnum("campaign_status", ["active", "closed"]);

// A campaign is one QR or link of the CRM: it attributes web leads to a trip, a channel and an
// optional event or stand. Closed, never deleted or reopened (leads keep pointing at it).
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    channel: leadChannelEnum("channel").notNull(),
    name: text("name").notNull(),
    eventName: text("event_name"),
    status: campaignStatusEnum("status").notNull().default("active"),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by").references(() => profiles.userId, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("campaigns_code_uq").on(table.code),
    index("campaigns_trip_idx").on(table.tripId),
    check(
      "campaigns_code_chk",
      sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.code}) BETWEEN 3 AND 32`,
    ),
    check("campaigns_channel_chk", sql`${table.channel} <> 'unknown'`),
    check("campaigns_name_chk", sql`char_length(${table.name}) BETWEEN 2 AND 80`),
    check(
      "campaigns_event_name_chk",
      sql`${table.eventName} IS NULL OR char_length(${table.eventName}) BETWEEN 2 AND 120`,
    ),
    check(
      "campaigns_closed_chk",
      sql`(${table.status} = 'closed') = (${table.closedAt} IS NOT NULL) AND (${table.closedAt} IS NULL) = (${table.closedBy} IS NULL)`,
    ),
  ],
);

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
    channel: leadChannelEnum("channel").notNull().default("unknown"),
    originDetail: text("origin_detail"),
    // channel, origin_detail and campaign_id are the first contact: a later web registration
    // never overwrites them. campaign_id is set only by the web capture (leads_campaign_chk).
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    // UTM values are written only by the web capture (lowercase, normalized); never edited.
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referredBy: text("referred_by"),
    referralPermission: boolean("referral_permission").notNull().default(false),
    // NULL = no preference.
    contactPreference: contactPreferenceEnum("contact_preference"),
    // Opt-out ("Pidió no seguir"): final in the MVP; while set, the lead can never have a next action.
    contactOptOutAt: timestamp("contact_opt_out_at", { withTimezone: true }),
    // Independent future-promotions checkbox of the web capture (same consent_version); NULL = not accepted.
    marketingOptInAt: timestamp("marketing_opt_in_at", { withTimezone: true }),
    stage: leadStageEnum("stage").notNull().default("new"),
    lostReason: text("lost_reason"),
    // NULL = unassigned (web form leads); the CRM assigns the first owner by hand.
    ownerUserId: text("owner_user_id").references(() => profiles.userId, { onDelete: "restrict" }),
    nextActionDate: date("next_action_date", { mode: "string" }),
    nextActionNote: text("next_action_note"),
    consentVersion: text("consent_version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NULL only for system sources: web_form, google_form and import (leads_created_by_chk).
    createdBy: text("created_by").references(() => profiles.userId, { onDelete: "restrict" }),
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
    // Web form idempotency: submissionId from the browser and SHA-256 hex of the normalized data.
    idempotencyKey: uuid("idempotency_key"),
    submissionHash: text("submission_hash"),
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
    check(
      "leads_created_by_chk",
      sql`${table.createdBy} IS NOT NULL OR ${table.source} IN ('web_form', 'google_form', 'import')`,
    ),
    check(
      "leads_origin_detail_chk",
      sql`${table.originDetail} IS NULL OR char_length(${table.originDetail}) BETWEEN 2 AND 120`,
    ),
    check(
      "leads_utm_chk",
      sql`(${table.utmSource} IS NULL OR char_length(${table.utmSource}) BETWEEN 1 AND 100) AND (${table.utmMedium} IS NULL OR char_length(${table.utmMedium}) BETWEEN 1 AND 100) AND (${table.utmCampaign} IS NULL OR char_length(${table.utmCampaign}) BETWEEN 1 AND 100)`,
    ),
    check(
      "leads_referred_by_chk",
      sql`${table.referredBy} IS NULL OR char_length(${table.referredBy}) BETWEEN 2 AND 120`,
    ),
    check(
      "leads_referral_permission_chk",
      sql`NOT ${table.referralPermission} OR ${table.referredBy} IS NOT NULL`,
    ),
    check(
      "leads_opt_out_chk",
      sql`${table.contactOptOutAt} IS NULL OR ${table.nextActionDate} IS NULL`,
    ),
    check(
      "leads_submission_chk",
      sql`(${table.idempotencyKey} IS NULL) = (${table.submissionHash} IS NULL) AND (${table.submissionHash} IS NULL OR ${table.submissionHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "leads_campaign_chk",
      sql`${table.campaignId} IS NULL OR ${table.source} = 'web_form'`,
    ),
    uniqueIndex("leads_idempotency_key_uq").on(table.idempotencyKey),
    index("leads_campaign_idx")
      .on(table.campaignId)
      .where(sql`${table.campaignId} IS NOT NULL`),
  ],
);

export const outboxEventTypeEnum = pgEnum("outbox_event_type", [
  "lead.created",
  "lead.stage_changed",
  "lead.follow_up_due",
  "lead.opted_out",
]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "processing", "succeeded", "dead"]);

// Durable events for n8n (pull model, at-least-once). id is the event_id n8n deduplicates on.
// payload is minimal and never holds personal data. A lease (lease_token + lease_until) exists
// only while processing; available_at is the next attempt time.
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: outboxEventTypeEnum("type").notNull(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    payloadVersion: smallint("payload_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    // Business-rule uniqueness (e.g. one lead.follow_up_due per stage episode); required for follow-ups.
    dedupeKey: text("dedupe_key"),
  },
  (table) => [
    check("outbox_events_payload_version_chk", sql`${table.payloadVersion} >= 1`),
    check(
      "outbox_events_payload_chk",
      sql`jsonb_typeof(${table.payload}) = 'object' AND octet_length(${table.payload}::text) <= 1024`,
    ),
    check("outbox_events_attempts_chk", sql`${table.attempts} BETWEEN 0 AND 8`),
    check(
      "outbox_events_lease_chk",
      sql`(${table.status} = 'processing') = (${table.leaseToken} IS NOT NULL) AND (${table.leaseToken} IS NULL) = (${table.leaseUntil} IS NULL)`,
    ),
    check(
      "outbox_events_processed_chk",
      sql`(${table.status} IN ('succeeded', 'dead')) = (${table.processedAt} IS NOT NULL)`,
    ),
    check(
      "outbox_events_last_error_code_chk",
      sql`${table.lastErrorCode} IS NULL OR ${table.lastErrorCode} ~ '^[a-z0-9_]{1,40}$'`,
    ),
    check(
      "outbox_events_dedupe_key_chk",
      sql`(${table.dedupeKey} IS NULL OR char_length(${table.dedupeKey}) BETWEEN 1 AND 120) AND (${table.type} <> 'lead.follow_up_due' OR ${table.dedupeKey} IS NOT NULL)`,
    ),
    uniqueIndex("outbox_events_dedupe_key_uq")
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} IS NOT NULL`),
    index("outbox_events_ready_idx")
      .on(table.availableAt)
      .where(sql`${table.status} IN ('pending', 'processing')`),
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
    channelFrom: leadChannelEnum("channel_from"),
    channelTo: leadChannelEnum("channel_to"),
    // NULL only for system activities: created and re_registered (web form) and automation (n8n).
    actorUserId: text("actor_user_id").references(() => profiles.userId, { onDelete: "restrict" }),
    // The outbox event an automation activity comes from (one activity per event).
    sourceEventId: uuid("source_event_id").references(() => outboxEvents.id, { onDelete: "restrict" }),
    // Web form idempotency of a repeated registration (no new lead): the browser submissionId.
    submissionId: uuid("submission_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // body: required for manual follow-up, required (≤ 500) for automation and re_registered,
    // optional on created/stage_changed, forbidden otherwise.
    check(
      "lead_activities_body_chk",
      sql`(${table.body} IS NULL OR char_length(${table.body}) BETWEEN 1 AND 2000) AND CASE WHEN ${table.type} IN ('note', 'call', 'message') THEN ${table.body} IS NOT NULL WHEN ${table.type} IN ('automation', 're_registered') THEN ${table.body} IS NOT NULL AND char_length(${table.body}) <= 500 WHEN ${table.type} IN ('created', 'stage_changed') THEN true ELSE ${table.body} IS NULL END`,
    ),
    check(
      "lead_activities_stage_chk",
      sql`CASE WHEN ${table.type} = 'stage_changed' THEN ${table.stageFrom} IS NOT NULL AND ${table.stageTo} IS NOT NULL AND ${table.stageFrom} <> ${table.stageTo} ELSE ${table.stageFrom} IS NULL AND ${table.stageTo} IS NULL END`,
    ),
    // owner_from is NULL when the first owner is assigned (web form leads).
    check(
      "lead_activities_owner_chk",
      sql`CASE WHEN ${table.type} = 'owner_changed' THEN ${table.ownerTo} IS NOT NULL AND ${table.ownerFrom} IS DISTINCT FROM ${table.ownerTo} ELSE ${table.ownerFrom} IS NULL AND ${table.ownerTo} IS NULL END`,
    ),
    check(
      "lead_activities_channel_chk",
      sql`CASE WHEN ${table.type} = 'channel_changed' THEN ${table.channelFrom} IS NOT NULL AND ${table.channelTo} IS NOT NULL AND ${table.channelFrom} <> ${table.channelTo} ELSE ${table.channelFrom} IS NULL AND ${table.channelTo} IS NULL END`,
    ),
    check(
      "lead_activities_actor_chk",
      sql`${table.actorUserId} IS NOT NULL OR ${table.type} IN ('created', 'automation', 're_registered')`,
    ),
    check(
      "lead_activities_event_chk",
      sql`(${table.type} = 'automation') = (${table.sourceEventId} IS NOT NULL)`,
    ),
    check(
      "lead_activities_submission_chk",
      sql`(${table.type} = 're_registered') = (${table.submissionId} IS NOT NULL)`,
    ),
    index("lead_activities_lead_created_idx").on(table.leadId, table.createdAt),
    uniqueIndex("lead_activities_source_event_uq").on(table.sourceEventId),
    uniqueIndex("lead_activities_submission_uq").on(table.submissionId),
  ],
);

export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "cancelled"]);
export const itineraryKindEnum = pgEnum("itinerary_kind", [
  "document",
  "registration",
  "flight",
  "transfer",
  "hotel",
  "activity",
  "race",
  "return",
]);
export const itineraryStatusEnum = pgEnum("itinerary_status", [
  "pending",
  "provisional",
  "confirmed",
  "completed",
  "cancelled",
]);

// One booking = one participant on one trip. Cancelled, never deleted.
// runner_user_id is the Neon Auth id (no cross-schema FK), linked once by verified email;
// after that, authorization uses only runner_user_id. Amounts are integer USD.
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    participantName: text("participant_name").notNull(),
    participantEmail: text("participant_email").notNull(),
    runnerUserId: text("runner_user_id"),
    // At most one non-cancelled booking per lead (bookings_lead_active_uq).
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "restrict" }),
    status: bookingStatusEnum("status").notNull().default("pending"),
    packageLabel: text("package_label").notNull(),
    distance: text("distance"),
    totalUsd: integer("total_usd").notNull(),
    balanceDueOn: date("balance_due_on", { mode: "string" }),
    internalNote: text("internal_note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Target of the itinerary_items (booking_id, trip_id) composite FK.
    unique("bookings_id_trip_uq").on(table.id, table.tripId),
    uniqueIndex("bookings_trip_email_active_uq")
      .on(table.tripId, table.participantEmail)
      .where(sql`${table.status} <> 'cancelled'`),
    uniqueIndex("bookings_lead_active_uq")
      .on(table.leadId)
      .where(sql`${table.status} <> 'cancelled'`),
    index("bookings_runner_user_idx").on(table.runnerUserId),
    index("bookings_unlinked_email_idx")
      .on(table.participantEmail)
      .where(sql`${table.runnerUserId} IS NULL`),
    check(
      "bookings_participant_name_chk",
      sql`char_length(${table.participantName}) BETWEEN 2 AND 120`,
    ),
    check(
      "bookings_participant_email_chk",
      sql`${table.participantEmail} = lower(${table.participantEmail}) AND char_length(${table.participantEmail}) <= 254`,
    ),
    check("bookings_package_label_chk", sql`char_length(${table.packageLabel}) BETWEEN 1 AND 80`),
    check("bookings_distance_chk", sql`${table.distance} IS NULL OR char_length(${table.distance}) <= 20`),
    check("bookings_total_usd_chk", sql`${table.totalUsd} >= 0`),
    check(
      "bookings_internal_note_chk",
      sql`${table.internalNote} IS NULL OR char_length(${table.internalNote}) <= 2000`,
    ),
  ],
);

// Confirmed manual payments. Voided, never deleted; voided ones do not count toward the balance.
export const bookingPayments = pgTable(
  "booking_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    amountUsd: integer("amount_usd").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    concept: text("concept").notNull(),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => profiles.userId, { onDelete: "restrict" }),
  },
  (table) => [
    index("booking_payments_booking_idx").on(table.bookingId),
    check("booking_payments_amount_usd_chk", sql`${table.amountUsd} > 0`),
    check("booking_payments_concept_chk", sql`char_length(${table.concept}) BETWEEN 1 AND 80`),
    check(
      "booking_payments_voided_chk",
      sql`(${table.voidedAt} IS NULL) = (${table.voidedBy} IS NULL)`,
    ),
  ],
);

// booking_id NULL = trip-wide item (every participant sees it). Times are local wall-clock
// at the item's place, each edge with its own IANA zone; dates without time carry no zone.
export const itineraryItems = pgTable(
  "itinerary_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id"),
    kind: itineraryKindEnum("kind").notNull(),
    status: itineraryStatusEnum("status").notNull().default("pending"),
    title: text("title").notNull(),
    details: text("details"),
    location: text("location"),
    startDate: date("start_date", { mode: "string" }),
    startTime: time("start_time"),
    startTimeZone: text("start_time_zone"),
    endDate: date("end_date", { mode: "string" }),
    endTime: time("end_time"),
    endTimeZone: text("end_time_zone"),
    runnerVisible: boolean("runner_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A booking item belongs to the booking's trip (MATCH SIMPLE: skipped when booking_id is NULL).
    foreignKey({
      name: "itinerary_items_booking_trip_fk",
      columns: [table.bookingId, table.tripId],
      foreignColumns: [bookings.id, bookings.tripId],
    }).onDelete("restrict"),
    index("itinerary_items_trip_idx").on(table.tripId),
    index("itinerary_items_booking_idx").on(table.bookingId),
    check("itinerary_items_title_chk", sql`char_length(${table.title}) BETWEEN 1 AND 120`),
    check(
      "itinerary_items_details_chk",
      sql`${table.details} IS NULL OR char_length(${table.details}) <= 1000`,
    ),
    check(
      "itinerary_items_location_chk",
      sql`${table.location} IS NULL OR char_length(${table.location}) <= 160`,
    ),
    check(
      "itinerary_items_start_time_zone_chk",
      sql`${table.startTimeZone} IS NULL OR (${table.startTimeZone} ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(${table.startTimeZone}) <= 64)`,
    ),
    check(
      "itinerary_items_end_time_zone_chk",
      sql`${table.endTimeZone} IS NULL OR (${table.endTimeZone} ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' AND char_length(${table.endTimeZone}) <= 64)`,
    ),
    check(
      "itinerary_items_schedule_chk",
      sql`(${table.startTime} IS NULL OR ${table.startDate} IS NOT NULL) AND (${table.endTime} IS NULL OR ${table.endDate} IS NOT NULL) AND (${table.startTime} IS NULL) = (${table.startTimeZone} IS NULL) AND (${table.endTime} IS NULL) = (${table.endTimeZone} IS NULL) AND (${table.endDate} IS NULL OR (${table.startDate} IS NOT NULL AND ${table.endDate} >= ${table.startDate}))`,
    ),
  ],
);

// Team announcements to every participant of a trip. Published and deleted, never edited.
export const tripUpdates = pgTable(
  "trip_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trip_updates_trip_published_idx").on(table.tripId, table.publishedAt),
    check("trip_updates_title_chk", sql`char_length(${table.title}) BETWEEN 3 AND 120`),
    check("trip_updates_body_chk", sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
  ],
);
