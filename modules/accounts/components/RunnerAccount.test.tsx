import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useUser, signInProps, signOutProps } = vi.hoisted(() => ({
  useUser: vi.fn(),
  signInProps: vi.fn(),
  signOutProps: vi.fn(),
}));

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

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RunnerAccount", () => {
  it("shows the loading status while Clerk loads", () => {
    userState({ isLoaded: false });
    render(<RunnerAccount />);

    expect(screen.getByRole("status").textContent).toBe("Cargando…");
    expect(signInProps).not.toHaveBeenCalled();
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
  });

  it("greets the runner with their primary email, links to their profile and signs out back to /cuenta", () => {
    userState({
      isLoaded: true,
      isSignedIn: true,
      user: { primaryEmailAddress: { emailAddress: "runner@example.com" } },
    });
    render(<RunnerAccount />);

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
});
