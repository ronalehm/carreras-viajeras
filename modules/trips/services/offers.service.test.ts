// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { connection } from "next/server";
import { getDb } from "@/lib/db";
import type { CreateOfferInput, OfferInput } from "../types/offers.types";
import {
  activateOffer,
  approveOffer,
  closeOffer,
  createOfferDraft,
  createOfferVersionFrom,
  getActiveOffer,
  getOfferById,
  getPublicOffer,
  listOffers,
  updateOfferDraft,
} from "./offers.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (same pattern as trips.service.test.ts): records every statement and
// answers each one, in order, with the given rows.
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
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const OFFER_ID = "0d9f4a52-7c1b-4e3a-9b8d-2f6e1a0c3b4d";
const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
const CAMPAIGN_ID = "5b2d7c1e-4a3f-4e8b-9c6d-1f0e2a3b4c5d";
const NEXT_ID = "3c1e2d4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const TODAY = "(now() AT TIME ZONE 'America/Lima')::date";

const LIST_COLUMNS =
  '"trip_offers"."id", "trip_offers"."version", "trip_offers"."status", "trip_offers"."name", "trips"."id", "trips"."slug", "trips"."title", ' +
  '"campaigns"."id", "campaigns"."code", "campaigns"."name", "campaigns"."status", "trip_offers"."final_price_usd", "trip_offers"."valid_from", ' +
  '"trip_offers"."valid_until", "trip_offers"."approved_at", "trip_offers"."activated_at", "trip_offers"."closed_at"';
const LIST_JOINS =
  'inner join "trips" on "trips"."id" = "trip_offers"."trip_id" left join "campaigns" on "campaigns"."id" = "trip_offers"."campaign_id"';
// Requirement 4 on the offer itself: active and within its Lima calendar dates (inclusive).
const IN_FORCE =
  `("trip_offers"."status" = $3 and "trip_offers"."valid_from" <= ${TODAY} and ` +
  `("trip_offers"."valid_until" is null or "trip_offers"."valid_until" >= ${TODAY}))`;
// The campaign's trip must be the offer's trip (Requirement 4).
const CAMPAIGN_JOIN =
  'left join "campaigns" on ("campaigns"."id" = "trip_offers"."campaign_id" and "campaigns"."trip_id" = "trip_offers"."trip_id")';
// Approved, started, not ended, trip not archived and active campaign (Requirement 2, Decision 4).
const activatable = (table: string, first: number) =>
  `("${table}"."status" = $${first} and "${table}"."valid_from" <= ${TODAY} and ` +
  `("${table}"."valid_until" is null or "${table}"."valid_until" >= ${TODAY}) and ` +
  `exists (select 1 from "trips" where ("trips"."id" = "${table}"."trip_id" and "trips"."status" <> $${first + 1})) and ` +
  `("${table}"."campaign_id" is null or exists (select 1 from "campaigns" where ("campaigns"."id" = "${table}"."campaign_id" and "campaigns"."status" = $${first + 2}))))`;

// List row in select order (array mode), as the Neon HTTP driver returns it.
function listRow(overrides: Record<number, unknown> = {}) {
  const row: unknown[] = [
    OFFER_ID,
    1,
    "active",
    "Oferta general",
    TRIP_ID,
    "maraton-santiago-2027",
    "Maratón de Santiago 2027",
    null,
    null,
    null,
    null,
    1800,
    "2026-11-01",
    null,
    "2026-10-20 15:30:00+00",
    "2026-10-21 10:00:00+00",
    null,
  ];
  for (const [position, value] of Object.entries(overrides)) row[Number(position)] = value;
  return row;
}
const listItem = {
  id: OFFER_ID,
  version: 1,
  status: "active",
  name: "Oferta general",
  trip: { id: TRIP_ID, slug: "maraton-santiago-2027", title: "Maratón de Santiago 2027" },
  campaign: null,
  finalPriceUsd: 1800,
  validFrom: "2026-11-01",
  validUntil: null,
  approvedAt: new Date("2026-10-20T15:30:00Z"),
  activatedAt: new Date("2026-10-21T10:00:00Z"),
  closedAt: null,
};

