// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import {
  applyRewardToBooking, assignBookingBenefit, cancelOwnRedemption, claimReferral,
  createCatalogVersion, createRewardRule, ensureReferralCode, fulfillReward,
  getBookingRewardOptions, getOwnReferrals, getOwnRewards, listProgramConfiguration,
  reconcileBookingRewards, reconcileReferralEligibility, reconcileReferredRunner, requestRedemption,
} from "./rewards.service";

const execute = vi.fn();
const dialect = new PgDialect();
const query = () => dialect.sqlToQuery(execute.mock.calls.at(-1)![0] as SQL);
const USER = "user_referrer";
const ID = "67bf1f50-bc28-48db-b0ce-5a61d89d7721";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockReturnValue({ execute } as unknown as ReturnType<typeof getDb>);
  execute.mockResolvedValue({ rows: [{ result: { status: "success", code: "ok", id: ID } }] });
});

describe("transactional reward commands", () => {
  it("binds owner, prize and retry key to the atomic redemption function", async () => {
    await requestRedemption(USER, ID, ID);
    expect(query().sql).toContain("cv_request_reward(");
    expect(query().params).toEqual([USER, ID, ID]);
    expect(query().sql).not.toContain(USER);
    expect(execute).toHaveBeenCalledOnce();
  });
  it("passes consent and code as parameters, never interpolated SQL", async () => {
    const code = "' OR 1=1 --";
    await claimReferral(USER, code, true, ID);
    expect(query().params).toEqual([USER, code, true, ID]);
    expect(query().sql).not.toContain(code);
  });
  it("applies through one transaction with the server actor and booking", async () => {
    await applyRewardToBooking("admin", ID, ID);
    expect(query().sql).toContain("cv_apply_booking_reward");
    expect(query().params).toEqual(["admin", ID, ID]);
  });
  it("cancels only by the owning user and fulfills non-monetary rewards by actor", async () => {
    await cancelOwnRedemption(USER, ID);
    expect(query().params).toEqual([USER, ID]);
    expect(query().sql).toContain("cv_cancel_reward");
    await fulfillReward("admin", ID);
    expect(query().sql).toContain("cv_fulfill_reward");
  });
  it("returns failures from the DB function without treating them as successful", async () => {
    execute.mockResolvedValue({ rows: [{ result: { status: "error", code: "insufficient_stars" } }] });
    await expect(requestRedemption(USER, ID, ID)).resolves.toEqual({ status: "error", code: "insufficient_stars" });
  });
  it("does not expose SQL parameters, cause or driver messages on failure", async () => {
    execute.mockRejectedValue(new Error("postgres://password email=private@example.com"));
    const error = await requestRedemption(USER, ID, ID).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("rewards: operation failed");
    expect(error).not.toHaveProperty("cause");
  });
  it("records contractual benefits using only the explicit booking and evidence", async () => {
    await assignBookingBenefit("admin", { bookingId: ID, title: "Hotel", description: "Tres noches incluidas." });
    expect(query().sql).toContain("cv_assign_booking_benefit");
    expect(query().params).toEqual(["admin", ID, "Hotel", "Tres noches incluidas."]);
  });
});

describe("configuration snapshots", () => {
  it("uses immutable rule versions with admin values and server actor", async () => {
    await createRewardRule("admin", { pointsPerReferral: 25, maxReferralsPerRunner: null, validFrom: "2026-10-29", validUntil: null, terms: "Condiciones publicadas.", active: false });
    expect(query().sql).toContain("cv_create_reward_rule");
    expect(query().params).toEqual(["admin", 25, null, "2026-10-29", null, "Condiciones publicadas.", false]);
  });
  it("keeps cost, discount and inventory in a new catalog version", async () => {
    await createCatalogVersion("admin", { catalogKey: null, kind: "discount", title: "Premio", description: "Condiciones publicadas.", costStars: 100, discountUsd: 20, stock: 10, maxPerRunner: 1, redemptionDays: 30, validFrom: "2026-10-29", validUntil: null, active: true });
    expect(query().sql).toContain("cv_create_reward_catalog");
    expect(query().params).toContain(100);
    expect(query().params).toContain(20);
  });
  it("reads only DTO columns and bounds configuration history", async () => {
    execute.mockResolvedValue({ rows: [{ result: { rules: [], catalog: [] } }] });
    await expect(listProgramConfiguration()).resolves.toEqual({ rules: [], catalog: [] });
    expect(query().sql).toContain("LIMIT 100");
    expect(query().sql).not.toMatch(/created_by|deactivated_by/);
  });
});

describe("private views and reconciliation", () => {
  it("generates random opaque referral codes while retaining an existing user's code", async () => {
    execute.mockResolvedValue({ rows: [{ code: "A".repeat(32) }] });
    await ensureReferralCode(USER);
    const generated = query().params[1];
    expect(generated).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generated).not.toContain(USER);
    expect(query().sql).toContain("ON CONFLICT(user_id)");
  });
  it("refreshes referral evidence before returning own points, never replacing errors with zero", async () => {
    const wallet = { balance: 10, reviewRequired: false, activeRule: null, catalog: [], redemptions: [], ledger: [], benefits: [] };
    execute.mockResolvedValue({ rows: [{ result: wallet }] });
    await expect(getOwnRewards(USER)).resolves.toEqual(wallet);
    const first = dialect.sqlToQuery(execute.mock.calls[0][0] as SQL);
    expect(first.sql).toContain("cv_reconcile_rewards");
    expect(first.params).toEqual([USER]);
    expect(query().params.every((value) => value === USER)).toBe(true);
    expect(query().sql).not.toMatch(/participant_email|medical_notes|internal_note|recorded_by/);
  });
  it("referral summaries contain counts and states without contacts or referee identity", async () => {
    await getOwnReferrals(USER);
    expect(query().sql).toContain("'counts'");
    expect(query().sql).not.toMatch(/email|participant_name|amount_usd/);
    expect(query().params.every((value) => value === USER)).toBe(true);
  });
  it("resolves a referred runner and booking server-side for after-commit hooks", async () => {
    await reconcileReferredRunner(USER);
    expect(query().params).toEqual([USER]);
    await reconcileBookingRewards(ID);
    expect(query().sql).toContain("JOIN bookings");
    expect(query().params).toEqual([ID]);
    await reconcileReferralEligibility(USER);
    expect(query().params).toEqual([USER]);
  });
  it("does not show prizes from an unlinked booking", async () => {
    execute.mockResolvedValue({ rows: [{ runner_user_id: null }] });
    await expect(getBookingRewardOptions(ID)).resolves.toEqual({ linked: false, redemptions: [], benefits: [] });
    expect(execute).toHaveBeenCalledOnce();
  });
});
