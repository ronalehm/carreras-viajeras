import "server-only";
import { desc, eq } from "drizzle-orm";
import { formatUsdPenRate, parseUsdPenRate } from "@/lib/currency";
import { getDb } from "@/lib/db";
import { exchangeRates, profiles } from "@/lib/db-schema";
import type { ExchangeRate, ExchangeRateListItem } from "../types/offers.types";

const HISTORY_LIMIT = 20;

// Newest first; id breaks ties between rows saved in the same instant.
const newestFirst = [desc(exchangeRates.createdAt), desc(exchangeRates.id)];

// Neon returns numeric(10,4) as text ("3.7500"). It is re-read through the exact integer parser
// (ten-thousandths, no floating point) so every caller gets the same canonical "3.7500" form.
// exchange_rates_usd_pen_chk keeps it in range; anything else is a broken row and fails loudly.
export function canonicalUsdPen(value: string): string {
  const rateE4 = parseUsdPenRate(value);
  if (rateE4 === null) throw new Error("invalid exchange rate row");
  return formatUsdPenRate(rateE4);
}

// The rate in force is the latest row saved: it applies from the moment it was stored. null when the
// team has not set any rate yet (the web then shows USD only).
export async function getCurrentExchangeRate(): Promise<ExchangeRate | null> {
  const [row] = await getDb()
    .select({ usdPen: exchangeRates.usdPen, effectiveFrom: exchangeRates.createdAt })
    .from(exchangeRates)
    .orderBy(...newestFirst)
    .limit(1);
  return row ? { ...row, usdPen: canonicalUsdPen(row.usdPen) } : null;
}

// History for the CRM: the last 20 rates with who set them, newest (the one in force) first. The
// author is never missing (created_by is NOT NULL with ON DELETE RESTRICT).
export async function listExchangeRates(): Promise<ExchangeRateListItem[]> {
  const rows = await getDb()
    .select({
      id: exchangeRates.id,
      usdPen: exchangeRates.usdPen,
      effectiveFrom: exchangeRates.createdAt,
      createdBy: { email: profiles.email },
    })
    .from(exchangeRates)
    .innerJoin(profiles, eq(profiles.userId, exchangeRates.createdBy))
    .orderBy(...newestFirst)
    .limit(HISTORY_LIMIT);
  return rows.map((row) => ({ ...row, usdPen: canonicalUsdPen(row.usdPen) }));
}

// Insert only: rates are never edited or deleted, each change is a new row in force from now on
// (created_at takes the column default). usdPen comes normalized by exchangeRateFormSchema
// ("3.7500"); the author is always the session user.
export async function setExchangeRate(usdPen: string, actorUserId: string): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(exchangeRates)
    .values({ usdPen, createdBy: actorUserId })
    .returning({ id: exchangeRates.id });
  return { id: row.id };
}
