import "server-only";
import { connection } from "next/server";
import { ForbiddenError } from "@/lib/auth/errors";
import { getCurrentUser } from "@/lib/auth/guards";
import { loadRunnerPortal } from "../services/runnerPortal.service";
import type { RunnerPortalData } from "../types/bookings.types";
import { limaDate } from "./bookingDisplay";

export type RunnerPortalState =
  | { status: "unauthenticated" }
  | { status: "unverified"; name?: string; email: string }
  | { status: "error"; name?: string }
  | { status: "ok"; name?: string; email: string; today: string; data: RunnerPortalData };

// Decision 11: failures become an in-page state; the page redirects on unauthenticated.
export async function getRunnerPortal(bookingParam: unknown): Promise<RunnerPortalState> {
  // Per request: never prerender the session read nor freeze `today` at build time.
  await connection();

  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Clerk or database failure while resolving roles.
    if (error instanceof ForbiddenError) return { status: "error" };
    throw error;
  }
  if (!user) return { status: "unauthenticated" };

  const name = user.name ? { name: user.name } : {};
  // Requirement 3: an unverified email never links nor reads bookings.
  if (!user.emailVerified) return { status: "unverified", ...name, email: user.email };

  const today = limaDate(new Date());
  try {
    const data = await loadRunnerPortal(user.id, user.email, bookingParam, today);
    // The selected booking was unlinked between the list and the detail batch: a retry resolves it.
    if (data.bookings.length > 0 && !data.selected) return { status: "error", ...name };
    return { status: "ok", ...name, email: user.email, today, data };
  } catch {
    // Fixed text only: the original error may contain data or connection details.
    console.error("runner-portal: load failed");
    return { status: "error", ...name };
  }
}
