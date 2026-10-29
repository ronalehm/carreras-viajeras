// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/modules/rewards", () => ({ reconcileBookingRewards: vi.fn() }));
import { reconcileBookingRewards } from "@/modules/rewards";
import { reconcileBookingAfterCommit } from "./rewardReconciliation";
beforeEach(() => vi.resetAllMocks());
describe("post-commit loyalty reconciliation", () => {
  it("reconciles the changed booking", async () => {
    await reconcileBookingAfterCommit("booking-1");
    expect(reconcileBookingRewards).toHaveBeenCalledExactlyOnceWith("booking-1");
  });
  it("keeps an already committed payment successful and logs no database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(reconcileBookingRewards).mockRejectedValue(new Error("private database details"));
    await expect(reconcileBookingAfterCommit("booking-1")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledExactlyOnceWith("rewards: reconciliation pending");
    log.mockRestore();
  });
});
