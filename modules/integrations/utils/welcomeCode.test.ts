import { describe, expect, it } from "vitest";
import { generateWelcomeCode, WELCOME_CODE_PATTERN } from "./welcomeCode";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ITERATIONS = 5000;
const codes = Array.from({ length: ITERATIONS }, generateWelcomeCode);

describe("generateWelcomeCode", () => {
  it("always returns «CV-» plus 6 characters of the alphabet", () => {
    for (const code of codes) {
      expect(code).toMatch(WELCOME_CODE_PATTERN);
      expect(code).toHaveLength(9);
    }
  });

  it("never uses ambiguous characters (0, O, 1, I) or lowercase letters", () => {
    for (const code of codes) expect(code.slice(3)).not.toMatch(/[01OIa-z]/);
  });

  it("produces different codes", () => {
    // 32^6 ≈ 1.07e9 combinations: a handful of collisions in 5000 draws would already be very unlikely.
    expect(new Set(codes).size).toBeGreaterThan(ITERATIONS - 5);
  });

  it("uses the whole alphabet with a roughly even distribution", () => {
    const counts = new Map<string, number>();
    for (const code of codes) {
      for (const char of code.slice(3)) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    // 30 000 characters → 937.5 expected per symbol; the bounds are far outside normal variation.
    expect([...counts.keys()].sort().join("")).toBe(ALPHABET);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(500);
      expect(count).toBeLessThan(1400);
    }
  });
});

describe("WELCOME_CODE_PATTERN", () => {
  it("accepts the format of the migration CHECK and rejects anything else", () => {
    expect(WELCOME_CODE_PATTERN.test("CV-23ABZ9")).toBe(true);
    for (const value of ["CV-23ABZ", "CV-23ABZ99", "cv-23ABZ9", "CV-23abz9", "CV-0OAB12", "CV-1IABCD", "XX-23ABZ9", " CV-23ABZ9"]) {
      expect(WELCOME_CODE_PATTERN.test(value)).toBe(false);
    }
  });
});
