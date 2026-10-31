import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { fetchCatalogTrips, search, replace } = vi.hoisted(() => ({
  fetchCatalogTrips: vi.fn(),
  search: { params: new URLSearchParams() },
  replace: vi.fn(),
}));
vi.mock("../services/catalogTrips.api", () => ({ fetchCatalogTrips }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => search.params,
  usePathname: () => "/contacto",
  useRouter: () => ({ replace }),
}));

import { ContactPageContent } from "./ContactPageContent";

const santiago = { slug: "maraton-santiago-2027", title: "Maratón de Santiago" };

function renderContent(query = "") {
  search.params = new URLSearchParams(query);
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactPageContent />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchCatalogTrips.mockReset();
  replace.mockReset();
  // ScrollToHero resets the scroll: jsdom does not implement window.scrollTo.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows a brief accessible loading state while the trips are pending", () => {
  fetchCatalogTrips.mockReturnValue(new Promise(() => {}));
  renderContent();
  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
});

it("lists the published races with their registration links and WhatsApp, without a form", async () => {
  fetchCatalogTrips.mockResolvedValue([santiago]);
  const { container } = renderContent("utm_source=x&utm_source=y&other=1");

  const link = await screen.findByRole("link", { name: /Maratón de Santiago/ });
  expect(link.getAttribute("href")).toBe("/viajes/maraton-santiago-2027/registro?utm_source=x");
  expect(screen.getByRole("link", { name: /Escríbenos por WhatsApp/ })).toBeTruthy();
  expect(container.querySelector("form")).toBeNull();
});

it("sends an old ?destino= alias link to the race registration page with its attribution", async () => {
  fetchCatalogTrips.mockResolvedValue([santiago]);
  renderContent("destino=santiago-2027&c=abc");

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/viajes/maraton-santiago-2027/registro?c=abc"));
});

it("keeps WhatsApp when the catalog fails or the destination is not a published race", async () => {
  fetchCatalogTrips.mockRejectedValue(new Error("Request failed with status code 503"));
  renderContent("destino=rio");

  expect(await screen.findByRole("link", { name: /Escríbenos por WhatsApp/ })).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
});
