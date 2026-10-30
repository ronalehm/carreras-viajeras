// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("./bookingCheckout.service", () => ({ isCheckoutSandboxEnabled: vi.fn(() => true) }));
vi.mock("./prepare.service", () => ({ getPreparedBookingCheckout: vi.fn() }));
import { getDb } from "@/lib/db";
import { getPreparedBookingCheckout } from "./prepare.service";
import { acceptBookingContract } from "./contractAcceptance.service";

const prepared = { documentHash: "a".repeat(64), documentSnapshot: "snapshot", contract: { versionKey: "terms-v1", documentHash: "b".repeat(64) } };
const bookingId = "11111111-1111-4111-8111-111111111111";
const userId = "runner-1";
beforeEach(() => {
  vi.mocked(getPreparedBookingCheckout).mockReset().mockResolvedValue(prepared as never);
});
describe("booking contract acceptance", () => {
  it("refuses a hash other than the server-rendered contract document", async () => {
    await expect(acceptBookingContract(bookingId, userId, "c".repeat(64))).resolves.toBe("document_changed");
    expect(getDb).not.toHaveBeenCalled();
  });
  it("stores the server snapshot and never accepts a second document", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ booking_id: bookingId }] });
    vi.mocked(getDb).mockReturnValue({ execute } as never);
    await expect(acceptBookingContract(bookingId, userId, prepared.documentHash)).resolves.toBe("accepted");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
