// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bookingStatusEnum, itineraryKindEnum, itineraryStatusEnum } from "@/lib/db-schema";
import {
  bookingFormSchema,
  canonicalTimeZone,
  bookingStatusChangeSchema,
  bookingStatusSchema,
  itineraryKindSchema,
  itemIdSchema,
  itineraryItemFormSchema,
  itineraryStatusSchema,
  paymentFormSchema,
  paymentVoidSchema,
  tripUpdateFormSchema,
  tripUpdateIdSchema,
  updateBookingSchema,
  updateItineraryItemSchema,
} from "./bookings.schema";

const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";

// Strings as they come from Object.fromEntries(formData).
const validForm = {
  tripId: TRIP_ID,
  participantName: "  Ana Pérez ",
  participantEmail: "  Ana@Example.com ",
  packageLabel: " Paquete corredor ",
  distance: " 42K ",
  totalUsd: " 1499 ",
  balanceDueOn: "2027-04-01",
  internalNote: "  Pidió habitación doble. ",
};

const parse = (overrides: Record<string, string>) =>
  bookingFormSchema.safeParse({ ...validForm, ...overrides });

const issueFields = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  [...new Set(result.error?.issues.map((issue) => issue.path[0]))];

describe("enum schemas", () => {
  it("match the database enums", () => {
    expect(bookingStatusSchema.options).toEqual(bookingStatusEnum.enumValues);
    expect(itineraryKindSchema.options).toEqual(itineraryKindEnum.enumValues);
    expect(itineraryStatusSchema.options).toEqual(itineraryStatusEnum.enumValues);
  });
});

describe("bookingFormSchema", () => {
  it("parses a valid form into clean values with a lowercase email", () => {
    expect(parse({}).data).toEqual({
      tripId: TRIP_ID,
      leadId: null,
      participantName: "Ana Pérez",
      participantEmail: "ana@example.com",
      packageLabel: "Paquete corredor",
      distance: "42K",
      totalUsd: 1499,
      balanceDueOn: "2027-04-01",
      internalNote: "Pidió habitación doble.",
    });
  });

  it("turns blank or missing optional fields into null", () => {
    const result = bookingFormSchema.safeParse({ ...validForm, distance: undefined, balanceDueOn: "", internalNote: "  " });
    expect(result.data).toMatchObject({ distance: null, balanceDueOn: null, internalNote: null });
  });

  it.each(["1499.50", "12.5", "-1", "abc", "", "1000001"])("rejects total %j with the USD message", (totalUsd) => {
    const result = parse({ totalUsd });
    expect(issueFields(result)).toEqual(["totalUsd"]);
    expect(result.error?.issues[0].message).toBe("Indica el total en dólares, sin decimales.");
  });

  it("rejects a missing total with the USD message", () => {
    const result = bookingFormSchema.safeParse({ ...validForm, totalUsd: undefined });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Indica el total en dólares, sin decimales."]);
  });

  it.each([["0", 0], ["1499", 1499]])("accepts total %j as %d", (totalUsd, expected) => {
    expect(parse({ totalUsd }).data?.totalUsd).toBe(expected);
  });

  it.each(["not-an-email", "", "a".repeat(250) + "@x.com"])("rejects email %j", (participantEmail) => {
    const result = parse({ participantEmail });
    expect(issueFields(result)).toEqual(["participantEmail"]);
    expect(result.error?.issues[0].message).toBe("Introduce un correo válido.");
  });

  it.each([
    ["tripId", "abc"],
    ["participantName", "A"],
    ["packageLabel", "  "],
    ["distance", "x".repeat(21)],
    ["balanceDueOn", "2027-02-30"],
    ["internalNote", "x".repeat(2001)],
  ])("rejects an invalid %s", (field, value) => {
    expect(issueFields(parse({ [field]: value }))).toEqual([field]);
  });

  it.each([["", null], ["  ", null], [undefined, null], [LEAD_ID, LEAD_ID], [` ${LEAD_ID} `, LEAD_ID]])(
    "parses leadId %j as %j",
    (leadId, expected) => {
      expect(bookingFormSchema.safeParse({ ...validForm, leadId }).data?.leadId).toBe(expected);
    },
  );

  it.each(["abc", "123", `${LEAD_ID}x`])("rejects a non-UUID leadId %j under its field", (leadId) => {
    const result = parse({ leadId });
    expect(issueFields(result)).toEqual(["leadId"]);
    expect(result.error?.issues[0].message).toBe("El lead indicado no es válido.");
  });

  it("drops fields that never come from the form", () => {
    const result = bookingFormSchema.parse({
      ...validForm, runnerUserId: "user-x", status: "confirmed", createdBy: "user-y",
    });
    expect(result).not.toHaveProperty("runnerUserId");
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("createdBy");
  });
});

