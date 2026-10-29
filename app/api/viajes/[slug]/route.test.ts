// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogTrip, getCatalogOffer } = vi.hoisted(() => ({
  getCatalogTrip: vi.fn(),
  getCatalogOffer: vi.fn(),
}));
vi.mock("@/modules/landing", () => ({ getCatalogTrip, getCatalogOffer }));

import { GET } from "@/app/api/viajes/[slug]/route";

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
  finalPrice: "US$ 2,000",
  finalPricePen: null,
  deposits: [],
  balanceDueOn: null,
  bonus: null,
  validity: "Vigente",
  conditions: [],
  termsVersion: "v1",
  exchangeRate: null,
};

function request(slug: string, query = "") {
  const url = `https://carreras-viajeras.mentec.dev/api/viajes/${slug}${query}`;
  return GET(new Request(url), { params: Promise.resolve({ slug }) });
}

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

beforeEach(() => {
  getCatalogTrip.mockReset();
  getCatalogOffer.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/viajes/[slug]", () => {
  it("returns the trip and the offer decided by the server from the slug and ?c=", async () => {
    getCatalogTrip.mockResolvedValue(trip);
    getCatalogOffer.mockResolvedValue(offer);

    await expectResponse(await request("maraton-santiago-2027", "?c=abc"), 200, { trip, offer });
    expect(getCatalogTrip).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027");
    expect(getCatalogOffer).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", "abc");
  });

  it("returns a null offer when there is none in force", async () => {
    getCatalogTrip.mockResolvedValue(trip);
    getCatalogOffer.mockResolvedValue(null);

    await expectResponse(await request("maraton-santiago-2027"), 200, { trip, offer: null });
    expect(getCatalogOffer).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", null);
  });

  it("uses only the first ?c= value and ignores every other parameter", async () => {
    getCatalogTrip.mockResolvedValue(trip);
    getCatalogOffer.mockResolvedValue(offer);

    const response = await request(
      "maraton-santiago-2027",
      "?c=abc&c=xyz&price=1&finalPrice=0&status=draft&utm_source=x",
    );
    await expectResponse(response, 200, { trip, offer });
    expect(getCatalogOffer).toHaveBeenCalledExactlyOnceWith("maraton-santiago-2027", "abc");
  });

  it("returns 404 trip_not_found for an unknown, unpublished or non-canonical slug", async () => {
    getCatalogTrip.mockResolvedValue(null);
    getCatalogOffer.mockResolvedValue(null);

    await expectResponse(await request("Maraton-Santiago-2027"), 404, { error: "trip_not_found" });
  });

  it("does not leak an offer when the trip is not found", async () => {
    getCatalogTrip.mockResolvedValue(null);
    getCatalogOffer.mockResolvedValue(offer);

    await expectResponse(await request("maraton-oculta-2027"), 404, { error: "trip_not_found" });
  });

  it.each([
    ["the trip read", () => getCatalogTrip.mockRejectedValue(new Error("postgres://secret@host/db"))],
    ["the offer read", () => getCatalogOffer.mockRejectedValue(new Error("postgres://secret@host/db"))],
  ])("returns 503 trip_unavailable and logs a fixed message when %s fails", async (_, fail) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getCatalogTrip.mockResolvedValue(trip);
    getCatalogOffer.mockResolvedValue(offer);
    fail();

    const response = await request("maraton-santiago-2027", "?c=abc");
    await expectResponse(response, 503, { error: "trip_unavailable" });
    expect(error).toHaveBeenCalledExactlyOnceWith("trips: published trip unavailable");
  });
});
