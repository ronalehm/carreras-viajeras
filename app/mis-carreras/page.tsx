import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRunnerPortal, RunnerPortal } from "@/modules/bookings";
import { SiteFooter } from "@/modules/landing";

// `robots: noindex, nofollow` is inherited from the root layout.
export const metadata: Metadata = { title: "Mis carreras" };

export default async function RunnerPortalPage({ searchParams }: PageProps<"/mis-carreras">) {
  const state = await getRunnerPortal((await searchParams).reserva);
  if (state.status === "unauthenticated") redirect("/cuenta");
  return (
    <>
      <RunnerPortal state={state} />
      <SiteFooter />
    </>
  );
}
