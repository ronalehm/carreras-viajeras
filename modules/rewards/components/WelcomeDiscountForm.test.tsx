import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RewardActionState } from "../types/rewards.types";
import { WelcomeDiscountForm } from "./WelcomeDiscountForm";

afterEach(cleanup);

const amount = () => screen.getByRole("spinbutton", { name: "Importe en US$" }) as HTMLInputElement;
const validity = () => screen.getByRole("spinbutton", { name: "Vigencia en días" }) as HTMLInputElement;
const active = () => screen.getByRole("checkbox", { name: "Activo" }) as HTMLInputElement;

describe("WelcomeDiscountForm", () => {
  it("preloads the active version and sends amount, validity and the active checkbox", async () => {
    const action = vi.fn<(previous: RewardActionState, data: FormData) => Promise<RewardActionState>>()
      .mockResolvedValue({ status: "success", message: "Descuento de bienvenida guardado." });
    render(<WelcomeDiscountForm action={action} current={{ id: "v1", amountUsd: 50, validityDays: 30 }} />);
    expect(amount().value).toBe("50");
    expect(validity().value).toBe("30");
    expect(active().checked).toBe(true);
    expect(screen.getByText("Cada cambio crea una versión nueva; los códigos ya emitidos conservan su importe y caducidad.")).toBeTruthy();
    fireEvent.change(amount(), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    // The live region renders empty before the action resolves; wait for its message, not its presence.
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Descuento de bienvenida guardado."));
    const data = action.mock.calls[0][1];
    expect(Object.fromEntries(data)).toEqual({ amountUsd: "75", validityDays: "30", active: "on" });
    expect(amount().value).toBe("75");
  });

  it("starts empty and unchecked when there is no active version, and omits active when unchecked", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success", message: "Descuento de bienvenida desactivado." });
    render(<WelcomeDiscountForm action={action} current={null} />);
    expect(amount().value).toBe("");
    expect(validity().value).toBe("");
    expect(active().checked).toBe(false);
    fireEvent.change(amount(), { target: { value: "20" } });
    fireEvent.change(validity(), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][1].has("active")).toBe(false);
  });

  it("keeps the input and associates field errors on rejection", async () => {
    const action = vi.fn().mockResolvedValue({
      status: "error", code: "invalid_input", message: "Revisa los datos del formulario.",
      fieldErrors: { amountUsd: ["Introduce el importe en US$ como un entero entre 1 y 10 000."], validityDays: ["Introduce la vigencia en días, entre 1 y 365."] },
    });
    render(<WelcomeDiscountForm action={action} current={null} />);
    fireEvent.change(amount(), { target: { value: "20000" } });
    fireEvent.change(validity(), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Introduce el importe en US$ como un entero entre 1 y 10 000.");
    expect(amount().value).toBe("20000");
    expect(amount().getAttribute("aria-invalid")).toBe("true");
    expect(amount().getAttribute("aria-describedby")?.split(" ").map((id) => document.getElementById(id)?.textContent))
      .toContain("Introduce el importe en US$ como un entero entre 1 y 10 000.");
    expect(validity().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByRole("alert").map((node) => node.textContent)).toContain("Revisa los datos del formulario.");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("shows a fixed message when the action throws", async () => {
    const action = vi.fn().mockRejectedValue(new Error("SELECT secret"));
    render(<WelcomeDiscountForm action={action} current={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo guardar el descuento de bienvenida. Inténtalo de nuevo.");
  });
});
