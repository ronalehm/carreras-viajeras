import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInProps } = vi.hoisted(() => ({ signInProps: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: Record<string, unknown>) => {
    signInProps(props);
    return <div data-testid="clerk-sign-in" />;
  },
}));

import { AccessPanel } from "./AccessPanel";

const STAFF_NOTICE = "Solo para personas invitadas por un administrador.";
const RUNNER_NOTICE =
  "Este paso identifica tu acceso al sitio. Todavía no crea un perfil viajero independiente ni te inscribe en un evento.";

function expectSignInTo(destination: string) {
  expect(screen.getByTestId("clerk-sign-in")).toBeTruthy();
  expect(signInProps).toHaveBeenCalledTimes(1);
  expect(signInProps).toHaveBeenCalledWith({
    routing: "hash",
    withSignUp: true,
    forceRedirectUrl: destination,
    signUpForceRedirectUrl: destination,
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("AccessPanel", () => {
  it("renders Clerk SignIn to /crm with the invitation notice for staff", () => {
    render(<AccessPanel audience="staff" />);

    expectSignInTo("/crm");
    expect(screen.getByText(STAFF_NOTICE)).toBeTruthy();
    expect(screen.queryByText(RUNNER_NOTICE)).toBeNull();
  });

  it("defaults to the staff audience", () => {
    render(<AccessPanel />);

    expectSignInTo("/crm");
    expect(screen.getByText(STAFF_NOTICE)).toBeTruthy();
  });

  it("renders Clerk SignIn to /cuenta with the runner notice for runners", () => {
    render(<AccessPanel audience="runner" />);

    expectSignInTo("/cuenta");
    expect(screen.getByText(RUNNER_NOTICE)).toBeTruthy();
    expect(screen.queryByText(STAFF_NOTICE)).toBeNull();
  });
});
