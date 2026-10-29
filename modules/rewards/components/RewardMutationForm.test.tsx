import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RewardActionState } from "../types/rewards.types";
import { RewardMutationForm } from "./RewardMutationForm";

afterEach(cleanup);
describe("RewardMutationForm", () => {
  it("keeps a UUID for retries and rerenders, then requires an explicit new attempt", async () => {
    const action = vi.fn<(previous: RewardActionState, data: FormData) => Promise<RewardActionState>>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue({ status: "success", message: "Canje reservado." });
    const props = { action, hidden: { catalogVersionId: "catalog-id" }, label: "Canjear estrellas", idempotent: true };
    const { rerender } = render(<RewardMutationForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Canjear estrellas" }));
    await screen.findByRole("alert");
    const firstKey = action.mock.calls[0][1].get("requestKey");
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    rerender(<RewardMutationForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Canjear estrellas" }));
    await screen.findByRole("status");
    expect(action.mock.calls[1][1].get("requestKey")).toBe(firstKey);
    fireEvent.click(screen.getByRole("button", { name: "Canjear estrellas" }));
    expect(action).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Solicitar otro canje" }));
    fireEvent.click(screen.getByRole("button", { name: "Canjear estrellas" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(action.mock.calls[2][1].get("requestKey")).not.toBe(firstKey);
    expect(action.mock.calls[2][1].get("catalogVersionId")).toBe("catalog-id");
  });
  it("preserves input and displays associated field errors on rejection", async () => {
    const action = vi.fn().mockResolvedValue({ status: "error", code: "invalid_input", message: "Revisa los datos.", fieldErrors: { code: ["El código no es válido."] } });
    render(<RewardMutationForm action={action} label="Aceptar" fields={[{ name: "code", label: "Código" }]} />);
    const input = screen.getByRole("textbox", { name: "Código" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "not-a-valid-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    await screen.findByText("El código no es válido.");
    expect(input.value).toBe("not-a-valid-code"); expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe("El código no es válido.");
  });
  it("starts business numbers blank and activation unchecked", () => {
    render(<RewardMutationForm action={vi.fn()} label="Crear" fields={[{ name: "costStars", label: "Estrellas", type: "number" }, { name: "active", label: "Activar", type: "checkbox" }]} />);
    expect((screen.getByRole("spinbutton", { name: "Estrellas" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("checkbox", { name: "Activar" }) as HTMLInputElement).checked).toBe(false);
  });
  it("cannot submit disabled or pending forms twice", async () => {
    const action = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { rerender } = render(<RewardMutationForm action={action} label="Canjear" disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Canjear" })); expect(action).not.toHaveBeenCalled();
    rerender(<RewardMutationForm action={action} label="Canjear" />);
    fireEvent.click(screen.getByRole("button", { name: "Canjear" }));
    await screen.findByRole("button", { name: "Procesando…" });
    fireEvent.click(screen.getByRole("button", { name: "Procesando…" })); expect(action).toHaveBeenCalledTimes(1);
  });
});