const input: OfferInput = {
  name: "Oferta general",
  totalPriceUsd: 2000,
  discountUsd: 200,
  depositOptionsUsd: [100, 200],
  balanceDueOn: "2027-03-15",
  bonusDescription: "Polo oficial",
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  capacityLimit: 50,
  termsVersion: "santiago-2027-v1",
  conditions: "Condiciones de pago y cancelación.",
};
const createInput: CreateOfferInput = { ...input, tripId: TRIP_ID, campaignId: null };
// Fields that must never come from the input (status, scope changes and audit).
const intruderFields = {
  status: "active",
  version: 7,
  finalPriceUsd: 1,
  approvedBy: "intruder",
  approvedAt: new Date("2020-01-01T00:00:00Z"),
  activatedBy: "intruder",
  closedBy: "intruder",
  createdBy: "intruder",
  supersededBy: NEXT_ID,
};

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(connection).mockClear();
});

describe("listOffers", () => {
  it("reads every version with its trip and campaign in one query, general offer before campaigns", async () => {
    const fake = useFakeDb({
      responses: [[listRow(), listRow({ 0: NEXT_ID, 7: CAMPAIGN_ID, 8: "mml26", 9: "QR stand MML", 10: "closed" })]],
    });

    await expect(listOffers()).resolves.toEqual([
      listItem,
      { ...listItem, id: NEXT_ID, campaign: { id: CAMPAIGN_ID, code: "mml26", name: "QR stand MML", status: "closed" } },
    ]);

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${LIST_COLUMNS} from "trip_offers" ${LIST_JOINS} order by "trips"."race_date" asc, "trips"."slug" asc, "campaigns"."code" asc nulls first, "trip_offers"."version" desc`,
    );
    expect(fake.queries[0].params).toEqual([]);
  });

  it("returns an empty list when there are no offers", async () => {
    useFakeDb({ responses: [[]] });
    await expect(listOffers()).resolves.toEqual([]);
  });
});

describe("getOfferById", () => {
  // listRow + total, discount, deposits, balance, bonus, capacity, terms, conditions, created_at,
  // creator, approver, activator, closer emails and successor version.
  const detailRow = (overrides: unknown[] = []) => [
    ...listRow({ 2: "closed", 16: "2026-10-25 18:00:00+00" }),
    2000,
    200,
    [100, 200],
    "2027-03-15",
    "Polo oficial",
    50,
    "santiago-2027-v1",
    "Condiciones de pago y cancelación.",
    "2026-10-19 12:00:00+00",
    "agent@example.com",
    "admin@example.com",
    "admin@example.com",
    "other@example.com",
    2,
    ...overrides,
  ];

  it("returns null without querying when the id is not a UUID", async () => {
    const fake = useFakeDb();
    await expect(getOfferById("abc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("returns null when the offer does not exist", async () => {
    useFakeDb({ responses: [[], []] });
    await expect(getOfferById(OFFER_ID)).resolves.toBeNull();
  });

  it("reads the version with its authors and successor, and the history of its scope, in one batch", async () => {
    const fake = useFakeDb({
      responses: [[detailRow()], [listRow({ 0: NEXT_ID, 1: 2 }), listRow({ 2: "closed" })]],
    });

    await expect(getOfferById(OFFER_ID)).resolves.toEqual({
      ...listItem,
      status: "closed",
      closedAt: new Date("2026-10-25T18:00:00Z"),
      totalPriceUsd: 2000,
      discountUsd: 200,
      depositOptionsUsd: [100, 200],
      balanceDueOn: "2027-03-15",
      bonusDescription: "Polo oficial",
      capacityLimit: 50,
      termsVersion: "santiago-2027-v1",
      conditions: "Condiciones de pago y cancelación.",
      createdAt: new Date("2026-10-19T12:00:00Z"),
      createdBy: { email: "agent@example.com" },
      approvedBy: { email: "admin@example.com" },
      activatedBy: { email: "admin@example.com" },
      closedBy: { email: "other@example.com" },
      supersededByVersion: 2,
      history: [
        { ...listItem, id: NEXT_ID, version: 2 },
        { ...listItem, status: "closed" },
      ],
    });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${LIST_COLUMNS}, "trip_offers"."total_price_usd", "trip_offers"."discount_usd", "trip_offers"."deposit_options_usd", ` +
        '"trip_offers"."balance_due_on", "trip_offers"."bonus_description", "trip_offers"."capacity_limit", "trip_offers"."terms_version", ' +
        '"trip_offers"."conditions", "trip_offers"."created_at", "creator"."email", "approver"."email", "activator"."email", "closer"."email", ' +
        `"successor"."version" from "trip_offers" ${LIST_JOINS} ` +
        'inner join "profiles" "creator" on "creator"."user_id" = "trip_offers"."created_by" ' +
        'left join "profiles" "approver" on "approver"."user_id" = "trip_offers"."approved_by" ' +
        'left join "profiles" "activator" on "activator"."user_id" = "trip_offers"."activated_by" ' +
        'left join "profiles" "closer" on "closer"."user_id" = "trip_offers"."closed_by" ' +
        'left join "trip_offers" "successor" on "successor"."id" = "trip_offers"."superseded_by" ' +
        'where "trip_offers"."id" = $1 limit $2',
    );
    expect(fake.queries[0].params).toEqual([OFFER_ID, 1]);
    expect(normalize(fake.queries[1].sql)).toBe(
      `select ${LIST_COLUMNS} from "trip_offers" inner join "trip_offers" "scope" on ("scope"."trip_id" = "trip_offers"."trip_id" ` +
        `and "scope"."campaign_id" IS NOT DISTINCT FROM "trip_offers"."campaign_id") ${LIST_JOINS} ` +
        'where "scope"."id" = $1 order by "trip_offers"."version" desc',
    );
    expect(fake.queries[1].params).toEqual([OFFER_ID]);
  });

  it("returns null authors and successor for a draft", async () => {
    const draft = [...listRow({ 2: "draft", 14: null, 15: null }), ...detailRow().slice(17, 26), "agent@example.com", null, null, null, null];
    useFakeDb({ responses: [[draft], [listRow({ 2: "draft", 14: null, 15: null })]] });

    await expect(getOfferById(OFFER_ID)).resolves.toMatchObject({
      status: "draft",
      approvedAt: null,
      createdBy: { email: "agent@example.com" },
      approvedBy: null,
      activatedBy: null,
      closedBy: null,
      supersededByVersion: null,
    });
  });
});

