import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));
vi.mock("@/modules/landing", () => import("@/modules/landing/utils/inquiry"));

import { BookingOverview, BookingPayments } from "./BookingOverview";

afterEach(cleanup);

const trip = {
  title: "Maratón de Santiago 2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-05-16",
  startDate: null,
  endDate: null,
  includes: [],
};

describe("BookingOverview", () => {
  it("shows a simulated booking to the runner as a real one", () => {
    render(<BookingOverview detail={{ status: "confirmed", trip }} today="2026-10-30" />);
    expect(screen.queryByText("SIMULADA")).toBeNull();
    expect(screen.queryByText(/demostración/)).toBeNull();
  });
});

describe("BookingPayments", () => {
  const detail = {
    totalUsd: 11000,
    paidUsd: 300,
    balanceDueOn: null,
    payments: [{ id: "set-1", amountUsd: 300, paidOn: "2026-10-30", concept: "Stripe - tarjeta" }],
  };

  it("uses the common paid amount and announces a payment in review", () => {
    render(<BookingPayments detail={{ ...detail, paymentInReview: true }} />);
    expect(screen.getByText("US$ 10,700")).toBeTruthy();
    expect(screen.getByText("Pago en revisión")).toBeTruthy();
  });

  it("shows no review notice otherwise", () => {
    render(<BookingPayments detail={{ ...detail, paymentInReview: false }} />);
    expect(screen.queryByText("Pago en revisión")).toBeNull();
  });
});
