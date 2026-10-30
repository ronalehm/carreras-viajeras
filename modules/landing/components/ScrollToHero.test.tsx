import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { ScrollToHero } from "./ScrollToHero";

const scrollTo = vi.fn();

beforeEach(() => {
  pathname = "/";
  scrollTo.mockClear();
  vi.stubGlobal("scrollTo", scrollTo);
  // jsdom keeps the URL between tests: start every case without a hash.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("lleva la página a su hero al montar, también en el siguiente cuadro", async () => {
  render(<ScrollToHero />);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  expect(scrollTo).toHaveBeenCalledWith(0, 0);
  expect(scrollTo.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it("respeta el destino de un hash de la URL", async () => {
  window.history.replaceState(null, "", "/#paquete");
  render(<ScrollToHero />);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  expect(scrollTo).not.toHaveBeenCalled();
});

it("no renderiza DOM", () => {
  const { container } = render(<ScrollToHero />);
  expect(container.innerHTML).toBe("");
});
