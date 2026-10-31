import type { AnchorHTMLAttributes, ReactElement } from "react";
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
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs", async () => {
  const { cloneElement } = await import("react");
  return {
    // Same contract as Clerk: the child receives the sign-out click handler.
    SignOutButton: ({
      children,
      redirectUrl,
    }: {
      children: ReactElement<{ onClick?: () => void }>;
      redirectUrl: string;
    }) => cloneElement(children, { onClick: () => signOut(redirectUrl) }),
  };
});

import { CrmShell } from "./CrmShell";
import type { StaffRole } from "@/lib/auth/permissions";

beforeEach(() => {
  signOut.mockClear();
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

function sidebar() {
  return within(screen.getByRole("complementary", { name: "Panel del CRM" }));
}

async function openAccountMenu(scope: ReturnType<typeof within> = sidebar()) {
  fireEvent.click(scope.getByRole("button", { name: /Menú de cuenta/ }));
  return screen.findByRole("menu");
}

describe("CRM navigation", () => {
  it.each([
    ["/crm", "", "Dashboard"],
    ["/crm/leads", "", "Leads"],
    ["/crm/leads/nuevo", "", "Leads"],
    ["/crm/leads/un-lead/editar", "", "Leads"],
    ["/crm/leads", "seguimiento=pendientes&pagina=2&responsable=mios", "Leads"],
    ["/crm/viajes", "", "Carreras"],
    ["/crm/viajes/un-viaje", "", "Carreras"],
    ["/crm/ofertas/nueva", "", "Ofertas"],
    ["/crm/contratos", "", "Contratos"],
    ["/crm/contenidos/nuevo", "", "Contenidos"],
    ["/crm/recompensas", "", "Recompensas"],
    ["/crm/admin/usuarios", "", "Usuarios"],
    ["/crm/admin/patrocinadores/una-marca", "", "Patrocinadores"],
  ])(
    "selects only the appropriate item on %s?%s",
    (pathname, search, label) => {
      location.pathname = pathname;
      location.search = search;
      shell();
      expect(selected()).toEqual([label]);
    },
  );

  it.each(["/crm/viajes-otro", "/crm/configuraciones"])(
    "selects no navigation item on %s",
    (pathname) => {
      location.pathname = pathname;
      shell();
      expect(selected()).toEqual([]);
    },
  );

  it("removes «Mis pendientes», «Configuraciones» and «Viajes» from the navigation", () => {
    shell(["super_admin"]);
    const nav = within(screen.getByRole("navigation", { name: "CRM" }));
    for (const name of ["Mis pendientes", "Configuraciones", "Viajes"])
      expect(nav.queryByRole("link", { name })).toBeNull();
    expect(nav.getByRole("link", { name: "Carreras" }).getAttribute("href")).toBe(
      "/crm/viajes",
    );
  });

  it("exposes management links for admins", () => {
    shell();
    expect(screen.getByRole("link", { name: "Contenidos" }).getAttribute("href")).toBe("/crm/contenidos");
    expect(screen.getByRole("link", { name: "Recompensas" }).getAttribute("href")).toBe("/crm/recompensas");
    expect(screen.getByRole("link", { name: "Contratos" }).getAttribute("href")).toBe("/crm/contratos");
    expect(
      screen.getByRole("link", { name: "Usuarios" }).getAttribute("href"),
    ).toBe("/crm/admin/usuarios");
    expect(
      screen.getByRole("link", { name: "Patrocinadores" }).getAttribute("href"),
    ).toBe("/crm/admin/patrocinadores");
  });

  it("keeps commercial destinations and excludes admin-only navigation", () => {
    shell(["commercial"]);
    expect(screen.queryByRole("link", { name: "Contenidos" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Recompensas" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Contratos" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Patrocinadores" })).toBeNull();
    for (const name of [
      "Dashboard",
      "Leads",
      "Campañas",
      "Carreras",
      "Ofertas",
      "Reservas",
    ])
      expect(screen.getByRole("link", { name })).toBeTruthy();
  });

  it("preserves organizer destinations without exposing staff or sponsor management", () => {
    shell(["organizer"]);
    expect(screen.getByRole("link", { name: "Carreras" })).toBeTruthy();
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
    expect(within(dialog).getByRole("link", { name: "Carreras" })).toBeTruthy();
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

describe("CRM account menu", () => {
  it("shows the avatar initial, email and roles on a single trigger", () => {
    shell(["admin", "commercial"]);
    const trigger = sidebar().getByRole("button", { name: /Menú de cuenta/ });
    expect(trigger.textContent).toContain("E");
    expect(trigger.textContent).toContain("equipo@example.test");
    expect(trigger.textContent).toContain("Admin, Comercial");
    expect(sidebar().queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
  });

  it("lists the account header, profile, settings and sign-out for staff managers", async () => {
    shell(["admin"]);
    const menu = within(await openAccountMenu());
    expect(menu.getByText("equipo@example.test")).toBeTruthy();
    expect(menu.getByText("Admin")).toBeTruthy();
    expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Ver perfil", "Configuraciones", "Cerrar sesión"]);
    expect(menu.getByRole("menuitem", { name: "Ver perfil" }).getAttribute("href")).toBe(
      "/cuenta/perfil",
    );
    expect(
      menu.getByRole("menuitem", { name: "Configuraciones" }).getAttribute("href"),
    ).toBe("/crm/configuraciones");
  });

  it.each([["commercial"], ["organizer"]] as const)(
    "hides settings without the staff management permission (%s)",
    async (role) => {
      shell([role]);
      const menu = within(await openAccountMenu());
      expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
        "Ver perfil",
        "Cerrar sesión",
      ]);
    },
  );

  it("signs out with Clerk towards the CRM access page", async () => {
    shell();
    const menu = within(await openAccountMenu());
    fireEvent.click(menu.getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(signOut).toHaveBeenCalledWith("/crm/acceso");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("closes with Escape and returns focus to the avatar", async () => {
    shell();
    const trigger = sidebar().getByRole("button", { name: /Menú de cuenta/ });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("works inside the mobile drawer and closes it when opening the profile", async () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú del CRM" }));
    const dialog = within(await screen.findByRole("dialog"));
    const menu = within(await openAccountMenu(dialog));
    fireEvent.click(menu.getByRole("menuitem", { name: "Ver perfil" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes only the account menu with Escape inside the mobile drawer", async () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú del CRM" }));
    const dialog = within(await screen.findByRole("dialog"));
    const menu = await openAccountMenu(dialog);
    fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
