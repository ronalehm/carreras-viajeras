// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { getBookingBalance } from "./bookingBalance.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (pattern of staff.service.test.ts): records every statement and answers
// each one, in order, with the given rows.
function useFakeDb(responses: unknown[][] = []) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query, { transaction }) as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getBookingBalance", () => {
  it("adds non-voided manual payments and applied Stripe settlements; needs_review comes apart", async () => {
    const fake = useFakeDb([
      // Totals in select order: id, total, manual paid (bigint as text).
      [[A, "1499", "300"]],
      // Settlements in select order: id, booking, amount, paid at, status.
      [
        ["set-1", A, "200", new Date("2026-03-06T03:00:00Z"), "applied"],
        ["set-2", A, "500", new Date("2026-03-07T15:00:00Z"), "needs_review"],
      ],
    ]);

    const balances = await getBookingBalance([A]);
    expect(balances.get(A)).toEqual({
      totalUsd: 1499,
      paidUsd: 500,
      balanceUsd: 999,
      stripePayments: [{ id: "set-1", amountUsd: 200, paidOn: "2026-03-05" }],
      needsReview: [{ id: "set-2", amountUsd: 500, paidOn: "2026-03-07" }],
    });

    // One batch, two statements, whatever the number of bookings.
    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.queries).toHaveLength(2);
    const [totals, settlements] = fake.queries.map((query) => normalize(query.sql));
    expect(totals).toContain(
      'coalesce((select sum(p.amount_usd) from booking_payments p where p.booking_id = bookings.id and p.voided_at is null), 0)',
    );
    expect(totals).toMatch(/from "bookings" where "bookings"\."id" in \(\$1\)$/);
    expect(fake.queries[0].params).toEqual([A]);
    expect(settlements).toContain('from "booking_stripe_settlements" where "booking_stripe_settlements"."booking_id" in ($1)');
    expect(settlements).toMatch(/order by "booking_stripe_settlements"\."paid_at" asc, "booking_stripe_settlements"\."recorded_at" asc$/);
  });

  it("computes several bookings in the same two statements (no N+1)", async () => {
    const fake = useFakeDb([
      [[A, "1000", "0"], [B, "800", "800"]],
      [["set-1", A, "1000", new Date("2026-03-06T15:00:00Z"), "applied"]],
    ]);

    const balances = await getBookingBalance([A, B, A]);
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[0].params).toEqual([A, B]);
    expect(balances.get(A)).toMatchObject({ paidUsd: 1000, balanceUsd: 0 });
    expect(balances.get(B)).toEqual({ totalUsd: 800, paidUsd: 800, balanceUsd: 0, stripePayments: [], needsReview: [] });
  });

  it("counts only needs_review as not paid: the balance stays whole", async () => {
    useFakeDb([[[A, "300", "0"]], [["set-1", A, "300", new Date("2026-03-06T15:00:00Z"), "needs_review"]]]);
    await expect(getBookingBalance([A])).resolves.toEqual(new Map([[A, {
      totalUsd: 300,
      paidUsd: 0,
      balanceUsd: 300,
      stripePayments: [],
      needsReview: [{ id: "set-1", amountUsd: 300, paidOn: "2026-03-06" }],
    }]]));
  });

  it.each([
    ["no ids", []],
    ["a non-UUID id", [A, "not-a-uuid"]],
  ])("returns an empty map without a query for %s", async (_, ids) => {
    const fake = useFakeDb();
    await expect(getBookingBalance(ids)).resolves.toEqual(new Map());
    expect(fake.queries).toHaveLength(0);
  });
});
