// Application schema (public only). Never model or manage the neon_auth schema here.
export * from "./content-schema";
export * from "./rewards-schema";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  bigserial,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const staffRoleEnum = pgEnum("staff_role", [
  "commercial",
  "admin",
  "super_admin",
  "organizer",
  "sponsor",
]);

// Known accounts: every Clerk account with a verified primary email that signed in (registered by the
// guard) or was backfilled, with or without roles. user_id is the stable Clerk user id (no cross-schema FK).
// email is lowercase and display-only: never used for authorization.
// Blocked = disabled_at IS NOT NULL (the guards fail closed). Deleted accounts keep their row as
// author of the history, with the email anonymized; deleting implies blocking (profiles_deleted_chk).
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: text("disabled_by").references((): AnyPgColumn => profiles.userId, {
      onDelete: "restrict",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references((): AnyPgColumn => profiles.userId, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    // Account lookup by email (welcome discount eligibility). Not unique: emails may repeat.
    index("profiles_email_idx").on(table.email),
    check("profiles_email_lowercase_chk", sql`${table.email} = lower(${table.email})`),
    check("profiles_deleted_chk", sql`${table.deletedAt} IS NULL OR ${table.disabledAt} IS NOT NULL`),
  ],
);

// Brands. Never deleted; slug fixed at creation. updated_at is set by the service.
export const sponsors = pgTable(
  "sponsors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),
    description: text("description"),
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
    uniqueIndex("sponsors_slug_uq").on(table.slug),
    check(
      "sponsors_slug_format_chk",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.slug}) BETWEEN 3 AND 80`,
    ),
    check("sponsors_name_chk", sql`char_length(${table.name}) BETWEEN 2 AND 80`),
    check(
      "sponsors_logo_url_chk",
      sql`${table.logoUrl} IS NULL OR (${table.logoUrl} LIKE 'https://%' AND char_length(${table.logoUrl}) <= 2048)`,
    ),
    check(
      "sponsors_website_url_chk",
      sql`${table.websiteUrl} IS NULL OR (${table.websiteUrl} LIKE 'https://%' AND char_length(${table.websiteUrl}) <= 2048)`,
    ),
    check(
      "sponsors_description_chk",
      sql`${table.description} IS NULL OR char_length(${table.description}) BETWEEN 10 AND 500`,
    ),
  ],
);

// Active assignment = revoked_at IS NULL. granted_by NULL = bootstrap script.
// sponsor_id is set exactly on sponsor rows; role::text keeps the migration single-transaction.
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
    sponsorId: uuid("sponsor_id").references(() => sponsors.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("staff_assignments_active_uq")
      .on(table.userId, table.role)
      .where(sql`${table.revokedAt} IS NULL`),
    check(
      "staff_assignments_sponsor_chk",
      sql`(${table.role}::text = 'sponsor') = (${table.sponsorId} IS NOT NULL)`,
    ),
  ],
);

// Pending invitation = accepted_at IS NULL AND revoked_at IS NULL (expiry checked at query time).
// sponsor_id is set exactly on sponsor invitations and copied on acceptance.
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
    sponsorId: uuid("sponsor_id").references(() => sponsors.id, { onDelete: "restrict" }),
  },
  (table) => [
    check(
      "staff_invitations_email_lowercase_chk",
      sql`${table.email} = lower(${table.email})`,
    ),
    check(
      "staff_invitations_sponsor_chk",
      sql`(${table.role}::text = 'sponsor') = (${table.sponsorId} IS NOT NULL)`,
    ),
    uniqueIndex("staff_invitations_pending_email_uq")
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);

export const roleRequestStatusEnum = pgEnum("role_request_status", ["pending", "approved", "rejected"]);

// Self-service role requests from accounts without CRM access. Only admin can be requested today
// (role::text keeps the migration single-transaction). A decided request records when and who;
// at most one pending request per account.
export const roleRequests = pgTable(
  "role_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    role: staffRoleEnum("role").notNull(),
    status: roleRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => profiles.userId, { onDelete: "restrict" }),
  },
  (table) => [
    check("role_requests_role_chk", sql`${table.role}::text = 'admin'`),
    check(
      "role_requests_decision_chk",
      sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL AND ${table.decidedBy} IS NULL)`,
    ),
    uniqueIndex("role_requests_pending_user_uq")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const tripStatusEnum = pgEnum("trip_status", ["draft", "published", "archived"]);
