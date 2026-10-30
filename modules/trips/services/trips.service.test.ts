// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { connection } from "next/server";
import { getDb } from "@/lib/db";
import type { TripInput, TripScope } from "../types/trips.types";
import {
  createTrip,
  getPublishedTripBySlug,
  getPublishedTripIdBySlug,
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
  '"slug", "title", "city", "country", "race_date", "start_date", "end_date", "distances", "summary", "includes", "capacity", "image_url", ' +
  '"official_url", "excludes", "notes"';
const PRICE_COLUMNS = /"price_usd"|"installments_price_usd"|"deposit_usd"|"companion_price_usd"|"payment_terms"/;
const INTERNAL_COLUMNS = /"id"|"status"|"created_at"|"updated_at"|"organizer_id"|"sponsor_id"|"featured"|"review_status"|"review_note"/;

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
  100,
  "https://example.com/santiago.jpg",
  "https://maratondesantiago.cl/",
  ["Vuelos internos"],
  "Horario por confirmar.",
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
  capacity: 100,
  imageUrl: "https://example.com/santiago.jpg",
  officialUrl: "https://maratondesantiago.cl/",
  excludes: ["Vuelos internos"],
  notes: "Horario por confirmar.",
};
const limaRow = [
  "maraton-lima-2027",
  "Maratón de Lima",
  "Lima",
  "Perú",
  "2027-05-16",
  null,
  null,
  ["42K"],
  "Viaje para correr en Lima.",
  [],
  null,
  null,
  null,
  [],
  null,
];

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
  capacity: 100,
  imageUrl: "https://example.com/santiago.jpg",
  officialUrl: "https://maratondesantiago.cl/",
  excludes: ["Vuelos internos"],
  notes: "Horario por confirmar.",
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
  100,
  "https://example.com/santiago.jpg",
  "https://maratondesantiago.cl/",
  '{"Vuelos internos"}',
  "Horario por confirmar.",
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
    expect(select.sql).not.toMatch(PRICE_COLUMNS);
  });

  it("maps rows to PublicTrip, with null optional fields", async () => {
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
        capacity: null,
        imageUrl: null,
        officialUrl: null,
        excludes: [],
        notes: null,
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

describe("getPublishedTripIdBySlug", () => {
  it("returns only the internal id of a published slug for the server checkout page", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });
    await expect(getPublishedTripIdBySlug("maraton-santiago-2027")).resolves.toBe(TRIP_ID);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select "id" from "trips" where ("trips"."slug" = $1 and "trips"."status" = $2) limit $3`,
    );
  });

  it("rejects invalid slugs without a database query", async () => {
    const fake = useFakeDb();
    await expect(getPublishedTripIdBySlug("Invalid Slug")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });
});

// CRM scopes (D11): "all" adds no filter; "own" adds "organizer_id" = $n to the same statement.
const ORGANIZER_ID = "user_2organizerAbc";
const ALL: TripScope = { kind: "all" };
const OWN: TripScope = { kind: "own", organizerId: ORGANIZER_ID };
const TRIP_COLUMNS =
  '"id", "slug", "title", "city", "country", "race_date", "start_date", "end_date", "distances", "summary", "includes", "price_usd", "capacity", ' +
  '"image_url", "official_url", "installments_price_usd", "deposit_usd", "companion_price_usd", "payment_terms", "excludes", "notes", "status", ' +
  '"organizer_id", "sponsor_id", "featured", "review_status", "review_note", "created_at", "updated_at"';
const ORDER_BY = `order by "trips"."status" = 'archived', "trips"."race_date" asc, "trips"."slug" asc`;

describe("listTrips", () => {
  it("lists every trip for the all scope, archived last, then by race date and slug", async () => {
    const fake = useFakeDb();
    await listTrips(ALL);

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(`select ${TRIP_COLUMNS} from "trips" ${ORDER_BY}`);
    expect(fake.queries[0].params).toEqual([]);
    expect(connection).not.toHaveBeenCalled();
  });

  it("lists only the organizer's trips for the own scope, in the same order", async () => {
    const fake = useFakeDb();
    await listTrips(OWN);

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${TRIP_COLUMNS} from "trips" where "trips"."organizer_id" = $1 ${ORDER_BY}`,
    );
    expect(fake.queries[0].params).toEqual([ORGANIZER_ID]);
  });
});

