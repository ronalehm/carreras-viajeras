# Stripe Connect sandbox example Implementation Plan

> **For agentic workers:** Execute this plan task by task with the approved spec. Steps use checkbox syntax for tracking.

**Goal:** Add a local-only Stripe Accounts v2 example that creates a recipient connected account only after explicit confirmation and with a test API key.

**Architecture:** One Node script loads `.env.local`, validates the test key, required country and explicit create flag, then makes one Accounts v2 create call. Vitest mocks the Stripe SDK; no routes, database tables, checkout changes, or payments are involved.

**Tech Stack:** Node.js 24, Stripe SDK 23.0.1, Vitest.

**Spec:** `docs/specs/stripe-connect-sandbox-example.md`

## Global Constraints

- Accept only a Stripe test key.
- Require `--create-test-account` and `--country=<ISO-3166-1-alpha-2>`.
- Use Accounts v2 recipient configuration with `stripe_transfers` requested, Express dashboard, and platform fee and negative-balance responsibilities.
- Do not create charges, transfers, refunds, payouts, onboarding links, or database records.
- Never print credentials or full Stripe responses.
- Do not modify the approved Checkout implementation.

## Review Focus

- Missing create confirmation: exit without constructing or calling Stripe.
- Live or malformed key: reject before an API request.
- Missing or malformed country: reject before an API request.
- Stripe API error containing sensitive text: print only a safe error code.
- Unexpected response mode or missing transfer capability state: fail without printing the full response.

---

### Task 1: Local Connect account creation script

**Files:**
- Create: `scripts/stripe-connect-sandbox-example.mjs`
- Test: `scripts/stripe-connect-sandbox-example.test.mjs`

**Interface:**
- Export `createSandboxRecipient({ apiKey, country, confirmed, stripeFactory })`; return only `{ id, livemode, transferStatus }`.
- CLI loads `.env.local`, parses `--create-test-account` and `--country=<code>`, calls the function once, and prints the returned summary.

- [x] Write tests for no-confirmation, live-key rejection, country validation, correct Accounts v2 request, and sanitized API failure.
- [x] Run the test and verify it fails because the script module is missing.
- [x] Implement the script with a single Accounts v2 create call and per-invocation idempotency key.
- [x] Run the focused test and verify it passes.
- [x] Run TypeScript, focused ESLint, and `git diff --check`.
