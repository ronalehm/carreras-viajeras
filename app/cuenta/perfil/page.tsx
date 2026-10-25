import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRunnerProfilePage, RunnerProfilePanel } from "@/modules/accounts";
import { SiteFooter, SiteHeader } from "@/modules/landing";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function RunnerProfilePage() {
  const state = await getRunnerProfilePage();
  if (state.status === "unauthenticated") redirect("/cuenta");

  return (
    <>
      <SiteHeader />
      <main>
        <RunnerProfilePanel state={state} />
      </main>
      <SiteFooter />
    </>
  );
}
