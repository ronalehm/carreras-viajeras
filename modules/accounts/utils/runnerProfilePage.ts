import "server-only";
import { connection } from "next/server";
import { ForbiddenError } from "@/lib/auth/errors";
import { getCurrentUser } from "@/lib/auth/guards";
import { getRunnerProfile } from "../services/runnerProfile.service";
import type { RunnerProfile } from "../types/runnerProfile.types";

export type RunnerProfilePageState =
  | { status: "unauthenticated" }
  | { status: "unverified"; email: string }
  | { status: "error" }
  | { status: "ok"; email: string; today: string; profile: RunnerProfile | null };

// Guard and states of /cuenta/perfil (Requirement 2). Failures become the "error" state instead
// of reaching error.tsx, so the runner can retry; the original error is never logged nor returned.
export async function getRunnerProfilePage(): Promise<RunnerProfilePageState> {
  // Per request: never prerendered at build, where there is no session nor DATABASE_URL.
  await connection();

  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Neon Auth or the role lookup failed (the guard already hides the original message).
    if (error instanceof ForbiddenError) return { status: "error" };
    throw error;
  }
  if (!user) return { status: "unauthenticated" };
  // No profile query and no redirect: /cuenta would send the runner back here (loop).
  if (!user.emailVerified) return { status: "unverified", email: user.email };

  // UTC day (Decision 15): the form's date limits, same day the action validates with.
  const today = new Date().toISOString().slice(0, 10);
  try {
    const profile = await getRunnerProfile(user.id);
    return { status: "ok", email: user.email, today, profile };
  } catch {
    // Fixed text only: a Drizzle error carries the query params (sensitive) in message and cause.
    console.error("runner-profile: load failed");
    return { status: "error" };
  }
}
