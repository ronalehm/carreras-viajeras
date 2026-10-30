// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isSimulatedMode, stripeModeColumn } from "./simulatedCheckout";

describe("simulated checkout mode", () => {
  it.each([["test", true, "test"], ["demo", true, "test"], ["live", false, "live"]] as const)(
    "%s mode: simulated=%s, stored stripe_mode=%s",
    (mode, simulated, column) => {
      expect(isSimulatedMode(mode)).toBe(simulated);
      expect(stripeModeColumn(mode)).toBe(column);
    },
  );
});
