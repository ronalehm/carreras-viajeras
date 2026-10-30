import "server-only";
import { randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type {
  BookingBenefitInput, OwnReferrals, OwnRewards, ProgramConfiguration,
  RewardCatalogInput, RewardOperationResult, RewardRuleInput, OwnBookingBenefit, OwnRewardRedemption,
} from "../types/rewards.types";

async function safe<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch { throw new Error("rewards: operation failed"); }
}
async function operation(statement: SQL): Promise<RewardOperationResult> {
  return safe(async () => {
    const result = await getDb().execute<{ result: RewardOperationResult }>(statement);
    const value = result.rows[0]?.result;
    if (!value || !["success", "error"].includes(value.status)) throw new Error("invalid reward response");
    return value;
  });
}

export function ensureReferralCode(userId: string): Promise<string> {
  return safe(async () => {
    const code = randomBytes(24).toString("base64url");
    // On conflict the existing opaque code is retained; no account id is encoded in it.
    const result = await getDb().execute<{ code: string; active: boolean }>(sql`
      INSERT INTO referral_codes(user_id,code) VALUES(${userId},${code})
      ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id RETURNING code,active
    `);
    if (result.rows[0].active === false) throw new Error("referral code unavailable");
    return result.rows[0].code;
  });
}

export async function reconcileReferralEligibility(referrerUserId: string): Promise<void> {
  await safe(async () => { await getDb().execute(sql`SELECT cv_reconcile_rewards(${referrerUserId})`); });
}
export async function reconcileReferredRunner(referredUserId: string): Promise<void> {
  await safe(async () => {
    await getDb().execute(sql`SELECT cv_reconcile_rewards(referrer_user_id) FROM runner_referrals WHERE referred_user_id=${referredUserId}`);
  });
}
// Use only after the booking/payment transaction has committed, to avoid a lock-order cycle.
// A simulated (demo checkout) booking reconciles nothing: it never earns or moves stars.
export async function reconcileBookingRewards(bookingId: string): Promise<void> {
  await safe(async () => {
    await getDb().execute(sql`
      SELECT cv_reconcile_rewards(r.referrer_user_id) FROM runner_referrals r JOIN bookings b ON b.runner_user_id=r.referred_user_id
      WHERE b.id=${bookingId}::uuid AND NOT b.is_simulated
    `);
  });
}

export function claimReferral(userId: string, code: string, termsAccepted: boolean, expectedRuleId: string): Promise<RewardOperationResult> {
  return operation(sql`SELECT cv_claim_referral(${userId},${code},${termsAccepted},${expectedRuleId}::uuid) AS result`);
}
export function requestRedemption(userId: string, catalogVersionId: string, requestKey: string): Promise<RewardOperationResult> {
  return operation(sql`SELECT cv_request_reward(${userId},${catalogVersionId}::uuid,${requestKey}::uuid) AS result`);
}
export function cancelOwnRedemption(userId: string, redemptionId: string): Promise<RewardOperationResult> {
  return operation(sql`SELECT cv_cancel_reward(${userId},${redemptionId}::uuid) AS result`);
}
// A simulated (demo checkout) booking never takes a redemption or a benefit: the call answers
// booking_not_eligible without running the function. is_simulated is set when the booking is
// inserted and never updated, so checking it in the same statement leaves no window between check
// and call; no extra booking lock is taken, which keeps the function's own lock order (reward
// account first, then booking) and avoids a cycle with cv_reconcile_rewards.
function onRealBooking(bookingId: string, call: SQL): Promise<RewardOperationResult> {
  return operation(sql`
    SELECT CASE WHEN EXISTS (SELECT 1 FROM bookings WHERE id=${bookingId}::uuid AND is_simulated)
      THEN '{"status":"error","code":"booking_not_eligible"}'::jsonb
      ELSE ${call} END AS result
  `);
}
export function applyRewardToBooking(actorId: string, redemptionId: string, bookingId: string): Promise<RewardOperationResult> {
  return onRealBooking(bookingId, sql`cv_apply_booking_reward(${actorId},${redemptionId}::uuid,${bookingId}::uuid)`);
}
export function fulfillReward(actorId: string, redemptionId: string): Promise<RewardOperationResult> {
  return operation(sql`SELECT cv_fulfill_reward(${actorId},${redemptionId}::uuid) AS result`);
}
export function assignBookingBenefit(actorId: string, input: BookingBenefitInput): Promise<RewardOperationResult> {
  return onRealBooking(input.bookingId, sql`cv_assign_booking_benefit(${actorId},${input.bookingId}::uuid,${input.title},${input.description})`);
}

