import "server-only";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/lib/db";
import type { welcomeDiscountSchema } from "../schemas/rewards.schema";
import type { RewardOperationResult } from "../types/rewards.types";

export type WelcomeDiscountInput = z.output<typeof welcomeDiscountSchema>;
export type ActiveWelcomeDiscount = { id: string; amountUsd: number; validityDays: number };
export type WelcomeDiscountVersion = ActiveWelcomeDiscount & { active: boolean; createdAt: string };

const MAX_VERSIONS = 100;

async function safe<T>(read: () => Promise<T>): Promise<T> {
  // Driver errors may carry SQL parameters; callers only see a fixed message.
  try { return await read(); } catch { throw new Error("welcome discount: operation failed"); }
}

// The single active version, or null when the discount is off and no codes must be issued.
export function getActiveWelcomeDiscount(): Promise<ActiveWelcomeDiscount | null> {
  return safe(async () => {
    const result = await getDb().execute<ActiveWelcomeDiscount>(sql`
      SELECT id, amount_usd AS "amountUsd", validity_days AS "validityDays"
      FROM welcome_discount_versions WHERE active LIMIT 1
    `);
    return result.rows[0] ?? null;
  });
}

// Latest versions for the admin history. No creator or other personal data.
export function listWelcomeDiscountVersions(limit = 20): Promise<WelcomeDiscountVersion[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_VERSIONS);
  return safe(async () => {
    const result = await getDb().execute<{ result: WelcomeDiscountVersion[] }>(sql`
      SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb) AS result FROM (
        SELECT id, created_at, jsonb_build_object('id', id, 'amountUsd', amount_usd, 'validityDays', validity_days, 'active', active, 'createdAt', created_at) AS item
        FROM welcome_discount_versions ORDER BY created_at DESC, id DESC LIMIT ${bounded}
      ) x
    `);
    return result.rows[0].result;
  });
}

// Creates a new immutable version and deactivates the previous one atomically in SQL.
export function createWelcomeDiscountVersion(actorId: string, input: WelcomeDiscountInput): Promise<RewardOperationResult> {
  return safe(async () => {
    const result = await getDb().execute<{ result: RewardOperationResult }>(sql`
      SELECT cv_create_welcome_discount_version(${actorId}, ${input.amountUsd}::integer, ${input.validityDays}::integer, ${input.active}) AS result
    `);
    const value = result.rows[0]?.result;
    if (!value || !["success", "error"].includes(value.status)) throw new Error("invalid welcome discount response");
    return value;
  });
}
