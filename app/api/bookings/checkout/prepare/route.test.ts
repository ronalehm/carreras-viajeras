// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn() }));
vi.mock("@/modules/integrations", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/modules/booking-checkout", async () => ({
  ...await vi.importActual<object>("@/modules/booking-checkout/utils/checkoutResponse"),
  prepareCheckoutSchema: {}, isCheckoutEnabled: vi.fn(), prepareBookingCheckout: vi.fn(),
}));
import { UnauthorizedError } from "@/lib/auth/errors";
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { isCheckoutEnabled, prepareBookingCheckout } from "@/modules/booking-checkout";
import { POST } from "./route";

const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const body = { tripId: "11111111-1111-4111-8111-111111111111", paymentChoice: { kind: "full" }, requestId: "22222222-2222-4222-8222-222222222222" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function request(origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/bookings/checkout/prepare", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(isCheckoutEnabled).mockReset().mockReturnValue(true);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(readJsonBody).mockReset().mockResolvedValue(body);
  vi.mocked(prepareBookingCheckout).mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); error.mockRestore(); });

describe("POST /api/bookings/checkout/prepare", () => {
  it("fails closed while checkout is disabled", async () => {
    vi.mocked(isCheckoutEnabled).mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
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
  it("returns the server-derived reservation without caching", async () => {
    const prepared = {
      bookingId: "33333333-3333-4333-8333-333333333333", tripTitle: "Carrera demo", offerVersion: 2, resumed: false,
      quote: { totalUsd: 1000, principalUsd: 250, balanceUsd: 750, rateUsdPen: "3.7500", amountPenCents: 93750 },
      checkoutQuotes: { initial: { amountUsd: 250, amountPenCents: 93750, quoteHash: "c".repeat(64) },
        balance: { amountUsd: 750, amountPenCents: 281250, quoteHash: "d".repeat(64) } },
      contract: { versionKey: "terms-v1", title: "Terms", testDocument: false },
      documentSnapshot: "snapshot", documentHash: "b".repeat(64), expiresAt: new Date("2026-10-29T20:00:00Z"),
    };
    vi.mocked(prepareBookingCheckout).mockResolvedValue(prepared);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prepareBookingCheckout).toHaveBeenCalledWith(body, user);
    await expect(response.json()).resolves.toEqual({ ...prepared, expiresAt: "2026-10-29T20:00:00.000Z" });
  });
  it.each([
    ["sold_out", 409], ["booking_exists", 409], ["offer_unavailable", 409], ["rate_unavailable", 503],
    ["contract_unavailable", 503], ["invalid_payment_choice", 400],
  ] as const)("answers %s as { code, requestId } with status %i and logs the same reference", async (code, status) => {
    vi.mocked(prepareBookingCheckout).mockResolvedValue(code);
    const response = await POST(request());
    expect(response.status).toBe(status);
    const json = await response.json() as { code: string; requestId: string };
    expect(Object.keys(json).sort()).toEqual(["code", "requestId"]);
    expect(json.code).toBe(code);
    expect(json.requestId).toMatch(UUID);
    const logged = [...warn.mock.calls, ...error.mock.calls].map(call => JSON.stringify(call)).join("\n");
    expect(logged).toContain(json.requestId);
    expect(logged).toContain(code);
  });
  it("keeps the 401 semantics of an unauthenticated runner", async () => {
    vi.mocked(requireVerifiedEmail).mockRejectedValue(new UnauthorizedError());
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "unauthorized", requestId: expect.stringMatching(UUID) });
  });
  it("hides internal failures behind an opaque internal code", async () => {
    vi.mocked(prepareBookingCheckout).mockRejectedValue(new Error("select * from bookings where email = 'runner@example.invalid'"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    const json = await response.json() as { code: string; requestId: string };
    expect(json).toEqual({ code: "internal", requestId: expect.stringMatching(UUID) });
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain(json.requestId);
    expect(logged).not.toContain("select");
    expect(logged).not.toContain("runner@example.invalid");
  });
});
