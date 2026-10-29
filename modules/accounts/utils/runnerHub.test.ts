// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/modules/bookings", () => ({ getRunnerPortal: vi.fn() }));
import { getRunnerPortal } from "@/modules/bookings";
import { getRunnerHub } from "./runnerHub";

beforeEach(() => vi.resetAllMocks());

describe("getRunnerHub", () => {
  it.each(["unauthenticated", "unverified", "error"] as const)("keeps the %s state instead of inventing an empty account", async (status) => {
    vi.mocked(getRunnerPortal).mockResolvedValue(
      status === "unverified" ? { status, email: "runner@example.com" } : { status },
    );
    await expect(getRunnerHub()).resolves.toEqual({ status });
  });

  it("returns the authorized summaries without exposing selected payments or private fields", async () => {
    vi.mocked(getRunnerPortal).mockResolvedValue({
      status: "ok", email: "runner@example.com", today: "2026-10-29",
      data: { bookings: [], selected: null },
    });
    await expect(getRunnerHub()).resolves.toEqual({ status: "ok", today: "2026-10-29", bookings: [] });
    expect(getRunnerPortal).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
