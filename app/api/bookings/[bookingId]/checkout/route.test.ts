// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn() }));
vi.mock("@/modules/integrations", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/modules/booking-checkout", async () => ({
  ...await vi.importActual<object>("@/modules/booking-checkout/utils/checkoutResponse"),
  bookingRouteParamsSchema: (await vi.importActual<typeof import("@/modules/booking-checkout/schemas/checkout.schema")>(
    "@/modules/booking-checkout/schemas/checkout.schema")).bookingRouteParamsSchema,
  isCheckoutEnabled: vi.fn(), isHiddenByDemoCheckout: vi.fn(), checkoutAccessFor: vi.fn(), createCheckoutSessionSchema: {}, createBookingCheckoutSession: vi.fn(),
}));
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { checkoutAccessFor, isCheckoutEnabled, isHiddenByDemoCheckout, createBookingCheckoutSession } from "@/modules/booking-checkout";
import { POST } from "./route";

const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const bookingId = "11111111-1111-4111-8111-111111111111";
const body = { requestId: "22222222-2222-4222-8222-222222222222", kind: "initial", quoteHash: "a".repeat(64) };
const contextFor = (id: string) => ({ params: Promise.resolve({ bookingId: id }) }) as RouteContext<"/api/bookings/[bookingId]/checkout">;
const context = contextFor(bookingId);
function request(origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/bookings/" + bookingId + "/checkout", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(isCheckoutEnabled).mockReset().mockReturnValue(true);
  vi.mocked(checkoutAccessFor).mockReset().mockResolvedValue(true);
  vi.mocked(isHiddenByDemoCheckout).mockReset().mockResolvedValue(false);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(readJsonBody).mockReset().mockResolvedValue(body);
  vi.mocked(createBookingCheckoutSession).mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); error.mockRestore(); });

describe("POST /api/bookings/[bookingId]/checkout", () => {
  describe("demo pre-gate", () => {
    const noOrigin = () => new Request("http://localhost:3001/api/bookings/" + bookingId + "/checkout", { method: "POST", body: "{}" });
    it("answers an anonymous or non-participant caller with the 404 of a closed checkout, before Origin and session", async () => {
      vi.mocked(isHiddenByDemoCheckout).mockResolvedValue(true);
      for (const response of [await POST(noOrigin(), context), await POST(request("https://attacker.example"), context)]) {
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        await expect(response.json()).resolves.toEqual({ code: "not_found", requestId: expect.any(String) });
      }
      expect(requireVerifiedEmail).not.toHaveBeenCalled();
      expect(checkoutAccessFor).not.toHaveBeenCalled();
      expect(createBookingCheckoutSession).not.toHaveBeenCalled();
    });
    it("keeps an active participant (and test/live) behind the Origin check", async () => {
      const response = await POST(noOrigin(), context);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ code: "invalid_origin", requestId: expect.any(String) });
      expect(isHiddenByDemoCheckout).toHaveBeenCalledTimes(1);
      expect(requireVerifiedEmail).not.toHaveBeenCalled();
      expect(createBookingCheckoutSession).not.toHaveBeenCalled();
    });
    it("is not consulted while checkout is off", async () => {
      vi.mocked(isCheckoutEnabled).mockReturnValue(false);
      expect((await POST(noOrigin(), context)).status).toBe(404);
      expect(isHiddenByDemoCheckout).not.toHaveBeenCalled();
    });
  });
  it("answers a demo non-participant (revoked included) with the same 404 as when off, after authentication", async () => {
    vi.mocked(checkoutAccessFor).mockResolvedValue(false);
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ code: "not_found", requestId: expect.any(String) });
    expect(requireVerifiedEmail).toHaveBeenCalledTimes(1);
    expect(checkoutAccessFor).toHaveBeenCalledWith(user.id);
    expect(createBookingCheckoutSession).not.toHaveBeenCalled();
  });
  it("does not access auth or Stripe when checkout is disabled", async () => {
    vi.mocked(isCheckoutEnabled).mockReturnValue(false);
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(createBookingCheckoutSession).not.toHaveBeenCalled();
  });
  it("rejects cross-origin before auth and database access", async () => {
    const response = await POST(request("https://attacker.example"), context);
    expect(response.status).toBe(403);
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
    expect(createBookingCheckoutSession).not.toHaveBeenCalled();
  });
  it.each(["bad", "11111111-1111-4111-8111-11111111111x", "../prepare"])("answers 404 for a malformed booking id %j before auth", async (id) => {
    const response = await POST(request(), contextFor(id));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found", requestId: expect.any(String) });
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
    expect(createBookingCheckoutSession).not.toHaveBeenCalled();
  });
  it("returns a hosted checkout URL only after service success and disables caching", async () => {
    vi.mocked(createBookingCheckoutSession).mockResolvedValue({ state: "created", attemptId: "attempt-1", checkoutUrl: "https://checkout.stripe.test/session" });
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(createBookingCheckoutSession).toHaveBeenCalledWith(bookingId, user.id, body);
    await expect(response.json()).resolves.toMatchObject({ state: "created", attemptId: "attempt-1" });
  });
  it.each([
    ["booking_not_found", 404, "not_found"], ["attempt_expired", 409, "attempt_expired"],
    ["reservation_expired", 409, "reservation_expired"], ["payment_processing", 409, "payment_processing"],
    ["stripe_unavailable", 502, "stripe_unavailable"], ["checkout_unavailable", 503, "stripe_unavailable"],
  ] as const)("maps %s to %i { code: %s, requestId }", async (result, status, code) => {
    vi.mocked(createBookingCheckoutSession).mockResolvedValue(result);
    const response = await POST(request(), context);
    expect(response.status).toBe(status);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toEqual({ code, requestId: expect.any(String) });
    expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).toContain(json.requestId as string);
  });
  it("does not turn unexpected failures into success responses or leak their cause", async () => {
    vi.mocked(createBookingCheckoutSession).mockRejectedValue(new Error("provider failure sk_test_secret"));
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ code: "internal", requestId: expect.any(String) });
    expect(JSON.stringify(error.mock.calls)).not.toContain("sk_test_secret");
  });
});