export const tripReviewStatusEnum = pgEnum("trip_review_status", ["in_review", "changes_requested"]);

// Trips are archived, never deleted, so a future leads.trip_id FK never dangles.
// Dates are calendar dates (YYYY-MM-DD); price_usd is an integer "from" price, always USD.
// updated_at is set by the service on every UPDATE (no trigger).
// sponsor_id NULL = team trip; review_* only on sponsor drafts. sponsor_id is never updated.
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
    // NULL = no organizer (created by commercial/admin/super_admin). Never set from the form.
    organizerId: text("organizer_id").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
    sponsorId: uuid("sponsor_id").references(() => sponsors.id, { onDelete: "restrict" }),
    featured: boolean("featured").notNull().default(false),
    reviewStatus: tripReviewStatusEnum("review_status"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trips_slug_uq").on(table.slug),
    index("trips_organizer_idx").on(table.organizerId),
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
    index("trips_sponsor_idx").on(table.sponsorId),
    check("trips_featured_chk", sql`NOT ${table.featured} OR ${table.status} = 'published'`),
    check(
      "trips_review_chk",
      sql`${table.reviewStatus} IS NULL OR (${table.sponsorId} IS NOT NULL AND ${table.status} = 'draft')`,
    ),
    // IS NOT DISTINCT FROM: a NULL review_status must not let the CHECK pass.
    check(
      "trips_review_note_chk",
      sql`(${table.reviewStatus} IS NOT DISTINCT FROM 'changes_requested') = (${table.reviewNote} IS NOT NULL) AND (${table.reviewNote} IS NULL OR char_length(${table.reviewNote}) BETWEEN 3 AND 500)`,
    ),
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
  "runner_account",
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
  // Staff marks that the client replied (crm-sales-cadence.md): stops the sales cadence of the
  // current stage episode. Requires an author and no body, like opted_out from the CRM.
  "responded",
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
    // Target of the trip_offers (campaign_id, trip_id) composite FK.
    unique("campaigns_id_trip_uq").on(table.id, table.tripId),
  ],
);

// Campaign link/QR opens per Lima calendar day (no visitor data). One row per campaign and day,
// upserted in a single statement (visits + 1). The PK starts with campaign_id, used to aggregate.
export const campaignVisitDays = pgTable(
  "campaign_visit_days",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    day: date("day", { mode: "string" }).notNull(),
    visits: integer("visits").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.day] }),
    check("campaign_visit_days_visits_chk", sql`${table.visits} > 0`),
  ],
);

export const tripOfferStatusEnum = pgEnum("trip_offer_status", [
  "draft",
  "approved",
  "active",
  "closed",
]);

