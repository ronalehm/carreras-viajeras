// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { RunnerBookingDetail, RunnerBookingSummary, RunnerItineraryItem, RunnerTrip } from "../types/bookings.types";
import { buildTimeline, getPaymentSummary, isTripFinished, orderRunnerBookings } from "./runnerBookings";

// @/modules/trips also re-exports server code (services, actions); only the real formatter is needed.
vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));

const TODAY = "2026-10-18";

function trip(overrides: Partial<RunnerTrip> = {}): RunnerTrip {
  return {
    title: "Maratón de Santiago 2027",
    city: "Santiago",
    country: "Chile",
    raceDate: "2027-05-16",
    startDate: "2027-05-14",
    endDate: "2027-05-18",
    includes: [],
    ...overrides,
  };
}

function summary(id: string, status: RunnerBookingSummary["status"], tripOverrides: Partial<RunnerTrip>) {
  return { id, status, trip: trip(tripOverrides) };
}

function item(overrides: Partial<RunnerItineraryItem> & Pick<RunnerItineraryItem, "id" | "kind">): RunnerItineraryItem {
  return {
    status: "pending",
    title: overrides.id,
    details: null,
    location: null,
    start: null,
    end: null,
    ...overrides,
  };
}

function on(date: string, time: string | null = null, timeZone: string | null = time ? "America/Lima" : null) {
  return { date, time, timeZone };
}

function detail(overrides: Partial<RunnerBookingDetail> = {}): RunnerBookingDetail {
  return {
    id: "b1",
    status: "confirmed",
    trip: trip(),
    packageLabel: "Paquete corredor",
    distance: "42K",
    totalUsd: 1499,
    balanceDueOn: "2027-04-01",
    createdAt: new Date("2027-03-04T03:00:00Z"), // 3 Mar in Lima
    payments: [{ id: "p1", amountUsd: 300, paidOn: "2027-03-03", concept: "Reserva" }],
    items: [],
    updates: [],
    ...overrides,
  };
}

const keys = (entries: { key: string }[]) => entries.map((e) => e.key);

describe("isTripFinished", () => {
  it("uses end_date, or race_date when end_date is null", () => {
    expect(isTripFinished({ raceDate: "2026-10-10", endDate: "2026-10-18" }, TODAY)).toBe(false);
    expect(isTripFinished({ raceDate: "2026-10-10", endDate: "2026-10-17" }, TODAY)).toBe(true);
    expect(isTripFinished({ raceDate: "2026-10-18", endDate: null }, TODAY)).toBe(false);
    expect(isTripFinished({ raceDate: "2026-10-17", endDate: null }, TODAY)).toBe(true);
  });
});

describe("orderRunnerBookings", () => {
  it("puts active by race date asc, then finished and cancelled by race date desc", () => {
    const bookings = [
      summary("cancelled-old", "cancelled", { raceDate: "2025-01-01", endDate: null }),
      summary("finished-old", "confirmed", { raceDate: "2025-05-01", endDate: "2025-05-03" }),
      summary("active-late", "pending", { raceDate: "2027-12-01" }),
      summary("cancelled-new", "cancelled", { raceDate: "2027-06-01" }),
      // end_date null: finished by race_date.
      summary("finished-new", "confirmed", { raceDate: "2026-10-17", endDate: null }),
      summary("active-soon", "confirmed", { raceDate: "2026-10-18", endDate: null }),
    ];

    expect(orderRunnerBookings(bookings, TODAY).map((b) => b.id)).toEqual([
      "active-soon",
      "active-late",
      "finished-new",
      "finished-old",
      "cancelled-new",
      "cancelled-old",
    ]);
  });

  it("does not mutate the input", () => {
    const bookings = [summary("b", "confirmed", { raceDate: "2027-02-01" }), summary("a", "confirmed", {})];
    orderRunnerBookings(bookings, TODAY);
    expect(bookings.map((b) => b.id)).toEqual(["b", "a"]);
  });
});

