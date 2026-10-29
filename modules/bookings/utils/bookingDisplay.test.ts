import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingStatusEnum, itineraryKindEnum, itineraryStatusEnum } from "@/lib/db-schema";
import {
  BOOKING_STATUS_LABELS,
  ITINERARY_KIND_LABELS,
  ITINERARY_STATUS_BADGE,
  ITINERARY_STATUS_LABELS,
  SCHEDULE_EDGE_LABELS,
  firstName,
  formatScheduleEdge,
  formatShortDate,
  itineraryOriginPath,
  limaDate,
  timeZoneLabel,
} from "./bookingDisplay";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("labels", () => {
  it("label every enum value", () => {
    for (const status of bookingStatusEnum.enumValues) expect(BOOKING_STATUS_LABELS[status]).toBeTruthy();
    for (const status of itineraryStatusEnum.enumValues) {
      expect(ITINERARY_STATUS_LABELS[status]).toBeTruthy();
      expect(ITINERARY_STATUS_BADGE[status].variant).toBeTruthy();
    }
    for (const kind of itineraryKindEnum.enumValues) {
      expect(ITINERARY_KIND_LABELS[kind]).toBeTruthy();
      expect(SCHEDULE_EDGE_LABELS[kind].start).toBeTruthy();
    }
  });

  it("use departure, stay and span edge labels by kind", () => {
    expect(SCHEDULE_EDGE_LABELS.flight).toEqual({ start: "Sale", end: "Llega" });
    expect(SCHEDULE_EDGE_LABELS.return).toEqual({ start: "Sale", end: "Llega" });
    expect(SCHEDULE_EDGE_LABELS.transfer).toEqual({ start: "Sale", end: "Llega" });
    expect(SCHEDULE_EDGE_LABELS.hotel).toEqual({ start: "Entrada", end: "Salida" });
    expect(SCHEDULE_EDGE_LABELS.activity).toEqual({ start: "Inicio", end: "Fin" });
  });
});

describe("limaDate", () => {
  it("returns the Lima calendar day across the UTC day change", () => {
    expect(limaDate(new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-18");
    expect(limaDate(new Date("2026-10-19T05:00:00Z"))).toBe("2026-10-19");
  });

  it("does not depend on the process TZ", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(limaDate(new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-18");
  });
});

describe("formatShortDate", () => {
  it("formats a calendar date in Spanish without shifting the day", () => {
    vi.stubEnv("TZ", "America/Lima");
    expect(formatShortDate("2027-05-16")).toBe("dom, 16 may 2027");
  });
});

describe("timeZoneLabel", () => {
  it("uses the last zone segment with spaces", () => {
    expect(timeZoneLabel("America/Lima")).toBe("hora de Lima");
    expect(timeZoneLabel("America/Argentina/Buenos_Aires")).toBe("hora de Buenos Aires");
    expect(timeZoneLabel("America/New_York")).toBe("hora de New York");
  });
});

describe("formatScheduleEdge", () => {
  it("shows the local time with its zone, unconverted", () => {
    expect(formatScheduleEdge({ date: "2027-05-14", time: "06:55", timeZone: "America/Santiago" })).toBe(
      "vie, 14 may 2027 · 06:55 hora de Santiago",
    );
  });

  it("shows only the date without time", () => {
    expect(formatScheduleEdge({ date: "2027-05-14", time: null, timeZone: null })).toBe("vie, 14 may 2027");
  });
});

describe("firstName", () => {
  it("returns the first word", () => {
    expect(firstName(" Ana  Pérez ")).toBe("Ana");
  });

  it("returns undefined when empty or missing", () => {
    expect(firstName("   ")).toBeUndefined();
    expect(firstName(undefined)).toBeUndefined();
  });
});

describe("itineraryOriginPath", () => {
  it("points a booking item to its booking and a trip item to the trip itinerary", () => {
    expect(itineraryOriginPath({ tripId: "t-1", bookingId: "b-1" })).toBe("/crm/reservas/b-1");
    expect(itineraryOriginPath({ tripId: "t-1", bookingId: null })).toBe("/crm/viajes/t-1/itinerario");
  });
});
