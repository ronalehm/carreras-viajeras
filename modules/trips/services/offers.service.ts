import "server-only";
import { and, asc, desc, eq, exists, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { z } from "zod";
import { CRM_TIME_ZONE } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { campaigns, exchangeRates, profiles, tripOffers, trips } from "@/lib/db-schema";
import { offerIdSchema } from "../schemas/offers.schema";
import { tripSlugSchema } from "../schemas/trips.schema";
import { canonicalUsdPen } from "./exchangeRates.service";
import type {
  ActiveOffer,
  CreateOfferInput,
  OfferDetail,
  OfferInput,
  OfferListItem,
  PublicOffer,
  PublicOfferRead,
} from "../types/offers.types";

type Db = ReturnType<typeof getDb>;
// The columns the scope and validity helpers read, from trip_offers or one of its aliases.
type OfferTable = Record<"tripId" | "campaignId" | "status" | "validFrom" | "validUntil", AnyPgColumn>;

// Today's calendar date in the CRM time zone, evaluated by the database (Decision 6). A constant
// literal (never user input), as in leadReport.service.ts.
const today = sql.raw(`(now() AT TIME ZONE '${CRM_TIME_ZONE}')::date`);

// Same rule as campaigns_code_chk (the ?c= code). Anything else is treated as "no campaign".
const CAMPAIGN_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Trip and campaign ids of getActiveOffer (the bookings specs pass them from the database).
const uuidSchema = z.uuid();

const creator = alias(profiles, "creator");
const approver = alias(profiles, "approver");
const activator = alias(profiles, "activator");
const closer = alias(profiles, "closer");
const successor = alias(tripOffers, "successor");
const scope = alias(tripOffers, "scope");
const candidate = alias(tripOffers, "candidate");

// final_price_usd is a generated column (nullable for drizzle): it is never null in a stored row.
const finalPriceUsd = sql<number>`${tripOffers.finalPriceUsd}`.mapWith(tripOffers.finalPriceUsd);

const listColumns = {
  id: tripOffers.id,
  version: tripOffers.version,
  status: tripOffers.status,
  name: tripOffers.name,
  trip: { id: trips.id, slug: trips.slug, title: trips.title },
  campaign: { id: campaigns.id, code: campaigns.code, name: campaigns.name, status: campaigns.status },
  finalPriceUsd,
  validFrom: tripOffers.validFrom,
  validUntil: tripOffers.validUntil,
  approvedAt: tripOffers.approvedAt,
  activatedAt: tripOffers.activatedAt,
  closedAt: tripOffers.closedAt,
} satisfies Record<keyof OfferListItem, unknown>;

// The conditions of a version (Requirement 1). Status, version, scope and audit never come from
// the input.
const conditionColumns = (input: OfferInput) => ({
  name: input.name,
  totalPriceUsd: input.totalPriceUsd,
  discountUsd: input.discountUsd,
  depositOptionsUsd: input.depositOptionsUsd,
  balanceDueOn: input.balanceDueOn,
  bonusDescription: input.bonusDescription,
  validFrom: input.validFrom,
  validUntil: input.validUntil,
  capacityLimit: input.capacityLimit,
  termsVersion: input.termsVersion,
  conditions: input.conditions,
});

// Columns of the in-force offer for the bookings specs. approved_at and activated_at are never
// null for an active version (trip_offers_approved_chk, trip_offers_activated_chk).
const activeColumns = {
  offerVersionId: tripOffers.id,
  tripId: tripOffers.tripId,
  campaignId: tripOffers.campaignId,
  version: tripOffers.version,
  totalPriceUsd: tripOffers.totalPriceUsd,
  discountUsd: tripOffers.discountUsd,
  finalPriceUsd,
  depositOptionsUsd: tripOffers.depositOptionsUsd,
  balanceDueOn: tripOffers.balanceDueOn,
  bonusDescription: tripOffers.bonusDescription,
  validFrom: tripOffers.validFrom,
  validUntil: tripOffers.validUntil,
  capacityLimit: tripOffers.capacityLimit,
  termsVersion: tripOffers.termsVersion,
  conditions: tripOffers.conditions,
  approvedAt: sql<Date>`${tripOffers.approvedAt}`.mapWith(tripOffers.approvedAt),
  activatedAt: sql<Date>`${tripOffers.activatedAt}`.mapWith(tripOffers.activatedAt),
} satisfies Record<keyof ActiveOffer, unknown>;

// Public read: no ids, internal name, campaign, seats or audit (Requirement 11).
const publicColumns = {
  totalPriceUsd: tripOffers.totalPriceUsd,
  discountUsd: tripOffers.discountUsd,
  finalPriceUsd,
  depositOptionsUsd: tripOffers.depositOptionsUsd,
  balanceDueOn: tripOffers.balanceDueOn,
  bonusDescription: tripOffers.bonusDescription,
  validFrom: tripOffers.validFrom,
  validUntil: tripOffers.validUntil,
  termsVersion: tripOffers.termsVersion,
  conditions: tripOffers.conditions,
} satisfies Record<keyof PublicOffer, unknown>;

const sameScope = (offer: OfferTable, other: OfferTable) =>
  and(eq(offer.tripId, other.tripId), sql`${offer.campaignId} IS NOT DISTINCT FROM ${other.campaignId}`);

const notExpired = (offer: OfferTable) => or(isNull(offer.validUntil), gte(offer.validUntil, today));

// Requirement 4, the offer's own part: active and within its Lima calendar dates (inclusive).
const inForce = and(eq(tripOffers.status, "active"), lte(tripOffers.validFrom, today), notExpired(tripOffers));

// Requirement 4, the scope part: the general offer or, when a campaign is given (by id or by
// code), that campaign's offer if the campaign is active. The campaigns LEFT JOIN already requires
// the campaign to be of the offer's trip. The campaign offer sorts first (resolutionOrder).
function scopeCondition(campaignMatch: SQL | undefined) {
  if (!campaignMatch) return isNull(tripOffers.campaignId);
  return or(isNull(tripOffers.campaignId), and(campaignMatch, eq(campaigns.status, "active")));
}
const resolutionOrder = sql`${tripOffers.campaignId} IS NULL`;

// An approved version that can be activated now (Requirement 2): its validity has started and not
// ended, its trip is not archived and, for a campaign offer, the campaign is active. Shared by the
// two statements of activateOffer (Decision 4).
function activatable(db: Db, offer: OfferTable) {
  return and(
    eq(offer.status, "approved"),
    lte(offer.validFrom, today),
    notExpired(offer),
    exists(
      db
        .select({ one: sql`1` })
        .from(trips)
        .where(and(eq(trips.id, offer.tripId), ne(trips.status, "archived"))),
    ),
    or(
      isNull(offer.campaignId),
      exists(
        db
          .select({ one: sql`1` })
          .from(campaigns)
          .where(and(eq(campaigns.id, offer.campaignId), eq(campaigns.status, "active"))),
      ),
    ),
  );
}

// CRM list, one query: by race date and trip, the general offer before the campaigns (by code),
// newest version first.
export async function listOffers(): Promise<OfferListItem[]> {
  return getDb()
    .select(listColumns)
    .from(tripOffers)
    .innerJoin(trips, eq(trips.id, tripOffers.tripId))
    .leftJoin(campaigns, eq(campaigns.id, tripOffers.campaignId))
    .orderBy(
      asc(trips.raceDate),
      asc(trips.slug),
      sql`${campaigns.code} asc nulls first`,
      desc(tripOffers.version),
    );
}

// One batch (one round-trip): the version with its authors and successor, and every version of its
// scope (newest first). A non-UUID id never reaches the database.
export async function getOfferById(id: string): Promise<OfferDetail | null> {
  if (!offerIdSchema.safeParse(id).success) return null;
  const db = getDb();
  const [details, history] = await db.batch([
    db
      .select({
        ...listColumns,
        totalPriceUsd: tripOffers.totalPriceUsd,
        discountUsd: tripOffers.discountUsd,
        depositOptionsUsd: tripOffers.depositOptionsUsd,
        balanceDueOn: tripOffers.balanceDueOn,
        bonusDescription: tripOffers.bonusDescription,
        capacityLimit: tripOffers.capacityLimit,
        termsVersion: tripOffers.termsVersion,
        conditions: tripOffers.conditions,
        createdAt: tripOffers.createdAt,
        createdBy: { email: creator.email },
        approvedBy: { email: approver.email },
        activatedBy: { email: activator.email },
        closedBy: { email: closer.email },
        supersededByVersion: successor.version,
      })
      .from(tripOffers)
      .innerJoin(trips, eq(trips.id, tripOffers.tripId))
      .leftJoin(campaigns, eq(campaigns.id, tripOffers.campaignId))
      .innerJoin(creator, eq(creator.userId, tripOffers.createdBy))
      .leftJoin(approver, eq(approver.userId, tripOffers.approvedBy))
      .leftJoin(activator, eq(activator.userId, tripOffers.activatedBy))
      .leftJoin(closer, eq(closer.userId, tripOffers.closedBy))
      .leftJoin(successor, eq(successor.id, tripOffers.supersededBy))
      .where(eq(tripOffers.id, id))
      .limit(1),
    db
      .select(listColumns)
      .from(tripOffers)
      .innerJoin(scope, sameScope(scope, tripOffers))
      .innerJoin(trips, eq(trips.id, tripOffers.tripId))
      .leftJoin(campaigns, eq(campaigns.id, tripOffers.campaignId))
      .where(eq(scope.id, id))
      .orderBy(desc(tripOffers.version)),
  ]);
  const [detail] = details;
  return detail ? { ...detail, history } : null;
}

type CreatedRow = { id: string | null; trip_ok: boolean; campaign_ok: boolean };

// One statement: a draft (status takes the column default) authored by the actor, with version =
// latest of its scope + 1, inserted only if the trip is not archived and the campaign (if any) is
// an active campaign of that trip. ON CONFLICT DO NOTHING: a pending version of the scope (or a
// concurrent insert that took the same version number) makes it a no-op → "pending_exists".
export async function createOfferDraft(
  input: CreateOfferInput,
  actorUserId: string,
): Promise<{ id: string } | "invalid_trip" | "invalid_campaign" | "pending_exists"> {
  const result = await getDb().execute<CreatedRow>(sql`
    WITH trip AS (
      SELECT id FROM trips WHERE id = ${input.tripId}::uuid AND status <> 'archived'
    ),
    campaign AS (
      SELECT ${input.campaignId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM campaigns
        WHERE id = ${input.campaignId}::uuid AND trip_id = ${input.tripId}::uuid AND status = 'active'
      ) AS ok
    ),
    inserted AS (
      INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, discount_usd,
        deposit_options_usd, balance_due_on, bonus_description, valid_from, valid_until, capacity_limit,
        terms_version, conditions, created_by)
      SELECT trip.id, ${input.campaignId}::uuid,
        coalesce((
          SELECT max(version) FROM trip_offers
          WHERE trip_id = trip.id AND campaign_id IS NOT DISTINCT FROM ${input.campaignId}::uuid
        ), 0) + 1,
        ${input.name}, ${input.totalPriceUsd}::integer, ${input.discountUsd}::integer,
        ${sql.param(input.depositOptionsUsd, tripOffers.depositOptionsUsd)}::integer[],
        ${input.balanceDueOn}::date, ${input.bonusDescription}, ${input.validFrom}::date,
        ${input.validUntil}::date, ${input.capacityLimit}::integer, ${input.termsVersion},
        ${input.conditions}, ${actorUserId}
      FROM trip, campaign
      WHERE campaign.ok
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM trip) AS trip_ok,
      (SELECT ok FROM campaign) AS campaign_ok
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  if (!row?.trip_ok) return "invalid_trip";
  return row.campaign_ok ? "pending_exists" : "invalid_campaign";
}

type VersionRow = { id: string | null; source_ok: boolean };

// One statement, same pattern: copies only the conditions of an approved, active or closed version
// into a new draft of the same scope (version = latest + 1), authored by the actor. Never copies
// status or audit; the source does not change.
export async function createOfferVersionFrom(
  sourceId: string,
  actorUserId: string,
): Promise<{ id: string } | "not_found" | "pending_exists"> {
  const result = await getDb().execute<VersionRow>(sql`
    WITH source AS (
      SELECT * FROM trip_offers WHERE id = ${sourceId}::uuid AND status <> 'draft'
    ),
    inserted AS (
      INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, discount_usd,
        deposit_options_usd, balance_due_on, bonus_description, valid_from, valid_until, capacity_limit,
        terms_version, conditions, created_by)
      SELECT source.trip_id, source.campaign_id,
        (
          SELECT max(version) FROM trip_offers
          WHERE trip_id = source.trip_id AND campaign_id IS NOT DISTINCT FROM source.campaign_id
        ) + 1,
        source.name, source.total_price_usd, source.discount_usd, source.deposit_options_usd,
        source.balance_due_on, source.bonus_description, source.valid_from, source.valid_until,
        source.capacity_limit, source.terms_version, source.conditions, ${actorUserId}
      FROM source
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM source) AS source_ok
  `);
  const [row] = result.rows;
  if (row?.id) return { id: row.id };
  return row?.source_ok ? "pending_exists" : "not_found";
}

// One batch: only a draft is edited (Decision 5); the SELECT explains an empty update.
export async function updateOfferDraft(
  id: string,
  input: OfferInput,
): Promise<"updated" | "not_found" | "not_draft"> {
  const db = getDb();
  const [updated, current] = await db.batch([
    db
      .update(tripOffers)
      .set({ ...conditionColumns(input), updatedAt: sql`now()` })
      .where(and(eq(tripOffers.id, id), eq(tripOffers.status, "draft")))
      .returning({ id: tripOffers.id }),
    db.select({ status: tripOffers.status }).from(tripOffers).where(eq(tripOffers.id, id)),
  ]);
  if (updated.length > 0) return "updated";
  return current.length > 0 ? "not_draft" : "not_found";
}

// One batch: draft → approved with the actor, only while valid_until has not passed. From here on
// the version is immutable. The SELECT explains an empty update.
export async function approveOffer(
  id: string,
  actorUserId: string,
): Promise<"approved" | "invalid_transition" | "expired"> {
  const db = getDb();
  const [approved, current] = await db.batch([
    db
      .update(tripOffers)
      .set({ status: "approved", approvedAt: sql`now()`, approvedBy: actorUserId })
      .where(and(eq(tripOffers.id, id), eq(tripOffers.status, "draft"), notExpired(tripOffers)))
      .returning({ id: tripOffers.id }),
    db
      .select({ status: tripOffers.status, expired: sql<boolean | null>`${tripOffers.validUntil} < ${today}` })
      .from(tripOffers)
      .where(eq(tripOffers.id, id)),
  ]);
  if (approved.length > 0) return "approved";
  const [offer] = current;
  return offer?.status === "draft" && offer.expired ? "expired" : "invalid_transition";
}

// One batch, one transaction (Decision 4), in this order: (1) close the active version of the same
// scope, superseded by this one, only if (2) is going to proceed (same activatable conditions in an
// EXISTS); (2) approved → active with the actor; (3) explain an empty activation. If a concurrent
// activation of the scope commits first, the partial unique index fails the whole batch, which is
// rolled back and propagates (the action answers with its generic error).
export async function activateOffer(
  id: string,
  actorUserId: string,
): Promise<"activated" | "invalid_transition" | "not_started" | "expired" | "trip_archived" | "campaign_closed"> {
  const db = getDb();
  const [, activated, current] = await db.batch([
    db
      .update(tripOffers)
      .set({ status: "closed", closedAt: sql`now()`, closedBy: actorUserId, supersededBy: id })
      .where(
        and(
          eq(tripOffers.status, "active"),
          ne(tripOffers.id, id),
          exists(
            db
              .select({ one: sql`1` })
              .from(candidate)
              .where(and(eq(candidate.id, id), sameScope(candidate, tripOffers), activatable(db, candidate))),
          ),
        ),
      ),
    db
      .update(tripOffers)
      .set({ status: "active", activatedAt: sql`now()`, activatedBy: actorUserId })
      .where(and(eq(tripOffers.id, id), activatable(db, tripOffers)))
      .returning({ id: tripOffers.id }),
    db
      .select({
        status: tripOffers.status,
        notStarted: sql<boolean>`${tripOffers.validFrom} > ${today}`,
        expired: sql<boolean | null>`${tripOffers.validUntil} < ${today}`,
        tripArchived: sql<boolean>`${trips.status} = 'archived'`,
        campaignClosed: sql<boolean | null>`${campaigns.status} = 'closed'`,
      })
      .from(tripOffers)
      .innerJoin(trips, eq(trips.id, tripOffers.tripId))
      .leftJoin(campaigns, eq(campaigns.id, tripOffers.campaignId))
      .where(eq(tripOffers.id, id)),
  ]);
  if (activated.length > 0) return "activated";
  const [offer] = current;
  if (offer?.status !== "approved") return "invalid_transition";
  if (offer.tripArchived) return "trip_archived";
  if (offer.campaignClosed) return "campaign_closed";
  if (offer.expired) return "expired";
  if (offer.notStarted) return "not_started";
  return "invalid_transition";
}

// One statement: draft, approved or active → closed with the actor. closed is final.
export async function closeOffer(id: string, actorUserId: string): Promise<"closed" | "invalid_transition"> {
  const rows = await getDb()
    .update(tripOffers)
    .set({ status: "closed", closedAt: sql`now()`, closedBy: actorUserId })
    .where(and(eq(tripOffers.id, id), inArray(tripOffers.status, ["draft", "approved", "active"])))
    .returning({ id: tripOffers.id });
  return rows.length > 0 ? "closed" : "invalid_transition";
}

// The offer in force for a trip (Requirement 4), for the bookings specs. One query: the campaign's
// offer if it is in force, else the general one, else null. A non-UUID trip id is null without a
// query; a non-UUID campaign id is treated as no campaign.
export async function getActiveOffer(tripId: string, campaignId?: string | null): Promise<ActiveOffer | null> {
  if (!uuidSchema.safeParse(tripId).success) return null;
  const campaign = uuidSchema.safeParse(campaignId);
  const [offer] = await getDb()
    .select(activeColumns)
    .from(tripOffers)
    .innerJoin(trips, eq(trips.id, tripOffers.tripId))
    .leftJoin(campaigns, and(eq(campaigns.id, tripOffers.campaignId), eq(campaigns.tripId, tripOffers.tripId)))
    .where(
      and(
        eq(tripOffers.tripId, tripId),
        eq(trips.status, "published"),
        inForce,
        scopeCondition(campaign.success ? eq(campaigns.id, campaign.data) : undefined),
      ),
    )
    .orderBy(resolutionOrder)
    .limit(1);
  return offer ?? null;
}

// Public read for the landing, per request (connection()). Only the canonical slug is a public
// URL (like getPublishedTripBySlug), else null without a query. The ?c= code is trimmed and
// lowercased; an invalid one is treated as no campaign. One query: the in-force offer of the
// published trip (campaign first) and the latest exchange rate (created_at DESC, id DESC), or null.
export async function getPublicOffer(slug: string, campaignCode: string | null): Promise<PublicOfferRead | null> {
  await connection();
  const parsed = tripSlugSchema.safeParse(slug);
  if (!parsed.success || parsed.data !== slug) return null;
  const code = campaignCode?.trim().toLowerCase() ?? "";
  const validCode = code.length >= 3 && code.length <= 32 && CAMPAIGN_CODE_PATTERN.test(code);

  const db = getDb();
  const latestRate = db
    .select({ usdPen: exchangeRates.usdPen, createdAt: exchangeRates.createdAt })
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.createdAt), desc(exchangeRates.id))
    .limit(1)
    .as("latest_rate");
  const [row] = await db
    .select({ offer: publicColumns, rateUsdPen: latestRate.usdPen, rateEffectiveFrom: latestRate.createdAt })
    .from(tripOffers)
    .innerJoin(trips, eq(trips.id, tripOffers.tripId))
    .leftJoin(campaigns, and(eq(campaigns.id, tripOffers.campaignId), eq(campaigns.tripId, tripOffers.tripId)))
    .leftJoinLateral(latestRate, sql`true`)
    .where(
      and(
        eq(trips.slug, slug),
        eq(trips.status, "published"),
        inForce,
        scopeCondition(validCode ? eq(campaigns.code, code) : undefined),
      ),
    )
    .orderBy(resolutionOrder)
    .limit(1);
  if (!row) return null;
  const exchangeRate =
    row.rateUsdPen !== null && row.rateEffectiveFrom !== null
      ? { usdPen: canonicalUsdPen(row.rateUsdPen), effectiveFrom: row.rateEffectiveFrom }
      : null;
  return { offer: row.offer, exchangeRate };
}
