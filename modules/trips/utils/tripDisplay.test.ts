// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTripDate, formatTripDateRange, formatTripPrice } from "./tripDisplay";

describe("formatTripDate", () => {
  beforeEach(() => {
    // A process time zone behind UTC would shift a naive local date to the previous day.
    vi.stubEnv("TZ", "America/Lima");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs with a process time zone other than UTC", () => {
    expect(new Date(2027, 0, 1).getTimezoneOffset()).toBe(300);
  });

  it("formats a calendar date in Spanish without shifting the day", () => {
    expect(formatTripDate("2027-04-25")).toBe("25 de abril de 2027");
    expect(formatTripDate("2027-01-01")).toBe("1 de enero de 2027");
  });
});

describe("formatTripDateRange", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Lima");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("collapses month and year within the same month", () => {
    expect(formatTripDateRange("2027-04-23", "2027-04-27")).toBe("23–27 de abril de 2027");
  });

  it("shows both months when they differ", () => {
    expect(formatTripDateRange("2027-04-29", "2027-05-02")).toBe(
      "29 de abril – 2 de mayo de 2027",
    );
  });
});

describe("formatTripPrice", () => {
  it("shows the fallback text when there is no price", () => {
    expect(formatTripPrice(null)).toBe("Precio a consultar");
  });

  it("formats the price in USD with thousands separators and a normal space", () => {
    expect(formatTripPrice(1990)).toBe("US$ 1,990");
    expect(formatTripPrice(12500)).toBe("US$ 12,500");
  });

  it("formats zero as a price, not as the fallback text", () => {
    expect(formatTripPrice(0)).toBe("US$ 0");
  });
});
