import { describe, expect, it } from "vitest";
import { retryDelaySeconds } from "./retryDelay";

const always = (value: number) => () => value;

describe("retryDelaySeconds", () => {
  it.each([
    [1, 15, 30],
    [2, 30, 60],
    [3, 60, 120],
    [4, 120, 240],
    [5, 240, 480],
    [6, 480, 960],
    [7, 960, 1920],
    [8, 1800, 3600],
  ])("attempt %d waits between %d and %d seconds", (attempt, lower, upper) => {
    expect(retryDelaySeconds(attempt, always(0))).toBe(lower);
    expect(retryDelaySeconds(attempt, always(1))).toBe(upper);
  });

  it("never exceeds one hour", () => {
    for (const attempt of [8, 9, 20]) {
      expect(retryDelaySeconds(attempt, always(1))).toBe(3600);
    }
  });

  it("rounds to whole seconds", () => {
    // attempt 1: 30 · (0.5 + 0.5 · 0.33) = 19.95 → 20
    expect(retryDelaySeconds(1, always(0.33))).toBe(20);
    expect(Number.isInteger(retryDelaySeconds(3, always(0.123)))).toBe(true);
  });

  it("uses Math.random by default and stays within the bounds", () => {
    for (let index = 0; index < 50; index += 1) {
      const delay = retryDelaySeconds(1);
      expect(delay).toBeGreaterThanOrEqual(15);
      expect(delay).toBeLessThanOrEqual(30);
    }
  });
});
