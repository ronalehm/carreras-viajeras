// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { connection } from "next/server";
import { getDb } from "@/lib/db";
import type { SponsorInput, SponsorUpdateInput } from "../types/sponsors.types";
import {
  createSponsor,
  getPublicSponsorBySlug,
  getSponsorById,
  listSponsors,
  updateSponsor,
} from "./sponsors.service";

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

const SPONSOR_ID = "5b7f3c2e-1a4d-4e8f-9c0b-6d2a8e4f1b37";
const ACTOR_ID = "admin-1";
const ALL_COLUMNS =
  '"id", "slug", "name", "logo_url", "website_url", "description", "created_by", "created_at", "updated_at"';

const input: SponsorInput = {
  name: "Marca Deportiva",
  slug: "marca-deportiva",
  logoUrl: "https://example.com/logo.png",
  websiteUrl: "https://example.com/",
  description: "Ropa y calzado para corredores.",
};
const editable: SponsorUpdateInput = {
  name: input.name, logoUrl: input.logoUrl, websiteUrl: input.websiteUrl, description: input.description,
};

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(connection).mockReset();
});

describe("listSponsors", () => {
  it("lists every sponsor by name and slug", async () => {
    const fake = useFakeDb();
    await expect(listSponsors()).resolves.toEqual([]);

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${ALL_COLUMNS} from "sponsors" order by "sponsors"."name" asc, "sponsors"."slug" asc`,
    );
  });
});

describe("getSponsorById", () => {
  it.each(["abc", "nuevo", "123", ""])("returns null for the non-UUID id %j without querying", async (id) => {
    const fake = useFakeDb();
    await expect(getSponsorById(id)).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("reads one sponsor by id", async () => {
    const fake = useFakeDb();
    await expect(getSponsorById(SPONSOR_ID)).resolves.toBeNull();

    expect(normalize(fake.queries[0].sql)).toBe(
      `select ${ALL_COLUMNS} from "sponsors" where "sponsors"."id" = $1 limit $2`,
    );
    expect(fake.queries[0].params).toEqual([SPONSOR_ID, 1]);
  });
});

describe("createSponsor", () => {
  it("inserts the input with created_by from the actor and returns the id", async () => {
    const fake = useFakeDb({ responses: [[[SPONSOR_ID]]] });

    await expect(createSponsor({ ...input, createdBy: "attacker" } as SponsorInput, ACTOR_ID))
      .resolves.toEqual({ id: SPONSOR_ID });

    expect(fake.queries).toHaveLength(1);
    const [insert] = fake.queries;
    expect(normalize(insert.sql)).toBe(
      'insert into "sponsors" ("id", "slug", "name", "logo_url", "website_url", "description", "created_by", "created_at", "updated_at") ' +
        "values (default, $1, $2, $3, $4, $5, $6, default, default) " +
        'on conflict ("slug") do nothing returning "id"',
    );
    expect(insert.params).toEqual([
      "marca-deportiva", "Marca Deportiva", "https://example.com/logo.png", "https://example.com/",
      "Ropa y calzado para corredores.", ACTOR_ID,
    ]);
  });

  it("returns slug_taken when the insert hits the unique slug", async () => {
    useFakeDb({ responses: [[]] });
    await expect(createSponsor(input, ACTOR_ID)).resolves.toBe("slug_taken");
  });
});

describe("updateSponsor", () => {
  it("updates the editable columns and updated_at, never slug or created_by", async () => {
    const fake = useFakeDb({ responses: [[[SPONSOR_ID]]] });

    await expect(
      updateSponsor(SPONSOR_ID, { ...editable, slug: "otro-slug", createdBy: "attacker" } as SponsorUpdateInput),
    ).resolves.toBe("updated");

    expect(fake.queries).toHaveLength(1);
    const [update] = fake.queries;
    expect(normalize(update.sql)).toBe(
      'update "sponsors" set "name" = $1, "logo_url" = $2, "website_url" = $3, "description" = $4, "updated_at" = now() ' +
        'where "sponsors"."id" = $5 returning "id"',
    );
    expect(update.params).toEqual([
      "Marca Deportiva", "https://example.com/logo.png", "https://example.com/", "Ropa y calzado para corredores.", SPONSOR_ID,
    ]);
  });

  it("returns not_found when no row matches", async () => {
    useFakeDb({ responses: [[]] });
    await expect(updateSponsor(SPONSOR_ID, editable)).resolves.toBe("not_found");
  });
});

describe("getPublicSponsorBySlug", () => {
  it.each(["Marca Deportiva", "Marca-Deportiva", " marca-deportiva", "ab", "marca--deportiva", ""])(
    "returns null for %j without querying",
    async (slug) => {
      const fake = useFakeDb();
      await expect(getPublicSponsorBySlug(slug)).resolves.toBeNull();
      expect(fake.queries).toHaveLength(0);
      expect(connection).toHaveBeenCalledTimes(1);
    },
  );

  it("selects only the public columns after connection()", async () => {
    const fake = useFakeDb({
      responses: [[["marca-deportiva", "Marca Deportiva", null, "https://example.com/", null]]],
    });

    await expect(getPublicSponsorBySlug("marca-deportiva")).resolves.toEqual({
      slug: "marca-deportiva", name: "Marca Deportiva", logoUrl: null, websiteUrl: "https://example.com/", description: null,
    });

    expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(fake.query.mock.invocationCallOrder[0]);
    const [select] = fake.queries;
    expect(normalize(select.sql)).toBe(
      'select "slug", "name", "logo_url", "website_url", "description" from "sponsors" where "sponsors"."slug" = $1 limit $2',
    );
    expect(select.params).toEqual(["marca-deportiva", 1]);
    expect(select.sql.split(" from ")[0]).not.toMatch(/"id"|"created_by"|"created_at"|"updated_at"/);
  });

  it("returns null when no sponsor has that slug", async () => {
    useFakeDb();
    await expect(getPublicSponsorBySlug("marca-deportiva")).resolves.toBeNull();
  });

  it("propagates database errors", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(getPublicSponsorBySlug("marca-deportiva")).rejects.toMatchObject({ cause: failure });
  });
});
