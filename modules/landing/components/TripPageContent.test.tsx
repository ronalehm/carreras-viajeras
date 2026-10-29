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

import { TripPageContent } from "./TripPageContent";

const trip = {
  slug: "maraton-santiago-2027",
  title: "Maratón de Santiago",
  summary: "Viaje para correr en Santiago.",
  location: "Santiago, Chile",
  distances: ["42K", "21K"],
  imageUrl: null,
  raceDate: "25 de abril de 2027",
  travelDates: null,
  capacity: "20 cupos",
  officialUrl: null,
  includes: ["Hotel"],
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

function renderContent(url: string) {
  const parsed = new URL(url, "https://carreras-viajeras.mentec.dev");
  location.pathname = parsed.pathname;
  location.params = parsed.searchParams;
  // Test client: no delay between the single retry and the error state.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return { client, ...render(<QueryClientProvider client={client}><TripPageContent /></QueryClientProvider>) };
}

beforeEach(() => {
  fetchCatalogTrip.mockReset();
  document.title = "Viaje | Carreras Viajeras";
});
afterEach(cleanup);

it("shows a brief accessible loading state without amounts while the trip is pending", () => {
  fetchCatalogTrip.mockReturnValue(new Promise(() => {}));
  renderContent("/viajes/maraton-santiago-2027");

  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(screen.getByText("Cargando el viaje…")).toBeTruthy();
  expect(screen.queryByText(/US\$/)).toBeNull();
});

it("reads the slug from the visible URL and only the first ?c= for the offer", async () => {
  fetchCatalogTrip.mockResolvedValue({ trip, offer });
  renderContent("/viajes/maraton-santiago-2027?c=abc&c=xyz&utm_source=x&price=1");

  expect(await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" })).toBeTruthy();
  expect(fetchCatalogTrip).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", "abc");
  expect(screen.getAllByText(/US\$ 1,799/).length).toBeGreaterThan(0);
});

it("asks for the trip without a campaign code when there is no ?c=", async () => {
  fetchCatalogTrip.mockResolvedValue({ trip, offer: null });
  renderContent("/viajes/maraton-santiago-2027");

  await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" });
  expect(fetchCatalogTrip).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", null);
});

it("sets the document title from the trip", async () => {
  fetchCatalogTrip.mockResolvedValue({ trip, offer: null });
  renderContent("/viajes/maraton-santiago-2027");

  await waitFor(() => expect(document.title).toBe("Maratón de Santiago | Carreras Viajeras"));
});

it("shows Viaje no encontrado with a link to the home page on a 404, without retrying", async () => {
  fetchCatalogTrip.mockResolvedValue(null);
  renderContent("/viajes/maraton-inexistente");

  expect(await screen.findByRole("heading", { name: "Viaje no encontrado" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Volver al inicio" }).getAttribute("href")).toBe("/");
  expect(fetchCatalogTrip).toHaveBeenCalledTimes(1);
  expect(document.title).toBe("Viaje | Carreras Viajeras");
});

it("shows the fixed notice with the general WhatsApp link after at most one retry", async () => {
  fetchCatalogTrip.mockRejectedValue(new Error("Request failed with status code 503"));
  renderContent("/viajes/maraton-santiago-2027");

  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(fetchCatalogTrip).toHaveBeenCalledTimes(2);
  const whatsApp = screen.getByRole("link", { name: /Escríbenos por WhatsApp/ }).getAttribute("href");
  expect(whatsApp).toBe(
    `https://wa.me/51938127170?text=${encodeURIComponent("Hola, quiero información para correr con Carreras Viajeras.")}`,
  );
  expect(screen.queryByRole("heading", { name: "Viaje no encontrado" })).toBeNull();
});

it("keeps the loaded trip on screen when a later refetch fails", async () => {
  fetchCatalogTrip.mockResolvedValueOnce({ trip, offer: null });
  const { client } = renderContent("/viajes/maraton-santiago-2027");
  await screen.findByRole("heading", { level: 1, name: "Maratón de Santiago" });

  fetchCatalogTrip.mockRejectedValue(new Error("Request failed with status code 503"));
  await act(() => client.refetchQueries().catch(() => {}));

  await waitFor(() => expect(client.getQueryState(["landing", "catalog-trip", "maraton-santiago-2027", null])?.status).toBe("error"));
  expect(screen.getByRole("heading", { level: 1, name: "Maratón de Santiago" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
