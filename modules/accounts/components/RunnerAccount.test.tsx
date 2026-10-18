import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authClient, router } = vi.hoisted(() => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    emailOtp: {
      sendVerificationOtp: vi.fn(),
      verifyEmail: vi.fn(),
      requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(),
    },
    getSession: vi.fn(),
  },
  router: { replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/lib/auth/client", () => ({ authClient }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RunnerAccount } from "./RunnerAccount";

function session(state: { data?: unknown; isPending?: boolean; error?: unknown }) {
  authClient.useSession.mockReturnValue({ data: null, isPending: false, error: null, ...state });
}

function expectRunnerPanel() {
  expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registrarse" })).toBeTruthy();
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RunnerAccount", () => {
  it("shows the loading status while the session is pending", () => {
    session({ isPending: true });
    render(<RunnerAccount />);

    expect(screen.getByRole("status").textContent).toBe("Cargando…");
  });

  it("shows the runner access panel without a session", () => {
    session({});
    render(<RunnerAccount />);

    expectRunnerPanel();
  });

  it("shows the runner access panel when useSession fails", () => {
    session({ error: { status: 500 } });
    render(<RunnerAccount />);

    expectRunnerPanel();
  });

  it("greets the runner with their email and signs out back to /cuenta", async () => {
    session({ data: { user: { email: "runner@example.com" }, session: {} } });
    authClient.signOut.mockResolvedValue({ data: {}, error: null });
    render(<RunnerAccount />);

    expect(screen.getByRole("heading", { name: "Qué bueno verte de nuevo." })).toBeTruthy();
    expect(screen.getByText("runner@example.com")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await act(async () => {});

    expect(authClient.signOut).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/cuenta");
    expect(router.refresh).toHaveBeenCalled();
  });
});
