import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings, profiles } from "@/lib/db-schema";

export const rewardKindEnum = pgEnum("reward_kind", ["discount", "benefit"]);
export const rewardRedemptionStatusEnum = pgEnum("reward_redemption_status", ["available", "applied", "cancelled", "expired"]);
export const rewardLedgerKindEnum = pgEnum("reward_ledger_kind", ["referral_credit", "referral_reversal", "redemption", "redemption_refund"]);
export const bookingBenefitKindEnum = pgEnum("booking_benefit_kind", ["contractual", "discount"]);

export const referralCodes = pgTable("referral_codes", {
  userId: text("user_id").primaryKey(),
  code: text("code").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("referral_codes_code_uq").on(t.code), check("referral_codes_code_chk", sql`${t.code} ~ '^[A-Za-z0-9_-]{24,64}$'`)]);

export const rewardRuleVersions = pgTable("reward_rule_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull(),
  pointsPerReferral: integer("points_per_referral").notNull(),
  active: boolean("active").notNull().default(false),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedBy: text("deactivated_by").references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validUntil: date("valid_until", { mode: "string" }),
  maxReferralsPerRunner: integer("max_referrals_per_runner"),
  terms: text("terms").notNull(),
  createdBy: text("created_by").notNull().references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("reward_rule_versions_version_uq").on(t.version),
  uniqueIndex("reward_rule_versions_active_uq").on(t.active).where(sql`${t.active}`),
  check("reward_rule_versions_values_chk", sql`${t.version} > 0 AND ${t.pointsPerReferral} BETWEEN 1 AND 1000000 AND (${t.maxReferralsPerRunner} IS NULL OR ${t.maxReferralsPerRunner} BETWEEN 1 AND 1000000)`),
  check("reward_rule_versions_dates_chk", sql`${t.validUntil} IS NULL OR ${t.validUntil} >= ${t.validFrom}`),
  check("reward_rule_versions_terms_chk", sql`char_length(${t.terms}) BETWEEN 10 AND 4000`),
]);

export const rewardAccounts = pgTable("reward_accounts", {
  userId: text("user_id").primaryKey(),
  // A reversal may make this negative after a prize was used. This is a points adjustment,
  // never a monetary debt. No new redemption is possible until funds cover its cost.
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("reward_accounts_balance_chk", sql`${t.balance} BETWEEN -9007199254740991 AND 9007199254740991`)]);

