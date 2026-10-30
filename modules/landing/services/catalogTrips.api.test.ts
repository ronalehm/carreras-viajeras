import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

import { fetchCatalogTrip, fetchCatalogTrips } from "./catalogTrips.api";

const santiago = { slug: "maraton-santiago-2027", title: "Maratón de Santiago" };
const lima = { slug: "maraton-lima-2027", title: "Maratón de Lima" };

beforeEach(() => {
  get.mockReset();
});

it("requests the public endpoint and keeps the order of the trips", async () => {
  get.mockResolvedValue({ data: { trips: [santiago, lima] } });

  await expect(fetchCatalogTrips()).resolves.toEqual([santiago, lima]);
  expect(get).toHaveBeenCalledExactlyOnceWith("/viajes");
});

it("accepts an empty list", async () => {
  get.mockResolvedValue({ data: { trips: [] } });

  await expect(fetchCatalogTrips()).resolves.toEqual([]);
});

it("keeps only slug and title of each trip", async () => {
  get.mockResolvedValue({ data: { trips: [{ ...santiago, notes: "Interna", capacity: 20 }] } });

  await expect(fetchCatalogTrips()).resolves.toEqual([santiago]);
});

it.each([
  ["a body without trips", { error: "trips_unavailable" }],
  ["a trip without slug", { trips: [{ title: "Maratón de Lima" }] }],
  ["an empty title", { trips: [{ ...lima, title: "" }] }],
  ["a non-string slug", { trips: [{ ...lima, slug: 42 }] }],
])("rejects a malformed response: %s", async (_, data) => {
  get.mockResolvedValue({ data });

  await expect(fetchCatalogTrips()).rejects.toThrow();
});

it("propagates a failed request (503) so the form falls back to the destinations without catalog", async () => {
  get.mockRejectedValue(new Error("Request failed with status code 503"));

  await expect(fetchCatalogTrips()).rejects.toThrow();
});

describe("fetchCatalogTrip", () => {
  const trip = {
    slug: "maraton-santiago-2027",
    title: "Maratón de Santiago",
    summary: "Viaje para correr en Santiago.",
    location: "Santiago, Chile",
    distances: ["42K"],
    imageUrl: null,
    raceDate: "25 de abril de 2027",
    travelDates: "23 al 27 de abril de 2027",
    capacity: "20 cupos",
    officialUrl: "https://example.com",
    includes: ["Hotel"],
    excludes: ["Vuelos"],
    notes: ["Por confirmar."],
  };
  const offer = {
    totalPrice: "US$ 2,000",
    totalPricePen: "S/ 7,500.00",
    discount: null,
    discountPen: null,
    finalPrice: "US$ 2,000",
    finalPricePen: "S/ 7,500.00",
    deposits: [{ deposit: "US$ 500", depositPen: null, balance: "US$ 1,500", balancePen: null }],
    balanceDueOn: "15 de marzo de 2027",
    bonus: null,
    validity: "Vigente hasta el 31 de diciembre de 2026",
    conditions: ["Sujeto a disponibilidad."],
    termsVersion: "v1",
    exchangeRate: { rate: "3.7500", since: "1 de octubre de 2026" },
  };

  function httpError(status: number) {
    return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
      status,
      statusText: "",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {},
    });
  }

  it("requests the trip with ?c= and returns the trip and the offer", async () => {
    get.mockResolvedValue({ data: { trip, offer } });

    await expect(fetchCatalogTrip("maraton-santiago-2027", "abc")).resolves.toEqual({ trip, offer });
    expect(get).toHaveBeenCalledExactlyOnceWith("/viajes/maraton-santiago-2027", { params: { c: "abc" } });
  });

  it("sends no query without a campaign code and accepts a null offer", async () => {
    get.mockResolvedValue({ data: { trip, offer: null } });

    await expect(fetchCatalogTrip("maraton-santiago-2027", null)).resolves.toEqual({ trip, offer: null });
    expect(get).toHaveBeenCalledExactlyOnceWith("/viajes/maraton-santiago-2027", { params: undefined });
  });

  it("encodes the slug taken from the URL", async () => {
    get.mockResolvedValue({ data: { trip, offer: null } });

    await fetchCatalogTrip("a/b?c", null);
    expect(get).toHaveBeenCalledWith("/viajes/a%2Fb%3Fc", { params: undefined });
  });

  it("drops keys that are not part of the public contract", async () => {
    get.mockResolvedValue({ data: { trip: { ...trip, id: "t1", status: "draft" }, offer: { ...offer, campaignId: "x" } } });

    await expect(fetchCatalogTrip("maraton-santiago-2027", null)).resolves.toEqual({ trip, offer });
  });

  it("resolves a 404 to null, distinct from an error", async () => {
    get.mockRejectedValue(httpError(404));

    await expect(fetchCatalogTrip("maraton-inexistente", null)).resolves.toBeNull();
  });

  it("propagates a 503 and a network failure", async () => {
    get.mockRejectedValueOnce(httpError(503));
    await expect(fetchCatalogTrip("maraton-santiago-2027", null)).rejects.toThrow("503");

    get.mockRejectedValueOnce(new Error("Network Error"));
    await expect(fetchCatalogTrip("maraton-santiago-2027", null)).rejects.toThrow("Network Error");
  });

  it.each([
    ["a body without trip", { offer: null }],
    ["a trip without title", { trip: { ...trip, title: undefined }, offer: null }],
    ["a non-array of distances", { trip: { ...trip, distances: "42K" }, offer: null }],
    ["an offer without final price", { trip, offer: { ...offer, finalPrice: undefined } }],
    ["a missing offer key", { trip }],
  ])("rejects a malformed response: %s", async (_, data) => {
    get.mockResolvedValue({ data });

    await expect(fetchCatalogTrip("maraton-santiago-2027", null)).rejects.toThrow();
  });
});
