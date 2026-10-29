import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../actions/payments.actions", () => ({ addPaymentAction: vi.fn() }));
import { addPaymentAction } from "../actions/payments.actions";
import { PaymentForm } from "./PaymentForm";
const bookingId = "11111111-1111-4111-8111-111111111111";
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
describe("payment receipt idempotency", () => {
  it("reuses the request key after validation errors", async () => {
    vi.mocked(addPaymentAction).mockResolvedValue({ status: "error", code: "invalid_input", message: "Revisa el importe." });
    render(<PaymentForm bookingId={bookingId} />);
    submit();
    await screen.findByRole("alert");
    const first = vi.mocked(addPaymentAction).mock.calls[0][1].get("requestKey");
    expect(first).toMatch(/^[a-f0-9-]{36}$/);
    submit();
    await waitFor(() => expect(addPaymentAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(addPaymentAction).mock.calls[1][1].get("requestKey")).toBe(first);
  });
  it("requires an explicit new receipt and rotates its key after success", async () => {
    vi.mocked(addPaymentAction).mockResolvedValue({ status: "success", message: "Pago registrado." });
    render(<PaymentForm bookingId={bookingId} />);
    submit();
    await screen.findByRole("status");
    const first = vi.mocked(addPaymentAction).mock.calls[0][1].get("requestKey");
    expect(screen.queryByRole("button", { name: "Registrar pago" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Registrar otro pago" }));
    submit();
    await waitFor(() => expect(addPaymentAction).toHaveBeenCalledTimes(2));
    const second = vi.mocked(addPaymentAction).mock.calls[1][1];
    expect(second.get("requestKey")).not.toBe(first);
    expect(second.get("bookingId")).toBe(bookingId);
  });
});
