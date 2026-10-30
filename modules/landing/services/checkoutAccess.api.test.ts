import { beforeEach, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

import { fetchCheckoutAvailable } from "./checkoutAccess.api";

beforeEach(() => {
  get.mockReset();
});

it("asks the per-request endpoint and returns its decision", async () => {
  get.mockResolvedValue({ data: { available: true } });

  await expect(fetchCheckoutAvailable()).resolves.toBe(true);
  expect(get).toHaveBeenCalledExactlyOnceWith("/bookings/checkout/access");
});

it("rejects a malformed body", async () => {
  get.mockResolvedValue({ data: { available: "yes" } });

  await expect(fetchCheckoutAvailable()).rejects.toThrow();
});
