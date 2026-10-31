import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRunnerHub, getRunnerProfilePage, RunnerHubSummary, RunnerProfilePanel } from "@/modules/accounts";
import { RunnerRewards } from "@/modules/rewards";
import { ScrollToHero, SiteFooter, SiteHeader } from "@/modules/landing";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function RunnerProfilePage() {
  const state = await getRunnerProfilePage();
  if (state.status === "unauthenticated") redirect("/cuenta");
  const hub = state.status === "ok" ? await getRunnerHub() : null;

  return (
    <>
      <SiteHeader />
      <main>
        {/* Opens at the top (the page title), not at the previous page's scroll position. */}
        <ScrollToHero />
        <RunnerProfilePanel state={state} careers={hub ? <RunnerHubSummary state={hub} /> : undefined}>
          {state.status === "ok" && <RunnerRewards />}
        </RunnerProfilePanel>
      </main>
      <SiteFooter />
    </>
  );
}
