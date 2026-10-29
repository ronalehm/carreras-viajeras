import { beforeEach, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

import { fetchCatalogTrips } from "./catalogTrips.api";

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
