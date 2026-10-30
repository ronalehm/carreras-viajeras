// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/modules/booking-checkout", async () => ({
  ...await vi.importActual<object>("@/modules/booking-checkout/utils/checkoutResponse"),
  checkoutAccessFor: vi.fn(), checkoutRequiresDemoParticipant: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth/guards";
import { checkoutAccessFor, checkoutRequiresDemoParticipant } from "@/modules/booking-checkout";
import { GET } from "./route";

const user = { id: "runner-1", email: "runner@example.invalid", emailVerified: true, staffRoles: [] };
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(checkoutRequiresDemoParticipant).mockReset().mockReturnValue(false);
  vi.mocked(checkoutAccessFor).mockReset().mockResolvedValue(true);
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(user);
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { error.mockRestore(); });

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

describe("GET /api/bookings/checkout/access", () => {
  it("answers only { available } without caching and reads no session outside demo", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await body(response)).toEqual({ available: true });
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(checkoutAccessFor).toHaveBeenCalledWith(null);
  });

  it("answers false while checkout is off", async () => {
    vi.mocked(checkoutAccessFor).mockResolvedValue(false);
    expect(await body(await GET())).toEqual({ available: false });
  });

  it("checks the session's user in demo mode", async () => {
    vi.mocked(checkoutRequiresDemoParticipant).mockReturnValue(true);
    expect(await body(await GET())).toEqual({ available: true });
    expect(checkoutAccessFor).toHaveBeenCalledWith(user.id);
  });

  it("treats an anonymous visitor in demo mode as no participant", async () => {
    vi.mocked(checkoutRequiresDemoParticipant).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(checkoutAccessFor).mockResolvedValue(false);
    expect(await body(await GET())).toEqual({ available: false });
    expect(checkoutAccessFor).toHaveBeenCalledWith(null);
  });

  it("never grants a blocked account, nor one whose session lookup failed", async () => {
    vi.mocked(checkoutRequiresDemoParticipant).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ ...user, staffRoles: [], blocked: true });
    await GET();
    expect(checkoutAccessFor).toHaveBeenLastCalledWith(null);
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error("role lookup failed"));
    await GET();
    expect(checkoutAccessFor).toHaveBeenLastCalledWith(null);
  });

  it("fails closed with a fixed log line when the access check throws", async () => {
    vi.mocked(checkoutAccessFor).mockRejectedValue(new Error("select * from checkout_demo_participants"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await body(response)).toEqual({ available: false });
    expect(JSON.stringify(error.mock.calls)).not.toContain("select");
  });
});
