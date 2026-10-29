import type { z } from "zod";
import type { bookingBenefitFormSchema, rewardCatalogFormSchema, rewardRuleFormSchema } from "../schemas/rewards.schema";

export type RewardRuleInput = z.output<typeof rewardRuleFormSchema>;
export type RewardCatalogInput = z.output<typeof rewardCatalogFormSchema>;
export type BookingBenefitInput = z.output<typeof bookingBenefitFormSchema>;
export type RewardOperationResult = { status: "success" | "error"; code: string; id?: string };
export type RewardActionState = { status: "idle" } | { status: "success"; message: string } | { status: "error"; code: string; message: string; fieldErrors?: Record<string, string[]> };
export type RewardRule = {
  id: string; version: number; pointsPerReferral: number; maxReferralsPerRunner: number | null;
  validFrom: string; validUntil: string | null; terms: string; active: boolean;
};
export type RewardCatalogItem = {
  id: string; catalogKey: string; version: number; title: string; description: string;
  kind: "discount" | "benefit"; costStars: number; discountUsd: number | null;
  validFrom: string; validUntil: string | null; stock: number | null; maxPerRunner: number;
  redemptionDays: number; active: boolean;
};
export type OwnRewardRedemption = {
  id: string; status: "available" | "applied" | "cancelled" | "expired";
  kind: "discount" | "benefit"; title: string; description: string; costStars: number;
  discountUsd: number | null; expiresAt: string; createdAt: string; appliedAt: string | null;
};
export type OwnLedgerEntry = { id: string; kind: string; delta: number; description: string; createdAt: string };
export type OwnBookingBenefit = { id: string; bookingId: string; tripTitle: string; bookingStatus: "pending" | "confirmed" | "cancelled"; kind: "contractual" | "discount"; title: string; description: string; discountUsd: number | null; createdAt: string };
export type OwnRewards = {
  balance: number; reviewRequired: boolean; activeRule: RewardRule | null; catalog: RewardCatalogItem[];
  redemptions: OwnRewardRedemption[]; ledger: OwnLedgerEntry[]; benefits: OwnBookingBenefit[];
};
export type OwnReferrals = { code: string | null; counts: { pending: number; credited: number; reversed: number }; attribution: { status: "pending" | "credited" | "reversed"; rule: RewardRule } | null };
export type ProgramConfiguration = { rules: RewardRule[]; catalog: RewardCatalogItem[] };
