import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/dates";

const { requirePermission, listProgramConfiguration, saveWelcomeDiscountAction } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listProgramConfiguration: vi.fn(),
  saveWelcomeDiscountAction: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission }));
vi.mock("../services/rewards.service", () => ({ listProgramConfiguration }));
vi.mock("../actions/welcomeDiscount.actions", () => ({ saveWelcomeDiscountAction }));
vi.mock("../actions/rewards.actions", () => ({
  createCatalogVersionAction: vi.fn(), createRewardRuleAction: vi.fn(),
  deactivateCatalogVersionAction: vi.fn(), deactivateRewardRuleAction: vi.fn(),
}));
import { RewardProgramAdmin, type WelcomeDiscountAdminData } from "./RewardProgramAdmin";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ id: "user_admin" });
  listProgramConfiguration.mockResolvedValue({ rules: [], catalog: [] });
});

async function renderAdmin(welcomeDiscount: WelcomeDiscountAdminData | null) {
  render(await RewardProgramAdmin({ welcomeDiscount }));
  return screen.getByRole("region", { name: "Descuento de bienvenida" });
}

const versions = Array.from({ length: 6 }, (_, index) => ({
  id: `v${6 - index}`, amountUsd: 60 - index * 10, validityDays: 30 - index, active: index === 0,
  createdAt: new Date(Date.UTC(2026, 9, 20 - index, 15, 0)).toISOString(),
}));

describe("RewardProgramAdmin welcome discount", () => {
  it("shows the active version, preloads the form and lists the last five versions in Lima time", async () => {
    const section = await renderAdmin({ active: { id: "v6", amountUsd: 60, validityDays: 30 }, versions });
    expect(within(section).getByText("Activo: US$ 60, válido 30 días")).toBeTruthy();
    expect((within(section).getByRole("spinbutton", { name: "Importe en US$" }) as HTMLInputElement).value).toBe("60");
    expect((within(section).getByRole("spinbutton", { name: "Vigencia en días" }) as HTMLInputElement).value).toBe("30");
    expect((within(section).getByRole("checkbox", { name: "Activo" }) as HTMLInputElement).checked).toBe(true);
    const rows = within(within(section).getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))[0])
      .toEqual([formatDateTime(new Date(versions[0].createdAt)), "US$ 60", "30 días", "Activa"]);
    expect(within(rows[1]).getByText("Inactiva")).toBeTruthy();
    expect(within(section).queryByText("US$ 10")).toBeNull();
    expect(requirePermission).toHaveBeenCalledWith("rewards.manage");
  });

  it("shows «Desactivado» and an empty form when there is no active version", async () => {
    const section = await renderAdmin({ active: null, versions: [{ ...versions[1], validityDays: 1, active: false }] });
    expect(within(section).getByText("Desactivado")).toBeTruthy();
    expect((within(section).getByRole("spinbutton", { name: "Importe en US$" }) as HTMLInputElement).value).toBe("");
    expect((within(section).getByRole("checkbox", { name: "Activo" }) as HTMLInputElement).checked).toBe(false);
    expect(within(section).getAllByRole("row")).toHaveLength(2);
    expect(within(section).getByText("1 día")).toBeTruthy();
    expect(within(section).getByText("Inactiva")).toBeTruthy();
  });

  it("shows an empty history and a fixed alert when the data could not be loaded", async () => {
    let section = await renderAdmin({ active: null, versions: [] });
    expect(within(section).getByText("Todavía no hay versiones guardadas.")).toBeTruthy();
    expect(within(section).queryByRole("table")).toBeNull();
    cleanup();
    section = await renderAdmin(null);
    expect(within(section).getByRole("alert").textContent).toBe("No se pudo cargar el descuento de bienvenida. Vuelve a intentarlo.");
    expect(within(section).queryByRole("button", { name: "Guardar" })).toBeNull();
  });
});