// One row = one version of a trip's price offer. Scope = trip + optional campaign (NULL = the
// general offer); version is sequential within the scope. A version is immutable once approved
// (every write of its conditions requires status = 'draft') and is never deleted. The version that
// applies is resolved at read time (in force: active, within its Lima calendar dates, published
// trip and, for a campaign offer, an active campaign of the same trip). Amounts are integer USD.
export const tripOffers = pgTable(
  "trip_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id"),
    version: integer("version").notNull(),
    status: tripOfferStatusEnum("status").notNull().default("draft"),
    // Internal name, shown only in the CRM.
    name: text("name").notNull(),
    totalPriceUsd: integer("total_price_usd").notNull(),
    discountUsd: integer("discount_usd").notNull().default(0),
    finalPriceUsd: integer("final_price_usd").generatedAlwaysAs(
      sql`"total_price_usd" - "discount_usd"`,
    ),
    depositOptionsUsd: integer("deposit_options_usd").array().notNull().default([]),
    balanceDueOn: date("balance_due_on", { mode: "string" }),
    // Non-monetary benefit: never a discount.
    bonusDescription: text("bonus_description"),
    // Inclusive calendar dates evaluated in America/Lima.
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }),
    capacityLimit: integer("capacity_limit"),
    termsVersion: text("terms_version").notNull(),
    conditions: text("conditions").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set by the service when the draft is edited (no trigger).
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedBy: text("approved_by").references(() => profiles.userId, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    activatedBy: text("activated_by").references(() => profiles.userId, { onDelete: "restrict" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    closedBy: text("closed_by").references(() => profiles.userId, { onDelete: "restrict" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // The version that replaced this one when it was activated in the same scope.
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => tripOffers.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    // A campaign offer belongs to the campaign's trip (MATCH SIMPLE: skipped when campaign_id is NULL).
    foreignKey({
      name: "trip_offers_campaign_trip_fk",
      columns: [table.campaignId, table.tripId],
      foreignColumns: [campaigns.id, campaigns.tripId],
    }).onDelete("restrict"),
    index("trip_offers_trip_idx").on(table.tripId),
    check("trip_offers_version_chk", sql`${table.version} >= 1`),
    check("trip_offers_name_chk", sql`char_length(${table.name}) BETWEEN 2 AND 80`),
    check(
      "trip_offers_price_chk",
      sql`${table.totalPriceUsd} BETWEEN 1 AND 1000000 AND ${table.discountUsd} >= 0 AND ${table.discountUsd} < ${table.totalPriceUsd}`,
    ),
    check(
      "trip_offers_deposits_chk",
      sql`cardinality(${table.depositOptionsUsd}) <= 3 AND array_position(${table.depositOptionsUsd}, NULL) IS NULL AND 0 < ALL (${table.depositOptionsUsd}) AND (${table.totalPriceUsd} - ${table.discountUsd}) > ALL (${table.depositOptionsUsd})`,
    ),
    check(
      "trip_offers_balance_chk",
      sql`(cardinality(${table.depositOptionsUsd}) = 0) = (${table.balanceDueOn} IS NULL)`,
    ),
    check(
      "trip_offers_bonus_chk",
      sql`${table.bonusDescription} IS NULL OR char_length(${table.bonusDescription}) BETWEEN 2 AND 200`,
    ),
    check(
      "trip_offers_validity_chk",
      sql`${table.validUntil} IS NULL OR ${table.validUntil} >= ${table.validFrom}`,
    ),
    check(
      "trip_offers_capacity_chk",
      sql`${table.capacityLimit} IS NULL OR ${table.capacityLimit} BETWEEN 1 AND 10000`,
    ),
    check(
      "trip_offers_terms_version_chk",
      sql`${table.termsVersion} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.termsVersion}) BETWEEN 3 AND 60`,
    ),
    check(
      "trip_offers_conditions_chk",
      sql`char_length(${table.conditions}) BETWEEN 10 AND 2000`,
    ),
    check(
      "trip_offers_approved_chk",
      sql`(${table.approvedAt} IS NULL) = (${table.approvedBy} IS NULL) AND (${table.status} <> 'draft' OR ${table.approvedAt} IS NULL) AND (${table.status} NOT IN ('approved', 'active') OR ${table.approvedAt} IS NOT NULL)`,
    ),
    check(
      "trip_offers_activated_chk",
      sql`(${table.activatedAt} IS NULL) = (${table.activatedBy} IS NULL) AND (${table.activatedAt} IS NULL OR ${table.approvedAt} IS NOT NULL) AND (${table.status} <> 'active' OR ${table.activatedAt} IS NOT NULL) AND (${table.status} NOT IN ('draft', 'approved') OR ${table.activatedAt} IS NULL)`,
    ),
    check(
      "trip_offers_closed_chk",
      sql`(${table.status} = 'closed') = (${table.closedAt} IS NOT NULL) AND (${table.closedAt} IS NULL) = (${table.closedBy} IS NULL) AND (${table.supersededBy} IS NULL OR (${table.status} = 'closed' AND ${table.activatedAt} IS NOT NULL))`,
    ),
    // Unique version numbers, one active and one pending (draft or approved) version per scope.
    uniqueIndex("trip_offers_general_version_uq")
      .on(table.tripId, table.version)
      .where(sql`${table.campaignId} IS NULL`),
    uniqueIndex("trip_offers_campaign_version_uq")
      .on(table.campaignId, table.version)
      .where(sql`${table.campaignId} IS NOT NULL`),
    uniqueIndex("trip_offers_general_active_uq")
      .on(table.tripId)
      .where(sql`${table.status} = 'active' AND ${table.campaignId} IS NULL`),
    uniqueIndex("trip_offers_campaign_active_uq")
      .on(table.campaignId)
      .where(sql`${table.status} = 'active' AND ${table.campaignId} IS NOT NULL`),
    uniqueIndex("trip_offers_general_pending_uq")
      .on(table.tripId)
      .where(sql`${table.status} IN ('draft', 'approved') AND ${table.campaignId} IS NULL`),
    uniqueIndex("trip_offers_campaign_pending_uq")
      .on(table.campaignId)
      .where(sql`${table.status} IN ('draft', 'approved') AND ${table.campaignId} IS NOT NULL`),
  ],
);

// USD→PEN rate set by the team (soles per 1 USD). Insert-only: never updated or deleted. The
// current rate is the latest row; created_at is the moment it applies from.
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usdPen: numeric("usd_pen", { precision: 10, scale: 4 }).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("exchange_rates_created_idx").on(table.createdAt),
    check("exchange_rates_usd_pen_chk", sql`${table.usdPen} > 0 AND ${table.usdPen} < 100`),
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
    // NULL only for system sources: web_form, google_form, import and runner_account (leads_created_by_chk).
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
      sql`${table.createdBy} IS NOT NULL OR ${table.source} IN ('web_form', 'google_form', 'import', 'runner_account')`,
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
  "lead.owner_assigned",
  // A due step of the sales cadence (crm-sales-cadence.md); payload { stage, step }.
  "lead.cadence_due",
]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "processing", "succeeded", "dead"]);

