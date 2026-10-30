// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn() }));
vi.mock("@/modules/integrations", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/modules/booking-checkout", () => ({
  prepareCheckoutSchema: {}, isCheckoutSandboxEnabled: vi.fn(), prepareBookingCheckout: vi.fn(),
}));
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { isCheckoutSandboxEnabled, prepareBookingCheckout } from "@/modules/booking-checkout";
import { POST } from "./route";

const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const body = { tripId: "11111111-1111-4111-8111-111111111111", paymentChoice: { kind: "full" }, requestId: "22222222-2222-4222-8222-222222222222" };
function request(origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/bookings/checkout/prepare", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.mocked(isCheckoutSandboxEnabled).mockReset().mockReturnValue(true);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(readJsonBody).mockReset().mockResolvedValue(body);
  vi.mocked(prepareBookingCheckout).mockReset();
});
describe("POST /api/bookings/checkout/prepare", () => {
  it("fails closed while checkout is disabled", async () => {
    vi.mocked(isCheckoutSandboxEnabled).mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects cross-origin requests before auth or persistence", async () => {
    const response = await POST(request("https://attacker.example"));
    expect(response.status).toBe(403);
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
    expect(prepareBookingCheckout).not.toHaveBeenCalled();
  });
  it("rejects invalid input without preparing a booking", async () => {
    vi.mocked(readJsonBody).mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(prepareBookingCheckout).not.toHaveBeenCalled();
  });
  it("returns server-derived reservation and quote without caching", async () => {
    vi.mocked(prepareBookingCheckout).mockResolvedValue({
      bookingId: "33333333-3333-4333-8333-333333333333", tripTitle: "Carrera demo", offerVersion: 2,
      quote: { totalUsd: 1000, principalUsd: 250, balanceUsd: 750, rateId: "rate-1", rateUsdPen: "3.7500", amountPenCents: 93750 },
      checkoutQuotes: { initial: { amountUsd: 250, amountPenCents: 93750, quoteHash: "c".repeat(64) },
        balance: { amountUsd: 750, amountPenCents: 281250, quoteHash: "d".repeat(64) } },
      contract: { versionKey: "terms-v1", title: "Terms", body: "Approved contract content", documentHash: "a".repeat(64), sandboxOnly: false },
      documentSnapshot: "snapshot", documentHash: "b".repeat(64), expiresAt: new Date("2026-10-29T20:00:00Z"),
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prepareBookingCheckout).toHaveBeenCalledWith(body, user);
    await expect(response.json()).resolves.toMatchObject({ bookingId: "33333333-3333-4333-8333-333333333333" });
  });
  it("maps known reservation outcomes without exposing database errors", async () => {
    vi.mocked(prepareBookingCheckout).mockResolvedValue("sold_out");
    const response = await POST(request());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "sold_out" });
  });
});
