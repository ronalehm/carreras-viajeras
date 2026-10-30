import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import Stripe from "stripe";

const TEST_KEY = /^(?:sk|rk)_test_[A-Za-z0-9_]+$/;
const ERROR_CODE = /^[a-z][a-z0-9_]{0,79}$/;
const SECRET_PREFIX = /^(?:sk|rk|pk|whsec)_/i;
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function exampleError(code) {
  return Object.assign(new Error("Stripe Connect sandbox example failed"), { code });
}

export function safeStripeErrorCode(error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  return typeof code === "string" && ERROR_CODE.test(code) && !SECRET_PREFIX.test(code) ? code : "unknown";
}

function isCountryCode(value) {
  if (typeof value !== "string" || !/^[a-z]{2}$/i.test(value)) return false;
  const name = regionNames.of(value.toUpperCase());
  return Boolean(name && name !== value.toUpperCase() && name !== "Unknown Region");
}

export async function createSandboxRecipient({
  apiKey,
  country,
  confirmed,
  stripeFactory = (key) => new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 }),
}) {
  if (confirmed !== true) throw exampleError("confirmation_required");
  if (typeof apiKey !== "string" || !TEST_KEY.test(apiKey)) throw exampleError("test_key_required");
  if (!isCountryCode(country)) throw exampleError("invalid_country");

  const stripe = stripeFactory(apiKey);
  const account = await stripe.v2.core.accounts.create({
    identity: { country: country.toLowerCase() },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    dashboard: "express",
    defaults: {
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    include: ["configuration.recipient"],
  }, { idempotencyKey: randomUUID() });

  if (account.livemode !== false) throw exampleError("unexpected_live_response");
  const transferStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (typeof account.id !== "string" || !transferStatus) throw exampleError("unexpected_account_response");

  return { id: account.id, livemode: false, transferStatus };
}

async function main(args = process.argv.slice(2)) {
  if (!args.includes("--create-test-account")) throw exampleError("confirmation_required");
  const countryArgument = args.find((arg) => arg.startsWith("--country="));
  const country = countryArgument?.slice("--country=".length);
  if (!isCountryCode(country)) throw exampleError("invalid_country");

  try {
    process.loadEnvFile(".env.local");
  } catch {
    throw exampleError("env_file_unavailable");
  }
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (typeof apiKey !== "string" || !TEST_KEY.test(apiKey)) throw exampleError("test_key_required");

  const account = await createSandboxRecipient({ apiKey, country, confirmed: true });
  console.log(JSON.stringify({
    mode: account.livemode ? "live" : "test",
    id: account.id,
    capability: "stripe_transfers",
    status: account.transferStatus,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Stripe Connect sandbox example failed (${safeStripeErrorCode(error)})`);
    process.exitCode = 1;
  });
}
