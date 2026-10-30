// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createSandboxRecipient, safeStripeErrorCode } from "./stripe-connect-sandbox-example.mjs";

const apiKey = "sk_test_example";
const createdAccount = {
  id: "acct_test_example",
  livemode: false,
  configuration: {
    recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } },
  },
};

function stripeFactory(create) {
  return vi.fn(() => ({ v2: { core: { accounts: { create } } } }));
}

describe("createSandboxRecipient", () => {
  it("does not construct Stripe without explicit creation confirmation", async () => {
    const create = vi.fn();
    const makeStripe = stripeFactory(create);

    await expect(createSandboxRecipient({
      apiKey, country: "US", confirmed: false, stripeFactory: makeStripe,
    })).rejects.toMatchObject({ code: "confirmation_required" });

    expect(makeStripe).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects live keys before constructing Stripe", async () => {
    const makeStripe = stripeFactory(vi.fn());

    await expect(createSandboxRecipient({
      apiKey: "sk_live_example", country: "US", confirmed: true, stripeFactory: makeStripe,
    })).rejects.toMatchObject({ code: "test_key_required" });

    expect(makeStripe).not.toHaveBeenCalled();
  });

  it("rejects invalid country codes before calling Stripe", async () => {
    const create = vi.fn();
    const makeStripe = stripeFactory(create);

    await expect(createSandboxRecipient({
      apiKey, country: "USA", confirmed: true, stripeFactory: makeStripe,
    })).rejects.toMatchObject({ code: "invalid_country" });

    expect(create).not.toHaveBeenCalled();
  });

  it("creates one v2 recipient account and returns only its safe summary", async () => {
    const create = vi.fn().mockResolvedValue(createdAccount);
    const makeStripe = stripeFactory(create);

    const result = await createSandboxRecipient({
      apiKey, country: "US", confirmed: true, stripeFactory: makeStripe,
    });

    expect(makeStripe).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      identity: { country: "us" },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      dashboard: "express",
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      include: ["configuration.recipient"],
    }, { idempotencyKey: expect.any(String) });
    expect(result).toEqual({ id: "acct_test_example", livemode: false, transferStatus: "pending" });
  });

  it("rejects an unexpected live-mode account response", async () => {
    const makeStripe = stripeFactory(vi.fn().mockResolvedValue({ ...createdAccount, livemode: true }));

    await expect(createSandboxRecipient({
      apiKey, country: "US", confirmed: true, stripeFactory: makeStripe,
    })).rejects.toMatchObject({ code: "unexpected_live_response" });
  });
});

describe("safeStripeErrorCode", () => {
  it("returns only a safe enum-like code and never an error message", () => {
    expect(safeStripeErrorCode({
      code: "account_create_activation_required",
      message: "request failed with sk_test_private_value",
    })).toBe("account_create_activation_required");
    expect(safeStripeErrorCode({
      code: "sk_test_private_value",
      message: "sensitive details",
    })).toBe("unknown");
  });
});
