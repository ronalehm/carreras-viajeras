// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn() }));
vi.mock("@/modules/integrations", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/modules/booking-checkout", () => ({ isCheckoutSandboxEnabled: vi.fn(), contractAcceptanceSchema: {}, acceptBookingContract: vi.fn() }));
import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { readJsonBody } from "@/modules/integrations";
import { isCheckoutSandboxEnabled, acceptBookingContract } from "@/modules/booking-checkout";
import { POST } from "./route";
const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
const bookingId = "11111111-1111-4111-8111-111111111111";
const body = { accepted: true, documentHash: "a".repeat(64) };
const context = { params: Promise.resolve({ bookingId }) } as RouteContext<"/api/bookings/[bookingId]/contract-acceptance">;
const request = () => new Request("http://localhost:3001/api/bookings/" + bookingId + "/contract-acceptance", {
  method: "POST", headers: { origin: "http://localhost:3001" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.mocked(isCheckoutSandboxEnabled).mockReset().mockReturnValue(true);
  vi.mocked(getEnv).mockReset().mockReturnValue({ APP_ORIGIN: "http://localhost:3001" } as ReturnType<typeof getEnv>);
  vi.mocked(requireVerifiedEmail).mockReset().mockResolvedValue(user);
  vi.mocked(readJsonBody).mockReset().mockResolvedValue(body);
  vi.mocked(acceptBookingContract).mockReset();
});
describe("POST contract acceptance", () => {
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
    await expect(response.json()).resolves.toEqual({ error: "document_changed" });
  });
});
