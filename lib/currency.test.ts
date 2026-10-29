// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  formatPenCents,
  formatUsdPenRate,
  MAX_USD_AMOUNT,
  parseUsdPenRate,
  usdToPenCents,
} from "./currency";

describe("parseUsdPenRate", () => {
  it.each([
    ["3.75", 37500],
    ["3.7512", 37512],
    ["10", 100000],
    ["3", 30000],
    ["3.7", 37000],
    ["0.0001", 1],
    ["99.9999", 999999],
    ["03.75", 37500],
  ])("%s → %d", (value, expected) => {
    expect(parseUsdPenRate(value)).toBe(expected);
  });

  it.each(["3.75001", "0", "0.0000", "100", "-1", "abc", "", "3,75", " 3.75", "3.", ".75", "1e1", "+3.75"])(
    "rejects %j",
    (value) => {
      expect(parseUsdPenRate(value)).toBeNull();
    },
  );
});

describe("usdToPenCents", () => {
  it.each([
    [1799, 37512, 674841],
    [1, 37550, 376], // 3.7550 → half-up to 3.76
    [1, 37549, 375], // 3.7549 → 3.75
    [3, 33333, 1000], // 9.9999 → 10.00
    [0, 37500, 0],
    [2000, 37500, 750000],
    [1, 1, 0], // 0.0001 → 0.00
    [1, 50, 1], // 0.0050 → half-up to 0.01
    [1, 49, 0], // 0.0049 → 0.00
    [MAX_USD_AMOUNT, 999999, 9999990000], // 1,000,000 × 99.9999 = 99,999,900.00
  ])("(%d, %d) → %d", (usd, rate, expected) => {
    expect(usdToPenCents(usd, rate)).toBe(expected);
  });

  it.each([-1, 1.5, MAX_USD_AMOUNT + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws RangeError for usd %d",
    (usd) => {
      expect(() => usdToPenCents(usd, 37500)).toThrow(RangeError);
    },
  );

  it.each([0, -37500, 3.75, 1_000_000, Number.NaN])("throws RangeError for rate %d", (rate) => {
    expect(() => usdToPenCents(100, rate)).toThrow(RangeError);
  });

  it("converts each amount on its own: a sum may differ by 1 cent from the whole, never more", () => {
    // 150 × 3.7551 = 563.265 → 563.27 and 1649 × 3.7551 = 6192.1599 → 6192.16 (sum 6755.43),
    // while 1799 × 3.7551 = 6755.4249 → 6755.42.
    expect(usdToPenCents(150, 37551) + usdToPenCents(1649, 37551)).toBe(675543);
    expect(usdToPenCents(1799, 37551)).toBe(675542);

    const maxDifference = (first: number, second: number) => {
      let max = 0;
      for (let rate = 1; rate <= 999_999; rate += 1) {
        const parts = usdToPenCents(first, rate) + usdToPenCents(second, rate);
        max = Math.max(max, Math.abs(parts - usdToPenCents(first + second, rate)));
      }
      return max;
    };
    // A multiple of US$ 100 converts exactly, so 100 + 1699 always matches 1799.
    expect(maxDifference(100, 1699)).toBe(0);
    expect(maxDifference(150, 1649)).toBe(1);
  });
});

describe("formatPenCents", () => {
  it.each([
    [674841, "S/ 6,748.41"],
    [5, "S/ 0.05"],
    [0, "S/ 0.00"],
    [100000000, "S/ 1,000,000.00"],
    [750000, "S/ 7,500.00"],
    [99, "S/ 0.99"],
    [100, "S/ 1.00"],
  ])("%d → %s", (cents, expected) => {
    expect(formatPenCents(cents)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN])("throws RangeError for %d", (cents) => {
    expect(() => formatPenCents(cents)).toThrow(RangeError);
  });
});

describe("formatUsdPenRate", () => {
  it.each([
    [37500, "3.7500"],
    [37512, "3.7512"],
    [100000, "10.0000"],
    [1, "0.0001"],
    [999999, "99.9999"],
  ])("%d → %s", (rate, expected) => {
    expect(formatUsdPenRate(rate)).toBe(expected);
  });

  it("round-trips parseUsdPenRate", () => {
    expect(formatUsdPenRate(parseUsdPenRate("3.75") ?? 0)).toBe("3.7500");
  });

  it.each([0, 1_000_000, 3.75])("throws RangeError for %d", (rate) => {
    expect(() => formatUsdPenRate(rate)).toThrow(RangeError);
  });
});
