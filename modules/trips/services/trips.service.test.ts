// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { connection } from "next/server";
import { getDb } from "@/lib/db";
import type { TripInput } from "../types/trips.types";
import {
  createTrip,
  getPublishedTripBySlug,
  getTripById,
  listPublishedTrips,
  listTrips,
  setTripStatus,
  updateTrip,
} from "./trips.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, query, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
const PUBLIC_COLUMNS =
  '"slug", "title", "city", "country", "race_date", "start_date", "end_date", "distances", "summary", "includes", "price_usd", "capacity", "image_url"';
const INTERNAL_COLUMNS = /"id"|"status"|"created_at"|"updated_at"/;

// Rows in select order (array mode), as the Neon HTTP driver returns them.
const santiagoRow = [
  "maraton-santiago-2027",
  "Maratón de Santiago 2027",
  "Santiago",
  "Chile",
  "2027-04-25",
  "2027-04-23",
  "2027-04-27",
  ["42K", "21K", "10K"],
  "Viaje para correr la Maratón de Santiago.",
  ["Hotel", "Traslados"],
  1990,
  100,
  "https://example.com/santiago.jpg",
];
const santiago = {
  slug: "maraton-santiago-2027",
  title: "Maratón de Santiago 2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-04-25",
  startDate: "2027-04-23",
  endDate: "2027-04-27",
  distances: ["42K", "21K", "10K"],
  summary: "Viaje para correr la Maratón de Santiago.",
  includes: ["Hotel", "Traslados"],
  priceUsd: 1990,
  capacity: 100,
  imageUrl: "https://example.com/santiago.jpg",
};
const limaRow = ["maraton-lima-2027", "Maratón de Lima", "Lima", "Perú", "2027-05-16", null, null, ["42K"], "Viaje para correr en Lima.", [], null, null, null];

const input: TripInput = {
  title: "Maratón de Santiago 2027",
  slug: "maraton-santiago-2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-04-25",
  startDate: "2027-04-23",
  endDate: "2027-04-27",
  distances: ["42K", "21K", "10K"],
  summary: "Viaje para correr la Maratón de Santiago.",
  includes: ["Hotel", "Traslados"],
  priceUsd: 1990,
  capacity: 100,
  imageUrl: "https://example.com/santiago.jpg",
};
const inputParams = [
  "maraton-santiago-2027",
  "Maratón de Santiago 2027",
  "Santiago",
  "Chile",
  "2027-04-25",
  "2027-04-23",
  "2027-04-27",
  '{"42K","21K","10K"}',
  "Viaje para correr la Maratón de Santiago.",
  '{"Hotel","Traslados"}',
  1990,
  100,
  "https://example.com/santiago.jpg",
];

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(connection).mockReset();
});

describe("listPublishedTrips", () => {
  it("waits for connection() before querying", async () => {
    const fake = useFakeDb();
    await listPublishedTrips();

    expect(connection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(fake.query.mock.invocationCallOrder[0]);
  });

  it("selects only the public columns of published trips, by race date and slug", async () => {
    const fake = useFakeDb();
    await listPublishedTrips();

    expect(fake.queries).toHaveLength(1);
    const [select] = fake.queries;
    expect(normalize(select.sql)).toBe(
      `select ${PUBLIC_COLUMNS} from "trips" where "trips"."status" = $1 order by "trips"."race_date" asc, "trips"."slug" asc`,
    );
    expect(select.params).toEqual(["published"]);
    expect(select.sql.split(" from ")[0]).not.toMatch(INTERNAL_COLUMNS);
  });

  it("maps rows to PublicTrip, with priceUsd null when there is no price", async () => {
    useFakeDb({ responses: [[santiagoRow, limaRow]] });

    await expect(listPublishedTrips()).resolves.toEqual([
      santiago,
      {
        slug: "maraton-lima-2027",
        title: "Maratón de Lima",
        city: "Lima",
        country: "Perú",
        raceDate: "2027-05-16",
        startDate: null,
        endDate: null,
        distances: ["42K"],
        summary: "Viaje para correr en Lima.",
        includes: [],
        priceUsd: null,
        capacity: null,
        imageUrl: null,
      },
    ]);
  });

  it("propagates database errors", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(listPublishedTrips()).rejects.toMatchObject({ cause: failure });
  });
});

describe("getPublishedTripBySlug", () => {
  it.each(["Maraton Santiago", "Maraton-Santiago-2027", " maraton-santiago-2027", "ab", "maraton--santiago", ""])(
    "returns null for %j without querying",
    async (slug) => {
      const fake = useFakeDb();
      await expect(getPublishedTripBySlug(slug)).resolves.toBeNull();
      expect(fake.queries).toHaveLength(0);
      expect(connection).toHaveBeenCalledTimes(1);
    },
  );

  it("looks up one published trip by slug after connection()", async () => {
    const fake = useFakeDb({ responses: [[santiagoRow]] });

    await expect(getPublishedTripBySlug("maraton-santiago-2027")).resolves.toEqual(santiago);

    expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(fake.query.mock.invocationCallOrder[0]);
    const [select] = fake.queries;
    expect(normalize(select.sql)).toBe(
      `select ${PUBLIC_COLUMNS} from "trips" where ("trips"."slug" = $1 and "trips"."status" = $2) limit $3`,
    );
    expect(select.params).toEqual(["maraton-santiago-2027", "published", 1]);
  });

  it("returns null when no published trip matches (missing, draft or archived)", async () => {
    useFakeDb();
    await expect(getPublishedTripBySlug("maraton-santiago-2027")).resolves.toBeNull();
  });
});

