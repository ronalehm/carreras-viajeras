// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { checkoutError, checkoutFailure, safeErrorName } from "./checkoutResponse";

let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

class NeonDbError extends Error { override name = "NeonDbError"; }

describe("safeErrorName", () => {
  it.each([
    [new NeonDbError("relation bookings: duplicate key runner@example.invalid"), "NeonDbError"],
    [new TypeError("x"), "TypeError"],
    [Object.assign(new Error("x"), { name: "sk_test_secret" }), "Error"],
    [Object.assign(new Error("x"), { name: "Name with spaces" }), "Error"],
    [Object.assign(new Error("x"), { name: "A".repeat(81) }), "Error"],
    [{ name: 42 }, "Error"],
    ["plain string", "Error"],
    [null, "Error"],
    [undefined, "Error"],
  ])("sanitizes %#", (value, expected) => {
    expect(safeErrorName(value)).toBe(expected);
  });
});

describe("checkoutFailure", () => {
  it("logs a 500 with the sanitized error name only, never the message or stack", async () => {
    const failure = new NeonDbError("select * from bookings where email = 'runner@example.invalid' sk_test_secret");
    const response = checkoutFailure("session", failure);
    expect(response.status).toBe(500);
    const body = await response.json() as { code: string; requestId: string };
    expect(body).toEqual({ code: "internal", requestId: expect.any(String) });
    expect(error).toHaveBeenCalledWith("booking checkout: request failed", {
      route: "session", requestId: body.requestId, code: "internal", status: 500, errorName: "NeonDbError",
    });
    const logged = JSON.stringify(error.mock.calls);
    for (const leaked of ["select", "runner@example.invalid", "sk_test_secret", "at "]) expect(logged).not.toContain(leaked);
  });

  it("falls back to a generic name for unusual thrown values", async () => {
    checkoutFailure("prepare", { name: "token=whsec_secret" });
    expect(error.mock.calls[0][1]).toMatchObject({ errorName: "Error" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("whsec_secret");
  });

  it("keeps the 401 and 403 semantics without an error name", () => {
    expect(checkoutFailure("state", new UnauthorizedError()).status).toBe(401);
    expect(checkoutFailure("state", new ForbiddenError("missing_permission")).status).toBe(403);
    expect(error).not.toHaveBeenCalled();
    for (const [, entry] of warn.mock.calls) expect(entry).not.toHaveProperty("errorName");
  });

  it("logs rejections without an error name", () => {
    checkoutError("session", "quote_changed", 409);
    expect(warn.mock.calls[0][1]).toEqual({ route: "session", requestId: expect.any(String), code: "quote_changed", status: 409 });
  });
});
