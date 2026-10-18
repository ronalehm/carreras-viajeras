// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real formatters from the pure display file; only the server-only service is mocked.
vi.mock("@/modules/trips", async () => {
  const display = await vi.importActual<typeof import("@/modules/trips/utils/tripDisplay")>(
    "@/modules/trips/utils/tripDisplay",
  );
  return {
    getPublishedTripBySlug: vi.fn(),
    formatTripDate: display.formatTripDate,
    formatTripPrice: display.formatTripPrice,
  };
});

import { getPublishedTripBySlug, type PublicTrip } from "@/modules/trips";
import { getCatalogTrip } from "./catalogTrip";

const getPublished = vi.mocked(getPublishedTripBySlug);

const SLUG = "maraton-santiago-2027";

// Data of the F4 operational precondition.
const published: PublicTrip = {
  slug: SLUG,
  title: "Maratón de Santiago 42K 2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-05-16",
  startDate: null,
  endDate: null,
  distances: ["42K"],
  summary:
    "Corre la Maratón de Santiago 42K 2027 con Carreras Viajeras. Propuesta de viaje para runners peruanos: vuelos, alojamiento e inscripción en preventa: US$1,499 al contado o US$1,799 en cuotas.",
  includes: [],
  priceUsd: 1499,
  capacity: 100,
  imageUrl: null,
};

beforeEach(() => {
  getPublished.mockReset();
});

describe("getCatalogTrip", () => {
  it("returns null without querying the catalog when the slug has no fixed content", async () => {
    await expect(getCatalogTrip("otro-viaje")).resolves.toBeNull();
    expect(getPublished).not.toHaveBeenCalled();
  });

  it("returns null when the trip is not published", async () => {
    getPublished.mockResolvedValue(null);
    await expect(getCatalogTrip(SLUG)).resolves.toBeNull();
    expect(getPublished).toHaveBeenCalledOnce();
    expect(getPublished).toHaveBeenCalledWith(SLUG);
  });

  it("applies the catalog fields over the fixed content", async () => {
    getPublished.mockResolvedValue(published);
    const trip = await getCatalogTrip(SLUG);

    expect(trip).toMatchObject({
      name: published.title,
      description: published.summary,
      raceDate: "16 de mayo de 2027",
      capacity: "100 cupos definidos",
      prices: { cash: "US$ 1,499", installmentsTotal: "US$1,799" },
      destinationId: "santiago-2027",
      image: "/images/santiago.jpg",
    });
    expect(trip?.included).toHaveLength(9);
  });

  it("uses the fallback texts when price and capacity are missing", async () => {
    getPublished.mockResolvedValue({ ...published, priceUsd: null, capacity: null });
    const trip = await getCatalogTrip(SLUG);

    expect(trip?.prices.cash).toBe("Precio a consultar");
    expect(trip?.capacity).toBe("Cupos por confirmar");
  });

  it("propagates database errors", async () => {
    const error = new Error("database down");
    getPublished.mockRejectedValue(error);
    await expect(getCatalogTrip(SLUG)).rejects.toBe(error);
  });
});
