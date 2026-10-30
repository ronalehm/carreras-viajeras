// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn() }));
vi.mock("@/modules/integrations", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/modules/booking-checkout", () => ({
  isCheckoutSandboxEnabled: vi.fn(), createCheckoutSessionSchema: {}, createBookingCheckoutSession: vi.fn(),
}));
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { isCheckoutSandboxEnabled, createBookingCheckoutSession } from "@/modules/booking-checkout";
import { POST } from "./route";

const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const bookingId = "11111111-1111-4111-8111-111111111111";
const body = { requestId: "22222222-2222-4222-8222-222222222222", kind: "initial", quoteHash: "a".repeat(64) };
const context = { params: Promise.resolve({ bookingId }) } as RouteContext<"/api/bookings/[bookingId]/checkout">;
function request(origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/bookings/" + bookingId + "/checkout", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.mocked(isCheckoutSandboxEnabled).mockReset().mockReturnValue(true);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(readJsonBody).mockReset().mockResolvedValue(body);
  vi.mocked(createBookingCheckoutSession).mockReset();
});
describe("POST /api/bookings/[bookingId]/checkout", () => {
  it("does not access auth or Stripe when sandbox is disabled", async () => {
    vi.mocked(isCheckoutSandboxEnabled).mockReturnValue(false);
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
  it("returns a hosted checkout URL only after service success and disables caching", async () => {
    vi.mocked(createBookingCheckoutSession).mockResolvedValue({ state: "created", attemptId: "attempt-1", checkoutUrl: "https://checkout.stripe.test/session" });
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(createBookingCheckoutSession).toHaveBeenCalledWith(bookingId, user.id, body);
    await expect(response.json()).resolves.toMatchObject({ state: "created", attemptId: "attempt-1" });
  });
  it("does not turn Stripe failures into success responses", async () => {
    vi.mocked(createBookingCheckoutSession).mockRejectedValue(new Error("provider failure"));
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "checkout_failed" });
  });
});
