import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrmSettings } from "./CrmSettings";

const { getCrmAccess, redirect } = vi.hoisted(() => ({
  getCrmAccess: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/modules/accounts", async () => ({
  getCrmAccess,
  CrmSettings: (await import("./CrmSettings")).CrmSettings,
}));
import CrmSettingsPage from "@/app/crm/(protected)/configuraciones/page";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("CRM settings", () => {
  it("shows the session identity and existing destinations, without credential inputs", () => {
    const { container } = render(
      <CrmSettings
        email="equipo@example.test"
        roles={["admin", "commercial"]}
      />,
    );
    expect(screen.getByText("equipo@example.test")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("Comercial")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Gestionar usuarios" })
        .getAttribute("href"),
    ).toBe("/crm/admin/usuarios");
    expect(
      screen
        .getByRole("link", { name: "Ver sitio público" })
        .getAttribute("href"),
    ).toBe("/");
    expect(container.querySelector("input, form")).toBeNull();
    expect(container.textContent).not.toMatch(
      /DATABASE_URL|SECRET|TOKEN|postgresql:/,
    );
  });

  it("checks staff.manage again when serving the settings route", async () => {
    getCrmAccess.mockResolvedValue({
      status: "ok",
      user: { email: "admin@example.test", staffRoles: ["admin"] },
    });
    render(await CrmSettingsPage());
    expect(getCrmAccess).toHaveBeenCalledWith("staff.manage");
    expect(screen.getByText("admin@example.test")).toBeTruthy();
  });

  it("denies the route without displaying administrative account details", async () => {
    getCrmAccess.mockResolvedValue({ status: "forbidden" });
    render(await CrmSettingsPage());
    expect(getCrmAccess).toHaveBeenCalledWith("staff.manage");
    expect(
      screen.getByText(
        "No tienes permiso para administrar la configuración del equipo.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Gestionar usuarios" }),
    ).toBeNull();
  });

  it("redirects an unauthenticated request to the existing login route", async () => {
    getCrmAccess.mockResolvedValue({ status: "unauthenticated" });
    await expect(CrmSettingsPage()).rejects.toThrow("redirect:/crm/acceso");
  });
});