// Durable events for n8n (pull model, at-least-once). id is the event_id n8n deduplicates on.
// payload is minimal and never holds personal data. A lease (lease_token + lease_until) exists
// only while processing; available_at is the next attempt time.
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Allocated after the lead lock in stage mutations. Timestamps alone cannot order
    // concurrent transitions (a waiting transaction may have an older now()).
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
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
    uniqueIndex("outbox_events_sequence_uq").on(table.sequence),
    index("outbox_events_lead_sequence_idx").on(table.leadId, table.sequence),
    index("outbox_events_ready_idx")
      .on(table.availableAt)
      .where(sql`${table.status} IN ('pending', 'processing')`),
  ],
);

export const clientEmailStatusEnum = pgEnum("client_email_status", [
  "pending", "claimed", "sending", "sent", "failed", "skipped", "unknown",
]);
// What the message is for: "stage" is the per-stage client email; the rest are lifecycle
// emails (crm-lifecycle-emails.md) and the sales cadence (crm-sales-cadence.md).
// team_alert/owner_alert are internal. New values go last.
export const clientEmailKindEnum = pgEnum("client_email_kind", [
  "stage",
  "welcome_registration",
  "welcome_contact",
  "welcome_account",
  "follow_up",
  "booking_confirmed",
  "team_alert",
  "owner_alert",
  "cadence_proposal",
  "cadence_reminder",
]);

