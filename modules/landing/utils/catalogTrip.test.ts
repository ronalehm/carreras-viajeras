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
    formatTripDateRange: display.formatTripDateRange,
    formatTripPrice: display.formatTripPrice,
  };
});

import { formatTripDateRange, getPublishedTripBySlug, type PublicTrip } from "@/modules/trips";
import { getCatalogTrip } from "./catalogTrip";

const getPublished = vi.mocked(getPublishedTripBySlug);

// Only the required fields filled in the CRM.
const minimal: PublicTrip = {
  slug: "maraton-lima-2027",
  title: "Maratón de Lima 2027",
  city: "Lima",
  country: "Perú",
  raceDate: "2027-05-16",
  startDate: null,
  endDate: null,
  distances: ["42K", "21K"],
  summary: "Corre la Maratón de Lima 2027 con Carreras Viajeras.",
  includes: [],
  priceUsd: null,
  capacity: null,
  imageUrl: null,
  officialUrl: null,
  installmentsPriceUsd: null,
  depositUsd: null,
  companionPriceUsd: null,
  paymentTerms: null,
  excludes: [],
  notes: null,
};

const complete: PublicTrip = {
  ...minimal,
  slug: "maraton-santiago-2027",
  title: "Maratón de Santiago 42K 2027",
  city: "Santiago",
  country: "Chile",
  startDate: "2027-05-14",
  endDate: "2027-05-17",
  distances: ["42K"],
  includes: ["Inscripción a los 42K", "Vuelos ida y vuelta"],
  priceUsd: 1499,
  capacity: 100,
  imageUrl: "https://carreras-viajeras.mentec.dev/images/cover-santiago.webp",
  officialUrl: "https://maratondesantiago.cl/",
  installmentsPriceUsd: 1799,
  depositUsd: 300,
  companionPriceUsd: 1300,
  paymentTerms: "  Saldo pagado en febrero de 2027.  \n\n\r\nLa web no recibe pagos.\n",
  excludes: ["Tours adicionales."],
  notes: "Aerolínea por confirmar.\n   \nHotel por confirmar.",
};

beforeEach(() => {
  getPublished.mockReset();
});

describe("getCatalogTrip", () => {
  it("returns null when the trip is not published", async () => {
    getPublished.mockResolvedValue(null);
    await expect(getCatalogTrip("otro-viaje")).resolves.toBeNull();
    expect(getPublished).toHaveBeenCalledOnce();
    expect(getPublished).toHaveBeenCalledWith("otro-viaje");
  });

  it("formats a complete published trip", async () => {
    getPublished.mockResolvedValue(complete);

    await expect(getCatalogTrip(complete.slug)).resolves.toEqual({
      slug: "maraton-santiago-2027",
      title: "Maratón de Santiago 42K 2027",
      summary: complete.summary,
      location: "Santiago, Chile",
      distances: ["42K"],
      imageUrl: "https://carreras-viajeras.mentec.dev/images/cover-santiago.webp",
      raceDate: "16 de mayo de 2027",
      travelDates: formatTripDateRange("2027-05-14", "2027-05-17"),
      capacity: "100 cupos",
      officialUrl: "https://maratondesantiago.cl/",
      price: "US$ 1,499",
      installmentsPrice: "US$ 1,799",
      deposit: "US$ 300",
      companionPrice: "US$ 1,300",
      paymentTerms: ["Saldo pagado en febrero de 2027.", "La web no recibe pagos."],
      includes: ["Inscripción a los 42K", "Vuelos ida y vuelta"],
      excludes: ["Tours adicionales."],
      notes: ["Aerolínea por confirmar.", "Hotel por confirmar."],
    });
  });

  it("leaves the optional fields empty for a minimal trip", async () => {
    getPublished.mockResolvedValue(minimal);

    await expect(getCatalogTrip(minimal.slug)).resolves.toEqual({
      slug: "maraton-lima-2027",
      title: "Maratón de Lima 2027",
      summary: minimal.summary,
      location: "Lima, Perú",
      distances: ["42K", "21K"],
      imageUrl: null,
      raceDate: "16 de mayo de 2027",
      travelDates: null,
      capacity: "Cupos por confirmar",
      officialUrl: null,
      price: "Precio a consultar",
      installmentsPrice: null,
      deposit: null,
      companionPrice: null,
      paymentTerms: [],
      includes: [],
      excludes: [],
      notes: [],
    });
  });

  it("keeps a zero price as a price", async () => {
    getPublished.mockResolvedValue({ ...minimal, depositUsd: 0 });
    const trip = await getCatalogTrip(minimal.slug);
    expect(trip?.deposit).toBe("US$ 0");
  });

  it("propagates database errors", async () => {
    const error = new Error("database down");
    getPublished.mockRejectedValue(error);
    await expect(getCatalogTrip(minimal.slug)).rejects.toBe(error);
  });
});