describe("updateBookingSchema", () => {
  it("requires the booking id and drops the trip and the lead", () => {
    const result = updateBookingSchema.parse({ ...validForm, bookingId: BOOKING_ID, leadId: LEAD_ID });
    expect(result).toMatchObject({ bookingId: BOOKING_ID, participantEmail: "ana@example.com" });
    expect(result).not.toHaveProperty("tripId");
    expect(result).not.toHaveProperty("leadId");
    expect(issueFields(updateBookingSchema.safeParse({ ...validForm, bookingId: "abc" }))).toEqual(["bookingId"]);
  });
});

describe("bookingStatusChangeSchema", () => {
  it.each(["confirmed", "cancelled"])("accepts %s", (status) => {
    expect(bookingStatusChangeSchema.safeParse({ bookingId: BOOKING_ID, status }).success).toBe(true);
  });
  it.each(["pending", "completed", ""])("rejects %j", (status) => {
    expect(issueFields(bookingStatusChangeSchema.safeParse({ bookingId: BOOKING_ID, status }))).toEqual(["status"]);
  });
});

describe("paymentFormSchema", () => {
  const REQUEST_KEY = "33333333-3333-4333-8333-333333333333";
  const validPayment = { bookingId: BOOKING_ID, requestKey: REQUEST_KEY, amountUsd: " 300 ", paidOn: "2027-03-03", concept: " Reserva " };
  const parsePayment = (overrides: Record<string, string | undefined>) =>
    paymentFormSchema.safeParse({ ...validPayment, ...overrides });

  it("parses a valid payment into clean values", () => {
    expect(parsePayment({}).data).toEqual({
      bookingId: BOOKING_ID, requestKey: REQUEST_KEY, amountUsd: 300, paidOn: "2027-03-03", concept: "Reserva",
    });
  });

  it.each(["0", "300.50", "-1", "abc", "", "1000001", undefined])("rejects amount %j with the USD message", (amountUsd) => {
    const result = parsePayment({ amountUsd });
    expect(issueFields(result)).toEqual(["amountUsd"]);
    expect(result.error?.issues[0].message).toBe("Indica el importe en dólares, sin decimales.");
  });

  it.each([
    ["bookingId", "abc"],
    ["requestKey", "abc"],
    ["requestKey", undefined],
    ["paidOn", ""],
    ["paidOn", "2027-02-30"],
    ["concept", "  "],
    ["concept", "x".repeat(81)],
  ])("rejects an invalid %s (%j)", (field, value) => {
    expect(issueFields(parsePayment({ [field]: value }))).toEqual([field]);
  });

  it("drops fields that never come from the form", () => {
    const result = paymentFormSchema.parse({ ...validPayment, recordedBy: "user-x", voidedBy: "user-y" });
    expect(result).not.toHaveProperty("recordedBy");
    expect(result).not.toHaveProperty("voidedBy");
  });
});

describe("paymentVoidSchema", () => {
  it("requires a payment id and drops anything else", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(paymentVoidSchema.parse({ paymentId: id, voidedBy: "user-y" })).toEqual({ paymentId: id });
    expect(issueFields(paymentVoidSchema.safeParse({ paymentId: "abc" }))).toEqual(["paymentId"]);
  });
});

describe("canonicalTimeZone", () => {
  it.each([
    ["America/Lima", "America/Lima"],
    ["Etc/GMT+5", "Etc/GMT+5"],
    // Stored canonical, so the portal says "hora de Santiago", not "hora de SANTIAGO" or "hora de Eastern".
    ["AMERICA/SANTIAGO", "America/Santiago"],
    ["US/Eastern", "America/New_York"],
  ])("normalizes %s to %s", (zone, expected) => {
    expect(canonicalTimeZone(zone)).toBe(expected);
  });
  it("keeps the city of a zone whose canonical name depends on the ICU version", () => {
    expect(canonicalTimeZone("America/Argentina/Buenos_Aires")).toMatch(/^America\/(Argentina\/)?Buenos_Aires$/);
  });
  // UTC (also as Etc/UTC) is a real zone but fails the database CHECK (it needs a region).
  it.each(["Mars/Base", "UTC", "Etc/UTC", "Lima", "America/", "America/Lima; DROP"])("rejects %j", (zone) => {
    expect(canonicalTimeZone(zone)).toBeNull();
  });
});

