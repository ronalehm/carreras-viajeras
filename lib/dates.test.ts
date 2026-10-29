// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { compareToToday, CRM_TIME_ZONE, formatCalendarDate, formatDateTime, getTodayDate } from "./dates";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// Each case runs with process time zones on both sides of America/Lima and of UTC.
const PROCESS_TIME_ZONES = ["UTC", "Europe/Madrid", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

describe("CRM_TIME_ZONE", () => {
  it("is America/Lima", () => {
    expect(CRM_TIME_ZONE).toBe("America/Lima");
  });
});

describe.each(PROCESS_TIME_ZONES)("with the process time zone %s", (timeZone) => {
  it("applies the process time zone (the cases below really run in it)", () => {
    process.env.TZ = timeZone;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timeZone);
  });

  it("formatDateTime uses the CRM time zone", () => {
    process.env.TZ = timeZone;
    expect(formatDateTime(new Date("2026-10-19T03:00:00Z"))).toBe("18 oct 2026, 22:00");
    expect(formatDateTime(new Date("2026-10-18T15:30:00Z"))).toBe("18 oct 2026, 10:30");
  });

  it("getTodayDate returns the CRM calendar date", () => {
    process.env.TZ = timeZone;
    expect(getTodayDate(new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-18");
    expect(getTodayDate(new Date("2026-10-19T05:00:00Z"))).toBe("2026-10-19");
  });

  it("formatCalendarDate never shifts the day", () => {
    process.env.TZ = timeZone;
    expect(formatCalendarDate("2026-10-25")).toBe("25 oct 2026");
    expect(formatCalendarDate("2027-01-01")).toBe("1 ene 2027");
  });
});

describe("getTodayDate", () => {
  it("defaults to now", () => {
    expect(getTodayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("compareToToday", () => {
  it("tells past, today and future dates apart", () => {
    expect(compareToToday("2026-10-17", "2026-10-18")).toBe("past");
    expect(compareToToday("2026-10-18", "2026-10-18")).toBe("today");
    expect(compareToToday("2026-10-19", "2026-10-18")).toBe("future");
    expect(compareToToday("2025-12-31", "2026-01-01")).toBe("past");
  });
});
