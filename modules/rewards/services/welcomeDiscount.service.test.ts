// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createEmbeddedDb } from "@/lib/testing/embeddedDb";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { createWelcomeDiscountVersion, getActiveWelcomeDiscount, listWelcomeDiscountVersions } from "./welcomeDiscount.service";

// Only this isolated, in-memory database. Never Neon or a network connection.
describe("welcome discount configuration against PostgreSQL", () => {
  let pg: PGlite;
  let embedded: Awaited<ReturnType<typeof createEmbeddedDb>>;

  beforeAll(async () => {
    embedded = await createEmbeddedDb();
    pg = embedded.pg;
  }, 30000);
  afterAll(async () => {
    await pg?.close();
  });

  beforeEach(async () => {
    await pg.exec("TRUNCATE welcome_discount_versions, profiles RESTART IDENTITY CASCADE");
    await pg.query("INSERT INTO profiles(user_id,email) VALUES ('staff','staff@example.test')");
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockReturnValue(embedded.db as ReturnType<typeof getDb>);
  });

  async function rows() {
    const result = await pg.query<{ id: string; amount_usd: number; validity_days: number; active: boolean; created_by: string }>(
      "SELECT id,amount_usd,validity_days,active,created_by FROM welcome_discount_versions ORDER BY created_at,id",
    );
    return result.rows;
  }

  it("returns null when no version exists", async () => {
    await expect(getActiveWelcomeDiscount()).resolves.toBeNull();
    await expect(listWelcomeDiscountVersions(10)).resolves.toEqual([]);
  });

  it("creates an active version recorded with the server actor", async () => {
    const result = await createWelcomeDiscountVersion("staff", { amountUsd: 50, validityDays: 60, active: true });
    expect(result).toMatchObject({ status: "success", code: "created", id: expect.any(String) });
    await expect(getActiveWelcomeDiscount()).resolves.toEqual({ id: result.id, amountUsd: 50, validityDays: 60 });
    expect(await rows()).toEqual([{ id: result.id, amount_usd: 50, validity_days: 60, active: true, created_by: "staff" }]);
  });

  it("replaces the active version with a new one and keeps the previous as history", async () => {
    const first = await createWelcomeDiscountVersion("staff", { amountUsd: 50, validityDays: 60, active: true });
    const second = await createWelcomeDiscountVersion("staff", { amountUsd: 75, validityDays: 30, active: true });
    await expect(getActiveWelcomeDiscount()).resolves.toEqual({ id: second.id, amountUsd: 75, validityDays: 30 });
    const stored = await rows();
    expect(stored).toHaveLength(2);
    expect(stored.filter((row) => row.active).map((row) => row.id)).toEqual([second.id]);
    // The previous version keeps its values; only `active` changed.
    expect(stored.find((row) => row.id === first.id)).toMatchObject({ amount_usd: 50, validity_days: 60, active: false });
  });

  it("turns the discount off with an inactive version", async () => {
    await createWelcomeDiscountVersion("staff", { amountUsd: 50, validityDays: 60, active: true });
    const off = await createWelcomeDiscountVersion("staff", { amountUsd: 50, validityDays: 60, active: false });
    expect(off).toMatchObject({ status: "success", code: "created" });
    await expect(getActiveWelcomeDiscount()).resolves.toBeNull();
    expect((await rows()).every((row) => !row.active)).toBe(true);
  });

  it("lists the latest versions first, bounded, without creator data", async () => {
    await createWelcomeDiscountVersion("staff", { amountUsd: 10, validityDays: 5, active: true });
    await createWelcomeDiscountVersion("staff", { amountUsd: 20, validityDays: 6, active: true });
    const third = await createWelcomeDiscountVersion("staff", { amountUsd: 30, validityDays: 7, active: false });
    const list = await listWelcomeDiscountVersions(2);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: third.id, amountUsd: 30, validityDays: 7, active: false, createdAt: expect.any(String) });
    expect(list[1]).toMatchObject({ amountUsd: 20, validityDays: 6, active: false });
    expect(JSON.stringify(list)).not.toMatch(/staff/);
    await expect(listWelcomeDiscountVersions(0)).resolves.toHaveLength(1);
    await expect(listWelcomeDiscountVersions(1000)).resolves.toHaveLength(3);
  });

  it("accepts the range limits", async () => {
    await createWelcomeDiscountVersion("staff", { amountUsd: 1, validityDays: 1, active: false });
    await createWelcomeDiscountVersion("staff", { amountUsd: 10000, validityDays: 365, active: true });
    await expect(getActiveWelcomeDiscount()).resolves.toMatchObject({ amountUsd: 10000, validityDays: 365 });
  });

  it.each([
    { amountUsd: 0, validityDays: 30 },
    { amountUsd: 10001, validityDays: 30 },
    { amountUsd: 50, validityDays: 0 },
    { amountUsd: 50, validityDays: 366 },
  ])("rejects out-of-range values $amountUsd/$validityDays without changing the active version", async (input) => {
    const active = await createWelcomeDiscountVersion("staff", { amountUsd: 50, validityDays: 60, active: true });
    const error = await createWelcomeDiscountVersion("staff", { ...input, active: true }).catch((value: unknown) => value);
    expect(error).toEqual(new Error("welcome discount: operation failed"));
    await expect(getActiveWelcomeDiscount()).resolves.toEqual({ id: active.id, amountUsd: 50, validityDays: 60 });
    expect(await rows()).toHaveLength(1);
  });

  it("does not expose driver details when the database fails", async () => {
    vi.mocked(getDb).mockReturnValue({
      execute: vi.fn().mockRejectedValue(new Error("postgres://password staff@example.test")),
    } as unknown as ReturnType<typeof getDb>);
    const error = await getActiveWelcomeDiscount().catch((value: unknown) => value);
    expect(String(error)).not.toMatch(/password|staff@/);
  });
});
