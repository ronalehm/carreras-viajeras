// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/env")>(), getStripeCheckoutConfig: vi.fn(),
}));
import { getStripeCheckoutConfig, type StripeCheckoutConfig } from "@/lib/env";
import { isCheckoutSimulated, isSimulatedMode, stripeModeColumn } from "./simulatedCheckout";

describe("simulated checkout mode", () => {
  it.each([["test", true, "test"], ["demo", true, "test"], ["live", false, "live"]] as const)(
    "%s mode: simulated=%s, stored stripe_mode=%s",
    (mode, simulated, column) => {
      expect(isSimulatedMode(mode)).toBe(simulated);
      expect(stripeModeColumn(mode)).toBe(column);
    },
  );
});

describe("isCheckoutSimulated", () => {
  const config = (overrides: Partial<StripeCheckoutConfig>): StripeCheckoutConfig => ({
    enabled: true, mode: "demo", secretKey: "sk_test_unit_only", webhookSecret: null,
    allowDraftContracts: false, disabledReason: null, ...overrides,
  });
  it.each([["test", true], ["demo", true], ["live", false]] as const)("%s mode: %s", (mode, simulated) => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config({ mode }));
    expect(isCheckoutSimulated()).toBe(simulated);
  });
  it("is false while the Checkout is off", () => {
    vi.mocked(getStripeCheckoutConfig).mockReturnValue(config({ enabled: false, mode: null, disabledReason: "not_enabled" }));
    expect(isCheckoutSimulated()).toBe(false);
  });
});
