import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useUser }));

import { CommunityReferralInvite } from "./CommunityReferralInvite";

afterEach(() => {
  cleanup();
  useUser.mockReset();
});

function href(name: RegExp) {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe("CommunityReferralInvite", () => {
  it.each([
    ["a visitor", { isLoaded: true, isSignedIn: false }],
    ["while Clerk loads", { isLoaded: false, isSignedIn: undefined }],
  ])("invites %s to create an account, without share buttons", (_, state) => {
    useUser.mockReturnValue(state);
    render(<CommunityReferralInvite />);

    expect(screen.getByRole("heading", { name: "Gana estrellas para tu próxima carrera." })).toBeTruthy();
    expect(screen.getByText(/Invita a tus amigos a correr contigo/)).toBeTruthy();
    expect(href(/Crear mi cuenta e invitar/)).toBe("/cuenta#imagen-login");
    expect(screen.queryByRole("link", { name: /Compartir mi código/ })).toBeNull();
  });

  it("offers to share the referral code once signed in", () => {
    useUser.mockReturnValue({ isLoaded: true, isSignedIn: true, user: { id: "user_1" } });
    render(<CommunityReferralInvite />);

    expect(screen.getByRole("heading", { name: "Invita a un amigo y suma estrellas." })).toBeTruthy();
    expect(href(/Compartir mi código/)).toBe("/cuenta/perfil#referidos");
    expect(href(/Ver premios y condiciones/)).toBe("/cuenta/perfil#beneficios");
    expect(screen.queryByRole("link", { name: /Crear mi cuenta/ })).toBeNull();
    expect(screen.queryByText(/Comparte tu enlace desde Mi cuenta/)).toBeNull();
  });
});
