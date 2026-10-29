import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountStatusActionState } from "../types/accountStatus.types";

type Action = (prev: AccountStatusActionState, formData: FormData) => Promise<AccountStatusActionState>;

const actions = vi.hoisted(() => ({
  disableAccountAction: vi.fn<Action>(),
  reactivateAccountAction: vi.fn<Action>(),
  deleteAccountAction: vi.fn<Action>(),
  retryClerkSyncAction: vi.fn<Action>(),
}));

vi.mock("../actions/accountStatus.actions", () => actions);

import { AccountStatusSection } from "./AccountStatusSection";

const USER_ID = "user_target";
const EMAIL = "ana@correo.com";
const PARTIAL = "Cuenta desactivada en la aplicación, pero no se pudo bloquear en Clerk. Reintenta.";

function buttonNames() {
  return screen.getAllByRole("button").map((button) => button.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) {
    action.mockResolvedValue({ status: "success", message: "Hecho." });
  }
});
afterEach(cleanup);

describe("AccountStatusSection", () => {
  it.each([
    ["active", ["Desactivar", "Eliminar definitivamente"]],
    ["disabled", ["Reactivar", "Eliminar definitivamente", "Reintentar en Clerk"]],
    ["deleted", ["Reintentar en Clerk"]],
  ] as const)("a %s account shows %j", (status, expected) => {
    render(<AccountStatusSection userId={USER_ID} email={EMAIL} status={status} />);
    expect(buttonNames()).toEqual(expected);
  });

  it("disables with the account id and the texts of the spec", async () => {
    render(<AccountStatusSection userId={USER_ID} email={EMAIL} status="active" />);
    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(`¿Desactivar la cuenta de ${EMAIL}?`)).toBeTruthy();
    expect(
      within(dialog).getByText("Perderá todos sus roles y no podrá iniciar sesión. Podrás reactivarla."),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(actions.disableAccountAction).toHaveBeenCalledOnce());
    expect(Object.fromEntries(actions.disableAccountAction.mock.calls[0][1])).toEqual({ userId: USER_ID });
  });

  it("keeps a partial Clerk failure visible after the page re-renders with the new status", async () => {
    actions.disableAccountAction.mockResolvedValue({ status: "error", code: "clerk_failed", message: PARTIAL });
    const { rerender } = render(<AccountStatusSection userId={USER_ID} email={EMAIL} status="active" />);
    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(actions.disableAccountAction).toHaveBeenCalledOnce());

    // revalidatePath re-renders the page: the account is now disabled and the dialog is gone.
    rerender(<AccountStatusSection userId={USER_ID} email={EMAIL} status="disabled" />);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("alert").textContent).toBe(PARTIAL);
    expect(screen.getByRole("button", { name: "Reintentar en Clerk" })).toBeTruthy();
  });

  it("offers the retry on an active account only after a failed reactivation", async () => {
    actions.reactivateAccountAction.mockResolvedValue({
      status: "error",
      code: "clerk_failed",
      message: "Cuenta reactivada en la aplicación, pero no se pudo desbloquear en Clerk. Reintenta.",
    });
    const { rerender } = render(<AccountStatusSection userId={USER_ID} email={EMAIL} status="disabled" />);
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reactivar" }));
    await waitFor(() => expect(actions.reactivateAccountAction).toHaveBeenCalledOnce());

    rerender(<AccountStatusSection userId={USER_ID} email={EMAIL} status="active" />);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(buttonNames()).toEqual(["Desactivar", "Eliminar definitivamente", "Reintentar en Clerk"]);
  });

  it("deletes with the typed confirmation email and shows the server error in the dialog", async () => {
    actions.deleteAccountAction.mockResolvedValue({
      status: "error",
      code: "email_mismatch",
      message: "El correo no coincide.",
    });
    render(<AccountStatusSection userId={USER_ID} email={EMAIL} status="active" />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(`¿Eliminar definitivamente la cuenta de ${EMAIL}?`)).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Se borrarán su perfil de runner y su cuenta de Clerk, y sus reservas quedarán sin vincular. No se puede deshacer.",
      ),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Escribe el correo de la cuenta para confirmar"), {
      target: { value: "otra@correo.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar definitivamente" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe("El correo no coincide.");
    expect(Object.fromEntries(actions.deleteAccountAction.mock.calls[0][1])).toEqual({
      userId: USER_ID,
      confirmEmail: "otra@correo.com",
    });
  });
});
