// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => undefined }));

import { config } from "./middleware";

describe("Clerk middleware coverage", () => {
  it.each([
    "/crm",
    "/crm/admin/usuarios/user_123",
    "/api/crm/me",
    "/cuenta",
    "/cuenta/perfil",
    "/cuenta/perfil/editar",
    "/mis-carreras",
    "/mis-carreras?reserva=booking-1",
  ])("makes the Clerk session available on %s", (path) => {
    expect(unstable_doesMiddlewareMatch({ config, url: `https://example.test${path}` })).toBe(true);
  });

  it.each(["/", "/cuentas", "/contacto", "/api/health", "/cuenta/perfil-otro"])(
    "keeps public liveness, static pages and unrelated segments outside the matcher: %s",
    (path) => {
      expect(unstable_doesMiddlewareMatch({ config, url: `https://example.test${path}` })).toBe(false);
    },
  );
});
