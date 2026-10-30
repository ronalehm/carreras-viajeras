import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { checkoutDemoParticipants } from "@/lib/db-schema";
import { getStripeCheckoutConfig } from "@/lib/env";

// Read from Neon on every call: metadata, cookies and forms never grant demo access. Active while
// revoked_at is NULL.
export async function isActiveDemoParticipant(userId: string): Promise<boolean> {
  const [row] = await getDb().select({ userId: checkoutDemoParticipants.userId })
    .from(checkoutDemoParticipants)
    .where(and(eq(checkoutDemoParticipants.userId, userId), isNull(checkoutDemoParticipants.revokedAt)))
    .limit(1);
  return Boolean(row);
}

// True when the demo Checkout is on, so only an active demo participant may use it and the caller
// must resolve the session first. Off, test and live need no session to decide.
export function checkoutRequiresDemoParticipant(): boolean {
  const config = getStripeCheckoutConfig();
  return config.enabled && config.mode === "demo";
}

// Single decision for every checkout entry point (routes, page and the trip page's button): test
// and live follow the configuration as before; demo also needs an active participant, so without
// a session (null) it is closed. Fails closed.
export async function checkoutAccessFor(userId: string | null): Promise<boolean> {
  const config = getStripeCheckoutConfig();
  if (!config.enabled) return false;
  if (config.mode !== "demo") return true;
  return userId ? isActiveDemoParticipant(userId) : false;
}

// Demo pre-gate of the checkout API, evaluated before the Origin check and requireVerifiedEmail:
// whoever is not a signed-in, unblocked, verified, active demo participant (anonymous, cross-site
// or not) gets the same 404 as when the Checkout is off, so nobody outside the demo can tell that
// it is running. Test and live read no session and are never hidden here. Fails closed.
export async function isHiddenByDemoCheckout(): Promise<boolean> {
  if (!checkoutRequiresDemoParticipant()) return false;
  try {
    const user = await getCurrentUser();
    if (!user || user.blocked || !user.emailVerified) return true;
    return !await isActiveDemoParticipant(user.id);
  } catch {
    // Fixed text only: the original error may carry SQL, secrets or personal data.
    console.error("booking checkout: demo access check failed");
    return true;
  }
}
