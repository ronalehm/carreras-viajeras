// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/modules/booking-checkout", async () => ({
  ...await vi.importActual<object>("@/modules/booking-checkout/utils/checkoutResponse"),
  attemptRouteParamsSchema: (await vi.importActual<typeof import("@/modules/booking-checkout/schemas/checkout.schema")>(
    "@/modules/booking-checkout/schemas/checkout.schema")).attemptRouteParamsSchema,
  isCheckoutEnabled: vi.fn(), getBookingCheckoutState: vi.fn(),
}));
import { ForbiddenError } from "@/lib/auth/errors";
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { isCheckoutEnabled, getBookingCheckoutState } from "@/modules/booking-checkout";
import { GET } from "./route";
const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const bookingId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const contextFor = (params: { bookingId: string; attemptId: string }) =>
  ({ params: Promise.resolve(params) }) as RouteContext<"/api/bookings/[bookingId]/checkout/[attemptId]">;
const context = contextFor({ bookingId, attemptId });
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(isCheckoutEnabled).mockReset().mockReturnValue(true);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(getBookingCheckoutState).mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());
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
    await expect(response.json()).resolves.toEqual({ code: "not_found", requestId: expect.any(String) });
  });
  it.each([{ bookingId: "bad", attemptId }, { bookingId, attemptId: "bad" }])("rejects malformed resource ids before querying (%o)", async (params) => {
    const response = await GET(new Request("http://localhost:3001"), contextFor(params));
    expect(response.status).toBe(404);
    expect(getBookingCheckoutState).not.toHaveBeenCalled();
  });
  it("keeps the 403 of an unverified account", async () => {
    vi.mocked(requireVerifiedEmail).mockRejectedValue(new ForbiddenError("email_unverified"));
    const response = await GET(new Request("http://localhost:3001"), context);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "forbidden", requestId: expect.any(String) });
  });
  it("is unavailable while checkout is disabled", async () => {
    vi.mocked(isCheckoutEnabled).mockReturnValue(false);
    const response = await GET(new Request("http://localhost:3001"), context);
    expect(response.status).toBe(404);
    expect(requireVerifiedEmail).not.toHaveBeenCalled();
  });
});
