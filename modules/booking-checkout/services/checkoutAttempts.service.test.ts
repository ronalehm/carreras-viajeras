// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { retireCheckoutAttempt } from "./checkoutAttempts.service";

const attempt = { id: "11111111-1111-4111-8111-111111111111", bookingId: "22222222-2222-4222-8222-222222222222", status: "created" as const };
function fakeExecute(rows: unknown[]) {
  const execute = vi.fn().mockResolvedValue({ rows });
  vi.mocked(getDb).mockReturnValue({ execute } as never);
  return () => new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL);
}
beforeEach(() => vi.mocked(getDb).mockReset());

describe("retireCheckoutAttempt", () => {
  it("retires only the observed active status in one statement that also releases the held seat", async () => {
    const query = fakeExecute([{ booking_id: attempt.bookingId }]);
    await expect(retireCheckoutAttempt(attempt, "expired", true)).resolves.toBe(true);
    const { sql, params } = query();
    expect(sql).toMatch(/a\.status = \$\d+::booking_checkout_attempt_status/);
    expect(sql).toContain("a.status IN ('pending', 'created')");
    // Same release as the webhook expiry: held seat released, counter decremented, pending booking cancelled.
    expect(sql).toContain("allocation.status = 'held'");
    expect(sql).toContain("r.kind = 'initial'");
    expect(sql).toContain("greatest(0, counter.allocated_count - 1)");
    expect(sql).toMatch(/SET status = 'cancelled'[\s\S]*b\.status = 'pending'/);
    expect(params).toEqual(expect.arrayContaining(["expired", attempt.id, attempt.bookingId, "created", true]));
  });

  it("releases the seat only while the booking is pending, locking the booking before its seat", async () => {
    const query = fakeExecute([{ booking_id: attempt.bookingId }]);
    await retireCheckoutAttempt(attempt, "expired", true);
    const { sql } = query();
    expect(sql).toMatch(/pending_booking AS MATERIALIZED \(\s*SELECT b\.id, b\.is_simulated FROM "bookings" AS b\s*JOIN retired r ON b\.id = r\.booking_id[\s\S]*b\.status = 'pending'\s*FOR UPDATE OF b/);
    expect(sql).toMatch(/released AS \([\s\S]*FROM pending_booking p\s*WHERE allocation\.booking_id = p\.id AND allocation\.status = 'held'/);
    expect(sql.indexOf("pending_booking AS")).toBeLessThan(sql.indexOf("released AS"));
  });

  it("cancels a simulated pending booking without releasing a seat or touching the counter", async () => {
    const query = fakeExecute([{ booking_id: attempt.bookingId }]);
    await retireCheckoutAttempt(attempt, "expired", true);
    const { sql } = query();
    expect(sql).toMatch(/released AS \([\s\S]*allocation\.status = 'held' AND NOT p\.is_simulated/);
    expect(sql).toMatch(/cancelled AS \([\s\S]*FROM pending_booking p[\s\S]*\(p\.is_simulated OR EXISTS \(SELECT 1 FROM released r WHERE r\.booking_id = p\.id\)\)/);
  });

  it("can retire without releasing the reservation", async () => {
    const query = fakeExecute([{ booking_id: attempt.bookingId }]);
    await retireCheckoutAttempt({ ...attempt, status: "pending" }, "failed", false);
    expect(query().params).toEqual(expect.arrayContaining(["failed", "pending", false]));
  });

  it("reports a lost race (the attempt changed first) without claiming the retirement", async () => {
    fakeExecute([]);
    await expect(retireCheckoutAttempt(attempt, "expired", true)).resolves.toBe(false);
  });
});
