import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { fetchCatalogTrip, location } = vi.hoisted(() => ({
  fetchCatalogTrip: vi.fn(),
  location: { pathname: "/", params: new URLSearchParams() },
}));
vi.mock("../services/catalogTrips.api", () => ({ fetchCatalogTrip }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => location.params,
}));

import { RacePageContent } from "./RacePageContent";

const trip = {
  slug: "maraton-santiago-2027",
  title: "Maratón de Santiago",
  summary: "Viaje para correr en Santiago.",
  location: "Santiago, Chile",
  distances: ["42K"],
  imageUrl: null,
  raceDate: "25 de abril de 2027",
  travelDates: null,
  capacity: "20 cupos",
  officialUrl: null,
  includes: [],
  excludes: [],
  notes: [],
};
const offer = {
  totalPrice: "US$ 2,000",
  totalPricePen: null,
  discount: null,
  discountPen: null,
  finalPrice: "US$ 1,799",
  finalPricePen: null,
  deposits: [],
  balanceDueOn: null,
  bonus: null,
  validity: "Vigente",
  conditions: [],
  termsVersion: "v1",
  exchangeRate: null,
};
const action = vi.fn();

function renderContent(url: string) {
  const parsed = new URL(url, "https://carreras-viajeras.mentec.dev");
  location.pathname = parsed.pathname;
  location.params = parsed.searchParams;
  // Test client: no delay between the single retry and the error state.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return { client, ...render(<QueryClientProvider client={client}><RacePageContent action={action} /></QueryClientProvider>) };
}

function hiddenValue(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;
}

beforeEach(() => {
  fetchCatalogTrip.mockReset();
  document.title = "Registro | Carreras Viajeras";
});
afterEach(cleanup);

it("shows a brief loading state without the form or amounts while the trip is pending", () => {
  fetchCatalogTrip.mockReturnValue(new Promise(() => {}));
  const { container } = renderContent("/viajes/maraton-santiago-2027/registro");

  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector("form")).toBeNull();
  expect(screen.queryByText(/US\$/)).toBeNull();
});

it("renders the registration with the offer of ?c=, the attribution, header and footer", async () => {
  fetchCatalogTrip.mockResolvedValue({ trip, offer });
  const { container } = renderContent(
    "/viajes/maraton-santiago-2027/registro?c=abc&c=xyz&utm_source=x&utm_source=y&ref=amigo&other=1",
  );

  expect(await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" })).toBeTruthy();
  expect(fetchCatalogTrip).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", "abc");
  expect(container.querySelector("form")).not.toBeNull();
  expect(hiddenValue(container, "c")).toBe("abc");
  expect(hiddenValue(container, "utm_source")).toBe("x");
  expect(hiddenValue(container, "ref")).toBe("amigo");
  expect(hiddenValue(container, "other")).toBeUndefined();
  expect(screen.getAllByText(/US\$ 1,799/).length).toBeGreaterThan(0);
  expect(container.querySelector("header")).not.toBeNull();
  expect(container.querySelector("footer")).not.toBeNull();
  await waitFor(() => expect(document.title).toBe("Registro · Maratón de Santiago | Carreras Viajeras"));
});

it("stand mode shows no header, footer or price block and asks for no campaign offer", async () => {
  fetchCatalogTrip.mockResolvedValue({ trip, offer });
  const { container } = renderContent("/viajes/maraton-santiago-2027/registro?modo=stand&c=abc");

  expect(await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" })).toBeTruthy();
  expect(fetchCatalogTrip).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", null);
  expect(container.querySelector("form")).not.toBeNull();
  expect(container.querySelector("header")).toBeNull();
  expect(container.querySelector("footer")).toBeNull();
  expect(screen.queryByText(/US\$/)).toBeNull();
});

it("only the first ?modo= value counts", async () => {
  fetchCatalogTrip.mockResolvedValue({ trip, offer: null });
  const { container } = renderContent("/viajes/maraton-santiago-2027/registro?modo=web&modo=stand");

  await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" });
  expect(container.querySelector("header")).not.toBeNull();
});

it("shows Viaje no encontrado with a link to the home page on a 404", async () => {
  fetchCatalogTrip.mockResolvedValue(null);
  const { container } = renderContent("/viajes/maraton-inexistente/registro");

  expect(await screen.findByRole("heading", { name: "Viaje no encontrado" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Volver al inicio" }).getAttribute("href")).toBe("/");
  expect(container.querySelector("form")).toBeNull();
  expect(fetchCatalogTrip).toHaveBeenCalledTimes(1);
});

it("shows the fixed notice with the general WhatsApp link after at most one retry", async () => {
  fetchCatalogTrip.mockRejectedValue(new Error("Request failed with status code 503"));
  const { container } = renderContent("/viajes/maraton-santiago-2027/registro?modo=stand");

  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(fetchCatalogTrip).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("link", { name: /Escríbenos por WhatsApp/ }).getAttribute("href")).toMatch(
    /^https:\/\/wa\.me\/51938127170\?text=/,
  );
  expect(container.querySelector("form")).toBeNull();
});

it("keeps the form mounted, with what was typed, when a later refetch fails", async () => {
  fetchCatalogTrip.mockResolvedValueOnce({ trip, offer: null });
  const { client, container } = renderContent("/viajes/maraton-santiago-2027/registro");
  await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" });
  const form = container.querySelector("form");
  const name = container.querySelector<HTMLInputElement>("input[name='name']");
  if (!name) throw new Error("name field not rendered");
  name.value = "Ana";

  fetchCatalogTrip.mockRejectedValue(new Error("Request failed with status code 503"));
  await act(() => client.refetchQueries().catch(() => {}));

  await waitFor(() => expect(fetchCatalogTrip).toHaveBeenCalledTimes(3));
  expect(container.querySelector("form")).toBe(form);
  expect(name.value).toBe("Ana");
  expect(screen.queryByRole("alert")).toBeNull();
});
