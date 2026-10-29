import type { ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useUser, signInProps, signOutProps, registerAccountAction } = vi.hoisted(() => ({
  useUser: vi.fn(),
  signInProps: vi.fn(),
  signOutProps: vi.fn(),
  registerAccountAction: vi.fn(),
}));

vi.mock("../actions/account.actions", () => ({ registerAccountAction }));

vi.mock("@clerk/nextjs", () => ({
  useUser,
  SignIn: (props: Record<string, unknown>) => {
    signInProps(props);
    return <div data-testid="clerk-sign-in" />;
  },
  SignOutButton: ({ children, ...props }: { children: ReactNode }) => {
    signOutProps(props);
    return <div data-testid="clerk-sign-out">{children}</div>;
  },
}));

import { RunnerAccount } from "./RunnerAccount";

function userState(state: { isLoaded: boolean; isSignedIn?: boolean; user?: unknown }) {
  useUser.mockReturnValue({ isSignedIn: undefined, user: undefined, ...state });
}

function signedInAs(id: string) {
  userState({
    isLoaded: true,
    isSignedIn: true,
    user: { id, primaryEmailAddress: { emailAddress: "runner@example.com" } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  registerAccountAction.mockResolvedValue({ canAccessCrm: false });
});
afterEach(cleanup);

describe("RunnerAccount", () => {
  it("shows the loading status while Clerk loads", () => {
    userState({ isLoaded: false });
    render(<RunnerAccount />);

    expect(screen.getByRole("status").textContent).toBe("Cargando…");
    expect(signInProps).not.toHaveBeenCalled();
    expect(registerAccountAction).not.toHaveBeenCalled();
  });

  it("shows Clerk SignIn to /cuenta/perfil without a session", () => {
    userState({ isLoaded: true, isSignedIn: false, user: null });
    render(<RunnerAccount />);

    expect(screen.getByTestId("clerk-sign-in")).toBeTruthy();
    expect(signInProps).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRedirectUrl: "/cuenta/perfil",
        signUpForceRedirectUrl: "/cuenta/perfil",
      }),
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(registerAccountAction).not.toHaveBeenCalled();
  });

  it("greets the runner with their primary email, links to their profile and signs out back to /cuenta", async () => {
    signedInAs("user_runner");
    render(<RunnerAccount />);
    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("heading", { level: 1, name: "Qué bueno verte de nuevo." })).toBeTruthy();
    expect(screen.getByText("runner@example.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver mis carreras" }).getAttribute("href")).toBe("/mis-carreras");
    const profileLink = screen.getByRole("link", { name: "Mi cuenta" });
    const signOut = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(profileLink.getAttribute("href")).toBe("/cuenta/perfil");
    expect(profileLink.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(signOutProps).toHaveBeenCalledWith({ redirectUrl: "/cuenta" });
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    expect(signInProps).not.toHaveBeenCalled();
  });

  it.each([
    ["commercial", "user_commercial"],
    ["admin", "user_admin"],
    ["super_admin", "user_super_admin"],
    ["organizer", "user_organizer"],
  ])("shows Ingresar al CRM first for a %s account", async (_, id) => {
    registerAccountAction.mockResolvedValue({ canAccessCrm: true });
    signedInAs(id);
    render(<RunnerAccount />);

    const crmLink = await screen.findByRole("link", { name: "Ingresar al CRM" });
    expect(crmLink.getAttribute("href")).toBe("/crm");
    expect(screen.getAllByRole("link")[0]).toBe(crmLink);
    expect(registerAccountAction).toHaveBeenCalledTimes(1);
    expect(registerAccountAction).toHaveBeenCalledWith();
  });

  it.each([
    ["a runner", { canAccessCrm: false }],
    ["a sponsor", { canAccessCrm: false }],
  ])("hides Ingresar al CRM for %s", async (_, result) => {
    registerAccountAction.mockResolvedValue(result);
    signedInAs("user_1");
    render(<RunnerAccount />);

    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Ingresar al CRM" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver mis carreras" })).toBeTruthy();
  });

  it("hides Ingresar al CRM when the action fails", async () => {
    registerAccountAction.mockRejectedValue(new Error("network"));
    signedInAs("user_1");
    render(<RunnerAccount />);

    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Ingresar al CRM" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("does not show the link while the action has not answered", async () => {
    registerAccountAction.mockReturnValue(new Promise(() => {}));
    signedInAs("user_1");
    render(<RunnerAccount />);

    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("link", { name: "Ingresar al CRM" })).toBeNull();
  });

  it("calls the action once per user id, across re-renders", async () => {
    registerAccountAction.mockResolvedValue({ canAccessCrm: true });
    signedInAs("user_1");
    const { rerender } = render(<RunnerAccount />);
    await screen.findByRole("link", { name: "Ingresar al CRM" });

    rerender(<RunnerAccount />);
    rerender(<RunnerAccount />);
    expect(registerAccountAction).toHaveBeenCalledTimes(1);

    // Another account: its own call, and the previous result is not reused.
    registerAccountAction.mockResolvedValue({ canAccessCrm: false });
    signedInAs("user_2");
    rerender(<RunnerAccount />);
    expect(screen.queryByRole("link", { name: "Ingresar al CRM" })).toBeNull();
    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Ingresar al CRM" })).toBeNull();
  });
});
