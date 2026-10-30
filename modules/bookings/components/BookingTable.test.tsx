import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// @/modules/trips also re-exports server code (services, actions); only the real formatter is needed.
vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));

import type { CrmBookingListItem } from "../types/bookings.types";
import { BookingTable, SimulatedBookingBadge } from "./BookingTable";

afterEach(cleanup);

function booking(overrides: Partial<CrmBookingListItem>): CrmBookingListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    participantName: "Ana Pérez",
    participantEmail: "ana@example.com",
    status: "confirmed",
    packageLabel: "Paquete corredor",
    totalUsd: 1499,
    paidUsd: 500,
    balanceUsd: 999,
    paymentInReview: false,
    simulated: false,
    linked: true,
    trip: { id: "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91", title: "Maratón de Santiago 2027" },
    ...overrides,
  };
}

describe("SimulatedBookingBadge", () => {
  it("marks a simulated booking and renders nothing for a real one", () => {
    const { container, rerender } = render(<SimulatedBookingBadge simulated={false} />);
    expect(container.textContent).toBe("");
    rerender(<SimulatedBookingBadge simulated />);
    expect(screen.getByText("SIMULADA")).toBeTruthy();
  });
});

describe("BookingTable", () => {
  it("shows the common balance and the SIMULADA distinctive only on simulated rows", () => {
    render(
      <BookingTable
        filtered
        bookings={[
          booking({}),
          booking({ id: "33333333-3333-4333-8333-333333333333", participantName: "Demo Uno", simulated: true, totalUsd: 11000, paidUsd: 300, balanceUsd: 10700 }),
        ]}
      />,
    );
    const [, real, simulated] = screen.getAllByRole("row");
    expect(within(real).queryByText("SIMULADA")).toBeNull();
    expect(within(real).getByText("US$ 999")).toBeTruthy();
    expect(within(simulated).getByText("SIMULADA")).toBeTruthy();
    expect(within(simulated).getByText("US$ 10,700")).toBeTruthy();
  });

  it("flags a Stripe payment in review next to the balance", () => {
    render(<BookingTable filtered={false} bookings={[booking({ paymentInReview: true })]} />);
    expect(screen.getByText("Pago en revisión")).toBeTruthy();
  });
});