export const runnerReferrals = pgTable("runner_referrals", {
  referredUserId: text("referred_user_id").primaryKey(),
  referrerUserId: text("referrer_user_id").notNull().references(() => referralCodes.userId, { onDelete: "restrict" }),
  ruleVersionId: uuid("rule_version_id").notNull().references(() => rewardRuleVersions.id, { onDelete: "restrict" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  netPoints: integer("net_points").notNull().default(0),
  eligibilityVersion: integer("eligibility_version").notNull().default(0),
  creditedBookingId: uuid("credited_booking_id").references((): AnyPgColumn => bookings.id, { onDelete: "restrict" }),
  lastQualifiedAt: timestamp("last_qualified_at", { withTimezone: true }),
}, (t) => [
  index("runner_referrals_referrer_idx").on(t.referrerUserId),
  check("runner_referrals_self_chk", sql`${t.referredUserId} <> ${t.referrerUserId}`),
  check("runner_referrals_points_chk", sql`${t.netPoints} >= 0 AND ${t.eligibilityVersion} >= 0`),
]);

export const rewardCatalogVersions = pgTable("reward_catalog_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogKey: uuid("catalog_key").notNull().defaultRandom(),
  version: integer("version").notNull(),
  kind: rewardKindEnum("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  costStars: integer("cost_stars").notNull(),
  discountUsd: integer("discount_usd"),
  active: boolean("active").notNull().default(false),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedBy: text("deactivated_by").references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validUntil: date("valid_until", { mode: "string" }),
  stock: integer("stock"),
  maxPerRunner: integer("max_per_runner").notNull(),
  redemptionDays: integer("redemption_days").notNull(),
  createdBy: text("created_by").notNull().references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("reward_catalog_versions_key_version_uq").on(t.catalogKey, t.version),
  uniqueIndex("reward_catalog_versions_active_uq").on(t.catalogKey).where(sql`${t.active}`),
  check("reward_catalog_versions_values_chk", sql`${t.version} > 0 AND ${t.costStars} BETWEEN 1 AND 1000000 AND ${t.maxPerRunner} BETWEEN 1 AND 10000 AND ${t.redemptionDays} BETWEEN 1 AND 3650 AND (${t.stock} IS NULL OR ${t.stock} BETWEEN 1 AND 1000000)`),
  check("reward_catalog_versions_content_chk", sql`char_length(${t.title}) BETWEEN 2 AND 120 AND char_length(${t.description}) BETWEEN 10 AND 4000`),
  check("reward_catalog_versions_discount_chk", sql`(${t.kind} = 'discount' AND ${t.discountUsd} IS NOT NULL AND ${t.discountUsd} BETWEEN 1 AND 1000000) OR (${t.kind} = 'benefit' AND ${t.discountUsd} IS NULL)`),
  check("reward_catalog_versions_dates_chk", sql`${t.validUntil} IS NULL OR ${t.validUntil} >= ${t.validFrom}`),
]);

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => rewardAccounts.userId, { onDelete: "restrict" }),
  catalogVersionId: uuid("catalog_version_id").notNull().references(() => rewardCatalogVersions.id, { onDelete: "restrict" }),
  requestKey: uuid("request_key").notNull(),
  status: rewardRedemptionStatusEnum("status").notNull().default("available"),
  kind: rewardKindEnum("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  costStars: integer("cost_stars").notNull(),
  discountUsd: integer("discount_usd"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  bookingId: uuid("booking_id").references((): AnyPgColumn => bookings.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  appliedBy: text("applied_by").references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (t) => [
  unique("reward_redemptions_request_uq").on(t.userId, t.requestKey),
  index("reward_redemptions_user_idx").on(t.userId),
  check("reward_redemptions_cost_chk", sql`${t.costStars} > 0`),
  check("reward_redemptions_discount_chk", sql`(${t.kind} = 'discount' AND ${t.discountUsd} IS NOT NULL AND ${t.discountUsd} > 0) OR (${t.kind} = 'benefit' AND ${t.discountUsd} IS NULL)`),
  check("reward_redemptions_applied_chk", sql`(${t.status} = 'applied') = (${t.appliedAt} IS NOT NULL) AND (${t.appliedAt} IS NULL) = (${t.appliedBy} IS NULL)`),
]);

export const rewardLedger = pgTable("reward_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => rewardAccounts.userId, { onDelete: "restrict" }),
  kind: rewardLedgerKindEnum("kind").notNull(),
  delta: integer("delta").notNull(),
  causeKey: text("cause_key").notNull(),
  referralUserId: text("referral_user_id").references(() => runnerReferrals.referredUserId, { onDelete: "restrict" }),
  redemptionId: uuid("redemption_id").references(() => rewardRedemptions.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("reward_ledger_cause_uq").on(t.causeKey),
  index("reward_ledger_user_idx").on(t.userId),
  check("reward_ledger_delta_chk", sql`${t.delta} <> 0`),
  check("reward_ledger_cause_chk", sql`(${t.referralUserId} IS NOT NULL) <> (${t.redemptionId} IS NOT NULL)`),
]);

export const bookingBenefits = pgTable("booking_benefits", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references((): AnyPgColumn => bookings.id, { onDelete: "restrict" }),
  runnerUserId: text("runner_user_id").notNull(),
  kind: bookingBenefitKindEnum("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  originalTotalUsd: integer("original_total_usd"),
  discountUsd: integer("discount_usd"),
  finalTotalUsd: integer("final_total_usd"),
  redemptionId: uuid("redemption_id").references(() => rewardRedemptions.id, { onDelete: "restrict" }),
  createdBy: text("created_by").notNull().references((): AnyPgColumn => profiles.userId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("booking_benefits_redemption_uq").on(t.redemptionId),
  uniqueIndex("booking_benefits_discount_booking_uq").on(t.bookingId).where(sql`${t.kind} = 'discount'`),
  index("booking_benefits_runner_idx").on(t.runnerUserId),
  check("booking_benefits_content_chk", sql`char_length(${t.title}) BETWEEN 2 AND 120 AND char_length(${t.description}) BETWEEN 10 AND 4000`),
  check("booking_benefits_price_chk", sql`(${t.kind} = 'contractual' AND ${t.originalTotalUsd} IS NULL AND ${t.discountUsd} IS NULL AND ${t.finalTotalUsd} IS NULL AND ${t.redemptionId} IS NULL) OR (${t.kind} = 'discount' AND ${t.originalTotalUsd} IS NOT NULL AND ${t.discountUsd} IS NOT NULL AND ${t.finalTotalUsd} IS NOT NULL AND ${t.originalTotalUsd} > 0 AND ${t.discountUsd} > 0 AND ${t.finalTotalUsd} > 0 AND ${t.originalTotalUsd} - ${t.discountUsd} = ${t.finalTotalUsd} AND ${t.redemptionId} IS NOT NULL)`),
]);
