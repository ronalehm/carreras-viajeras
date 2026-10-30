import type { Metadata } from "next";
import { Suspense } from "react";
import { submitWebLeadAction } from "@/modules/crm";
import { isCheckoutEnabled } from "@/modules/booking-checkout";
import { RacePageContent, TripPageLoading } from "@/modules/landing";

// Generic: the trip title is set in the browser. Indexing stays off (root layout robots).
export const metadata: Metadata = {
  title: "Registro",
  description: "Regístrate para correr con Carreras Viajeras.",
};

// Static (○) shell of /viajes/<slug>/registro, reached through a rewrite in next.config.ts. The
// trip, the offer, ?modo=stand and the attribution are read in the browser; the header and footer
// too, because stand mode hides them.
export default function RaceRegistrationShellPage() {
  return (
    // useSearchParams in RacePageContent: the prerendered HTML carries this fallback.
    <Suspense fallback={<main><TripPageLoading /></main>}>
      {/* The action comes from crm and is passed as a prop: landing never imports crm at runtime. */}
      <RacePageContent action={submitWebLeadAction} checkoutEnabled={isCheckoutEnabled()} />
    </Suspense>
  );
}