// Separate from the original n8n event consumer. Each source event has at most one logical
// message per kind; stage is the lead's stage when the event happened.
// Final attempts retain their token so late/repeated callbacks can be reconciled safely.
export const clientEmails = pgTable("client_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceEventId: uuid("source_event_id").notNull().references(() => outboxEvents.id, { onDelete: "restrict" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  kind: clientEmailKindEnum("kind").notNull().default("stage"),
  stage: leadStageEnum("stage").notNull(),
  templateVersion: smallint("template_version").notNull().default(1),
  recipient: text("recipient"),
  sender: text("sender").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: clientEmailStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  attemptToken: uuid("attempt_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  executionId: text("execution_id"),
  smtpMessageId: text("smtp_message_id"),
  lastErrorCode: text("last_error_code"),
  retryRequestedBy: text("retry_requested_by").references(() => profiles.userId, { onDelete: "restrict" }),
  retryRequestedAt: timestamp("retry_requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("client_emails_event_kind_uq").on(table.sourceEventId, table.kind),
  index("client_emails_lead_created_idx").on(table.leadId, table.createdAt),
  index("client_emails_ready_idx").on(table.status, table.createdAt),
  check("client_emails_attempts_chk", sql`${table.attempts} BETWEEN 0 AND 3`),
  check("client_emails_lease_chk", sql`(${table.status} IN ('claimed', 'sending')) = (${table.leaseUntil} IS NOT NULL)`),
  check("client_emails_token_chk", sql`${table.status} NOT IN ('claimed', 'sending', 'sent', 'unknown') OR ${table.attemptToken} IS NOT NULL`),
  check("client_emails_sent_chk", sql`(${table.status} = 'sent') = (${table.sentAt} IS NOT NULL)`),
  check("client_emails_content_chk", sql`char_length(${table.subject}) BETWEEN 1 AND 200 AND char_length(${table.body}) BETWEEN 1 AND 4000 AND char_length(${table.sender}) BETWEEN 3 AND 254 AND (${table.recipient} IS NULL OR char_length(${table.recipient}) BETWEEN 3 AND 254)`),
  check("client_emails_error_chk", sql`${table.lastErrorCode} IS NULL OR ${table.lastErrorCode} ~ '^[a-z0-9_]{1,40}$'`),
  check("client_emails_execution_chk", sql`${table.executionId} IS NULL OR char_length(${table.executionId}) BETWEEN 1 AND 120`),
  check("client_emails_smtp_id_chk", sql`${table.smtpMessageId} IS NULL OR char_length(${table.smtpMessageId}) BETWEEN 1 AND 254`),
]);

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
    // NULL only for system activities: created and re_registered (web form), automation (n8n) and
    // opted_out confirmed by the client from the email unsubscribe link (no author), which must carry
    // the fixed note 'Baja desde el enlace del correo'.
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
    // optional on created/stage_changed. opted_out has no body, except the fixed note of the
    // authorless unsubscribe from the email link (crm-sales-cadence.md). Forbidden otherwise
    // (responded and the rest).
    check(
      "lead_activities_body_chk",
      sql`(${table.body} IS NULL OR char_length(${table.body}) BETWEEN 1 AND 2000) AND CASE WHEN ${table.type} IN ('note', 'call', 'message') THEN ${table.body} IS NOT NULL WHEN ${table.type} IN ('automation', 're_registered') THEN ${table.body} IS NOT NULL AND char_length(${table.body}) <= 500 WHEN ${table.type} IN ('created', 'stage_changed') THEN true WHEN ${table.type} = 'opted_out' THEN ${table.body} IS NULL OR (${table.actorUserId} IS NULL AND ${table.body} = 'Baja desde el enlace del correo') ELSE ${table.body} IS NULL END`,
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
    // IS NOT DISTINCT FROM: with "=" a NULL body would make the expression NULL, which a CHECK accepts.
    check(
      "lead_activities_actor_chk",
      sql`${table.actorUserId} IS NOT NULL OR ${table.type} IN ('created', 'automation', 're_registered') OR (${table.type} = 'opted_out' AND ${table.body} IS NOT DISTINCT FROM 'Baja desde el enlace del correo')`,
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
// runner_user_id is the Clerk user id (no cross-schema FK), linked once by verified email;
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
    offerVersionId: uuid("offer_version_id").references(() => tripOffers.id, { onDelete: "restrict" }),
    offerVersion: integer("offer_version"),
    offerCampaignId: uuid("offer_campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    offerTermsVersion: text("offer_terms_version"),
    offerConditionsSnapshot: text("offer_conditions_snapshot"),
    tripIncludesSnapshot: text("trip_includes_snapshot").array(),
    tripExcludesSnapshot: text("trip_excludes_snapshot").array(),
    initialPaymentUsd: integer("initial_payment_usd"),
    checkoutRateId: uuid("checkout_rate_id").references(() => exchangeRates.id, { onDelete: "restrict" }),
    checkoutRateUsdPen: numeric("checkout_rate_usd_pen", { precision: 10, scale: 4 }),
    checkoutAmountPenCents: integer("checkout_amount_pen_cents"),
    checkoutRequestId: uuid("checkout_request_id"),
    checkoutInputHash: text("checkout_input_hash"),
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
    // Demo checkout (Stripe TEST in production): kept apart from real bookings, capacity and totals.
    isSimulated: boolean("is_simulated").notNull().default(false),
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
    unique("bookings_checkout_request_uq").on(table.checkoutRequestId),
    // Target of the itinerary_items (booking_id, trip_id) composite FK.
    unique("bookings_id_trip_uq").on(table.id, table.tripId),
    // Simulated bookings never block a real booking with the same email.
    uniqueIndex("bookings_trip_email_active_uq")
      .on(table.tripId, table.participantEmail)
      .where(sql`${table.status} <> 'cancelled' AND NOT ${table.isSimulated}`),
    uniqueIndex("bookings_lead_active_uq")
      .on(table.leadId)
      .where(sql`${table.status} <> 'cancelled' AND NOT ${table.isSimulated}`),
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
      "bookings_checkout_snapshot_chk",
      sql`(${table.offerVersionId} IS NULL) = (${table.offerVersion} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.offerTermsVersion} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.offerConditionsSnapshot} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.tripIncludesSnapshot} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.tripExcludesSnapshot} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.initialPaymentUsd} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.checkoutInputHash} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.reservationExpiresAt} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.checkoutRateId} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.checkoutRateUsdPen} IS NULL) AND (${table.offerVersionId} IS NULL) = (${table.checkoutAmountPenCents} IS NULL) AND (${table.initialPaymentUsd} IS NULL OR ${table.initialPaymentUsd} BETWEEN 1 AND ${table.totalUsd}) AND (${table.checkoutInputHash} IS NULL OR ${table.checkoutInputHash} ~ '^[a-f0-9]{64}$') AND (${table.checkoutRateUsdPen} IS NULL OR ${table.checkoutRateUsdPen} > 0) AND (${table.checkoutAmountPenCents} IS NULL OR ${table.checkoutAmountPenCents} > 0)`,
    ),
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
    requestKey: uuid("request_key"),
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
    uniqueIndex("booking_payments_request_uq").on(table.bookingId, table.requestKey),
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

export const travelDocumentTypeEnum = pgEnum("travel_document_type", [
  "passport",
  "national_id",
  "foreign_id",
]);
export const shirtSizeEnum = pgEnum("shirt_size", ["xs", "s", "m", "l", "xl", "xxl"]);
export const raceDistanceEnum = pgEnum("race_distance", ["5k", "10k", "21k", "42k", "ultra"]);

// One runner profile per Clerk account (user_id, no cross-schema FK); staff can have one too.
// email is a lowercase, display-only copy of the session's verified email: never used to authorize
// or to link bookings. document_*, medical_notes (and by extension birth_date and the emergency
// contact) are sensitive: never in logs or errors. updated_at and consented_at are set by the service.
export const runnerProfiles = pgTable(
  "runner_profiles",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    country: text("country"),
    city: text("city"),
    birthDate: date("birth_date", { mode: "string" }),
    documentType: travelDocumentTypeEnum("document_type"),
    documentNumber: text("document_number"),
    documentExpiresOn: date("document_expires_on", { mode: "string" }),
    shirtSize: shirtSizeEnum("shirt_size"),
    preferredDistance: raceDistanceEnum("preferred_distance"),
    personalBest: text("personal_best"),
    club: text("club"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    medicalNotes: text("medical_notes"),
    consentVersion: text("consent_version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "runner_profiles_email_chk",
      sql`${table.email} = lower(${table.email}) AND char_length(${table.email}) <= 254`,
    ),
    check("runner_profiles_full_name_chk", sql`char_length(${table.fullName}) BETWEEN 2 AND 120`),
    check("runner_profiles_phone_chk", sql`${table.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check(
      "runner_profiles_country_chk",
      sql`${table.country} IS NULL OR char_length(${table.country}) BETWEEN 2 AND 80`,
    ),
    check(
      "runner_profiles_city_chk",
      sql`${table.city} IS NULL OR char_length(${table.city}) BETWEEN 2 AND 80`,
    ),
    // "Not in the future" is validated by zod: a CHECK with current_date is not immutable.
    check(
      "runner_profiles_birth_date_chk",
      sql`${table.birthDate} IS NULL OR ${table.birthDate} >= '1900-01-01'`,
    ),
    check(
      "runner_profiles_document_number_chk",
      sql`${table.documentNumber} IS NULL OR ${table.documentNumber} ~ '^[A-Z0-9]{4,20}$'`,
    ),
    check(
      "runner_profiles_document_chk",
      sql`(${table.documentType} IS NULL) = (${table.documentNumber} IS NULL) AND (${table.documentExpiresOn} IS NULL OR ${table.documentType} IS NOT NULL)`,
    ),
    check(
      "runner_profiles_personal_best_chk",
      sql`${table.personalBest} IS NULL OR char_length(${table.personalBest}) <= 60`,
    ),
    check(
      "runner_profiles_club_chk",
      sql`${table.club} IS NULL OR char_length(${table.club}) <= 80`,
    ),
    check(
      "runner_profiles_emergency_contact_name_chk",
      sql`${table.emergencyContactName} IS NULL OR char_length(${table.emergencyContactName}) BETWEEN 2 AND 120`,
    ),
    check(
      "runner_profiles_emergency_contact_phone_chk",
      sql`${table.emergencyContactPhone} IS NULL OR ${table.emergencyContactPhone} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      "runner_profiles_emergency_chk",
      sql`(${table.emergencyContactName} IS NULL) = (${table.emergencyContactPhone} IS NULL)`,
    ),
    check(
      "runner_profiles_medical_notes_chk",
      sql`${table.medicalNotes} IS NULL OR char_length(${table.medicalNotes}) <= 500`,
    ),
    check(
      "runner_profiles_consent_version_chk",
      sql`char_length(${table.consentVersion}) BETWEEN 1 AND 40`,
    ),
  ],
);

export const contractVersionStatusEnum = pgEnum("contract_version_status", ["draft", "approved"]);

export const contractVersions = pgTable(
  "contract_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionKey: text("version_key").notNull().unique(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: contractVersionStatusEnum("status").notNull().default("draft"),
    documentHash: text("document_hash"),
    createdBy: text("created_by").notNull().references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedBy: text("approved_by").references(() => profiles.userId, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    check("contract_versions_key_chk", sql`char_length(${table.versionKey}) BETWEEN 3 AND 60 AND ${table.versionKey} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("contract_versions_title_chk", sql`char_length(${table.title}) BETWEEN 2 AND 140`),
    check("contract_versions_body_chk", sql`char_length(${table.body}) BETWEEN 20 AND 50000`),
    check("contract_versions_approval_chk", sql`(${table.status} = 'approved') = (${table.approvedBy} IS NOT NULL) AND (${table.status} = 'approved') = (${table.approvedAt} IS NOT NULL) AND (${table.status} = 'approved') = (${table.documentHash} IS NOT NULL) AND (${table.documentHash} IS NULL OR ${table.documentHash} ~ '^[a-f0-9]{64}$')`),
  ],
);

export const bookingContractAcceptances = pgTable(
  "booking_contract_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "restrict" }),
    runnerUserId: text("runner_user_id").notNull(),
    contractVersionKey: text("contract_version_key").notNull().references(() => contractVersions.versionKey, { onDelete: "restrict" }),
    contractDocumentHash: text("contract_document_hash").notNull(),
    documentSnapshot: text("document_snapshot").notNull(),
    documentHash: text("document_hash").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("booking_contract_acceptances_hash_chk", sql`${table.contractDocumentHash} ~ '^[a-f0-9]{64}$' AND ${table.documentHash} ~ '^[a-f0-9]{64}$'`),
    check("booking_contract_acceptances_snapshot_chk", sql`char_length(${table.documentSnapshot}) BETWEEN 20 AND 100000`),
  ],
);

// Stripe mode of the key that created an attempt or settlement; the webhook requires it to match livemode.
export const stripeModeEnum = pgEnum("stripe_mode", ["test", "live"]);
export const bookingCheckoutAttemptKindEnum = pgEnum("booking_checkout_attempt_kind", ["initial", "balance"]);
export const bookingCheckoutAttemptStatusEnum = pgEnum("booking_checkout_attempt_status", ["pending", "created", "completed", "expired", "failed"]);
export const bookingCheckoutAttempts = pgTable(
  "booking_checkout_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    kind: bookingCheckoutAttemptKindEnum("kind").notNull(),
    status: bookingCheckoutAttemptStatusEnum("status").notNull().default("pending"),
    quoteHash: text("quote_hash").notNull(),
    amountUsd: integer("amount_usd").notNull(),
    amountPenCents: integer("amount_pen_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    stripeSessionId: text("stripe_session_id").unique(),
    checkoutUrl: text("checkout_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    stripeMode: stripeModeEnum("stripe_mode").notNull().default("test"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("booking_checkout_attempts_request_uq").on(table.bookingId, table.requestId),
    uniqueIndex("booking_checkout_attempts_active_uq").on(table.bookingId, table.kind).where(sql`${table.status} IN ('pending', 'created')`),
    check("booking_checkout_attempts_quote_hash_chk", sql`${table.quoteHash} ~ '^[a-f0-9]{64}$'`),
    check("booking_checkout_attempts_amount_chk", sql`${table.amountUsd} > 0 AND ${table.amountPenCents} > 0`),
    check("booking_checkout_attempts_session_chk", sql`${table.status} <> 'created' OR (${table.stripeSessionId} IS NOT NULL AND ${table.checkoutUrl} IS NOT NULL)`),
  ],
);

export const bookingStripeEventReceipts = pgTable(
  "booking_stripe_event_receipts",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    attemptId: uuid("attempt_id"),
    stripeSessionId: text("stripe_session_id"),
    outcome: text("outcome").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Explicit name: the generated one exceeds PostgreSQL's 63-character limit.
    foreignKey({
      name: "booking_stripe_event_receipts_attempt_id_fk",
      columns: [table.attemptId],
      foreignColumns: [bookingCheckoutAttempts.id],
    }).onDelete("restrict"),
  ],
);

export const bookingStripeSettlementStatusEnum = pgEnum("booking_stripe_settlement_status", ["applied", "needs_review"]);
export const bookingStripeSettlements = pgTable(
  "booking_stripe_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "restrict" }),
    attemptId: uuid("attempt_id").notNull().unique(),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    paymentIntentId: text("payment_intent_id").notNull().unique(),
    expectedAmountPenCents: integer("expected_amount_pen_cents").notNull(),
    receivedAmountPenCents: integer("received_amount_pen_cents").notNull(),
    amountUsd: integer("amount_usd").notNull(),
    currency: text("currency").notNull(),
    status: bookingStripeSettlementStatusEnum("status").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    stripeMode: stripeModeEnum("stripe_mode").notNull().default("test"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Explicit name: the generated one exceeds PostgreSQL's 63-character limit.
    foreignKey({
      name: "booking_stripe_settlements_attempt_id_fk",
      columns: [table.attemptId],
      foreignColumns: [bookingCheckoutAttempts.id],
    }).onDelete("restrict"),
    // Paid balance per booking (portal and CRM).
    index("booking_stripe_settlements_booking_idx").on(table.bookingId),
    check("booking_stripe_settlements_amount_chk", sql`${table.expectedAmountPenCents} > 0 AND ${table.receivedAmountPenCents} >= 0 AND ${table.amountUsd} > 0`),
    check("booking_stripe_settlements_currency_chk", sql`${table.currency} ~ '^[a-z]{3}$'`),
  ],
);

export const offerCapacityAllocationStatusEnum = pgEnum("offer_capacity_allocation_status", ["held", "confirmed", "released"]);
export const offerCapacityCounters = pgTable(
  "offer_capacity_counters",
  {
    offerVersionId: uuid("offer_version_id").primaryKey().references(() => tripOffers.id, { onDelete: "restrict" }),
    capacityLimit: integer("capacity_limit"),
    allocatedCount: integer("allocated_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("offer_capacity_counters_limit_chk", sql`${table.capacityLimit} IS NULL OR ${table.capacityLimit} BETWEEN 1 AND 10000`),
    check("offer_capacity_counters_count_chk", sql`${table.allocatedCount} >= 0 AND (${table.capacityLimit} IS NULL OR ${table.allocatedCount} <= ${table.capacityLimit})`),
  ],
);
export const offerCapacityAllocations = pgTable(
  "offer_capacity_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "restrict" }),
    offerVersionId: uuid("offer_version_id").notNull().references(() => tripOffers.id, { onDelete: "restrict" }),
    status: offerCapacityAllocationStatusEnum("status").notNull().default("held"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("offer_capacity_allocations_offer_status_idx").on(table.offerVersionId, table.status),
    check("offer_capacity_allocations_release_chk", sql`(${table.status} = 'released') = (${table.releasedAt} IS NOT NULL)`),
  ],
);

// Accounts allowed to use the demo checkout (Stripe TEST in production). user_id is the Clerk user id;
// active = revoked_at IS NULL. Read from Neon on every request: metadata, cookies and forms grant nothing.
export const checkoutDemoParticipants = pgTable("checkout_demo_participants", {
  userId: text("user_id")
    .primaryKey()
    .references(() => profiles.userId, { onDelete: "restrict" }),
  note: text("note"),
  grantedBy: text("granted_by")
    .notNull()
    .references(() => profiles.userId, { onDelete: "restrict" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