describe("createOfferDraft", () => {
  const CREATE_SQL =
    "WITH trip AS ( SELECT id FROM trips WHERE id = $1::uuid AND status <> 'archived' ), " +
    "campaign AS ( SELECT $2::uuid IS NULL OR EXISTS ( SELECT 1 FROM campaigns WHERE id = $3::uuid AND trip_id = $4::uuid AND status = 'active' ) AS ok ), " +
    "inserted AS ( INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, discount_usd, deposit_options_usd, balance_due_on, " +
    "bonus_description, valid_from, valid_until, capacity_limit, terms_version, conditions, created_by) " +
    "SELECT trip.id, $5::uuid, coalesce(( SELECT max(version) FROM trip_offers WHERE trip_id = trip.id AND campaign_id IS NOT DISTINCT FROM $6::uuid ), 0) + 1, " +
    "$7, $8::integer, $9::integer, $10::integer[], $11::date, $12, $13::date, $14::date, $15::integer, $16, $17, $18 " +
    "FROM trip, campaign WHERE campaign.ok ON CONFLICT DO NOTHING RETURNING id ) " +
    "SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM trip) AS trip_ok, (SELECT ok FROM campaign) AS campaign_ok";

  it("inserts a draft in a single statement: version = latest of the scope + 1, authored by the actor", async () => {
    const fake = useFakeDb({ responses: [[{ id: NEXT_ID, trip_ok: true, campaign_ok: true }]] });

    await expect(createOfferDraft({ ...createInput, campaignId: CAMPAIGN_ID }, "user-1")).resolves.toEqual({ id: NEXT_ID });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toBe(CREATE_SQL);
    expect(fake.queries[0].params).toEqual([
      TRIP_ID,
      CAMPAIGN_ID,
      CAMPAIGN_ID,
      TRIP_ID,
      CAMPAIGN_ID,
      CAMPAIGN_ID,
      "Oferta general",
      2000,
      200,
      "{100,200}",
      "2027-03-15",
      "Polo oficial",
      "2026-11-01",
      "2026-11-30",
      50,
      "santiago-2027-v1",
      "Condiciones de pago y cancelación.",
      "user-1",
    ]);
  });

  it("sends a general offer (no campaign), no deposits and blank optional fields as nulls", async () => {
    const fake = useFakeDb({ responses: [[{ id: NEXT_ID, trip_ok: true, campaign_ok: true }]] });
    await createOfferDraft(
      { ...createInput, depositOptionsUsd: [], balanceDueOn: null, bonusDescription: null, validUntil: null, capacityLimit: null },
      "user-1",
    );
    const params = fake.queries[0].params;
    expect([params[1], params[2], params[4], params[5]]).toEqual([null, null, null, null]);
    expect(params.slice(9, 15)).toEqual(["{}", null, null, "2026-11-01", null, null]);
  });

  it("never takes status, version, final price or audit from the input: defaults and the actor apply", async () => {
    const fake = useFakeDb({ responses: [[{ id: NEXT_ID, trip_ok: true, campaign_ok: true }]] });
    await createOfferDraft({ ...createInput, ...intruderFields } as CreateOfferInput, "user-1");

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(CREATE_SQL);
    expect(statement).not.toMatch(/status,|final_price_usd|approved_|activated_|closed_|superseded_by|updated_at/);
    for (const value of Object.values(intruderFields)) expect(fake.queries[0].params).not.toContain(value);
  });

  it.each([
    [{ id: null, trip_ok: false, campaign_ok: true }, "invalid_trip"],
    [{ id: null, trip_ok: false, campaign_ok: false }, "invalid_trip"],
    [{ id: null, trip_ok: true, campaign_ok: false }, "invalid_campaign"],
    [{ id: null, trip_ok: true, campaign_ok: true }, "pending_exists"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(createOfferDraft(createInput, "user-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(createOfferDraft(createInput, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("createOfferVersionFrom", () => {
  it("copies only the conditions of a non-draft version into a new draft of its scope, in one statement", async () => {
    const fake = useFakeDb({ responses: [[{ id: NEXT_ID, source_ok: true }]] });

    await expect(createOfferVersionFrom(OFFER_ID, "user-1")).resolves.toEqual({ id: NEXT_ID });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(
      "WITH source AS ( SELECT * FROM trip_offers WHERE id = $1::uuid AND status <> 'draft' ), " +
        "inserted AS ( INSERT INTO trip_offers (trip_id, campaign_id, version, name, total_price_usd, discount_usd, deposit_options_usd, " +
        "balance_due_on, bonus_description, valid_from, valid_until, capacity_limit, terms_version, conditions, created_by) " +
        "SELECT source.trip_id, source.campaign_id, ( SELECT max(version) FROM trip_offers WHERE trip_id = source.trip_id " +
        "AND campaign_id IS NOT DISTINCT FROM source.campaign_id ) + 1, source.name, source.total_price_usd, source.discount_usd, " +
        "source.deposit_options_usd, source.balance_due_on, source.bonus_description, source.valid_from, source.valid_until, " +
        "source.capacity_limit, source.terms_version, source.conditions, $2 FROM source ON CONFLICT DO NOTHING RETURNING id ) " +
        "SELECT (SELECT id FROM inserted) AS id, EXISTS (SELECT 1 FROM source) AS source_ok",
    );
    expect(statement).not.toMatch(/source\.(status|approved_|activated_|closed_|superseded_by|created_by|version)/);
    expect(fake.queries[0].params).toEqual([OFFER_ID, "user-1"]);
  });

  it.each([
    [{ id: null, source_ok: false }, "not_found"],
    [{ id: null, source_ok: true }, "pending_exists"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(createOfferVersionFrom(OFFER_ID, "user-1")).resolves.toBe(expected);
  });
});

describe("updateOfferDraft", () => {
  it("updates the conditions only while the version is a draft, setting updated_at, in one batch", async () => {
    const fake = useFakeDb({ responses: [[[OFFER_ID]], [["draft"]]] });

    await expect(updateOfferDraft(OFFER_ID, input)).resolves.toBe("updated");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "trip_offers" set "name" = $1, "total_price_usd" = $2, "discount_usd" = $3, "deposit_options_usd" = $4, "balance_due_on" = $5, ' +
        '"bonus_description" = $6, "valid_from" = $7, "valid_until" = $8, "capacity_limit" = $9, "terms_version" = $10, "conditions" = $11, ' +
        '"updated_at" = now() where ("trip_offers"."id" = $12 and "trip_offers"."status" = $13) returning "id"',
    );
    expect(fake.queries[0].params).toEqual([
      "Oferta general",
      2000,
      200,
      "{100,200}",
      "2027-03-15",
      "Polo oficial",
      "2026-11-01",
      "2026-11-30",
      50,
      "santiago-2027-v1",
      "Condiciones de pago y cancelación.",
      OFFER_ID,
      "draft",
    ]);
    expect(normalize(fake.queries[1].sql)).toBe('select "status" from "trip_offers" where "trip_offers"."id" = $1');
    expect(fake.queries[1].params).toEqual([OFFER_ID]);
  });

  it("never writes status, scope or audit from the input", async () => {
    const fake = useFakeDb({ responses: [[[OFFER_ID]], [["draft"]]] });
    await updateOfferDraft(OFFER_ID, { ...input, ...intruderFields, tripId: NEXT_ID, campaignId: NEXT_ID } as OfferInput);

    expect(normalize(fake.queries[0].sql)).not.toMatch(/"status" = \$\d+,|trip_id|campaign_id|"version"|approved_|activated_|closed_|superseded_by|created_by/);
    expect(fake.queries[0].params).not.toContain("intruder");
    expect(fake.queries[0].params).not.toContain("active");
  });

  it.each([
    [[], "not_found"],
    [[["approved"]], "not_draft"],
    [[["active"]], "not_draft"],
    [[["closed"]], "not_draft"],
  ])("maps an empty update with status rows %j to %s", async (rows, expected) => {
    useFakeDb({ responses: [[], rows] });
    await expect(updateOfferDraft(OFFER_ID, input)).resolves.toBe(expected);
  });
});

describe("approveOffer", () => {
  it("moves a draft whose validity has not ended to approved, with the actor, in one batch", async () => {
    const fake = useFakeDb({ responses: [[[OFFER_ID]], [["approved", false]]] });

    await expect(approveOffer(OFFER_ID, "user-1")).resolves.toBe("approved");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(2);
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "trip_offers" set "status" = $1, "approved_by" = $2, "approved_at" = now() where ("trip_offers"."id" = $3 and ' +
        `"trip_offers"."status" = $4 and ("trip_offers"."valid_until" is null or "trip_offers"."valid_until" >= ${TODAY})) returning "id"`,
    );
    expect(fake.queries[0].params).toEqual(["approved", "user-1", OFFER_ID, "draft"]);
    expect(normalize(fake.queries[1].sql)).toBe(
      `select "status", "valid_until" < ${TODAY} from "trip_offers" where "trip_offers"."id" = $1`,
    );
  });

  it.each([
    [[], "invalid_transition"],
    [[["approved", false]], "invalid_transition"],
    [[["closed", true]], "invalid_transition"],
    [[["draft", null]], "invalid_transition"],
    [[["draft", true]], "expired"],
  ])("maps an empty update with rows %j to %s", async (rows, expected) => {
    useFakeDb({ responses: [[], rows] });
    await expect(approveOffer(OFFER_ID, "user-1")).resolves.toBe(expected);
  });
});

describe("activateOffer", () => {
  const CLOSE_PREVIOUS =
    'update "trip_offers" set "status" = $1, "closed_by" = $2, "closed_at" = now(), "superseded_by" = $3 where ("trip_offers"."status" = $4 ' +
    'and "trip_offers"."id" <> $5 and exists (select 1 from "trip_offers" "candidate" where ("candidate"."id" = $6 and ' +
    '("candidate"."trip_id" = "trip_offers"."trip_id" and "candidate"."campaign_id" IS NOT DISTINCT FROM "trip_offers"."campaign_id") and ' +
    `${activatable("candidate", 7)})))`;
  const ACTIVATE =
    'update "trip_offers" set "status" = $1, "activated_by" = $2, "activated_at" = now() where ("trip_offers"."id" = $3 and ' +
    `${activatable("trip_offers", 4)}) returning "id"`;
  const EXPLAIN =
    `select "trip_offers"."status", "trip_offers"."valid_from" > ${TODAY}, "trip_offers"."valid_until" < ${TODAY}, ` +
    `"trips"."status" = 'archived', "campaigns"."status" = 'closed' from "trip_offers" ${LIST_JOINS} where "trip_offers"."id" = $1`;

  it("is one batch: closes the active version of the scope (superseded by this one), then activates, then explains", async () => {
    const fake = useFakeDb({ responses: [[], [[OFFER_ID]], [["active", false, false, false, null]]] });

    await expect(activateOffer(OFFER_ID, "user-1")).resolves.toBe("activated");

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(3);
    expect(normalize(fake.queries[0].sql)).toBe(CLOSE_PREVIOUS);
    expect(fake.queries[0].params).toEqual(["closed", "user-1", OFFER_ID, "active", OFFER_ID, OFFER_ID, "approved", "archived", "active"]);
    expect(normalize(fake.queries[1].sql)).toBe(ACTIVATE);
    expect(fake.queries[1].params).toEqual(["active", "user-1", OFFER_ID, "approved", "archived", "active"]);
    expect(normalize(fake.queries[2].sql)).toBe(EXPLAIN);
    expect(fake.queries[2].params).toEqual([OFFER_ID]);
  });

  it("closes the previous version only under the same conditions as the activation", async () => {
    const fake = useFakeDb({ responses: [[], [], [["approved", true, false, false, null]]] });
    await activateOffer(OFFER_ID, "user-1");

    const shared = (sql: string) => normalize(sql).replaceAll('"candidate"', '"trip_offers"').replace(/\$\d+/g, "$");
    expect(shared(fake.queries[0].sql)).toContain(shared(activatable("trip_offers", 1)));
    expect(shared(fake.queries[1].sql)).toContain(shared(activatable("trip_offers", 1)));
  });

  it.each([
    [[], "invalid_transition"],
    [[["draft", false, false, false, null]], "invalid_transition"],
    [[["active", false, false, false, null]], "invalid_transition"],
    [[["closed", false, true, false, null]], "invalid_transition"],
    [[["approved", false, false, true, null]], "trip_archived"],
    [[["approved", false, false, false, true]], "campaign_closed"],
    [[["approved", false, true, false, false]], "expired"],
    [[["approved", true, false, false, null]], "not_started"],
    [[["approved", false, null, false, null]], "invalid_transition"],
  ])("maps an empty activation with rows %j to %s", async (rows, expected) => {
    useFakeDb({ responses: [[], [], rows] });
    await expect(activateOffer(OFFER_ID, "user-1")).resolves.toBe(expected);
  });

  it("propagates a rejected batch (e.g. the one-active-per-scope index under a concurrent activation)", async () => {
    const failure = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    useFakeDb({ failWith: failure });
    await expect(activateOffer(OFFER_ID, "user-1")).rejects.toThrow();
  });
});

describe("closeOffer", () => {
  it("closes a draft, approved or active version in one statement, with the actor", async () => {
    const fake = useFakeDb({ responses: [[[OFFER_ID]]] });

    await expect(closeOffer(OFFER_ID, "user-1")).resolves.toBe("closed");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'update "trip_offers" set "status" = $1, "closed_by" = $2, "closed_at" = now() where ("trip_offers"."id" = $3 and ' +
        '"trip_offers"."status" in ($4, $5, $6)) returning "id"',
    );
    expect(fake.queries[0].params).toEqual(["closed", "user-1", OFFER_ID, "draft", "approved", "active"]);
  });

  it("returns invalid_transition when the version is missing or already closed", async () => {
    useFakeDb({ responses: [[]] });
    await expect(closeOffer(OFFER_ID, "user-1")).resolves.toBe("invalid_transition");
  });
});

describe("getActiveOffer", () => {
  const ACTIVE_COLUMNS =
    '"trip_offers"."id", "trip_offers"."trip_id", "trip_offers"."campaign_id", "trip_offers"."version", "trip_offers"."total_price_usd", ' +
    '"trip_offers"."discount_usd", "trip_offers"."final_price_usd", "trip_offers"."deposit_options_usd", "trip_offers"."balance_due_on", ' +
    '"trip_offers"."bonus_description", "trip_offers"."valid_from", "trip_offers"."valid_until", "trip_offers"."capacity_limit", ' +
    '"trip_offers"."terms_version", "trip_offers"."conditions", "trip_offers"."approved_at", "trip_offers"."activated_at"';
  const activeRow = [
    OFFER_ID,
    TRIP_ID,
    CAMPAIGN_ID,
    2,
    1800,
    100,
    1700,
    [],
    null,
    null,
    "2026-11-01",
    "2026-11-30",
    20,
    "santiago-2027-v1",
    "Condiciones de pago y cancelación.",
    "2026-10-20 15:30:00+00",
    "2026-10-21 10:00:00+00",
  ];

  it("resolves the campaign offer first, else the general one, in one query (Requirement 4)", async () => {
    const fake = useFakeDb({ responses: [[activeRow]] });

    await expect(getActiveOffer(TRIP_ID, CAMPAIGN_ID)).resolves.toEqual({
      offerVersionId: OFFER_ID,
      tripId: TRIP_ID,
      campaignId: CAMPAIGN_ID,
      version: 2,
      totalPriceUsd: 1800,
      discountUsd: 100,
      finalPriceUsd: 1700,
      depositOptionsUsd: [],
      balanceDueOn: null,
      bonusDescription: null,
      validFrom: "2026-11-01",
      validUntil: "2026-11-30",
      capacityLimit: 20,
      termsVersion: "santiago-2027-v1",
      conditions: "Condiciones de pago y cancelación.",
      approvedAt: new Date("2026-10-20T15:30:00Z"),
      activatedAt: new Date("2026-10-21T10:00:00Z"),
    });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${ACTIVE_COLUMNS} from "trip_offers" inner join "trips" on "trips"."id" = "trip_offers"."trip_id" ${CAMPAIGN_JOIN} ` +
        `where ("trip_offers"."trip_id" = $1 and "trips"."status" = $2 and ${IN_FORCE} and ` +
        '("trip_offers"."campaign_id" is null or ("campaigns"."id" = $4 and "campaigns"."status" = $5))) ' +
        'order by "trip_offers"."campaign_id" IS NULL limit $6',
    );
    expect(fake.queries[0].params).toEqual([TRIP_ID, "published", "active", CAMPAIGN_ID, "active", 1]);
  });

  it.each([[undefined], [null], ["not-a-uuid"]])("only considers the general offer with campaign %j", async (campaignId) => {
    const fake = useFakeDb({ responses: [[]] });

    await expect(getActiveOffer(TRIP_ID, campaignId)).resolves.toBeNull();

    expect(normalize(fake.queries[0].sql)).toContain(`${IN_FORCE} and "trip_offers"."campaign_id" is null)`);
    expect(fake.queries[0].params).toEqual([TRIP_ID, "published", "active", 1]);
  });

  it("returns null without querying when the trip id is not a UUID", async () => {
    const fake = useFakeDb();
    await expect(getActiveOffer("abc", CAMPAIGN_ID)).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });
});

describe("getPublicOffer", () => {
  const PUBLIC_SELECT =
    'select "trip_offers"."total_price_usd", "trip_offers"."discount_usd", "trip_offers"."final_price_usd", "trip_offers"."deposit_options_usd", ' +
    '"trip_offers"."balance_due_on", "trip_offers"."bonus_description", "trip_offers"."valid_from", "trip_offers"."valid_until", ' +
    '"trip_offers"."terms_version", "trip_offers"."conditions", "latest_rate"."usd_pen", "latest_rate"."created_at" from "trip_offers" ' +
    `inner join "trips" on "trips"."id" = "trip_offers"."trip_id" ${CAMPAIGN_JOIN} ` +
    'left join lateral (select "usd_pen", "created_at" from "exchange_rates" order by "exchange_rates"."created_at" desc, ' +
    '"exchange_rates"."id" desc limit $1) "latest_rate" on true ';
  const IN_FORCE_PUBLIC = IN_FORCE.replace("$3", "$4");
  const publicRow = (rate: unknown[] = ["3.7512", "2026-10-28 14:00:00+00"]) => [
    2000,
    200,
    1800,
    [100, 200],
    "2027-03-15",
    "Polo oficial",
    "2026-11-01",
    null,
    "santiago-2027-v1",
    "Condiciones de pago y cancelación.",
    ...rate,
  ];
  const offer = {
    totalPriceUsd: 2000,
    discountUsd: 200,
    finalPriceUsd: 1800,
    depositOptionsUsd: [100, 200],
    balanceDueOn: "2027-03-15",
    bonusDescription: "Polo oficial",
    validFrom: "2026-11-01",
    validUntil: null,
    termsVersion: "santiago-2027-v1",
    conditions: "Condiciones de pago y cancelación.",
  };

  it("reads the in-force offer of the published trip (campaign first) and the latest exchange rate in one query", async () => {
    const fake = useFakeDb({ responses: [[publicRow()]] });

    await expect(getPublicOffer("maraton-santiago-2027", " MML26 ")).resolves.toEqual({
      offer,
      exchangeRate: { usdPen: "3.7512", effectiveFrom: new Date("2026-10-28T14:00:00Z") },
    });

    expect(connection).toHaveBeenCalledTimes(1);
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `${PUBLIC_SELECT}where ("trips"."slug" = $2 and "trips"."status" = $3 and ${IN_FORCE_PUBLIC} and ` +
        '("trip_offers"."campaign_id" is null or ("campaigns"."code" = $5 and "campaigns"."status" = $6))) ' +
        'order by "trip_offers"."campaign_id" IS NULL limit $7',
    );
    expect(fake.queries[0].params).toEqual([1, "maraton-santiago-2027", "published", "active", "mml26", "active", 1]);
  });

  it("never exposes ids, internal name, campaign, seats or audit", async () => {
    const fake = useFakeDb({ responses: [[publicRow()]] });
    const read = await getPublicOffer("maraton-santiago-2027", null);

    expect(Object.keys(read?.offer ?? {}).sort()).toEqual(Object.keys(offer).sort());
    const selected = normalize(fake.queries[0].sql).split(" from ")[0];
    expect(selected).not.toMatch(/"id"|"name"|"campaign_id"|"capacity_limit"|_by"|"approved_at"|"activated_at"|"status"/);
  });

  it("returns the exchange rate in the canonical 4-decimal text, like exchangeRates.service.ts", async () => {
    useFakeDb({ responses: [[publicRow(["3.75", "2026-10-28 14:00:00+00"])]] });
    await expect(getPublicOffer("maraton-santiago-2027", null)).resolves.toMatchObject({
      exchangeRate: { usdPen: "3.7500" },
    });

    useFakeDb({ responses: [[publicRow(["10", "2026-10-28 14:00:00+00"])]] });
    await expect(getPublicOffer("maraton-santiago-2027", null)).resolves.toMatchObject({
      exchangeRate: { usdPen: "10.0000" },
    });
  });

  it("fails instead of returning an exchange rate outside the column's range", async () => {
    useFakeDb({ responses: [[publicRow(["100.0000", "2026-10-28 14:00:00+00"])]] });
    await expect(getPublicOffer("maraton-santiago-2027", null)).rejects.toThrow("invalid exchange rate row");
  });

  it("returns a null exchange rate when there is none", async () => {
    useFakeDb({ responses: [[publicRow([null, null])]] });
    await expect(getPublicOffer("maraton-santiago-2027", null)).resolves.toEqual({ offer, exchangeRate: null });
  });

  it.each([[null], [""], ["  "], ["ab"], ["mml 26"], ["x".repeat(33)], ["-mml26"]])(
    "treats the campaign code %j as no campaign",
    async (code) => {
      const fake = useFakeDb({ responses: [[]] });

      await expect(getPublicOffer("maraton-santiago-2027", code)).resolves.toBeNull();

      expect(normalize(fake.queries[0].sql)).toBe(
        `${PUBLIC_SELECT}where ("trips"."slug" = $2 and "trips"."status" = $3 and ${IN_FORCE_PUBLIC} and ` +
          '"trip_offers"."campaign_id" is null) order by "trip_offers"."campaign_id" IS NULL limit $5',
      );
      expect(fake.queries[0].params).toEqual([1, "maraton-santiago-2027", "published", "active", 1]);
    },
  );

  it.each([["Maraton-Santiago-2027"], [" maraton-santiago-2027"], ["no"], ["maraton_santiago"]])(
    "returns null without querying for the non-canonical slug %j",
    async (slug) => {
      const fake = useFakeDb();
      await expect(getPublicOffer(slug, "mml26")).resolves.toBeNull();
      expect(connection).toHaveBeenCalledTimes(1);
      expect(fake.queries).toHaveLength(0);
    },
  );
});
