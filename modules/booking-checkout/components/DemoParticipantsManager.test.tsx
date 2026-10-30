import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfirmActionState } from "@/components/shared/ConfirmActionButton";
import type { DemoParticipant } from "../services/demoParticipants.service";
import { DemoParticipantsManager } from "./DemoParticipantsManager";

afterEach(cleanup);
const active: DemoParticipant = {
  userId: "user_demo", email: "demo@example.test", note: "Jurado", grantedByEmail: "admin@example.test",
  grantedAt: new Date("2026-10-30T15:00:00Z"), revokedAt: null,
};
const revoked: DemoParticipant = {
  ...active, userId: "user_old", email: "old@example.test", note: null, revokedAt: new Date("2026-10-30T16:00:00Z"),
};
function actions() {
  const success = async (previous: ConfirmActionState, data: FormData): Promise<ConfirmActionState> => {
    void previous; void data;
    return { status: "success", message: "Participante dado de alta." };
  };
  return { grantAction: vi.fn(success), revokeAction: vi.fn(success) };
}

describe("DemoParticipantsManager", () => {
  it.each([
    ["off", "Checkout: apagado"], ["demo", "Checkout: demo (Stripe TEST)"], ["test", "Checkout: test"], ["live", "Checkout: live"],
  ] as const)("shows the %s Checkout mode without any detail", (status, label) => {
    render(<DemoParticipantsManager participants={[]} checkoutStatus={status} {...actions()} />);
    expect(screen.getByText(label)).not.toBeNull();
    expect(screen.queryByText("La lista solo tiene efecto con el modo demo activo.") === null).toBe(status === "demo");
  });
  it("lists active and revoked participants with who granted them and when", () => {
    render(<DemoParticipantsManager participants={[active, revoked]} checkoutStatus="demo" {...actions()} />);
    const activeRows = within(screen.getByRole("region", { name: "Participantes activos" })).getAllByRole("row");
    expect(activeRows).toHaveLength(2);
    expect(activeRows[1].textContent).toContain("demo@example.test");
    expect(activeRows[1].textContent).toContain("Jurado");
    expect(activeRows[1].textContent).toContain("admin@example.test");
    const revokedSection = screen.getByRole("region", { name: "Participantes dados de baja" });
    expect(within(revokedSection).getByText("old@example.test")).not.toBeNull();
    expect(within(revokedSection).getByRole("button", { name: "Dar de alta de nuevo" })).not.toBeNull();
  });
  it("submits the email and note only, and clears the form after a grant", async () => {
    const callbacks = actions();
    render(<DemoParticipantsManager participants={[]} checkoutStatus="demo" {...callbacks} />);
    const form = screen.getByRole("form", { name: "Alta de participante" });
    const email = within(form).getByLabelText("Correo verificado de la cuenta") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "demo@example.test" } });
    fireEvent.change(within(form).getByLabelText("Nota (opcional)"), { target: { value: "Jurado" } });
    fireEvent.submit(form);
    await waitFor(() => expect(callbacks.grantAction).toHaveBeenCalledTimes(1));
    const data = callbacks.grantAction.mock.calls[0][1];
    expect([...data.keys()].sort()).toEqual(["email", "note"]);
    expect(data.get("email")).toBe("demo@example.test");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Participante dado de alta."));
    expect(email.value).toBe("");
  });
  it("keeps the typed email and shows the error when the account does not exist", async () => {
    const callbacks = actions();
    callbacks.grantAction.mockResolvedValue({ status: "error", message: "La persona debe iniciar sesión una vez en el sitio." });
    render(<DemoParticipantsManager participants={[]} checkoutStatus="demo" {...callbacks} />);
    const form = screen.getByRole("form", { name: "Alta de participante" });
    const email = within(form).getByLabelText("Correo verificado de la cuenta") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "nadie@example.test" } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("La persona debe iniciar sesión una vez en el sitio."));
    expect(email.value).toBe("nadie@example.test");
  });
  it("revokes through the confirmation dialog with the user id only", async () => {
    const callbacks = actions();
    render(<DemoParticipantsManager participants={[active]} checkoutStatus="demo" {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Dar de baja" }));
    await waitFor(() => expect(callbacks.revokeAction).toHaveBeenCalledTimes(1));
    const data = callbacks.revokeAction.mock.calls[0][1];
    expect([...data.keys()]).toEqual(["userId"]);
    expect(data.get("userId")).toBe("user_demo");
  });
  it("re-grants a revoked participant through the grant action with its email", async () => {
    const callbacks = actions();
    render(<DemoParticipantsManager participants={[revoked]} checkoutStatus="demo" {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta de nuevo" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Dar de alta" }));
    await waitFor(() => expect(callbacks.grantAction).toHaveBeenCalledTimes(1));
    const data = callbacks.grantAction.mock.calls[0][1];
    expect(data.get("email")).toBe("old@example.test");
    expect(data.has("userId")).toBe(false);
  });
});
