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
  isCheckoutEnabled: vi.fn(), isHiddenByDemoCheckout: vi.fn(), checkoutAccessFor: vi.fn(), contractAcceptanceSchema: {}, acceptBookingContract: vi.fn(),
}));
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { checkoutAccessFor, isCheckoutEnabled, isHiddenByDemoCheckout, acceptBookingContract } from "@/modules/booking-checkout";
import { POST } from "./route";
const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const bookingId = "11111111-1111-4111-8111-111111111111";
const body = { accepted: true, documentHash: "a".repeat(64) };
const contextFor = (id: string) => ({ params: Promise.resolve({ bookingId: id }) }) as RouteContext<"/api/bookings/[bookingId]/contract-acceptance">;
const context = contextFor(bookingId);
const request = (origin = "http://localhost:3001") => new Request("http://localhost:3001/api/bookings/" + bookingId + "/contract-acceptance", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(isCheckoutEnabled).mockReset().mockReturnValue(true);
  vi.mocked(checkoutAccessFor).mockReset().mockResolvedValue(true);
  vi.mocked(isHiddenByDemoCheckout).mockReset().mockResolvedValue(false);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(readJsonBody).mockReset().mockResolvedValue(body);
  vi.mocked(acceptBookingContract).mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());
describe("POST contract acceptance", () => {
  describe("demo pre-gate", () => {
    const noOrigin = () => new Request("http://localhost:3001/api/bookings/" + bookingId + "/contract-acceptance", { method: "POST", body: "{}" });
    it("answers an anonymous or non-participant caller with the 404 of a closed checkout, before Origin and session", async () => {
      vi.mocked(isHiddenByDemoCheckout).mockResolvedValue(true);
      for (const response of [await POST(noOrigin(), context), await POST(request("https://attacker.example"), context)]) {
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        await expect(response.json()).resolves.toEqual({ code: "not_found", requestId: expect.any(String) });
      }
      expect(requireVerifiedEmail).not.toHaveBeenCalled();
      expect(checkoutAccessFor).not.toHaveBeenCalled();
      expect(acceptBookingContract).not.toHaveBeenCalled();
    });
    it("keeps an active participant (and test/live) behind the Origin check", async () => {
      const response = await POST(noOrigin(), context);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ code: "invalid_origin", requestId: expect.any(String) });
      expect(isHiddenByDemoCheckout).toHaveBeenCalledTimes(1);
      expect(requireVerifiedEmail).not.toHaveBeenCalled();
      expect(acceptBookingContract).not.toHaveBeenCalled();
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
    expect(acceptBookingContract).not.toHaveBeenCalled();
  });
  it("requires an explicit server-verified acceptance and returns no-store", async () => {
    vi.mocked(acceptBookingContract).mockResolvedValue("accepted");
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(acceptBookingContract).toHaveBeenCalledWith(bookingId, user.id, body.documentHash);
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });
  it("rejects a changed document without creating a payment", async () => {
    vi.mocked(acceptBookingContract).mockResolvedValue("document_changed");
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code: "document_changed", requestId: expect.any(String) });
  });
  it("answers 404 for another runner's or a missing reservation", async () => {
    vi.mocked(acceptBookingContract).mockResolvedValue("reservation_unavailable");
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
  });
  it("answers 404 for a malformed booking id before auth", async () => {
    const response = await POST(request(), contextFor("not-a-uuid"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
    expect(acceptBookingContract).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before auth", async () => {
    const response = await POST(request("https://attacker.example"), context);
    expect(response.status).toBe(403);
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
  });
});
