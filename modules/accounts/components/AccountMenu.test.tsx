import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useUser, signOutProps } = vi.hoisted(() => ({
  useUser: vi.fn(),
  signOutProps: vi.fn(),
}));

vi.mock("@clerk/nextjs", async () => {
  const { cloneElement } = await import("react");
  return {
    useUser,
    // Same contract as Clerk's: it wraps its single child and adds the sign-out click.
    SignOutButton: ({ children, ...props }: { children: ReactElement<{ onClick?: () => void }> }) => {
      signOutProps(props);
      return cloneElement(children, { onClick: () => signOutProps("clicked") });
    },
  };
});

import { AccountMenu } from "./AccountMenu";

const fetchMock = vi.fn();

function userState(state: { isLoaded: boolean; isSignedIn?: boolean; user?: unknown }) {
  useUser.mockReturnValue({ isSignedIn: undefined, user: undefined, ...state });
}

function signedInAs(id: string, user: Record<string, unknown> = {}) {
  userState({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id,
      firstName: "Ana",
      fullName: "Ana Ríos",
      hasImage: true,
      imageUrl: "https://img.clerk.com/ana.png",
      primaryEmailAddress: { emailAddress: "ana@example.com" },
      ...user,
    },
  });
}

function renderMenu(node: ReactNode = <AccountMenu fallback={<a href="/cuenta">Ingresar</a>} />) {
  const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return {
    ...view,
    rerender: (next: ReactNode) =>
      view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>),
  };
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de la cuenta" }));
  return screen.findByRole("menu");
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountMenu", () => {
  it("shows the visitor fallback without a session and asks nothing", () => {
    userState({ isLoaded: true, isSignedIn: false, user: null });
    renderMenu();

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abrir menú de la cuenta" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the fallback in place while Clerk loads", () => {
    userState({ isLoaded: false });
    renderMenu();

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reserves a 40 px hole by default", () => {
    userState({ isLoaded: false });
    const { container } = renderMenu(<AccountMenu />);

    expect(container.querySelector("span.size-10[aria-hidden]")).toBeTruthy();
  });

  it("shows the profile photo instead of the visitor buttons", () => {
    signedInAs("user_1");
    const { container } = renderMenu();

    expect(screen.queryByRole("link", { name: "Ingresar" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Abrir menú de la cuenta" });
    expect(trigger.className).toContain("size-10");
    expect(trigger.className).toContain("rounded-full");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://img.clerk.com/ana.png");
  });

  it("shows the initial when the account has no photo", () => {
    signedInAs("user_1", { hasImage: false, firstName: "lucía" });
    const { container } = renderMenu();

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir menú de la cuenta" }).textContent).toBe("L");
  });

  it("lists the name, email, Mi perfil, Mis carreras and Cerrar sesión", async () => {
    signedInAs("user_1");
    renderMenu();
    const menu = await openMenu();

    expect(menu.textContent).toContain("Ana Ríos");
    expect(menu.textContent).toContain("ana@example.com");
    expect(screen.getByRole("menuitem", { name: "Mi perfil" }).getAttribute("href")).toBe("/cuenta/perfil");
    expect(screen.getByRole("menuitem", { name: "Mis carreras" }).getAttribute("href")).toBe("/mis-carreras");
    expect(screen.getByRole("menuitem", { name: "Cerrar sesión" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Mi perfil",
      "Mis carreras",
      "Cerrar sesión",
    ]);
  });

  it("signs out back to /cuenta", async () => {
    signedInAs("user_1");
    renderMenu();
    await openMenu();

    expect(signOutProps).toHaveBeenCalledWith({ redirectUrl: "/cuenta" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(signOutProps).toHaveBeenCalledWith("clicked");
  });

  it("uses a native button trigger (Enter/Space) and closes with Escape", async () => {
    signedInAs("user_1");
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Abrir menú de la cuenta" });

    // A native button turns Enter and Space into a click; jsdom does not, so the click stands in.
    expect(trigger.tagName).toBe("BUTTON");
    trigger.focus();
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("shows Ir a CRM when /api/crm/me answers 200", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    signedInAs("user_admin");
    renderMenu();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/crm/me", { cache: "no-store" });
    await openMenu();
    const crm = await screen.findByRole("menuitem", { name: "Ir a CRM" });
    expect(crm.getAttribute("href")).toBe("/crm");
  });

  it.each([
    ["a 401", () => fetchMock.mockResolvedValue(new Response(null, { status: 401 }))],
    ["a 403", () => fetchMock.mockResolvedValue(new Response(null, { status: 403 }))],
    ["a network error", () => fetchMock.mockRejectedValue(new Error("network"))],
  ])("hides Ir a CRM on %s", async (_, answer) => {
    answer();
    signedInAs("user_runner");
    renderMenu();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Ir a CRM" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Mis carreras" })).toBeTruthy();
  });

  it("hides Ir a CRM while the check has not answered", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    signedInAs("user_admin");
    renderMenu();
    await openMenu();

    expect(screen.queryByRole("menuitem", { name: "Ir a CRM" })).toBeNull();
  });

  it("asks once per account, across re-renders, and never reuses another account's answer", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    signedInAs("user_1");
    const { rerender } = renderMenu();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<AccountMenu />);
    rerender(<AccountMenu />);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    signedInAs("user_2");
    rerender(<AccountMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Ir a CRM" })).toBeNull();
  });
});
