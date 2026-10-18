// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bookingStatusEnum, itineraryKindEnum, itineraryStatusEnum } from "@/lib/db-schema";
import {
  bookingFormSchema,
  bookingStatusChangeSchema,
  bookingStatusSchema,
  itineraryKindSchema,
  itineraryStatusSchema,
  updateBookingSchema,
} from "./bookings.schema";

const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";

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
  it("requires the booking id and drops the trip", () => {
    const result = updateBookingSchema.parse({ ...validForm, bookingId: BOOKING_ID });
    expect(result).toMatchObject({ bookingId: BOOKING_ID, participantEmail: "ana@example.com" });
    expect(result).not.toHaveProperty("tripId");
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
