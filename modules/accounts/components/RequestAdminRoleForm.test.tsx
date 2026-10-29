import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleRequestActionState } from "../types/roleRequest.types";

const { requestAdminRoleAction } = vi.hoisted(() => ({
  requestAdminRoleAction: vi.fn<(prev: RoleRequestActionState, formData: FormData) => Promise<RoleRequestActionState>>(),
}));

vi.mock("../actions/roleRequest.actions", () => ({ requestAdminRoleAction }));

import { RequestAdminRoleForm } from "./RequestAdminRoleForm";

const BUTTON = "Solicitar rol de administrador";
const SUCCESS = "Solicitud enviada. Un super administrador la revisará.";

beforeEach(() => {
  vi.clearAllMocks();
  requestAdminRoleAction.mockResolvedValue({ status: "success", message: SUCCESS });
});
afterEach(cleanup);

describe("RequestAdminRoleForm", () => {
  it("shows only the request button while idle", () => {
    render(<RequestAdminRoleForm />);

    expect(screen.getByRole("button", { name: BUTTON })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(requestAdminRoleAction).not.toHaveBeenCalled();
  });

  it("calls the action once with an empty form and shows the success message instead of the button", async () => {
    render(<RequestAdminRoleForm />);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));

    expect((await screen.findByRole("status")).textContent).toBe(SUCCESS);
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
    expect(requestAdminRoleAction).toHaveBeenCalledOnce();
    const [prev, formData] = requestAdminRoleAction.mock.calls[0];
    expect(prev).toEqual({ status: "idle" });
    expect([...formData.keys()]).toEqual([]);
  });

  it("disables the button while the request is being sent", async () => {
    let finish!: (state: RoleRequestActionState) => void;
    requestAdminRoleAction.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<RequestAdminRoleForm />);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));

    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "Enviando…" }).disabled).toBe(true),
    );
    await act(async () => finish({ status: "success", message: SUCCESS }));
    expect((await screen.findByRole("status")).textContent).toBe(SUCCESS);
  });

  it("shows the error and keeps the button to retry", async () => {
    requestAdminRoleAction
      .mockResolvedValueOnce({
        status: "error",
        code: "already_has_access",
        message: "Tu cuenta ya tiene acceso al CRM. Recarga la página.",
      })
      .mockResolvedValueOnce({ status: "success", message: SUCCESS });
    render(<RequestAdminRoleForm />);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Tu cuenta ya tiene acceso al CRM. Recarga la página.",
    );
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));

    expect((await screen.findByRole("status")).textContent).toBe(SUCCESS);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requestAdminRoleAction).toHaveBeenCalledTimes(2);
  });
});
