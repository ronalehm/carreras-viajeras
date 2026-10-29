import "server-only";
import { getRunnerPortal, type RunnerBookingSummary } from "@/modules/bookings";

export type RunnerHubState =
  | { status: "unauthenticated" }
  | { status: "unverified" }
  | { status: "error" }
  | { status: "ok"; today: string; bookings: RunnerBookingSummary[] };

// The portal owns linking and authorization. The hub only receives its minimal
// race summary; payment, document and itinerary details stay in the detail view.
export async function getRunnerHub(): Promise<RunnerHubState> {
  const state = await getRunnerPortal(undefined);
  if (state.status !== "ok") return { status: state.status };
  return { status: "ok", today: state.today, bookings: state.data.bookings };
}