describe("getPaymentSummary", () => {
  const pay = (amountUsd: number) => ({ id: String(amountUsd), amountUsd, paidOn: "2027-03-03", concept: "Cuota" });

  it("is completed with balance 0", () => {
    expect(getPaymentSummary(1499, [pay(1000), pay(499)], "2027-04-01")).toEqual({
      totalUsd: 1499,
      paidUsd: 1499,
      balanceUsd: 0,
      dueOn: null,
      status: "completed",
    });
  });

  it("is pending with its due date when partial", () => {
    expect(getPaymentSummary(1499, [pay(300)], "2027-04-01")).toEqual({
      totalUsd: 1499,
      paidUsd: 300,
      balanceUsd: 1199,
      dueOn: "2027-04-01",
      status: "pending",
    });
  });

  it("allows a negative balance when overpaid", () => {
    const result = getPaymentSummary(1499, [pay(1600)], null);
    expect(result.balanceUsd).toBe(-101);
    expect(result.status).toBe("completed");
  });

  it("is completed with total 0 and no payments", () => {
    expect(getPaymentSummary(0, [], null)).toMatchObject({ paidUsd: 0, balanceUsd: 0, status: "completed" });
  });
});

describe("buildTimeline", () => {
  it("derives booking, payments and race from real data", () => {
    const timeline = buildTimeline(detail({ status: "pending" }), TODAY);

    expect(timeline.preparation).toEqual([
      expect.objectContaining({
        key: "booking",
        kind: "booking",
        status: "pending",
        title: "Reserva",
        start: on("2027-03-03"),
        derived: true,
      }),
      expect.objectContaining({
        key: "payments",
        kind: "payments",
        status: "pending",
        details: "Pagado US$ 300 de US$ 1,499",
        start: on("2027-04-01"),
        derived: true,
      }),
    ]);
    expect(timeline.trip).toEqual([
      expect.objectContaining({
        key: "race",
        kind: "race",
        status: "confirmed",
        title: "Día de carrera",
        location: "Santiago, Chile",
        start: on("2027-05-16"),
        derived: true,
      }),
    ]);
    expect(timeline.unscheduled).toEqual([]);
  });

  it("maps every booking status to the booking entry", () => {
    for (const status of ["pending", "confirmed", "cancelled"] as const) {
      expect(buildTimeline(detail({ status }), TODAY).preparation[0].status).toBe(status);
    }
  });

  it("marks payments completed without a due date when paid in full", () => {
    const payments = [{ id: "p1", amountUsd: 1499, paidOn: "2027-03-03", concept: "Total" }];
    const entry = buildTimeline(detail({ payments }), TODAY).preparation[1];
    expect(entry).toMatchObject({ status: "completed", details: "Pagado US$ 1,499 de US$ 1,499", start: null });
  });

  it("completes the derived race after its date", () => {
    const timeline = buildTimeline(detail(), "2027-05-17");
    expect(timeline.trip[0]).toMatchObject({ key: "race", status: "completed" });
    expect(buildTimeline(detail(), "2027-05-16").trip[0].status).toBe("confirmed");
  });

  it("replaces the derived race with a visible race item", () => {
    const race = item({ id: "race-item", kind: "race", status: "provisional", start: on("2027-05-16", "07:00") });
    const timeline = buildTimeline(detail({ items: [race] }), TODAY);
    expect(keys(timeline.trip)).toEqual(["race-item"]);
  });

  it("orders preparation by fixed kind, then date (undated last) and title", () => {
    const items = [
      item({ id: "reg", kind: "registration", start: on("2027-01-01") }),
      item({ id: "doc-undated", kind: "document", title: "A pasaporte" }),
      item({ id: "doc-late", kind: "document", start: on("2027-03-01") }),
      item({ id: "doc-b", kind: "document", title: "B", start: on("2027-02-01") }),
      item({ id: "doc-a", kind: "document", title: "A", start: on("2027-02-01") }),
    ];
    expect(keys(buildTimeline(detail({ items }), TODAY).preparation)).toEqual([
      "booking",
      "payments",
      "doc-a",
      "doc-b",
      "doc-late",
      "doc-undated",
      "reg",
    ]);
  });

  it("orders the trip by date, time (none first), kind and title", () => {
    const items = [
      item({ id: "return", kind: "return", start: on("2027-05-18", "10:00") }),
      item({ id: "transfer", kind: "transfer", start: on("2027-05-14", "08:00") }),
      item({ id: "hotel", kind: "hotel", start: on("2027-05-14") }),
      item({ id: "flight", kind: "flight", start: on("2027-05-14", "01:30"), end: on("2027-05-14", "06:55", "America/Santiago") }),
      item({ id: "activity-b", kind: "activity", title: "B", start: on("2027-05-15") }),
      item({ id: "activity-a", kind: "activity", title: "A", start: on("2027-05-15") }),
      item({ id: "transfer-same-day", kind: "transfer", start: on("2027-05-15") }),
    ];
    expect(keys(buildTimeline(detail({ items }), TODAY).trip)).toEqual([
      "hotel",
      "flight",
      "transfer",
      "transfer-same-day",
      "activity-a",
      "activity-b",
      "race",
      "return",
    ]);
  });

  it("puts undated trip items in 'Por programar' by kind and title", () => {
    const items = [
      item({ id: "return", kind: "return" }),
      item({ id: "hotel", kind: "hotel" }),
      item({ id: "flight-b", kind: "flight", title: "Vuelo de vuelta" }),
      item({ id: "flight-a", kind: "flight", title: "Vuelo de ida" }),
    ];
    const timeline = buildTimeline(detail({ items }), TODAY);
    expect(keys(timeline.unscheduled)).toEqual(["flight-a", "flight-b", "hotel", "return"]);
    expect(keys(timeline.trip)).toEqual(["race"]);
  });

  it("keeps a cancelled item in its group", () => {
    const items = [item({ id: "hotel", kind: "hotel", status: "cancelled", start: on("2027-05-14") })];
    expect(buildTimeline(detail({ items }), TODAY).trip[0]).toMatchObject({ key: "hotel", status: "cancelled" });
  });

  it("keeps missing location and details as null", () => {
    const items = [item({ id: "hotel", kind: "hotel" })];
    expect(buildTimeline(detail({ items }), TODAY).unscheduled[0]).toMatchObject({
      location: null,
      details: null,
      start: null,
      end: null,
      derived: false,
    });
  });

  describe("itineraryConfirmed", () => {
    it("is false with only the derived race", () => {
      expect(buildTimeline(detail(), TODAY).itineraryConfirmed).toBe(false);
    });

    it("is true when every trip item is settled and nothing is unscheduled", () => {
      const items = [
        item({ id: "flight", kind: "flight", status: "confirmed", start: on("2027-05-14") }),
        item({ id: "hotel", kind: "hotel", status: "completed", start: on("2027-05-14") }),
        item({ id: "transfer", kind: "transfer", status: "cancelled", start: on("2027-05-14") }),
        // Preparation items do not count.
        item({ id: "doc", kind: "document", status: "pending" }),
      ];
      expect(buildTimeline(detail({ items }), TODAY).itineraryConfirmed).toBe(true);
    });

    it("is false with a pending or provisional trip item", () => {
      for (const status of ["pending", "provisional"] as const) {
        const items = [item({ id: "flight", kind: "flight", status, start: on("2027-05-14") })];
        expect(buildTimeline(detail({ items }), TODAY).itineraryConfirmed).toBe(false);
      }
    });

    it("is false with an unscheduled item", () => {
      const items = [
        item({ id: "flight", kind: "flight", status: "confirmed", start: on("2027-05-14") }),
        item({ id: "hotel", kind: "hotel", status: "confirmed" }),
      ];
      expect(buildTimeline(detail({ items }), TODAY).itineraryConfirmed).toBe(false);
    });
  });
});
