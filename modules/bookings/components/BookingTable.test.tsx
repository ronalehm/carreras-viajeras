import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The trips barrel pulls server code; the table only needs its price format.
vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));

import type { CrmBookingListItem } from "../types/bookings.types";
import { BookingTable } from "./BookingTable";

const booking = (totalUsd: number, paidUsd: number): CrmBookingListItem => ({
  id: `b-${paidUsd}`, participantName: "Ana", participantEmail: "ana@example.com", status: "pending",
  packageLabel: "Paquete", totalUsd, paidUsd, linked: false, trip: { id: "t-1", title: "Maratón" },
});

describe("BookingTable", () => {
  it("shows a negative balance as credit", () => {
    render(<BookingTable bookings={[booking(1000, 400), booking(1000, 1100)]} filtered={false} />);
    expect(screen.getByText("US$ 600")).toBeTruthy();
    expect(screen.getByText("Saldo a favor US$ 100")).toBeTruthy();
  });
});