describe("listTrips", () => {
  it("lists every trip with the archived ones last, then by race date and slug", async () => {
    const fake = useFakeDb();
    await listTrips();

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toMatch(
      /^select "id", .*"status", "sponsor_id", "featured", "review_status", "review_note", "created_at", "updated_at" from "trips" order by "trips"\."status" = 'archived', "trips"\."race_date" asc, "trips"\."slug" asc$/,
    );
    expect(connection).not.toHaveBeenCalled();
  });
});

describe("getTripById", () => {
  it.each(["abc", "nuevo", "123"])("returns null for the non-UUID id %j without querying", async (id) => {
    const fake = useFakeDb();
    await expect(getTripById(id)).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("reads one trip by id", async () => {
    const fake = useFakeDb();
    await expect(getTripById(TRIP_ID)).resolves.toBeNull();

    expect(normalize(fake.queries[0].sql)).toMatch(/^select "id", .* from "trips" where "trips"\."id" = \$1 limit \$2$/);
    expect(fake.queries[0].params).toEqual([TRIP_ID, 1]);
  });
});

describe("createTrip", () => {
  it("inserts the input as a draft, ignoring a status in the input, and returns the id", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });

    await expect(createTrip({ ...input, status: "published" } as TripInput)).resolves.toEqual({ id: TRIP_ID });

    expect(fake.queries).toHaveLength(1);
    const [insert] = fake.queries;
    // id, status, sponsor_id, featured, review_status, review_note, created_at and updated_at are left to the column defaults.
    expect(normalize(insert.sql)).toBe(
      'insert into "trips" ("id", "slug", "title", "city", "country", "race_date", "start_date", "end_date", "distances", "summary", "includes", "price_usd", "capacity", "image_url", "status", "sponsor_id", "featured", "review_status", "review_note", "created_at", "updated_at") ' +
        "values (default, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, default, default, default, default, default, default, default) " +
        'on conflict ("slug") do nothing returning "id"',
    );
    expect(insert.params).toEqual(inputParams);
  });

  it("returns slug_taken when the insert hits the unique slug", async () => {
    useFakeDb({ responses: [[]] });
    await expect(createTrip(input)).resolves.toBe("slug_taken");
  });
});

describe("updateTrip", () => {
  it("sends one batch: a guarded UPDATE that sets updated_at, then the current status and slug", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]], [["draft", input.slug]]] });

    await expect(updateTrip(TRIP_ID, input)).resolves.toBe("updated");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.transaction.mock.calls[0][0]).toHaveLength(2);
    expect(fake.queries).toHaveLength(2);
    const [update, select] = fake.queries;
    expect(normalize(update.sql)).toBe(
      'update "trips" set "slug" = $1, "title" = $2, "city" = $3, "country" = $4, "race_date" = $5, "start_date" = $6, "end_date" = $7, ' +
        '"distances" = $8, "summary" = $9, "includes" = $10, "price_usd" = $11, "capacity" = $12, "image_url" = $13, "updated_at" = now() ' +
        'where ("trips"."id" = $14 and "trips"."status" <> $15 and ("trips"."status" = $16 or "trips"."slug" = $17) ' +
        'and not exists (select 1 from "trips" "other" where ("other"."slug" = $18 and "other"."id" <> $19))) returning "id"',
    );
    expect(update.params).toEqual([...inputParams, TRIP_ID, "archived", "draft", input.slug, input.slug, TRIP_ID]);
    expect(normalize(select.sql)).toBe('select "status", "slug" from "trips" where "trips"."id" = $1');
    expect(select.params).toEqual([TRIP_ID]);
  });

  it.each([
    ["not_found", []],
    ["archived", [["archived", input.slug]]],
    ["slug_locked", [["published", "otro-slug"]]],
    ["slug_taken", [["draft", "otro-slug"]]],
    ["slug_taken", [["published", input.slug]]],
  ])("returns %s when nothing is updated and the trip reads %j", async (expected, current) => {
    useFakeDb({ responses: [[], current] });
    await expect(updateTrip(TRIP_ID, input)).resolves.toBe(expected);
  });
});

describe("setTripStatus", () => {
  it.each([
    ["published", ["draft"]],
    ["draft", ["published"]],
    ["archived", ["draft", "published"]],
  ] as const)("moves to %s only from %j and sets updated_at", async (status, sources) => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });

    await expect(setTripStatus(TRIP_ID, status)).resolves.toBe("changed");

    expect(fake.queries).toHaveLength(1);
    const placeholders = sources.map((_, index) => `$${index + 3}`).join(", ");
    expect(normalize(fake.queries[0].sql)).toBe(
      `update "trips" set "status" = $1, "updated_at" = now() where ("trips"."id" = $2 and "trips"."status" in (${placeholders})) returning "id"`,
    );
    expect(fake.queries[0].params).toEqual([status, TRIP_ID, ...sources]);
  });

  it("returns invalid_transition when no row matches (missing trip or disallowed source)", async () => {
    useFakeDb({ responses: [[]] });
    await expect(setTripStatus(TRIP_ID, "published")).resolves.toBe("invalid_transition");
  });
});