describe("itineraryItemFormSchema", () => {
  // The flight of the F4 criterion, as the form sends it.
  const flight = {
    tripId: TRIP_ID, kind: "flight", status: "confirmed", title: " LA 2370 Lima → Santiago ",
    details: "", location: " Aeropuerto Jorge Chávez ",
    startDate: "2027-05-14", startTime: "01:30", startTimeZone: "America/Lima",
    endDate: "2027-05-14", endTime: "06:55", endTimeZone: "America/Santiago",
    runnerVisible: "on",
  };
  const parseItem = (overrides: Record<string, string | undefined>) =>
    itineraryItemFormSchema.safeParse({ ...flight, ...overrides });
  const issues = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    result.error?.issues.map((issue) => [issue.path[0], issue.message]);

  it("parses the criterion flight into clean values", () => {
    expect(parseItem({}).data).toEqual({
      tripId: TRIP_ID, bookingId: null, kind: "flight", status: "confirmed", title: "LA 2370 Lima → Santiago",
      details: null, location: "Aeropuerto Jorge Chávez",
      startDate: "2027-05-14", startTime: "01:30", startTimeZone: "America/Lima",
      endDate: "2027-05-14", endTime: "06:55", endTimeZone: "America/Santiago",
      runnerVisible: true,
    });
  });

  it("treats a missing checkbox as not visible", () => {
    expect(parseItem({ runnerVisible: undefined }).data?.runnerVisible).toBe(false);
  });

  it("accepts an item without any date", () => {
    const result = parseItem({ startDate: "", startTime: "", startTimeZone: "", endDate: "", endTime: "", endTimeZone: "" });
    expect(result.data).toMatchObject({ startDate: null, startTime: null, startTimeZone: null, endDate: null });
  });

  it("needs exactly one owner: a booking item ignores a sent tripId", () => {
    expect(parseItem({ bookingId: BOOKING_ID }).data).toMatchObject({ bookingId: BOOKING_ID, tripId: null });
    expect(issues(parseItem({ tripId: "" }))).toEqual([["tripId", "Falta el viaje o la reserva."]]);
  });

  it.each([
    ["time without date", { startDate: "", endDate: "", endTime: "", endTimeZone: "" }, [["startDate", "Indica la fecha."]]],
    ["end time without end date", { endDate: "" }, [["endDate", "Indica la fecha."]]],
    ["time without zone", { startTimeZone: "" }, [["startTimeZone", "Indica la zona horaria."]]],
    ["end before start", { endDate: "2027-05-13", endTime: "", endTimeZone: "" }, [["endDate", "El fin no puede ser anterior al inicio."]]],
    ["end without start", { startDate: "", startTime: "", startTimeZone: "" }, [["startDate", "Indica la fecha."]]],
    ["invalid zone", { startTimeZone: "Mars/Base" }, [["startTimeZone", "Indica una zona horaria válida, como America/Lima."]]],
    ["invalid time", { startTime: "25:00" }, [["startTime", "Indica una hora válida."]]],
  ])("rejects %s with the error on its field", (_case, overrides, expected) => {
    expect(issues(parseItem(overrides))).toEqual(expected);
  });

  it("stores the canonical zone name", () => {
    expect(parseItem({ endTimeZone: "america/santiago" }).data?.endTimeZone).toBe("America/Santiago");
  });

  it("drops a zone without a time", () => {
    expect(parseItem({ startTime: "", endTime: "" }).data).toMatchObject({ startTimeZone: null, endTimeZone: null });
  });

  it.each([
    ["kind", "boat"], ["status", "done"], ["title", "  "], ["details", "x".repeat(1001)], ["location", "x".repeat(161)],
  ])("rejects an invalid %s", (field, value) => {
    expect(issueFields(parseItem({ [field]: value }))).toEqual([field]);
  });
});

describe("updateItineraryItemSchema", () => {
  it("requires the item id, never moves the item and applies the same schedule rules", () => {
    const result = updateItineraryItemSchema.parse({
      itemId: BOOKING_ID, tripId: TRIP_ID, bookingId: BOOKING_ID, kind: "hotel", status: "completed", title: "Hotel",
      startDate: "2027-05-14", startTimeZone: "America/Santiago",
    });
    expect(result).toMatchObject({ itemId: BOOKING_ID, status: "completed", startTimeZone: null, runnerVisible: false });
    expect(result).not.toHaveProperty("tripId");
    expect(result).not.toHaveProperty("bookingId");
    expect(issueFields(updateItineraryItemSchema.safeParse({
      itemId: BOOKING_ID, kind: "hotel", status: "pending", title: "Hotel", startDate: "2027-05-14", endDate: "2027-05-13",
    }))).toEqual(["endDate"]);
    expect(issueFields(itemIdSchema.safeParse({ itemId: "abc" }))).toEqual(["itemId"]);
  });
});

describe("tripUpdateFormSchema", () => {
  const update = { tripId: TRIP_ID, title: " Recojo de kits ", body: " El sábado a las 10:00. " };

  it("trims title and body", () => {
    expect(tripUpdateFormSchema.parse(update)).toEqual({ tripId: TRIP_ID, title: "Recojo de kits", body: "El sábado a las 10:00." });
  });

  it.each([
    ["title", ""], ["title", "ab"], ["title", "x".repeat(121)], ["body", "  "], ["body", "x".repeat(2001)], ["tripId", "abc"],
  ])("rejects an invalid %s (%j)", (field, value) => {
    expect(issueFields(tripUpdateFormSchema.safeParse({ ...update, [field]: value }))).toEqual([field]);
  });

  it("requires an update id to delete", () => {
    expect(issueFields(tripUpdateIdSchema.safeParse({ updateId: "abc" }))).toEqual(["updateId"]);
  });
});
