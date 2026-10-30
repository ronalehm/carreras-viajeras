// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/modules/booking-checkout", () => ({ isCheckoutSandboxEnabled: vi.fn(), getBookingCheckoutState: vi.fn() }));
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { isCheckoutSandboxEnabled, getBookingCheckoutState } from "@/modules/booking-checkout";
import { GET } from "./route";
const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const bookingId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ bookingId, attemptId }) } as RouteContext<"/api/bookings/[bookingId]/checkout/[attemptId]">;
beforeEach(() => {
  vi.mocked(isCheckoutSandboxEnabled).mockReset().mockReturnValue(true);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(getBookingCheckoutState).mockReset();
});
describe("GET protected checkout state", () => {
  it("returns the owner-only persisted state without caching", async () => {
    vi.mocked(getBookingCheckoutState).mockResolvedValue({ status: "paid", amountUsd: 250, amountPenCents: 93750, checkoutUrl: null, balanceQuote: null });
    const response = await GET(new Request("http://localhost:3001"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getBookingCheckoutState).toHaveBeenCalledWith(bookingId, attemptId, user.id);
    await expect(response.json()).resolves.toMatchObject({ status: "paid" });
  });
  it("hides missing and other users' attempts", async () => {
    vi.mocked(getBookingCheckoutState).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost:3001"), context);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
  it("rejects malformed resource ids before querying", async () => {
    const badContext = { params: Promise.resolve({ bookingId: "bad", attemptId }) } as RouteContext<"/api/bookings/[bookingId]/checkout/[attemptId]">;
    const response = await GET(new Request("http://localhost:3001"), badContext);
    expect(response.status).toBe(404);
    expect(getBookingCheckoutState).not.toHaveBeenCalled();
  });
});
