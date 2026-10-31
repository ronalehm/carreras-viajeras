import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useUser, signInProps, registerAccountAction } = vi.hoisted(() => ({
  useUser: vi.fn(),
  signInProps: vi.fn(),
  registerAccountAction: vi.fn(),
}));

vi.mock("../actions/account.actions", () => ({ registerAccountAction }));

vi.mock("@clerk/nextjs", () => ({
  useUser,
  SignIn: (props: Record<string, unknown>) => {
    signInProps(props);
    return <div data-testid="clerk-sign-in" />;
  },
}));

import { RunnerAccount } from "./RunnerAccount";

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
      primaryEmailAddress: { emailAddress: "runner@example.com" },
      ...user,
    },
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

  it("only greets the runner by first name, with no account buttons", async () => {
    signedInAs("user_runner");
    const { container } = render(<RunnerAccount />);
    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));
    await act(async () => {});

    const heading = screen.getByRole("heading", { level: 1, name: "Qué bueno verte de nuevo. Ana" });
    expect(heading.className).toBe("text-2xl font-semibold");
    expect(container.textContent).toBe("Qué bueno verte de nuevo. Ana");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(signInProps).not.toHaveBeenCalled();
  });

  it.each([
    ["the full name without a first name", { firstName: null }, "Ana Ríos"],
    ["the primary email without a name", { firstName: null, fullName: null }, "runner@example.com"],
  ])("falls back to %s", (_, user, expected) => {
    signedInAs("user_runner", user);
    render(<RunnerAccount />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`Qué bueno verte de nuevo. ${expected}`);
  });

  it("keeps the greeting when the registration fails", async () => {
    registerAccountAction.mockRejectedValue(new Error("network"));
    signedInAs("user_1");
    render(<RunnerAccount />);

    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("registers the account once per user id, across re-renders", async () => {
    signedInAs("user_1");
    const { rerender } = render(<RunnerAccount />);
    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(1));

    rerender(<RunnerAccount />);
    rerender(<RunnerAccount />);
    expect(registerAccountAction).toHaveBeenCalledTimes(1);
    expect(registerAccountAction).toHaveBeenCalledWith();

    signedInAs("user_2");
    rerender(<RunnerAccount />);
    await waitFor(() => expect(registerAccountAction).toHaveBeenCalledTimes(2));
  });
});
