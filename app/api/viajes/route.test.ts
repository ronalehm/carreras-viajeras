// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listPublishedTrips } = vi.hoisted(() => ({ listPublishedTrips: vi.fn() }));
vi.mock("@/modules/trips", () => ({ listPublishedTrips }));

import { GET } from "@/app/api/viajes/route";
import type { PublicTrip } from "@/modules/trips";

const santiago: PublicTrip = {
  slug: "maraton-santiago-2027", title: "Maratón de Santiago", city: "Santiago", country: "Chile",
  raceDate: "2027-04-25", startDate: "2027-04-23", endDate: "2027-04-27", distances: ["42K", "21K"],
  summary: "Viaje para correr en Santiago.", includes: ["Hotel"], capacity: 20,
  imageUrl: "https://example.com/santiago.jpg", officialUrl: "https://example.com", excludes: ["Vuelos"],
  notes: "Por confirmar.",
};
const lima: PublicTrip = {
  ...santiago, slug: "maraton-lima-2027", title: "Maratón de Lima", city: "Lima", country: "Perú", raceDate: "2027-05-16",
};

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.text()).resolves.toBe(JSON.stringify(body));
}

beforeEach(() => {
  listPublishedTrips.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/viajes", () => {
  it("returns only slug and title of each published trip, in the same order", async () => {
    listPublishedTrips.mockResolvedValue([santiago, lima]);

    await expectResponse(await GET(), 200, {
      trips: [
        { slug: "maraton-santiago-2027", title: "Maratón de Santiago" },
        { slug: "maraton-lima-2027", title: "Maratón de Lima" },
      ],
    });
  });

  it("returns 200 with an empty list when nothing is published", async () => {
    listPublishedTrips.mockResolvedValue([]);

    await expectResponse(await GET(), 200, { trips: [] });
  });

  it("returns 503 with a fixed code and logs a fixed message without internal detail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    listPublishedTrips.mockRejectedValue(new Error("connection refused: postgres://secret@host/db"));

    await expectResponse(await GET(), 503, { error: "trips_unavailable" });
    expect(error).toHaveBeenCalledExactlyOnceWith("trips: published trips unavailable");
  });

  it("ignores any query string: the handler takes no request", async () => {
    listPublishedTrips.mockResolvedValue([lima]);
    // As Next calls it: a request with parameters that try to widen or change the read.
    const handler: (request: Request) => Promise<Response> = GET;

    const response = await handler(new Request("https://carreras-viajeras.mentec.dev/api/viajes?status=draft&fields=notes"));
    await expectResponse(response, 200, { trips: [{ slug: "maraton-lima-2027", title: "Maratón de Lima" }] });
    expect(GET).toHaveLength(0);
    expect(listPublishedTrips).toHaveBeenCalledExactlyOnceWith();
  });
});