export function createRewardRule(actorId: string, input: RewardRuleInput): Promise<RewardOperationResult> {
  return operation(sql`SELECT cv_create_reward_rule(${actorId},${input.pointsPerReferral}::integer,${input.maxReferralsPerRunner}::integer,${input.validFrom}::date,${input.validUntil}::date,${input.terms},${input.active}) AS result`);
}
export function createCatalogVersion(actorId: string, input: RewardCatalogInput): Promise<RewardOperationResult> {
  return operation(sql`SELECT cv_create_reward_catalog(${actorId},${input.catalogKey}::uuid,${input.kind}::reward_kind,${input.title},${input.description},${input.costStars}::integer,${input.discountUsd}::integer,${input.stock}::integer,${input.maxPerRunner}::integer,${input.redemptionDays}::integer,${input.validFrom}::date,${input.validUntil}::date,${input.active}) AS result`);
}
export function deactivateRewardRule(actorId: string, id: string): Promise<RewardOperationResult> {
  return safe(async () => {
    const rows = await getDb().execute<{ id: string }>(sql`UPDATE reward_rule_versions SET active=false,deactivated_at=now(),deactivated_by=${actorId} WHERE id=${id}::uuid AND active RETURNING id`);
    return { status: "success", code: rows.rows.length ? "deactivated" : "unchanged", id };
  });
}
export function deactivateCatalogVersion(actorId: string, id: string): Promise<RewardOperationResult> {
  return safe(async () => {
    const rows = await getDb().execute<{ id: string }>(sql`UPDATE reward_catalog_versions SET active=false,deactivated_at=now(),deactivated_by=${actorId} WHERE id=${id}::uuid AND active RETURNING id`);
    return { status: "success", code: rows.rows.length ? "deactivated" : "unchanged", id };
  });
}

const RULE_JSON = sql`jsonb_build_object('id',id,'version',version,'pointsPerReferral',points_per_referral,'maxReferralsPerRunner',max_referrals_per_runner,'validFrom',valid_from,'validUntil',valid_until,'terms',terms,'active',active)`;
const CATALOG_JSON = sql`jsonb_build_object('id',id,'catalogKey',catalog_key,'version',version,'title',title,'description',description,'kind',kind,'costStars',cost_stars,'discountUsd',discount_usd,'validFrom',valid_from,'validUntil',valid_until,'stock',stock,'maxPerRunner',max_per_runner,'redemptionDays',redemption_days,'active',active)`;
const REDEMPTION_JSON = sql`jsonb_build_object('id',id,'status',status,'kind',kind,'title',title,'description',description,'costStars',cost_stars,'discountUsd',discount_usd,'expiresAt',expires_at,'createdAt',created_at,'appliedAt',applied_at)`;

export function listProgramConfiguration(): Promise<ProgramConfiguration> {
  return safe(async () => {
    const result = await getDb().execute<{ result: ProgramConfiguration }>(sql`
      SELECT jsonb_build_object(
        'rules',(SELECT coalesce(jsonb_agg(x.item ORDER BY x.version DESC),'[]'::jsonb) FROM (SELECT version,${RULE_JSON} AS item FROM reward_rule_versions ORDER BY version DESC LIMIT 100) x),
        'catalog',(SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]'::jsonb) FROM (SELECT created_at,${CATALOG_JSON} AS item FROM reward_catalog_versions ORDER BY created_at DESC LIMIT 100) x)
      ) AS result
    `);
    return result.rows[0].result;
  });
}

