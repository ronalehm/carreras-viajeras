import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/modules/landing";
import { ReferralInvitation } from "@/modules/rewards";

export const metadata: Metadata = { title: "Invitación de un runner", robots: { index: false, follow: false } };

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(code)) notFound();
  return <><SiteHeader /><main><ReferralInvitation code={code} /></main><SiteFooter /></>;
}
