import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));
vi.mock("../actions/payments.actions", () => ({ voidPaymentAction: vi.fn() }));

import type { BookingBalance, CrmPayment } from "../types/bookings.types";
import { PaymentTable } from "./PaymentTable";

afterEach(cleanup);

const manual: CrmPayment = {
  id: "pay-1", amountUsd: 300, paidOn: "2026-03-03", concept: "Reserva", recordedByEmail: "staff@example.com", voided: false,
};
const balance: BookingBalance = {
  totalUsd: 1499,
  paidUsd: 500,
  balanceUsd: 999,
  stripePayments: [{ id: "set-1", amountUsd: 200, paidOn: "2026-03-05" }],
  needsReview: [{ id: "set-2", amountUsd: 100, paidOn: "2026-03-07" }],
};

describe("PaymentTable", () => {
  it("lists Stripe settlements with source Stripe, marks the ones in review and takes the totals from the balance", () => {
    render(<PaymentTable payments={[manual]} balance={balance} editable />);

    const [, manualRow, stripeRow, reviewRow] = screen.getAllByRole("row");
    expect(within(manualRow).getByText("staff@example.com")).toBeTruthy();
    expect(within(manualRow).getByRole("button", { name: "Anular" })).toBeTruthy();
    expect(within(stripeRow).getByText("Stripe")).toBeTruthy();
    expect(within(stripeRow).getByText("Vigente")).toBeTruthy();
    // Stripe payments are not manual copies: they cannot be voided from the CRM.
    expect(within(stripeRow).queryByRole("button")).toBeNull();
    expect(within(reviewRow).getByText("En revisión")).toBeTruthy();

    const totals = screen.getByText("Pagado").parentElement!;
    expect(within(totals).getByText("US$ 500")).toBeTruthy();
    expect(screen.getByText("US$ 999")).toBeTruthy();
    expect(within(screen.getByText("En revisión (no suma)").parentElement!).getByText("US$ 100")).toBeTruthy();
  });

  it("shows no review total when nothing is in review", () => {
    render(<PaymentTable payments={[]} balance={{ ...balance, needsReview: [] }} editable={false} />);
    expect(screen.queryByText("En revisión (no suma)")).toBeNull();
  });
});
