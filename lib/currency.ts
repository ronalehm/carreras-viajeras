// Pure USD→PEN math and formatting, shared by trips, landing and (later) bookings. No server-only.
// USD amounts are whole dollars; the USD→PEN rate is handled in ten-thousandths (numeric(10,4)),
// so every conversion is exact integer arithmetic: no floating point anywhere.

export const MAX_USD_AMOUNT = 1_000_000;

// Rate bounds in ten-thousandths: > 0 and < 100 soles per dollar (exchange_rates_usd_pen_chk).
const MIN_RATE_E4 = 1;
const MAX_RATE_E4 = 999_999;
const RATE_PATTERN = /^(\d{1,2})(?:\.(\d{1,4}))?$/;

// Grouping only: the integer part never has decimals, so the output does not depend on ICU rounding.
const groupedInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function assertRate(rateE4: number): void {
  if (!Number.isInteger(rateE4) || rateE4 < MIN_RATE_E4 || rateE4 > MAX_RATE_E4) {
    throw new RangeError("rate must be an integer number of ten-thousandths between 1 and 999999");
  }
}

// "3.75" → 37500, "3.7512" → 37512, "10" → 100000. Anything else (more than 4 decimals, a comma,
// a sign, 0 or ≥ 100) → null.
export function parseUsdPenRate(value: string): number | null {
  const match = RATE_PATTERN.exec(value);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const rateE4 = Number(whole) * 10_000 + Number(fraction.padEnd(4, "0"));
  return rateE4 >= MIN_RATE_E4 && rateE4 <= MAX_RATE_E4 ? rateE4 : null;
}

// PEN cents of a whole USD amount: half-up of usd × rate × 100. Each amount is converted on its own,
// so the sum of two converted amounts may differ by 1 cent from the conversion of their sum.
export function usdToPenCents(usd: number, rateE4: number): number {
  if (!Number.isInteger(usd) || usd < 0 || usd > MAX_USD_AMOUNT) {
    throw new RangeError(`usd must be an integer between 0 and ${MAX_USD_AMOUNT}`);
  }
  assertRate(rateE4);
  // PEN in ten-thousandths; at most 1e6 × 999999 < 2^53, so it stays an exact integer.
  const penE4 = usd * rateE4;
  const rounded = penE4 + 50;
  return (rounded - (rounded % 100)) / 100;
}

// 674841 → "S/ 6,748.41". Built from integers (no toFixed on floats).
export function formatPenCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("cents must be a non-negative integer");
  }
  const soles = Math.floor(cents / 100);
  const remainder = String(cents % 100).padStart(2, "0");
  return `S/ ${groupedInteger.format(soles)}.${remainder}`;
}

// 37500 → "3.7500".
export function formatUsdPenRate(rateE4: number): string {
  assertRate(rateE4);
  const whole = Math.floor(rateE4 / 10_000);
  const fraction = String(rateE4 % 10_000).padStart(4, "0");
  return `${whole}.${fraction}`;
}
