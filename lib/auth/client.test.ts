import { beforeEach, describe, expect, it, vi } from "vitest";

const raw = vi.hoisted(() => ({
  signIn: { email: vi.fn() },
  emailOtp: { sendVerificationOtp: vi.fn() },
  useSession: vi.fn(),
}));

vi.mock("@neondatabase/auth/next", () => ({ createAuthClient: () => raw }));

const { authClient } = await import("./client");

const neonError = (status: number, code: string) =>
  Object.assign(new Error("boom"), { status, code });

describe("authClient", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    [403, "email_not_confirmed", "EMAIL_NOT_VERIFIED"],
    [401, "invalid_credentials", "INVALID_EMAIL_OR_PASSWORD"],
    [409, "user_already_exists", "USER_ALREADY_EXISTS"],
    [429, "over_request_rate_limit", "over_request_rate_limit"],
    [400, "validation_failed", "validation_failed"],
  ])("turns a %i %s rejection into { data: null, error }", async (status, code, expected) => {
    raw.signIn.email.mockRejectedValue(neonError(status, code));

    await expect(authClient.signIn.email({ email: "a@b.c", password: "x" })).resolves.toMatchObject({
      data: null,
      error: { status, code: expected },
    });
  });

  it("rethrows rejections without a numeric status", async () => {
    const failure = new TypeError("Failed to fetch");
    raw.signIn.email.mockRejectedValue(failure);

    await expect(authClient.signIn.email({ email: "a@b.c", password: "x" })).rejects.toBe(failure);
  });

  it("passes successful results through unchanged", async () => {
    const ok = { data: { user: {} }, error: null };
    raw.signIn.email.mockResolvedValue(ok);

    await expect(authClient.signIn.email({ email: "a@b.c", password: "x" })).resolves.toBe(ok);
  });

  it("wraps nested methods", async () => {
    raw.emailOtp.sendVerificationOtp.mockRejectedValue(neonError(400, "validation_failed"));

    await expect(
      authClient.emailOtp.sendVerificationOtp({ email: "a@b.c", type: "email-verification" }),
    ).resolves.toMatchObject({ data: null, error: { status: 400 } });
  });

  it("returns sync hook values unchanged", () => {
    const state = { data: null, isPending: false };
    raw.useSession.mockReturnValue(state);

    expect(authClient.useSession()).toBe(state);
  });
});