describe("getTripById", () => {
  it.each(["abc", "nuevo", "123"])("returns null for the non-UUID id %j without querying", async (id) => {
    const fake = useFakeDb();
    await expect(getTripById(id, ALL)).resolves.toBeNull();
    await expect(getTripById(id, OWN)).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("reads one trip by id for the all scope", async () => {
    const fake = useFakeDb();
    await expect(getTripById(TRIP_ID, ALL)).resolves.toBeNull();

    expect(normalize(fake.queries[0].sql)).toBe(`select ${TRIP_COLUMNS} from "trips" where "trips"."id" = $1 limit $2`);
    expect(fake.queries[0].params).toEqual([TRIP_ID, 1]);
  });

  it("reads one trip by id and organizer for the own scope; another organizer's trip is null", async () => {
    const fake = useFakeDb({ responses: [[]] });
    await expect(getTripById(TRIP_ID, OWN)).resolves.toBeNull();

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${TRIP_COLUMNS} from "trips" where ("trips"."id" = $1 and "trips"."organizer_id" = $2) limit $3`,
    );
    expect(fake.queries[0].params).toEqual([TRIP_ID, ORGANIZER_ID, 1]);
  });
});

describe("createTrip", () => {
  // id, status, created_at and updated_at are left to the column defaults, and so are the old price columns
  // (price_usd, installments_price_usd, deposit_usd, companion_price_usd, payment_terms): never written.
  const INSERT_SQL =
    'insert into "trips" ("id", "slug", "title", "city", "country", "race_date", "start_date", "end_date", "distances", "summary", "includes", "price_usd", "capacity", "image_url", ' +
    '"official_url", "installments_price_usd", "deposit_usd", "companion_price_usd", "payment_terms", "excludes", "notes", "status", "organizer_id", "sponsor_id", "featured", "review_status", "review_note", "created_at", "updated_at") ' +
    "values (default, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, default, $11, $12, $13, default, default, default, default, $14, $15, default, $16, default, default, default, default, default, default) " +
    'on conflict ("slug") do nothing returning "id"';
  const withExtras = {
    ...input,
    status: "published",
    organizerId: "user_intruder",
    sponsorId: "8a6e0804-2bd0-4672-b79d-d97027f9071a",
    featured: true,
    reviewStatus: "changes_requested",
    reviewNote: "Untrusted note",
    priceUsd: 1990,
    depositUsd: 300,
    paymentTerms: "Reserva",
  } as TripInput;

  it("inserts a draft with a null organizer for the all scope, ignoring status and organizerId in the input", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });

    await expect(createTrip(withExtras, ALL)).resolves.toEqual({ id: TRIP_ID });

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(INSERT_SQL);
    expect(fake.queries[0].params).toEqual([...inputParams, null]);
  });

  it("inserts a draft owned by the scope's organizer for the own scope, ignoring organizerId in the input", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });

    await expect(createTrip(withExtras, OWN)).resolves.toEqual({ id: TRIP_ID });

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(INSERT_SQL);
    expect(fake.queries[0].params).toEqual([...inputParams, ORGANIZER_ID]);
  });

  it.each([ALL, OWN])("returns slug_taken when the insert hits the unique slug (%j)", async (scope) => {
    useFakeDb({ responses: [[]] });
    await expect(createTrip(input, scope)).resolves.toBe("slug_taken");
  });
});

describe("updateTrip", () => {
  const SET =
    'update "trips" set "slug" = $1, "title" = $2, "city" = $3, "country" = $4, "race_date" = $5, "start_date" = $6, "end_date" = $7, ' +
    '"distances" = $8, "summary" = $9, "includes" = $10, "capacity" = $11, "image_url" = $12, ' +
    '"official_url" = $13, "excludes" = $14, "notes" = $15, "updated_at" = now() ';

  it("sends one batch for the all scope: a guarded UPDATE that sets updated_at, then the current status and slug", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]], [["draft", input.slug]]] });

    await expect(updateTrip(TRIP_ID, input, ALL)).resolves.toBe("updated");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.transaction.mock.calls[0][0]).toHaveLength(2);
    expect(fake.queries).toHaveLength(2);
    const [update, select] = fake.queries;
    expect(normalize(update.sql)).toBe(
      SET +
        'where ("trips"."id" = $16 and "trips"."status" <> $17 and ("trips"."status" = $18 or "trips"."slug" = $19) ' +
        'and not exists (select 1 from "trips" "other" where ("other"."slug" = $20 and "other"."id" <> $21))) returning "id"',
    );
    // The old price columns are not in the SET: saving a trip keeps their stored values.
    expect(update.sql).not.toMatch(PRICE_COLUMNS);
    expect(update.sql).not.toContain('"organizer_id"');
    expect(update.params).toEqual([...inputParams, TRIP_ID, "archived", "draft", input.slug, input.slug, TRIP_ID]);
    expect(normalize(select.sql)).toBe('select "status", "slug" from "trips" where "trips"."id" = $1');
    expect(select.params).toEqual([TRIP_ID]);
  });

  it("adds the organizer to the UPDATE and to the explaining SELECT for the own scope; the slug check stays global", async () => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]], [["draft", input.slug]]] });

    await expect(updateTrip(TRIP_ID, { ...input, organizerId: "user_intruder" } as TripInput, OWN)).resolves.toBe(
      "updated",
    );

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    const [update, select] = fake.queries;
    // organizer_id appears only in the WHERE: the input never sets it.
    expect(normalize(update.sql)).toBe(
      SET +
        'where ("trips"."id" = $16 and "trips"."organizer_id" = $17 and "trips"."status" <> $18 and ("trips"."status" = $19 or "trips"."slug" = $20) ' +
        'and not exists (select 1 from "trips" "other" where ("other"."slug" = $21 and "other"."id" <> $22))) returning "id"',
    );
    expect(update.params).toEqual([
      ...inputParams,
      TRIP_ID,
      ORGANIZER_ID,
      "archived",
      "draft",
      input.slug,
      input.slug,
      TRIP_ID,
    ]);
    expect(normalize(select.sql)).toBe(
      'select "status", "slug" from "trips" where ("trips"."id" = $1 and "trips"."organizer_id" = $2)',
    );
    expect(select.params).toEqual([TRIP_ID, ORGANIZER_ID]);
  });

  it.each([ALL, OWN])("returns not_found when the scoped SELECT reads nothing, e.g. another organizer's trip (%j)", async (scope) => {
    useFakeDb({ responses: [[], []] });
    await expect(updateTrip(TRIP_ID, input, scope)).resolves.toBe("not_found");
  });

  it.each(
    [ALL, OWN].flatMap((scope) => [
      ["archived", [["archived", input.slug]], scope],
      ["slug_locked", [["published", "otro-slug"]], scope],
      ["slug_taken", [["draft", "otro-slug"]], scope],
      ["slug_taken", [["published", input.slug]], scope],
    ]),
  )("returns %s when nothing is updated and the trip reads %j (%j)", async (expected, current, scope) => {
    useFakeDb({ responses: [[], current as unknown[]] });
    await expect(updateTrip(TRIP_ID, input, scope as TripScope)).resolves.toBe(expected);
  });
});

describe("setTripStatus", () => {
  it.each([
    ["published", ["draft"]],
    ["draft", ["published"]],
    ["archived", ["draft", "published"]],
  ] as const)("moves to %s only from %j and sets updated_at (all scope)", async (status, sources) => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });

    await expect(setTripStatus(TRIP_ID, status, ALL)).resolves.toBe("changed");

    expect(fake.queries).toHaveLength(1);
    const placeholders = sources.map((_, index) => `$${index + 3}`).join(", ");
    expect(normalize(fake.queries[0].sql)).toBe(
      `update "trips" set "status" = $1, "updated_at" = now() where ("trips"."id" = $2 and "trips"."status" in (${placeholders})) returning "id"`,
    );
    expect(fake.queries[0].params).toEqual([status, TRIP_ID, ...sources]);
  });

  it.each([
    ["published", ["draft"]],
    ["draft", ["published"]],
    ["archived", ["draft", "published"]],
  ] as const)("moves to %s only from %j and only the organizer's trip (own scope)", async (status, sources) => {
    const fake = useFakeDb({ responses: [[[TRIP_ID]]] });

    await expect(setTripStatus(TRIP_ID, status, OWN)).resolves.toBe("changed");

    expect(fake.queries).toHaveLength(1);
    const placeholders = sources.map((_, index) => `$${index + 4}`).join(", ");
    expect(normalize(fake.queries[0].sql)).toBe(
      `update "trips" set "status" = $1, "updated_at" = now() where ("trips"."id" = $2 and "trips"."organizer_id" = $3 ` +
        `and "trips"."status" in (${placeholders})) returning "id"`,
    );
    expect(fake.queries[0].params).toEqual([status, TRIP_ID, ORGANIZER_ID, ...sources]);
  });

  it.each([ALL, OWN])(
    "returns invalid_transition when no row matches: missing, disallowed source or another organizer's trip (%j)",
    async (scope) => {
      useFakeDb({ responses: [[]] });
      await expect(setTripStatus(TRIP_ID, "published", scope)).resolves.toBe("invalid_transition");
    },
  );
});