export async function getOwnReferrals(userId: string): Promise<OwnReferrals> {
  await reconcileReferralEligibility(userId);
  await reconcileReferredRunner(userId);
  return safe(async () => {
    const result = await getDb().execute<{ result: OwnReferrals }>(sql`
      SELECT jsonb_build_object(
        'code',(SELECT code FROM referral_codes WHERE user_id=${userId} AND active),
        'counts',jsonb_build_object(
          'pending',(SELECT count(*) FROM runner_referrals WHERE referrer_user_id=${userId} AND eligibility_version=0),
          'credited',(SELECT count(*) FROM runner_referrals WHERE referrer_user_id=${userId} AND net_points>0),
          'reversed',(SELECT count(*) FROM runner_referrals WHERE referrer_user_id=${userId} AND net_points=0 AND eligibility_version>0)),
        'attribution',(SELECT jsonb_build_object('status',CASE WHEN rr.net_points>0 THEN 'credited' WHEN rr.eligibility_version>0 THEN 'reversed' ELSE 'pending' END,'rule',${RULE_JSON}) FROM runner_referrals rr JOIN reward_rule_versions rv ON rv.id=rr.rule_version_id WHERE rr.referred_user_id=${userId})
      ) AS result
    `);
    return result.rows[0].result;
  });
}

export async function getOwnRewards(userId: string): Promise<OwnRewards> {
  await reconcileReferralEligibility(userId);
  return safe(async () => {
    const result = await getDb().execute<{ result: OwnRewards }>(sql`
      SELECT jsonb_build_object(
        'balance',coalesce((SELECT balance FROM reward_accounts WHERE user_id=${userId}),0),
        'reviewRequired',coalesce((SELECT balance<0 FROM reward_accounts WHERE user_id=${userId}),false),
        'activeRule',(SELECT ${RULE_JSON} FROM reward_rule_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date)
          AND EXISTS(SELECT 1 FROM reward_catalog_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date)) LIMIT 1),
        'catalog',(SELECT coalesce(jsonb_agg(x.item ORDER BY x.title),'[]'::jsonb) FROM (SELECT title,${CATALOG_JSON} AS item FROM reward_catalog_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date)
          AND EXISTS(SELECT 1 FROM reward_rule_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date)) ORDER BY title,id LIMIT 100) x),
        'redemptions',(SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]'::jsonb) FROM (SELECT created_at,${REDEMPTION_JSON} AS item FROM reward_redemptions WHERE user_id=${userId} ORDER BY created_at DESC,id LIMIT 100) x),
        'ledger',(SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]'::jsonb) FROM (SELECT created_at,jsonb_build_object('id',id,'kind',kind,'delta',delta,'description',description,'createdAt',created_at) AS item FROM reward_ledger WHERE user_id=${userId} ORDER BY created_at DESC,id LIMIT 100) x),
        'benefits',(SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
          SELECT bb.created_at,jsonb_build_object('id',bb.id,'bookingId',bb.booking_id,'tripTitle',t.title,'bookingStatus',b.status,'kind',bb.kind,'title',bb.title,'description',bb.description,'discountUsd',bb.discount_usd,'createdAt',bb.created_at) AS item
          FROM booking_benefits bb JOIN bookings b ON b.id=bb.booking_id AND b.runner_user_id=${userId} JOIN trips t ON t.id=b.trip_id
          WHERE bb.runner_user_id=${userId} ORDER BY bb.created_at DESC,bb.id LIMIT 100) x)
      ) AS result
    `);
    return result.rows[0].result;
  });
}

export async function getBookingRewardOptions(bookingId: string): Promise<{ linked: boolean; redemptions: OwnRewardRedemption[]; benefits: OwnBookingBenefit[] }> {
  return safe(async () => {
    const owner = await getDb().execute<{ runner_user_id: string | null }>(sql`SELECT runner_user_id FROM bookings WHERE id=${bookingId}::uuid`);
    const userId = owner.rows[0]?.runner_user_id;
    if (!userId) return { linked: false, redemptions: [], benefits: [] };
    const wallet = await getOwnRewards(userId);
    return { linked: true, redemptions: wallet.reviewRequired ? [] : wallet.redemptions.filter((r) => r.status === "available"), benefits: wallet.benefits.filter((b) => b.bookingId === bookingId) };
  });
}
