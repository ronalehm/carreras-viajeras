import type { AnchorHTMLAttributes } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/crm", search: "" }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));
vi.mock("next/link", () => ({
  default: ({
    onNavigate,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: () => void }) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onNavigate?.();
      }}
    />
  ),
}));
vi.mock("./SignOutButton", () => ({
  SignOutButton: () => <button>Cerrar sesión</button>,
}));

import { CrmShell } from "./CrmShell";
import type { StaffRole } from "@/lib/auth/permissions";

beforeEach(() => {
  location.pathname = "/crm";
  location.search = "";
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function shell(roles: StaffRole[] = ["admin"]) {
  return render(
    <CrmShell email="equipo@example.test" roles={roles}>
      <p>Contenido del CRM</p>
    </CrmShell>,
  );
}

function selected() {
  return within(screen.getByRole("navigation", { name: "CRM" }))
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
}

describe("CRM navigation", () => {
  it.each([
    ["/crm", "", "Dashboard"],
    ["/crm/leads", "", "Leads"],
    ["/crm/leads/nuevo", "", "Leads"],
    ["/crm/leads/un-lead/editar", "", "Leads"],
    [
      "/crm/leads",
      "seguimiento=pendientes&pagina=2&responsable=mios",
      "Mis pendientes",
    ],
    ["/crm/leads", "responsable=mios&seguimiento=vencidos", "Leads"],
    ["/crm/viajes/un-viaje", "", "Viajes"],
    ["/crm/ofertas/nueva", "", "Ofertas"],
    ["/crm/admin/usuarios", "", "Usuarios"],
    ["/crm/admin/patrocinadores/una-marca", "", "Patrocinadores"],
    ["/crm/configuraciones", "", "Configuraciones"],
  ])(
    "selects only the appropriate item on %s?%s",
    (pathname, search, label) => {
      location.pathname = pathname;
      location.search = search;
      shell();
      expect(selected()).toEqual([label]);
    },
  );

  it("does not match a different route by a partial segment", () => {
    location.pathname = "/crm/viajes-otro";
    shell();
    expect(selected()).toEqual([]);
  });

  it("exposes management links for admins and preserves the account and logout", () => {
    shell();
    expect(
      screen.getByRole("link", { name: "Usuarios" }).getAttribute("href"),
    ).toBe("/crm/admin/usuarios");
    expect(
      screen
        .getByRole("link", { name: "Configuraciones" })
        .getAttribute("href"),
    ).toBe("/crm/configuraciones");
    expect(
      screen.getByRole("link", { name: "Patrocinadores" }).getAttribute("href"),
    ).toBe("/crm/admin/patrocinadores");
    expect(screen.getByText("equipo@example.test")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
  });

  it("keeps commercial destinations and excludes admin-only navigation", () => {
    shell(["commercial"]);
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Patrocinadores" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Configuraciones" })).toBeNull();
    for (const name of [
      "Dashboard",
      "Leads",
      "Mis pendientes",
      "Campañas",
      "Viajes",
      "Ofertas",
      "Reservas",
    ])
      expect(screen.getByRole("link", { name })).toBeTruthy();
  });

  it("preserves organizer destinations without exposing staff or sponsor management", () => {
    shell(["organizer"]);
    expect(screen.getByRole("link", { name: "Viajes" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Patrocinadores" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reservas" })).toBeNull();
  });

  it("exposes sponsor management to super admins", () => {
    shell(["super_admin"]);
    expect(screen.getByRole("link", { name: "Patrocinadores" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Usuarios" })).toBeTruthy();
  });

  it("opens the mobile dialog, closes with Escape and restores focus", async () => {
    shell();
    const trigger = screen.getByRole("button", { name: "Abrir menú del CRM" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Carreras Viajeras · CRM",
    });
    expect(
      within(dialog).getByRole("link", { name: "Configuraciones" }),
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? dialog, {
      key: "Escape",
      code: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes the mobile dialog when following a navigation link", async () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú del CRM" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("link", { name: "Usuarios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers an explicit close control on mobile", async () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú del CRM" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar menú" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
